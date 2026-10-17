// Run with: node --test tests/
// Loads the same files the browser loads and walks every demo scenario,
// then boots server/http.js and repeats the important parts over real HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = path.join(__dirname, '..');
globalThis.nacl = require(path.join(R, 'js/vendor/nacl-fast.min.js'));
for (const f of ['js/shared/format', 'js/server/crypto', 'js/shared/qrtoken', 'js/server/seed', 'js/server/engine', 'js/server/oracle', 'js/server/server']) require(path.join(R, f + '.js'));
const Dag = globalThis.Dag;

const PW = Dag.DEMO.password;
const PHONE = { sr: '01000000101', owner: Dag.DEMO.ownerPhone, ac: '01000000102', bank: '01000000103', buyer: '01000000002' };
const BN_DIGIT = /[০-৯]/;

// A fresh backend and workspace per test, with one token per account.
function world() {
  const B = Dag.createBackend(Dag.stores.memory());
  const tokens = {};
  const as = (who) => (method, url, body) => B.handle(method, url, body, { token: tokens[who], workspace: 'ws-test' });
  for (const [who, phone] of Object.entries(PHONE)) {
    const r = B.handle('POST', '/api/auth/login', { phone, password: PW }, { workspace: 'ws-test' });
    assert.equal(r.status, 200, `login ${who}: ${JSON.stringify(r.body)}`);
    tokens[who] = r.body.token;
  }
  const w = { B, tokens, sr: as('sr'), owner: as('owner'), ac: as('ac'), bank: as('bank'), buyer: as('buyer'), anon: (m, u, b) => B.handle(m, u, b, { workspace: 'ws-test' }) };
  w.preset = (id) => {
    const p = w.sr('GET', '/api/counter/presets').body.presets.find((x) => x.id === id);
    return { dag: p.dag, sellerNid: p.sellerNid, sellerName: p.sellerName, buyerName: p.buyerName, buyerNid: p.buyerNid, share: p.share };
  };
  w.run = (id, extra) => w.sr('POST', '/api/counter/clearance', Object.assign(w.preset(id), extra || {})).body;
  return w;
}
const check = (req, code) => req.checks.find((c) => c.code === code);

test('every account logs in; a wrong password is refused and locks after 5 tries', () => {
  const B = Dag.createBackend(Dag.stores.memory());
  const ctx = { workspace: 'w' };
  for (let i = 1; i <= 4; i++) {
    const r = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: 'nope' }, ctx);
    assert.equal(r.status, 401);
    assert.match(r.body.errorBn, BN_DIGIT);
  }
  assert.equal(B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: 'nope' }, ctx).status, 401);
  const locked = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: PW }, ctx);
  assert.equal(locked.status, 429, 'even the right password waits out the lock');
  assert.ok(locked.body.retryAfter > 0);
  world(); // all five demo accounts work
});

test('Bangla digits typed in the phone field still log in', () => {
  const B = Dag.createBackend(Dag.stores.memory());
  const r = B.handle('POST', '/api/auth/login', { phone: '০১০০০০০০১০১', password: PW }, { workspace: 'w' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'subregistrar');
});

test('roles are enforced on the server', () => {
  const w = world();
  assert.equal(w.owner('POST', '/api/counter/clearance', w.preset(1)).status, 403);
  assert.equal(w.sr('GET', '/api/owner/alerts').status, 403);
  assert.equal(w.buyer('GET', '/api/acland/cases').status, 403);
  assert.equal(w.ac('POST', '/api/bank/check', { dag: '425', borrowerNid: '9990002001' }).status, 403);
  assert.equal(w.anon('GET', '/api/mouza').status, 401);
  const r = w.owner('GET', '/api/audit');
  assert.equal(r.status, 403);
  assert.ok(r.body.error && r.body.errorBn);
});

test('sessions expire after 12 hours', () => {
  const store = Dag.stores.memory();
  const B = Dag.createBackend(store);
  const login = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: PW }, { workspace: 'x' });
  assert.ok(Date.parse(login.body.expiresAt) - Date.now() > 11.9 * 3600 * 1000);
  const me = () => B.handle('GET', '/api/me', undefined, { token: login.body.token, workspace: 'x' }).status;
  assert.equal(me(), 200);
  store.map.get('x').sessions[login.body.token].exp = Date.now() - 1;
  assert.equal(me(), 401);
});

