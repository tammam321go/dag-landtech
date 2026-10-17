/*
 * Dag demo data. Every person, NID, company, bank, court and mouza here is
 * invented. Fictional phone numbers use the 010 prefix, which no operator in
 * Bangladesh uses, so none of them can reach a real subscriber.
 * The one exception is the landowner's login number (OWNER_PHONE), which
 * belongs to the team leader and is used at his request.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  // ---- Demo logins. One password for every demo account. ----------------
  const OWNER_PHONE = '01841255990';
  const DEMO_PASSWORD = 'Dag@2026';
  // -------------------------------------------------------------------------

  const VERSION = 5;

  // Five accounts. Each sees only the tabs of its role, and the server checks
  // the role on every route.
  const ACCOUNTS = [
    {
      id: 'U-SR', role: 'subregistrar', roles: ['subregistrar'], phone: '01000000101',
      name: 'Farhana Haque', nameBn: 'ফারহানা হক',
      title: 'Sub-Registrar, Kashful', titleBn: 'সাব-রেজিস্ট্রার, কাশফুল',
    },
    {
      id: 'U-OW', role: 'owner', roles: ['owner'], personId: 'P1', phone: OWNER_PHONE,
      name: 'Karim Mia', nameBn: 'করিম মিয়া',
      title: 'Landowner, dags 412 and 418', titleBn: 'জমির মালিক, দাগ ৪১২ ও ৪১৮',
    },
    {
      id: 'U-AC', role: 'acland', roles: ['acland'], phone: '01000000102',
      name: 'Rezaul Islam', nameBn: 'রেজাউল ইসলাম',
      title: 'AC (Land), Kashful', titleBn: 'সহকারী কমিশনার (ভূমি), কাশফুল',
    },
    {
      id: 'U-BK', role: 'bank', roles: ['bank'], phone: '01000000103',
      name: 'Tanvir Ahmed', nameBn: 'তানভীর আহমেদ',
      title: 'Credit officer, Shimul Demo Bank', titleBn: 'ঋণ কর্মকর্তা, শিমুল ডেমো ব্যাংক',
    },
    {
      id: 'U-BY', role: 'buyer', roles: ['buyer', 'owner'], personId: 'P2', phone: '01000000002',
      name: 'Selina Akter', nameBn: 'সেলিনা আক্তার',
      title: 'Buyer, checks before she pays', titleBn: 'ক্রেতা, টাকা দেওয়ার আগে যাচাই করেন',
    },
  ];

  const PERSONS = [
    { id: 'P1', name: 'Karim Mia', nameBn: 'করিম মিয়া', nid: '9990001001', phone: OWNER_PHONE },
    { id: 'P2', name: 'Selina Akter', nameBn: 'সেলিনা আক্তার', nid: '9990001002', phone: '01000000002' },
    { id: 'P3', name: 'Rafiq Ahmed', nameBn: 'রফিক আহমেদ', nid: '9990001003', phone: '01000000003' },
    { id: 'P4', name: 'Nurul Islam', nameBn: 'নুরুল ইসলাম', nid: '9990001004', phone: '01000000004' },
    { id: 'P5', name: 'Sumon Das', nameBn: 'সুমন দাস', nid: '9990001005', phone: '01000000005' },
    { id: 'P6', name: 'Habib Traders', nameBn: 'হাবিব ট্রেডার্স', nid: '9990001006', phone: '01000000006' },
    { id: 'P7', name: 'Green Acre Properties Ltd', nameBn: 'গ্রিন একর প্রপার্টিজ লিমিটেড', nid: '9990002001', phone: '01000000007' },
    { id: 'P8', name: 'Farzana Rahman', nameBn: 'ফারজানা রহমান', nid: '9990001008', phone: '01000000008' },
    { id: 'P9', name: 'Mokbul Hossain', nameBn: 'মকবুল হোসেন', nid: '9990001009', phone: '01000000009' },
    { id: 'P10', name: 'Shahana Begum', nameBn: 'শাহানা বেগম', nid: '9990001010', phone: '01000000010' },
    { id: 'P11', name: 'Ayesha Siddiqua', nameBn: 'আয়েশা সিদ্দিকা', nid: '9990001011', phone: '01000000011' },
    { id: 'P12', name: 'Hasan Ali', nameBn: 'হাসান আলী', nid: '9990001012', phone: '01000000012' },
    { id: 'P13', name: 'Joynal Abedin', nameBn: 'জয়নাল আবেদীন', nid: '9990001013', phone: '01000000013' },
    { id: 'P14', name: 'Rokeya Khatun', nameBn: 'রোকেয়া খাতুন', nid: '9990001014', phone: '01000000014' },
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

  const NAL = { landClass: 'Nal (crop land)', landClassBn: 'নাল (কৃষি জমি)' };
  const BHITI = { landClass: 'Bhiti (homestead)', landClassBn: 'ভিটি (বসতবাড়ি)' };

  // Area and shares are in decimals (shotangsho), the unit used on khatians.
  const DAGS = [
    Object.assign({ no: '412', area: 12, khajnaPaidUpto: '2026-27', survey: { CS: '88', SA: '102', RS: '287', BS: '412' }, poly: poly('A2', 'A3', 'B3', 'B2') }, NAL),
    Object.assign({ no: '418', area: 33, khajnaPaidUpto: '2026-27', survey: { CS: '90', SA: '104', RS: '291', BS: '418' }, poly: poly('B1', 'B2', 'B3', 'C3', 'C2', 'C1') }, BHITI),
    Object.assign({ no: '425', area: 9.5, khajnaPaidUpto: '2026-27', survey: { CS: '91', SA: '109', RS: '296', BS: '425' }, poly: poly('B3', 'B4', 'C4', 'C3') }, BHITI),
    Object.assign({ no: '431', area: 16, khajnaPaidUpto: '2026-27', survey: { CS: '93', SA: '113', RS: '301', BS: '431' }, poly: poly('D0', 'D1', 'E1', 'E0') }, NAL),
    Object.assign({ no: '433', area: 40, khajnaPaidUpto: '2023-24', survey: { CS: '95', SA: '118', RS: null, BS: '433' }, poly: poly('C2', 'C3', 'C4', 'D4', 'D3', 'D2') }, NAL),
    Object.assign({ no: '440', area: 25, khajnaPaidUpto: '2026-27', survey: { CS: '97', SA: '121', RS: '310', BS: '440' }, poly: poly('D1', 'D2', 'E2', 'E1') }, BHITI),
    Object.assign({ no: '447', area: 20, khajnaPaidUpto: '2026-27', survey: { CS: '99', SA: '126', RS: '315', BS: '447' }, poly: poly('D2', 'D3', 'E3', 'E2') }, NAL),
    Object.assign({ no: '449', area: 15, khajnaPaidUpto: '2026-27', survey: { CS: '101', SA: '130', RS: '318', BS: '449' }, poly: poly('D3', 'D4', 'E4', 'E3') }, NAL),
  ];

  const HOLDERS = [
    { dag: '412', personId: 'P1', share: 12, mutated: true, khatian: 'BS-217' },
    { dag: '418', personId: 'P1', share: 33, mutated: true, khatian: 'BS-217' },
    { dag: '425', personId: 'P7', share: 9.5, mutated: true, khatian: 'BS-305' },
    { dag: '431', personId: 'P4', share: 16, mutated: true, khatian: 'BS-122' },
    { dag: '433', personId: 'P9', share: 40, mutated: true, khatian: 'BS-140' },
    { dag: '440', personId: 'P11', share: 25, mutated: true, khatian: 'BS-198' },
    { dag: '447', personId: 'P12', share: 20, mutated: false, khatian: 'BS-061', note: "Still in the late father's name", noteBn: 'এখনও প্রয়াত পিতার নামে' },
    // Sold twice before Dag existed: 18 decimals on record against a 15 decimal plot.
    { dag: '449', personId: 'P13', share: 10, mutated: true, khatian: 'BS-233' },
    { dag: '449', personId: 'P14', share: 8, mutated: true, khatian: 'BS-241' },
  ];

  const PRESETS = [
    { id: 1, title: 'Honest sale', titleBn: 'সৎ বিক্রি', dag: '412', sellerNid: '9990001001', buyerNid: '9990001002', share: 10 },
    { id: 2, title: 'Same land, sold again', titleBn: 'একই জমি আবার বিক্রি', dag: '412', sellerNid: '9990001001', buyerNid: '9990001003', share: 10, after: 1 },
    { id: 3, title: 'Acquired land', titleBn: 'অধিগৃহীত জমি', dag: '431', sellerNid: '9990001004', buyerNid: '9990001005', share: 8 },
    { id: 4, title: 'Impostor, locked dag', titleBn: 'প্রতারক, লক করা দাগ', dag: '418', sellerNid: '9990001001', buyerNid: '9990001006', share: 20 },
    { id: 5, title: 'Hidden mortgage', titleBn: 'গোপন বন্ধক', dag: '425', sellerNid: '9990002001', buyerNid: '9990001008', share: 9.5 },
    { id: 6, title: 'Tax due, survey gap', titleBn: 'খাজনা বকেয়া, জরিপে ফাঁক', dag: '433', sellerNid: '9990001009', buyerNid: '9990001010', share: 15 },
  ];

  const LOAN_PRESETS = [
    { id: 1, title: 'Second loan, same plot', titleBn: 'একই জমিতে দ্বিতীয় ঋণ', dag: '425', borrowerNid: '9990002001', amount: 15000000 },
    { id: 2, title: 'Loan on a locked dag', titleBn: 'লক করা দাগে ঋণ', dag: '418', borrowerNid: '9990001001', amount: 2500000 },
  ];

  // Password hashes are computed once per process (4096 rounds each).
  let userCache = null;
  function users() {
    if (userCache) return userCache;
    userCache = ACCOUNTS.map((a) => {
      const salt = 'dag:' + a.id + ':' + Dag.crypto.hashHex('salt:' + a.id).slice(0, 16);
      return Object.assign({}, a, { salt, passwordHash: Dag.crypto.hashPassword(DEMO_PASSWORD, salt) });
    });
    return userCache;
  }

  const copy = (v) => JSON.parse(JSON.stringify(v));

  function create() {
    return {
      meta: { version: VERSION, seededAt: new Date().toISOString(), counters: { req: 0, clr: 0, deed: 0, nj: 0, alert: 0, kh: 500, chg: 1, apl: 0 } },
      office: { id: 'SRO-KSF', name: 'Kashful Sub-Registry Office', nameBn: 'কাশফুল সাব-রেজিস্ট্রি অফিস', counter: 'Counter 2', counterBn: 'কাউন্টার ২' },
      acland: { id: 'ACL-KSF', name: 'AC (Land) Office, Kashful', nameBn: 'সহকারী কমিশনার (ভূমি) অফিস, কাশফুল' },
      mouza: { name: 'Shapla Nagar', nameBn: 'শাপলা নগর', jl: '112', upazila: 'Kashful', upazilaBn: 'কাশফুল', district: 'Dhaka', districtBn: 'ঢাকা' },
      currentFY: '2026-27',
      users: copy(users()),
      sessions: {},
      loginFails: {},
      persons: copy(PERSONS),
      dags: copy(DAGS),
      holders: copy(HOLDERS),
      transfers: [],
      flags: [
        {
          dag: '431', type: 'Acquired', typeBn: 'অধিগৃহীত',
          ref: 'LA Case 07/2019, Kashful bypass road', refBn: 'এলএ মামলা ০৭/২০১৯, কাশফুল বাইপাস সড়ক',
          since: '2019-11-04', list: 'Land acquisition register', listBn: 'ভূমি অধিগ্রহণ রেজিস্টার',
        },
      ],
      injunctions: [
        {
          dag: '440', court: 'Senior Assistant Judge Court (fictional)', courtBn: 'সিনিয়র সহকারী জজ আদালত (কাল্পনিক)',
          suit: 'Title Suit 214/2025', suitBn: 'স্বত্ব মামলা ২১৪/২০২৫',
          order: 'Status quo on transfer', orderBn: 'হস্তান্তরে স্থিতাবস্থা', since: '2025-08-19',
        },
      ],
      locks: [{ dag: '418', personId: 'P1', on: true, since: '2026-09-02T10:15:00.000Z' }],
      subscriptions: [
        { dag: '412', personId: 'P1' },
        { dag: '418', personId: 'P1' },
      ],
      // The bank side. In production this lives inside Bangladesh Bank CIB and
      // never leaves it. The gate can only ask the oracle a yes/no question.
      bank: {
        name: 'Bangladesh Bank CIB (mock)', nameBn: 'বাংলাদেশ ব্যাংক সিআইবি (নমুনা)',
        charges: [
          {
            id: 'CHG-2024-0001', dag: '425',
            lender: 'Kashful Demo Bank PLC', lenderBn: 'কাশফুল ডেমো ব্যাংক পিএলসি',
            since: '2024-03-12', loanRef: 'LN-77-0031', amount: 42000000,
            borrower: 'Green Acre Properties Ltd', borrowerBn: 'গ্রিন একর প্রপার্টিজ লিমিটেড', borrowerNid: '9990002001',
            status: 'live',
          },
        ],
      },
      loanDesk: { lender: 'Shimul Demo Bank PLC', lenderBn: 'শিমুল ডেমো ব্যাংক পিএলসি', branch: 'Kashful branch', branchBn: 'কাশফুল শাখা' },
      loanPresets: copy(LOAN_PRESETS),
      mapFillers: copy(FILLERS),
      presets: copy(PRESETS),
      requests: [],
      clearances: [],
      deeds: [],
      cases: [],
      alerts: [],
      oracleLog: [],
      audit: [],
    };
  }

  const publicAccounts = () =>
    ACCOUNTS.map((a) => ({ id: a.id, role: a.role, roles: a.roles, personId: a.personId || null, phone: a.phone, name: a.name, nameBn: a.nameBn, title: a.title, titleBn: a.titleBn }));

  Dag.seed = { create, VERSION, accounts: publicAccounts };
  Dag.DEMO = { password: DEMO_PASSWORD, ownerPhone: OWNER_PHONE };
})(typeof window !== 'undefined' ? window : globalThis);
