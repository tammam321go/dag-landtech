/*
 * Dag API. A small router with the same shape as an HTTP backend:
 * handle(method, path, jsonBody, token) -> { status, body, trace }.
 * The client only talks to it through serialised JSON (see js/client/api.js),
 * so moving this file behind a real HTTP server changes no screen code.
 * `trace` lists what happened inside the gate for one request. The demo's
 * API log shows it so judges can see the internal calls.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const STORE_KEY = 'dag-demo-state';
  const C = () => Dag.crypto;
  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  const f2 = (n) => r2(n).toFixed(2);
  const nowIso = () => new Date().toISOString();
  const mask = (phone) => (phone ? phone.slice(0, 3) + '•••••' + phone.slice(-3) : 'unknown');
  const step = (to, call, data) => ({ to, call, data });

  let state = null;

  // ---------- storage ----------
  function fresh() {
    state = Dag.seed.create();
    audit('system', 'demo.seeded', { records: state.dags.length + ' dags' });
  }
  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.meta && s.meta.version === Dag.seed.VERSION) {
          state = s;
          return;
        }
      }
    } catch (e) {
      /* storage blocked or corrupt: start clean */
    }
    fresh();
  }
  function save() {
    try {
      if (root.localStorage) root.localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* private window: keep running in memory */
    }
  }

  // ---------- audit chain ----------
  function audit(actor, action, data) {
    const prev = state.audit.length ? state.audit[state.audit.length - 1].hash : 'GENESIS';
    const entry = { seq: state.audit.length + 1, at: nowIso(), actor, action, data: data || {} };
    const hash = C().hashHex(prev + '|' + C().canonical(entry));
    state.audit.push(Object.assign({}, entry, { prev, hash }));
  }
  function chainIntact() {
    let prev = 'GENESIS';
    for (const e of state.audit) {
      const entry = { seq: e.seq, at: e.at, actor: e.actor, action: e.action, data: e.data };
      if (e.prev !== prev) return false;
      if (C().hashHex(prev + '|' + C().canonical(entry)) !== e.hash) return false;
      prev = e.hash;
    }
    return true;
  }

  // ---------- helpers ----------
  function nextId(kind, prefix) {
    state.meta.counters[kind] += 1;
    const n = String(state.meta.counters[kind]).padStart(4, '0');
    return kind === 'req' || kind === 'alert' ? `${prefix}-${n}` : `${prefix}-${new Date().getFullYear()}-${n}`;
  }
  function fail(http, message) {
    const e = new Error(message);
    e.http = http;
    return e;
  }
  const person = (id) => state.persons.find((p) => p.id === id);
  const dagByNo = (no) => state.dags.find((d) => d.no === no);
  const getReq = (id) => {
    const r = state.requests.find((x) => x.id === id);
    if (!r) throw fail(404, `Request ${id} not found.`);
    return r;
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, phone: u.phone, personId: u.personId, roles: u.roles });

  function clearanceView(c) {
    if (!c) return null;
    return { id: c.id, status: c.status, issuedAt: c.issuedAt, validUntil: c.validUntil, payload: c.payload, signature: c.signature, keyId: C().fingerprint(C().keys.gate().publicKey) };
  }
  function reqView(r) {
    return {
      id: r.id,
      dag: r.dag,
      sellerName: r.sellerName,
      sellerNid: r.sellerNid,
      buyerName: r.buyerName,
      buyerNid: r.buyerNid,
      share: r.share,
      status: r.status,
      verdict: r.verdict,
      counts: r.counts,
      checks: r.checks,
      createdAt: r.createdAt,
      ownerResponse: r.ownerResponse,
      officerNote: r.officerNote || null,
      appeal: r.appeal || null,
      deedId: r.deedId || null,
      caseId: r.caseId || null,
      clearance: clearanceView(state.clearances.find((c) => c.id === r.clearanceId)),
    };
  }

  function cleanInput(b) {
    const s = (v) => String(v == null ? '' : v).trim();
    const input = {
      dag: s(b.dag),
      sellerNid: s(b.sellerNid).replace(/\D/g, ''),
      sellerName: s(b.sellerName),
      buyerName: s(b.buyerName),
      buyerNid: s(b.buyerNid).replace(/\D/g, ''),
      share: r2(parseFloat(b.share)),
    };
    if (!input.dag) throw fail(400, 'Enter a dag number.');
    if (!input.sellerNid) throw fail(400, 'Enter the seller NID.');
    if (!input.buyerName || !input.buyerNid) throw fail(400, 'Enter the buyer name and NID.');
    if (!(input.share > 0)) throw fail(400, 'Enter a share in decimals, more than zero.');
    return input;
  }

  // ---------- the gate ----------
  function runChecks(req, trace) {
    const dag = dagByNo(req.dag);
    const found = state.persons.find((p) => p.nid === req.sellerNid);
    trace.push(step('NID service (mock)', `GET /nid/${req.sellerNid}`, found ? { status: 'found', name: found.name } : { status: 'not found' }));

    let oracle = null;
    if (dag) {
      const q = Dag.oracle.query(state, { dag: dag.no, askedBy: state.office.name });
      const sigValid = Dag.oracle.verify(q);
      oracle = { reply: q.reply, sigValid, keyId: q.keyId };
      trace.push(step('CIB charge oracle (mock)', 'POST /oracle/charge', { asked: { dag: dag.no }, reply: q.reply, signature: q.signature.slice(0, 20) + '...', signatureValid: sigValid }));
    }

    const lock = dag ? state.locks.find((l) => l.dag === dag.no && l.on) : null;
    const lockOwner = lock ? person(lock.personId) : null;
    const res = Dag.engine.evaluate({
      req,
      dag,
      holders: state.holders,
      persons: state.persons,
      transfers: state.transfers,
      clearances: state.clearances,
      flags: state.flags,
      injunctions: state.injunctions,
      lock: lock ? Object.assign({}, lock, { ownerName: lockOwner.name, maskedPhone: mask(lockOwner.phone) }) : null,
      oracle,
      currentFY: state.currentFY,
      now: new Date(),
    });
    trace.push(step('Rules engine', 'evaluate(C1..C9)', { verdict: res.verdict, counts: res.counts }));

    req.checks = res.checks;
    req.verdict = res.verdict;
    req.counts = res.counts;
    req.evaluatedAt = nowIso();

    if (res.verdict === 'pass') {
      if (!req.clearanceId) issueClearance(req, [], null, trace);
      req.status = 'cleared';
    } else if (res.verdict === 'warn') {
      req.status = 'warn';
    } else if (res.verdict === 'hold') {
      req.status = 'hold';
    } else {
      req.status = 'blocked';
      req.appeal = {
        id: 'APL-' + req.id.slice(4),
        to: state.acland.name,
        note: 'If a record or list entry is wrong, the seller can ask AC Land to review it. The review and its outcome are written to the audit chain.',
      };
      trace.push(step('Appeals', 'CREATE appeal reference', { id: req.appeal.id }));
    }
    audit(state.office.id, 'clearance.evaluated', { request: req.id, dag: req.dag, verdict: res.verdict });
    return res;
  }

  function issueClearance(req, warnings, note, trace) {
    const issuedAt = nowIso();
    const payload = {
      id: nextId('clr', 'CLR'),
      requestId: req.id,
      office: state.office.name,
      mouza: `${state.mouza.name}, JL ${state.mouza.jl}`,
      dag: req.dag,
      seller: { name: req.sellerName, nid: req.sellerNid },
      buyer: { name: req.buyerName, nid: req.buyerNid },
      share: r2(req.share),
      verdict: warnings.length ? 'warn' : 'pass',
      warnings,
      officerNote: note || null,
      issuedAt,
      validUntil: new Date(Date.parse(issuedAt) + 24 * 3600 * 1000).toISOString(),
    };
    const signature = C().sign(payload, C().keys.gate());
    state.clearances.push({
      id: payload.id,
      requestId: req.id,
      dag: req.dag,
      share: payload.share,
      sellerName: req.sellerName,
      status: 'issued',
      issuedAt,
      validUntil: payload.validUntil,
      payload,
      signature,
    });
    req.clearanceId = payload.id;
    trace.push(step('Clearance signer', 'Ed25519 sign(canonical JSON)', { id: payload.id, signature: signature.slice(0, 20) + '...' }));
    audit(state.office.id, 'clearance.issued', { clearance: payload.id, dag: req.dag });
  }

  function notifyOwners(req, kind, trace, extra) {
    const sent = [];
    const subs = state.subscriptions.filter((s) => s.dag === req.dag);
    for (const sub of subs) {
      const p = person(sub.personId);
      if (!p) continue;
      const share = f2(req.share);
      let a = null;
      if (kind === 'check') {
        if (req.status === 'hold') {
          a = { level: 'action', title: 'Is this you?', text: `Someone is registering ${share} dec of your dag ${req.dag} at ${state.office.name} now, with your NID. Your dag is locked, so nothing happens until you answer.`, actionRequired: true };
        } else if (req.status === 'blocked') {
          const first = req.checks.find((c) => c.verdict === 'block');
          a = { level: 'danger', title: `Deed on dag ${req.dag} stopped`, text: `A deed for ${share} dec of your dag ${req.dag} was stopped at ${state.office.name}. Reason: ${first ? first.code + ' ' + first.summary : 'blocked'}` };
        } else if (req.status === 'warn') {
          a = { level: 'info', title: `Deed on dag ${req.dag} at the counter`, text: `A deed for ${share} dec of your dag ${req.dag} is at ${state.office.name} with warnings.` };
        } else {
          a = { level: 'info', title: `Deed on dag ${req.dag} checked`, text: `A deed for ${share} dec of your dag ${req.dag} to ${req.buyerName} passed the clearance check at ${state.office.name}. If this was not you, tap to report it.` };
        }
      } else if (kind === 'executed') {
        a = { level: 'success', title: `Deed ${extra.deed.id} registered`, text: `${share} dec of your dag ${req.dag} went to ${req.buyerName}. Namjari ${extra.kase.id} opened by itself. You do not need to apply.` };
      } else if (kind === 'mutated') {
        a = { level: 'success', title: `Khatian corrected, dag ${req.dag}`, text: extra.text };
      }
      if (!a) continue;
      const alert = Object.assign({ id: nextId('alert', 'ALR'), personId: p.id, dag: req.dag, requestId: req.id, at: nowIso(), read: false, response: null, actionRequired: false }, a);
      state.alerts.push(alert);
      trace.push(step('SMS gateway (mock)', 'POST /sms', { to: mask(p.phone), text: alert.text }));
      sent.push({ alertId: alert.id, toPersonId: p.id, to: mask(p.phone), level: alert.level, title: alert.title, text: alert.text });
    }
    return sent;
  }

  // ---------- router ----------
  const routes = [];
  function route(method, pattern, handler, opts) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, handler, auth: !(opts && opts.public) });
  }

  function handle(method, url, body, token) {
    if (!state) load();
    const path = String(url).split('?')[0];
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let user = null;
      if (token && state.sessions[token]) user = state.users.find((u) => u.id === state.sessions[token]) || null;
      if (r.auth && !user) return { status: 401, body: { error: 'You are not logged in.' }, trace: [] };
      const trace = [];
      try {
        const data = r.handler({ params, body: body || {}, user, trace, token });
        return { status: 200, body: data, trace };
      } catch (e) {
        if (e && e.http) return { status: e.http, body: { error: e.message }, trace };
        return { status: 500, body: { error: String((e && e.message) || e) }, trace };
      } finally {
        save();
      }
    }
    return { status: 404, body: { error: `No route for ${method} ${path}` }, trace: [] };
  }

  // auth
  route('POST', '/api/auth/login', ({ body, trace }) => {
    const phone = String(body.phone || '').replace(/\D/g, '');
    const u = state.users.find((x) => x.phone === phone);
    const ok = u && u.passwordHash === C().hashHex(u.salt + String(body.password || ''));
    if (!ok) {
      audit('anonymous', 'auth.failed', { phone: mask(phone) });
      throw fail(401, 'Phone number or password is wrong.');
    }
    const token = C().randomHex(16);
    state.sessions[token] = u.id;
    trace.push(step('Auth', 'hash(salt + password) == stored hash', { match: true }));
    trace.push(step('Session store', 'CREATE session', { user: u.id }));
    audit(u.id, 'auth.login', {});
    return { token, user: publicUser(u) };
  }, { public: true });

  route('GET', '/api/me', ({ user }) => publicUser(user));

  route('POST', '/api/auth/logout', ({ token, user }) => {
    delete state.sessions[token];
    audit(user.id, 'auth.logout', {});
    return { ok: true };
  });

  // counter (sub-registrar)
  route('GET', '/api/counter/presets', () => ({ office: state.office, mouza: state.mouza, presets: state.presets }));

  route('POST', '/api/counter/clearance', ({ body, user, trace }) => {
    const input = cleanInput(body);
    const req = Object.assign({ id: nextId('req', 'REQ') }, input, {
      office: state.office.name,
      officer: user.name,
      createdAt: nowIso(),
      status: 'new',
      ownerResponse: null,
    });
    state.requests.push(req);
    trace.push(step('Gate', 'CREATE request', { id: req.id, dag: req.dag, share: req.share }));
    runChecks(req, trace);
    const alertsSent = notifyOwners(req, 'check', trace);
    return { request: reqView(req), alertsSent };
  });

  route('GET', '/api/counter/requests/:id', ({ params }) => reqView(getReq(params.id)));

  route('POST', '/api/counter/requests/:id/proceed', ({ params, body, user, trace }) => {
    const req = getReq(params.id);
    if (req.status !== 'warn') throw fail(409, `This request is "${req.status}". Only a WARN result takes a note.`);
    const note = String(body.note || '').trim();
    if (note.length < 8) throw fail(400, 'Write a note of at least 8 characters. It is printed on the clearance.');
    const warnings = req.checks.filter((c) => c.verdict === 'warn').map((c) => `${c.code} ${c.name}: ${c.summary}`);
    issueClearance(req, warnings, note, trace);
    req.status = 'cleared';
    req.officerNote = note;
    audit(user.id, 'clearance.proceeded_with_note', { request: req.id });
    return reqView(req);
  });

  route('POST', '/api/counter/requests/:id/execute', ({ params, user, trace }) => {
    const req = getReq(params.id);
    if (req.status !== 'cleared') throw fail(409, `This request is "${req.status}". Only a cleared request can be executed.`);
    const clr = state.clearances.find((c) => c.id === req.clearanceId);
    if (!clr || clr.status !== 'issued') throw fail(409, 'The clearance is not open.');
    if (new Date(clr.validUntil) < new Date()) throw fail(409, 'The clearance has expired. Run the checks again.');
    const seller = state.persons.find((p) => p.nid === req.sellerNid);
    let buyer = state.persons.find((p) => p.nid === req.buyerNid);
    if (!buyer) {
      buyer = { id: 'P' + (state.persons.length + 1), name: req.buyerName, nid: req.buyerNid, phone: null };
      state.persons.push(buyer);
    }
    const at = nowIso();
    const deed = { id: nextId('deed', 'DLR'), clearanceId: clr.id, requestId: req.id, dag: req.dag, fromPersonId: seller.id, toPersonId: buyer.id, share: r2(req.share), at, office: state.office.name };
    state.deeds.push(deed);
    state.transfers.push({ id: deed.id, deedId: deed.id, dag: req.dag, fromPersonId: seller.id, toPersonId: buyer.id, share: deed.share, status: 'registered', at });
    clr.status = 'executed';
    clr.executedAt = at;
    req.status = 'executed';
    req.deedId = deed.id;
    trace.push(step('Registry', 'INSERT deed', { id: deed.id, clearance: clr.id }));
    trace.push(step('Area ledger', 'APPEND transfer', { dag: req.dag, out: deed.share, status: 'registered, not yet mutated' }));

    const kase = {
      id: nextId('nj', 'NJ'),
      deedId: deed.id,
      dag: req.dag,
      fromPersonId: seller.id,
      toPersonId: buyer.id,
      fromName: seller.name,
      toName: buyer.name,
      share: deed.share,
      openedAt: at,
      openedBy: 'Registration event (automatic)',
      status: 'opened',
      office: state.acland.name,
      timeline: [
        { at, text: `Opened automatically from deed ${deed.id}. No application from the citizen.` },
        { at, text: 'Hearing notice sent to seller and buyer by SMS.' },
      ],
    };
    state.cases.push(kase);
    req.caseId = kase.id;
    trace.push(step('AC Land namjari (event)', 'POST /namjari/cases', { id: kase.id, deed: deed.id, openedBy: 'event' }));
    audit(user.id, 'deed.registered', { deed: deed.id, dag: req.dag, share: deed.share });
    audit('event', 'namjari.opened', { case: kase.id, deed: deed.id });
    const alertsSent = notifyOwners(req, 'executed', trace, { deed, kase });
    return { request: reqView(req), deed, case: kase, alertsSent };
  });

  // AC Land
  route('GET', '/api/acland/cases', () => ({ office: state.acland, cases: state.cases.slice().reverse() }));

  route('POST', '/api/acland/cases/:id/approve', ({ params, user, trace }) => {
    const k = state.cases.find((c) => c.id === params.id);
    if (!k) throw fail(404, 'Case not found.');
    if (k.status !== 'opened') throw fail(409, 'This case is already decided.');
    const idx = state.holders.findIndex((h) => h.dag === k.dag && h.personId === k.fromPersonId);
    if (idx < 0) throw fail(409, 'The seller no longer holds this dag.');
    const h = state.holders[idx];
    h.share = r2(h.share - k.share);
    const left = h.share;
    if (left <= 0) state.holders.splice(idx, 1);
    state.meta.counters.kh += 1;
    const newKh = 'BS-' + state.meta.counters.kh;
    const bh = state.holders.find((x) => x.dag === k.dag && x.personId === k.toPersonId);
    if (bh) bh.share = r2(bh.share + k.share);
    else state.holders.push({ dag: k.dag, personId: k.toPersonId, share: k.share, mutated: true, khatian: newKh });
    const t = state.transfers.find((x) => x.deedId === k.deedId);
    if (t) t.status = 'mutated';
    const at = nowIso();
    k.status = 'approved';
    k.approvedAt = at;
    k.newKhatian = newKh;
    const text = `Khatian ${newKh} opened for ${k.toName} (${f2(k.share)} dec). ${k.fromName} now holds ${f2(Math.max(0, left))} dec of dag ${k.dag}.`;
    k.timeline.push({ at, text });
    trace.push(step('Record of rights', 'UPDATE holders', { dag: k.dag, seller: f2(Math.max(0, left)), buyer: f2(k.share), khatian: newKh }));
    trace.push(step('Area ledger', 'MARK transfer mutated', { deed: k.deedId }));
    audit(user.id, 'namjari.approved', { case: k.id, khatian: newKh });
    const req = state.requests.find((r) => r.deedId === k.deedId);
    const alertsSent = req ? notifyOwners(req, 'mutated', trace, { text }) : [];
    return { case: k, alertsSent };
  });

  // owner
  route('GET', '/api/owner/dags', ({ user }) => {
    return state.holders
      .filter((h) => h.personId === user.personId)
      .map((h) => {
        const d = dagByNo(h.dag);
        const lock = state.locks.find((l) => l.dag === h.dag && l.personId === user.personId);
        const mine = state.transfers.filter((t) => t.dag === h.dag && t.fromPersonId === user.personId);
        return {
          dag: h.dag,
          mouza: `${state.mouza.name}, JL ${state.mouza.jl}`,
          landClass: d.landClass,
          area: d.area,
          share: h.share,
          khatian: h.khatian,
          locked: !!(lock && lock.on),
          lockSince: lock && lock.on ? lock.since : null,
          alertsOn: state.subscriptions.some((s) => s.dag === h.dag && s.personId === user.personId),
          pendingOut: r2(mine.filter((t) => t.status === 'registered').reduce((s, t) => s + t.share, 0)),
          transfers: mine.map((t) => ({ id: t.id, share: t.share, to: (person(t.toPersonId) || {}).name, status: t.status, at: t.at })),
        };
      });
  });

  route('POST', '/api/owner/dags/:no/lock', ({ params, body, user, trace }) => {
    const holds = state.holders.some((h) => h.dag === params.no && h.personId === user.personId);
    if (!holds) throw fail(403, 'You do not hold this dag.');
    let lock = state.locks.find((l) => l.dag === params.no && l.personId === user.personId);
    if (!lock) {
      lock = { dag: params.no, personId: user.personId, on: false, since: null };
      state.locks.push(lock);
    }
    lock.on = !!body.on;
    lock.since = lock.on ? nowIso() : null;
    if (!state.subscriptions.some((s) => s.dag === params.no && s.personId === user.personId)) {
      state.subscriptions.push({ dag: params.no, personId: user.personId });
    }
    trace.push(step('Lock & alert service', lock.on ? 'SET lock' : 'CLEAR lock', { dag: params.no }));
    audit(user.id, lock.on ? 'lock.on' : 'lock.off', { dag: params.no });
    return { dag: params.no, locked: lock.on };
  });

  route('GET', '/api/owner/alerts', ({ user }) => {
    const list = state.alerts.filter((a) => a.personId === user.personId).slice().reverse();
    return { unread: list.filter((a) => !a.read).length, alerts: list };
  });

  route('POST', '/api/owner/alerts/read-all', ({ user }) => {
    state.alerts.forEach((a) => {
      if (a.personId === user.personId && !(a.actionRequired && !a.response)) a.read = true;
    });
    return { ok: true };
  });

  route('POST', '/api/owner/alerts/:id/respond', ({ params, body, user, trace }) => {
    const a = state.alerts.find((x) => x.id === params.id && x.personId === user.personId);
    if (!a) throw fail(404, 'Alert not found.');
    if (!a.actionRequired) throw fail(400, 'This alert needs no answer.');
    if (a.response) throw fail(409, 'You already answered this alert.');
    const answer = body.answer === 'me' ? 'me' : body.answer === 'not_me' ? 'not_me' : null;
    if (!answer) throw fail(400, 'Answer must be "me" or "not_me".');
    const req = getReq(a.requestId);
    a.response = answer;
    a.read = true;
    a.respondedAt = nowIso();
    req.ownerResponse = answer;
    req.ownerRespondedAt = a.respondedAt;
    trace.push(step('Lock & alert service', 'owner answered', { request: req.id, answer }));
    audit(user.id, answer === 'me' ? 'lock.owner_confirmed' : 'lock.owner_denied', { request: req.id });
    trace.push(step('Gate', 're-run checks with the answer', { request: req.id }));
    runChecks(req, trace);
    return { alert: a, request: reqView(req) };
  });

  // verify (public: banks, buyers and AC Land can check without a login)
  route('GET', '/api/verify/clearances', () =>
    state.clearances
      .slice()
      .reverse()
      .map((c) => ({ id: c.id, dag: c.dag, share: c.share, sellerName: c.sellerName, buyerName: c.payload.buyer.name, verdict: c.payload.verdict, status: c.status, issuedAt: c.issuedAt }))
  );

  route('GET', '/api/verify/:id', ({ params, trace }) => {
    const c = state.clearances.find((x) => x.id === params.id);
    if (!c) throw fail(404, `No clearance ${params.id}.`);
    const valid = C().verify(c.payload, c.signature, C().keys.gate().publicKey);
    trace.push(step('Verifier', 'Ed25519 verify(canonical JSON, signature, public key)', { valid }));
    return { id: c.id, valid, status: c.status, algorithm: 'Ed25519', keyId: C().fingerprint(C().keys.gate().publicKey), payload: c.payload, signature: c.signature };
  }, { public: true });

  route('POST', '/api/verify/:id/tamper', ({ params, trace }) => {
    const c = state.clearances.find((x) => x.id === params.id);
    if (!c) throw fail(404, `No clearance ${params.id}.`);
    const forged = JSON.parse(JSON.stringify(c.payload));
    forged.share = r2(forged.share + 2);
    const valid = C().verify(forged, c.signature, C().keys.gate().publicKey);
    trace.push(step('Verifier', 'verify edited copy with the original signature', { valid }));
    return { id: c.id, valid, changed: { field: 'share', from: c.payload.share, to: forged.share }, payload: forged, signature: c.signature };
  }, { public: true });

  route('GET', '/api/keys', () => ({
    gate: { algorithm: 'Ed25519', keyId: C().fingerprint(C().keys.gate().publicKey) },
    oracle: { algorithm: 'Ed25519', keyId: C().fingerprint(C().keys.oracle().publicKey) },
  }), { public: true });

  // bank side view and audit
  route('GET', '/api/oracle/log', () => ({ bank: state.bank.name, log: state.oracleLog.slice().reverse() }));

  route('GET', '/api/audit', () => ({
    count: state.audit.length,
    intact: chainIntact(),
    head: state.audit.length ? state.audit[state.audit.length - 1].hash : null,
    entries: state.audit.slice(-10).reverse(),
  }));

  route('POST', '/api/demo/reset', ({ token }) => {
    const uid = token && state.sessions[token];
    fresh();
    if (uid) state.sessions[token] = uid;
    return { ok: true };
  }, { public: true });

  Dag.server = {
    handle,
    _state: () => state,
    _reset: () => fresh(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