test('input is validated, in both languages', () => {
  const w = world();
  const bad = (patch) => w.sr('POST', '/api/counter/clearance', Object.assign(w.preset(1), patch));
  assert.equal(bad({ sellerNid: '123' }).status, 400);
  assert.equal(bad({ buyerNid: '9990001001' }).status, 400, 'buyer cannot be the seller');
  assert.equal(bad({ share: 0 }).status, 400);
  assert.equal(bad({ dag: '' }).status, 400);
  assert.equal(bad({ buyerName: '' }).status, 400);
  const r = bad({ sellerNid: '1' });
  assert.match(r.body.errorBn, /এনআইডি/);
  // Bangla digits in the form are accepted
  const ok = w.sr('POST', '/api/counter/clearance', Object.assign(w.preset(1), { dag: '৪১২', share: '১০' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.request.verdict, 'pass');
});

test('scenario 2 says it needs scenario 1 until scenario 1 is cleared', () => {
  const w = world();
  const ready = () => w.sr('GET', '/api/counter/presets').body.presets.find((x) => x.id === 2).ready;
  assert.equal(ready(), false);
  assert.equal(w.run(1).request.verdict, 'pass');
  assert.equal(ready(), true);
});

test('scenario 1: honest sale passes, signs a QR token, executes, opens namjari', () => {
  const w = world();
  const r = w.run(1);
  const req = r.request;
  assert.equal(req.verdict, 'pass');
  assert.equal(req.counts.pass, 9);
  assert.ok(req.clearance.signature);
  assert.equal(r.alertsSent.length, 1);
  assert.equal(r.alertsSent[0].toPersonId, 'P1');
  assert.match(r.alertsSent[0].textBn, /দাগ নং ৪১২/);
  assert.match(r.alertsSent[0].textBn, /সেলিনা আক্তারের কাছে/);
  assert.ok(check(req, 'C2').summaryBn.includes('১২'));
  const ex = w.sr('POST', `/api/counter/requests/${req.id}/execute`);
  assert.equal(ex.status, 200);
  assert.equal(ex.body.case.status, 'opened');
  assert.match(ex.body.case.timeline[0].textBn, /স্বয়ংক্রিয়ভাবে/);
});

test('scenario 2: the same land sold again is blocked by the area ledger', () => {
  const w = world();
  w.sr('POST', `/api/counter/requests/${w.run(1).request.id}/execute`);
  const req = w.run(2).request;
  assert.equal(req.verdict, 'block');
  const c2 = check(req, 'C2');
  assert.deepEqual([c2.math.area, c2.math.pendingOut, c2.math.available, c2.math.requested, c2.math.short], [12, 10, 2, 10, 8]);
  assert.ok(req.appeal.id.startsWith('APL-'));
});

test('scenario 2 without executing step 1: the pending deed lock blocks instead', () => {
  const w = world();
  w.run(1);
  const req = w.run(2).request;
  assert.equal(check(req, 'C3').verdict, 'block');
  assert.equal(check(req, 'C2').verdict, 'pass');
});

test('scenario 3: acquired land is blocked on C5 only', () => {
  const w = world();
  const req = w.run(3).request;
  assert.equal(check(req, 'C5').verdict, 'block');
  assert.equal(req.checks.filter((c) => c.verdict === 'block').length, 1);
  assert.match(check(req, 'C5').summaryBn, /অধিগৃহীত/);
});

test('scenario 4: owner lock holds; the owner says not me on his own login; it turns to block', () => {
  const w = world();
  const r = w.run(4);
  assert.equal(r.request.verdict, 'hold');
  assert.equal(r.alertsSent[0].level, 'action');
  assert.equal(r.alertsSent[0].toPersonId, 'P1');
  const a = w.owner('GET', '/api/owner/alerts').body.alerts.find((x) => x.actionRequired);
  const ans = w.owner('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'not_me' });
  assert.equal(ans.status, 200);
  assert.equal(ans.body.request.verdict, 'block');
  const after = w.sr('GET', `/api/counter/requests/${r.request.id}`).body;
  assert.equal(check(after, 'C8').verdict, 'block');
  assert.equal(w.owner('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' }).status, 409);
});

test('scenario 4, owner says yes: a clearance is issued', () => {
  const w = world();
  const r = w.run(4);
  const a = w.owner('GET', '/api/owner/alerts').body.alerts.find((x) => x.actionRequired);
  w.owner('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' });
  const after = w.sr('GET', `/api/counter/requests/${r.request.id}`).body;
  assert.equal(after.verdict, 'pass');
  assert.ok(after.clearance);
});

test('scenario 4, no answer for 48 hours: the hold becomes a warning', () => {
  const w = world();
  const r = w.run(4);
  const ex = w.sr('POST', `/api/counter/requests/${r.request.id}/expire-notice`);
  assert.equal(ex.status, 200);
  assert.equal(ex.body.status, 'warn');
  assert.equal(check(ex.body, 'C8').verdict, 'warn');
  assert.match(check(ex.body, 'C8').summaryBn, /আঙুলের ছাপ/);
});

test('scenario 5: hidden mortgage is blocked and the bank discloses one bit', () => {
  const w = world();
  const req = w.run(5).request;
  assert.equal(check(req, 'C9').verdict, 'block');
  const log = w.bank('GET', '/api/oracle/log').body.log;
  assert.equal(log[0].answer, true);
  assert.ok(log[0].withheld.includes('amount'));
  const leaked = JSON.stringify(req);
  assert.ok(!leaked.includes('42000000') && !leaked.includes('LN-77-0031'));
});

test('scenario 6: warn needs a note, then signs a clearance with both warnings', () => {
  const w = world();
  const req = w.run(6).request;
  assert.equal(req.verdict, 'warn');
  assert.equal(req.counts.warn, 2);
  assert.equal(w.sr('POST', `/api/counter/requests/${req.id}/proceed`, { note: 'short' }).status, 400);
  const ok = w.sr('POST', `/api/counter/requests/${req.id}/proceed`, { note: 'Buyer told about LD tax arrears.' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.clearance.payload.warnings.length, 2);
  assert.ok(ok.body.clearance.payload.warnings[0].bn);
});

test('a name on the deed that does not match the NID is a warning', () => {
  const w = world();
  const req = w.run(1, { sellerName: 'Kamal Hossain' }).request;
  assert.equal(check(req, 'C1').verdict, 'warn');
  assert.equal(req.verdict, 'warn');
  const bn = w.run(3, { sellerName: 'নুরুল ইসলাম' }).request; // the Bangla spelling matches
  assert.notEqual(check(bn, 'C1').verdict, 'warn');
});

test('re-check at execution: a mortgage registered after the clearance voids it', () => {
  const w = world();
  const req = w.run(1).request;
  assert.equal(req.status, 'cleared');
  const loan = { dag: '412', borrowerNid: '9990001001', amount: 500000 };
  assert.equal(w.bank('POST', '/api/bank/check', loan).body.outcome, 'ok');
  assert.equal(w.bank('POST', '/api/bank/charges', loan).body.charge.status, 'live');
  const ex = w.sr('POST', `/api/counter/requests/${req.id}/execute`);
  assert.equal(ex.status, 409);
  assert.match(ex.body.error, /changed after the clearance/);
  assert.equal(ex.body.request.status, 'blocked');
  assert.equal(ex.body.request.changedAfterClearance, true);
  assert.equal(check(ex.body.request, 'C9').verdict, 'block');
});

test('free play: injunction, unmutated seller, over-allocated dag, unknown dag', () => {
  const w = world();
  const deed = (dag, nid, name, share) => w.sr('POST', '/api/counter/clearance', { dag, sellerNid: nid, sellerName: name, buyerName: 'Test Buyer', buyerNid: '9990009999', share }).body.request;
  assert.equal(check(deed('440', '9990001011', 'Ayesha Siddiqua', 5), 'C6').verdict, 'block');
  assert.equal(check(deed('447', '9990001012', 'Hasan Ali', 5), 'C4').verdict, 'block');
  const c2 = check(deed('449', '9990001013', 'Joynal Abedin', 2), 'C2');
  assert.equal(c2.verdict, 'block');
  assert.equal(c2.math.over, true);
  assert.equal(deed('999', '9990001001', 'Karim Mia', 1).verdict, 'block');
});

test('QR token verifies offline with only the public key; an edited token fails', () => {
  const w = world();
  const clr = w.run(1).request.clearance;
  const keys = w.anon('GET', '/api/keys').body;
  const ring = [{ keyId: keys.gate.keyId, publicKeyHex: keys.gate.publicKeyHex }];
  const ok = Dag.qrtoken.verify(clr.qrToken, ring);
  assert.equal(ok.ok, true);
  assert.equal(ok.token.dag, '412');
  assert.equal(ok.token.seller4, '1001');
  assert.ok(!clr.qrToken.includes('9990001001'), 'the full NID is not in the QR');
  const forged = clr.qrToken.replace('~412~', '~413~');
  assert.equal(Dag.qrtoken.verify(forged, ring).ok, false);
  assert.equal(w.anon('POST', '/api/verify/token', { token: forged }).body.valid, false);
  assert.equal(w.anon('POST', '/api/verify/token', { token: clr.qrToken }).body.valid, true);
});

test('verify: real clearance valid, edited copy invalid; audit chain detects edits', () => {
  const w = world();
  const id = w.run(1).request.clearance.id;
  assert.equal(w.anon('GET', `/api/verify/${id}`).body.valid, true);
  assert.equal(w.anon('POST', `/api/verify/${id}/tamper`).body.valid, false);
  assert.equal(w.sr('GET', '/api/audit').body.intact, true);
});

test('the audit chain breaks if a past entry is edited', () => {
  const store = Dag.stores.memory();
  const B = Dag.createBackend(store);
  const t = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: PW }, { workspace: 'a' }).body.token;
  assert.equal(B.handle('GET', '/api/audit', undefined, { token: t, workspace: 'a' }).body.intact, true);
  store.map.get('a').audit[0].data = { forged: true };
  assert.equal(B.handle('GET', '/api/audit', undefined, { token: t, workspace: 'a' }).body.intact, false);
});

