/*
 * The only door between the screens and the backend.
 *
 * Where the backend lives is decided once, at load:
 *   1. Page served by server/http.js (<meta name="dag-api" content="http">):
 *      call that same server.
 *   2. ?api=https://... in the address, or api: 'https://...' in
 *      js/config.js: call that server. This is how the Vercel page reaches
 *      Render. While Render wakes up, a wake screen shows the seconds; if it
 *      does not answer, the page falls back to the in-browser backend.
 *   3. Otherwise ('auto' or 'browser'): run the backend in this browser.
 *
 * Every call is serialised to JSON both ways, sends the workspace id, and is
 * written to the API log the guide shows, with passwords and tokens masked.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const cfg = root.DAG_CONFIG || {};
  const qs = new URLSearchParams(root.location.search);
  const WAKE_LIMIT_MS = 80 * 1000;
  const CALL_TIMEOUT_MS = 25 * 1000;

  const store = {
    get(k) {
      try {
        return root.localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v == null) root.localStorage.removeItem(k);
        else root.localStorage.setItem(k, v);
      } catch (e) {
        /* storage blocked */
      }
    },
  };

  // ---------- workspace: one private copy of the records per browser ----------
  const WS_RE = /^[A-Za-z0-9_-]{6,48}$/;
  let ws = qs.get('ws');
  if (ws && WS_RE.test(ws)) store.set('dag-ws', ws);
  ws = store.get('dag-ws');
  if (!ws || !WS_RE.test(ws)) {
    ws = 'ws-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('dag-ws', ws);
  }
  // Remove one-time parameters from the address bar after reading them.
  // A link with ?as= is the second phone: on a small screen it shows the app alone.
  let solo = false;
  try {
    solo = root.sessionStorage.getItem('dag-solo') === '1';
  } catch (e) {
    /* not remembered */
  }
  if (qs.has('ws') || qs.has('as')) {
    const as = qs.get('as');
    try {
      if (as) {
        root.sessionStorage.setItem('dag-as', as);
        root.sessionStorage.setItem('dag-solo', '1');
        solo = true;
      }
    } catch (e) {
      /* not remembered */
    }
    qs.delete('ws');
    qs.delete('as');
    const q = qs.toString();
    root.history.replaceState(null, '', root.location.pathname + (q ? '?' + q : '') + root.location.hash);
  }

  if (solo) root.document.documentElement.classList.add('solo');

  // ---------- where the backend lives ----------
  const meta = root.document.querySelector('meta[name="dag-api"]');
  const wanted = String(qs.get('api') || cfg.api || 'auto').trim();
  let mode = 'browser';
  let base = '';
  if (wanted !== 'browser' && meta && meta.content === 'http') {
    mode = 'http';
    base = '';
  } else if (/^https?:\/\//i.test(wanted)) {
    mode = 'pending';
    base = wanted.replace(/\/+$/, '');
  }
  const host = () => (mode === 'http' ? (base ? new URL(base).host : root.location.host) : '');

  const statusListeners = new Set();
  const status = { mode, phase: mode === 'pending' ? 'waking' : 'ready', elapsed: 0, host: '', reason: null };
  function setStatus(patch) {
    Object.assign(status, patch, { mode, host: host() });
    statusListeners.forEach((fn) => fn(Object.assign({}, status)));
  }

  let skip = null;
  const ready = (async () => {
    if (mode !== 'pending') {
      setStatus({ phase: 'ready' });
      return;
    }
    const t0 = Date.now();
    const timer = setInterval(() => setStatus({ elapsed: Math.floor((Date.now() - t0) / 1000) }), 1000);
    const ctrl = new AbortController();
    const skipped = new Promise((resolve) => (skip = () => resolve('skipped')));
    const limit = new Promise((resolve) => setTimeout(() => resolve('timeout'), WAKE_LIMIT_MS));
    const health = fetch(base + '/api/health', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? 'up' : 'down'))
      .catch(() => 'down');
    const result = await Promise.race([health, skipped, limit]);
    clearInterval(timer);
    if (result === 'up') {
      mode = 'http';
      setStatus({ phase: 'ready' });
    } else {
      ctrl.abort();
      mode = 'browser';
      base = '';
      setStatus({ phase: 'fallback', reason: result });
    }
  })();

  // ---------- session token, per backend and workspace ----------
  const tokenKey = () => `dag-token:${mode}:${base}:${mode === 'http' ? ws : 'local'}`;
  let token = null;
  const loadToken = () => (token = store.get(tokenKey()));
  function setToken(t) {
    token = t || null;
    store.set(tokenKey(), token);
  }

  // ---------- log ----------
  const listeners = new Set();
  const log = [];
  let seq = 0;
  function redact(v) {
    if (!v || typeof v !== 'object') return v;
    const c = JSON.parse(JSON.stringify(v));
    if ('password' in c) c.password = '••••••••';
    if (typeof c.token === 'string') c.token = c.token.slice(0, 6) + '...';
    return c;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function transport(method, path, wire, quiet) {
    if (mode === 'http') {
      const headers = { 'Content-Type': 'application/json', 'X-Dag-Workspace': ws, 'X-Dag-Envelope': '1' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
      try {
        const r = await fetch(base + path, { method, headers, body: wire === undefined ? undefined : JSON.stringify(wire), signal: ctrl.signal, cache: 'no-store' });
        let body;
        try {
          body = await r.json();
        } catch (e) {
          body = { error: 'The server sent a reply that is not JSON.', errorBn: 'সার্ভারের উত্তর JSON নয়।' };
        }
        if (body && Object.prototype.hasOwnProperty.call(body, 'data') && Array.isArray(body.trace)) return { status: r.status, body: body.data, trace: body.trace };
        return { status: r.status, body, trace: [] };
      } finally {
        clearTimeout(timer);
      }
    }
    await sleep(quiet ? 10 : 90 + Math.random() * 120); // feels like a network
    return Dag.server.handle(method, path, wire, { token, workspace: 'local' });
  }

  async function call(method, path, body, opts) {
    opts = opts || {};
    await ready;
    if (token === null) loadToken();
    const t0 = performance.now();
    const wire = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    let res;
    try {
      res = await transport(method, path, wire, opts.quiet);
    } catch (e) {
      res = { status: 503, body: { error: 'The Dag server did not answer. Check the connection and try again.', errorBn: 'দাগ সার্ভার উত্তর দেয়নি। সংযোগ দেখে আবার চেষ্টা করুন।' }, trace: [] };
    }
    res = JSON.parse(JSON.stringify(res));
    if (!opts.quiet) {
      const entry = { id: ++seq, at: new Date().toISOString(), method, path, status: res.status, ms: Math.round(performance.now() - t0), request: redact(wire), response: redact(res.body), trace: res.trace || [] };
      log.unshift(entry);
      if (log.length > 100) log.pop();
      listeners.forEach((fn) => fn(entry));
    }
    if (res.status >= 400) {
      const b = res.body || {};
      const err = new Error(b.error || 'Request failed');
      err.status = res.status;
      err.bn = b.errorBn || b.error || 'অনুরোধ ব্যর্থ হয়েছে';
      err.body = b;
      throw err;
    }
    return res.body;
  }

  // Link that opens this demo on another device in the same workspace.
  function shareUrl(as) {
    const u = new URL(root.location.href);
    u.hash = '';
    u.searchParams.set('ws', ws);
    if (as) u.searchParams.set('as', as);
    u.searchParams.set('lang', Dag.i18n ? Dag.i18n.lang : 'en');
    if (mode === 'http' && base) u.searchParams.set('api', base);
    return u.toString();
  }

  Dag.api = {
    ready,
    get mode() {
      return mode;
    },
    get base() {
      return base;
    },
    workspace: () => ws,
    call,
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b || {}, o),
    setToken,
    hasToken: () => (token === null ? !!loadToken() : !!token),
    onLog: (fn) => listeners.add(fn),
    entries: () => log.slice(),
    clearLog: () => {
      log.length = 0;
      listeners.forEach((fn) => fn(null));
    },
    onStatus: (fn) => statusListeners.add(fn),
    status: () => Object.assign({}, status, { mode, host: host() }),
    skipWake: () => skip && skip(),
    shareUrl,
    errText: (e) => (Dag.i18n && Dag.i18n.lang === 'bn' ? e.bn || e.message : e.message),
  };
})(window);
