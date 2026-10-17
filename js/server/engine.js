/*
 * Dag rules engine.
 * Pure functions: give it the facts, it returns nine checks and a verdict.
 * No storage, no network, no clock except the `now` you pass in. This is the
 * part to read first. Every message is written twice, English and Bangla.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const F = () => Dag.fmt;

  // Severity order. The overall verdict is the worst single check.
  const RANK = { na: 0, pass: 0, warn: 1, hold: 2, block: 3 };

  const CHECKS = [
    { code: 'C1', name: 'Seller in record', nameBn: 'বিক্রেতা রেকর্ডে আছেন কি' },
    { code: 'C2', name: 'Area ledger', nameBn: 'জমির হিসাব' },
    { code: 'C3', name: 'Pending deed lock', nameBn: 'চলমান দলিলের লক' },
    { code: 'C4', name: 'Khajna and mutation', nameBn: 'খাজনা ও নামজারি' },
    { code: 'C5', name: 'Government interest', nameBn: 'সরকারি স্বার্থ' },
    { code: 'C6', name: 'Court injunction', nameBn: 'আদালতের নিষেধাজ্ঞা' },
    { code: 'C7', name: 'Survey chain', nameBn: 'জরিপের ধারাবাহিকতা' },
    { code: 'C8', name: 'Owner lock', nameBn: 'মালিকের লক', addition: true },
    { code: 'C9', name: 'Encumbrance oracle', nameBn: 'ব্যাংকের দায় যাচাই', addition: true },
  ];
  const SURVEY_BN = { CS: 'সিএস', SA: 'এসএ', RS: 'আরএস', BS: 'বিএস' };
  const NOTICE_MS = 48 * 3600 * 1000;

  const fyStart = (fy) => parseInt(String(fy).slice(0, 4), 10);
  const norm = (s) => String(s || '').toLowerCase().replace(/[.,'"()-]/g, ' ').replace(/\s+/g, ' ').trim();
  // Evidence rows: label and value, each in both languages.
  const row = (k, kBn, v, vBn) => ({ k, kBn, v: String(v), vBn: String(vBn == null ? v : vBn) });

  function evaluate(ctx) {
    const { req, dag, holders, persons, transfers, clearances, flags, injunctions, lock, oracle, currentFY } = ctx;
    const now = ctx.now || new Date();
    const f = F();
    // Prose uses plain numbers (10, 9.5); the arithmetic box keeps 2 decimals.
    const en2 = (n) => f.num(n, 'en');
    const bn2 = (n) => f.num(n, 'bn');
    const bnN = (n) => f.num(n, 'bn');
    const out = [];
    const add = (code, verdict, summary, summaryBn, evidence, extra) => {
      const meta = CHECKS.find((c) => c.code === code);
      out.push(Object.assign({ code, name: meta.name, nameBn: meta.nameBn, addition: !!meta.addition, verdict, summary, summaryBn, evidence: evidence || [] }, extra || {}));
    };
    const notRun = (code, why, whyBn) => add(code, 'na', 'Not run: ' + why, 'চালানো হয়নি: ' + whyBn);

    if (!dag) {
      add('C1', 'block', `Dag ${req.dag} does not exist in this mouza's record.`, `এই মৌজার রেকর্ডে দাগ নং ${f.digits(req.dag, 'bn')} নেই।`, [row('Dag asked for', 'চাওয়া দাগ', req.dag, f.digits(req.dag, 'bn'))]);
      CHECKS.slice(1).forEach((c) => notRun(c.code, 'the dag was not found.', 'দাগ পাওয়া যায়নি।'));
      return finish(out);
    }

    const personById = (id) => persons.find((p) => p.id === id) || { name: id, nameBn: id };
    const seller = persons.find((p) => p.nid === req.sellerNid) || null;
    const holder = seller ? holders.find((h) => h.dag === dag.no && h.personId === seller.id) : null;
    const hs = holders.filter((h) => h.dag === dag.no);
    const recorded = hs.map((h) => `${personById(h.personId).name} (${en2(h.share)})`).join(', ');
    const recordedBn = hs.map((h) => `${personById(h.personId).nameBn} (${bn2(h.share)})`).join(', ');
    const dagBn = f.digits(dag.no, 'bn');

    // C1 Seller in record: the NID at the counter must belong to a holder,
    // and the name written on the deed should match the NID record.
    if (!seller) {
      add('C1', 'block', `NID ${req.sellerNid} returned no person from the NID service.`, `এনআইডি ${req.sellerNid} দিয়ে এনআইডি সার্ভিসে কোনো ব্যক্তি পাওয়া যায়নি।`, [
        row('NID presented', 'উপস্থাপিত এনআইডি', req.sellerNid),
        row('Recorded holders', 'রেকর্ডভুক্ত মালিক', recorded, recordedBn),
      ]);
    } else if (!holder) {
      add('C1', 'block', `${seller.name} is not a recorded holder of dag ${dag.no}.`, `${seller.nameBn} দাগ নং ${dagBn}-এর রেকর্ডভুক্ত মালিক নন।`, [
        row('NID presented', 'উপস্থাপিত এনআইডি', req.sellerNid),
        row('NID service name', 'এনআইডি অনুযায়ী নাম', seller.name, seller.nameBn),
        row('Recorded holders', 'রেকর্ডভুক্ত মালিক', recorded, recordedBn),
      ]);
    } else {
      const ev = [
        row('NID presented', 'উপস্থাপিত এনআইডি', req.sellerNid),
        row('NID service name', 'এনআইডি অনুযায়ী নাম', seller.name, seller.nameBn),
        row('Khatian', 'খতিয়ান', holder.khatian),
        row('Recorded share', 'রেকর্ডে অংশ', en2(holder.share) + ' dec', bn2(holder.share) + ' শতাংশ'),
      ];
      const typed = norm(req.sellerName);
      const matches = !typed || typed === norm(seller.name) || typed === norm(seller.nameBn);
      if (!matches) {
        ev.splice(2, 0, row('Name on the deed', 'দলিলে নাম', req.sellerName));
        add('C1', 'warn', `NID belongs to ${seller.name}, but the deed names "${req.sellerName}". Check the spelling or the person.`, `এনআইডি ${f.bnOf(seller.nameBn)}, কিন্তু দলিলে নাম লেখা "${req.sellerName}"। বানান অথবা ব্যক্তি যাচাই করুন।`, ev);
      } else {
        add('C1', 'pass', `NID matches ${seller.name}, holder on khatian ${holder.khatian}.`, `এনআইডি ${f.bnOf(seller.nameBn)} সাথে মিলেছে, তিনি খতিয়ান ${holder.khatian}-এর মালিক।`, ev);
      }
    }

    // C2 Area ledger: shares already sold but not yet mutated still count,
    // and a dag the record already over-allocates cannot be sold at all.
    const share = Number(req.share);
    if (!(share > 0)) {
      add('C2', 'block', 'The share must be more than zero.', 'অংশ শূন্যের বেশি হতে হবে।', [row('Requested', 'চাওয়া হয়েছে', String(req.share))]);
    } else if (!holder) {
      notRun('C2', 'the seller is not in the record.', 'বিক্রেতা রেকর্ডে নেই।');
    } else {
      const pendingOut = f.r2(transfers.filter((t) => t.dag === dag.no && t.fromPersonId === seller.id && t.status === 'registered').reduce((s, t) => s + t.share, 0));
      const available = f.r2(holder.share - pendingOut);
      const totalHeld = f.r2(hs.reduce((s, h) => s + h.share, 0));
      const over = totalHeld > dag.area + 1e-9;
      const math = { area: f.r2(dag.area), totalHeld, over, holds: f.r2(holder.share), pendingOut, available, requested: f.r2(share), short: f.r2(Math.max(0, share - available)) };
      if (over) {
        add('C2', 'block',
          `The record already gives out ${en2(totalHeld)} dec of a ${en2(dag.area)} dec dag. Fix the record before any sale.`,
          `রেকর্ডে ${bn2(dag.area)} শতাংশের দাগে ইতিমধ্যে ${bn2(totalHeld)} শতাংশ মালিকানা দেওয়া আছে। কোনো বিক্রির আগে রেকর্ড ঠিক করতে হবে।`,
          [row('Over by', 'বেশি', en2(totalHeld - dag.area) + ' dec', bn2(totalHeld - dag.area) + ' শতাংশ'), row('Recorded holders', 'রেকর্ডভুক্ত মালিক', recorded, recordedBn)], { math });
      } else if (share > available + 1e-9) {
        add('C2', 'block', `Asks for ${en2(share)} dec, but only ${en2(available)} dec is left to sell.`, `${bn2(share)} শতাংশ চাওয়া হয়েছে, কিন্তু বিক্রির মতো আছে মাত্র ${bn2(available)} শতাংশ।`, [], { math });
      } else {
        add('C2', 'pass', `${en2(share)} of ${en2(available)} dec available is being sold.`, `বিক্রিযোগ্য ${bn2(available)} শতাংশের মধ্যে ${bn2(share)} শতাংশ বিক্রি হচ্ছে।`, [], { math });
      }
    }

    // C3 Pending deed: an open clearance on the same dag locks it.
    const open = clearances.filter((c) => c.dag === dag.no && c.status === 'issued' && c.requestId !== req.id && new Date(c.validUntil) > now);
    if (open.length) {
      const c = open[0];
      add('C3', 'block', `Clearance ${c.id} on this dag is still open and not executed.`, `এই দাগে ক্লিয়ারেন্স ${c.id} এখনও খোলা, দলিল সম্পন্ন হয়নি।`, [
        row('Open clearance', 'খোলা ক্লিয়ারেন্স', c.id),
        row('Issued', 'ইস্যু', f.dateTime(c.issuedAt, 'en'), f.dateTime(c.issuedAt, 'bn')),
        row('Seller', 'বিক্রেতা', c.sellerName, c.sellerNameBn || c.sellerName),
        row('Share', 'অংশ', en2(c.share) + ' dec', bn2(c.share) + ' শতাংশ'),
        row('Expires', 'মেয়াদ শেষ', f.dateTime(c.validUntil, 'en'), f.dateTime(c.validUntil, 'bn')),
      ]);
    } else {
      add('C3', 'pass', 'No other deed on this dag is in progress.', 'এই দাগে অন্য কোনো দলিল চলমান নেই।');
    }

    // C4 Khajna and mutation.
    if (!holder) {
      notRun('C4', 'the seller is not in the record.', 'বিক্রেতা রেকর্ডে নেই।');
    } else if (!holder.mutated) {
      add('C4', 'block', `${seller.name} is not on a mutation khatian yet. Namjari must come first.`, `${f.bnOf(seller.nameBn)} নামে এখনও নামজারি খতিয়ান নেই। আগে নামজারি করতে হবে।`, [
        row('Current khatian', 'বর্তমান খতিয়ান', holder.khatian + (holder.note ? ' (' + holder.note + ')' : ''), holder.khatian + (holder.noteBn ? ' (' + holder.noteBn + ')' : '')),
        row('Mutation done', 'নামজারি হয়েছে', 'No', 'না'),
      ]);
    } else {
      const due = fyStart(currentFY) - fyStart(dag.khajnaPaidUpto);
      const ev = [
        row('LD tax paid up to', 'কর পরিশোধ', 'FY ' + dag.khajnaPaidUpto, f.fy(dag.khajnaPaidUpto, 'bn') + ' অর্থবছর পর্যন্ত'),
        row('Current year', 'চলতি অর্থবছর', 'FY ' + currentFY, f.fy(currentFY, 'bn')),
        row('Mutation khatian', 'নামজারি খতিয়ান', holder.khatian),
      ];
      if (due > 0) {
        add('C4', 'warn', `Land development tax is ${due} year${due > 1 ? 's' : ''} due (paid up to FY ${dag.khajnaPaidUpto}).`, `ভূমি উন্নয়ন কর ${bnN(due)} বছর বকেয়া (${f.fy(dag.khajnaPaidUpto, 'bn')} অর্থবছর পর্যন্ত পরিশোধিত)।`, ev);
      } else {
        add('C4', 'pass', `LD tax paid up to FY ${dag.khajnaPaidUpto}. Seller is on khatian ${holder.khatian}.`, `ভূমি উন্নয়ন কর ${f.fy(dag.khajnaPaidUpto, 'bn')} অর্থবছর পর্যন্ত পরিশোধিত। বিক্রেতা খতিয়ান ${holder.khatian}-এ আছেন।`, ev);
      }
    }

    // C5 Government interest lists.
    const fl = flags.filter((x) => x.dag === dag.no);
    if (fl.length) {
      const x = fl[0];
      add('C5', 'block', `${x.type} land: ${x.ref}.`, `${x.typeBn} জমি: ${x.refBn}।`, [
        row('List', 'তালিকা', x.list, x.listBn),
        row('Reference', 'সূত্র', x.ref, x.refBn),
        row('Listed since', 'তালিকাভুক্তির তারিখ', f.date(x.since, 'en'), f.date(x.since, 'bn')),
      ]);
    } else {
      add('C5', 'pass', 'Not on the khas, acquired, waqf, debottar or vested lists.', 'খাস, অধিগৃহীত, ওয়াকফ, দেবোত্তর বা অর্পিত সম্পত্তির তালিকায় নেই।');
    }

    // C6 Court injunctions.
    const inj = injunctions.filter((x) => x.dag === dag.no);
    if (inj.length) {
      const x = inj[0];
      add('C6', 'block', `${x.order}: ${x.suit}.`, `${x.orderBn}: ${x.suitBn}।`, [
        row('Court', 'আদালত', x.court, x.courtBn),
        row('Suit', 'মামলা', x.suit, x.suitBn),
        row('Order', 'আদেশ', x.order, x.orderBn),
        row('Since', 'তারিখ', f.date(x.since, 'en'), f.date(x.since, 'bn')),
      ]);
    } else {
      add('C6', 'pass', 'No suit or order is recorded against this dag.', 'এই দাগে কোনো মামলা বা আদেশ রেকর্ডে নেই।');
    }

    // C7 Survey chain CS, SA, RS, BS.
    const order = ['CS', 'SA', 'RS', 'BS'];
    const missing = order.filter((k) => !dag.survey[k]);
    const chain = order.map((k) => `${k} ${dag.survey[k] || '(none)'}`).join(' > ');
    const chainBn = order.map((k) => `${SURVEY_BN[k]} ${dag.survey[k] ? f.digits(dag.survey[k], 'bn') : '(নেই)'}`).join(' > ');
    if (missing.length) {
      const m = missing.join(', ');
      const mBn = missing.map((k) => SURVEY_BN[k]).join(', ');
      add('C7', 'warn', `The chain breaks at ${m}: no ${missing.join('/')} dag is mapped to this plot.`, `${mBn} জরিপে ধারাবাহিকতা ভেঙেছে: এই জমির কোনো ${mBn} দাগ মেলানো নেই।`, [row('Chain', 'ধারাবাহিকতা', chain, chainBn)]);
    } else {
      add('C7', 'pass', `Complete: ${chain}.`, `সম্পূর্ণ: ${chainBn}।`, [row('Chain', 'ধারাবাহিকতা', chain, chainBn)]);
    }

    // C8 Owner lock (addition 1).
    if (!lock) {
      add('C8', 'pass', 'No owner lock on this dag.', 'এই দাগে মালিকের কোনো লক নেই।');
    } else {
      const ends = req.noticeEndsAt || new Date(Date.parse(req.createdAt) + NOTICE_MS).toISOString();
      const owner = [row('Owner', 'মালিক', lock.ownerName, lock.ownerNameBn)];
      if (req.ownerResponse === 'me') {
        add('C8', 'pass', `The owner confirmed this deed on his phone at ${f.time(req.ownerRespondedAt, 'en')}.`, `মালিক ${f.time(req.ownerRespondedAt, 'bn')}-এ নিজের ফোনে দলিলটি নিশ্চিত করেছেন।`,
          owner.concat([row('Answer', 'উত্তর', 'Yes, it is me', 'হ্যাঁ, এটা আমি'), row('Answered at', 'উত্তরের সময়', f.dateTime(req.ownerRespondedAt, 'en'), f.dateTime(req.ownerRespondedAt, 'bn'))]));
      } else if (req.ownerResponse === 'not_me') {
        add('C8', 'block', `The owner denied this deed on his phone at ${f.time(req.ownerRespondedAt, 'en')}. Do not register.`, `মালিক ${f.time(req.ownerRespondedAt, 'bn')}-এ নিজের ফোনে দলিলটি অস্বীকার করেছেন। রেজিস্ট্রি করবেন না।`,
          owner.concat([
            row('Answer', 'উত্তর', 'No, this is not me', 'না, এটা আমি নই'),
            row('Answered at', 'উত্তরের সময়', f.dateTime(req.ownerRespondedAt, 'en'), f.dateTime(req.ownerRespondedAt, 'bn')),
            row('Next step', 'পরবর্তী পদক্ষেপ', 'Keep the documents and refer the presenter to police.', 'কাগজপত্র রেখে দিন এবং উপস্থাপনকারীকে পুলিশের কাছে পাঠান।'),
          ]));
      } else if (new Date(ends) <= now) {
        add('C8', 'warn', "The 48 hour notice ended with no answer. Take the owner's fingerprint at the counter before registering.", '৪৮ ঘণ্টার নোটিশ শেষ, মালিক কোনো উত্তর দেননি। রেজিস্ট্রির আগে কাউন্টারে মালিকের আঙুলের ছাপ নিন।',
          owner.concat([row('Notice sent to', 'নোটিশ পাঠানো হয়েছে', lock.maskedPhone), row('Notice ended', 'নোটিশ শেষ', f.dateTime(ends, 'en'), f.dateTime(ends, 'bn'))]));
      } else {
        add('C8', 'hold', `Owner lock is on. The owner was alerted at ${lock.maskedPhone}. Held until he answers, or for 48 hours.`, `মালিকের লক চালু। মালিককে ${lock.maskedPhone} নম্বরে জানানো হয়েছে। তিনি উত্তর না দেওয়া পর্যন্ত, সর্বোচ্চ ৪৮ ঘণ্টা, দলিল আটকে থাকবে।`,
          owner.concat([
            row('Lock set on', 'লক চালু হয়েছে', f.date(lock.since, 'en'), f.date(lock.since, 'bn')),
            row('Notice sent to', 'নোটিশ পাঠানো হয়েছে', lock.maskedPhone),
            row('Notice ends', 'নোটিশ শেষ হবে', f.dateTime(ends, 'en'), f.dateTime(ends, 'bn')),
          ]), { noticeEndsAt: ends });
      }
    }

    // C9 Encumbrance oracle (addition 2).
    if (!oracle) {
      notRun('C9', 'the oracle was not reached.', 'ওরাকলের সাথে যোগাযোগ হয়নি।');
    } else if (!oracle.sigValid) {
      add('C9', 'block', 'The oracle reply failed its signature check. Treat it as unknown.', 'ওরাকলের উত্তরের স্বাক্ষর মেলেনি। এটিকে অজানা ধরুন।');
    } else if (oracle.reply.charge) {
      const r = oracle.reply;
      add('C9', 'block', `Live bank charge since ${f.date(r.since, 'en')}. The lender's NOC is needed first.`, `${f.date(r.since, 'bn')} থেকে ব্যাংকের দায় চলমান। আগে ঋণদাতার অনাপত্তিপত্র (এনওসি) লাগবে।`, [
        row('Charge', 'দায়', 'Yes', 'আছে'),
        row('Since', 'শুরু', f.date(r.since, 'en'), f.date(r.since, 'bn')),
        row('Lender', 'ঋণদাতা', r.lender, r.lenderBn),
        row('Signed by', 'স্বাক্ষর', 'CIB oracle key ' + oracle.keyId, 'সিআইবি ওরাকল কী ' + oracle.keyId),
        row('Signature', 'স্বাক্ষর যাচাই', 'Valid', 'সঠিক'),
      ]);
    } else {
      add('C9', 'pass', 'No live bank charge. Signed reply from the CIB oracle.', 'ব্যাংকের কোনো চলমান দায় নেই। সিআইবি ওরাকলের স্বাক্ষরিত উত্তর।', [
        row('Charge', 'দায়', 'No', 'নেই'),
        row('Signed by', 'স্বাক্ষর', 'CIB oracle key ' + oracle.keyId, 'সিআইবি ওরাকল কী ' + oracle.keyId),
        row('Signature', 'স্বাক্ষর যাচাই', 'Valid', 'সঠিক'),
      ]);
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

  Dag.engine = { evaluate, CHECKS, RANK, NOTICE_MS, SURVEY_BN };
})(typeof window !== 'undefined' ? window : globalThis);
