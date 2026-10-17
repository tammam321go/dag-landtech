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

  const VERSION = 3;
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
  ];

  // Area and shares are in decimals (shotangsho), the unit used on khatians.
  const DAGS = [
    { no: '412', area: 12, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '88', SA: '102', RS: '287', BS: '412' } },
    { no: '418', area: 33, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '90', SA: '104', RS: '291', BS: '418' } },
    { no: '425', area: 9.5, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '91', SA: '109', RS: '296', BS: '425' } },
    { no: '431', area: 16, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '93', SA: '113', RS: '301', BS: '431' } },
    { no: '433', area: 40, landClass: 'Nal (crop land)', khajnaPaidUpto: '2023-24', survey: { CS: '95', SA: '118', RS: null, BS: '433' } },
    { no: '440', area: 25, landClass: 'Bhiti (homestead)', khajnaPaidUpto: '2026-27', survey: { CS: '97', SA: '121', RS: '310', BS: '440' } },
    { no: '447', area: 20, landClass: 'Nal (crop land)', khajnaPaidUpto: '2026-27', survey: { CS: '99', SA: '126', RS: '315', BS: '447' } },
  ];

  const HOLDERS = [
    { dag: '412', personId: 'P1', share: 12, mutated: true, khatian: 'BS-217' },
    { dag: '418', personId: 'P1', share: 33, mutated: true, khatian: 'BS-217' },
    { dag: '425', personId: 'P7', share: 9.5, mutated: true, khatian: 'BS-305' },
    { dag: '431', personId: 'P4', share: 16, mutated: true, khatian: 'BS-122' },
    { dag: '433', personId: 'P9', share: 40, mutated: true, khatian: 'BS-140' },
    { dag: '440', personId: 'P11', share: 25, mutated: true, khatian: 'BS-198' },
    { dag: '447', personId: 'P12', share: 20, mutated: false, khatian: 'BS-061 (still in late father\'s name)' },
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
      meta: { version: VERSION, seededAt: now, counters: { req: 0, clr: 0, deed: 0, nj: 0, alert: 0, kh: 500 } },
      office: { id: 'SRO-KSF', name: 'Kashful Sub-Registry Office', counter: 'Counter 2' },
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
            dag: '425',
            lender: 'Padma Fictional Bank PLC, Motijheel branch',
            since: '2024-03-12',
            loanRef: 'LN-77-0031',
            amount: 42000000,
            borrower: 'Green Acre Properties Ltd',
            status: 'live',
          },
        ],
      },
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
