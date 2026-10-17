/*
 * The phone app. Five demo accounts, each with its own tabs:
 *   Sub-Registrar  Counter, Mouza map, Verify
 *   Landowner      My land, Mouza map, Verify
 *   AC (Land)      Namjari, Mouza map, Verify
 *   Bank officer   Loan desk, Mouza map, Verify
 *   Buyer          Mouza map, My land, Verify
 * State lives in S. Every change goes: action -> API call -> update S -> render().
 * The guide and its autoplay drive the app through window.DagApp (bottom).
 */
(function () {
  'use strict';
  const Dag = window.Dag;
  const api = Dag.api;
  const I = Dag.icons;
  const T = Dag.i18n;
  const t = (k, v) => T.t(k, v);
  const P = (o, k) => T.pick(o, k);
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errText = (e) => api.errText(e);
  const ev = (row) => (T.lang === 'bn' ? row.vBn : row.v);
  function ago(iso) {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 45) return t('ago.now');
    if (s < 3600) return t('ago.min', { n: Math.round(s / 60) });
    if (s < 86400) return t('ago.h', { n: Math.round(s / 3600) });
    return T.date(iso);
  }

  const TABSETS = {
    subregistrar: ['counter', 'mouza', 'verify'],
    owner: ['land', 'mouza', 'verify'],
    acland: ['acland', 'mouza', 'verify'],
    bank: ['bank', 'mouza', 'verify'],
    buyer: ['mouza', 'land', 'verify'],
  };
  const TAB_ICON = { counter: 'counter', mouza: 'map', land: 'land', acland: 'folder', bank: 'bank', verify: 'shield' };
  const ROLE_COLOR = { subregistrar: '#17543F', owner: '#5A3E8E', acland: '#1C6377', bank: '#8A5310', buyer: '#A23E5C' };
  const OFFICER = ['subregistrar', 'acland', 'bank'];

  // ---------- progress events for the guide ----------
  const EV_KEY = 'dag-demo-events';
  const events = new Set();
  const evListeners = new Set();
  try {
    JSON.parse(localStorage.getItem(EV_KEY) || '[]').forEach((e) => events.add(e));
  } catch (e) {
    /* none */
  }
  function emit(name) {
    if (!name || events.has(name)) return;
    events.add(name);
    try {
      localStorage.setItem(EV_KEY, JSON.stringify([...events]));
    } catch (e) {
      /* not remembered */
    }
    evListeners.forEach((fn) => fn(name));
  }
  // Who is on the phone changed: tell the guide even when no new step was done.
  function userChanged() {
    evListeners.forEach((fn) => fn('user'));
  }
  function clearEvents() {
    events.clear();
    try {
      localStorage.removeItem(EV_KEY);
    } catch (e) {
      /* ignore */
    }
    evListeners.forEach((fn) => fn('reset'));
  }

  // ---------- state ----------
  const blankForm = () => ({ dag: '', share: '', sellerNid: '', sellerName: '', buyerNid: '', buyerName: '' });
  const blankLoan = () => ({ dag: '', borrowerNid: '', borrowerName: '', amount: '' });
  const S = {
    booted: false, user: null, ctx: null, accounts: [], password: Dag.DEMO.password, tab: null,
    presets: [], form: blankForm(), presetId: null, resultPreset: null, busy: false, result: null, fresh: false, open: new Set(), note: '', error: null, smsOut: [],
    dags: [], alerts: [], unread: 0, seen: new Set(),
    cases: [], recon: null,
    map: null, selDag: null, mapCharge: {},
    loan: { presets: [], charges: [], form: blankLoan(), presetId: null, check: null, reg: null, busy: false, error: null },
    verifyList: [], verify: null, tamper: null, tokenCheck: null, tokenInput: '', oracleLog: [], audit: null,
    login: { phone: '', error: null, busy: false, typing: false, picked: null },
    switching: null, sheet: false, publicToken: null, publicResult: null,
  };
  const has = (role) => !!(S.user && S.user.roles.includes(role));
  const tabs = () => (S.user ? TABSETS[S.user.role] || ['mouza'] : []);
  const accountFor = (personId) => S.accounts.find((a) => a.personId === personId);
  const roleName = (role) => t('role.' + role);

  // ---------- small UI helpers ----------
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.className = 'toast'), 3400);
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
  const qrUrl = (token) => `${location.origin === 'null' ? 'file://' : location.origin}${location.pathname}#v=${encodeURIComponent(token)}`;
  const otherLang = (obj, key) => (T.lang === 'bn' ? obj[key] : obj[key + 'Bn']);

  let pushTimer = null;
  function showPush(a) {
    const el = $('#push');
    el.innerHTML = `<div class="push-card lv-${esc(a.level)}" id="push-card" role="button" tabindex="0">
      <div class="push-app">${I.logo}<span>${t('sms.from')}</span><span class="push-time">${t('sms.now')}</span></div>
      <b>${esc(P(a, 'title'))}</b><p>${esc(P(a, 'text'))}</p><p class="alt">${esc(otherLang(a, 'text'))}</p></div>`;
    el.classList.add('show');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => el.classList.remove('show'), a.level === 'action' ? 15000 : 5200);
  }
  const hidePush = () => $('#push').classList.remove('show');
  // Any tap on the screen below puts the notification away, as on a real phone.
  $('#view').addEventListener('pointerdown', hidePush);
  const PRIO = { action: 0, danger: 1, success: 2, info: 3 };
  function handleAlerts(sent) {
    if (!S.user || !sent || !sent.length) return;
    const mine = sent.filter((a) => a.toPersonId === S.user.personId);
    mine.forEach((a) => S.seen.add(a.alertId));
    if (mine.length) {
      mine.sort((a, b) => PRIO[a.level] - PRIO[b.level]);
      setTimeout(() => showPush(mine[0]), 450);
    }
  }

  // ---------- render ----------
  function render() {
    const view = $('#view');
    const prev = $('#content');
    const keep = prev && prev.dataset.tab === S.tab ? prev.scrollTop : 0;
    const a = document.activeElement;
    const focusId = a && a.id && view.contains(a) ? a.id : null;
    const sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    let html;
    if (S.publicToken) html = publicVerifyView();
    else if (!S.booted) html = wakeView();
    else if (!S.user) html = loginView();
    else html = shell();
    view.innerHTML = html + (S.sheet ? sheetView() : '') + (S.switching ? switchingView() : '');
    const c = $('#content');
    if (c) c.scrollTop = keep;
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange) {
          try {
            el.setSelectionRange(sel[0], sel[1]);
          } catch (e) {
            /* not a text field */
          }
        }
      }
    }
    const cap = $('#device-cap');
    if (cap) cap.textContent = t('device.cap');
    S.fresh = false;
  }

  // ---------- wake screen (Render cold start) ----------
  function wakeView() {
    const st = api.status();
    if (st.phase !== 'waking') return `<div class="boot">${I.logo}<span>${t('common.loading')}</span></div>`;
    return `<div class="wake">
      <div class="wake-mark">${I.logo}</div>
      <h2>${t('wake.title')}</h2>
      <p>${t('wake.body')}</p>
      <div class="wake-meter"><i style="width:${Math.min(100, (st.elapsed / 60) * 100)}%"></i></div>
      <div class="wake-sec">${t('wake.elapsed', { s: st.elapsed })}</div>
      <button class="btn ghost block" id="wake-skip" data-action="wake-skip">${t('wake.skip')}</button>
      <p class="fine">${t('wake.skipHint')}</p>
    </div>`;
  }

  // ---------- login ----------
  function loginView() {
    const L = S.login;
    return `<div class="login">
      <div class="lg-hero">
        <div class="lg-top">${I.logo}<button class="lang-mini on-dark" data-action="lang">${t('hdr.lang')}</button></div>
        <h1><span class="bn-word">দাগ</span><span class="en-word">Dag</span></h1>
        <p>${t('app.tagline')}</p>
      </div>
      <form class="lg-form" data-form="login" autocomplete="on">
        <label class="fld"><span>${t('login.phone')}</span><input id="lg-phone" name="phone" inputmode="tel" autocomplete="username" placeholder="01XXXXXXXXX" value="${esc(L.phone)}"></label>
        <label class="fld"><span>${t('login.password')}</span><input id="lg-pass" name="password" type="password" autocomplete="current-password"></label>
        ${L.error ? `<div class="lg-err" role="alert">${esc(L.error)}</div>` : ''}
        <button class="btn primary block" id="login-btn" type="submit"${L.busy || L.typing ? ' disabled' : ''}>${L.busy ? '<span class="spin"></span>' + t('login.busy') : t('login.submit')}</button>
      </form>
      <section class="register" aria-label="${t('login.accounts')}">
        <div class="reg-h"><b>${t('login.accounts')}</b><span>${t('login.accountsHint')}</span></div>
        ${S.accounts.map((a) => `<button class="reg-row${L.picked === a.id ? ' on' : ''}" id="acct-${a.id}" data-action="pick-account" data-id="${a.id}"${L.typing ? ' disabled' : ''}>
          <i class="reg-bar" style="background:${ROLE_COLOR[a.role]}"></i>
          <span class="avatar sm" style="background:${ROLE_COLOR[a.role]}">${esc(initials(P(a, 'name')))}</span>
          <span class="reg-t"><b>${esc(P(a, 'name'))}</b><small>${esc(P(a, 'title'))}</small></span>
          <span class="reg-p">${esc(T.d(a.phone))}</span>
        </button>`).join('')}
        <p class="reg-pw">${t('login.passwordAll', { pw: S.password })}</p>
      </section>
      <p class="lg-foot">${t('login.foot')}</p>
    </div>`;
  }
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2);

  // ---------- shell ----------
  function shell() {
    const u = S.user;
    const tb = tabs();
    return `<header class="appbar" style="--role:${ROLE_COLOR[u.role]}">
        <div class="ab-l"><div class="ab-title">${t('title.' + S.tab)}</div><div class="ab-sub">${esc(P(u, 'name'))}, ${esc(roleName(u.role))}</div></div>
        <button class="ab-btn lang-mini" id="lang-btn" data-action="lang" aria-label="Language">${t('hdr.lang')}</button>
        ${has('owner') ? `<button class="ab-icon" id="bell" data-action="bell" aria-label="${t('hdr.alerts')}">${I.bell}${S.unread ? `<span class="badge">${T.n(S.unread)}</span>` : ''}</button>` : ''}
        <button class="ab-avatar" id="acct-btn" data-action="sheet" aria-label="${t('hdr.account')}" style="background:${ROLE_COLOR[u.role]}">${esc(initials(P(u, 'name')))}</button>
      </header>
      <main class="content" id="content" data-tab="${S.tab}">${VIEWS[S.tab]()}</main>
      <nav class="tabbar" style="grid-template-columns:repeat(${tb.length},1fr)">${tb.map((id) => `<button class="tab${S.tab === id ? ' on' : ''}" id="tab-${id}" data-action="tab" data-tab="${id}">${I[TAB_ICON[id]]}<span>${t('tab.' + id)}</span>${id === 'land' && S.unread ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>`;
  }

  function sheetView() {
    return `<div class="sheet-back" data-action="sheet-close"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${t('sheet.title')}">
        <div class="sheet-grip"></div>
        <div class="sheet-h"><b>${t('sheet.title')}</b><button class="lang-mini" data-action="lang">${t('hdr.lang')}</button></div>
        <p class="sheet-hint">${t('sheet.hint')}</p>
        ${S.accounts.map((a) => {
          const me = S.user && S.user.id === a.id;
          return `<button class="reg-row${me ? ' on' : ''}" id="sw-${a.id}" data-action="switch" data-id="${a.id}"${me ? ' aria-current="true"' : ''}>
            <i class="reg-bar" style="background:${ROLE_COLOR[a.role]}"></i>
            <span class="avatar sm" style="background:${ROLE_COLOR[a.role]}">${esc(initials(P(a, 'name')))}</span>
            <span class="reg-t"><b>${esc(P(a, 'name'))}</b><small>${me ? t('sheet.now') : esc(P(a, 'title'))}</small></span>
            ${me ? `<span class="reg-now">${I.check}</span>` : `<span class="reg-go">${I.swap}</span>`}
          </button>`;
        }).join('')}
        <button class="btn ghost block" data-action="logout">${I.logout}${t('sheet.logout')}</button>
      </section>`;
  }

  function switchingView() {
    const a = S.switching;
    return `<div class="switching"><span class="avatar lg" style="background:${ROLE_COLOR[a.role]}">${esc(initials(P(a, 'name')))}</span>
      <b>${esc(P(a, 'name'))}</b><span>${esc(roleName(a.role))}</span><small>${t('login.switching', { name: esc(P(a, 'name')) })}</small><span class="spin dark"></span></div>`;
  }

  // ---------- counter ----------
  const field = (k, label, mode) => `<label class="fld"><span>${label}</span><input data-field="${k}" id="f-${k}" value="${esc(S.form[k])}"${mode ? ` inputmode="${mode}"` : ''} autocomplete="off"></label>`;

  function counterView() {
    const m = S.ctx.mouza;
    return `<div class="office"><span class="live"></span><b>${esc(P(S.ctx.office, 'name'))}</b><span>${esc(P(S.ctx.office, 'counter'))}</span></div>
      <div class="blk"><div class="blk-h">${t('ctr.scenarios')}<span>${t('ctr.scenariosHint')}</span></div>
        <div class="chips">${S.presets.map((p) => `<button class="chip${S.presetId === p.id ? ' on' : ''}" id="preset-${p.id}" data-action="preset" data-id="${p.id}"><b>${T.n(p.id)}</b>${esc(P(p, 'title'))}</button>`).join('')}</div>
      </div>
      <form class="card deed" data-form="clearance" novalidate>
        <div class="deed-h">${esc(t('ctr.mouza', { mouza: P(m, 'name'), jl: T.d(m.jl) }))}<span>${esc(P(m, 'upazila'))}, ${esc(P(m, 'district'))}</span></div>
        <div class="grid2">
          ${field('dag', t('f.dag'), 'numeric')}
          ${field('share', t('f.share'), 'decimal')}
          ${field('sellerNid', t('f.sellerNid'), 'numeric')}
          ${field('sellerName', t('f.sellerName'))}
          ${field('buyerNid', t('f.buyerNid'), 'numeric')}
          ${field('buyerName', t('f.buyerName'))}
        </div>
        ${needView()}
        <button class="btn primary block" id="run-btn" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? '<span class="spin"></span>' + t('ctr.running') : I.shield + t('ctr.run')}</button>
      </form>
      ${S.error ? `<div class="err-box" role="alert">${esc(S.error)}</div>` : ''}
      ${S.result ? resultView(S.result) : `<div class="hint"><b>${t('ctr.hintTitle')}</b><p>${t('ctr.hintBody')}</p></div>`}`;
  }

  // A scenario that builds on an earlier one says so, and offers to load the earlier one.
  function presetNeed() {
    const p = S.presetId && S.presets.find((x) => x.id === S.presetId);
    return p && p.after && p.ready === false ? p.after : null;
  }
  function needView() {
    const n = presetNeed();
    if (!n) return '';
    return `<div class="need" id="need-card">${I.alert}<div><b>${t('ctr.needTitle', { n: T.n(n) })}</b><p>${t('ctr.needBody', { n: T.n(n) })}</p>
      <button class="btn ghost small" type="button" id="need-btn" data-action="preset" data-id="${n}">${t('ctr.needBtn', { n: T.n(n) })}</button></div></div>`;
  }

  const VIC = { pass: I.check, warn: I.alert, hold: I.clock, block: I.x, na: I.dash };

  function resultView(r) {
    const c = r.counts;
    return `<section class="stamp-wrap" id="verdict">
        <div class="stamp st-${r.verdict}"><span class="stamp-word">${t('v.' + r.verdict)}</span><span class="stamp-id">${esc(r.id)}</span></div>
        <div class="stamp-text"><b>${t('v.' + r.verdict + '.sub')}</b><span>${t('v.counts', { pass: c.pass, warn: c.warn, hold: c.hold, block: c.block })}</span></div>
      </section>
      <ul class="ledger${S.fresh ? ' fresh' : ''}">${r.checks.map(checkRow).join('')}</ul>
      ${smsCard()}
      ${actionsView(r)}`;
  }

  function checkRow(k, i) {
    const open = S.open.has(k.code);
    return `<li class="lrow k-${k.verdict}${k.addition ? ' add' : ''}" style="--i:${i}" id="chk-${k.code}">
      <button class="lrow-h" data-action="toggle" data-code="${k.code}" aria-expanded="${open}">
        <span class="lrow-ic">${VIC[k.verdict]}</span>
        <span class="lrow-t"><span class="lrow-n"><code>${k.code}</code>${esc(P(k, 'name'))}${k.addition ? `<em>${t('chk.new')}</em>` : ''}</span><span class="lrow-s">${esc(P(k, 'summary'))}</span></span>
        <span class="pill p-${k.verdict}">${t('pl.' + k.verdict)}</span>
      </button>${open ? evidenceView(k) : ''}</li>`;
  }

  function evidenceView(k) {
    let h = '<div class="lrow-b">';
    if (k.math) {
      const m = k.math;
      h += `<div class="math">
        <div><span>${t('m.area')}</span><b>${T.f2(m.area)}</b></div>
        ${m.over ? `<div class="short"><span>${t('m.allHolders')}</span><b>${T.f2(m.totalHeld)}</b></div>` : ''}
        <div><span>${t('m.holds')}</span><b>${T.f2(m.holds)}</b></div>
        <div><span>${t('m.pending')}</span><b>&minus; ${T.f2(m.pendingOut)}</b></div>
        <div class="tot"><span>${t('m.available')}</span><b>${T.f2(m.available)}</b></div>
        <div><span>${t('m.requested')}</span><b>${T.f2(m.requested)}</b></div>
        ${m.short > 0 && !m.over ? `<div class="short"><span>${t('m.short')}</span><b>${T.f2(m.short)}</b></div>` : ''}
        <small>${t('m.unit')}</small></div>`;
    }
    if (k.evidence && k.evidence.length) h += `<dl class="kv">${k.evidence.map((r) => `<dt>${esc(P(r, 'k'))}</dt><dd>${esc(ev(r))}</dd>`).join('')}</dl>`;
    if (!k.math && !(k.evidence && k.evidence.length)) h += `<p class="muted small">${t('ev.none')}</p>`;
    return h + '</div>';
  }

  function smsCard() {
    if (!S.smsOut.length) return '';
    return S.smsOut.map((a) => {
      const acc = accountFor(a.toPersonId);
      const name = T.lang === 'bn' ? a.toNameBn : a.toName;
      return `<div class="smsout lv-${esc(a.level)}">${I.phone}<div><b>${esc(t('sms.sentTo', { name, phone: a.to }))}</b><span>${esc(P(a, 'title'))}</span></div>
        ${acc ? `<button class="btn small ${a.level === 'action' ? 'seal' : 'ghost'}" id="open-phone-${acc.id}" data-action="switch" data-id="${acc.id}" data-tab="land">${t(acc.role === 'buyer' ? 'sms.openHer' : 'sms.open')}</button>` : ''}</div>`;
    }).join('');
  }

  function clearanceCard(c) {
    if (!c) return '';
    const p = c.payload;
    const w = p.warnings.length;
    return `<section class="card clr" id="clr-card">
      <a class="clr-qr" href="${esc(qrUrl(c.qrToken))}" data-action="open-qr" data-token="${esc(c.qrToken)}" aria-label="${t('clr.scan')}">${qrSvg(qrUrl(c.qrToken))}</a>
      <div class="clr-m"><span class="clr-k">${t('clr.title')}</span><b class="code">${esc(c.id)}</b>
        <span>${esc(t('clr.line', { dag: T.d(p.dag), share: T.n(p.share), buyer: P(p.buyer, 'name') }))}</span>
        <span>${esc(t('clr.valid', { when: T.dt(c.validUntil) }))}</span>
        ${w ? `<span class="warnline">${t('clr.warnings', { n: w })}</span>` : ''}
        <span class="clr-links"><button class="link" id="cert-btn" data-action="cert" data-id="${esc(c.id)}">${I.doc}${t('clr.cert')}</button><button class="link" id="qr-btn" data-action="open-qr" data-token="${esc(c.qrToken)}">${I.qr}${t('clr.scan')}</button></span>
      </div></section>
      <p class="fine left">${t('clr.scanHint')}</p>`;
  }

  function actionsView(r) {
    if (r.status === 'cleared') {
      return clearanceCard(r.clearance) + `<button class="btn primary block" id="exec-btn" data-action="execute">${I.stamp}${t('act.execute')}</button><p class="fine">${t('act.executeHint')}</p>`;
    }
    if (r.status === 'executed') {
      return clearanceCard(r.clearance) + `<section class="card done" id="done-card"><div class="card-h ok">${I.check}${t('done.title')}</div>
        <dl class="kv"><dt>${t('done.deed')}</dt><dd class="code">${esc(r.deedId)}</dd><dt>${t('done.case')}</dt><dd>${esc(t('done.caseVal', { id: r.caseId }))}</dd><dt>${t('done.app')}</dt><dd>${t('done.none')}</dd></dl></section>`;
    }
    if (r.status === 'warn') {
      return `<section class="card note-card"><label class="fld"><span>${t('warn.note')}</span><textarea id="note" rows="3">${esc(S.note)}</textarea></label>
        <button class="btn warn block" id="proceed-btn" data-action="proceed">${I.alert}${t('warn.proceed')}</button></section>`;
    }
    if (r.status === 'hold') {
      const c8 = r.checks.find((x) => x.code === 'C8');
      const ends = c8 && c8.noticeEndsAt;
      return `<section class="card hold-card" id="hold-card"><div class="card-h seal">${I.lock}${t('hold.title')}</div>
        <p>${t('hold.body')}</p><p class="muted small">${t('hold.live')}${ends ? ' ' + esc(T.dt(ends)) : ''}</p>
        <button class="btn ghost small" id="expire-btn" data-action="expire">${I.clock}${t('hold.expire')}</button></section>`;
    }
    if (r.status === 'blocked') {
      const reasons = r.checks.filter((c) => c.verdict === 'block');
      return `<section class="card block-card" id="block-card"><div class="card-h bad">${I.x}${t('blk.title')}</div>
        ${r.changedAfterClearance ? `<p class="changed">${t('blk.changed')}</p>` : ''}
        <ol class="reasons">${reasons.map((c) => `<li><code>${c.code}</code> ${esc(P(c, 'summary'))}</li>`).join('')}</ol>
        ${r.appeal ? `<div class="appeal"><b class="code">${esc(t('blk.appeal', { id: r.appeal.id }))}</b><span>${esc(t('blk.appealTo', { office: P(r.appeal, 'to') }))}</span><p>${esc(P(r.appeal, 'note'))}</p></div>` : ''}</section>`;
    }
    return '';
  }

  // ---------- mouza map ----------
  const ST = {
    clear: { fill: '#E5F2EA', line: '#1E6B44' },
    care: { fill: '#FBF0DC', line: '#96600E' },
    locked: { fill: '#EFEAF7', line: '#5A3E8E' },
    restricted: { fill: '#FBE9E7', line: '#A32D2D' },
  };
  const pts = (p) => p.map((q) => q.join(',')).join(' ');
  const centre = (p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

  function mapSvg(m) {
    let s = `<svg class="map" viewBox="0 0 360 300" role="img" aria-label="${esc(P(m.mouza, 'name'))}">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#A32D2D" stroke-width="1.2" opacity=".35"/></pattern></defs>
      <rect width="360" height="300" fill="#F6F8F3"/>
      <path d="M0,28 C90,34 170,22 250,28 S330,32 360,26 L360,0 L0,0 Z" fill="#D5E6EE"/>
      <text x="350" y="16" text-anchor="end" font-size="9.5" font-style="italic" fill="#4F7D98">${esc(t('map.canal'))}</text>`;
    m.fillers.forEach((f) => {
      const [x, y] = centre(f.poly);
      s += `<polygon points="${pts(f.poly)}" fill="#ECF0EA" stroke="#C7D0C9" stroke-width="1"/><text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9.5" fill="#9DA8A1">${esc(T.d(f.no))}</text>`;
    });
    m.dags.forEach((d) => {
      const c = ST[d.status];
      const [x, y] = centre(d.poly);
      const sel = S.selDag === d.no;
      s += `<g class="plot${sel ? ' sel' : ''}" id="plot-${d.no}" data-action="pick-dag" data-dag="${d.no}" role="button" tabindex="0" aria-label="${esc(t('map.dag', { no: T.d(d.no) }))}, ${esc(t('map.' + d.status))}">
        <polygon class="base" points="${pts(d.poly)}" fill="${c.fill}" stroke="${c.line}" stroke-width="${sel ? 3 : 1.6}"/>
        ${d.status === 'restricted' ? `<polygon points="${pts(d.poly)}" fill="url(#hatch)" pointer-events="none"/>` : ''}
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${c.line}">${esc(T.d(d.no))}</text>
        ${d.status === 'locked' ? `<g transform="translate(${x - 5},${y + 9})" pointer-events="none"><rect x="0" y="4" width="10" height="7" rx="1.5" fill="${c.line}"/><path d="M2.5 4V2.6a2.5 2.5 0 0 1 5 0V4" fill="none" stroke="${c.line}" stroke-width="1.4"/></g>` : ''}
      </g>`;
    });
    s += `<path d="M0,271 L102,281" stroke="#B9C3BE" stroke-width="9" fill="none" pointer-events="none"/><path d="M0,271 L102,281" stroke="#fff" stroke-width="1.2" stroke-dasharray="5 4" fill="none" pointer-events="none"/>
      <polygon points="20,46 100,38 182,42 262,36 340,44 344,110 346,170 348,244 344,288 270,292 192,290 100,288 24,288 26,236 22,178 24,114" fill="none" stroke="#0E3B2E" stroke-width="1.2" stroke-dasharray="6 3" opacity=".45" pointer-events="none"/>
      <g transform="translate(14,22)" opacity=".7"><path d="M0,-12 L4,0 L0,-3 L-4,0 Z" fill="#0E3B2E"/><text x="8" y="-3" font-size="8.5" font-weight="700" fill="#0E3B2E">${T.lang === 'bn' ? 'উ' : 'N'}</text></g>
    </svg>`;
    return s;
  }

  function mouzaView() {
    const m = S.map;
    if (!m) return `<div class="hint">${t('common.loading')}</div>`;
    const sel = S.selDag ? m.dags.find((d) => d.no === S.selDag) : null;
    const counts = {};
    m.dags.forEach((d) => (counts[d.status] = (counts[d.status] || 0) + 1));
    return `<div class="card mapcard">
        <div class="map-h"><b>${esc(P(m.mouza, 'name'))}</b><span>${esc(t('map.sub', { jl: T.d(m.mouza.jl), upazila: P(m.mouza, 'upazila') }))}</span></div>
        ${mapSvg(m)}
        <div class="legend">${Object.keys(ST).map((k) => `<span><i style="background:${ST[k].fill};border-color:${ST[k].line}"></i>${t('map.' + k)} ${T.n(counts[k] || 0)}</span>`).join('')}<span><i class="road"></i>${t('map.road')}</span></div>
      </div>
      ${sel ? dagSheet(sel) : `<div class="hint"><b>${t('map.hintTitle')}</b><p>${t('map.hintBody')}</p></div>`}`;
  }

  function dagSheet(d) {
    const c = ST[d.status];
    const ch = S.mapCharge[d.no];
    const chain = ['CS', 'SA', 'RS', 'BS'].map((k) => `<span class="${d.survey[k] ? '' : 'miss'}"><small>${T.lang === 'bn' ? Dag.engine.SURVEY_BN[k] : k}</small>${d.survey[k] ? esc(T.d(d.survey[k])) : t('map.none')}</span>`).join('<i>›</i>');
    const chargeHtml = ch
      ? `<div class="charge ${ch.charge ? 'yes' : 'no'}" id="charge-${d.no}">${ch.charge ? I.x : I.check}<div><b>${t(ch.charge ? 'map.chargeYes' : 'map.chargeNo')}</b><span>${ch.charge ? esc(t('map.since', { date: T.date(ch.since), lender: P(ch, 'lender') })) + ' ' : ''}${esc(t('map.signed', { ok: t(ch.signatureValid ? 'common.valid' : 'common.invalid'), key: ch.keyId }))}</span></div></div>`
      : `<button class="btn ghost block small" id="ask-bank-btn" data-action="ask-bank" data-dag="${d.no}">${I.bank}${t('map.ask')}</button>`;
    return `<section class="card sheetcard" id="sheet-${d.no}" style="--plot:${c.line}">
      <div class="sh-h"><div><b>${esc(t('map.dag', { no: T.d(d.no) }))}</b><span>${esc(t('map.size', { area: T.n(d.area), cls: P(d, 'landClass') }))}</span></div><span class="pill" style="background:${c.fill};color:${c.line}">${t('map.' + d.status)}</span></div>
      ${d.reasons.length ? `<ul class="why">${d.reasons.map((r) => `<li class="lv-${r.level}">${esc(P(r, 'text'))}</li>`).join('')}</ul>` : `<p class="ok-line">${t('map.okLine')}</p>`}
      <h5>${t('map.holders')}</h5>
      <div class="holders">${d.holders.map((h) => `<div><span>${esc(P(h, 'name'))}<small>${esc(h.khatian)}${h.mutated ? '' : ', ' + t('map.noNamjari')}</small></span><b>${T.f2(h.share)}</b></div>`).join('')}${d.pending > 0 ? `<div class="pend"><span>${t('map.pending')}</span><b>${T.f2(d.pending)}</b></div>` : ''}</div>
      <h5>${t('map.chain')}</h5><div class="schain">${chain}</div>
      <h5>${t('map.charge')}</h5>${chargeHtml}
      ${has('subregistrar') ? `<button class="btn primary block small" style="margin-top:14px" id="use-dag-btn" data-action="use-dag" data-dag="${d.no}">${I.counter}${t('map.use')}</button>` : ''}
    </section>`;
  }

  // ---------- my land ----------
  function landView() {
    const action = S.alerts.filter((a) => a.actionRequired && !a.response);
    const rest = S.alerts.filter((a) => !(a.actionRequired && !a.response));
    const u = S.user;
    return `<div class="who"><span class="avatar" style="background:${ROLE_COLOR[u.role]}">${esc(initials(P(u, 'name')))}</span><div><b>${esc(P(u, 'name'))}</b><span>${esc(T.d(u.phone))}</span></div></div>
      ${action.length ? `<div class="blk"><div class="blk-h seal">${t('land.needs')}</div>${action.map(alertCard).join('')}</div>` : ''}
      <div class="blk"><div class="blk-h">${t('land.dags')}${S.dags.length ? `<span>${t('land.dagsHint')}</span>` : ''}</div>${S.dags.map(dagCard).join('') || `<div class="hint"><b>${t('land.noDags')}</b><p>${t('land.noDagsBody')}</p></div>`}</div>
      <div class="blk"><div class="blk-h">${t('land.inbox')}</div>${rest.map(alertCard).join('') || `<div class="hint"><b>${t('land.noneTitle')}</b><p>${t('land.noneBody')}</p></div>`}</div>`;
  }

  function alertCard(a) {
    const ic = a.level === 'action' ? I.lock : a.level === 'danger' ? I.x : a.level === 'success' ? I.check : I.bell;
    let tail = '';
    if (a.actionRequired && !a.response) {
      tail = `<div class="a-btns"><button class="btn small ok" id="respond-me-${a.id}" data-action="respond" data-id="${a.id}" data-answer="me">${t('alert.yes')}</button><button class="btn small danger" id="respond-no-${a.id}" data-action="respond" data-id="${a.id}" data-answer="not_me">${t('alert.no')}</button></div>`;
    } else if (a.response) {
      const yes = a.response === 'me';
      const what = a.kind === 'mortgage' ? t(yes ? 'alert.mortGo' : 'alert.mortStop') : t(yes ? 'alert.deedGo' : 'alert.deedStop');
      tail = `<div class="a-ans ${yes ? 'ok' : 'bad'}">${t(yes ? 'alert.answeredMe' : 'alert.answeredNo')} ${what}</div>`;
    }
    return `<article class="sms lv-${a.level}${a.read ? '' : ' unread'}" id="alert-${a.id}"><div class="sms-ic">${ic}</div><div class="sms-b">
      <div class="sms-t"><b>${esc(P(a, 'title'))}</b><small>${esc(ago(a.at))}</small></div>
      <p>${esc(P(a, 'text'))}</p><p class="alt">${esc(otherLang(a, 'text'))}</p>${tail}</div></article>`;
  }

  function dagCard(d) {
    const live = (d.mortgages || []).filter((m) => m.status !== 'refused');
    return `<div class="card dagc${d.locked ? ' locked' : ''}" id="dag-${d.dag}">
      <div class="dh"><div><b>${esc(t('map.dag', { no: T.d(d.dag) }))}</b><span>${esc(P(d, 'mouza'))}, ${esc(P(d, 'landClass'))}</span></div><span class="lockchip">${d.locked ? I.lock + t('land.locked') : I.unlock + t('land.unlocked')}</span></div>
      <div class="dstats"><div><small>${t('land.area')}</small><b>${T.f2(d.area)}</b></div><div><small>${t('land.share')}</small><b>${T.f2(d.share)}</b></div><div><small>${t('land.pending')}</small><b>${T.f2(d.pendingOut)}</b></div></div>
      <div class="srow"><div class="st"><b>${t('land.lock')}</b><small>${t('land.lockHint')}</small></div>
        <button class="switch${d.locked ? ' on' : ''}" id="lock-${d.dag}" role="switch" aria-checked="${d.locked}" aria-label="${t('land.lock')} ${esc(T.d(d.dag))}" data-action="lock" data-dag="${esc(d.dag)}" data-on="${!d.locked}"><i></i></button></div>
      ${d.transfers.length ? `<div class="tlist">${d.transfers.map((x) => `<div><span><span class="code">${esc(x.id)}</span> ${esc(t('land.sold', { share: T.n(x.share), name: P(x, 'to') }))}</span><b>${t(x.status === 'mutated' ? 'land.mutated' : 'land.awaiting')}</b></div>`).join('')}</div>` : ''}
      ${live.length ? `<div class="tlist">${live.map((m) => `<div><span>${esc(t('land.mortgage', { lender: P(m, 'lender'), amount: T.money(m.amount) }))}</span><b>${t(m.status === 'held' ? 'land.mWaiting' : 'land.mLive')}</b></div>`).join('')}</div>` : ''}
      <div class="tlist"><div><span>${t('land.khatian')}</span><b class="code">${esc(d.khatian)}</b></div></div>
    </div>`;
  }

  // ---------- AC Land ----------
  function aclandView() {
    const approved = S.cases.filter((c) => c.status === 'approved').length;
    const r = S.recon;
    let h = `<div class="stats"><div class="stat"><b>${T.n(S.cases.length)}</b><span>${t('ac.opened')}</span></div><div class="stat"><b>${T.n(0)}</b><span>${t('ac.apps')}</span></div><div class="stat"><b>${T.n(approved)}</b><span>${t('ac.corrected')}</span></div></div>
      <div class="blk"><div class="blk-h">${t('ac.queue')}</div>
      ${S.cases.length ? S.cases.map(caseCard).join('') : `<div class="hint"><b>${t('ac.emptyTitle')}</b><p>${t('ac.emptyBody')}</p></div>`}</div>`;
    if (r) {
      h += `<div class="blk"><div class="blk-h">${t('ac.health')}</div>
        <div class="card recon" id="recon-card">
          <div class="recon-top"><div><b>${T.n(r.dagsChecked)}</b><span>${t('ac.scanned')}</span></div><div class="bad"><b>${T.n(r.overAllocated)}</b><span>${t('ac.over')}</span></div><div><b>${T.n(r.issues.length)}</b><span>${t('ac.issues')}</span></div></div>
          <ul class="why">${r.issues.map((i) => `<li class="lv-${i.level}"><b>${esc(t('ac.dag', { no: T.d(i.dag) }))}</b> ${esc(P(i, 'text'))}</li>`).join('')}</ul>
          <p class="fine left">${t('ac.healthNote')}</p>
        </div></div>`;
    }
    return h;
  }
  function caseCard(k) {
    return `<div class="card case" id="case-${k.id}">
      <div class="case-h"><b class="code">${esc(k.id)}</b><span class="pill ${k.status === 'approved' ? 'p-pass' : 'p-hold'}">${t(k.status === 'approved' ? 'ac.approved' : 'ac.open')}</span></div>
      <div class="case-p"><b>${esc(t('ac.move', { share: T.n(k.share), dag: T.d(k.dag) }))}</b><span>${esc(t('ac.parties', { from: P(k, 'fromName'), to: P(k, 'toName') }))}</span><span class="muted">${esc(t('ac.deed', { id: k.deedId }))}</span></div>
      <ul class="tl">${k.timeline.map((x) => `<li><small>${esc(T.time(x.at))}</small>${esc(P(x, 'text'))}</li>`).join('')}</ul>
      ${k.status === 'opened' ? `<button class="btn primary block approve-btn" id="approve-${k.id}" data-action="approve" data-id="${k.id}">${I.check}${t('ac.approve')}</button>` : ''}
    </div>`;
  }

  // ---------- bank ----------
  const lfield = (k, label, mode) => `<label class="fld"><span>${label}</span><input data-lfield="${k}" id="l-${k}" value="${esc(S.loan.form[k])}"${mode ? ` inputmode="${mode}"` : ''} autocomplete="off"></label>`;
  function bankView() {
    const L = S.loan;
    const desk = S.ctx.loanDesk;
    let h = `<div class="office"><span class="live"></span><b>${esc(P(desk, 'lender'))}</b><span>${esc(P(desk, 'branch'))}</span></div>
      <div class="blk"><div class="blk-h">${t('bk.scenarios')}<span>${t('bk.scenariosHint')}</span></div>
      <div class="chips">${L.presets.map((p) => `<button class="chip${L.presetId === p.id ? ' on' : ''}" id="loan-preset-${p.id}" data-action="loan-preset" data-id="${p.id}"><b>${T.lang === 'bn' ? 'ঋ' : 'L'}${T.n(p.id)}</b>${esc(P(p, 'title'))}</button>`).join('')}</div></div>
      <div class="card deed"><div class="grid2">${lfield('dag', t('f.dag'), 'numeric')}${lfield('amount', t('f.amount'), 'numeric')}${lfield('borrowerNid', t('f.borrowerNid'), 'numeric')}${lfield('borrowerName', t('f.borrowerName'))}</div>
      <button class="btn primary block" id="loan-check-btn" data-action="loan-check"${L.busy ? ' disabled' : ''}>${L.busy ? '<span class="spin"></span>' + t('bk.checking') : I.shield + t('bk.check')}</button></div>
      ${L.error ? `<div class="err-box" role="alert">${esc(L.error)}</div>` : ''}
      ${L.check ? loanCheckView(L.check) : ''}
      ${L.reg ? loanRegView(L.reg) : ''}`;
    if (L.charges.length) {
      h += `<div class="blk"><div class="blk-h">${t('bk.registered')}</div><div class="card list">${L.charges.map((c) => `<div class="lrow-static"><span><b class="code">${esc(c.id)}</b><small>${esc(t('map.dag', { no: T.d(c.dag) }))}, ${esc(P(c, 'borrower'))}, ${esc(T.money(c.amount))}</small></span><span class="pill ${c.status === 'live' ? 'p-pass' : c.status === 'held' ? 'p-hold' : 'p-block'}">${t('bk.st.' + c.status)}</span></div>`).join('')}</div></div>`;
    }
    h += `<div class="blk"><div class="blk-h">${t('bk.side')}</div><div class="card olog" id="oracle-log">`;
    h += S.oracleLog.length
      ? S.oracleLog.slice(0, 6).map((o) => `<div class="orow"><div class="oh"><span>${esc(t('bk.oracleHead', { dag: T.d(o.dag), yn: t(o.answer ? 'bk.yes' : 'bk.no') }))}</span><small>${esc(T.time(o.at))}</small></div><div class="muted small">${esc(t('bk.askedBy', { who: P(o, 'askedBy') }))}</div><div class="tags">${o.disclosed.map((d) => `<span class="out">${t('dk.' + d)}</span>`).join('')}${o.withheld.map((d) => `<span class="in">${t('dk.' + d)}</span>`).join('')}</div></div>`).join('') + `<p class="muted small legend-line">${t('bk.legend')}</p>`
      : `<p class="muted small">${t('bk.empty')}</p>`;
    return h + '</div></div>';
  }
  function oracleLine(o) {
    const ok = t(o.signatureValid ? 'common.valid' : 'common.invalid');
    const txt = o.charge ? t('bk.oracleYes', { date: T.date(o.since), lender: P(o, 'lender'), ok, key: o.keyId }) : t('bk.oracleNo', { ok, key: o.keyId });
    return `<div class="oracle-line">${I.shield}<span>${esc(txt)}</span></div>`;
  }
  function loanCheckView(c) {
    if (c.outcome === 'refuse') {
      return `<section class="card block-card" id="loan-result"><div class="card-h bad">${I.x}${t('bk.refuse')}</div><ol class="reasons">${c.reasons.map((r) => `<li>${esc(T.lang === 'bn' ? r.bn : r.en)}</li>`).join('')}</ol>${oracleLine(c.oracle)}</section>`;
    }
    return `<section class="card done" id="loan-result"><div class="card-h ok">${I.check}${t('bk.ok')}</div>
      <dl class="kv"><dt>${t('bk.borrower')}</dt><dd>${esc(P(c, 'borrower'))}</dd><dt>${t('bk.holds')}</dt><dd>${esc(T.f2(c.borrowerShare))}</dd><dt>${t('bk.lock')}</dt><dd>${t(c.locked ? 'bk.lockOn' : 'bk.lockOff')}</dd></dl>${oracleLine(c.oracle)}
      ${S.loan.reg ? '' : `<button class="btn primary block" style="margin-top:12px" id="loan-reg-btn" data-action="loan-register">${I.stamp}${t('bk.register')}</button>`}</section>`;
  }
  function loanRegView(ch) {
    if (ch.status === 'held') return `<section class="card hold-card" id="loan-reg"><div class="card-h seal">${I.lock}${esc(t('bk.heldTitle', { id: ch.id }))}</div><p>${t('bk.heldBody')}</p><p class="muted small">${t('hold.live')}</p></section>`;
    if (ch.status === 'refused') return `<section class="card block-card" id="loan-reg"><div class="card-h bad">${I.x}${esc(t('bk.refusedTitle', { id: ch.id }))}</div><p class="muted">${t('bk.refusedBody')}</p></section>`;
    return `<section class="card done" id="loan-reg"><div class="card-h ok">${I.check}${esc(t('bk.liveTitle', { id: ch.id }))}</div><p class="muted">${t('bk.liveBody')}</p></section>`;
  }

  // ---------- verify ----------
  function verifyView() {
    const v = S.verify;
    const tp = S.tamper;
    const a = S.audit;
    let h = `<div class="blk"><div class="blk-h">${t('vf.list')}${S.verifyList.length ? `<span>${t('vf.listHint')}</span>` : ''}</div>`;
    h += S.verifyList.length
      ? `<div class="card list">${S.verifyList.map((c) => `<button class="vrow" id="vrow-${c.id}" data-action="verify-open" data-id="${c.id}"><span><b class="code">${esc(c.id)}</b><small>${esc(t('map.dag', { no: T.d(c.dag) }))}, ${esc(T.n(c.share))} ${T.lang === 'bn' ? 'শতাংশ' : 'dec'}, ${esc(P(c, 'sellerName'))} › ${esc(P(c, 'buyerName'))}</small></span><span class="pill ${c.status === 'executed' ? 'p-pass' : c.status === 'void' ? 'p-block' : 'p-info'}">${t('cs.' + c.status)}</span></button>`).join('')}</div>`
      : `<div class="hint"><b>${t('vf.emptyTitle')}</b><p>${t('vf.emptyBody')}</p></div>`;
    h += '</div>';
    if (v) {
      const p = v.payload;
      h += `<section class="card vres ${v.valid ? 'ok' : 'bad'}" id="verify-card">
        <div class="vres-h"><div class="big">${v.valid ? I.check : I.x}</div><div><b>${t(v.valid ? 'vf.valid' : 'vf.invalid')}</b><span class="code">${esc(v.id)}, Ed25519, ${esc(v.keyId)}</span></div></div>
        <dl class="kv"><dt>${t('vf.office')}</dt><dd>${esc(P(p, 'office'))}</dd><dt>${t('vf.mouza')}</dt><dd>${esc(P(p, 'mouza'))}</dd><dt>${t('vf.dag')}</dt><dd>${esc(T.d(p.dag))}</dd><dt>${t('vf.seller')}</dt><dd>${esc(P(p.seller, 'name'))}</dd><dt>${t('vf.buyer')}</dt><dd>${esc(P(p.buyer, 'name'))}</dd><dt>${t('vf.share')}</dt><dd>${esc(t('cert.decimals', { n: T.n(p.share) }))}</dd><dt>${t('vf.warnings')}</dt><dd>${p.warnings.length ? T.n(p.warnings.length) : t('vf.none')}</dd><dt>${t('vf.issued')}</dt><dd>${esc(T.dt(p.issuedAt))}</dd></dl>
        <div class="sig">${esc(v.signature)}</div>
        <button class="btn ghost block" id="tamper-btn" data-action="tamper">${I.alert}${t('vf.tamper')}</button>
      </section>`;
    }
    if (tp) {
      h += `<section class="card vres bad" id="tamper-card"><div class="vres-h"><div class="big">${I.x}</div><div><b>${t('vf.tamperTitle')}</b><span>${esc(t('vf.tamperSub', { from: T.n(tp.changed.from), to: T.n(tp.changed.to) }))}</span></div></div>
        <p class="muted">${t('vf.tamperBody')}</p></section>`;
    }
    h += `<div class="blk"><div class="blk-h">${t('vf.paste')}</div><div class="card"><label class="fld"><span>${t('vf.pasteHint')}</span><textarea id="token-input" rows="2">${esc(S.tokenInput)}</textarea></label>
      <button class="btn ghost block small" id="token-check-btn" data-action="token-check">${I.qr}${t('vf.pasteBtn')}</button>${S.tokenCheck ? tokenResult(S.tokenCheck) : ''}</div></div>`;
    if (a) {
      h += `<div class="blk"><div class="blk-h">${t('vf.audit')}<span>${t('vf.entries', { n: a.count })}</span></div><div class="card" id="audit-card">
        <div class="chain">${a.intact ? `<span class="ok">${I.check}${t('vf.intact')}</span>` : `<span class="bad">${I.x}${t('vf.broken')}</span>`}<span class="code muted">${esc((a.head || '').slice(0, 16))}</span></div>
        <div class="alist">${a.entries.slice(0, 7).map((e) => `<div><span>${T.n(e.seq)}</span><span>${esc(e.action)}</span><span>${esc(e.hash.slice(0, 8))}</span></div>`).join('')}</div></div></div>`;
    }
    return h;
  }

  // ---------- QR verification, offline ----------
  async function keyring() {
    const k = Dag.crypto.publicKeys();
    const ring = [{ keyId: k.demoGate.keyId, publicKeyHex: k.demoGate.publicKeyHex, label: 'demo' }];
    if (api.mode === 'http') {
      try {
        const s = await api.get('/api/keys', { quiet: true });
        ring.unshift({ keyId: s.gate.keyId, publicKeyHex: s.gate.publicKeyHex, label: s.mode === 'server' ? 'server' : 'demo' });
      } catch (e) {
        /* offline: demo key only */
      }
    }
    return ring;
  }
  async function checkToken(token) {
    return Dag.qrtoken.verify(token, await keyring());
  }
  const tokenHow = (r) => (r.ok ? t('pv.how', { label: t('key.' + r.key.label), key: r.key.keyId }) : t('pv.' + (r.reason || 'format')));
  const tokenRows = (tk) => `<dl class="kv"><dt>${t('cert.id')}</dt><dd class="code">${esc(tk.id)}</dd><dt>${t('pv.jl')}</dt><dd>${esc(T.d(tk.jl))}</dd><dt>${t('vf.dag')}</dt><dd>${esc(T.d(tk.dag))}</dd><dt>${t('pv.seller4')}</dt><dd class="code">${esc(tk.seller4)}</dd><dt>${t('pv.buyer4')}</dt><dd class="code">${esc(tk.buyer4)}</dd><dt>${t('vf.share')}</dt><dd>${esc(t('cert.decimals', { n: T.n(tk.share) }))}</dd><dt>${t('vf.issued')}</dt><dd>${esc(T.dt(tk.issuedAt))}</dd><dt>${t('pv.result')}</dt><dd>${t(tk.verdict === 'warn' ? 'pv.vwarn' : 'pv.vpass')}</dd></dl>`;
  function tokenResult(r) {
    return `<div class="tok ${r.ok ? 'ok' : 'bad'}">${r.ok ? I.check : I.x}<div><b>${t(r.ok ? 'pv.valid' : 'pv.invalid')}</b><span>${esc(tokenHow(r))}</span></div></div>${r.ok ? tokenRows(r.token) : ''}`;
  }

  function publicVerifyView() {
    const r = S.publicResult;
    return `<div class="pv">
      <header class="appbar"><div class="ab-l"><div class="ab-title">${t('pv.title')}</div><div class="ab-sub">Dag, ${esc(T.lang === 'bn' ? 'দাগ' : 'LandTech 2026')}</div></div><button class="ab-btn lang-mini" data-action="lang">${t('hdr.lang')}</button></header>
      <main class="content" id="content" data-tab="pv">
        ${r ? `<section class="pv-hero ${r.ok ? 'ok' : 'bad'}" id="pv-result"><div class="big">${r.ok ? I.check : I.x}</div><b>${t(r.ok ? 'pv.valid' : 'pv.invalid')}</b><span>${esc(tokenHow(r))}</span></section>
          ${r.ok ? `<div class="card">${tokenRows(r.token)}</div><p class="fine left">${t('pv.compare')}</p>` : ''}` : `<div class="hint">${t('common.loading')}</div>`}
        <button class="btn ghost block" id="pv-back" data-action="pv-back">${t('pv.back')}</button>
      </main></div>`;
  }

  const VIEWS = { counter: counterView, mouza: mouzaView, land: landView, acland: aclandView, bank: bankView, verify: verifyView };

  // ---------- certificate (outside the phone, printable) ----------
  async function openCert(id) {
    const v = await api.get(`/api/verify/${id}`);
    const p = v.payload;
    const host = $('#cert');
    host.innerHTML = `<div class="cert" id="cert-doc">
      <div class="cert-top"><div class="cert-brand">${I.logo}<div><b>${t('cert.title')}</b><span>${t('cert.sub')}</span></div></div>
        <div class="cert-id"><span>${t('cert.id')}</span><b class="code">${esc(v.id)}</b></div></div>
      <div class="cert-band ${p.verdict === 'warn' ? 'warn' : 'pass'}">${t(p.verdict === 'warn' ? 'cert.bandWarn' : 'cert.bandPass')}</div>
      <div class="cert-grid">
        <dl class="kv">
          <dt>${t('vf.office')}</dt><dd>${esc(P(p, 'office'))}</dd><dt>${t('vf.mouza')}</dt><dd>${esc(P(p, 'mouza'))}</dd><dt>${t('vf.dag')}</dt><dd>${esc(T.d(p.dag))}</dd><dt>${t('vf.share')}</dt><dd>${esc(t('cert.decimals', { n: T.n(p.share) }))}</dd>
          <dt>${t('vf.seller')}</dt><dd>${esc(P(p.seller, 'name'))}, ${t('vf.nid')} ${esc(T.d(p.seller.nid))}</dd><dt>${t('vf.buyer')}</dt><dd>${esc(P(p.buyer, 'name'))}, ${t('vf.nid')} ${esc(T.d(p.buyer.nid))}</dd>
          <dt>${t('vf.issued')}</dt><dd>${esc(T.dt(p.issuedAt))}</dd><dt>${t('cert.validUntil')}</dt><dd>${esc(T.dt(p.validUntil))}</dd><dt>${t('cert.request')}</dt><dd class="code">${esc(p.requestId)}</dd>
        </dl>
        <div class="cert-qr">${qrSvg(qrUrl(v.qrToken))}<small>${t('cert.qr')}</small></div>
      </div>
      ${p.warnings.length ? `<div class="cert-sec"><h4>${t('cert.warnings')}</h4><ol>${p.warnings.map((w) => `<li><b>${esc(w.code)}</b> ${esc(T.lang === 'bn' ? w.bn : w.en)}</li>`).join('')}</ol>${p.officerNote ? `<p><b>${t('cert.note')}:</b> ${esc(p.officerNote)}</p>` : ''}</div>` : ''}
      <div class="cert-sec sigbox"><h4>${esc(t('cert.sig', { key: v.keyId }))}: <span class="${v.valid ? 'ok' : 'bad'}">${t(v.valid ? 'common.valid' : 'common.invalid')}</span></h4><code>${esc(v.signature)}</code>
        <p>${t('cert.sigBody')}</p><code>GET /api/verify/${esc(v.id)}</code></div>
      <div class="cert-foot">${t('cert.foot')}</div>
    </div>
    <div class="cert-actions"><button class="btn ghost" data-cert="close">${I.x}${t('common.close')}</button><button class="btn primary" data-cert="print">${I.doc}${t('cert.print')}</button></div>`;
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
  async function refreshAlerts(quiet) {
    if (!has('owner')) return;
    const r = await api.get('/api/owner/alerts', { quiet: quiet !== false });
    S.alerts = r.alerts;
    S.unread = r.unread;
  }
  async function refreshOwner(quiet) {
    const [d] = await Promise.all([api.get('/api/owner/dags', { quiet }), refreshAlerts(quiet)]);
    S.dags = d;
  }
  async function refreshDesk(quiet) {
    const d = await api.get('/api/bank/desk', { quiet });
    S.loan.presets = d.presets;
    S.loan.charges = d.charges;
    if (S.loan.reg) S.loan.reg = d.charges.find((c) => c.id === S.loan.reg.id) || S.loan.reg;
  }

  async function afterLogin(r, opts) {
    opts = opts || {};
    if (r.token) api.setToken(r.token);
    S.user = r.user;
    S.ctx = r.context;
    S.sheet = false;
    S.login = { phone: '', error: null, busy: false, typing: false, picked: null };
    emit('login.' + r.user.role);
    userChanged();
    if (has('subregistrar') && !S.presets.length) S.presets = (await api.get('/api/counter/presets', { quiet: true })).presets;
    if (has('owner')) {
      await refreshAlerts(true);
      S.seen = new Set(S.alerts.map((a) => a.id));
    }
    const want = opts.tab && tabs().includes(opts.tab) ? opts.tab : tabs()[0];
    await go(want, { quiet: true });
    if (has('owner')) {
      const pending = S.alerts.find((a) => a.actionRequired && !a.response) || S.alerts.find((a) => !a.read);
      if (pending) setTimeout(() => showPush(pending), 500);
    }
  }

  // ---------- actions ----------
  async function doLogin(phone, password) {
    if (S.login.busy) return;
    S.login.error = null;
    S.login.phone = phone;
    S.login.busy = true;
    render();
    try {
      const r = await api.post('/api/auth/login', { phone, password });
      await afterLogin(r);
      toast(t('toast.login', { name: P(r.user, 'name') }));
    } catch (e) {
      S.login.busy = false;
      S.login.error = errText(e);
      render();
    }
  }

  // Type the account's number and password into the login form, then log in.
  async function autofill(accountId) {
    if (S.user || S.login.typing) return;
    const acc = S.accounts.find((a) => a.id === accountId) || S.accounts[0];
    S.login.typing = true;
    S.login.picked = acc.id;
    S.login.error = null;
    S.login.phone = '';
    render();
    const ph = $('#lg-phone');
    const pw = $('#lg-pass');
    ph.focus();
    for (const ch of acc.phone) {
      ph.value += ch;
      await sleep(38);
    }
    pw.focus();
    for (const ch of S.password) {
      pw.value += ch;
      await sleep(46);
    }
    const btn = $('#login-btn');
    if (btn) btn.classList.add('pulse');
    await sleep(320);
    S.login.typing = false;
    await doLogin(ph.value, pw.value);
  }

  // Inside the app: log out and in as another account, without the typing.
  async function switchTo(accountId, opts) {
    const acc = S.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    if (!S.user) return autofill(accountId);
    if (S.user.id === accountId) {
      S.sheet = false;
      if (opts && opts.tab && tabs().includes(opts.tab)) await go(opts.tab);
      else render();
      return;
    }
    S.sheet = false;
    S.switching = acc;
    hidePush();
    render();
    try {
      await api.post('/api/auth/logout', {}, { quiet: true });
    } catch (e) {
      /* already out */
    }
    api.setToken(null);
    await sleep(450);
    try {
      const r = await api.post('/api/auth/login', { phone: acc.phone, password: S.password });
      S.switching = null;
      await afterLogin(r, opts);
    } catch (e) {
      S.switching = null;
      S.user = null;
      S.login.error = errText(e);
      render();
    }
  }

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch (e) {
      /* already gone */
    }
    api.setToken(null);
    Object.assign(S, { user: null, sheet: false, result: null, presetId: null, form: blankForm(), verify: null, tamper: null, error: null, alerts: [], unread: 0, smsOut: [] });
    hidePush();
    render();
    userChanged();
  }

  async function go(tab, opts) {
    if (!S.user || !tabs().includes(tab)) return;
    const quiet = !!(opts && opts.quiet);
    S.tab = tab;
    try {
      if (tab === 'counter' && S.result) {
        const before = S.result.status;
        S.result = await api.get(`/api/counter/requests/${S.result.id}`, { quiet });
        if (S.result.status !== before) S.open = autoOpen(S.result);
      }
      if (tab === 'mouza') S.map = await api.get('/api/mouza', { quiet });
      if (tab === 'land') {
        await refreshOwner(quiet);
        if (S.alerts.some((a) => !a.read)) {
          await api.post('/api/owner/alerts/read-all', {}, { quiet: true });
          S.unread = S.alerts.filter((a) => a.actionRequired && !a.response).length;
        }
      }
      if (tab === 'acland') {
        const [c, r] = await Promise.all([api.get('/api/acland/cases', { quiet }), api.get('/api/acland/reconciliation', { quiet })]);
        S.cases = c.cases;
        S.recon = r;
      }
      if (tab === 'bank') {
        const [, o] = await Promise.all([refreshDesk(quiet), api.get('/api/oracle/log', { quiet })]);
        S.oracleLog = o.log;
      }
      if (tab === 'verify') {
        S.verifyList = await api.get('/api/verify/clearances', { quiet });
        S.audit = OFFICER.some(has) ? await api.get('/api/audit', { quiet }) : null;
      }
      if (tab !== 'land') await refreshAlerts(true);
    } catch (e) {
      if (e.status === 401) return sessionEnded(e);
      toast(errText(e), 'err');
    }
    render();
    const c = $('#content');
    if (c) c.scrollTop = 0;
  }

  function sessionEnded(e) {
    api.setToken(null);
    S.user = null;
    S.login.error = errText(e);
    render();
  }

  async function preset(id) {
    try {
      S.presets = (await api.get('/api/counter/presets', { quiet: true })).presets;
    } catch (e) {
      /* keep the list we have */
    }
    const p = S.presets.find((x) => x.id === Number(id));
    if (!p) return;
    S.presetId = p.id;
    S.form = { dag: p.dag, share: String(p.share), sellerNid: p.sellerNid, sellerName: P(p, 'sellerName'), buyerNid: p.buyerNid, buyerName: P(p, 'buyerName') };
    S.result = null;
    S.error = null;
    S.smsOut = [];
    render();
  }

  const autoOpen = (r) => new Set(r.checks.filter((c) => c.verdict === 'block' || c.verdict === 'warn' || c.verdict === 'hold').map((c) => c.code));
  function suggestNote(r) {
    const w = r.checks.filter((c) => c.verdict === 'warn').map((c) => c.code);
    if (w.includes('C8')) return t('note.c8');
    if (w.includes('C1')) return t('note.c1');
    return t('note.c6');
  }
  function setResult(r, preset) {
    S.result = r;
    S.fresh = true;
    S.open = autoOpen(r);
    if (r.status === 'warn') S.note = suggestNote(r);
    if (preset) emit(`s${preset}.${r.verdict}`);
  }

  async function run() {
    if (S.busy) return;
    S.busy = true;
    S.error = null;
    S.result = null;
    S.smsOut = [];
    render();
    try {
      const r = await api.post('/api/counter/clearance', S.form);
      S.resultPreset = S.presetId;
      setResult(r.request, S.presetId);
      S.smsOut = r.alertsSent.filter((a) => !S.user.personId || a.toPersonId !== S.user.personId);
    } catch (e) {
      S.error = errText(e);
    }
    S.busy = false;
    render();
    scrollInPhone($('#verdict'));
  }

  async function execute() {
    try {
      const r = await api.post(`/api/counter/requests/${S.result.id}/execute`);
      S.result = r.request;
      S.smsOut = r.alertsSent.filter((a) => !S.user.personId || a.toPersonId !== S.user.personId);
      if (S.resultPreset) emit(`s${S.resultPreset}.exec`);
      render();
      scrollInPhone($('#done-card'));
    } catch (e) {
      if (e.status === 409 && e.body && e.body.request) {
        setResult(e.body.request);
        S.smsOut = (e.body.alertsSent || []).filter((a) => a.toPersonId !== S.user.personId);
        render();
        scrollInPhone($('#verdict'));
      }
      toast(errText(e), 'err');
    }
  }

  async function proceed() {
    const note = ($('#note') ? $('#note').value : S.note).trim();
    S.note = note;
    try {
      const r = await api.post(`/api/counter/requests/${S.result.id}/proceed`, { note });
      S.result = r;
      if (S.resultPreset) emit(`s${S.resultPreset}.issued`);
      render();
      scrollInPhone($('#clr-card'));
      toast(t('toast.issuedWarn'));
    } catch (e) {
      toast(errText(e), 'err');
    }
  }

  async function expireNotice() {
    const r = await api.post(`/api/counter/requests/${S.result.id}/expire-notice`);
    setResult(r);
    emit('notice.expired');
    render();
    scrollInPhone($('#verdict'));
    toast(t('toast.noticeEnded'));
  }

  async function respond(id, answer) {
    const r = await api.post(`/api/owner/alerts/${id}/respond`, { answer });
    if (r.charge) {
      emit(answer === 'not_me' ? 'mortgage.not_me' : 'mortgage.me');
      toast(t(answer === 'not_me' ? 'toast.mortStopped' : 'toast.mortOk'));
    } else {
      emit(answer === 'not_me' ? 'owner.not_me' : 'owner.me');
      toast(t(answer === 'not_me' ? 'toast.deedStopped' : 'toast.deedOk'));
    }
    await refreshOwner(true);
    render();
  }

  async function respondLatest(answer) {
    await refreshOwner(true);
    const a = S.alerts.find((x) => x.actionRequired && !x.response);
    if (!a) return false;
    if (S.tab !== 'land') await go('land');
    else render();
    highlight(`#respond-${answer === 'me' ? 'me' : 'no'}-${a.id}`);
    await sleep(800);
    await respond(a.id, answer);
    return true;
  }

  async function setLock(dag, on) {
    await api.post(`/api/owner/dags/${dag}/lock`, { on });
    await refreshOwner(true);
    render();
    toast(t(on ? 'land.lockedToast' : 'land.unlockedToast', { dag: T.d(dag) }));
  }

  async function approve(id) {
    const r = await api.post(`/api/acland/cases/${id}/approve`);
    const [c, rec] = await Promise.all([api.get('/api/acland/cases', { quiet: true }), api.get('/api/acland/reconciliation', { quiet: true })]);
    S.cases = c.cases;
    S.recon = rec;
    emit('acland.approve');
    render();
    toast(t('ac.approvedToast', { kh: r.case.newKhatian }));
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
    try {
      S.mapCharge[no] = await api.post(`/api/mouza/${no}/charge`);
      emit('mouza.ask');
      render();
      scrollInPhone($(`#charge-${no}`), 140);
    } catch (e) {
      toast(errText(e), 'err');
    }
  }

  async function useDag(no) {
    const d = S.map && S.map.dags.find((x) => x.no === no);
    if (!d) return;
    S.presetId = null;
    S.form = { dag: d.no, share: '', sellerNid: '', sellerName: d.holders[0] ? P(d.holders[0], 'name') : '', buyerNid: '', buyerName: '' };
    S.result = null;
    S.error = null;
    await go('counter');
    toast(t('map.loaded', { no: T.d(no) }));
    highlight('#f-sellerNid');
  }

  function loanPreset(id) {
    const p = S.loan.presets.find((x) => x.id === Number(id));
    if (!p) return;
    S.loan.presetId = p.id;
    S.loan.form = { dag: p.dag, borrowerNid: p.borrowerNid, borrowerName: P(p, 'borrowerName'), amount: String(p.amount) };
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
      S.oracleLog = (await api.get('/api/oracle/log', { quiet: true })).log;
    } catch (e) {
      L.error = errText(e);
    }
    L.busy = false;
    render();
    scrollInPhone($('#loan-result'), 70);
  }

  async function loanRegister() {
    const L = S.loan;
    try {
      const r = await api.post('/api/bank/charges', L.form);
      L.reg = r.charge;
      if (L.presetId) emit(`loan${L.presetId}.${r.charge.status}`);
      await refreshDesk(true);
      render();
      scrollInPhone($('#loan-reg'), 70);
    } catch (e) {
      toast(errText(e), 'err');
    }
  }

  async function openVerify(id) {
    if (S.tab !== 'verify') await go('verify');
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

  async function tokenCheck() {
    const raw = ($('#token-input') ? $('#token-input').value : S.tokenInput).trim();
    S.tokenInput = raw;
    const m = raw.match(/#v=([^\s]+)/);
    S.tokenCheck = await checkToken(m ? decodeURIComponent(m[1]) : raw);
    render();
  }

  // ---------- public verify page (opened by scanning the QR) ----------
  async function showPublic(token) {
    S.publicToken = token;
    S.publicResult = null;
    render();
    S.publicResult = await checkToken(token);
    if (S.publicResult.ok) emit('qr.open');
    render();
  }
  function readHash() {
    const m = location.hash.match(/^#v=(.+)$/);
    if (m) {
      showPublic(decodeURIComponent(m[1]));
      return true;
    }
    if (S.publicToken) {
      S.publicToken = null;
      S.publicResult = null;
      render();
    }
    return false;
  }
  function openQr(token) {
    location.hash = 'v=' + encodeURIComponent(token);
  }
  function closeQr() {
    history.replaceState(null, '', location.pathname + location.search);
    S.publicToken = null;
    S.publicResult = null;
    render();
  }

  async function reset() {
    await api.post('/api/demo/reset');
    clearEvents();
    Object.assign(S, {
      result: null, presetId: null, resultPreset: null, form: blankForm(), verify: null, tamper: null, note: '', error: null, smsOut: [],
      cases: [], recon: null, map: null, selDag: null, mapCharge: {}, verifyList: [], oracleLog: [], audit: null, tokenCheck: null, tokenInput: '',
      loan: { presets: [], charges: [], form: blankLoan(), presetId: null, check: null, reg: null, busy: false, error: null },
      seen: new Set(), sheet: false,
    });
    hidePush();
    closeCert();
    if (S.user) {
      if (has('owner')) {
        await refreshAlerts(true);
        S.seen = new Set(S.alerts.map((a) => a.id));
      }
      await go(tabs()[0], { quiet: true });
    } else {
      render();
    }
    toast(t('toast.reset'));
  }

  // ---------- live updates: SMS to this phone, answers from another phone ----------
  let polling = false;
  async function poll() {
    if (!S.user || polling || document.hidden || S.switching) return;
    polling = true;
    try {
      if (has('owner')) {
        const r = await api.get('/api/owner/alerts', { quiet: true });
        const fresh = r.alerts.filter((a) => !S.seen.has(a.id));
        fresh.forEach((a) => S.seen.add(a.id));
        const changed = fresh.length || r.unread !== S.unread;
        S.alerts = r.alerts;
        S.unread = r.unread;
        if (fresh.length) {
          fresh.sort((a, b) => PRIO[a.level] - PRIO[b.level]);
          showPush(fresh[0]);
          if (S.tab === 'land') await refreshOwner(true);
        }
        if (changed) render();
      }
      if (has('subregistrar') && S.result && S.result.status === 'hold' && S.tab === 'counter') {
        const r = await api.get(`/api/counter/requests/${S.result.id}`, { quiet: true });
        if (r.status !== S.result.status) {
          setResult(r);
          render();
          toast(t('toast.ownerAnswered'));
        }
      }
      if (has('bank') && S.loan.reg && S.loan.reg.status === 'held' && S.tab === 'bank') {
        const before = S.loan.reg.status;
        await refreshDesk(true);
        if (S.loan.reg.status !== before) render();
      }
    } catch (e) {
      /* next tick */
    } finally {
      polling = false;
    }
  }

  // ---------- events ----------
  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    if (el.tagName === 'A') e.preventDefault();
    try {
      switch (d.action) {
        case 'pick-account': await autofill(d.id); break;
        case 'wake-skip': api.skipWake(); break;
        case 'lang': T.toggle(); break;
        case 'sheet': S.sheet = true; render(); break;
        case 'sheet-close': S.sheet = false; render(); break;
        case 'switch': await switchTo(d.id, { tab: d.tab }); break;
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
        case 'expire': await expireNotice(); break;
        case 'lock': await setLock(d.dag, d.on === 'true'); break;
        case 'respond': await respond(d.id, d.answer); break;
        case 'approve': await approve(d.id); break;
        case 'pick-dag': await pickDag(d.dag); break;
        case 'ask-bank': await askBank(d.dag); break;
        case 'use-dag': await useDag(d.dag); break;
        case 'loan-preset': loanPreset(d.id); break;
        case 'loan-check': await loanCheck(); break;
        case 'loan-register': await loanRegister(); break;
        case 'verify-open': await openVerify(d.id); break;
        case 'tamper': await tamper(); break;
        case 'token-check': await tokenCheck(); break;
        case 'cert': await openCert(d.id); break;
        case 'open-qr': openQr(d.token); break;
        case 'pv-back': closeQr(); break;
        default: break;
      }
    } catch (err) {
      if (err.status === 401) return sessionEnded(err);
      toast(errText(err), 'err');
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
    if (e.target.id === 'token-input') S.tokenInput = e.target.value;
  }

  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.plot')) {
      e.preventDefault();
      pickDag(e.target.dataset.dag);
    }
    if (e.key === 'Escape' && S.sheet) {
      S.sheet = false;
      render();
    }
  }

  function tick() {
    const c = $('#clock');
    if (c) c.textContent = Dag.fmt.time(new Date().toISOString(), T.lang);
  }

  async function init() {
    tick();
    setInterval(tick, 15000);
    const view = $('#view');
    view.addEventListener('click', onClick);
    view.addEventListener('submit', onSubmit);
    view.addEventListener('input', onInput);
    view.addEventListener('keydown', onKey);
    $('#push').addEventListener('click', () => {
      hidePush();
      if (S.user && has('owner')) go('land');
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
    window.addEventListener('hashchange', readHash);
    T.on(() => {
      if (S.presetId) {
        const p = S.presets.find((x) => x.id === S.presetId);
        if (p) Object.assign(S.form, { sellerName: P(p, 'sellerName'), buyerName: P(p, 'buyerName') });
      }
      if (S.loan.presetId) {
        const p = S.loan.presets.find((x) => x.id === S.loan.presetId);
        if (p) S.loan.form.borrowerName = P(p, 'borrowerName');
      }
      tick();
      render();
      if (!$('#cert').hidden && S.verify) openCert(S.verify.id);
    });
    api.onStatus(() => {
      if (!S.booted) render();
    });

    render();
    if (readHash()) {
      /* the verify page shows first; the app loads behind it */
    }
    await api.ready;
    try {
      const a = await api.get('/api/demo/accounts', { quiet: true });
      S.accounts = a.accounts;
      S.password = a.password;
    } catch (e) {
      S.accounts = Dag.seed.accounts();
    }
    S.booted = true;
    if (api.hasToken()) {
      try {
        const me = await api.get('/api/me', { quiet: true });
        await afterLogin({ user: me.user, context: me.context });
      } catch (e) {
        api.setToken(null);
        render();
      }
    } else {
      render();
    }
    let as = null;
    try {
      as = sessionStorage.getItem('dag-as');
      sessionStorage.removeItem('dag-as');
    } catch (e) {
      as = null;
    }
    if (as && !S.user) {
      const acc = S.accounts.find((x) => x.role === as || x.id === as);
      if (acc) setTimeout(() => autofill(acc.id), 500);
    }
    setInterval(poll, 3500);
  }

  // ---------- interface for the guide and autoplay ----------
  window.DagApp = {
    go, preset, presetNeed, highlight, autofill, switchTo, reset, toast,
    run, execute, proceed, expireNotice, respondLatest, approve, pickDag, askBank,
    loanPreset, loanCheck, loanRegister, openVerify, tamper, openCert, closeCert, openQr, closeQr,
    user: () => S.user,
    accounts: () => S.accounts,
    booted: () => S.booted,
    loggedIn: () => !!S.user,
    tab: () => S.tab,
    firstCase: () => (S.cases.find((c) => c.status === 'opened') || {}).id,
    oldestClearance: () => (S.verifyList[S.verifyList.length - 1] || {}).id,
    latestClearance: () => (S.result && S.result.clearance ? S.result.clearance.id : null),
    latestQr: () => (S.result && S.result.clearance ? S.result.clearance.qrToken : null),
    resultStatus: () => (S.result ? S.result.status : null),
    events: { has: (n) => events.has(n), on: (fn) => evListeners.add(fn) },
    roleColor: (role) => ROLE_COLOR[role],
  };

  init();
})();
