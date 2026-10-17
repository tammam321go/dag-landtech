/*
 * Dag API.
 *
 * createBackend(store) returns { handle(method, path, body, ctx) }, a small
 * router with the same shape as an HTTP backend. It answers
 * { status, body, trace }; `trace` lists the steps inside the gate so the
 * demo's API log can show them.
 *
 *   ctx = { token, workspace }   who is calling, and which private copy of
 *                                the records they work on
 *   store.load(ws) / store.save(ws, state)
 *
 * The browser build uses a localStorage store with one workspace. The Node
 * server (server/http.js) uses an in-memory store with one workspace per
 * browser, so judges on a shared server never see each other's actions.
 *
 * Every route lists the roles that may call it. Every error carries an
 * English and a Bangla message.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const C = () => Dag.crypto;
  const F = () => Dag.fmt;

  const SESSION_MS = 12 * 3600 * 1000;
  const LOCK_AFTER = 5;
  const LOCK_MS = 60 * 1000;
  const CLEARANCE_MS = 24 * 3600 * 1000;
  const ORACLE_LIMIT = 20;
  const ORACLE_WINDOW_MS = 10 * 60 * 1000;
  const CAPS = { audit: 1000, alerts: 300, requests: 400, oracleLog: 200 };

  const SR = ['subregistrar'];
  const AC = ['acland'];
  const BK = ['bank'];
  const OW = ['owner'];
  const OFFICERS = ['subregistrar', 'acland', 'bank'];

  // Short reasons for SMS, one per check.
  const REASON = {
    C1: ['the seller is not on the record', 'বিক্রেতার নাম রেকর্ডে নেই'],
    C2: ['not enough land is left to sell', 'বিক্রির মতো জমি অবশিষ্ট নেই'],
    C3: ['another deed on this dag is in progress', 'এই দাগে আরেকটি দলিল চলমান'],
    C4: ['the seller has no namjari', 'বিক্রেতার নামজারি হয়নি'],
    C5: ['the land is on a government list', 'জমিটি সরকারি তালিকায় আছে'],
    C6: ['a court order covers this dag', 'জমিতে আদালতের নিষেধাজ্ঞা আছে'],
    C7: ['the survey chain is broken', 'জরিপের ধারাবাহিকতা নেই'],
    C8: ['you denied this deed', 'আপনি দলিলটি অস্বীকার করেছেন'],
    C9: ['a bank loan is registered on this dag', 'জমিতে ব্যাংকের দায় আছে'],
  };

  const nowIso = () => new Date().toISOString();
  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  // Prose and SMS use plain numbers (10, 9.5), which read more clearly in Bangla.
  const en2 = (n) => F().num(n, 'en');
  const bn2 = (n) => F().num(n, 'bn');
  const bnD = (s) => F().digits(s, 'bn');
  const mask = (phone) => (phone ? phone.slice(0, 3) + '•••••' + phone.slice(-3) : 'unknown');
  const step = (to, call, data) => ({ to, call, data });
  const fyStart = (fy) => parseInt(String(fy).slice(0, 4), 10);
  // Accept Bangla digits typed on a Bangla keyboard.
  const latin = (v) => String(v == null ? '' : v).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  const digits = (v) => latin(v).replace(/\D/g, '');
  const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80);
  const norm = (s) => String(s || '').toLowerCase().replace(/[.,'"()-]/g, ' ').replace(/\s+/g, ' ').trim();

  function fail(http, en, bn, extra) {
    const e = new Error(en);
    e.http = http;
    e.bn = bn || en;
    e.extra = extra || null;
    return e;
  }

  function fresh() {
    const st = Dag.seed.create();
    audit(st, 'system', 'demo.seeded', { dags: st.dags.length });
    return st;
  }

  // ---------- audit chain ----------
  function audit(st, actor, action, data) {
    const prev = st.audit.length ? st.audit[st.audit.length - 1].hash : st.auditAnchor ? st.auditAnchor.prev : 'GENESIS';
    const seq = st.audit.length ? st.audit[st.audit.length - 1].seq + 1 : st.auditAnchor ? st.auditAnchor.seq : 1;
    const entry = { seq, at: nowIso(), actor, action, data: data || {} };
    const hash = C().hashHex(prev + '|' + C().canonical(entry));
    st.audit.push(Object.assign({}, entry, { prev, hash }));
    if (st.audit.length > CAPS.audit) {
      const drop = st.audit.length - CAPS.audit;
      st.audit.splice(0, drop);
      st.auditAnchor = { seq: st.audit[0].seq, prev: st.audit[0].prev };
    }
  }
  function chainIntact(st) {
    let prev = st.auditAnchor ? st.auditAnchor.prev : 'GENESIS';
    for (const e of st.audit) {
      const entry = { seq: e.seq, at: e.at, actor: e.actor, action: e.action, data: e.data };
      if (e.prev !== prev) return false;
      if (C().hashHex(prev + '|' + C().canonical(entry)) !== e.hash) return false;
      prev = e.hash;
    }
    return true;
  }

  // ---------- helpers ----------
  function nextId(st, kind, prefix) {
    st.meta.counters[kind] += 1;
    const n = String(st.meta.counters[kind]).padStart(4, '0');
    return kind === 'req' || kind === 'alert' || kind === 'apl' ? `${prefix}-${n}` : `${prefix}-${new Date().getFullYear()}-${n}`;
  }
  const person = (st, id) => st.persons.find((p) => p.id === id);
  const personByNid = (st, nid) => st.persons.find((p) => p.nid === nid) || null;
  const dagByNo = (st, no) => st.dags.find((d) => d.no === no);
  function getReq(st, id) {
    const r = st.requests.find((x) => x.id === id);
    if (!r) throw fail(404, `Request ${id} not found.`, `অনুরোধ ${id} পাওয়া যায়নি।`);
    return r;
  }
  const cap = (arr, n) => {
    if (arr.length > n) arr.splice(0, arr.length - n);
  };
  const publicUser = (u) => ({ id: u.id, role: u.role, roles: u.roles, name: u.name, nameBn: u.nameBn, title: u.title, titleBn: u.titleBn, phone: u.phone, personId: u.personId || null });
  const context = (st) => ({ office: st.office, acland: st.acland, mouza: st.mouza, loanDesk: st.loanDesk, currentFY: st.currentFY });

  // Resolve a typed name against the NID record: if it matches in either
  // language, keep both spellings from the record.
  function names(st, nid, typed) {
    const p = personByNid(st, nid);
    const t = norm(typed);
    if (p && (!t || t === norm(p.name) || t === norm(p.nameBn))) return { name: p.name, nameBn: p.nameBn };
    return { name: typed, nameBn: typed };
  }

  function clearanceView(c) {
    if (!c) return null;
    return { id: c.id, status: c.status, issuedAt: c.issuedAt, validUntil: c.validUntil, payload: c.payload, signature: c.signature, keyId: C().fingerprint(C().keys.gate().publicKey), qrToken: c.qrToken };
  }
  function reqView(st, r) {
    return {
      id: r.id, dag: r.dag,
      sellerName: r.sellerName, sellerNameBn: r.sellerNameBn, sellerNid: r.sellerNid,
      buyerName: r.buyerName, buyerNameBn: r.buyerNameBn, buyerNid: r.buyerNid,
      share: r.share, status: r.status, verdict: r.verdict, counts: r.counts, checks: r.checks,
      createdAt: r.createdAt, ownerResponse: r.ownerResponse, officerNote: r.officerNote || null,
      appeal: r.appeal || null, deedId: r.deedId || null, caseId: r.caseId || null,
      changedAfterClearance: r.changedAfterClearance || false,
      clearance: clearanceView(st.clearances.find((c) => c.id === r.clearanceId)),
    };
  }

  function cleanDeed(st, b) {
    const input = {
      dag: digits(b.dag).slice(0, 6),
      sellerNid: digits(b.sellerNid),
      sellerName: text(b.sellerName),
      buyerName: text(b.buyerName),
      buyerNid: digits(b.buyerNid),
      share: r2(parseFloat(latin(b.share))),
    };
    const nidOk = (n) => [10, 13, 17].includes(n.length);
    if (!input.dag) throw fail(400, 'Enter a dag number (digits only).', 'দাগ নম্বর লিখুন (শুধু সংখ্যা)।');
    if (!nidOk(input.sellerNid)) throw fail(400, 'The seller NID must have 10, 13 or 17 digits.', 'বিক্রেতার এনআইডি ১০, ১৩ বা ১৭ অঙ্কের হতে হবে।');
    if (input.sellerName.length < 2) throw fail(400, "Enter the seller's name as written on the deed.", 'দলিলে লেখা বিক্রেতার নাম লিখুন।');
    if (input.buyerName.length < 2) throw fail(400, "Enter the buyer's name.", 'ক্রেতার নাম লিখুন।');
    if (!nidOk(input.buyerNid)) throw fail(400, 'The buyer NID must have 10, 13 or 17 digits.', 'ক্রেতার এনআইডি ১০, ১৩ বা ১৭ অঙ্কের হতে হবে।');
    if (input.buyerNid === input.sellerNid) throw fail(400, 'The buyer and the seller cannot be the same person.', 'ক্রেতা ও বিক্রেতা একই ব্যক্তি হতে পারেন না।');
    if (!(input.share > 0) || input.share > 100000) throw fail(400, 'Enter the share in decimals, more than zero.', 'অংশ শতাংশে লিখুন, শূন্যের বেশি।');
    return input;
  }

  // ---------- alerts (SMS) ----------
  function sendAlert(st, personId, a, trace) {
    const p = person(st, personId);
    if (!p) return null;
    const alert = Object.assign({ id: nextId(st, 'alert', 'ALR'), personId: p.id, at: nowIso(), read: false, response: null, actionRequired: false, kind: 'deed', requestId: null, chargeId: null }, a);
    st.alerts.push(alert);
    cap(st.alerts, CAPS.alerts);
    trace.push(step('SMS gateway (mock)', 'POST /sms', { to: mask(p.phone), bn: alert.textBn, en: alert.text }));
    return { alertId: alert.id, toPersonId: p.id, toName: p.name, toNameBn: p.nameBn, to: mask(p.phone), level: alert.level, title: alert.title, titleBn: alert.titleBn, text: alert.text, textBn: alert.textBn };
  }
  const subscribers = (st, dag) => st.subscriptions.filter((s) => s.dag === dag).map((s) => s.personId);
  function subscribe(st, dag, personId) {
    if (!st.subscriptions.some((s) => s.dag === dag && s.personId === personId)) st.subscriptions.push({ dag, personId });
  }

  function notifyOwners(st, req, kind, trace, extra) {
    const sent = [];
    const o = st.office;
    const d = req.dag;
    const dB = bnD(d);
    const sh = en2(req.share);
    const shB = bn2(req.share);
    for (const pid of subscribers(st, d)) {
      if (kind === 'mutated' && pid === extra.kase.toPersonId) continue;
      let a = null;
      if (kind === 'check') {
        if (req.status === 'hold') {
          a = {
            level: 'action', actionRequired: true, requestId: req.id,
            title: 'Is this you?',
            text: `Someone is registering ${sh} dec of your dag ${d} at ${o.name} now, with your NID. Your dag is locked, so nothing happens until you answer.`,
            titleBn: 'এটা কি আপনি?',
            textBn: `কেউ আপনার এনআইডি দিয়ে ${F().bnAt(o.nameBn)} আপনার দাগ নং ${dB}-এর ${shB} শতাংশ জমি রেজিস্ট্রি করার চেষ্টা করছে। দাগটি লক করা, তাই আপনি উত্তর না দেওয়া পর্যন্ত কিছুই হবে না।`,
          };
        } else if (req.status === 'blocked') {
          const first = req.checks.find((c) => c.verdict === 'block');
          const why = REASON[first ? first.code : 'C1'];
          a = {
            level: 'danger', requestId: req.id,
            title: `Deed on dag ${d} stopped`,
            text: `A deed for ${sh} dec of your dag ${d} was stopped at ${o.name}. Reason: ${why[0]}.`,
            titleBn: `দাগ নং ${dB}-এর দলিল আটকানো হয়েছে`,
            textBn: `${F().bnAt(o.nameBn)} আপনার দাগ নং ${dB}-এর ${shB} শতাংশের একটি দলিল আটকানো হয়েছে। কারণ: ${why[1]}।`,
          };
        } else if (req.status === 'warn') {
          a = {
            level: 'info', requestId: req.id,
            title: `Deed on dag ${d} at the counter`,
            text: `A deed for ${sh} dec of your dag ${d} is at ${o.name} with warnings.`,
            titleBn: `দাগ নং ${dB}-এর দলিল কাউন্টারে`,
            textBn: `আপনার দাগ নং ${dB}-এর ${shB} শতাংশের একটি দলিল সতর্কবার্তাসহ ${F().bnAt(o.nameBn)} আছে।`,
          };
        } else {
          a = {
            level: 'info', requestId: req.id,
            title: `Deed on dag ${d} checked`,
            text: `A deed selling ${sh} dec of your dag ${d} to ${req.buyerName} passed the clearance check at ${o.name}. If this was not you, report it now.`,
            titleBn: `দাগ নং ${dB}-এর দলিল যাচাই হয়েছে`,
            textBn: `আপনার দাগ নং ${dB}-এর ${shB} শতাংশ জমি ${F().bnOf(req.buyerNameBn)} কাছে বিক্রির দলিল ${F().bnAt(o.nameBn)} যাচাইয়ে উত্তীর্ণ হয়েছে। এটি আপনি না হলে এখনই জানান।`,
          };
        }
      } else if (kind === 'executed') {
        a = {
          level: 'success', requestId: req.id,
          title: `Deed ${extra.deed.id} registered`,
          text: `${sh} dec of your dag ${d} went to ${req.buyerName}. Namjari ${extra.kase.id} opened by itself. You do not need to apply.`,
          titleBn: `দলিল ${extra.deed.id} নিবন্ধিত হয়েছে`,
          textBn: `আপনার দাগ নং ${dB}-এর ${shB} শতাংশ ${F().bnOf(req.buyerNameBn)} নামে গেছে। নামজারি ${extra.kase.id} নিজে থেকেই খোলা হয়েছে, আলাদা আবেদন লাগবে না।`,
        };
      } else if (kind === 'mutated') {
        const k = extra.kase;
        a = {
          level: 'success', requestId: req.id,
          title: `Khatian corrected, dag ${d}`,
          text: `Khatian ${k.newKhatian} opened for ${k.toName} (${sh} dec). You now hold ${en2(extra.left)} dec of dag ${d}.`,
          titleBn: `দাগ নং ${dB}-এর খতিয়ান সংশোধিত`,
          textBn: `${F().bnOf(k.toNameBn)} নামে খতিয়ান ${k.newKhatian} খোলা হয়েছে (${shB} শতাংশ)। দাগ নং ${dB}-এ আপনার নামে এখন ${bn2(extra.left)} শতাংশ।`,
        };
      }
      const s = a && sendAlert(st, pid, a, trace);
      if (s) sent.push(s);
    }
    return sent;
  }

  function notifyMortgage(st, ch, held, lock, trace) {
    const sent = [];
    const targets = held ? [lock.personId] : subscribers(st, ch.dag);
    const dB = bnD(ch.dag);
    for (const pid of targets) {
      const a = held
        ? {
            kind: 'mortgage', chargeId: ch.id, level: 'action', actionRequired: true,
            title: 'Is this mortgage yours?',
            text: `${ch.lender} is registering a mortgage of ${F().money(ch.amount, 'en')} on your dag ${ch.dag}. Your dag is locked, so nothing is registered until you answer.`,
            titleBn: 'এই বন্ধক কি আপনার?',
            textBn: `${ch.lenderBn} আপনার দাগ নং ${dB}-এ ${F().money(ch.amount, 'bn')} বন্ধক নিবন্ধন করছে। দাগটি লক করা, তাই আপনার উত্তর ছাড়া কিছুই নিবন্ধিত হবে না।`,
          }
        : {
            kind: 'mortgage', chargeId: ch.id, level: 'info',
            title: `Mortgage registered on dag ${ch.dag}`,
            text: `${ch.lender} registered a mortgage of ${F().money(ch.amount, 'en')} on your dag ${ch.dag}. If this was not you, report it now.`,
            titleBn: `দাগ নং ${dB}-এ বন্ধক নিবন্ধিত`,
            textBn: `${ch.lenderBn} আপনার দাগ নং ${dB}-এ ${F().money(ch.amount, 'bn')} বন্ধক নিবন্ধন করেছে। এটি আপনি না হলে এখনই জানান।`,
          };
      const s = sendAlert(st, pid, a, trace);
      if (s) sent.push(s);
    }
    return sent;
  }

  // ---------- the gate ----------
  function askOracle(st, dagNo, who, whoBn, trace) {
    const q = Dag.oracle.query(st, { dag: dagNo, askedBy: who, askedByBn: whoBn });
    const sigValid = Dag.oracle.verify(q);
    trace.push(step('CIB charge oracle (mock)', 'POST /oracle/charge', { asked: { dag: dagNo, by: who }, reply: q.reply, signature: q.signature.slice(0, 20) + '...', signatureValid: sigValid }));
    return { reply: q.reply, sigValid, keyId: q.keyId };
  }

  function evaluateReq(st, req, trace) {
    const dag = dagByNo(st, req.dag);
    const found = personByNid(st, req.sellerNid);
    trace.push(step('NID service (mock)', `GET /nid/${req.sellerNid}`, found ? { status: 'found', name: found.name } : { status: 'not found' }));
    const oracle = dag ? askOracle(st, dag.no, st.office.name, st.office.nameBn, trace) : null;
    const lock = dag ? st.locks.find((l) => l.dag === dag.no && l.on) : null;
    const lockOwner = lock ? person(st, lock.personId) : null;
    const res = Dag.engine.evaluate({
      req, dag,
      holders: st.holders, persons: st.persons, transfers: st.transfers, clearances: st.clearances,
      flags: st.flags, injunctions: st.injunctions,
      lock: lock ? Object.assign({}, lock, { ownerName: lockOwner.name, ownerNameBn: lockOwner.nameBn, maskedPhone: mask(lockOwner.phone) }) : null,
      oracle, currentFY: st.currentFY, now: new Date(),
    });
    trace.push(step('Rules engine', 'evaluate(C1..C9)', { verdict: res.verdict, counts: res.counts }));
    return res;
  }

  function applyResult(st, req, res, trace) {
    req.checks = res.checks;
    req.verdict = res.verdict;
    req.counts = res.counts;
    req.evaluatedAt = nowIso();
    if (res.verdict === 'pass') {
      if (!req.clearanceId) issueClearance(st, req, [], null, trace);
      req.status = 'cleared';
    } else if (res.verdict === 'warn') {
      req.status = 'warn';
    } else if (res.verdict === 'hold') {
      req.status = 'hold';
    } else {
      req.status = 'blocked';
      if (!req.appeal) {
        req.appeal = {
          id: nextId(st, 'apl', 'APL'),
          to: st.acland.name, toBn: st.acland.nameBn,
          note: 'If a record or list entry is wrong, the seller can ask AC Land to review it. The review and its outcome are written to the audit chain.',
          noteBn: 'রেকর্ড বা তালিকায় ভুল থাকলে বিক্রেতা এসি ল্যান্ডের কাছে পুনর্বিবেচনার আবেদন করতে পারেন। আবেদন ও সিদ্ধান্ত অডিট চেইনে লেখা থাকে।',
        };
        trace.push(step('Appeals', 'CREATE appeal reference', { id: req.appeal.id }));
      }
    }
    audit(st, st.office.id, 'clearance.evaluated', { request: req.id, dag: req.dag, verdict: res.verdict });
  }

  function issueClearance(st, req, warnings, note, trace) {
    const issuedAt = nowIso();
    const kp = C().keys.gate();
    const payload = {
      id: nextId(st, 'clr', 'CLR'),
      requestId: req.id,
      office: st.office.name, officeBn: st.office.nameBn,
      mouza: `${st.mouza.name}, JL ${st.mouza.jl}`, mouzaBn: `${st.mouza.nameBn}, জেএল ${bnD(st.mouza.jl)}`,
      jl: st.mouza.jl,
      dag: req.dag,
      seller: { name: req.sellerName, nameBn: req.sellerNameBn, nid: req.sellerNid },
      buyer: { name: req.buyerName, nameBn: req.buyerNameBn, nid: req.buyerNid },
      share: r2(req.share),
      verdict: warnings.length ? 'warn' : 'pass',
      warnings,
      officerNote: note || null,
      issuedAt,
      validUntil: new Date(Date.parse(issuedAt) + CLEARANCE_MS).toISOString(),
      keyId: C().fingerprint(kp.publicKey),
    };
    const signature = C().sign(payload, kp);
    const qrToken = Dag.qrtoken.make(payload, kp);
    st.clearances.push({ id: payload.id, requestId: req.id, dag: req.dag, share: payload.share, sellerName: req.sellerName, sellerNameBn: req.sellerNameBn, sellerNid: req.sellerNid, buyerNid: req.buyerNid, status: 'issued', issuedAt, validUntil: payload.validUntil, payload, signature, qrToken });
    req.clearanceId = payload.id;
    trace.push(step('Clearance signer', 'Ed25519 sign(canonical JSON) + QR token', { id: payload.id, signature: signature.slice(0, 20) + '...', qr: qrToken.slice(0, 40) + '...' }));
    audit(st, st.office.id, 'clearance.issued', { clearance: payload.id, dag: req.dag });
  }

  // ---------- map and reconciliation ----------
  function dagSummary(st, d) {
    const hs = st.holders.filter((h) => h.dag === d.no);
    const totalHeld = r2(hs.reduce((s, h) => s + h.share, 0));
    const pending = r2(st.transfers.filter((t) => t.dag === d.no && t.status === 'registered').reduce((s, t) => s + t.share, 0));
    const locked = st.locks.some((l) => l.dag === d.no && l.on);
    const taxDue = fyStart(st.currentFY) - fyStart(d.khajnaPaidUpto);
    const gaps = ['CS', 'SA', 'RS', 'BS'].filter((k) => !d.survey[k]);
    const R = [];
    const add = (level, type, t, tBn) => R.push({ level, type, text: t, textBn: tBn });
    st.flags.filter((f) => f.dag === d.no).forEach((f) => add('restricted', 'flag', `${f.type}: ${f.ref}`, `${f.typeBn}: ${f.refBn}`));
    st.injunctions.filter((i) => i.dag === d.no).forEach((i) => add('restricted', 'injunction', `${i.order}: ${i.suit}`, `${i.orderBn}: ${i.suitBn}`));
    if (totalHeld > d.area + 1e-9) add('restricted', 'over', `Over-allocated: ${en2(totalHeld)} dec on record against a ${en2(d.area)} dec plot`, `অতিরিক্ত বরাদ্দ: ${bn2(d.area)} শতাংশের জমিতে রেকর্ডে ${bn2(totalHeld)} শতাংশ`);
    if (locked) add('locked', 'lock', 'The owner has locked this dag', 'মালিক এই দাগটি লক করে রেখেছেন');
    if (taxDue > 0) add('care', 'tax', `Land development tax ${taxDue} year${taxDue > 1 ? 's' : ''} due`, `ভূমি উন্নয়ন কর ${bnD(taxDue)} বছর বকেয়া`);
    if (gaps.length) add('care', 'survey', `Survey chain gap at ${gaps.join(', ')}`, `${gaps.map((g) => Dag.engine.SURVEY_BN[g]).join(', ')} জরিপে ফাঁক`);
    hs.filter((h) => !h.mutated).forEach((h) => {
      const p = person(st, h.personId);
      add('care', 'mutation', `${p.name} holds it without namjari`, `${F().bnOf(p.nameBn)} নামে নামজারি হয়নি`);
    });
    if (pending > 0) add('care', 'pending', `${en2(pending)} dec sold, namjari pending`, `${bn2(pending)} শতাংশ বিক্রি হয়েছে, নামজারি বাকি`);
    const status = ['restricted', 'locked', 'care'].find((lv) => R.some((r) => r.level === lv)) || 'clear';
    return {
      no: d.no, area: d.area, landClass: d.landClass, landClassBn: d.landClassBn, poly: d.poly, survey: d.survey,
      khajnaPaidUpto: d.khajnaPaidUpto, status, reasons: R, totalHeld, pending,
      holders: hs.map((h) => {
        const p = person(st, h.personId);
        return { name: p.name, nameBn: p.nameBn, nid4: p.nid.slice(-4), share: h.share, khatian: h.khatian, mutated: h.mutated };
      }),
    };
  }

  // ---------- bank side ----------
  function collateral(st, body, trace) {
    const dagNo = digits(body.dag);
    const dag = dagByNo(st, dagNo);
    if (!dag) throw fail(404, `Dag ${dagNo || '(blank)'} is not in this mouza.`, `দাগ নং ${bnD(dagNo || '-')} এই মৌজায় নেই।`);
    const nid = digits(body.borrowerNid);
    const p = personByNid(st, nid);
    trace.push(step('NID service (mock)', `GET /nid/${nid}`, p ? { status: 'found', name: p.name } : { status: 'not found' }));
    const holder = p ? st.holders.find((h) => h.dag === dag.no && h.personId === p.id) : null;
    const oracle = askOracle(st, dag.no, st.loanDesk.lender, st.loanDesk.lenderBn, trace);
    const R = [];
    const add = (en, bn) => R.push({ en, bn });
    if (!holder) {
      if (p) add(`${p.name} is not a recorded holder of dag ${dag.no}.`, `${p.nameBn} দাগ নং ${bnD(dag.no)}-এর রেকর্ডভুক্ত মালিক নন।`);
      else add(`NID ${nid || '(blank)'} returned no person.`, `এনআইডি ${nid || '-'} দিয়ে কোনো ব্যক্তি পাওয়া যায়নি।`);
    }
    if (!oracle.sigValid) add('The oracle reply failed its signature check.', 'ওরাকলের উত্তরের স্বাক্ষর মেলেনি।');
    if (oracle.reply.charge) {
      add(`Already pledged to ${oracle.reply.lender} since ${F().date(oracle.reply.since, 'en')}. A second loan on this plot would be double financing.`,
        `${F().date(oracle.reply.since, 'bn')} থেকে ${F().bnOf(oracle.reply.lenderBn)} কাছে বন্ধক আছে। এই জমিতে দ্বিতীয় ঋণ মানে দ্বৈত অর্থায়ন।`);
    }
    const waiting = st.bank.charges.find((c) => c.dag === dag.no && c.status === 'held');
    if (waiting) add(`A mortgage by ${waiting.lender} is already waiting for the owner's answer.`, `${F().bnOf(waiting.lenderBn)} একটি বন্ধক ইতিমধ্যে মালিকের উত্তরের অপেক্ষায়।`);
    st.flags.filter((f) => f.dag === dag.no).forEach((f) => add(`${f.type} land: ${f.ref}.`, `${f.typeBn} জমি: ${f.refBn}।`));
    st.injunctions.filter((i) => i.dag === dag.no).forEach((i) => add(`${i.order}: ${i.suit}.`, `${i.orderBn}: ${i.suitBn}।`));
    const s = dagSummary(st, dag);
    if (s.totalHeld > dag.area + 1e-9) add('The record gives out more land than the plot holds.', 'রেকর্ডে জমির চেয়ে বেশি মালিকানা দেওয়া আছে।');
    const lock = st.locks.find((l) => l.dag === dag.no && l.on) || null;
    return { dag, person: p, holder, oracle, reasons: R, outcome: R.length ? 'refuse' : 'ok', lock };
  }
  const chargeView = (c) => ({ id: c.id, dag: c.dag, lender: c.lender, lenderBn: c.lenderBn, since: c.since, amount: c.amount, borrower: c.borrower, borrowerBn: c.borrowerBn, status: c.status, createdAt: c.createdAt || null, decidedAt: c.decidedAt || null });

  function oracleQuota(st, userId) {
    st.oracleQuota = st.oracleQuota || {};
    const now = Date.now();
    const q = st.oracleQuota[userId] && now - st.oracleQuota[userId].start < ORACLE_WINDOW_MS ? st.oracleQuota[userId] : { start: now, count: 0 };
    q.count += 1;
    st.oracleQuota[userId] = q;
    if (q.count > ORACLE_LIMIT) throw fail(429, `You asked the bank ${ORACLE_LIMIT} times in 10 minutes. Wait a few minutes.`, `আপনি ১০ মিনিটে ${bnD(ORACLE_LIMIT)} বার ব্যাংকে জানতে চেয়েছেন। কয়েক মিনিট অপেক্ষা করুন।`);
  }

  // ---------- backend factory ----------
  function createBackend(store) {
    const routes = [];
    function route(method, pattern, handler, opts) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
      opts = opts || {};
      routes.push({ method, re, keys, handler, auth: !opts.public, roles: opts.roles || null });
    }

    function handle(method, url, body, ctx) {
      ctx = ctx || {};
      const ws = ctx.workspace || 'local';
      let st = null;
      try {
        st = store.load(ws);
      } catch (e) {
        st = null;
      }
      if (!st || !st.meta || st.meta.version !== Dag.seed.VERSION) st = fresh();
      const path = String(url).split('?')[0];
      const r = routes.find((x) => x.method === method && x.re.test(path));
      if (!r) return { status: 404, body: { error: `No route for ${method} ${path}`, errorBn: `${method} ${path} নামে কোনো পথ নেই` }, trace: [] };
      const m = path.match(r.re);
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

      let user = null;
      const sess = ctx.token ? st.sessions[ctx.token] : null;
      if (sess && sess.exp > Date.now()) user = st.users.find((u) => u.id === sess.userId) || null;
      else if (sess) delete st.sessions[ctx.token];
      const trace = [];
      try {
        if (r.auth && !user) throw fail(401, 'You are not logged in, or your session ended. Log in again.', 'আপনি লগইন করেননি, অথবা সেশন শেষ হয়েছে। আবার লগইন করুন।');
        if (r.roles && !r.roles.some((x) => user.roles.includes(x))) {
          throw fail(403, `This account (${user.title}) cannot do that.`, `এই অ্যাকাউন্ট (${user.titleBn}) দিয়ে এটি করা যায় না।`);
        }
        const data = r.handler({ st, params, body: body || {}, user, trace, token: ctx.token, ws });
        return { status: 200, body: data, trace };
      } catch (e) {
        if (e && e.http) return { status: e.http, body: Object.assign({ error: e.message, errorBn: e.bn }, e.extra || {}), trace };
        return { status: 500, body: { error: 'The server hit an unexpected error: ' + String((e && e.message) || e), errorBn: 'সার্ভারে অপ্রত্যাশিত ত্রুটি হয়েছে।' }, trace };
      } finally {
        try {
          store.save(ws, st);
        } catch (e) {
          /* storage full or blocked: keep running in memory */
        }
      }
    }

    // ---- public ----
    route('GET', '/api/health', ({ st }) => ({ ok: true, version: Dag.seed.VERSION, keys: C().mode(), dags: st.dags.length, auditEntries: st.audit.length }), { public: true });
    route('GET', '/api/demo/accounts', () => ({ password: Dag.DEMO.password, accounts: Dag.seed.accounts() }), { public: true });
    route('GET', '/api/keys', () => C().publicKeys(), { public: true });

    route('POST', '/api/auth/login', ({ st, body, trace }) => {
      const phone = digits(body.phone);
      const now = Date.now();
      const lf = st.loginFails[phone];
      if (lf && lf.until > now) {
        const s = Math.ceil((lf.until - now) / 1000);
        throw fail(429, `Too many wrong tries. Wait ${s} seconds.`, `অনেকবার ভুল হয়েছে। ${bnD(s)} সেকেন্ড অপেক্ষা করুন।`, { retryAfter: s });
      }
      const u = st.users.find((x) => x.phone === phone);
      const ok = u && u.passwordHash === C().hashPassword(String(body.password || ''), u.salt);
      if (!ok) {
        const f = lf && lf.until <= now && lf.count >= LOCK_AFTER ? { count: 0, until: 0 } : lf || { count: 0, until: 0 };
        f.count += 1;
        if (f.count >= LOCK_AFTER) f.until = now + LOCK_MS;
        st.loginFails[phone] = f;
        audit(st, 'anonymous', 'auth.failed', { phone: mask(phone) });
        const left = Math.max(0, LOCK_AFTER - f.count);
        throw fail(401, left ? `Phone number or password is wrong. ${left} tries left.` : 'Phone number or password is wrong. Login is locked for 60 seconds.',
          left ? `ফোন নম্বর বা পাসওয়ার্ড ভুল। আর ${bnD(left)} বার চেষ্টা করা যাবে।` : 'ফোন নম্বর বা পাসওয়ার্ড ভুল। ৬০ সেকেন্ডের জন্য লগইন বন্ধ।');
      }
      delete st.loginFails[phone];
      Object.keys(st.sessions).forEach((t) => st.sessions[t].exp < now && delete st.sessions[t]);
      const token = C().randomHex(16);
      st.sessions[token] = { userId: u.id, exp: now + SESSION_MS };
      trace.push(step('Auth', 'hash(password, per-user salt, 4096 rounds) == stored hash', { match: true }));
      trace.push(step('Session store', 'CREATE session, 12 h', { user: u.id, role: u.role }));
      audit(st, u.id, 'auth.login', { role: u.role });
      return { token, user: publicUser(u), context: context(st), expiresAt: new Date(now + SESSION_MS).toISOString() };
    }, { public: true });

    route('GET', '/api/me', ({ st, user }) => ({ user: publicUser(user), context: context(st) }));
    route('POST', '/api/auth/logout', ({ st, token, user }) => {
      delete st.sessions[token];
      audit(st, user.id, 'auth.logout', {});
      return { ok: true };
    });

    // ---- counter (Sub-Registrar) ----
    route('GET', '/api/counter/presets', ({ st }) => ({
      presets: st.presets.map((p) => {
        const s = personByNid(st, p.sellerNid);
        const b = personByNid(st, p.buyerNid);
        const out = Object.assign({}, p, { sellerName: s.name, sellerNameBn: s.nameBn, buyerName: b.name, buyerNameBn: b.nameBn });
        // Scenario 2 sells again what scenario 1 sold, so it only makes sense after a cleared or executed scenario 1.
        const first = p.after && st.presets.find((x) => x.id === p.after);
        if (first) out.ready = st.requests.some((r) => r.dag === first.dag && r.buyerNid === first.buyerNid && (r.status === 'cleared' || r.status === 'executed'));
        return out;
      }),
    }), { roles: SR });

    route('POST', '/api/counter/clearance', ({ st, body, user, trace }) => {
      const input = cleanDeed(st, body);
      const sn = names(st, input.sellerNid, input.sellerName);
      const bnm = names(st, input.buyerNid, input.buyerName);
      const req = Object.assign({ id: nextId(st, 'req', 'REQ') }, input, {
        sellerName: sn.name, sellerNameBn: sn.nameBn, sellerNameTyped: input.sellerName,
        buyerName: bnm.name, buyerNameBn: bnm.nameBn,
        office: st.office.name, officerId: user.id, createdAt: nowIso(), status: 'new', ownerResponse: null,
      });
      st.requests.push(req);
      cap(st.requests, CAPS.requests);
      trace.push(step('Gate', 'CREATE request', { id: req.id, dag: req.dag, share: req.share }));
      // C1 compares the name typed on the deed, not the resolved one.
      const res = evaluateReq(st, Object.assign({}, req, { sellerName: input.sellerName }), trace);
      applyResult(st, req, res, trace);
      const alertsSent = notifyOwners(st, req, 'check', trace);
      return { request: reqView(st, req), alertsSent };
    }, { roles: SR });

    route('GET', '/api/counter/requests/:id', ({ st, params }) => reqView(st, getReq(st, params.id)), { roles: SR });

    route('POST', '/api/counter/requests/:id/proceed', ({ st, params, body, user, trace }) => {
      const req = getReq(st, params.id);
      if (req.status !== 'warn') throw fail(409, `This request is "${req.status}". Only a WARN result takes a note.`, 'শুধু সতর্কবার্তা থাকা অনুরোধে নোট দিয়ে এগোনো যায়।');
      const note = text(body.note, 400);
      if (note.length < 8) throw fail(400, 'Write a note of at least 8 characters. It is printed on the clearance.', 'অন্তত ৮ অক্ষরের একটি নোট লিখুন। এটি ক্লিয়ারেন্সে ছাপা হবে।');
      const warnings = req.checks.filter((c) => c.verdict === 'warn').map((c) => ({ code: c.code, name: c.name, nameBn: c.nameBn, en: c.summary, bn: c.summaryBn }));
      issueClearance(st, req, warnings, note, trace);
      req.status = 'cleared';
      req.officerNote = note;
      audit(st, user.id, 'clearance.proceeded_with_note', { request: req.id });
      return reqView(st, req);
    }, { roles: SR });

    // Demo control: let the owner's 48 hour notice run out now.
    route('POST', '/api/counter/requests/:id/expire-notice', ({ st, params, user, trace }) => {
      const req = getReq(st, params.id);
      if (req.status !== 'hold') throw fail(409, 'Only a held request has a notice to expire.', 'শুধু আটকে থাকা অনুরোধের নোটিশ শেষ করা যায়।');
      req.noticeEndsAt = new Date(Date.now() - 1000).toISOString();
      trace.push(step('Demo clock', 'notice period set to ended', { request: req.id }));
      audit(st, user.id, 'demo.notice_expired', { request: req.id });
      applyResult(st, req, evaluateReq(st, Object.assign({}, req, { sellerName: req.sellerNameTyped }), trace), trace);
      return reqView(st, req);
    }, { roles: SR });

    route('POST', '/api/counter/requests/:id/execute', ({ st, params, user, trace }) => {
      const req = getReq(st, params.id);
      if (req.status !== 'cleared') throw fail(409, `This request is "${req.status}". Only a cleared request can be executed.`, 'শুধু ছাড়পত্র পাওয়া অনুরোধের দলিল সম্পন্ন করা যায়।');
      const clr = st.clearances.find((c) => c.id === req.clearanceId);
      if (!clr || clr.status !== 'issued') throw fail(409, 'The clearance is not open.', 'ক্লিয়ারেন্সটি খোলা নেই।');
      if (new Date(clr.validUntil) < new Date()) throw fail(409, 'The clearance has expired. Run the checks again.', 'ক্লিয়ারেন্সের মেয়াদ শেষ। আবার যাচাই করুন।');

      // Re-check at the moment of signing: something may have changed since
      // the clearance was issued (a mortgage, a court order, another deed).
      trace.push(step('Gate', 're-check before execution', { request: req.id }));
      const again = evaluateReq(st, Object.assign({}, req, { sellerName: req.sellerNameTyped }), trace);
      if (again.verdict === 'block' || again.verdict === 'hold') {
        clr.status = 'void';
        req.clearanceId = null;
        req.changedAfterClearance = true;
        applyResult(st, req, again, trace);
        audit(st, user.id, 'clearance.voided_at_execution', { clearance: clr.id, request: req.id });
        const alertsSent = notifyOwners(st, req, 'check', trace);
        const first = again.checks.find((c) => c.verdict === 'block' || c.verdict === 'hold');
        throw fail(409, `Something changed after the clearance was issued: ${first.code} ${first.summary} The clearance is void.`,
          `ক্লিয়ারেন্স দেওয়ার পর কিছু বদলেছে: ${first.code} ${first.summaryBn} ক্লিয়ারেন্স বাতিল।`, { request: reqView(st, req), alertsSent });
      }

      const seller = personByNid(st, req.sellerNid);
      let buyer = personByNid(st, req.buyerNid);
      if (!buyer) {
        buyer = { id: 'P' + (st.persons.length + 1), name: req.buyerName, nameBn: req.buyerNameBn, nid: req.buyerNid, phone: null };
        st.persons.push(buyer);
      }
      const at = nowIso();
      const deed = { id: nextId(st, 'deed', 'DLR'), clearanceId: clr.id, requestId: req.id, dag: req.dag, fromPersonId: seller.id, toPersonId: buyer.id, share: r2(req.share), at, office: st.office.name };
      st.deeds.push(deed);
      st.transfers.push({ id: deed.id, deedId: deed.id, dag: req.dag, fromPersonId: seller.id, toPersonId: buyer.id, share: deed.share, status: 'registered', at });
      clr.status = 'executed';
      clr.executedAt = at;
      req.status = 'executed';
      req.deedId = deed.id;
      trace.push(step('Registry', 'INSERT deed', { id: deed.id, clearance: clr.id }));
      trace.push(step('Area ledger', 'APPEND transfer', { dag: req.dag, out: deed.share, status: 'registered, not yet mutated' }));
      const kase = {
        id: nextId(st, 'nj', 'NJ'), deedId: deed.id, dag: req.dag,
        fromPersonId: seller.id, toPersonId: buyer.id,
        fromName: seller.name, fromNameBn: seller.nameBn, toName: buyer.name, toNameBn: buyer.nameBn,
        share: deed.share, openedAt: at, status: 'opened', office: st.acland.name,
        timeline: [
          { at, text: `Opened automatically from deed ${deed.id}. No application from the citizen.`, textBn: `দলিল ${deed.id} থেকে স্বয়ংক্রিয়ভাবে খোলা হয়েছে। নাগরিককে আবেদন করতে হয়নি।` },
          { at, text: 'Hearing notice sent to seller and buyer by SMS.', textBn: 'বিক্রেতা ও ক্রেতাকে এসএমএসে শুনানির নোটিশ পাঠানো হয়েছে।' },
        ],
      };
      st.cases.push(kase);
      req.caseId = kase.id;
      trace.push(step('AC Land namjari (event)', 'POST /namjari/cases', { id: kase.id, deed: deed.id, openedBy: 'registration event' }));
      audit(st, user.id, 'deed.registered', { deed: deed.id, dag: req.dag, share: deed.share });
      audit(st, 'event', 'namjari.opened', { case: kase.id, deed: deed.id });
      const alertsSent = notifyOwners(st, req, 'executed', trace, { deed, kase });
      return { request: reqView(st, req), deed, case: kase, alertsSent };
    }, { roles: SR });

    // ---- mouza map (P5) ----
    route('GET', '/api/mouza', ({ st }) => ({ mouza: st.mouza, dags: st.dags.map((d) => dagSummary(st, d)), fillers: st.mapFillers }));
    route('POST', '/api/mouza/:no/charge', ({ st, params, user, trace }) => {
      const dag = dagByNo(st, params.no);
      if (!dag) throw fail(404, `Dag ${params.no} is not in this mouza.`, `দাগ নং ${bnD(params.no)} এই মৌজায় নেই।`);
      oracleQuota(st, user.id);
      const o = askOracle(st, dag.no, user.name + ' (citizen search)', user.nameBn + ' (নাগরিক অনুসন্ধান)', trace);
      audit(st, user.id, 'oracle.citizen_search', { dag: dag.no });
      return { dag: dag.no, charge: o.reply.charge, since: o.reply.since, lender: o.reply.lender, lenderBn: o.reply.lenderBn, signatureValid: o.sigValid, keyId: o.keyId };
    });

    // ---- AC Land ----
    route('GET', '/api/acland/cases', ({ st }) => ({ cases: st.cases.slice().reverse() }), { roles: AC });

    route('POST', '/api/acland/cases/:id/approve', ({ st, params, user, trace }) => {
      const k = st.cases.find((c) => c.id === params.id);
      if (!k) throw fail(404, 'Case not found.', 'মামলা পাওয়া যায়নি।');
      if (k.status !== 'opened') throw fail(409, 'This case is already decided.', 'এই মামলার সিদ্ধান্ত হয়ে গেছে।');
      const idx = st.holders.findIndex((h) => h.dag === k.dag && h.personId === k.fromPersonId);
      if (idx < 0) throw fail(409, 'The seller no longer holds this dag.', 'বিক্রেতা আর এই দাগের মালিক নন।');
      const h = st.holders[idx];
      h.share = r2(h.share - k.share);
      const left = Math.max(0, h.share);
      if (h.share <= 0) st.holders.splice(idx, 1);
      st.meta.counters.kh += 1;
      const newKh = 'BS-' + st.meta.counters.kh;
      const bh = st.holders.find((x) => x.dag === k.dag && x.personId === k.toPersonId);
      if (bh) bh.share = r2(bh.share + k.share);
      else st.holders.push({ dag: k.dag, personId: k.toPersonId, share: k.share, mutated: true, khatian: newKh });
      const t = st.transfers.find((x) => x.deedId === k.deedId);
      if (t) t.status = 'mutated';
      const at = nowIso();
      k.status = 'approved';
      k.approvedAt = at;
      k.newKhatian = newKh;
      k.timeline.push({
        at,
        text: `Approved. Khatian ${newKh} opened for ${k.toName} (${en2(k.share)} dec). ${k.fromName} now holds ${en2(left)} dec.`,
        textBn: `অনুমোদিত। ${F().bnOf(k.toNameBn)} নামে খতিয়ান ${newKh} খোলা হয়েছে (${bn2(k.share)} শতাংশ)। ${F().bnOf(k.fromNameBn)} নামে এখন ${bn2(left)} শতাংশ।`,
      });
      trace.push(step('Record of rights', 'UPDATE holders', { dag: k.dag, seller: en2(left), buyer: en2(k.share), khatian: newKh }));
      trace.push(step('Area ledger', 'MARK transfer mutated', { deed: k.deedId }));
      audit(st, user.id, 'namjari.approved', { case: k.id, khatian: newKh });
      const req = st.requests.find((r) => r.deedId === k.deedId);
      const alertsSent = req ? notifyOwners(st, req, 'mutated', trace, { kase: k, left }) : [];
      // The new holder gets SMS from now on, and a message that the land is hers.
      subscribe(st, k.dag, k.toPersonId);
      const mz = st.mouza;
      const s = sendAlert(st, k.toPersonId, {
        level: 'success', kind: 'khatian',
        title: `Khatian ${newKh} is in your name`,
        text: `Namjari is done. You now hold ${en2(k.share)} dec of dag ${k.dag}, ${mz.name}. SMS alerts are on for this dag.`,
        titleBn: `খতিয়ান ${newKh} এখন আপনার নামে`,
        textBn: `নামজারি সম্পন্ন। ${mz.nameBn} মৌজার দাগ নং ${bnD(k.dag)}-এ এখন আপনার ${bn2(k.share)} শতাংশ জমি। এই দাগের এসএমএস সতর্কবার্তা চালু হয়েছে।`,
      }, trace);
      if (s) alertsSent.push(s);
      return { case: k, alertsSent };
    }, { roles: AC });

    route('GET', '/api/acland/reconciliation', ({ st, trace }) => {
      const all = st.dags.map((d) => dagSummary(st, d));
      const issues = [];
      all.forEach((d) => d.reasons.filter((r) => r.type !== 'lock').forEach((r) => issues.push({ dag: d.no, level: r.level, type: r.type, text: r.text, textBn: r.textBn })));
      const rank = { restricted: 0, care: 1 };
      issues.sort((a, b) => rank[a.level] - rank[b.level] || a.dag.localeCompare(b.dag));
      trace.push(step('Record health', 'scan every dag in the mouza', { dags: all.length, issues: issues.length }));
      return {
        dagsChecked: all.length,
        clean: all.filter((d) => d.reasons.every((r) => r.type === 'lock')).length,
        overAllocated: issues.filter((i) => i.type === 'over').length,
        issues,
        at: nowIso(),
      };
    }, { roles: AC });

    // ---- bank ----
    route('GET', '/api/bank/desk', ({ st }) => ({
      presets: st.loanPresets.map((p) => {
        const b = personByNid(st, p.borrowerNid);
        return Object.assign({}, p, { borrowerName: b.name, borrowerNameBn: b.nameBn });
      }),
      charges: st.bank.charges.filter((c) => c.lender === st.loanDesk.lender).slice().reverse().map(chargeView),
    }), { roles: BK });

    route('POST', '/api/bank/check', ({ st, body, user, trace }) => {
      const c = collateral(st, body, trace);
      audit(st, user.id, 'bank.collateral_checked', { dag: c.dag.no, outcome: c.outcome });
      const o = c.oracle;
      return {
        dag: c.dag.no, outcome: c.outcome, reasons: c.reasons,
        borrower: c.person ? c.person.name : null, borrowerBn: c.person ? c.person.nameBn : null,
        borrowerShare: c.holder ? c.holder.share : 0, locked: !!c.lock,
        oracle: { charge: o.reply.charge, since: o.reply.since, lender: o.reply.lender, lenderBn: o.reply.lenderBn, signatureValid: o.sigValid, keyId: o.keyId },
      };
    }, { roles: BK });

    route('POST', '/api/bank/charges', ({ st, body, user, trace }) => {
      const c = collateral(st, body, trace);
      if (c.outcome === 'refuse') throw fail(409, c.reasons[0].en, c.reasons[0].bn);
      const amount = Math.round(Number(digits(body.amount)));
      if (!(amount > 0) || amount > 1e11) throw fail(400, 'Enter a loan amount in taka.', 'ঋণের পরিমাণ টাকায় লিখুন।');
      const ch = {
        id: nextId(st, 'chg', 'CHG'), dag: c.dag.no,
        lender: st.loanDesk.lender, lenderBn: st.loanDesk.lenderBn,
        since: nowIso().slice(0, 10), loanRef: 'LN-' + C().randomHex(3).toUpperCase(), amount,
        borrower: c.person.name, borrowerBn: c.person.nameBn, borrowerNid: c.person.nid,
        status: c.lock ? 'held' : 'live', createdAt: nowIso(),
      };
      st.bank.charges.push(ch);
      trace.push(step('CIB registry (mock)', c.lock ? 'HOLD charge for the owner' : 'INSERT live charge', { id: ch.id, dag: ch.dag, status: ch.status }));
      audit(st, user.id, c.lock ? 'bank.charge_held' : 'bank.charge_registered', { charge: ch.id, dag: ch.dag });
      const alertsSent = notifyMortgage(st, ch, !!c.lock, c.lock, trace);
      return { charge: chargeView(ch), alertsSent };
    }, { roles: BK });

    route('GET', '/api/oracle/log', ({ st }) => ({ bank: st.bank.name, bankBn: st.bank.nameBn, log: st.oracleLog.slice().reverse().slice(0, 30) }), { roles: BK });

    // ---- owner ----
    route('GET', '/api/owner/dags', ({ st, user }) => {
      const me = person(st, user.personId);
      return st.holders.filter((h) => h.personId === user.personId).map((h) => {
        const d = dagByNo(st, h.dag);
        const lock = st.locks.find((l) => l.dag === h.dag && l.personId === user.personId);
        const mine = st.transfers.filter((t) => t.dag === h.dag && t.fromPersonId === user.personId);
        return {
          dag: h.dag, mouza: `${st.mouza.name}, JL ${st.mouza.jl}`, mouzaBn: `${st.mouza.nameBn}, জেএল ${bnD(st.mouza.jl)}`,
          landClass: d.landClass, landClassBn: d.landClassBn, area: d.area, share: h.share, khatian: h.khatian,
          locked: !!(lock && lock.on), lockSince: lock && lock.on ? lock.since : null,
          alertsOn: st.subscriptions.some((s) => s.dag === h.dag && s.personId === user.personId),
          pendingOut: r2(mine.filter((t) => t.status === 'registered').reduce((s, t) => s + t.share, 0)),
          transfers: mine.map((t) => {
            const to = person(st, t.toPersonId) || {};
            return { id: t.id, share: t.share, to: to.name, toBn: to.nameBn, status: t.status, at: t.at };
          }),
          mortgages: st.bank.charges.filter((c) => c.dag === h.dag && c.borrowerNid === me.nid).map(chargeView),
        };
      });
    }, { roles: OW });

    route('POST', '/api/owner/dags/:no/lock', ({ st, params, body, user, trace }) => {
      const holds = st.holders.some((h) => h.dag === params.no && h.personId === user.personId);
      if (!holds) throw fail(403, 'You do not hold this dag.', 'আপনি এই দাগের মালিক নন।');
      let lock = st.locks.find((l) => l.dag === params.no && l.personId === user.personId);
      if (!lock) {
        lock = { dag: params.no, personId: user.personId, on: false, since: null };
        st.locks.push(lock);
      }
      lock.on = !!body.on;
      lock.since = lock.on ? nowIso() : null;
      subscribe(st, params.no, user.personId);
      trace.push(step('Lock & alert service', lock.on ? 'SET lock' : 'CLEAR lock', { dag: params.no }));
      audit(st, user.id, lock.on ? 'lock.on' : 'lock.off', { dag: params.no });
      return { dag: params.no, locked: lock.on };
    }, { roles: OW });

    route('GET', '/api/owner/alerts', ({ st, user }) => {
      const list = st.alerts.filter((a) => a.personId === user.personId).slice().reverse();
      return { unread: list.filter((a) => !a.read).length, alerts: list.slice(0, 40) };
    }, { roles: OW });

    route('POST', '/api/owner/alerts/read-all', ({ st, user }) => {
      st.alerts.forEach((a) => {
        if (a.personId === user.personId && !(a.actionRequired && !a.response)) a.read = true;
      });
      return { ok: true };
    }, { roles: OW });

    route('POST', '/api/owner/alerts/:id/respond', ({ st, params, body, user, trace }) => {
      const a = st.alerts.find((x) => x.id === params.id && x.personId === user.personId);
      if (!a) throw fail(404, 'Alert not found.', 'বার্তা পাওয়া যায়নি।');
      if (!a.actionRequired) throw fail(400, 'This alert needs no answer.', 'এই বার্তার উত্তর লাগে না।');
      if (a.response) throw fail(409, 'You already answered this alert.', 'আপনি এই বার্তার উত্তর আগেই দিয়েছেন।');
      const answer = body.answer === 'me' ? 'me' : body.answer === 'not_me' ? 'not_me' : null;
      if (!answer) throw fail(400, 'The answer must be "me" or "not_me".', 'উত্তর "me" অথবা "not_me" হতে হবে।');
      a.response = answer;
      a.read = true;
      a.respondedAt = nowIso();
      trace.push(step('Lock & alert service', 'owner answered', { alert: a.id, kind: a.kind, answer }));
      if (a.kind === 'mortgage') {
        const ch = st.bank.charges.find((c) => c.id === a.chargeId);
        if (!ch) throw fail(404, 'Charge not found.', 'বন্ধক পাওয়া যায়নি।');
        ch.status = answer === 'me' ? 'live' : 'refused';
        ch.decidedAt = a.respondedAt;
        trace.push(step('CIB registry (mock)', answer === 'me' ? 'ACTIVATE charge' : 'REFUSE charge', { id: ch.id, status: ch.status }));
        audit(st, user.id, answer === 'me' ? 'lock.mortgage_confirmed' : 'lock.mortgage_denied', { charge: ch.id });
        return { alert: a, charge: chargeView(ch) };
      }
      const req = getReq(st, a.requestId);
      req.ownerResponse = answer;
      req.ownerRespondedAt = a.respondedAt;
      audit(st, user.id, answer === 'me' ? 'lock.owner_confirmed' : 'lock.owner_denied', { request: req.id });
      trace.push(step('Gate', 're-run checks with the answer', { request: req.id }));
      if (req.status === 'hold') applyResult(st, req, evaluateReq(st, Object.assign({}, req, { sellerName: req.sellerNameTyped }), trace), trace);
      return { alert: a, request: { id: req.id, status: req.status, verdict: req.verdict } };
    }, { roles: OW });

    // ---- verify (public: banks, buyers and AC Land can check without a login) ----
    route('GET', '/api/verify/clearances', ({ st, user }) => {
      const me = user.personId ? person(st, user.personId) : null;
      const officer = OFFICERS.some((r) => user.roles.includes(r));
      return st.clearances
        .filter((c) => officer || (me && (c.sellerNid === me.nid || c.buyerNid === me.nid)))
        .slice().reverse()
        .map((c) => ({ id: c.id, dag: c.dag, share: c.share, sellerName: c.payload.seller.name, sellerNameBn: c.payload.seller.nameBn, buyerName: c.payload.buyer.name, buyerNameBn: c.payload.buyer.nameBn, verdict: c.payload.verdict, status: c.status, issuedAt: c.issuedAt }));
    });

    route('GET', '/api/verify/:id', ({ st, params, trace }) => {
      const c = st.clearances.find((x) => x.id === params.id);
      if (!c) throw fail(404, `No clearance ${params.id}.`, `ক্লিয়ারেন্স ${params.id} পাওয়া যায়নি।`);
      const valid = C().verify(c.payload, c.signature, C().keys.gate().publicKey);
      trace.push(step('Verifier', 'Ed25519 verify(canonical JSON, signature, public key)', { valid }));
      return { id: c.id, valid, status: c.status, algorithm: 'Ed25519', keyId: C().fingerprint(C().keys.gate().publicKey), payload: c.payload, signature: c.signature, qrToken: c.qrToken };
    }, { public: true });

    route('POST', '/api/verify/:id/tamper', ({ st, params, trace }) => {
      const c = st.clearances.find((x) => x.id === params.id);
      if (!c) throw fail(404, `No clearance ${params.id}.`, `ক্লিয়ারেন্স ${params.id} পাওয়া যায়নি।`);
      const forged = JSON.parse(JSON.stringify(c.payload));
      forged.share = r2(forged.share + 2);
      const valid = C().verify(forged, c.signature, C().keys.gate().publicKey);
      trace.push(step('Verifier', 'verify an edited copy with the original signature', { valid }));
      return { id: c.id, valid, changed: { field: 'share', from: c.payload.share, to: forged.share } };
    }, { public: true });

    route('POST', '/api/verify/token', ({ body, trace }) => {
      const k = C().publicKeys();
      const ring = [{ keyId: k.gate.keyId, publicKeyHex: k.gate.publicKeyHex, label: k.mode }, { keyId: k.demoGate.keyId, publicKeyHex: k.demoGate.publicKeyHex, label: 'demo' }];
      const v = Dag.qrtoken.verify(String(body.token || ''), ring);
      trace.push(step('Verifier', 'Ed25519 verify(QR text)', { valid: v.ok, reason: v.reason }));
      return { valid: v.ok, reason: v.reason, token: v.token || null, key: v.key ? { keyId: v.key.keyId, label: v.key.label } : null };
    }, { public: true });

    route('GET', '/api/audit', ({ st }) => ({
      count: st.audit.length, intact: chainIntact(st),
      head: st.audit.length ? st.audit[st.audit.length - 1].hash : null,
      entries: st.audit.slice(-10).reverse(),
    }), { roles: OFFICERS });

    route('POST', '/api/demo/reset', ({ st }) => {
      const sessions = st.sessions;
      const next = fresh();
      Object.keys(st).forEach((k) => delete st[k]);
      Object.assign(st, next, { sessions });
      return { ok: true };
    }, { public: true });

    return { handle };
  }

  // ---------- stores ----------
  // Browser: one workspace kept in localStorage. Every request reloads it, so
  // two tabs of the same demo (officer in one, owner in the other) stay in sync.
  function browserStore(key) {
    let mem = null;
    return {
      load() {
        try {
          const raw = root.localStorage && root.localStorage.getItem(key);
          if (raw) return JSON.parse(raw);
        } catch (e) {
          /* blocked or corrupt */
        }
        return mem ? JSON.parse(JSON.stringify(mem)) : null;
      },
      save(ws, st) {
        mem = st;
        try {
          root.localStorage.setItem(key, JSON.stringify(st));
        } catch (e) {
          /* private window: memory only */
        }
      },
    };
  }
  function memoryStore() {
    const m = new Map();
    return { load: (ws) => m.get(ws) || null, save: (ws, st) => m.set(ws, st), map: m };
  }

  Dag.createBackend = createBackend;
  Dag.stores = { browser: browserStore, memory: memoryStore };
  if (typeof window !== 'undefined') Dag.server = createBackend(browserStore('dag-demo-state-v5'));
})(typeof window !== 'undefined' ? window : globalThis);
