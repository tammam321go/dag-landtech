// Run with: node --test tests/
// Loads the same files the browser loads and walks every demo scenario.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

globalThis.nacl = require(path.join(__dirname, '../js/vendor/nacl-fast.min.js'));
for (const f of ['crypto', 'seed', 'engine', 'oracle', 'server']) require(path.join(__dirname, '../js/server', f + '.js'));
const Dag = globalThis.Dag;

let token = null;
const call = (method, url, body) => Dag.server.handle(method, url, body, token);
const preset = (id) => {
  const p = Dag.server._state().presets.find((x) => x.id === id);
  return { dag: p.dag, sellerNid: p.sellerNid, sellerName: p.sellerName, buyerName: p.buyerName, buyerNid: p.buyerNid, share: p.share };
};
const check = (req, code) => req.checks.find((c) => c.code === code);

function login() {
  Dag.server._reset();
  const r = call('POST', '/api/auth/login', { phone: Dag.DEMO.phone, password: Dag.DEMO.password });
  assert.equal(r.status, 200);
  token = r.body.token;
}

test('login rejects a wrong password and accepts the demo account', () => {
  Dag.server._reset();
  token = null;
  assert.equal(call('POST', '/api/auth/login', { phone: Dag.DEMO.phone, password: 'nope' }).status, 401);
  assert.equal(call('GET', '/api/me').status, 401);
  login();
  assert.equal(call('GET', '/api/me').body.name, 'Karim Mia');
});

test('scenario 1: honest sale passes, executes, opens namjari automatically', () => {
  login();
  const r = call('POST', '/api/counter/clearance', preset(1));
  assert.equal(r.status, 200);
  const req = r.body.request;
  assert.equal(req.verdict, 'pass');
  assert.equal(req.counts.pass, 9);
  assert.ok(req.clearance && req.clearance.signature);
  assert.equal(r.body.alertsSent.length, 1);
  const ex = call('POST', `/api/counter/requests/${req.id}/execute`);
  assert.equal(ex.status, 200);
  assert.equal(ex.body.case.status, 'opened');
  assert.match(ex.body.case.openedBy, /automatic/);
});

test('scenario 2: second sale of the same land is blocked by the area ledger', () => {
  login();
  const first = call('POST', '/api/counter/clearance', preset(1)).body.request;
  call('POST', `/api/counter/requests/${first.id}/execute`);
  const req = call('POST', '/api/counter/clearance', preset(2)).body.request;
  assert.equal(req.verdict, 'block');
  const c2 = check(req, 'C2');
  assert.equal(c2.verdict, 'block');
  assert.deepEqual([c2.math.area, c2.math.pendingOut, c2.math.available, c2.math.requested, c2.math.short], [12, 10, 2, 10, 8]);
  assert.ok(req.appeal.id.startsWith('APL-'));
});

test('scenario 2 without executing step 1: pending deed lock blocks instead', () => {
  login();
  call('POST', '/api/counter/clearance', preset(1));
  const req = call('POST', '/api/counter/clearance', preset(2)).body.request;
  assert.equal(check(req, 'C3').verdict, 'block');
  assert.equal(check(req, 'C2').verdict, 'pass');
});

test('scenario 3: acquired land is blocked on C5', () => {
  login();
  const req = call('POST', '/api/counter/clearance', preset(3)).body.request;
  assert.equal(req.verdict, 'block');
  assert.equal(check(req, 'C5').verdict, 'block');
  assert.equal(req.checks.filter((c) => c.verdict === 'block').length, 1);
});

test('scenario 4: owner lock holds, owner says not me, request turns to block', () => {
  login();
  const r = call('POST', '/api/counter/clearance', preset(4)).body;
  assert.equal(r.request.verdict, 'hold');
  assert.equal(r.alertsSent[0].level, 'action');
  const alerts = call('GET', '/api/owner/alerts').body.alerts;
  const a = alerts.find((x) => x.actionRequired);
  const ans = call('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'not_me' });
  assert.equal(ans.status, 200);
  assert.equal(ans.body.request.verdict, 'block');
  assert.equal(check(ans.body.request, 'C8').verdict, 'block');
  assert.equal(call('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' }).status, 409);
});

