#!/usr/bin/env node
// Checks a deployed Dag in about ten seconds.
//
//   node scripts/smoke.mjs https://dag-landtech-api.onrender.com
//   node scripts/smoke.mjs https://dag-landtech-api.onrender.com https://dag-landtech.vercel.app
//
// The first URL is the API (Render). The optional second URL is the static
// front end (Vercel); the script then also checks that its js/config.js
// points at the API. A sleeping Render service can take a minute to answer
// the first request, so the health check waits up to 90 seconds.

const api = (process.argv[2] || 'http://localhost:8787').replace(/\/+$/, '');
const site = process.argv[3] ? process.argv[3].replace(/\/+$/, '') : null;
const ws = 'smoke-' + Math.random().toString(16).slice(2, 10);
let failed = 0;

function report(ok, label, extra) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', 'X-Dag-Workspace': ws };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try {
    data = await r.json();
  } catch (e) {
    /* not JSON */
  }
  return { status: r.status, data, headers: r.headers };
}

async function waitForHealth() {
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    try {
      const r = await call('GET', '/api/health');
      if (r.status === 200) return { r, s: Math.round((Date.now() - t0) / 1000) };
    } catch (e) {
      /* still waking */
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return null;
}

console.log(`Dag smoke test\n  API  ${api}\n  site ${site || '(not checked)'}\n  workspace ${ws}\n`);

const h = await waitForHealth();
report(!!h, 'API answers /api/health', h ? `after ${h.s}s, version ${h.r.data.version}` : 'no answer in 90s');
if (!h) process.exit(1);
report(h.r.data.keys === 'server', 'server signs with its own secret keys', 'keys: ' + h.r.data.keys);

const keys = await call('GET', '/api/keys');
report(keys.status === 200 && keys.data.gate && keys.data.oracle, 'public keys published', keys.data && keys.data.gate ? 'gate ' + keys.data.gate.keyId : '');

const pre = await fetch(api + '/api/health', { method: 'OPTIONS', headers: { Origin: 'https://example.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization,x-dag-workspace' } });
report(pre.status === 204 || pre.status === 200, 'CORS preflight allowed', 'Access-Control-Allow-Origin: ' + pre.headers.get('access-control-allow-origin'));

const accounts = await call('GET', '/api/demo/accounts');
const list = (accounts.data && accounts.data.accounts) || [];
report(list.length === 5, 'five demo accounts listed', list.map((a) => a.role).join(', '));
const phoneOf = (role) => (list.find((a) => a.role === role) || {}).phone;
const password = accounts.data && accounts.data.password;

const bad = await call('POST', '/api/auth/login', { phone: phoneOf('subregistrar'), password: 'wrong-password' });
report(bad.status === 401, 'wrong password refused', 'HTTP ' + bad.status);

const sr = await call('POST', '/api/auth/login', { phone: phoneOf('subregistrar'), password });
report(sr.status === 200 && sr.data.token, 'Sub-Registrar logs in', sr.data && sr.data.user ? sr.data.user.name : 'HTTP ' + sr.status);
if (sr.status !== 200) process.exit(1);
const T = sr.data.token;

const presets = await call('GET', '/api/counter/presets', undefined, T);
const p1 = presets.data.presets.find((p) => p.id === 1);
const run = await call('POST', '/api/counter/clearance', { dag: p1.dag, share: p1.share, sellerNid: p1.sellerNid, sellerName: p1.sellerName, buyerNid: p1.buyerNid, buyerName: p1.buyerName }, T);
const req = run.data && run.data.request;
report(req && req.verdict === 'pass', 'scenario 1 passes all nine checks', req ? `${req.id}, verdict ${req.verdict}` : 'HTTP ' + run.status);

const clr = req && req.clearance;
if (clr) {
  const v = await call('GET', '/api/verify/' + clr.id, undefined, T);
  report(v.data && v.data.valid === true, 'clearance signature verifies', clr.id);
  const tok = await call('POST', '/api/verify/token', { token: clr.qrToken }, T);
  report(tok.data && tok.data.valid === true, 'QR token verifies', tok.data && tok.data.key ? 'signed with the ' + tok.data.key.label + ' key' : tok.data && tok.data.reason);
} else {
  report(false, 'clearance issued');
}

const p4 = presets.data.presets.find((p) => p.id === 4);
const held = await call('POST', '/api/counter/clearance', { dag: p4.dag, share: p4.share, sellerNid: p4.sellerNid, sellerName: p4.sellerName, buyerNid: p4.buyerNid, buyerName: p4.buyerName }, T);
report(held.data && held.data.request && held.data.request.verdict === 'hold', 'scenario 4 is held for the owner', held.data && held.data.request ? held.data.request.verdict : '');

const ow = await call('POST', '/api/auth/login', { phone: phoneOf('owner'), password });
const alerts = ow.data && (await call('GET', '/api/owner/alerts', undefined, ow.data.token));
const ask = alerts && alerts.data.alerts.find((a) => a.actionRequired && !a.response);
report(!!ask, 'owner received the "is this you?" SMS', ask ? ask.id : '');

const forbidden = ow.data && (await call('GET', '/api/counter/presets', undefined, ow.data.token));
report(forbidden && forbidden.status === 403, 'owner cannot use the counter API', forbidden ? 'HTTP ' + forbidden.status : '');

const audit = await call('GET', '/api/audit', undefined, T);
report(audit.data && audit.data.intact === true, 'audit chain intact', audit.data ? audit.data.count + ' entries' : '');

if (site) {
  const page = await fetch(site + '/');
  const html = await page.text();
  report(page.ok && html.includes('js/client/app.js'), 'front end page loads', 'HTTP ' + page.status);
  const cfg = await fetch(site + '/js/config.js', { cache: 'no-store' });
  const txt = await cfg.text();
  const m = txt.match(/api:\s*'([^']*)'/);
  report(!!m && m[1].replace(/\/+$/, '') === api, 'front end js/config.js points at the API', m ? m[1] : 'no api value found');
  const font = await fetch(site + '/fonts/noto-sans-bengali-bengali-500-normal.woff2');
  report(font.ok, 'Bangla font served', 'HTTP ' + font.status);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
