/*
 * The only door between the screens and the backend.
 * Two transports, one interface:
 *   browser mode: the backend (js/server) runs in this tab. The body is
 *                 serialised to JSON both ways, exactly as over a network.
 *   http mode:    the page was served by server/http.js, so calls go out
 *                 with fetch() to a real Node server.
 * The mode comes from <meta name="dag-api">. Every call is logged for the
 * guide's API log, with passwords and tokens masked.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const TOKEN_KEY = 'dag-demo-token';
  const meta = root.document && root.document.querySelector('meta[name="dag-api"]');
  const MODE = meta && meta.content === 'http' ? 'http' : 'browser';
  const listeners = new Set();
  const log = [];
  let seq = 0;
  let token = null;
  try { token = root.localStorage.getItem(TOKEN_KEY + '-' + MODE); } catch (e) { token = null; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setToken(t) {
    token = t || null;
    try {
      if (t) root.localStorage.setItem(TOKEN_KEY + '-' + MODE, t);
      else root.localStorage.removeItem(TOKEN_KEY + '-' + MODE);
    } catch (e) { /* storage blocked: token lives in memory */ }
  }

  function redact(v) {
    if (!v || typeof v !== 'object') return v;
    const c = JSON.parse(JSON.stringify(v));
    if ('password' in c) c.password = '••••••••';
    if (typeof c.token === 'string') c.token = c.token.slice(0, 6) + '...';
    return c;
  }

  async function transport(method, path, wire, quiet) {
    if (MODE === 'http') {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch(path, { method, headers, body: wire === undefined ? undefined : JSON.stringify(wire) });
      let body;
      try { body = await r.json(); } catch (e) { body = { error: 'The server sent a reply that is not JSON.' }; }
      let trace = [];
      try { trace = JSON.parse(decodeURIComponent(r.headers.get('X-Dag-Trace') || '%5B%5D')); } catch (e) { trace = []; }
      return { status: r.status, body, trace };
    }
    await sleep(quiet ? 30 : 110 + Math.random() * 150); // feels like a network
    return Dag.server.handle(method, path, wire, token);
  }

  async function call(method, path, body, opts) {
    opts = opts || {};
    const t0 = performance.now();
    const wire = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    let res;
    try {
      res = await transport(method, path, wire, opts.quiet);
    } catch (e) {
      res = { status: 503, body: { error: MODE === 'http' ? 'The Dag server is not reachable.' : String((e && e.message) || e) }, trace: [] };
    }
    res = JSON.parse(JSON.stringify(res));
    if (!opts.quiet) {
      const entry = {
        id: ++seq,
        at: new Date().toISOString(),
        method,
        path,
        status: res.status,
        ms: Math.round(performance.now() - t0),
        request: redact(wire),
        response: redact(res.body),
        trace: res.trace || [],
      };
      log.unshift(entry);
      if (log.length > 80) log.pop();
      listeners.forEach((fn) => fn(entry));
    }
    if (res.status >= 400) {
      const err = new Error((res.body && res.body.error) || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return res.body;
  }

  Dag.api = {
    mode: MODE,
    call,
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b || {}, o),
    setToken,
    hasToken: () => !!token,
    onLog: (fn) => listeners.add(fn),
    entries: () => log.slice(),
    clearLog: () => {
      log.length = 0;
      listeners.forEach((fn) => fn(null));
    },
  };
})(window);