test('AC Land approval corrects the khatian; the buyer gets the land and an SMS', () => {
  const w = world();
  const req = w.run(1).request;
  const kase = w.sr('POST', `/api/counter/requests/${req.id}/execute`).body.case;
  const ap = w.ac('POST', `/api/acland/cases/${kase.id}/approve`);
  assert.equal(ap.status, 200);
  assert.ok(ap.body.alertsSent.some((a) => a.toPersonId === 'P2' && /আপনার নামে/.test(a.titleBn)));
  const karim = w.owner('GET', '/api/owner/dags').body.find((d) => d.dag === '412');
  assert.equal(karim.share, 2);
  const selina = w.buyer('GET', '/api/owner/dags').body.find((d) => d.dag === '412');
  assert.equal(selina.share, 10);
  const again = w.run(2).request;
  assert.equal(check(again, 'C2').math.short, 8);
});

test('mouza map colours dags from the record only; citizen oracle question is rate limited', () => {
  const w = world();
  const m = w.buyer('GET', '/api/mouza').body;
  const st = Object.fromEntries(m.dags.map((d) => [d.no, d.status]));
  assert.deepEqual(st, { 412: 'clear', 418: 'locked', 425: 'clear', 431: 'restricted', 433: 'care', 440: 'restricted', 447: 'care', 449: 'restricted' });
  assert.ok(m.dags.every((d) => d.reasons.every((r) => r.textBn)));
  const ask = w.buyer('POST', '/api/mouza/425/charge').body;
  assert.equal(ask.charge, true);
  assert.equal(ask.signatureValid, true);
  let last;
  for (let i = 0; i < 20; i++) last = w.buyer('POST', '/api/mouza/412/charge');
  assert.equal(last.status, 429);
});

