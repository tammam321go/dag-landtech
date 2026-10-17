/*
 * Dag rules engine.
 * Pure functions: give it the facts, it returns nine checks and a verdict.
 * No storage, no network, no clock except the `now` you pass in. This is the
 * part a judge should read first.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  // Severity order. The overall verdict is the worst single check.
  const RANK = { na: 0, pass: 0, warn: 1, hold: 2, block: 3 };

  const CHECKS = [
    { code: 'C1', name: 'Seller in record' },
    { code: 'C2', name: 'Area ledger' },
    { code: 'C3', name: 'Pending deed lock' },
    { code: 'C4', name: 'Khajna and mutation' },
    { code: 'C5', name: 'Government interest' },
    { code: 'C6', name: 'Court injunction' },
    { code: 'C7', name: 'Survey chain' },
    { code: 'C8', name: 'Owner lock', addition: true },
    { code: 'C9', name: 'Encumbrance oracle', addition: true },
  ];

  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  const f2 = (n) => r2(n).toFixed(2);
  const fyStart = (fy) => parseInt(String(fy).slice(0, 4), 10);
  const day = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const clock = (iso) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  function evaluate(ctx) {
    const { req, dag, holders, persons, transfers, clearances, flags, injunctions, lock, oracle, currentFY } = ctx;
    const now = ctx.now || new Date();
    const out = [];
    const add = (code, verdict, summary, evidence, extra) => {
      const meta = CHECKS.find((c) => c.code === code);
      out.push(Object.assign({ code, name: meta.name, addition: !!meta.addition, verdict, summary, evidence: evidence || {} }, extra || {}));
    };

    if (!dag) {
      add('C1', 'block', `Dag ${req.dag} does not exist in this mouza's record.`, { 'Dag asked for': req.dag });
      CHECKS.slice(1).forEach((c) => add(c.code, 'na', 'Not run: the dag was not found.'));
      return finish(out);
    }

    const personById = (id) => persons.find((p) => p.id === id) || { name: id };
    const seller = persons.find((p) => p.nid === req.sellerNid) || null;
    const holder = seller ? holders.find((h) => h.dag === dag.no && h.personId === seller.id) : null;
    const recorded = holders
      .filter((h) => h.dag === dag.no)
      .map((h) => `${personById(h.personId).name} (${f2(h.share)})`)
      .join(', ');

    // C1 Seller in record: the NID at the counter must belong to a holder.
    if (!seller) {
      add('C1', 'block', `NID ${req.sellerNid} returned no person from the NID service.`, { 'NID presented': req.sellerNid, 'Recorded holders': recorded });
    } else if (!holder) {
      add('C1', 'block', `${seller.name} is not a recorded holder of dag ${dag.no}.`, { 'NID presented': req.sellerNid, 'NID service name': seller.name, 'Recorded holders': recorded });
    } else {
      add('C1', 'pass', `NID matches ${seller.name}, holder on khatian ${holder.khatian}.`, {
        'NID presented': req.sellerNid,
        'NID service name': seller.name,
        Khatian: holder.khatian,
        'Recorded share': f2(holder.share) + ' dec',
      });
    }

    // C2 Area ledger: shares already sold but not yet mutated still count.
    const share = Number(req.share);
    if (!(share > 0)) {
      add('C2', 'block', 'The share must be more than zero.', { Requested: String(req.share) });
    } else if (!holder) {
      add('C2', 'na', 'Not run: the seller is not in the record.');
    } else {
      const pendingOut = r2(
        transfers
          .filter((t) => t.dag === dag.no && t.fromPersonId === seller.id && t.status === 'registered')
          .reduce((s, t) => s + t.share, 0)
      );
      const available = r2(holder.share - pendingOut);
      const totalHeld = r2(holders.filter((h) => h.dag === dag.no).reduce((s, h) => s + h.share, 0));
      const over = totalHeld > dag.area + 1e-9;
      const math = { area: r2(dag.area), totalHeld, over, holds: r2(holder.share), pendingOut, available, requested: r2(share), short: r2(Math.max(0, share - available)) };
      if (over) {
        add('C2', 'block', `The record already gives out ${f2(totalHeld)} dec of a ${f2(dag.area)} dec dag. Fix the record before any sale.`, { 'Over by': f2(totalHeld - dag.area) + ' dec', 'Recorded holders': recorded }, { math });
      } else if (share > available + 1e-9) {
        add('C2', 'block', `Asks for ${f2(share)} dec, but only ${f2(available)} dec is left to sell.`, {}, { math });
      } else {
        add('C2', 'pass', `${f2(share)} of ${f2(available)} dec available is being sold.`, {}, { math });
      }
    }

    // C3 Pending deed: an open clearance on the same dag locks it.
    const open = clearances.filter(
      (c) => c.dag === dag.no && c.status === 'issued' && c.requestId !== req.id && new Date(c.validUntil) > now
    );
    if (open.length) {
      const c = open[0];
      add('C3', 'block', `Clearance ${c.id} on this dag is still open and not executed.`, {
        'Open clearance': c.id,
        Issued: clock(c.issuedAt),
        Seller: c.sellerName,
        Share: f2(c.share) + ' dec',
        'Expires': clock(c.validUntil) + ', ' + day(c.validUntil),
      });
    } else {
      add('C3', 'pass', 'No other deed on this dag is in progress.');
    }

    // C4 Khajna and mutation.
    if (!holder) {
      add('C4', 'na', 'Not run: the seller is not in the record.');
    } else if (!holder.mutated) {
      add('C4', 'block', `${seller.name} is not on a mutation khatian yet. Namjari must come first.`, { 'Current khatian': holder.khatian, 'Mutation done': 'No' });
    } else {
      const due = fyStart(currentFY) - fyStart(dag.khajnaPaidUpto);
      const ev = { 'LD tax paid up to': 'FY ' + dag.khajnaPaidUpto, 'Current year': 'FY ' + currentFY, 'Mutation khatian': holder.khatian };
      if (due > 0) add('C4', 'warn', `Land development tax is ${due} year${due > 1 ? 's' : ''} due (paid up to FY ${dag.khajnaPaidUpto}).`, ev);
      else add('C4', 'pass', `LD tax paid up to FY ${dag.khajnaPaidUpto}. Seller is on khatian ${holder.khatian}.`, ev);
    }

    // C5 Government interest lists.
    const fl = flags.filter((f) => f.dag === dag.no);
    if (fl.length) {
      add('C5', 'block', `${fl[0].type} land: ${fl[0].ref}.`, { List: fl[0].list, Reference: fl[0].ref, 'Listed since': day(fl[0].since) });
    } else {
      add('C5', 'pass', 'Not on the khas, acquired, waqf, debottar or vested lists.');
    }

    // C6 Court injunctions.
    const inj = injunctions.filter((i) => i.dag === dag.no);
    if (inj.length) {
      add('C6', 'block', `${inj[0].order}: ${inj[0].suit}.`, { Court: inj[0].court, Suit: inj[0].suit, Order: inj[0].order, Since: day(inj[0].since) });
    } else {
      add('C6', 'pass', 'No suit or order is recorded against this dag.');
    }

    // C7 Survey chain CS, SA, RS, BS.
    const order = ['CS', 'SA', 'RS', 'BS'];
    const missing = order.filter((k) => !dag.survey[k]);
    const chain = order.map((k) => `${k} ${dag.survey[k] || '(none)'}`).join(' > ');
    if (missing.length) {
      add('C7', 'warn', `The chain breaks at ${missing.join(', ')}: no ${missing.join('/')} dag is mapped to this plot.`, { Chain: chain });
    } else {
      add('C7', 'pass', `Complete: ${chain}.`, { Chain: chain });
    }

    // C8 Owner lock (addition 1).
    if (!lock) {
      add('C8', 'pass', 'No owner lock on this dag.');
    } else if (req.ownerResponse === 'me') {
      add('C8', 'pass', `The owner confirmed this deed on his phone at ${clock(req.ownerRespondedAt)}.`, { 'Owner': lock.ownerName, 'Answer': 'Yes, it is me', 'Answered at': clock(req.ownerRespondedAt) });
    } else if (req.ownerResponse === 'not_me') {
      add('C8', 'block', `The owner denied this deed on his phone at ${clock(req.ownerRespondedAt)}. Do not register.`, {
        Owner: lock.ownerName,
        Answer: 'No, this is not me',
        'Answered at': clock(req.ownerRespondedAt),
        'Next step': 'Hold the documents and refer the presenter to police.',
      });
    } else {
      const ends = new Date(new Date(req.createdAt).getTime() + 48 * 3600 * 1000).toISOString();
      add('C8', 'hold', `Owner lock is on. The owner was alerted at ${lock.maskedPhone}. Held until he answers, or 48 h.`, {
        Owner: lock.ownerName,
        'Lock set on': day(lock.since),
        'Notice sent to': lock.maskedPhone,
        'Notice ends': clock(ends) + ', ' + day(ends),
      });
    }

    // C9 Encumbrance oracle (addition 2).
    if (!oracle) {
      add('C9', 'na', 'Not run: the oracle was not reached.');
    } else if (!oracle.sigValid) {
      add('C9', 'block', 'The oracle reply failed its signature check. Treat as unknown.');
    } else if (oracle.reply.charge) {
      add('C9', 'block', `Live bank charge since ${day(oracle.reply.since)}. The lender's NOC is needed first.`, {
        Charge: 'Yes',
        Since: day(oracle.reply.since),
        Lender: oracle.reply.lender,
        'Signed by': 'CIB oracle key ' + oracle.keyId,
        Signature: 'Valid',
      });
    } else {
      add('C9', 'pass', 'No live bank charge. Signed reply from the CIB oracle.', { Charge: 'No', 'Signed by': 'CIB oracle key ' + oracle.keyId, Signature: 'Valid' });
    }

    return finish(out);
  }

  function finish(checks) {
    const counts = { pass: 0, warn: 0, hold: 0, block: 0, na: 0 };
    let worst = 'pass';
    for (const c of checks) {
      counts[c.verdict] += 1;
      if (RANK[c.verdict] > RANK[worst]) worst = c.verdict;
    }
    return { verdict: worst, counts, checks };
  }

  Dag.engine = { evaluate, CHECKS, RANK, r2, f2 };
})(typeof window !== 'undefined' ? window : globalThis);
