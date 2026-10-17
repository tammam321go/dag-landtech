/*
 * Dag demo data. Every person, NID, company, bank and mouza here is invented.
 * The one exception is the demo login phone number below, set on request.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  // ---- Demo login. Change these two lines to use another demo account. ----
  const DEMO_PHONE = '01841255990';
  const DEMO_PASSWORD = 'Dag@2026';
  // -------------------------------------------------------------------------

  const VERSION = 4;
  const SALT = 'dag-demo-salt:';

  const PERSONS = [
    { id: 'P1', name: 'Karim Mia', nid: '9990001001', phone: DEMO_PHONE },
    { id: 'P2', name: 'Selina Akter', nid: '9990001002', phone: '01700000002' },
    { id: 'P3', name: 'Rafiq Ahmed', nid: '9990001003', phone: '01700000003' },
    { id: 'P4', name: 'Nurul Islam', nid: '9990001004', phone: '01700000004' },
    { id: 'P5', name: 'Sumon Das', nid: '9990001005', phone: '01700000005' },
    { id: 'P6', name: 'Habib Traders', nid: '9990001006', phone: '01700000006' },
    { id: 'P7', name: 'Green Acre Properties Ltd', nid: '9990002001', phone: '01700000007' },
    { id: 'P8', name: 'Farzana Rahman', nid: '9990001008', phone: '01700000008' },
    { id: 'P9', name: 'Mokbul Hossain', nid: '9990001009', phone: '01700000009' },
    { id: 'P10', name: 'Shahana Begum', nid: '9990001010', phone: '01700000010' },
    { id: 'P11', name: 'Ayesha Siddiqua', nid: '9990001011', phone: '01700000011' },
    { id: 'P12', name: 'Hasan Ali', nid: '9990001012', phone: '01700000012' },
    { id: 'P13', name: 'Joynal Abedin', nid: '9990001013', phone: '01700000013' },
    { id: 'P14', name: 'Rokeya Khatun', nid: '9990001014', phone: '01700000014' },
  ];

  // Map of the mouza: a 360 x 300 drawing. Shared corners keep plots flush.
  const P = {
    A0: [20, 46], A1: [100, 38], A2: [182, 42], A3: [262, 36], A4: [340, 44],
    B0: [24, 114], B1: [104, 108], B2: [180, 104], B3: [266, 112], B4: [344, 110],
    C0: [22, 178], C1: [108, 172], C2: [190, 174], C3: [262, 176], C4: [346, 170],
    D0: [26, 236], D1: [104, 240], D2: [188, 238], D3: [268, 241], D4: [348, 244],
    E0: [24, 288], E1: [100, 288], E2: [192, 290], E3: [270, 292], E4: [344, 288],
  };
  const poly = (...k) => k.map((n) => P[n]);
  const FILLERS = [
    { no: '409', poly: poly('A0', 'A1', 'B1', 'B0') },
    { no: '410', poly: poly('A1', 'A2', 'B2', 'B1') },
    { no: '413', poly: poly('A3', 'A4', 'B4', 'B3') },
    { no: '415', poly: poly('B0', 'B1', 'C1', 'C0') },
    { no: '420', poly: poly('C0', 'C1', 'D1', 'D0') },
    { no: '427', poly: poly('C1', 'C2', 'D2', 'D1') },
  ];

  // Area and shares are in decimals (shotangsho), the unit used on khatians.
  const DAGS = [
    { no: '412', area: 12, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '88', SA: '102', RS: '287', BS: '412' }, poly: poly('A2', 'A3', 'B3', 'B2') },
    { no: '418', area: 33, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '90', SA: '104', RS: '291', BS: '418' }, poly: poly('B1', 'B2', 'B3', 'C3', 'C2', 'C1') },
    { no: '425', area: 9.5, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '91', SA: '109', RS: '296', BS: '425' }, poly: poly('B3', 'B4', 'C4', 'C3') },
    { no: '431', area: 16, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '93', SA: '113', RS: '301', BS: '431' }, poly: poly('D0', 'D1', 'E1', 'E0') },
    { no: '433', area: 40, landClass: 'Nal (crop land)', khajnaPaidUpto: '2023-24', survey: { CS: '95', SA: '118', RS: null, BS: '433' }, poly: poly('C2', 'C3', 'C4', 'D4', 'D3', 'D2') },
    { no: '440', area: 25, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '97', SA: '121', RS: '310', BS: '440' }, poly: poly('D1', 'D2', 'E2', 'E1') },
    { no: '447', area: 20, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '99', SA: '126', RS: '315', BS: '447' }, poly: poly('D2', 'D3', 'E3', 'E2') },
    { no: '449', area: 15, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '101', SA: '130', RS: '318', BS: '449' }, poly: poly('D3', 'D4', 'E4', 'E3') },
  ];

  const HOLDERS = [
    { dag: '412', personId: 'P1', share: 12, mutated: true, khatian: 'BS-217' },
    { dag: '418', personId: 'P1', share: 33, mutated: true, khatian: 'BS-217' },
    { dag: '425', personId: 'P7', share: 9.5, mutated: true, khatian: 'BS-305' },
    { dag: '431', personId: 'P4', share: 16, mutated: true, khatian: 'BS-122' },
    { dag: '433', personId: 'P9', share: 40, mutated: true, khatian: 'BS-140' },
    { dag: '440', personId: 'P11', share: 25, mutated: true, khatian: 'BS-198' },
    { dag: '447', personId: 'P12', share: 20, mutated: false, khatian: 'BS-061 (still in late father\'s name)' },
    // Sold twice before Dag existed: 18 dec on record against a 15 dec plot.
    { dag: '449', personId: 'P13', share: 10, mutated: true, khatian: 'BS-233' },
    { dag: '449', personId: 'P14', share: 8, mutated: true, khatian: 'BS-241' },
  ];

  const LOAN_PRESETS = [
    { id: 1, title: 'Second loan, same plot', dag: '425', borrowerNid: '9990002001', borrowerName: 'Green Acre Properties Ltd', amount: 15000000 },
    { id: 2, title: 'Loan on a locked dag', dag: '418', borrowerNid: '9990001001', borrowerName: 'Karim Mia', amount: 2500000 },
  ];

  const PRESETS = [
    { id: 1, title: 'Honest sale', dag: '412', sellerNid: '9990001001', sellerName: 'Karim Mia', buyerName: 'Selina Akter', buyerNid: '9990001002', share: 10 },
    { id: 2, title: 'Same land, sold again', dag: '412', sellerNid: '9990001001', sellerName: 'Karim Mia', buyerName: 'Rafiq Ahmed', buyerNid: '9990001003', share: 10 },
    { id: 3, title: 'Acquired land', dag: '431', sellerNid: '9990001004', sellerName: 'Nurul Islam', buyerName: 'Sumon Das', buyerNid: '9990001005', share: 8 },
    { id: 4, title: 'Impostor, locked dag', dag: '418', sellerNid: '9990001001', sellerName: 'Karim Mia', buyerName: 'Habib Traders', buyerNid: '9990001006', share: 20 },
    { id: 5, title: 'Hidden mortgage', dag: '425', sellerNid: '9990002001', sellerName: 'Green Acre Properties Ltd', buyerName: 'Farzana Rahman', buyerNid: '9990001008', share: 9.5 },
    { id: 6, title: 'Tax due, survey gap', dag: '433', sellerNid: '9990001009', sellerName: 'Mokbul Hossain', buyerName: 'Shahana Begum', buyerNid: '9990001010', share: 15 },
  ];

  function create() {
    const C = Dag.crypto;
    const now = new Date().toISOString();
    return {
      meta: { version: VERSION, seededAt: now, counters: { req: 0, clr: 0, deed: 0, nj: 0, alert: 0, kh: 500, chg: 1 } },
      office: { id: 'SRO-KSF', name: 'Kashful Sub-Registry Office', nameBn: 'কাশফুল সাব-রেজিস্ট্রি অফিস', counter: 'Counter 2' },
      acland: { id: 'ACL-KSF', name: 'AC (Land) Office, Kashful' },
      mouza: { name: 'Shapla Nagar', jl: '112', upazila: 'Kashful', district: 'Dhaka' },
      currentFY: '2026-27',
      users: [
        {
          id: 'U1',
          phone: DEMO_PHONE,
          salt: SALT,
          passwordHash: C.hashHex(SALT + DEMO_PASSWORD),
          name: 'Karim Mia',
          personId: 'P1',
          roles: ['owner', 'sub-registrar', 'ac-land', 'verifier'],
        },
      ],
      sessions: {},
      persons: JSON.parse(JSON.stringify(PERSONS)),
      dags: JSON.parse(JSON.stringify(DAGS)),
      holders: JSON.parse(JSON.stringify(HOLDERS)),
      transfers: [],
      flags: [
        { dag: '431', type: 'Acquired', ref: 'LA Case 07/2019, Kashful bypass road', since: '2019-11-04', list: 'Land acquisition register' },
      ],
      injunctions: [
        { dag: '440', court: 'Senior Assistant Judge Court (fictional)', suit: 'Title Suit 214/2025', order: 'Status quo on transfer', since: '2025-08-19' },
      ],
      locks: [{ dag: '418', personId: 'P1', on: true, since: '2026-09-02T10:15:00.000Z' }],
      subscriptions: [
        { dag: '412', personId: 'P1' },
        { dag: '418', personId: 'P1' },
      ],
      // The bank side. In production this lives inside Bangladesh Bank CIB and
      // never leaves it. The gate can only ask the oracle a yes/no question.
      bank: {
        name: 'Bangladesh Bank CIB (mock)',
        charges: [
          {
            id: 'CHG-2024-0001',
            dag: '425',
            lender: 'Kashful Demo Bank PLC',
            since: '2024-03-12',
            loanRef: 'LN-77-0031',
            amount: 42000000,
            borrower: 'Green Acre Properties Ltd',
            borrowerNid: '9990002001',
            status: 'live',
          },
        ],
      },
      loanDesk: { lender: 'Shimul Demo Bank PLC', branch: 'Kashful branch' },
      loanPresets: JSON.parse(JSON.stringify(LOAN_PRESETS)),
      mapFillers: JSON.parse(JSON.stringify(FILLERS)),
      presets: JSON.parse(JSON.stringify(PRESETS)),
      requests: [],
      clearances: [],
      deeds: [],
      cases: [],
      alerts: [],
      oracleLog: [],
      audit: [],
    };
  }

  Dag.seed = { create, VERSION };
  Dag.DEMO = { phone: DEMO_PHONE, password: DEMO_PASSWORD };
})(typeof window !== 'undefined' ? window : globalThis);