test('record health finds the over-sold dag and the other gaps', () => {
  const w = world();
  const r = w.ac('GET', '/api/acland/reconciliation').body;
  assert.equal(r.dagsChecked, 8);
  assert.equal(r.overAllocated, 1);
  assert.equal(r.issues[0].dag, '431');
  assert.ok(r.issues.some((i) => i.dag === '449' && i.type === 'over'));
  assert.ok(r.issues.some((i) => i.dag === '433' && i.type === 'survey'));
});

test('loan desk refuses a second loan on a pledged plot', () => {
  const w = world();
  const p = w.bank('GET', '/api/bank/desk').body.presets[0];
  const r = w.bank('POST', '/api/bank/check', p).body;
  assert.equal(r.outcome, 'refuse');
  assert.match(r.reasons.map((x) => x.en).join(' '), /double financing/);
  assert.match(r.reasons.map((x) => x.bn).join(' '), /দ্বৈত অর্থায়ন/);
  assert.equal(w.bank('POST', '/api/bank/charges', p).status, 409);
});

test('mortgage on a locked dag waits for the owner, then blocks a later sale', () => {
  const w = world();
  const p = w.bank('GET', '/api/bank/desk').body.presets[1];
  assert.equal(w.bank('POST', '/api/bank/check', p).body.outcome, 'ok');
  const reg = w.bank('POST', '/api/bank/charges', p).body;
  assert.equal(reg.charge.status, 'held');
  assert.equal(reg.alertsSent[0].level, 'action');
  assert.match(reg.alertsSent[0].textBn, /৳২৫,০০,০০০/);
  const a = w.owner('GET', '/api/owner/alerts').body.alerts.find((x) => x.kind === 'mortgage');
  assert.equal(w.owner('POST', `/api/owner/alerts/${a.id}/respond`, { answer: 'me' }).body.charge.status, 'live');
  assert.equal(check(w.run(4).request, 'C9').verdict, 'block');
  assert.equal(w.owner('GET', '/api/owner/dags').body.find((d) => d.dag === '418').mortgages[0].status, 'live');
});

