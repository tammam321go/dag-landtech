/* Inline SVG icons (stroke = currentColor) and the Dag mark. */
(function (root) {
  'use strict';
  const s = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  root.Dag = root.Dag || {};
  root.Dag.icons = {
    // The mark: one plot outlined among its neighbours, as on a mouza map.
    logo: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#0E3B2E"/><path d="M9 11.5 19 9.5 20.5 19 10.5 21Z" fill="#46A775"/><path d="M19 9.5 31 11 30 20.5 20.5 19M10.5 21 12 31 22 30 20.5 19M22 30 30.5 29 30 20.5" fill="none" stroke="#A9D8BF" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    counter: s('<path d="M4 20h16M6 20V10m12 10V10M3 10l9-6 9 6M10 14h4"/>'),
    map: s('<path d="M4 6.5 9.5 4l5 2.5L20 4v13.5L14.5 20l-5-2.5L4 20z"/><path d="M9.5 4v13.5M14.5 6.5V20"/>'),
    land: s('<path d="M3 20h18M5 20v-7l7-6 7 6v7"/><path d="M10 20v-4h4v4"/>'),
    folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13l2 2 4-4"/>'),
    bank: s('<path d="M3 9.5 12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>'),
    shield: s('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    bell: s('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    logout: s('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'),
    check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
    x: s('<path d="M6 6l12 12M18 6L6 18"/>', 2.6),
    alert: s('<path d="M12 8v5M12 16.5v.01"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', 2.1),
    clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 2.1),
    dash: s('<path d="M7 12h10"/>', 2.6),
    lock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.1),
    stamp: s('<path d="M9 4h6l-1 7h-4z"/><path d="M5 15a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5zM5 20h14"/>'),
    key: s('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>'),
    reset: s('<path d="M4 4v6h6"/><path d="M4.5 15a8 8 0 1 0 2-8.5L4 10"/>'),
    doc: s('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
    play: s('<path d="M8 5.5v13l10.5-6.5z"/>', 2),
    stop: s('<rect x="7" y="7" width="10" height="10" rx="1.5"/>', 2),
    users: s('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M15.5 4.8a3.2 3.2 0 0 1 0 6.4M18 14.4c1.6.7 2.6 2.2 3 4.6"/>'),
    phone: s('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    qr: s('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2"/>'),
    link: s('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    server: s('<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>'),
    globe: s('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>'),
    swap: s('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
  };
})(window);
