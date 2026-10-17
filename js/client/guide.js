/*
 * The judge's guide, beside the phone.
 * Walkthrough (steps that drive the phone), How it works, and a live API log.
 */
(function () {
  'use strict';
  const Dag = window.Dag;
  const App = window.DagApp;
  const api = Dag.api;
  const I = Dag.icons;
  const D = Dag.DEMO;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const json = (v) => esc(JSON.stringify(v, null, 2));

  const G = { tab: 'steps', open: new Set(), latest: null };

  async function ensureLogin() {
    if (!App.loggedIn()) await App.autofill();
  }
  async function scenario(n, sel) {
    await ensureLogin();
    await App.go('counter');
    App.preset(n);
    setTimeout(() => App.highlight(sel || '#run-btn'), 120);
  }

  const STEPS = [
    {
      id: 'login', title: 'Log in with the demo account', tag: 'Start', tagClass: 'p',
      do: ['Press <b>Autofill and log in</b> at the top of this panel, or <b>Use demo account</b> on the phone.', `The phone number <code class="k">${D.phone}</code> and password <code class="k">${D.password}</code> type themselves in.`],
      expect: 'You land on the clearance counter of a fictional Sub-Registry office.',
      why: 'In production each role (officer, owner, AC Land, bank) has its own login. This demo account holds all four, so you can see every side from one phone.',
      done: ['login'], cta: 'Autofill and log in',
      go: () => ensureLogin(),
    },
    {
      id: 's1', title: 'An honest sale clears in seconds', tag: 'P4', tagClass: 'p',
      do: ['On <b>Counter</b>, tap scenario <b>1 Honest sale</b>.', 'Tap <b>Run clearance checks</b>.', 'Then tap <b>Execute deed</b>.'],
      expect: 'PASS on all nine checks and a signed clearance with a QR code. A notification drops in: the owner is told a deed on his dag was checked. After Execute, a deed number is issued and a namjari case opens by itself.',
      why: 'The citizen never files a namjari application. The registration event opens the case at AC Land, which is the link P4 asks for.',
      done: ['s1.exec'], go: () => scenario(1),
    },
    {
      id: 's2', title: 'The same land, sold a second time', tag: 'P3', tagClass: 'p',
      do: ['Tap scenario <b>2 Same land, sold again</b>, then <b>Run clearance checks</b>.', 'Look at the C2 box.'],
      expect: 'BLOCK on C2 Area ledger: dag area 12.00, already sold 10.00, available 2.00, requested 10.00, short by 8.00. If you skipped Execute in step 2, C3 blocks instead, because a deed on this dag is still in progress.',
      why: 'Double selling is caught by arithmetic before anyone signs. There is nothing to argue about later in court.',
      done: ['s2.block'], go: () => scenario(2),
    },
    {
      id: 's3', title: 'Land the government already acquired', tag: 'P5', tagClass: 'p',
      do: ['Tap scenario <b>3 Acquired land</b> and run it.'],
      expect: 'BLOCK on C5: the dag sits in LA case 07/2019 for a bypass road. The result carries an appeal reference.',
      why: 'Lists can be wrong. In Telangana thousands of private plots landed on a prohibited list by mistake, so every block here comes with an appeal route that is logged.',
      done: ['s3.block'], go: () => scenario(3),
    },
    {
      id: 's4', title: 'Owner Lock stops an impostor', tag: 'New idea 1', tagClass: 'new',
      do: ['Tap scenario <b>4 Impostor, locked dag</b> and run it. Someone with a copy of Karim Mia\'s NID tries to sell his locked dag 418.', 'A notification drops onto the phone. Tap it (or the bell) and answer <b>No, not me</b>.', 'Go back to the <b>Counter</b> tab.'],
      expect: 'First HELD, with a 48 hour owner notice. After the owner says no, the same request turns to BLOCK: the owner denied this deed.',
      why: 'Today the real owner often finds out years later, when he goes to pay khajna. With Owner Lock he finds out before the signature, on his own phone.',
      done: ['owner.not_me', 'owner.me'], go: () => scenario(4),
    },
    {
      id: 's5', title: 'A mortgage the buyer cannot see', tag: 'New idea 2', tagClass: 'new',
      do: ['Tap scenario <b>5 Hidden mortgage</b> and run it.', 'Open the <b>Verify</b> tab and look at <b>Bank side</b>.'],
      expect: 'BLOCK on C9: a live bank charge since 12 Mar 2024. The bank side shows what left the bank: one signed yes/no, a date and the lender. The loan amount and borrower data stayed inside.',
      why: 'Bangladesh Bank cannot open CIB data to the public under the Bangladesh Bank Order. A one-bit signed answer needs no change to that law.',
      done: ['s5.block'], go: () => scenario(5),
    },
    {
      id: 's6', title: 'A warning, not a block', tag: 'P4', tagClass: 'p',
      do: ['Tap scenario <b>6 Tax due, survey gap</b> and run it.', 'Read the suggested note, then tap <b>Proceed with note</b>.'],
      expect: 'WARN: land tax due for 3 years, and the survey chain has no RS dag. After the note, a clearance is issued with both warnings printed on it.',
      why: 'Not every problem should stop a sale. Warnings are recorded and signed, so nobody can say later they were never seen.',
      done: ['s6.issued'], go: () => scenario(6),
    },
    {
      id: 'verify', title: 'Prove a clearance is real, then forge one', tag: 'P2', tagClass: 'p',
      do: ['On <b>Verify</b>, tap the clearance from step 2.', 'Tap <b>Tamper test</b>.'],
      expect: 'First a valid Ed25519 signature. The tamper test adds 2 decimals to the share and keeps the same signature: INVALID. The audit chain below shows intact.',
      why: 'An edited or photocopied clearance fails at the bank, at AC Land, or on the buyer\'s phone.',
      done: ['verify.tamper'],
      go: async () => {
        await ensureLogin();
        await App.go('verify');
        setTimeout(() => {
          if (!App.highlight('.vrow:last-of-type')) App.toast('Run scenario 1 first, so there is a clearance to check.');
        }, 120);
      },
    },
    {
      id: 'acland', title: 'Close the loop at AC Land', tag: 'P4', tagClass: 'p',
      do: ['On <b>AC Land</b>, tap <b>Approve and correct khatian</b> on the case from step 2.', 'Open <b>My land</b>.'],
      expect: 'The case shows a new khatian for Selina Akter. On My land, Karim Mia now holds 2.00 decimals of dag 412.',
      why: 'The deed and the record of rights end up saying the same thing. That gap is the one the brief describes.',
      done: ['acland.approve'],
      go: async () => {
        await ensureLogin();
        await App.go('acland');
        setTimeout(() => {
          if (!App.highlight('.approve-btn')) App.toast('Execute the deed in step 2 first. Its case appears here.');
        }, 120);
      },
    },
  ];

  // ---------- views ----------
  function head() {
    return `<div class="g-head">
      <div class="g-brand">${I.logo}<div class="nm"><b>Dag <span>দাগ</span></b><div>Demo guide for judges</div></div><span class="g-team">Silicon Knights &middot; LandTech 2026</span></div>
      <p class="g-lede">A clearance gate in front of land registration. It checks a deed before anyone signs it, opens namjari by itself afterwards, warns the real owner on his phone, and asks the bank one signed yes/no question about mortgages. Problem P4, plus two ideas of our own.</p>
      <div class="g-actions">
        <button class="btn primary small" data-g="autofill" id="g-autofill">${I.key}Autofill and log in</button>
        <button class="btn ghost small" data-g="reset">${I.reset}Reset demo</button>
      </div>
      <div class="g-cred">Demo login: phone <code>${esc(D.phone)}</code> &middot; password <code>${esc(D.password)}</code></div>
      <button class="g-last" id="g-last" data-g="tab" data-tab="api">${lastLine()}</button>
    </div>
    <nav class="g-tabs" role="tablist">
      <button data-g="tab" data-tab="steps" class="${G.tab === 'steps' ? 'on' : ''}">Walkthrough</button>
      <button data-g="tab" data-tab="how" class="${G.tab === 'how' ? 'on' : ''}">How it works</button>
      <button data-g="tab" data-tab="api" class="${G.tab === 'api' ? 'on' : ''}">API log <span class="g-count" id="g-count">${api.entries().length}</span></button>
    </nav>
    <div class="g-body" id="g-body"></div>`;
  }

  function lastLine() {
    const e = G.latest;
    if (!e) return '<span class="ms" style="margin:0">Every call the phone makes shows up here. Waiting for the first one.</span>';
    return `<span class="m">${e.method}</span><span>${esc(e.path)}</span><span class="s${String(e.status)[0]}">${e.status}</span><span class="ms">${e.ms} ms &middot; open log</span>`;
  }

  function stepsView() {
    const isDone = (s) => s.done.some((d) => App.events.has(d));
    const doneCount = STEPS.filter(isDone).length;
    const next = STEPS.find((s) => !isDone(s));
    let h = `<div class="prog"><span>${doneCount} of ${STEPS.length} done</span><span class="bar"><i style="width:${(doneCount / STEPS.length) * 100}%"></i></span></div>`;
    h += STEPS.map((s, i) => {
      const done = isDone(s);
      const isNext = next && next.id === s.id;
      return `<article class="step${done ? ' done' : ''}${isNext ? ' next' : ''}" id="step-${s.id}">
        <div class="st-n">${done ? I.check : i + 1}</div>
        <div class="st-b">
          <div class="st-h"><h3>${s.title}</h3><span class="st-tag t-${s.tagClass}">${s.tag}</span></div>
          <ul class="st-do">${s.do.map((d) => `<li>${d}</li>`).join('')}</ul>
          <p class="st-exp"><b>You should see</b>${s.expect}</p>
          <p class="st-why"><b>Why it matters</b>${s.why}</p>
          <button class="btn small ${isNext ? 'primary' : 'ghost'}" data-g="go" data-step="${s.id}">${done ? 'Do it again' : s.cta || 'Take me there'} ${I.arrow}</button>
        </div></article>`;
    }).join('');
    if (!next) h += `<div class="callout" style="margin-bottom:12px"><b>All nine steps done.</b> Press Reset demo to run it again from a clean record.</div>`;
    h += `<div class="free"><h4>Free play</h4><ul>
      <li>Dag <code class="k">440</code>, seller NID <code class="k">9990001011</code>: a court has ordered status quo (C6).</li>
      <li>Dag <code class="k">447</code>, seller NID <code class="k">9990001012</code>: the seller never did namjari after inheriting (C4).</li>
      <li>Dag <code class="k">999</code>: does not exist in the mouza.</li>
      <li>On <b>My land</b>, turn Owner Lock on for dag 412 and run scenario 1 again.</li></ul></div>`;
    return h;
  }

  function howView() {
    return `<div class="how">
      <h3>What happens on one clearance request</h3>
      <ol>
        <li><b>The officer sends the deed</b> to <code class="k">POST /api/counter/clearance</code>: dag, seller NID, buyer, share.</li>
        <li><b>NID lookup</b> (mock) returns who that NID belongs to.</li>
        <li><b>The bank oracle</b> (mock CIB) answers "is there a live charge on this dag?" and signs the answer with its own key. The gate checks that signature.</li>
        <li><b>The rules engine runs all nine checks</b>, C1 to C9. It never stops at the first problem, so the officer sees every reason.</li>
        <li><b>The worst check decides</b>: BLOCK beats HELD beats WARN beats PASS.</li>
        <li><b>Owners who asked for alerts</b> get an SMS (mock). If the dag is locked, the answer they give feeds back into C8.</li>
        <li><b>On PASS the gate signs a clearance</b> (Ed25519 over canonical JSON) and prints it with a QR code.</li>
        <li><b>Every step is written to an audit chain.</b> Each entry holds the hash of the one before it, so a silent edit breaks the chain.</li>
        <li><b>On Execute</b> the deed is registered, the area ledger records the share as sold, and a namjari case opens at AC Land with no citizen application.</li>
      </ol>
      <h3>Architecture</h3>
      <div class="diagram">${diagram()}</div>
      <h3>The nine checks</h3>
      <table><thead><tr><th>Code</th><th>Check</th><th>Stops</th></tr></thead><tbody>
        <tr><td>C1</td><td>Seller in record</td><td>A seller whose NID is not on the khatian</td></tr>
        <tr><td>C2</td><td>Area ledger</td><td>Selling more than is left, counting sales not yet mutated</td></tr>
        <tr><td>C3</td><td>Pending deed lock</td><td>Two deeds on one dag at the same time</td></tr>
        <tr><td>C4</td><td>Khajna and mutation</td><td>A seller without namjari (block); unpaid LD tax (warn)</td></tr>
        <tr><td>C5</td><td>Government interest</td><td>Khas, acquired, waqf, debottar, vested land</td></tr>
        <tr><td>C6</td><td>Court injunction</td><td>A dag under a court order</td></tr>
        <tr><td>C7</td><td>Survey chain</td><td>Warns when CS, SA, RS, BS do not link up</td></tr>
        <tr class="add"><td>C8</td><td>Owner lock (new)</td><td>Any deed the real owner did not confirm on his phone</td></tr>
        <tr class="add"><td>C9</td><td>Encumbrance oracle (new)</td><td>Sale of land with a live bank charge</td></tr>
      </tbody></table>
      <h3>Security, in plain terms</h3>
      <ul>
        <li><b>Signed clearances.</b> Ed25519 over sorted-key JSON. Change one character and verification fails.</li>
        <li><b>Hash-chained audit log.</b> SHA-512 per entry, linked to the previous entry.</li>
        <li><b>One bit from the bank.</b> The oracle sends yes or no, a date and the lender. Never the amount or the borrower's other loans.</li>
        <li><b>Masked numbers.</b> Officers see the owner's phone as 018&bull;&bull;&bull;&bull;&bull;990. Passwords are stored as salted hashes and never written to the log.</li>
      </ul>
      <h3>What is real and what is mocked</h3>
      <table><thead><tr><th>Part</th><th>In this demo</th></tr></thead><tbody>
        <tr><td>Rules engine</td><td>Real, and covered by 13 automated tests</td></tr>
        <tr><td>Signatures</td><td>Real Ed25519 (TweetNaCl). Demo keys come from fixed seeds so old clearances still verify.</td></tr>
        <tr><td>Audit chain</td><td>Real SHA-512 hash chain</td></tr>
        <tr><td>NID service</td><td>Mock: a lookup in the fictional person list</td></tr>
        <tr><td>CIB oracle</td><td>Mock bank with its own signing key</td></tr>
        <tr><td>SMS</td><td>Mock: shown as a phone notification</td></tr>
        <tr><td>Records</td><td>Invented: one fictional mouza, 7 dags, 12 people</td></tr>
      </tbody></table>
      <div class="callout"><b>Where the backend runs.</b> In this build the gate's backend runs in your browser, behind one JSON boundary (<code class="k">js/client/api.js</code>). Every call is serialised both ways and shown in the API log, as it would be over HTTP, so the demo works from one static link with no server to wake up. Moving it behind a real server changes one function.</div>
    </div>`;
  }

  function diagram() {
    const box = (x, y, w, h, t, s, fill, stroke, dash) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${dash ? ' stroke-dasharray="4 3"' : ''}/><text x="${x + w / 2}" y="${y + (s ? h / 2 - 2 : h / 2 + 4)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#17201c">${t}</text>${s ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="9.5" fill="#7a8580">${s}</text>` : ''}`;
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#47524d" stroke-width="1.3" marker-end="url(#ga)"/>`;
    return `<svg viewBox="0 0 600 330" width="100%" role="img" aria-label="Architecture: phone app, API boundary, gate services, mocked external systems">
      <defs><marker id="ga" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="#47524d"/></marker></defs>
      ${box(10, 20, 120, 290, '', '', '#f1f6f3', '#9fd3b8')}
      <text x="70" y="40" text-anchor="middle" font-size="11" font-weight="700" fill="#0f3d2e">PHONE APP</text>
      ${box(22, 56, 96, 42, 'Counter', 'sub-registrar', '#fff', '#dde5e1')}
      ${box(22, 108, 96, 42, 'My land', 'owner', '#fff', '#dde5e1')}
      ${box(22, 160, 96, 42, 'AC Land', 'namjari', '#fff', '#dde5e1')}
      ${box(22, 212, 96, 42, 'Verify', 'bank, buyer', '#fff', '#dde5e1')}
      <rect x="150" y="20" width="34" height="290" rx="8" fill="#0f3d2e"/>
      <text x="167" y="165" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" transform="rotate(-90 167 165)">JSON API  /api/...</text>
      ${arrow(130, 165, 148, 165)}
      ${box(204, 20, 230, 290, '', '', '#fff', '#0f3d2e')}
      <text x="319" y="40" text-anchor="middle" font-size="11" font-weight="700" fill="#0f3d2e">DAG GATE</text>
      ${box(216, 52, 206, 40, 'Rules engine', 'C1 to C9, pure functions', '#f1f6f3', '#9fd3b8')}
      ${box(216, 100, 100, 40, 'Area ledger', 'shares sold', '#f1f6f3', '#9fd3b8')}
      ${box(322, 100, 100, 40, 'Lock and alert', 'owner phone', '#e7f0f8', '#bcd4e8')}
      ${box(216, 148, 100, 40, 'Signer', 'Ed25519 + QR', '#f1f6f3', '#9fd3b8')}
      ${box(322, 148, 100, 40, 'Audit chain', 'SHA-512 links', '#f1f6f3', '#9fd3b8')}
      ${box(216, 196, 206, 40, 'Record store', 'dags, holders, flags, cases', '#f1f6f3', '#9fd3b8')}
      ${box(216, 252, 206, 44, 'Event: deed registered', 'opens namjari at AC Land', '#e6f3ea', '#b9dcc5')}
      ${arrow(184, 165, 202, 165)}
      ${box(462, 34, 128, 46, 'NID service', 'mock', '#fdf8ef', '#c9a36a', true)}
      ${box(462, 96, 128, 46, 'CIB oracle', 'mock bank, own key', '#e7f0f8', '#1f5f8b', true)}
      ${box(462, 158, 128, 46, 'SMS gateway', 'mock', '#fdf8ef', '#c9a36a', true)}
      ${box(462, 220, 128, 46, 'AC Land system', 'namjari queue', '#fdf8ef', '#c9a36a', true)}
      ${arrow(434, 72, 460, 60)}${arrow(434, 120, 460, 119)}${arrow(434, 130, 460, 178)}${arrow(422, 274, 460, 246)}
      <text x="526" y="296" text-anchor="middle" font-size="9.5" fill="#7a8580">dashed = systems we do not own</text>
    </svg>`;
  }

  function apiView() {
    const list = api.entries();
    let h = `<div class="api-top"><span>Newest first. Each row shows the request, the steps inside the gate, and the response. Passwords and tokens are masked.</span><button class="btn ghost small" data-g="clear">Clear</button></div>`;
    if (!list.length) return h + '<div class="empty"><b>No calls yet</b>Log in on the phone and they appear here as they happen.</div>';
    h += list.map((e) => {
      const open = G.open.has(e.id);
      return `<div class="lg" id="lg-${e.id}"><button class="lg-h" data-g="log" data-id="${e.id}" aria-expanded="${open}"><span class="m ${e.method === 'POST' ? 'post' : ''}">${e.method}</span><span class="p">${esc(e.path)}</span><span class="s ${e.status < 400 ? 'ok' : 'bad'}">${e.status}</span><span class="ms">${e.ms} ms</span></button>
        ${open ? `<div class="lg-b">
          ${e.request !== undefined ? `<h5>Request body</h5><pre>${json(e.request)}</pre>` : ''}
          ${e.trace.length ? `<h5>Inside the gate, ${e.trace.length} step${e.trace.length > 1 ? 's' : ''}</h5><ol class="trace">${e.trace.map((t) => `<li><b>${esc(t.to)}</b><code>${esc(t.call)}</code>${t.data ? `<pre>${json(t.data)}</pre>` : ''}</li>`).join('')}</ol>` : ''}
          <h5>Response ${e.status}</h5><pre>${json(e.response)}</pre></div>` : ''}</div>`;
    }).join('');
    return h;
  }

  // ---------- render ----------
  function renderBody() {
    const body = $('#g-body');
    if (!body) return;
    const keep = body.dataset.tab === G.tab ? body.scrollTop : 0;
    body.dataset.tab = G.tab;
    body.innerHTML = G.tab === 'steps' ? stepsView() : G.tab === 'how' ? howView() : apiView();
    body.scrollTop = keep;
  }
  function render() {
    $('#guide').innerHTML = head();
    renderBody();
  }

  async function onClick(e) {
    const el = e.target.closest('[data-g]');
    if (!el) return;
    const d = el.dataset;
    try {
      if (d.g === 'tab') {
        G.tab = d.tab;
        render();
        $('#g-body').scrollTop = 0;
      } else if (d.g === 'autofill') {
        if (App.loggedIn()) App.toast('Already logged in as the demo account.');
        else await App.autofill();
      } else if (d.g === 'reset') {
        await App.reset();
        api.clearLog();
        G.open.clear();
        G.latest = null;
        render();
      } else if (d.g === 'go') {
        const s = STEPS.find((x) => x.id === d.step);
        if (s) await s.go();
      } else if (d.g === 'log') {
        const id = Number(d.id);
        if (G.open.has(id)) G.open.delete(id);
        else G.open.add(id);
        renderBody();
      } else if (d.g === 'clear') {
        api.clearLog();
        G.open.clear();
        G.latest = null;
        render();
      }
    } catch (err) {
      App.toast(err.message, 'err');
    }
  }

  api.onLog((entry) => {
    if (entry) {
      G.latest = entry;
      G.open.clear();
      G.open.add(entry.id);
    }
    const last = $('#g-last');
    if (last) {
      last.innerHTML = lastLine();
      last.classList.remove('flash');
      void last.offsetWidth;
      last.classList.add('flash');
    }
    const count = $('#g-count');
    if (count) count.textContent = api.entries().length;
    if (G.tab === 'api') renderBody();
  });
  App.events.on(() => {
    if (G.tab === 'steps') renderBody();
  });

  $('#guide').addEventListener('click', onClick);
  render();
})();
