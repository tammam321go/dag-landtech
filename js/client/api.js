/*
 * The only door between the screens and the backend.
 * Every call is serialised to JSON on the way in and on the way out, exactly
 * as it would be over HTTP, then written to the API log the guide shows.
 * To put the backend on a real server, replace Dag.server.handle(...) below
 * with fetch(path, { method, body, headers: { Authorization } }).
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const TOKEN_KEY = 'dag-demo-token';
  const listeners = new Set();
  const log = [];
  let seq = 0;
  let token = null;
  try { token = root.localStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setToken(t) {
    token = t || null;
    try {
      if (t) root.localStorage.setItem(TOKEN_KEY, t);
      else root.localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage blocked: token lives in memory */ }
  }

  // Never show a password or a whole token in the log.
  function redact(v) {
    if (!v || typeof v !== 'object') return v;
    const c = JSON.parse(JSON.stringify(v));
    if ('password' in c) c.password = '••••••••';
    if (typeof c.token === 'string') c.token = c.token.slice(0, 6) + '...';
    return c;
  }

  async function call(method, path, body, opts) {
    opts = opts || {};
    const t0 = performance.now();
    const wire = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    await sleep(opts.quiet ? 30 : 110 + Math.random() * 150); // feels like a network
    let res;
    try {
      res = Dag.server.handle(method, path, wire, token);
    } catch (e) {
      res = { status: 500, body: { error: String((e && e.message) || e) }, trace: [] };
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
      if (log.length > 60) log.pop();
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