test('owner lock can be set and cleared, only on your own dag', () => {
  const w = world();
  assert.equal(w.owner('POST', '/api/owner/dags/412/lock', { on: true }).body.locked, true);
  assert.equal(w.run(1).request.verdict, 'hold');
  assert.equal(w.owner('POST', '/api/owner/dags/431/lock', { on: true }).status, 403);
});

test('verify list: officers see every clearance, citizens only their own', () => {
  const w = world();
  w.run(1);
  w.run(3); // blocked, no clearance
  w.run(5); // blocked
  assert.equal(w.sr('GET', '/api/verify/clearances').body.length, 1);
  assert.equal(w.buyer('GET', '/api/verify/clearances').body.length, 1, 'Selina is the buyer');
});

test('demo reset reseeds this workspace and keeps the session', () => {
  const w = world();
  w.run(1);
  assert.equal(w.anon('POST', '/api/demo/reset').status, 200);
  assert.equal(w.sr('GET', '/api/verify/clearances').status, 200);
  assert.equal(w.sr('GET', '/api/verify/clearances').body.length, 0);
});

test('workspaces are isolated', () => {
  const store = Dag.stores.memory();
  const B = Dag.createBackend(store);
  const t1 = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: PW }, { workspace: 'one' }).body.token;
  const t2 = B.handle('POST', '/api/auth/login', { phone: PHONE.sr, password: PW }, { workspace: 'two' }).body.token;
  const pr = B.handle('GET', '/api/counter/presets', undefined, { token: t1, workspace: 'one' }).body.presets[0];
  B.handle('POST', '/api/counter/clearance', pr, { token: t1, workspace: 'one' });
  assert.equal(B.handle('GET', '/api/verify/clearances', undefined, { token: t1, workspace: 'one' }).body.length, 1);
  assert.equal(B.handle('GET', '/api/verify/clearances', undefined, { token: t2, workspace: 'two' }).body.length, 0);
  assert.equal(B.handle('GET', '/api/me', undefined, { token: t1, workspace: 'two' }).status, 401, 'a token only works in its own workspace');
});

test('Bangla formatting: numerals, lakh grouping, dates, case endings', () => {
  const F = Dag.fmt;
  assert.equal(F.money(15000000, 'bn'), '৳১,৫০,০০,০০০');
  assert.equal(F.money(15000000, 'en'), 'Tk 1,50,00,000');
  assert.equal(F.date('2024-03-12', 'bn'), '১২ মার্চ ২০২৪');
  assert.equal(F.f2(9.5, 'bn'), '৯.৫০');
  assert.equal(F.bnOf('করিম মিয়া'), 'করিম মিয়ার');
  assert.equal(F.bnOf('সেলিনা আক্তার'), 'সেলিনা আক্তারের');
  assert.equal(F.bnAt('কাশফুল সাব-রেজিস্ট্রি অফিস'), 'কাশফুল সাব-রেজিস্ট্রি অফিসে');
});

// ---------------- over real HTTP ----------------

async function boot(env) {
  const { spawn } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-'));
  const port = 18000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(R, 'server/http.js')], { env: Object.assign({}, process.env, { PORT: String(port), DAG_DATA_DIR: dir }, env || {}), stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { base, child, dir };
}
const J = (ws, token, extra) => Object.assign({ 'Content-Type': 'application/json', 'X-Dag-Workspace': ws }, token ? { Authorization: 'Bearer ' + token } : {}, extra || {});

