/*
 * The phone app. One demo account holds five roles:
 *   Counter (sub-registrar), Mouza (map, check before you buy),
 *   My land (owner), AC Land (namjari, reconciliation), Bank (loan desk, verify).
 * State lives in S. Every change goes: action -> API call -> update S -> render().
 * The guide and its autoplay drive the app through window.DagApp (bottom).
 */
(function () {
  'use strict';
  const Dag = window.Dag;
  const api = Dag.api;
  const I = Dag.icons;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f2 = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
  const tk = (n) => Number(n).toLocaleString('en-IN');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const ago = (iso) => {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return day(iso);
  };
  const SUGGESTED_NOTE = 'Buyer shown the LD tax arrears and the missing RS link. Both accepted in writing. Survey office informed.';

  // ---------- progress events for the guide ----------
  const EV_KEY = 'dag-demo-events';
  const events = new Set();
  const evListeners = new Set();
  try { JSON.parse(localStorage.getItem(EV_KEY) || '[]').forEach((e) => events.add(e)); } catch (e) { /* none */ }
  function emit(name) {
    if (!name || events.has(name)) return;
    events.add(name);
    try { localStorage.setItem(EV_KEY, JSON.stringify([...events])); } catch (e) { /* ignore */ }
    evListeners.forEach((fn) => fn(name));
  }
  function clearEvents() {
    events.clear();
    try { localStorage.removeItem(EV_KEY); } catch (e) { /* ignore */ }
    evListeners.forEach((fn) => fn('reset'));
  }

  // ---------- state ----------
  const blankForm = () => ({ dag: '', share: '', sellerNid: '', sellerName: '', buyerNid: '', buyerName: '' });
  const blankLoan = () => ({ dag: '', borrowerNid: '', borrowerName: '', amount: '' });
  const S = {
    user: null, tab: 'counter', office: null, mouza: null, presets: [],
    form: blankForm(), presetId: null, resultPreset: null, busy: false, result: null, fresh: false, open: new Set(), note: '', error: null,
    dags: [], alerts: [], unread: 0,
    cases: [], recon: null,
    map: null, selDag: null, mapCharge: {},
    loan: { desk: null, presets: [], charges: [], form: blankLoan(), presetId: null, check: null, reg: null, busy: false, error: null },
    verifyList: [], verify: null, tamper: null, oracleLog: [], audit: null,
    loginError: null, loginPhone: '', loginBusy: false, autofilling: false,
  };

  // ---------- small UI helpers ----------
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = 'toast'), 3200);
  }
  function scrollInPhone(el, offset) {
    const c = $('#content');
    if (!c || !el || !c.contains(el)) return;
    const top = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - (offset == null ? 12 : offset);
    c.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  function highlight(sel) {
    const el = $(sel);
    if (!el) return false;
    scrollInPhone(el, 90);
    el.classList.remove('pulse');
    void el.getBoundingClientRect();
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 3400);
    return true;
  }
  let pushTimer = null;
  function showPush(a) {
    const el = $('#push');
    el.innerHTML = `<div class="push-card lv-${esc(a.level)}" id="push-card">
      <div class="push-app">${I.logo}<span>Dag SMS &middot; now</span></div>
      <b class="bn">${esc(a.titleBn || a.title)}</b><p class="bn">${esc(a.textBn || a.text)}</p><p class="en">${esc(a.text)}</p></div>`;
    el.classList.add('show');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => el.classList.remove('show'), a.level === 'action' ? 14000 : 7000);
  }
  function hidePush() { $('#push').classList.remove('show'); }
  function handleAlerts(sent) {
    if (!S.user || !sent || !sent.length) return;
    const mine = sent.filter((a) => a.toPersonId === S.user.personId);
    if (!mine.length) return;
    const order = { action: 0, danger: 1, success: 2, info: 3 };
    mine.sort((a, b) => order[a.level] - order[b.level]);
    setTimeout(() => showPush(mine[0]), 450);
  }
  function qrSvg(text) {
    try {
      const q = window.qrcode(0, 'M');
      q.addData(text);
      q.make();
      return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    } catch (e) {
      return '';
    }
  }

  // ---------- render ----------
  function render() {
    const view = $('#view');
    const prev = $('#content');
    const keep = prev && prev.dataset.tab === S.tab ? prev.scrollTop : 0;
    view.innerHTML = S.user ? shell() : loginView();
    const c = $('#content');
    if (c) c.scrollTop = keep;
    S.fresh = false;
  }

  function loginView() {
    return `<div class="login">
      <div class="lg-hero">
        <div class="mark">${I.logo}</div>
        <h1>দাগ<span>Dag</span></h1>
        <p>Land clearance before the deed is signed.</p>
      </div>
      <form class="lg-form" data-form="login" autocomplete="on">
        <label class="fld"><span>Phone number</span><input id="lg-phone" name="phone" inputmode="tel" autocomplete="username" placeholder="01XXXXXXXXX" value="${esc(S.loginPhone)}"></label>
        <label class="fld"><span>Password</span><input id="lg-pass" name="password" type="password" autocomplete="current-password" placeholder="Password"></label>
        ${S.loginError ? `<div class="lg-err">${esc(S.loginError)}</div>` : ''}
        <button class="btn primary block" id="login-btn" type="submit" ${S.loginBusy ? 'disabled' : ''}>${S.loginBusy ? '<span class="spin"></span>Logging in' : 'Log in'}</button>
        <div class="lg-or">or</div>
        <button class="btn ghost block" id="demo-login" type="button" data-action="demo-login">${I.key}Use demo account</button>
      </form>
      <p class="lg-foot">Demo build for LandTech 2026. Every record, name and NID in this app is invented.</p>
    </div>`;
  }

  const TABS = [
    ['counter', 'Counter', 'counter'],
    ['mouza', 'Mouza', 'map'],
    ['land', 'My land', 'land'],
    ['acland', 'AC Land', 'folder'],
    ['bank', 'Bank', 'bank'],
  ];
  const TITLES = {
    counter: () => ['Clearance counter', `${S.office ? S.office.name : ''}, ${S.office ? S.office.counter : ''}`],
    mouza: () => ['Mouza map', 'Shapla Nagar, JL 112: check before you buy'],
    land: () => ['My land', 'Owner Lock and SMS alerts'],
    acland: () => ['AC Land', 'Namjari queue and record health'],
    bank: () => ['Bank', 'Loan desk, verify, oracle, audit'],
  };
  function shell() {
    const t = TITLES[S.tab]();
    return `<header class="appbar">
        <div class="ab-l"><div class="ab-title">${esc(t[0])}</div><div class="ab-sub">${esc(t[1])}</div></div>
        <button class="ab-btn" id="bell" data-action="bell" aria-label="Alerts">${I.bell}${S.unread ? `<span class="badge">${S.unread}</span>` : ''}</button>
        <button class="ab-btn" data-action="logout" aria-label="Log out" title="Log out">${I.logout}</button>
      </header>
      <main class="content" id="content" data-tab="${S.tab}">${VIEWS[S.tab]()}</main>
      <nav class="tabbar">${TABS.map(([id, label, ic]) => `<button class="tab${S.tab === id ? ' on' : ''}" id="tab-${id}" data-action="tab" data-tab="${id}">${I[ic]}<span>${label}</span>${id === 'land' && S.unread ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>`;
  }

  // ---------- counter ----------
  const field = (k, label, mode) =>
    `<label class="fld"><span>${label}</span><input data-field="${k}" id="f-${k}" value="${esc(S.form[k])}"${mode ? ` inputmode="${mode}"` : ''} autocomplete="off"></label>`;

  function counterView() {
    return `<div class="strip"><span class="live"></span><b>${esc(S.office.name)}</b><span class="r">${esc(S.office.counter)}</span></div>
      <div class="blk"><div class="blk-h">Scenarios <span>tap one to fill the form</span></div>
        <div class="chips">${S.presets.map((p) => `<button class="chip${S.presetId === p.id ? ' on' : ''}" id="preset-${p.id}" data-action="preset" data-id="${p.id}"><b>${p.id}</b>${esc(p.title)}</button>`).join('')}</div>
      </div>
      <form class="card form" data-form="clearance" novalidate>
        <div class="grid2">
          <div class="mouza"><span>Mouza <b>${esc(S.mouza.name)}</b>, JL ${esc(S.mouza.jl)}</span><span>${esc(S.mouza.upazila)}, ${esc(S.mouza.district)}</span></div>
          ${field('dag', 'Dag no.', 'numeric')}
          ${field('share', 'Share (decimals)', 'decimal')}
          ${field('sellerNid', 'Seller NID', 'numeric')}
          ${field('sellerName', 'Seller name')}
          ${field('buyerNid', 'Buyer NID', 'numeric')}
          ${field('buyerName', 'Buyer name')}
        </div>
        <button class="btn primary block" id="run-btn" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? '<span class="spin"></span>Running 9 checks' : I.shield + 'Run clearance checks'}</button>
      </form>
      ${S.error ? `<div class="err-box">${esc(S.error)}</div>` : ''}
      ${S.result ? resultView(S.result) : `<div class="card hint"><b>Pick a scenario, then run the checks.</b><p>The gate runs all nine checks every time and lists every reason, not only the first one it finds.</p></div>`}`;
  }

  const VIC = { pass: I.check, warn: I.alert, hold: I.clock, block: I.x, na: I.dash };
  const PL = { pass: 'Pass', warn: 'Warn', hold: 'Held', block: 'Block', na: 'Not run' };
  const VERDICT = {
    pass: ['PASS', 'Clear to register', I.check],
    warn: ['WARN', 'Officer must record a reason', I.alert],
    hold: ['HELD', 'Waiting for the owner to answer', I.clock],
    block: ['BLOCK', 'Do not register this deed', I.x],
  };

  function resultView(r) {
    const v = VERDICT[r.verdict];
    const c = r.counts;
    const counts = `${c.pass} pass &middot; ${c.warn} warn &middot; ${c.hold} held &middot; ${c.block} block${c.na ? ` &middot; ${c.na} not run` : ''}`;
    return `<section class="verdict v-${r.verdict}" id="verdict">
        <div class="v-ic">${v[2]}</div>
        <div class="v-main"><div class="v-row"><span class="v-label">${v[0]}</span><span class="v-id">${esc(r.id)}</span></div>
        <div class="v-sub">${v[1]}</div><div class="v-counts">${counts}</div></div>
      </section>
      <ul class="checks${S.fresh ? ' fresh' : ''}">${r.checks.map(checkRow).join('')}</ul>
      ${actionsView(r)}`;
  }

  function checkRow(k, i) {
    const open = S.open.has(k.code);
    return `<li class="chk k-${k.verdict}${k.addition ? ' add' : ''}" style="--i:${i}" id="chk-${k.code}">
      <button class="chk-h" data-action="toggle" data-code="${k.code}" aria-expanded="${open}">
        <span class="chk-ic">${VIC[k.verdict]}</span>
        <span class="chk-t"><span class="chk-n"><code>${k.code}</code>${esc(k.name)}${k.addition ? '<em>new</em>' : ''}</span><span class="chk-s">${esc(k.summary)}</span></span>
        <span class="pill p-${k.verdict}">${PL[k.verdict]}</span>
      </button>${open ? evidenceView(k) : ''}</li>`;
  }

  function evidenceView(k) {
    let h = '<div class="chk-b">';
    if (k.math) {
      const m = k.math;
      h += `<div class="math">
        <div><span>Recorded area of dag</span><b>${f2(m.area)}</b></div>
        ${m.over ? `<div class="short"><span>All holders on record</span><b>${f2(m.totalHeld)}</b></div>` : ''}
        <div><span>Seller holds</span><b>${f2(m.holds)}</b></div>
        <div><span>Sold, not yet mutated</span><b>&minus; ${f2(m.pendingOut)}</b></div>
        <div class="tot"><span>Available to sell</span><b>${f2(m.available)}</b></div>
        <div><span>Requested</span><b>${f2(m.requested)}</b></div>
        ${m.short > 0 && !m.over ? `<div class="short"><span>Short by</span><b>${f2(m.short)}</b></div>` : ''}
        <small>All figures in decimals</small></div>`;
    }
    const ev = Object.entries(k.evidence || {});
    if (ev.length) h += `<dl class="kv">${ev.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;
    if (!k.math && !ev.length) h += '<p class="muted" style="margin:0;font-size:12px">Nothing else to show for this check.</p>';
    return h + '</div>';
  }

  function clearanceCard(c) {
    if (!c) return '';
    const p = c.payload;
    const qr = qrSvg(`DAG CLEARANCE ${c.id} ${p.mouza} DAG ${p.dag} SIG ${c.signature.slice(0, 32)}`);
    const w = p.warnings.length;
    return `<section class="card clr" id="clr-card">
      <div class="clr-qr">${qr}</div>
      <div class="clr-m"><span class="eyebrow">Signed clearance</span><b>${esc(c.id)}</b>
        <span>Dag ${esc(p.dag)} &middot; ${f2(p.share)} dec &middot; to ${esc(p.buyer.name)}</span>
        <span>Valid until ${clock(c.validUntil)}, ${day(c.validUntil)}</span>
        ${w ? `<span class="warnline">${w} warning${w > 1 ? 's' : ''} printed on it</span>` : ''}
        <code>Ed25519 ${esc(c.signature.slice(0, 26))}...</code>
        <span class="clr-links"><button class="link" id="cert-btn" data-action="cert" data-id="${esc(c.id)}">${I.doc}Certificate</button><button class="link" data-action="verify-open" data-id="${esc(c.id)}">${I.shield}Verify</button></span>
      </div></section>`;
  }

  function actionsView(r) {
    if (r.status === 'cleared') {
      return clearanceCard(r.clearance) +
        `<button class="btn primary block" id="exec-btn" data-action="execute">${I.stamp}Execute deed</button>
         <p class="fine">Executing registers the deed. The namjari case then opens at AC Land on its own.</p>`;
    }
    if (r.status === 'executed') {
      return clearanceCard(r.clearance) +
        `<section class="card done" id="done-card"><div class="done-h">${I.check}Deed registered</div>
          <dl class="kv"><dt>Deed</dt><dd>${esc(r.deedId)}</dd><dt>Namjari case</dt><dd>${esc(r.caseId)}, opened automatically</dd><dt>Citizen application</dt><dd>None needed</dd></dl>
          <button class="btn ghost block" id="goto-acland" data-action="tab" data-tab="acland">Open AC Land queue ${I.arrow}</button></section>`;
    }
    if (r.status === 'warn') {
      return `<section class="card note-card"><label class="fld"><span>Officer's note, printed on the clearance</span><textarea id="note" rows="3">${esc(S.note)}</textarea></label>
        <button class="btn warn block" id="proceed-btn" data-action="proceed">${I.alert}Proceed with note</button></section>`;
    }
    if (r.status === 'hold') {
      return `<section class="card hold-card" id="hold-card"><div class="hold-h">${I.lock}Owner Lock: 48 hour notice</div>
        <p>The owner was told by SMS. This deed waits for his answer. To answer as the owner, tap the message that just arrived, or the bell at the top.</p>
        <button class="btn ghost block" data-action="refresh-req">Check status again</button></section>`;
    }
    if (r.status === 'blocked') {
      const reasons = r.checks.filter((c) => c.verdict === 'block');
      return `<section class="card block-card" id="block-card"><div class="blk-h2">${I.x}Why this deed stops here</div>
        <ol class="reasons">${reasons.map((c) => `<li><code>${c.code}</code> ${esc(c.summary)}</li>`).join('')}</ol>
        ${r.appeal ? `<div class="appeal"><b>Appeal ${esc(r.appeal.id)}</b>To ${esc(r.appeal.to)}<p>${esc(r.appeal.note)}</p></div>` : ''}</section>`;
    }
    return '';
  }

  // ---------- mouza map ----------
  const ST = {
    clear: { fill: '#e6f3ea', line: '#1d6b3f', label: 'Clear' },
    care: { fill: '#fcf1df', line: '#8a5a12', label: 'Needs care' },
    locked: { fill: '#e7f0f8', line: '#1f5f8b', label: 'Owner locked' },
    restricted: { fill: '#fbeaea', line: '#9b2c2c', label: 'Restricted' },
  };
  const pts = (p) => p.map((q) => q.join(',')).join(' ');
  const centre = (p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

  function mapSvg(m) {
    let s = `<svg class="map" viewBox="0 0 360 300" role="img" aria-label="Map of ${esc(m.mouza.name)} mouza">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#9b2c2c" stroke-width="1.3" opacity=".35"/></pattern></defs>
      <rect width="360" height="300" fill="#f7faf8"/>
      <path d="M0,28 C90,34 170,22 250,28 S330,32 360,26 L360,0 L0,0 Z" fill="#d6e8f1"/>
      <text x="300" y="16" font-size="9" font-style="italic" fill="#4f7d98">Shapla khal</text>`;
    m.fillers.forEach((f) => {
      const [x, y] = centre(f.poly);
      s += `<polygon points="${pts(f.poly)}" fill="#eef2f0" stroke="#c9d2cd" stroke-width="1"/><text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" fill="#a3ada8">${f.no}</text>`;
    });
    m.dags.forEach((d) => {
      const c = ST[d.status];
      const [x, y] = centre(d.poly);
      const sel = S.selDag === d.no;
      s += `<g class="plot${sel ? ' sel' : ''}" id="plot-${d.no}" data-action="pick-dag" data-dag="${d.no}" role="button" tabindex="0" aria-label="Dag ${d.no}, ${c.label}">
        <polygon class="base" points="${pts(d.poly)}" fill="${c.fill}" stroke="${c.line}" stroke-width="${sel ? 3 : 1.6}"/>
        ${d.status === 'restricted' ? `<polygon points="${pts(d.poly)}" fill="url(#hatch)" pointer-events="none"/>` : ''}
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${c.line}">${d.no}</text>
        ${d.status === 'locked' ? `<g transform="translate(${x - 5},${y + 9})" pointer-events="none"><rect x="0" y="4" width="10" height="7" rx="1.5" fill="${c.line}"/><path d="M2.5 4V2.6a2.5 2.5 0 0 1 5 0V4" fill="none" stroke="${c.line}" stroke-width="1.4"/></g>` : ''}
      </g>`;
    });
    s += `<path d="M0,271 L102,281" stroke="#b9c3be" stroke-width="9" fill="none" pointer-events="none"/><path d="M0,271 L102,281" stroke="#fff" stroke-width="1.2" stroke-dasharray="5 4" fill="none" pointer-events="none"/>
      <polygon points="20,46 100,38 182,42 262,36 340,44 344,110 346,170 348,244 344,288 270,292 192,290 100,288 24,288 26,236 22,178 24,114" fill="none" stroke="#0f3d2e" stroke-width="1.2" stroke-dasharray="6 3" opacity=".5" pointer-events="none"/>
      <g transform="translate(14,20)" opacity=".65"><path d="M0,-12 L4,0 L0,-3 L-4,0 Z" fill="#0f3d2e"/><text x="9" y="-2" font-size="8" font-weight="700" fill="#0f3d2e">N</text></g>
    </svg>`;
    return s;
  }

  function mouzaView() {
    const m = S.map;
    if (!m) return '<div class="card empty">Loading the map</div>';
    const sel = S.selDag ? m.dags.find((d) => d.no === S.selDag) : null;
    const counts = {};
    m.dags.forEach((d) => (counts[d.status] = (counts[d.status] || 0) + 1));
    return `<div class="card mapcard">
        <div class="map-h"><b>${esc(m.mouza.name)}</b><span>JL ${esc(m.mouza.jl)} &middot; ${esc(m.mouza.upazila)}, ${esc(m.mouza.district)}</span></div>
        ${mapSvg(m)}
        <div class="legend">${Object.keys(ST).map((k) => `<span><i style="background:${ST[k].fill};border-color:${ST[k].line}"></i>${ST[k].label} ${counts[k] || 0}</span>`).join('')}<span><i class="road"></i>Bypass road</span></div>
      </div>
      ${sel ? dagSheet(sel) : '<div class="card hint"><b>Tap a numbered plot.</b><p>Colours come from the land record. The bank is asked only when you press the button, one dag at a time.</p></div>'}`;
  }

  function dagSheet(d) {
    const c = ST[d.status];
    const ch = S.mapCharge[d.no];
    const chain = ['CS', 'SA', 'RS', 'BS'].map((k) => `<span class="${d.survey[k] ? '' : 'miss'}"><small>${k}</small>${d.survey[k] ? esc(d.survey[k]) : 'none'}</span>`).join('<i>&rsaquo;</i>');
    const chargeHtml = ch
      ? `<div class="charge ${ch.charge ? 'yes' : 'no'}" id="charge-${d.no}">${ch.charge ? I.x : I.check}<div><b>${ch.charge ? 'Live bank charge' : 'No live bank charge'}</b><span>${ch.charge ? `Since ${day(ch.since)}, ${esc(ch.lender)}. ` : ''}Signed reply, signature ${ch.signatureValid ? 'valid' : 'INVALID'}. Key ${esc(ch.keyId)}.</span></div></div>`
      : `<button class="btn ghost block small" id="ask-bank-btn" data-action="ask-bank" data-dag="${d.no}">${I.bank}Ask the bank oracle (one signed yes/no)</button>`;
    return `<section class="card sheet" id="sheet-${d.no}">
      <div class="sh-h"><div><span class="eyebrow">Dag ${esc(d.no)}</span><b>${f2(d.area)} dec &middot; ${esc(d.landClass)}</b></div><span class="pill" style="background:${c.fill};color:${c.line}">${c.label}</span></div>
      ${d.reasons.length ? `<ul class="why">${d.reasons.map((r) => `<li class="lv-${r.level}">${esc(r.text)}</li>`).join('')}</ul>` : '<p class="ok-line">Nothing on record stands in the way of a sale.</p>'}
      <h5>Holders on record</h5>
      <div class="holders">${d.holders.map((h) => `<div><span>${esc(h.name)}<small>${esc(h.khatian)}${h.mutated ? '' : ' &middot; no namjari'}</small></span><b>${f2(h.share)}</b></div>`).join('')}${d.pending > 0 ? `<div class="pend"><span>Sold, namjari pending</span><b>${f2(d.pending)}</b></div>` : ''}</div>
      <h5>Survey chain</h5><div class="schain">${chain}</div>
      <h5>Bank charge</h5>${chargeHtml}
      <button class="btn primary block small" style="margin-top:12px" id="use-dag-btn" data-action="use-dag" data-dag="${d.no}">${I.counter}Use this dag at the counter</button>
    </section>`;
  }

  // ---------- my land ----------
  function landView() {
    const action = S.alerts.filter((a) => a.actionRequired && !a.response);
    const rest = S.alerts.filter((a) => !(a.actionRequired && !a.response));
    const initials = S.user.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
    return `<div class="card owner"><div class="avatar">${esc(initials)}</div><div class="who"><b>${esc(S.user.name)}</b><span>${esc(S.user.phone)} &middot; fictional owner</span></div><span class="pill p-info">${S.dags.length} dag${S.dags.length === 1 ? '' : 's'}</span></div>
      ${action.length ? `<div class="blk"><div class="blk-h danger">Needs your answer</div>${action.map(alertCard).join('')}</div>` : ''}
      <div class="blk"><div class="blk-h">Your dags <span>SMS alerts on for all</span></div>${S.dags.map(dagCard).join('') || '<div class="card empty">You hold no dags now.</div>'}</div>
      <div class="blk"><div class="blk-h">SMS inbox ${rest.length ? '' : '<span>none yet</span>'}</div>${rest.map(alertCard).join('') || '<div class="card empty"><b>No messages yet</b>Run a scenario on dag 412 or 418 and the SMS lands here.</div>'}</div>`;
  }

  function alertCard(a) {
    const ic = a.level === 'action' ? I.lock : a.level === 'danger' ? I.x : a.level === 'success' ? I.check : I.bell;
    let tail = '';
    if (a.actionRequired && !a.response) {
      tail = `<div class="a-btns"><button class="btn small ok" id="respond-me-${a.id}" data-action="respond" data-id="${a.id}" data-answer="me">Yes, it is me</button><button class="btn small danger" id="respond-no-${a.id}" data-action="respond" data-id="${a.id}" data-answer="not_me">No, not me</button></div>`;
    } else if (a.response) {
      const yes = a.response === 'me';
      const what = a.kind === 'mortgage' ? (yes ? 'The mortgage was registered.' : 'The mortgage was refused.') : yes ? 'The deed can go ahead.' : 'The deed was stopped.';
      tail = `<div class="a-ans" style="color:var(--${yes ? 'pass' : 'block'})">You answered: ${yes ? 'yes, it is me' : 'not me'}. ${what}</div>`;
    }
    return `<div class="alert lv-${a.level}${a.read ? '' : ' unread'}" id="alert-${a.id}"><div class="a-ic">${ic}</div><div class="a-b">
      <div class="a-t"><span class="bn">${esc(a.titleBn || a.title)}</span><small>${ago(a.at)}</small></div>
      <p class="bn">${esc(a.textBn || a.text)}</p><p class="en">${esc(a.text)}</p>${tail}</div></div>`;
  }

  function dagCard(d) {
    const live = (d.mortgages || []).filter((m) => m.status !== 'refused');
    return `<div class="card dagc${d.locked ? ' locked' : ''}" id="dag-${d.dag}">
      <div class="dh"><div><b>Dag ${esc(d.dag)}</b><span>${esc(d.mouza)} &middot; ${esc(d.landClass)}</span></div><span class="lockchip">${d.locked ? I.lock + 'Locked' : I.unlock + 'Unlocked'}</span></div>
      <div class="dstats"><div><small>Dag area</small><b>${f2(d.area)}</b></div><div><small>Your share</small><b>${f2(d.share)}</b></div><div><small>Sold, pending</small><b>${f2(d.pendingOut)}</b></div></div>
      <div class="srow"><div class="st"><b>Owner Lock</b><small>Any deed or mortgage on this dag waits for your answer, up to 48 h.</small></div>
        <button class="switch${d.locked ? ' on' : ''}" id="lock-${d.dag}" role="switch" aria-checked="${d.locked}" aria-label="Owner Lock for dag ${esc(d.dag)}" data-action="lock" data-dag="${esc(d.dag)}" data-on="${!d.locked}"><i></i></button></div>
      ${d.transfers.length ? `<div class="tlist">${d.transfers.map((t) => `<div><span>${esc(t.id)} &middot; ${f2(t.share)} to ${esc(t.to)}</span><b>${t.status === 'mutated' ? 'mutated' : 'awaiting namjari'}</b></div>`).join('')}</div>` : ''}
      ${live.length ? `<div class="tlist">${live.map((m) => `<div><span>Mortgage &middot; ${esc(m.lender)} &middot; Tk ${tk(m.amount)}</span><b>${m.status === 'held' ? 'waiting for you' : 'live'}</b></div>`).join('')}</div>` : ''}
      <div class="tlist"><div><span>Khatian</span><b>${esc(d.khatian)}</b></div></div>
    </div>`;
  }

  // ---------- AC Land ----------
  function aclandView() {
    const approved = S.cases.filter((c) => c.status === 'approved').length;
    const r = S.recon;
    let h = `<div class="stats"><div class="stat"><b>${S.cases.length}</b><span>Opened by registration</span></div><div class="stat"><b>0</b><span>Citizen applications needed</span></div><div class="stat"><b>${approved}</b><span>Khatians corrected</span></div></div>
      <div class="blk"><div class="blk-h">Namjari queue</div>
      ${S.cases.length ? S.cases.map(caseCard).join('') : '<div class="card empty"><b>No cases yet</b>Execute a cleared deed on the Counter tab. The namjari case appears here by itself.</div>'}</div>`;
    if (r) {
      h += `<div class="blk"><div class="blk-h">Record health <span>${esc(r.mouza)}</span></div>
        <div class="card recon" id="recon-card">
          <div class="recon-top"><div><b>${r.dagsChecked}</b><span>dags scanned</span></div><div class="bad"><b>${r.overAllocated}</b><span>sold more than exists</span></div><div><b>${r.issues.length}</b><span>issues found</span></div></div>
          <ul class="why">${r.issues.map((i) => `<li class="lv-${i.level}"><b>Dag ${esc(i.dag)}</b> ${esc(i.text)}</li>`).join('')}</ul>
          <p class="fine" style="text-align:left;margin:8px 0 0">This scan runs when a mouza is onboarded. It finds land that was already over-sold before Dag existed, so AC Land has a worklist on day one.</p>
        </div></div>`;
    }
    return h;
  }
  function caseCard(k) {
    return `<div class="card" id="case-${k.id}">
      <div class="case-h"><b>${esc(k.id)}</b><span class="pill ${k.status === 'approved' ? 'p-pass' : 'p-hold'}">${k.status === 'approved' ? 'Approved' : 'Opened'}</span></div>
      <div class="case-p">Dag ${esc(k.dag)} &middot; <b>${f2(k.share)} dec</b><br><span>From</span> ${esc(k.fromName)} <span>to</span> ${esc(k.toName)}<br><span>Deed</span> ${esc(k.deedId)} &middot; <span>${esc(k.openedBy)}</span></div>
      <ul class="tl">${k.timeline.map((t) => `<li><small>${clock(t.at)}</small>${esc(t.text)}</li>`).join('')}</ul>
      ${k.status === 'opened' ? `<button class="btn primary block approve-btn" id="approve-${k.id}" data-action="approve" data-id="${k.id}">${I.check}Approve and correct khatian</button>` : ''}
    </div>`;
  }

  // ---------- bank ----------
  const lfield = (k, label, mode) =>
    `<label class="fld"><span>${label}</span><input data-lfield="${k}" id="l-${k}" value="${esc(S.loan.form[k])}"${mode ? ` inputmode="${mode}"` : ''} autocomplete="off"></label>`;

  function bankView() {
    const L = S.loan;
    let h = '';
    if (L.desk) {
      h += `<div class="strip"><span class="live"></span><b>${esc(L.desk.lender)}</b><span class="r">${esc(L.desk.branch)}</span></div>
        <div class="blk"><div class="blk-h">Loan desk <span>check land before lending</span></div>
        <div class="chips">${L.presets.map((p) => `<button class="chip${L.presetId === p.id ? ' on' : ''}" id="loan-preset-${p.id}" data-action="loan-preset" data-id="${p.id}"><b>L${p.id}</b>${esc(p.title)}</button>`).join('')}</div></div>
        <div class="card form"><div class="grid2">${lfield('dag', 'Dag no.', 'numeric')}${lfield('amount', 'Loan (Tk)', 'numeric')}${lfield('borrowerNid', 'Borrower NID', 'numeric')}${lfield('borrowerName', 'Borrower name')}</div>
        <button class="btn primary block" id="loan-check-btn" data-action="loan-check"${L.busy ? ' disabled' : ''}>${L.busy ? '<span class="spin"></span>Asking the oracle' : I.shield + 'Check collateral'}</button></div>
        ${L.error ? `<div class="err-box">${esc(L.error)}</div>` : ''}
        ${L.check ? loanCheckView(L.check) : ''}
        ${L.reg ? loanRegView(L.reg) : ''}`;
      if (L.charges.length) {
        h += `<div class="blk"><div class="blk-h">Mortgages this bank registered</div><div class="card vlist">${L.charges.map((c) => `<div class="vrow static"><span class="vt"><b>${esc(c.id)}</b><small>Dag ${esc(c.dag)} &middot; ${esc(c.borrower)} &middot; Tk ${tk(c.amount)}</small></span><span class="pill ${c.status === 'live' ? 'p-pass' : c.status === 'held' ? 'p-hold' : 'p-block'}">${c.status === 'held' ? 'waiting' : esc(c.status)}</span></div>`).join('')}</div></div>`;
      }
    }
    h += verifyView();
    return h;
  }

  function loanCheckView(c) {
    const o = c.oracle;
    const sig = `<div class="oracle-line">${I.shield}<span>Signed CIB reply: charge <b>${o.charge ? 'YES' : 'no'}</b>${o.charge ? `, since ${day(o.since)}, ${esc(o.lender)}` : ''}. Signature ${o.signatureValid ? 'valid' : 'INVALID'}, key ${esc(o.keyId)}.</span></div>`;
    if (c.outcome === 'refuse') {
      return `<section class="card block-card" id="loan-result"><div class="blk-h2">${I.x}Do not lend against this dag</div>
        <ol class="reasons">${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>${sig}</section>`;
    }
    return `<section class="card done" id="loan-result"><div class="done-h">${I.check}Collateral is clear</div>
      <dl class="kv"><dt>Borrower</dt><dd>${esc(c.borrower)}</dd><dt>Holds on record</dt><dd>${f2(c.borrowerShare)} dec</dd><dt>Owner Lock</dt><dd>${c.locked ? 'On: the owner will be asked first' : 'Off'}</dd></dl>${sig}
      ${S.loan.reg ? '' : `<button class="btn primary block" style="margin-top:12px" id="loan-reg-btn" data-action="loan-register">${I.stamp}Register mortgage</button>`}</section>`;
  }

  function loanRegView(ch) {
    if (ch.status === 'held') {
      return `<section class="card hold-card" id="loan-reg"><div class="hold-h">${I.lock}Mortgage ${esc(ch.id)} held for the owner</div><p>The owner locked this dag, so his phone was asked first. Nothing is registered until he answers.</p><button class="btn ghost block" data-action="loan-refresh">Check status again</button></section>`;
    }
    if (ch.status === 'refused') {
      return `<section class="card block-card" id="loan-reg"><div class="blk-h2">${I.x}Owner refused mortgage ${esc(ch.id)}</div><p class="muted" style="margin:0;font-size:13px">The owner said this was not him. Nothing was registered.</p></section>`;
    }
    return `<section class="card done" id="loan-reg"><div class="done-h">${I.check}Mortgage ${esc(ch.id)} registered</div><p class="muted" style="margin:0;font-size:13px">The charge is live in the CIB registry. The owner was told by SMS, and any sale of this dag will now stop at C9.</p></section>`;
  }

  function verifyView() {
    const v = S.verify;
    const t = S.tamper;
    const a = S.audit;
    let h = `<div class="blk"><div class="blk-h">Verify a clearance <span>tap one to check its signature</span></div>`;
    h += S.verifyList.length
      ? `<div class="card vlist">${S.verifyList.map((c) => `<button class="vrow" id="vrow-${c.id}" data-action="verify-open" data-id="${c.id}"><span class="vt"><b>${esc(c.id)}</b><small>Dag ${esc(c.dag)} &middot; ${f2(c.share)} dec &middot; ${esc(c.sellerName)} to ${esc(c.buyerName)}</small></span><span class="pill ${c.status === 'executed' ? 'p-pass' : 'p-info'}">${esc(c.status)}</span></button>`).join('')}</div>`
      : '<div class="card empty"><b>No clearances yet</b>Run scenario 1 on the Counter tab first.</div>';
    h += '</div>';
    if (v) {
      h += `<section class="card vres ${v.valid ? 'ok' : 'bad'}" id="verify-card">
        <div class="vres-h"><div class="big">${v.valid ? I.check : I.x}</div><div><b>${v.valid ? 'Signature valid' : 'Signature INVALID'}</b><span>${esc(v.id)} &middot; ${esc(v.algorithm)} &middot; key ${esc(v.keyId)}</span></div></div>
        <dl class="kv"><dt>Office</dt><dd>${esc(v.payload.office)}</dd><dt>Mouza</dt><dd>${esc(v.payload.mouza)}</dd><dt>Dag</dt><dd>${esc(v.payload.dag)}</dd><dt>Seller</dt><dd>${esc(v.payload.seller.name)}</dd><dt>Buyer</dt><dd>${esc(v.payload.buyer.name)}</dd><dt>Share</dt><dd>${f2(v.payload.share)} dec</dd><dt>Warnings</dt><dd>${v.payload.warnings.length || 'none'}</dd><dt>Issued</dt><dd>${clock(v.payload.issuedAt)}, ${day(v.payload.issuedAt)}</dd></dl>
        <div class="sig">${esc(v.signature)}</div>
        <button class="btn ghost block" id="tamper-btn" data-action="tamper">${I.alert}Tamper test: add 2 decimals to the share</button>
      </section>`;
    }
    if (t) {
      h += `<section class="card vres bad" id="tamper-card"><div class="vres-h"><div class="big">${I.x}</div><div><b>Edited copy: INVALID</b><span>Share changed from ${f2(t.changed.from)} to ${f2(t.changed.to)}, same signature</span></div></div>
        <p style="margin:0;font-size:12.5px;color:var(--ink2)">Changing one number on a printed clearance breaks the signature. A bank, AC Land office or buyer checking it would see this.</p></section>`;
    }
    h += `<div class="blk"><div class="blk-h">Bank side &middot; CIB oracle <span>what left the bank</span></div><div class="card olog" id="oracle-log">`;
    h += S.oracleLog.length
      ? S.oracleLog.slice(0, 6).map((o) => `<div class="orow"><div class="oh"><span>Dag ${esc(o.dag)} &middot; charge ${o.answer ? '<span style="color:var(--block)">YES</span>' : 'no'}</span><small class="muted">${clock(o.at)}</small></div><div class="muted">Asked by ${esc(o.askedBy)}</div><div class="tags">${o.disclosed.map((d) => `<span class="out">${esc(d)}</span>`).join('')}${o.withheld.map((d) => `<span class="in">${esc(d)}</span>`).join('')}</div></div>`).join('') + '<p class="muted" style="margin:8px 0 0;font-size:11px">Green: sent out, signed. Struck through: stayed inside the bank.</p>'
      : '<div class="empty" style="padding:8px">The oracle has not been asked anything yet.</div>';
    h += '</div></div>';
    if (a) {
      h += `<div class="blk"><div class="blk-h">Audit chain <span>${a.count} entries</span></div><div class="card" id="audit-card">
        <div class="chain">${a.intact ? `<span class="ok">${I.check}Chain intact</span>` : '<span style="color:var(--block);font-weight:700">Chain broken</span>'}<span class="muted" style="font-family:var(--mono);font-size:11px">head ${esc((a.head || '').slice(0, 16))}...</span></div>
        <div class="alist">${a.entries.slice(0, 7).map((e) => `<div><span>#${e.seq}</span><span>${esc(e.action)}</span><span>${esc(e.hash.slice(0, 8))}</span></div>`).join('')}</div></div></div>`;
    }
    return h;
  }

  const VIEWS = { counter: counterView, mouza: mouzaView, land: landView, acland: aclandView, bank: bankView };

  // ---------- certificate (outside the phone, printable) ----------
  async function openCert(id) {
    const v = await api.get(`/api/verify/${id}`);
    const p = v.payload;
    const qr = qrSvg(`DAG CLEARANCE ${v.id} ${p.mouza} DAG ${p.dag} SIG ${v.signature.slice(0, 32)}`);
    const host = $('#cert');
    host.innerHTML = `<div class="cert" id="cert-doc">
      <div class="cert-top"><div class="cert-brand">${I.logo}<div><b>Dag clearance certificate</b><span>Prototype output, LandTech 2026. Not a government document.</span></div></div>
        <div class="cert-id"><span>Clearance</span><b>${esc(v.id)}</b></div></div>
      <div class="cert-band v-${p.verdict === 'warn' ? 'warn' : 'pass'}">${p.verdict === 'warn' ? 'CLEARED WITH WARNINGS' : 'CLEARED: ALL NINE CHECKS PASSED'}</div>
      <div class="cert-grid">
        <dl class="kv">
          <dt>Office</dt><dd>${esc(p.office)}</dd><dt>Mouza</dt><dd>${esc(p.mouza)}</dd><dt>Dag</dt><dd>${esc(p.dag)}</dd><dt>Share</dt><dd>${f2(p.share)} decimals</dd>
          <dt>Seller</dt><dd>${esc(p.seller.name)}, NID ${esc(p.seller.nid)}</dd><dt>Buyer</dt><dd>${esc(p.buyer.name)}, NID ${esc(p.buyer.nid)}</dd>
          <dt>Issued</dt><dd>${clock(p.issuedAt)}, ${day(p.issuedAt)}</dd><dt>Valid until</dt><dd>${clock(p.validUntil)}, ${day(p.validUntil)}</dd><dt>Request</dt><dd>${esc(p.requestId)}</dd>
        </dl>
        <div class="cert-qr">${qr}<small>Clearance ID and signature</small></div>
      </div>
      ${p.warnings.length ? `<div class="cert-sec"><h4>Warnings recorded</h4><ol>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>${p.officerNote ? `<p><b>Officer's note:</b> ${esc(p.officerNote)}</p>` : ''}</div>` : ''}
      <div class="cert-sec sigbox"><h4>Ed25519 signature &middot; key ${esc(v.keyId)} &middot; ${v.valid ? '<span style="color:var(--pass)">valid</span>' : '<span style="color:var(--block)">INVALID</span>'}</h4><code>${esc(v.signature)}</code>
        <p>Change any field on this page and the signature no longer matches. Anyone can check it on the Bank tab, or with this call:</p><code>GET /api/verify/${esc(v.id)}</code></div>
      <div class="cert-foot">Fictional records &middot; Team Silicon Knights &middot; Daffodil International University</div>
    </div>
    <div class="cert-actions"><button class="btn ghost" data-cert="close">${I.x}Close</button><button class="btn primary" data-cert="print">${I.doc}Print or save as PDF</button></div>`;
    host.hidden = false;
    requestAnimationFrame(() => host.classList.add('show'));
    emit('cert.open');
  }
  function closeCert() {
    const host = $('#cert');
    host.classList.remove('show');
    host.hidden = true;
  }

  // ---------- data ----------
  async function refreshAlerts() {
    const r = await api.get('/api/owner/alerts', { quiet: true });
    S.alerts = r.alerts;
    S.unread = r.unread;
  }
  async function refreshOwner(quiet) {
    const [d, a] = await Promise.all([api.get('/api/owner/dags', { quiet }), api.get('/api/owner/alerts', { quiet })]);
    S.dags = d;
    S.alerts = a.alerts;
    S.unread = a.unread;
  }
  async function refreshDesk(quiet) {
    const d = await api.get('/api/bank/desk', { quiet });
    S.loan.desk = d.desk;
    S.loan.presets = d.presets;
    S.loan.charges = d.charges;
    if (S.loan.reg) S.loan.reg = d.charges.find((c) => c.id === S.loan.reg.id) || S.loan.reg;
  }
  async function boot() {
    const p = await api.get('/api/counter/presets');
    S.presets = p.presets;
    S.office = p.office;
    S.mouza = p.mouza;
    await refreshAlerts();
    render();
  }

  // ---------- actions ----------
  async function doLogin(phone, password) {
    if (S.loginBusy) return;
    S.loginError = null;
    S.loginPhone = phone;
    S.loginBusy = true;
    render();
    try {
      const r = await api.post('/api/auth/login', { phone, password });
      api.setToken(r.token);
      S.user = r.user;
      S.loginBusy = false;
      S.tab = 'counter';
      emit('login');
      await boot();
      toast(`Logged in as ${r.user.name} (demo)`);
    } catch (e) {
      S.loginBusy = false;
      S.loginError = e.message;
      render();
    }
  }

  async function autofill() {
    if (S.user || S.autofilling) return;
    S.autofilling = true;
    S.loginError = null;
    render();
    const ph = $('#lg-phone');
    const pw = $('#lg-pass');
    ph.value = '';
    pw.value = '';
    ph.focus();
    for (const ch of Dag.DEMO.phone) { ph.value += ch; await sleep(42); }
    pw.focus();
    for (const ch of Dag.DEMO.password) { pw.value += ch; await sleep(52); }
    const btn = $('#login-btn');
    if (btn) btn.classList.add('pulse');
    await sleep(380);
    S.autofilling = false;
    await doLogin(ph.value, pw.value);
  }

  async function logout() {
    try { await api.post('/api/auth/logout'); } catch (e) { /* already gone */ }
    api.setToken(null);
    Object.assign(S, { user: null, result: null, presetId: null, form: blankForm(), verify: null, tamper: null, error: null, loginPhone: '', alerts: [], unread: 0 });
    hidePush();
    render();
  }

  async function go(tab) {
    S.tab = tab;
    try {
      if (tab === 'counter' && S.result) {
        const before = S.result.status;
        S.result = await api.get(`/api/counter/requests/${S.result.id}`);
        if (S.result.status !== before) S.open = autoOpen(S.result);
      }
      if (tab === 'mouza') S.map = await api.get('/api/mouza');
      if (tab === 'land') {
        await refreshOwner(false);
        if (S.alerts.some((a) => !a.read)) {
          await api.post('/api/owner/alerts/read-all', {}, { quiet: true });
          S.unread = S.alerts.filter((a) => a.actionRequired && !a.response).length;
        }
      }
      if (tab === 'acland') {
        const [c, r] = await Promise.all([api.get('/api/acland/cases'), api.get('/api/acland/reconciliation')]);
        S.cases = c.cases;
        S.recon = r;
      }
      if (tab === 'bank') {
        const [, l, o, a] = await Promise.all([refreshDesk(false), api.get('/api/verify/clearances'), api.get('/api/oracle/log'), api.get('/api/audit')]);
        S.verifyList = l;
        S.oracleLog = o.log;
        S.audit = a;
      }
      if (tab !== 'land') await refreshAlerts();
    } catch (e) {
      toast(e.message, 'err');
    }
    render();
    const c = $('#content');
    if (c) c.scrollTop = 0;
  }

  function preset(id) {
    const p = S.presets.find((x) => x.id === Number(id));
    if (!p) return;
    S.presetId = p.id;
    S.form = { dag: p.dag, share: String(p.share), sellerNid: p.sellerNid, sellerName: p.sellerName, buyerNid: p.buyerNid, buyerName: p.buyerName };
    S.result = null;
    S.error = null;
    render();
  }

  const autoOpen = (r) => new Set(r.checks.filter((c) => c.verdict === 'block' || c.verdict === 'warn' || c.verdict === 'hold').map((c) => c.code));

  async function run() {
    if (S.busy) return;
    S.busy = true;
    S.error = null;
    S.result = null;
    render();
    let sent = null;
    try {
      const r = await api.post('/api/counter/clearance', S.form);
      S.result = r.request;
      S.resultPreset = S.presetId;
      S.fresh = true;
      S.open = autoOpen(r.request);
      if (r.request.status === 'warn') S.note = SUGGESTED_NOTE;
      if (S.presetId) emit(`s${S.presetId}.${r.request.verdict}`);
      sent = r.alertsSent;
      await refreshAlerts();
    } catch (e) {
      S.error = e.message;
    }
    S.busy = false;
    render();
    scrollInPhone($('#verdict'));
    handleAlerts(sent);
  }

  async function execute() {
    const r = await api.post(`/api/counter/requests/${S.result.id}/execute`);
    S.result = r.request;
    if (S.resultPreset) emit(`s${S.resultPreset}.exec`);
    await refreshAlerts();
    render();
    scrollInPhone($('#done-card'));
    handleAlerts(r.alertsSent);
  }

  async function proceed() {
    const note = ($('#note') ? $('#note').value : S.note).trim();
    S.note = note;
    const r = await api.post(`/api/counter/requests/${S.result.id}/proceed`, { note });
    S.result = r;
    if (S.resultPreset) emit(`s${S.resultPreset}.issued`);
    render();
    scrollInPhone($('#clr-card'));
    toast('Clearance issued with the warnings printed on it.');
  }

  async function refreshReq() {
    const before = S.result.status;
    S.result = await api.get(`/api/counter/requests/${S.result.id}`);
    if (S.result.status !== before) S.open = autoOpen(S.result);
    render();
    if (S.result.status === 'hold') toast('Still waiting for the owner. Answer the SMS on My land.');
  }

  async function respond(id, answer) {
    const r = await api.post(`/api/owner/alerts/${id}/respond`, { answer });
    if (r.request && S.result && S.result.id === r.request.id) {
      S.result = r.request;
      S.open = autoOpen(r.request);
    }
    if (r.charge) {
      if (S.loan.reg && S.loan.reg.id === r.charge.id) S.loan.reg = r.charge;
      emit(answer === 'not_me' ? 'mortgage.not_me' : 'mortgage.me');
      toast(answer === 'not_me' ? 'Mortgage refused. Nothing was registered.' : 'Confirmed. The mortgage is now live.');
    } else {
      emit(answer === 'not_me' ? 'owner.not_me' : 'owner.me');
      toast(answer === 'not_me' ? 'Deed stopped. The counter now shows BLOCK.' : 'Confirmed. The counter can go ahead.');
    }
    await refreshOwner(true);
    render();
  }

  async function respondLatest(answer) {
    await refreshOwner(true);
    const a = S.alerts.find((x) => x.actionRequired && !x.response);
    if (!a) return false;
    render();
    highlight(`#respond-${answer === 'me' ? 'me' : 'no'}-${a.id}`);
    await sleep(700);
    await respond(a.id, answer);
    return true;
  }

  async function setLock(dag, on) {
    await api.post(`/api/owner/dags/${dag}/lock`, { on });
    await refreshOwner(true);
    render();
    toast(on ? `Dag ${dag} locked. Deeds and mortgages on it now wait for you.` : `Dag ${dag} unlocked. You still get SMS alerts.`);
  }

  async function approve(id) {
    const r = await api.post(`/api/acland/cases/${id}/approve`);
    const [c, rec] = await Promise.all([api.get('/api/acland/cases', { quiet: true }), api.get('/api/acland/reconciliation', { quiet: true })]);
    S.cases = c.cases;
    S.recon = rec;
    emit('acland.approve');
    await refreshAlerts();
    render();
    toast(`Khatian ${r.case.newKhatian} opened.`);
    handleAlerts(r.alertsSent);
  }

  async function pickDag(no) {
    if (!S.map) S.map = await api.get('/api/mouza');
    S.selDag = S.selDag === no ? null : no;
    render();
    if (S.selDag) {
      emit('mouza.pick');
      scrollInPhone($(`#sheet-${no}`), 8);
    }
  }

  async function askBank(no) {
    const r = await api.post(`/api/mouza/${no}/charge`);
    S.mapCharge[no] = r;
    emit('mouza.ask');
    render();
    scrollInPhone($(`#charge-${no}`), 120);
  }

  function useDag(no) {
    const d = S.map && S.map.dags.find((x) => x.no === no);
    if (!d) return;
    const h = d.holders[0] || { nid: '', name: '' };
    S.presetId = null;
    S.form = { dag: d.no, share: '', sellerNid: h.nid, sellerName: h.name, buyerNid: '', buyerName: '' };
    S.result = null;
    S.error = null;
    go('counter').then(() => {
      toast(`Dag ${no} loaded. Add the buyer and the share.`);
      highlight('#f-share');
    });
  }

  function loanPreset(id) {
    const p = S.loan.presets.find((x) => x.id === Number(id));
    if (!p) return;
    S.loan.presetId = p.id;
    S.loan.form = { dag: p.dag, borrowerNid: p.borrowerNid, borrowerName: p.borrowerName, amount: String(p.amount) };
    S.loan.check = null;
    S.loan.reg = null;
    S.loan.error = null;
    render();
  }

  async function loanCheck() {
    const L = S.loan;
    if (L.busy) return;
    L.busy = true;
    L.error = null;
    L.check = null;
    L.reg = null;
    render();
    try {
      L.check = await api.post('/api/bank/check', L.form);
      if (L.presetId) emit(`loan${L.presetId}.${L.check.outcome}`);
      const o = await api.get('/api/oracle/log', { quiet: true });
      S.oracleLog = o.log;
    } catch (e) {
      L.error = e.message;
    }
    L.busy = false;
    render();
    scrollInPhone($('#loan-result'), 70);
  }

  async function loanRegister() {
    const L = S.loan;
    const r = await api.post('/api/bank/charges', L.form);
    L.reg = r.charge;
    if (L.presetId) emit(`loan${L.presetId}.${r.charge.status}`);
    await refreshDesk(true);
    await refreshAlerts();
    render();
    scrollInPhone($('#loan-reg'), 70);
    handleAlerts(r.alertsSent);
  }

  async function openVerify(id) {
    if (S.tab !== 'bank') await go('bank');
    S.verify = await api.get(`/api/verify/${id}`);
    S.tamper = null;
    if (S.verify.valid) emit('verify.valid');
    render();
    scrollInPhone($('#verify-card'));
  }

  async function tamper() {
    S.tamper = await api.post(`/api/verify/${S.verify.id}/tamper`);
    emit('verify.tamper');
    render();
    scrollInPhone($('#tamper-card'));
  }

  async function reset() {
    await api.post('/api/demo/reset');
    clearEvents();
    Object.assign(S, {
      result: null, presetId: null, resultPreset: null, form: blankForm(), verify: null, tamper: null, note: '', error: null,
      cases: [], recon: null, map: null, selDag: null, mapCharge: {}, verifyList: [], oracleLog: [], audit: null,
      loan: { desk: null, presets: [], charges: [], form: blankLoan(), presetId: null, check: null, reg: null, busy: false, error: null },
    });
    hidePush();
    closeCert();
    if (S.user) {
      await boot();
      await go('counter');
    } else {
      render();
    }
    toast('Demo reset. Every record is back to the start.');
  }

  // ---------- events ----------
  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    try {
      switch (d.action) {
        case 'demo-login': await autofill(); break;
        case 'logout': await logout(); break;
        case 'tab': await go(d.tab); break;
        case 'bell': await go('land'); break;
        case 'preset': preset(d.id); break;
        case 'toggle':
          if (S.open.has(d.code)) S.open.delete(d.code);
          else S.open.add(d.code);
          render();
          break;
        case 'execute': await execute(); break;
        case 'proceed': await proceed(); break;
        case 'refresh-req': await refreshReq(); break;
        case 'lock': await setLock(d.dag, d.on === 'true'); break;
        case 'respond': await respond(d.id, d.answer); break;
        case 'approve': await approve(d.id); break;
        case 'pick-dag': await pickDag(d.dag); break;
        case 'ask-bank': await askBank(d.dag); break;
        case 'use-dag': useDag(d.dag); break;
        case 'loan-preset': loanPreset(d.id); break;
        case 'loan-check': await loanCheck(); break;
        case 'loan-register': await loanRegister(); break;
        case 'loan-refresh': await refreshDesk(false); render(); break;
        case 'verify-open': await openVerify(d.id); break;
        case 'tamper': await tamper(); break;
        case 'cert': await openCert(d.id); break;
        default: break;
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'login') doLogin($('#lg-phone').value, $('#lg-pass').value);
    if (form.dataset.form === 'clearance') run();
  }

  function onInput(e) {
    const k = e.target.dataset.field;
    if (k) {
      S.form[k] = e.target.value;
      if (S.presetId) {
        S.presetId = null;
        document.querySelectorAll('.chip.on').forEach((c) => c.classList.remove('on'));
      }
    }
    const lk = e.target.dataset.lfield;
    if (lk) {
      S.loan.form[lk] = e.target.value;
      S.loan.presetId = null;
    }
    if (e.target.id === 'note') S.note = e.target.value;
  }

  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.plot')) {
      e.preventDefault();
      pickDag(e.target.dataset.dag);
    }
  }

  function tick() {
    const c = $('#clock');
    if (c) c.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  async function init() {
    tick();
    setInterval(tick, 15000);
    const cap = $('#device-cap');
    if (cap) cap.innerHTML = `Live prototype &middot; fictional records &middot; backend ${api.mode === 'http' ? 'on a Node HTTP server' : 'running in this browser'}`;
    const view = $('#view');
    view.addEventListener('click', onClick);
    view.addEventListener('submit', onSubmit);
    view.addEventListener('input', onInput);
    view.addEventListener('keydown', onKey);
    $('#push').addEventListener('click', () => {
      hidePush();
      if (S.user) go('land');
    });
    $('#cert').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cert]');
      if (b && b.dataset.cert === 'close') closeCert();
      if (b && b.dataset.cert === 'print') window.print();
      if (e.target.id === 'cert') closeCert();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#cert').hidden) closeCert();
    });
    if (api.hasToken()) {
      try {
        S.user = await api.get('/api/me', { quiet: true });
        await boot();
        return;
      } catch (e) {
        api.setToken(null);
      }
    }
    render();
  }

  // ---------- interface for the guide and autoplay ----------
  window.DagApp = {
    go, preset, highlight, autofill, reset, toast,
    run, execute, proceed, respondLatest, approve, pickDag, askBank,
    loanPreset, loanCheck, loanRegister, openVerify, tamper, openCert, closeCert,
    loggedIn: () => !!S.user,
    tab: () => S.tab,
    firstCase: () => (S.cases.find((c) => c.status === 'opened') || {}).id,
    oldestClearance: () => (S.verifyList[S.verifyList.length - 1] || {}).id,
    latestClearance: () => (S.result && S.result.clearance ? S.result.clearance.id : null),
    events: { has: (n) => events.has(n), on: (fn) => evListeners.add(fn) },
  };

  init();
})();