test('scenario 4 variant: owner says yes, clearance is issued', () => {
  login();
  call('POST', '/api/counter/clearance', preset(4));
  const a = call('GET', '/api/owner/alerts').body.alerts.find((x) => x.actionRequired);
  const ans = call('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' }).body;
  assert.equal(ans.request.verdict, 'pass');
  assert.ok(ans.request.clearance);
});

test('scenario 5: hidden mortgage is blocked and the bank discloses one bit', () => {
  login();
  const req = call('POST', '/api/counter/clearance', preset(5)).body.request;
  assert.equal(check(req, 'C9').verdict, 'block');
  const log = call('GET', '/api/oracle/log').body.log;
  assert.equal(log[0].answer, true);
  assert.ok(log[0].withheld.includes('loan amount'));
  const leaked = JSON.stringify(req);
  assert.ok(!leaked.includes('42000000') && !leaked.includes('LN-77-0031'));
});

test('scenario 6: warn needs a note, then issues a clearance with warnings', () => {
  login();
  const req = call('POST', '/api/counter/clearance', preset(6)).body.request;
  assert.equal(req.verdict, 'warn');
  assert.equal(req.counts.warn, 2);
  assert.equal(call('POST', `/api/counter/requests/${req.id}/proceed`, { note: 'short' }).status, 400);
  const ok = call('POST', `/api/counter/requests/${req.id}/proceed`, { note: 'Buyer told about LD tax arrears.' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.clearance.payload.warnings.length, 2);
});

test('free play: injunction and unmutated seller are blocked', () => {
  login();
  const inj = call('POST', '/api/counter/clearance', { dag: '440', sellerNid: '9990001011', sellerName: 'Ayesha Siddiqua', buyerName: 'X', buyerNid: '9990009999', share: 5 }).body.request;
  assert.equal(check(inj, 'C6').verdict, 'block');
  const unm = call('POST', '/api/counter/clearance', { dag: '447', sellerNid: '9990001012', sellerName: 'Hasan Ali', buyerName: 'Y', buyerNid: '9990009998', share: 5 }).body.request;
  assert.equal(check(unm, 'C4').verdict, 'block');
  const nodag = call('POST', '/api/counter/clearance', { dag: '999', sellerNid: '9990001001', sellerName: 'K', buyerName: 'Y', buyerNid: '1', share: 1 }).body.request;
  assert.equal(nodag.verdict, 'block');
});

test('verify: real clearance is valid, edited copy is invalid, audit chain intact', () => {
  login();
  const req = call('POST', '/api/counter/clearance', preset(1)).body.request;
  const id = req.clearance.id;
  token = null; // verification is public
  assert.equal(call('GET', `/api/verify/${id}`).body.valid, true);
  assert.equal(call('POST', `/api/verify/${id}/tamper`).body.valid, false);
  login();
  assert.equal(call('GET', '/api/audit').body.intact, true);
  // break the chain on purpose
  Dag.server._state().audit[1].data = { forged: true };
  assert.equal(call('GET', '/api/audit').body.intact, false);
});

test('AC Land approval corrects the khatian and the ledger', () => {
  login();
  const req = call('POST', '/api/counter/clearance', preset(1)).body.request;
  const ex = call('POST', `/api/counter/requests/${req.id}/execute`).body;
  const ap = call('POST', `/api/acland/cases/${ex.case.id}/approve`);
  assert.equal(ap.status, 200);
  const dags = call('GET', '/api/owner/dags').body;
  const d412 = dags.find((d) => d.dag === '412');
  assert.equal(d412.share, 2);
  assert.equal(d412.pendingOut, 0);
  // after mutation the same 10 dec still cannot be sold again
  const again = call('POST', '/api/counter/clearance', preset(2)).body.request;
  assert.equal(check(again, 'C2').math.short, 8);
});

test('owner can lock and unlock a dag', () => {
  login();
  assert.equal(call('POST', '/api/owner/dags/412/lock', { on: true }).body.locked, true);
  const req = call('POST', '/api/counter/clearance', preset(1)).body.request;
  assert.equal(req.verdict, 'hold');
  assert.equal(call('POST', '/api/owner/dags/431/lock', { on: true }).status, 403);
});

// ---------------- added features ----------------

test('C2 blocks a dag the record already over-allocated (449: 18 on a 15 dec plot)', () => {
  login();
  const req = call('POST', '/api/counter/clearance', { dag: '449', sellerNid: '9990001013', sellerName: 'Joynal Abedin', buyerName: 'Z', buyerNid: '9990009997', share: 2 }).body.request;
  const c2 = check(req, 'C2');
  assert.equal(c2.verdict, 'block');
  assert.equal(c2.math.over, true);
  assert.equal(c2.math.totalHeld, 18);
});

test('mouza map colours dags from the record only', () => {
  login();
  const m = call('GET', '/api/mouza').body;
  const st = Object.fromEntries(m.dags.map((d) => [d.no, d.status]));
  assert.deepEqual(st, { 412: 'clear', 418: 'locked', 425: 'clear', 431: 'restricted', 433: 'care', 440: 'restricted', 447: 'care', 449: 'restricted' });
  assert.equal(m.fillers.length, 6);
  const ask = call('POST', '/api/mouza/425/charge').body;
  assert.equal(ask.charge, true);
  assert.equal(ask.signatureValid, true);
});

test('reconciliation finds the over-sold dag and the other gaps', () => {
  login();
  const r = call('GET', '/api/acland/reconciliation').body;
  assert.equal(r.dagsChecked, 8);
  assert.equal(r.overAllocated, 1);
  assert.equal(r.issues[0].dag, '431');
  assert.ok(r.issues.some((i) => i.dag === '449' && i.type === 'over'));
  assert.ok(r.issues.some((i) => i.dag === '433' && i.type === 'survey'));
});

test('loan desk refuses a second loan on a mortgaged plot', () => {
  login();
  const p = Dag.server._state().loanPresets[0];
  const r = call('POST', '/api/bank/check', p).body;
  assert.equal(r.outcome, 'refuse');
  assert.match(r.reasons.join(' '), /double financing/);
  assert.equal(call('POST', '/api/bank/charges', p).status, 409);
});

test('mortgage on a locked dag waits for the owner, then blocks a later sale', () => {
  login();
  const p = Dag.server._state().loanPresets[1];
  assert.equal(call('POST', '/api/bank/check', p).body.outcome, 'ok');
  const reg = call('POST', '/api/bank/charges', p).body;
  assert.equal(reg.charge.status, 'held');
  assert.equal(reg.alertsSent[0].level, 'action');
  assert.match(reg.alertsSent[0].textBn, /[ঀ-৿]/);
  const a = call('GET', '/api/owner/alerts').body.alerts.find((x) => x.kind === 'mortgage');
  const ans = call('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' }).body;
  assert.equal(ans.charge.status, 'live');
  const sale = call('POST', '/api/counter/clearance', preset(4)).body.request;
  assert.equal(check(sale, 'C9').verdict, 'block');
  const mine = call('GET', '/api/owner/dags').body.find((d) => d.dag === '418');
  assert.equal(mine.mortgages[0].status, 'live');
});

test('owner SMS carries Bangla text with Bangla digits', () => {
  login();
  const r = call('POST', '/api/counter/clearance', preset(1)).body;
  assert.match(r.alertsSent[0].textBn, /৪১২/); // 412 in Bangla digits
});

test('real HTTP server: login, clearance, trace header, static page in http mode', async () => {
  const { spawn } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(__dirname, '../server/http.js')], { env: Object.assign({}, process.env, { PORT: String(port), DAG_DATA_DIR: dir }) });
  try {
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(base + '/api/health')).ok; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(up, 'server did not start');
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: Dag.DEMO.phone, password: Dag.DEMO.password }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const r = await fetch(base + '/api/counter/clearance', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(preset(2)) });
    const body = await r.json();
    assert.equal(body.request.verdict, 'pass');
    const trace = JSON.parse(decodeURIComponent(r.headers.get('x-dag-trace')));
    assert.ok(trace.some((t) => t.to.startsWith('CIB')));
    assert.equal((await fetch(base + '/api/me')).status, 401);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /name="dag-api" content="http"/);
    assert.equal((await fetch(base + '/.git/config')).status, 404);
    assert.ok(fs.existsSync(path.join(dir, 'store.json')));
  } finally {
    child.kill();
  }
});