test('HTTP: login, clearance, envelope trace, isolated workspaces, CORS, limits', async () => {
  const s = await boot();
  try {
    const login = async (ws) => (await (await fetch(s.base + '/api/auth/login', { method: 'POST', headers: J(ws), body: JSON.stringify({ phone: PHONE.sr, password: PW }) })).json()).token;
    const ta = await login('ws-judge-a');
    const tb = await login('ws-judge-b');
    const deed = { dag: '412', sellerNid: '9990001001', sellerName: 'Karim Mia', buyerName: 'Selina Akter', buyerNid: '9990001002', share: 10 };
    const r = await fetch(s.base + '/api/counter/clearance', { method: 'POST', headers: J('ws-judge-a', ta, { 'X-Dag-Envelope': '1' }), body: JSON.stringify(deed) });
    const env = await r.json();
    assert.equal(env.data.request.verdict, 'pass');
    assert.ok(env.trace.some((t) => t.to.startsWith('CIB')));
    // judge B, same server, own records: the same sale is still clean there
    const rb = await (await fetch(s.base + '/api/counter/clearance', { method: 'POST', headers: J('ws-judge-b', tb), body: JSON.stringify(deed) })).json();
    assert.equal(rb.request.verdict, 'pass');
    assert.equal(rb.request.checks.find((c) => c.code === 'C3').verdict, 'pass');
    // plain JSON for curl-style clients
    const plain = await (await fetch(s.base + '/api/health')).json();
    assert.equal(plain.ok, true);
    assert.equal(plain.keys, 'server');
    // CORS preflight allows the workspace header
    const pre = await fetch(s.base + '/api/counter/clearance', { method: 'OPTIONS', headers: { Origin: 'https://dag.vercel.app', 'Access-Control-Request-Headers': 'x-dag-workspace,authorization' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /X-Dag-Workspace/);
    // limits and safety
    const big = await fetch(s.base + '/api/auth/login', { method: 'POST', headers: J('ws-x'), body: 'x'.repeat(200 * 1024) });
    assert.equal(big.status, 413);
    const bad = await fetch(s.base + '/api/auth/login', { method: 'POST', headers: J('ws-x'), body: '{not json' });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(s.base + '/.git/config')).status, 404);
    assert.equal((await fetch(s.base + '/server/http.js')).status, 404);
    assert.equal((await fetch(s.base + '/.data/keys.json')).status, 404);
    // the page served here talks to this server, with a CSP
    const page = await fetch(s.base + '/');
    assert.match(await page.text(), /name="dag-api" content="http"/);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    // fonts are served locally
    assert.equal((await fetch(s.base + '/fonts/noto-sans-bengali-bengali-500-normal.woff2')).status, 200);
  } finally {
    s.child.kill();
  }
});

test('HTTP: server keys come from the environment, not the public demo seed', async () => {
  const s = await boot({ DAG_GATE_SEED: 'test-secret-gate-seed', DAG_ORACLE_SEED: 'test-secret-oracle-seed' });
  try {
    const k = await (await fetch(s.base + '/api/keys')).json();
    assert.equal(k.mode, 'server');
    assert.notEqual(k.gate.keyId, k.demoGate.keyId);
    const t = (await (await fetch(s.base + '/api/auth/login', { method: 'POST', headers: J('ws-keys'), body: JSON.stringify({ phone: PHONE.sr, password: PW }) })).json()).token;
    const r = await (await fetch(s.base + '/api/counter/clearance', { method: 'POST', headers: J('ws-keys', t), body: JSON.stringify({ dag: '412', sellerNid: '9990001001', sellerName: 'Karim Mia', buyerName: 'Selina Akter', buyerNid: '9990001002', share: 10 }) })).json();
    const qr = r.request.clearance.qrToken;
    assert.equal(Dag.qrtoken.verify(qr, [{ keyId: k.gate.keyId, publicKeyHex: k.gate.publicKeyHex }]).ok, true);
    assert.equal(Dag.qrtoken.verify(qr, [{ keyId: k.demoGate.keyId, publicKeyHex: k.demoGate.publicKeyHex }]).ok, false);
  } finally {
    s.child.kill();
  }
});

test('HTTP: per-IP rate limit answers 429', async () => {
  const s = await boot();
  try {
    let status = 0;
    for (let i = 0; i < 40 && status !== 429; i++) {
      status = (await fetch(s.base + '/api/auth/login', { method: 'POST', headers: J('ws-rate'), body: JSON.stringify({ phone: '01000000999', password: 'x' }) })).status;
    }
    assert.equal(status, 429);
  } finally {
    s.child.kill();
  }
});
