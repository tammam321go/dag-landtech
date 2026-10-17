/*
 * The page around the phone: the top bar and the judge's guide.
 *   Top bar: language switch (shared with the phone), backend status,
 *            Play the full demo, Reset, Use a real phone.
 *   Guide:   Walkthrough (steps that drive the phone), How it works,
 *            API log (every call, live, with the steps inside the gate).
 *   Autoplay plays the whole story with captions in the current language,
 *   switching between the five accounts the way the real offices would.
 */
(function () {
  'use strict';
  const Dag = window.Dag;
  const App = window.DagApp;
  const api = Dag.api;
  const I = Dag.icons;
  const T = Dag.i18n;
  const t = (k, v) => T.t(k, v);
  const L = (o) => (o && typeof o === 'object' && 'en' in o ? o[T.lang] || o.en : o);
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const json = (v) => esc(JSON.stringify(v, null, 2));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const G = { tab: 'steps', open: new Set(), latest: null, modal: false };
  const ACC = { sr: 'U-SR', owner: 'U-OW', ac: 'U-AC', bank: 'U-BK', buyer: 'U-BY' };

  // Make sure the phone is logged in as this account (typing on the login
  // screen, a quick switch otherwise), then show the given tab.
  async function as(key, tab) {
    const id = ACC[key];
    const u = App.user();
    if (!u) {
      await App.autofill(id);
      if (tab) await App.go(tab);
    } else if (u.id !== id) {
      await App.switchTo(id, { tab });
    } else if (tab) {
      await App.go(tab);
    }
  }
  async function scenario(n, sel) {
    await as('sr', 'counter');
    await App.preset(n);
    setTimeout(() => App.highlight(App.presetNeed() ? '#need-btn' : sel || '#run-btn'), 150);
  }

  // ---------- the walkthrough ----------
  const STEPS = [
    {
      id: 'login', acc: 'sr', tag: { en: 'Start', bn: 'শুরু' },
      title: { en: 'Log in as the Sub-Registrar', bn: 'সাব-রেজিস্ট্রার হিসেবে লগইন' },
      do: {
        en: ['On the phone, tap <b>Farhana Haque, Sub-Registrar</b>, or press <b>Take me there</b>.', 'Her number and the password type themselves in.'],
        bn: ['ফোনে <b>ফারহানা হক, সাব-রেজিস্ট্রার</b>-এ চাপ দিন, অথবা <b>সেখানে নিয়ে চলুন</b> চাপুন।', 'তাঁর নম্বর ও পাসওয়ার্ড নিজেই লেখা হবে।'],
      },
      expect: { en: 'The clearance counter of a fictional Sub-Registry office.', bn: 'একটি কাল্পনিক সাব-রেজিস্ট্রি অফিসের ক্লিয়ারেন্স কাউন্টার।' },
      why: {
        en: 'Five accounts, five offices. Each sees only its own tabs, and the server checks the role on every call, so a landowner cannot reach the counter even through the API.',
        bn: 'পাঁচটি অ্যাকাউন্ট, পাঁচটি দপ্তর। প্রত্যেকে শুধু নিজের ট্যাব দেখেন, আর সার্ভার প্রতিটি কলে ভূমিকা যাচাই করে, তাই জমির মালিক এপিআই দিয়েও কাউন্টারে ঢুকতে পারেন না।',
      },
      done: ['login.subregistrar'],
      go: () => as('sr', 'counter'),
    },
    {
      id: 's1', acc: 'sr', tag: { en: 'P4', bn: 'P4' },
      title: { en: 'An honest sale clears in seconds', bn: 'সৎ বিক্রি কয়েক সেকেন্ডে ছাড়পত্র পায়' },
      do: {
        en: ['Tap scenario <b>1, Honest sale</b>, then <b>Run the 9 checks</b>.', 'Tap <b>Execute deed</b>.'],
        bn: ['দৃশ্যপট <b>১, সৎ বিক্রি</b> বেছে <b>৯টি যাচাই চালান</b> চাপুন।', 'তারপর <b>দলিল সম্পন্ন করুন</b> চাপুন।'],
      },
      expect: {
        en: 'A green PASS stamp, nine passed checks and a signed clearance with a QR code. Karim Mia gets an SMS. After Execute, the deed is registered and a namjari case opens by itself.',
        bn: 'সবুজ "উত্তীর্ণ" সিল, নয়টি উত্তীর্ণ যাচাই আর কিউআর কোডসহ স্বাক্ষরিত ক্লিয়ারেন্স। করিম মিয়া এসএমএস পান। দলিল সম্পন্ন করলে নিবন্ধন হয় এবং নামজারি মামলা নিজে থেকেই খোলে।',
      },
      why: {
        en: 'The citizen never files a namjari application. The registration event opens the case at AC Land, the link P4 asks for.',
        bn: 'নাগরিককে নামজারির আবেদন করতে হয় না। রেজিস্ট্রির ঘটনাই এসি ল্যান্ডে মামলা খুলে দেয়, যা P4 চায়।',
      },
      done: ['s1.exec'],
      go: () => scenario(1),
    },
    {
      id: 's2', acc: 'sr', tag: { en: 'P3', bn: 'P3' },
      title: { en: 'The same land, sold a second time', bn: 'একই জমি দ্বিতীয়বার বিক্রি' },
      do: {
        en: ['Tap scenario <b>2, Same land, sold again</b>, then run it.', 'Read the C2 box.'],
        bn: ['দৃশ্যপট <b>২, একই জমি আবার বিক্রি</b> বেছে যাচাই চালান।', 'C2-এর হিসাব দেখুন।'],
      },
      expect: {
        en: 'A red BLOCKED stamp. C2 does the sum: 12 recorded, 10 already sold, 2 left, 10 asked, short by 8. If you skipped Execute before, C3 blocks instead: a deed on this dag is still open.',
        bn: 'লাল "আটকানো" সিল। C2 হিসাব করে: রেকর্ডে ১২, বিক্রি হয়েছে ১০, বাকি ২, চাওয়া ১০, ঘাটতি ৮। আগের ধাপে দলিল সম্পন্ন না করলে C3 আটকায়, কারণ এই দাগে একটি দলিল এখনও খোলা।',
      },
      why: { en: 'Double selling is caught by arithmetic before anyone signs. There is nothing left to argue about in court.', bn: 'কেউ সই করার আগেই হিসাব দিয়ে দ্বৈত বিক্রি ধরা পড়ে। আদালতে তর্ক করার কিছু থাকে না।' },
      done: ['s2.block'],
      go: () => scenario(2),
    },
    {
      id: 's3', acc: 'sr', tag: { en: 'P5', bn: 'P5' },
      title: { en: 'Land the government already acquired', bn: 'সরকারের অধিগৃহীত জমি' },
      do: { en: ['Tap scenario <b>3, Acquired land</b> and run it.'], bn: ['দৃশ্যপট <b>৩, অধিগৃহীত জমি</b> বেছে যাচাই চালান।'] },
      expect: { en: 'Blocked on C5: the dag is in LA case 07/2019 for a bypass road. The result carries an appeal number.', bn: 'C5-এ আটকানো: দাগটি বাইপাস সড়কের এলএ মামলা ০৭/২০১৯-এ আছে। ফলাফলে একটি আপিল নম্বর থাকে।' },
      why: {
        en: 'Government lists can be wrong. In Telangana thousands of private plots landed on a prohibited list by mistake, so every block here comes with an appeal route that is logged.',
        bn: 'সরকারি তালিকাতেও ভুল থাকে। তেলেঙ্গানায় হাজার হাজার ব্যক্তিগত জমি ভুল করে নিষিদ্ধ তালিকায় উঠেছিল, তাই এখানে প্রতিটি আটকানোর সাথে লিপিবদ্ধ আপিলের পথ থাকে।',
      },
      done: ['s3.block'],
      go: () => scenario(3),
    },
    {
      id: 's4', acc: 'sr', acc2: 'owner', tag: { en: 'New idea 1', bn: 'নতুন ধারণা ১' },
      title: { en: 'Owner Lock stops an impostor', bn: 'মালিকের লক প্রতারককে থামায়' },
      do: {
        en: ['Tap scenario <b>4, Impostor, locked dag</b> and run it. Someone with a copy of Karim Mia\'s NID is selling his locked dag 418.', 'Tap <b>Open his phone</b>. The phone switches to Karim\'s own account and the SMS arrives.', 'He taps <b>No, not me</b>. Switch back to Farhana and look at the counter.'],
        bn: ['দৃশ্যপট <b>৪, প্রতারক, লক করা দাগ</b> বেছে যাচাই চালান। কেউ করিম মিয়ার এনআইডির কপি দিয়ে তাঁর লক করা দাগ ৪১৮ বিক্রি করছে।', '<b>তাঁর ফোন খুলুন</b> চাপুন। ফোন করিমের নিজের অ্যাকাউন্টে যায় এবং এসএমএস আসে।', 'তিনি <b>না, আমি নই</b> চাপেন। ফারহানায় ফিরে কাউন্টার দেখুন।'],
      },
      expect: {
        en: 'First a violet HELD stamp with a 48 hour notice. After Karim says no, the same request turns into BLOCKED: the owner denied this deed.',
        bn: 'প্রথমে ৪৮ ঘণ্টার নোটিশসহ বেগুনি "স্থগিত" সিল। করিম "না" বলার পর একই অনুরোধ "আটকানো" হয়ে যায়: মালিক দলিলটি অস্বীকার করেছেন।',
      },
      why: {
        en: 'Today the real owner often finds out years later, when he goes to pay khajna. With Owner Lock he finds out before the signature, on his own phone.',
        bn: 'আজ আসল মালিক প্রায়ই বছর পরে খাজনা দিতে গিয়ে জানতে পারেন। মালিকের লকে তিনি সইয়ের আগেই, নিজের ফোনে জানতে পারেন।',
      },
      done: ['owner.not_me', 'owner.me'],
      go: () => scenario(4),
    },
    {
      id: 's5', acc: 'sr', tag: { en: 'New idea 2', bn: 'নতুন ধারণা ২' },
      title: { en: 'A mortgage the buyer cannot see', bn: 'ক্রেতার অদেখা বন্ধক' },
      do: { en: ['Tap scenario <b>5, Hidden mortgage</b> and run it.', 'Open the C9 row.'], bn: ['দৃশ্যপট <b>৫, গোপন বন্ধক</b> বেছে যাচাই চালান।', 'C9 সারিটি খুলুন।'] },
      expect: { en: 'Blocked on C9: a live bank charge since 12 Mar 2024, in a signed reply from the bank oracle.', bn: 'C9-এ আটকানো: ১২ মার্চ ২০২৪ থেকে ব্যাংকের দায় চলমান, ব্যাংক ওরাকলের স্বাক্ষরিত উত্তরে।' },
      why: {
        en: 'Bangladesh Bank cannot open CIB data to the public under the Bangladesh Bank Order. A signed yes or no reveals one fact and needs no change to that law.',
        bn: 'বাংলাদেশ ব্যাংক অর্ডার অনুযায়ী সিআইবির তথ্য জনসাধারণের জন্য খোলা যায় না। একটি স্বাক্ষরিত হ্যাঁ বা না শুধু একটি তথ্য জানায়, আইন বদলাতে হয় না।',
      },
      done: ['s5.block'],
      go: () => scenario(5),
    },
    {
      id: 'loan', acc: 'bank', tag: { en: 'New idea 2', bn: 'নতুন ধারণা ২' },
      title: { en: 'A second loan on the same plot', bn: 'একই জমিতে দ্বিতীয় ঋণ' },
      do: {
        en: ['As Tanvir Ahmed, bank officer, tap <b>L1, Second loan, same plot</b>.', 'Tap <b>Check the collateral</b>, then scroll to <b>Bank side</b>.'],
        bn: ['ব্যাংক কর্মকর্তা তানভীর আহমেদ হিসেবে <b>ঋ১, একই জমিতে দ্বিতীয় ঋণ</b> বেছে নিন।', '<b>জামানত যাচাই করুন</b> চাপুন, তারপর <b>ব্যাংকের দিক</b> পর্যন্ত নামুন।'],
      },
      expect: {
        en: 'Do not lend: the plot is already pledged, so a second loan would be double financing. The bank side shows what went out (yes, a date, the lender) and what stayed in (the amount, the borrower).',
        bn: 'ঋণ দেবেন না: জমিটি আগেই বন্ধক আছে, দ্বিতীয় ঋণ মানে দ্বৈত অর্থায়ন। ব্যাংকের দিকে দেখা যায় কী বাইরে গেছে (হ্যাঁ, তারিখ, ঋণদাতা) আর কী ভেতরে রয়ে গেছে (পরিমাণ, ঋণগ্রহীতা)।',
      },
      why: { en: 'The brief lists banks preventing double mortgaging. The same oracle that guards the counter guards the loan desk, the job CERSAI does in India.', bn: 'নির্দেশিকায় ব্যাংকের দ্বৈত বন্ধক ঠেকানোর কথা আছে। যে ওরাকল কাউন্টার পাহারা দেয়, সেটিই ঋণ ডেস্ক পাহারা দেয়, ভারতে যে কাজ সিইআরএসএআই করে।' },
      done: ['loan1.refuse'],
      go: async () => {
        await as('bank', 'bank');
        App.loanPreset(1);
        setTimeout(() => App.highlight('#loan-check-btn'), 150);
      },
    },
    {
      id: 's6', acc: 'sr', tag: { en: 'P4', bn: 'P4' },
      title: { en: 'A warning, not a block', bn: 'আটকানো নয়, সতর্কতা' },
      do: {
        en: ['Tap scenario <b>6, Tax due, survey gap</b> and run it.', 'Read the suggested note, tap <b>Proceed with note</b>, then <b>Certificate</b>.'],
        bn: ['দৃশ্যপট <b>৬, খাজনা বকেয়া, জরিপে ফাঁক</b> বেছে যাচাই চালান।', 'প্রস্তাবিত নোট পড়ে <b>নোটসহ এগিয়ে যান</b>, তারপর <b>সনদ</b> চাপুন।'],
      },
      expect: { en: 'An amber WARN stamp: three years of tax due and no RS dag. The clearance is signed with both warnings printed, and the certificate opens beside the phone, ready to print.', bn: 'হলুদ "সতর্কতা" সিল: তিন বছরের খাজনা বকেয়া, আরএস দাগ নেই। দুটি সতর্কতা ছাপাসহ ক্লিয়ারেন্স স্বাক্ষরিত হয়, আর ফোনের পাশে প্রিন্টযোগ্য সনদ খোলে।' },
      why: { en: 'Not every problem should stop a sale. Warnings are recorded and signed, so nobody can later say they were never shown.', bn: 'সব সমস্যায় বিক্রি থামানো উচিত নয়। সতর্কতা লিপিবদ্ধ ও স্বাক্ষরিত থাকে, তাই পরে কেউ বলতে পারেন না যে তাঁকে দেখানো হয়নি।' },
      done: ['s6.issued'],
      go: () => scenario(6),
    },
    {
      id: 'verify', acc: 'bank', tag: { en: 'P2', bn: 'P2' },
      title: { en: 'Prove a clearance is real, then forge one', bn: 'ক্লিয়ারেন্স আসল প্রমাণ করুন, তারপর জাল করুন' },
      do: {
        en: ['On <b>Verify</b>, tap the oldest clearance, then <b>Tamper test</b>.', 'On the Counter, the QR code of any clearance opens the public check that a buyer would see.'],
        bn: ['<b>যাচাই</b> ট্যাবে সবচেয়ে পুরোনো ক্লিয়ারেন্সে চাপ দিন, তারপর <b>জালিয়াতি পরীক্ষা</b>।', 'কাউন্টারে যেকোনো ক্লিয়ারেন্সের কিউআর কোড ক্রেতার দেখা পাবলিক যাচাই খোলে।'],
      },
      expect: { en: 'A valid Ed25519 signature. The tamper test adds 2 decimals and keeps the signature: INVALID. The audit chain below shows intact.', bn: 'সঠিক Ed25519 স্বাক্ষর। জালিয়াতি পরীক্ষায় ২ শতাংশ যোগ করে একই স্বাক্ষর রাখা হয়: অবৈধ। নিচের অডিট চেইন অক্ষত দেখায়।' },
      why: { en: 'An edited or photocopied clearance fails at the bank, at AC Land, or on the buyer\'s phone. The QR check needs only the public key, so it works offline.', bn: 'সম্পাদিত বা ফটোকপি করা ক্লিয়ারেন্স ব্যাংকে, এসি ল্যান্ডে বা ক্রেতার ফোনে ধরা পড়ে। কিউআর যাচাইয়ে শুধু পাবলিক কী লাগে, তাই ইন্টারনেট ছাড়াই কাজ করে।' },
      done: ['verify.tamper'],
      go: async () => {
        await as('bank', 'verify');
        setTimeout(() => {
          if (!App.highlight('.vrow:last-of-type')) App.toast(t('g.needClr'));
        }, 150);
      },
    },
    {
      id: 'acland', acc: 'ac', tag: { en: 'P4', bn: 'P4' },
      title: { en: 'Close the loop at AC Land', bn: 'এসি ল্যান্ডে কাজ শেষ' },
      do: {
        en: ['As Rezaul Islam, AC (Land), tap <b>Approve and correct the khatian</b> on the case from scenario 1.', 'Scroll to <b>Record health</b>.'],
        bn: ['এসি (ল্যান্ড) রেজাউল ইসলাম হিসেবে দৃশ্যপট ১-এর মামলায় <b>অনুমোদন দিয়ে খতিয়ান সংশোধন করুন</b> চাপুন।', '<b>রেকর্ডের অবস্থা</b> পর্যন্ত নামুন।'],
      },
      expect: { en: 'A new khatian for Selina Akter; Karim now holds 2 decimals. Record health lists dag 449, which holds 18 decimals of owners on a 15 decimal plot.', bn: 'সেলিনা আক্তারের নামে নতুন খতিয়ান; করিমের নামে এখন ২ শতাংশ। রেকর্ডের অবস্থায় দাগ ৪৪৯ দেখা যায়, যেখানে ১৫ শতাংশ জমিতে ১৮ শতাংশ মালিকানা।' },
      why: { en: 'Deed and record end up saying the same thing. The health scan also hands AC Land a worklist of old damage on the first day.', bn: 'দলিল আর রেকর্ড শেষে একই কথা বলে। রেকর্ড পরীক্ষাটি প্রথম দিনেই এসি ল্যান্ডকে পুরোনো ভুলের তালিকা দেয়।' },
      done: ['acland.approve'],
      go: async () => {
        await as('ac', 'acland');
        setTimeout(() => {
          if (!App.highlight('.approve-btn')) App.toast(t('g.needCase'));
        }, 150);
      },
    },
    {
      id: 'mouza', acc: 'buyer', tag: { en: 'P5', bn: 'P5' },
      title: { en: 'Check before you buy', bn: 'কেনার আগে যাচাই' },
      do: {
        en: ['As Selina Akter, buyer, tap plot <b>425</b> on the mouza map.', 'Tap <b>Ask the bank</b>. Then open <b>My land</b>: after step 10 her new dag 412 is there.'],
        bn: ['ক্রেতা সেলিনা আক্তার হিসেবে মৌজা ম্যাপে <b>৪২৫</b> নম্বর জমিতে চাপ দিন।', '<b>ব্যাংককে জিজ্ঞেস করুন</b> চাপুন। তারপর <b>আমার জমি</b> খুলুন: ধাপ ১০-এর পর তাঁর নতুন দাগ ৪১২ সেখানে আছে।'],
      },
      expect: { en: 'On the record, 425 shows nothing wrong, so it is green. One signed question to the bank reveals the hidden loan.', bn: 'রেকর্ডে ৪২৫-এ কোনো সমস্যা নেই, তাই সবুজ। ব্যাংককে একটি স্বাক্ষরিত প্রশ্নেই গোপন ঋণ ধরা পড়ে।' },
      why: { en: 'A buyer sees what the record says and what the bank knows, without the bank opening its books.', bn: 'ব্যাংক তার খাতা না খুলেও ক্রেতা জানতে পারেন রেকর্ড কী বলে আর ব্যাংক কী জানে।' },
      done: ['mouza.ask'],
      go: async () => {
        await as('buyer', 'mouza');
        await App.pickDag('425');
        setTimeout(() => App.highlight('#ask-bank-btn'), 150);
      },
    },
  ];

  const FREE = {
    en: [
      '<b>Use a real phone</b> (top bar): scan the code, log in as Karim on your own phone, then run scenario 4 here. The SMS arrives on your phone.',
      'Loan desk, <b>L2</b>: a mortgage on Karim\'s locked dag waits for his answer. Say yes, then run scenario 4 again and C9 joins the block.',
      'Scenario 4, then <b>Demo: let 48 hours pass</b>: with no answer the hold becomes a warning and the officer must take a fingerprint.',
      'Run scenario 1, do not execute, register a loan on dag 412 at the bank, then execute: the re-check voids the clearance.',
      'Type a different seller name in scenario 1 (for example Kamal Hossain): C1 warns that the name does not match the NID.',
      'Dag <code>449</code>, seller NID <code>9990001013</code>: the record already gives out more land than exists. Dag <code>440</code>, NID <code>9990001011</code>: court order. Dag <code>447</code>, NID <code>9990001012</code>: no namjari.',
    ],
    bn: [
      '<b>আসল ফোনে দেখুন</b> (ওপরের বার): কোডটি স্ক্যান করে নিজের ফোনে করিম হিসেবে লগইন করুন, তারপর এখানে দৃশ্যপট ৪ চালান। এসএমএস আপনার ফোনে যাবে।',
      'ঋণ ডেস্কে <b>ঋ২</b>: করিমের লক করা দাগে বন্ধক তাঁর উত্তরের অপেক্ষায় থাকে। "হ্যাঁ" দিন, তারপর আবার দৃশ্যপট ৪ চালালে C9-ও আটকায়।',
      'দৃশ্যপট ৪, তারপর <b>ডেমো: ৪৮ ঘণ্টা পার করুন</b>: উত্তর না এলে স্থগিত দলিল সতর্কতায় যায়, কর্মকর্তাকে আঙুলের ছাপ নিতে হয়।',
      'দৃশ্যপট ১ চালান কিন্তু সম্পন্ন করবেন না, ব্যাংকে দাগ ৪১২-এ ঋণ নিবন্ধন করুন, তারপর সম্পন্ন করুন: পুনর্যাচাইয়ে ক্লিয়ারেন্স বাতিল হয়।',
      'দৃশ্যপট ১-এ বিক্রেতার অন্য নাম লিখুন (যেমন Kamal Hossain): C1 জানায় নাম এনআইডির সাথে মেলে না।',
      'দাগ <code>449</code>, বিক্রেতার এনআইডি <code>9990001013</code>: রেকর্ডে জমির চেয়ে বেশি মালিকানা। দাগ <code>440</code>, এনআইডি <code>9990001011</code>: আদালতের আদেশ। দাগ <code>447</code>, এনআইডি <code>9990001012</code>: নামজারি হয়নি।',
    ],
  };

  // ---------- autoplay ----------
  const params = new URLSearchParams(location.search);
  const AP = { running: false, stop: false, speed: Math.max(0.5, Number(params.get('speed')) || 1), n: 0, total: 0 };
  const stopped = () => {
    if (AP.stop) throw new Error('__stopped__');
  };
  function wait(ms) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function tick() {
        if (AP.stop) return reject(new Error('__stopped__'));
        if (Date.now() - t0 >= ms / AP.speed) return resolve();
        setTimeout(tick, 50);
      })();
    });
  }
  function caption(text) {
    const c = $('#caption');
    c.innerHTML = `<span class="cap-n">${T.n(AP.n)}/${T.n(AP.total)}</span><p>${text}</p><button class="cap-stop" data-ap="stop">${I.stop}${t('cap.stop')}</button><i class="cap-bar" style="width:${(AP.n / AP.total) * 100}%"></i>`;
    c.classList.add('show');
  }
  async function say(cap, ms) {
    stopped();
    caption(esc(L(cap)));
    await wait(ms);
  }
  async function tap(sel, ms) {
    stopped();
    App.highlight(sel);
    await wait(ms || 700);
  }

  const SCRIPT = [
    async () => {
      await App.reset();
      api.clearLog();
      G.tab = 'steps';
      G.latest = null;
      renderAll();
      await say({ en: 'Dag checks a land deed before anyone signs it. One office, one mouza, nine checks. Every record here is invented.', bn: 'দাগ কোনো জমির দলিল সইয়ের আগেই যাচাই করে। একটি অফিস, একটি মৌজা, নয়টি যাচাই। এখানের সব রেকর্ড কাল্পনিক।' }, 4800);
    },
    async () => {
      await say({ en: 'Five offices, five logins. The Sub-Registrar logs in first.', bn: 'পাঁচটি দপ্তর, পাঁচটি লগইন। প্রথমে সাব-রেজিস্ট্রার লগইন করেন।' }, 2200);
      await as('sr', 'counter');
      await wait(900);
    },
    async () => {
      await App.preset(1);
      await say({ en: 'Scenario 1: Karim Mia sells 10 of his 12 decimals. An honest sale.', bn: 'দৃশ্যপট ১: করিম মিয়া তাঁর ১২ শতাংশের মধ্যে ১০ শতাংশ বিক্রি করছেন। একটি সৎ বিক্রি।' }, 2800);
      await tap('#run-btn');
      await App.run();
      await say({ en: 'All nine checks pass. The gate signs a clearance, and its QR code can be checked on any phone.', bn: 'নয়টি যাচাই-ই উত্তীর্ণ। গেট ক্লিয়ারেন্স স্বাক্ষর করে, আর তার কিউআর কোড যেকোনো ফোনে যাচাই করা যায়।' }, 3800);
      await tap('#exec-btn');
      await App.execute();
      await say({ en: 'Execute: the deed is registered and the namjari case opens at AC Land by itself. Nobody files an application.', bn: 'সম্পন্ন: দলিল নিবন্ধিত হয় এবং এসি ল্যান্ডে নামজারি মামলা নিজে থেকেই খোলে। কাউকে আবেদন করতে হয় না।' }, 4200);
    },
    async () => {
      await App.preset(2);
      await say({ en: 'Two weeks later, the same seller sells the same 10 decimals again.', bn: 'দুই সপ্তাহ পর একই বিক্রেতা একই ১০ শতাংশ আবার বিক্রি করছেন।' }, 2800);
      await tap('#run-btn');
      await App.run();
      await say({ en: 'Blocked by arithmetic: 12 recorded, 10 sold, 2 left, 10 asked. Short by 8. Stopped before anyone signs.', bn: 'হিসাবেই আটকানো: রেকর্ডে ১২, বিক্রি ১০, বাকি ২, চাওয়া ১০। ঘাটতি ৮। কেউ সই করার আগেই থামানো।' }, 5000);
    },
    async () => {
      await App.preset(3);
      await say({ en: 'Land the government acquired for a road in 2019.', bn: '২০১৯ সালে সড়কের জন্য সরকারের অধিগৃহীত জমি।' }, 2200);
      await tap('#run-btn');
      await App.run();
      await say({ en: 'Blocked, with an appeal number, because government lists can be wrong too.', bn: 'আটকানো, সাথে আপিল নম্বর, কারণ সরকারি তালিকাতেও ভুল থাকতে পারে।' }, 3400);
    },
    async () => {
      await App.preset(4);
      await say({ en: 'Our first idea, Owner Lock. Someone with a copy of Karim\'s NID tries to sell his locked dag 418.', bn: 'আমাদের প্রথম ধারণা, মালিকের লক। কেউ করিমের এনআইডির কপি দিয়ে তাঁর লক করা দাগ ৪১৮ বিক্রি করতে চাইছে।' }, 4200);
      await tap('#run-btn');
      await App.run();
      await say({ en: 'The deed is held. An SMS goes to Karim\'s phone.', bn: 'দলিল স্থগিত। করিমের ফোনে এসএমএস যায়।' }, 2600);
      await tap('#open-phone-U-OW', 600);
      await App.switchTo('U-OW', { tab: 'land' });
      await say({ en: 'On his own phone Karim reads: is this you? He answers.', bn: 'নিজের ফোনে করিম পড়েন: এটা কি আপনি? তিনি উত্তর দেন।' }, 3200);
      await App.respondLatest('not_me');
      await wait(1100);
      await App.switchTo('U-SR', { tab: 'counter' });
      await say({ en: 'Back at the counter the same request is now blocked. The owner found out before the signature, not years later.', bn: 'কাউন্টারে একই অনুরোধ এখন আটকানো। মালিক বছর পরে নয়, সইয়ের আগেই জানতে পেরেছেন।' }, 4400);
    },
    async () => {
      await App.preset(5);
      await say({ en: 'Our second idea: a plot with a bank loan the buyer cannot see.', bn: 'আমাদের দ্বিতীয় ধারণা: এমন জমি, যার ব্যাংক ঋণ ক্রেতা দেখতে পান না।' }, 2800);
      await tap('#run-btn');
      await App.run();
      await say({ en: 'The bank oracle answers with one signed yes. The loan amount and the borrower never leave the bank. Blocked.', bn: 'ব্যাংক ওরাকল একটি স্বাক্ষরিত "হ্যাঁ" উত্তর দেয়। ঋণের পরিমাণ বা ঋণগ্রহীতার তথ্য ব্যাংকের বাইরে যায় না। আটকানো।' }, 4600);
    },
    async () => {
      await as('bank', 'bank');
      App.loanPreset(1);
      await say({ en: 'At another bank, the developer asks for a second loan on that plot.', bn: 'অন্য একটি ব্যাংকে ডেভেলপার ওই জমিতে দ্বিতীয় ঋণ চাইছে।' }, 3000);
      await tap('#loan-check-btn');
      await App.loanCheck();
      await say({ en: 'Refused: double financing, stopped before any money moves.', bn: 'প্রত্যাখ্যাত: দ্বৈত অর্থায়ন, টাকা হাতবদলের আগেই থামানো।' }, 3200);
    },
    async () => {
      await as('sr', 'counter');
      await App.preset(6);
      await say({ en: 'Not every problem is a block. Here tax is due and one survey link is missing.', bn: 'সব সমস্যায় আটকানো হয় না। এখানে খাজনা বকেয়া আর একটি জরিপের সূত্র নেই।' }, 3200);
      await tap('#run-btn');
      await App.run();
      await wait(1400);
      await tap('#proceed-btn');
      await App.proceed();
      await say({ en: 'The officer writes a note. The clearance is signed with both warnings printed on it.', bn: 'কর্মকর্তা একটি নোট লেখেন। দুটি সতর্কতা ছাপাসহ ক্লিয়ারেন্স স্বাক্ষরিত হয়।' }, 3200);
      const id = App.latestClearance();
      if (id) {
        await tap('#cert-btn', 500);
        await App.openCert(id);
        await say({ en: 'A printable certificate with the QR code and the full signature.', bn: 'কিউআর কোড ও পূর্ণ স্বাক্ষরসহ প্রিন্টযোগ্য সনদ।' }, 3000);
        App.closeCert();
      }
      const qr = App.latestQr();
      if (qr) {
        await tap('#qr-btn', 500);
        App.openQr(qr);
        await say({ en: 'This is what a buyer sees after scanning it: checked on the phone itself, with no server asked.', bn: 'স্ক্যান করার পর ক্রেতা এটাই দেখেন: ফোনেই যাচাই, কোনো সার্ভারে জিজ্ঞেস করা হয়নি।' }, 3800);
        App.closeQr();
      }
    },
    async () => {
      await as('bank', 'verify');
      const id = App.oldestClearance();
      if (!id) return;
      await tap('#vrow-' + id);
      await App.openVerify(id);
      await say({ en: 'Anyone can verify a clearance. The Ed25519 signature is valid.', bn: 'যে কেউ ক্লিয়ারেন্স যাচাই করতে পারেন। Ed25519 স্বাক্ষর সঠিক।' }, 3000);
      await tap('#tamper-btn');
      await App.tamper();
      await say({ en: 'Change one number and the signature fails. Forged copies do not pass.', bn: 'একটি সংখ্যা বদলালেই স্বাক্ষর ব্যর্থ। জাল কপি পার পায় না।' }, 3400);
    },
    async () => {
      await as('ac', 'acland');
      const id = App.firstCase();
      if (id) {
        await say({ en: 'At AC Land, the namjari case that opened by itself is waiting.', bn: 'এসি ল্যান্ডে নিজে থেকে খোলা নামজারি মামলাটি অপেক্ষা করছে।' }, 2600);
        await tap('#approve-' + id);
        await App.approve(id);
        await say({ en: 'Approved. The record and the deed now say the same thing.', bn: 'অনুমোদিত। রেকর্ড আর দলিল এখন একই কথা বলে।' }, 2800);
      }
      App.highlight('#recon-card');
      await say({ en: 'The record health scan also finds a plot that was sold beyond its size before Dag ever ran.', bn: 'রেকর্ড পরীক্ষায় এমন একটি জমিও ধরা পড়ে, যা দাগ চালুর আগেই আয়তনের চেয়ে বেশি বিক্রি হয়েছিল।' }, 4200);
    },
    async () => {
      await as('buyer', 'mouza');
      await App.pickDag('425');
      await say({ en: 'A buyer checks before paying. On the record, dag 425 looks clean.', bn: 'ক্রেতা টাকা দেওয়ার আগে যাচাই করছেন। রেকর্ডে দাগ ৪২৫ পরিষ্কার দেখায়।' }, 3200);
      await tap('#ask-bank-btn');
      await App.askBank('425');
      await say({ en: 'One signed question to the bank shows the hidden loan.', bn: 'ব্যাংককে একটি স্বাক্ষরিত প্রশ্নেই গোপন ঋণ ধরা পড়ে।' }, 3200);
    },
    async () => {
      await say({ en: 'Dag: stop the bad deed before the signature, not nine years after it. Team Silicon Knights, LandTech 2026.', bn: 'দাগ: ভুল দলিল থামান সইয়ের আগে, নয় বছর পরে নয়। দল সিলিকন নাইটস, ল্যান্ডটেক ২০২৬।' }, 5200);
    },
  ];

  async function autoplay() {
    if (AP.running) return;
    AP.running = true;
    AP.stop = false;
    AP.total = SCRIPT.length;
    while (!App.booted()) await sleep(100);
    document.body.classList.add('autoplaying');
    renderTop();
    try {
      for (let i = 0; i < SCRIPT.length; i++) {
        AP.n = i + 1;
        await SCRIPT[i]();
      }
      caption(esc(t('cap.done')));
      await wait(3000).catch(() => {});
    } catch (e) {
      if (e.message !== '__stopped__') App.toast(e.message, 'err');
    }
    $('#caption').classList.remove('show');
    document.body.classList.remove('autoplaying');
    AP.running = false;
    AP.stop = false;
    renderTop();
  }

  // ---------- top bar ----------
  function backendPill() {
    const s = api.status();
    if (s.phase === 'waking') return `<span class="be waking">${I.server}${t('be.waking', { s: s.elapsed })}</span>`;
    if (s.phase === 'fallback') return `<span class="be fallback">${I.globe}${t('be.fallback')}</span>`;
    if (s.mode === 'http') return `<span class="be server">${I.server}${t('be.server', { host: esc(s.host) })}</span>`;
    return `<span class="be local">${I.globe}${t('be.browser')}</span>`;
  }
  function renderTop() {
    $('#topbar').innerHTML = `<div class="tb-brand">${I.logo}<div><b><span class="bn-word">দাগ</span> Dag</b><span>${t('top.title')}</span></div></div>
      <div class="tb-mid">${backendPill()}</div>
      <div class="tb-actions">
        <div class="seg" role="group" aria-label="Language"><button data-g="lang" data-lang="en" class="${T.lang === 'en' ? 'on' : ''}" aria-pressed="${T.lang === 'en'}">English</button><button data-g="lang" data-lang="bn" class="${T.lang === 'bn' ? 'on' : ''}" aria-pressed="${T.lang === 'bn'}">বাংলা</button></div>
        <button class="btn ghost small" data-g="second" id="g-second">${I.qr}<span>${t('top.second')}</span></button>
        <button class="btn ghost small" data-g="reset"${AP.running ? ' disabled' : ''}>${I.reset}<span>${t('top.reset')}</span></button>
        <button class="btn primary small" data-g="play" id="g-play"${AP.running ? ' disabled' : ''}>${I.play}<span>${AP.running ? t('top.playing') : t('top.play')}</span></button>
      </div>`;
  }

  // ---------- guide ----------
  function onPhone() {
    const u = App.user();
    if (!u) return `<div class="onphone none">${I.phone}<span>${t('g.nobody')}</span></div>`;
    return `<div class="onphone">${I.phone}<span>${t('g.onPhone')}</span><span class="avatar xs" style="background:${App.roleColor(u.role)}">${esc(String(T.pick(u, 'name')).split(/\s+/).map((w) => w[0]).join('').slice(0, 2))}</span><b>${esc(T.pick(u, 'name'))}</b><span class="muted">${esc(t('role.' + u.role))}</span></div>`;
  }
  function headHtml() {
    return `<div class="g-head">
      <div class="g-title"><h1>${t('g.subtitle')}</h1><span class="g-team">Silicon Knights, LandTech 2026</span></div>
      <p class="g-lede">${t('g.lede')}</p>
      <div class="g-row">${onPhone()}</div>
      <button class="g-last" id="g-last" data-g="tab" data-tab="api">${lastLine()}</button>
    </div>
    <nav class="g-tabs" role="tablist">
      <button data-g="tab" data-tab="steps" class="${G.tab === 'steps' ? 'on' : ''}" role="tab" aria-selected="${G.tab === 'steps'}">${t('g.tab.steps')}</button>
      <button data-g="tab" data-tab="how" class="${G.tab === 'how' ? 'on' : ''}" role="tab" aria-selected="${G.tab === 'how'}">${t('g.tab.how')}</button>
      <button data-g="tab" data-tab="api" class="${G.tab === 'api' ? 'on' : ''}" role="tab" aria-selected="${G.tab === 'api'}">${t('g.tab.api')} <span class="g-count" id="g-count">${T.n(api.entries().length)}</span></button>
    </nav>
    <div class="g-body" id="g-body"></div>`;
  }
  function lastLine() {
    const e = G.latest;
    if (!e) return `<span class="ms">${t('g.waitFirst')}</span>`;
    return `<span class="m">${e.method}</span><span class="p">${esc(e.path)}</span><span class="s s${String(e.status)[0]}">${e.status}</span><span class="ms">${T.n(e.ms)} ms, ${t('g.openLog')}</span>`;
  }

  function accLabel(key) {
    const a = (App.accounts() || []).find((x) => x.id === ACC[key]);
    if (!a) return '';
    return `<span class="acc" style="--c:${App.roleColor(a.role)}"><i></i>${esc(T.pick(a, 'name'))}, ${esc(t('role.' + a.role))}</span>`;
  }

  function stepsView() {
    const isDone = (s) => s.done.some((d) => App.events.has(d));
    const doneCount = STEPS.filter(isDone).length;
    const next = STEPS.find((s) => !isDone(s));
    let h = `<div class="prog"><span>${t('g.progress', { done: doneCount, total: STEPS.length })}</span><span class="bar"><i style="width:${(doneCount / STEPS.length) * 100}%"></i></span></div>
      <p class="g-dur">${I.play}${t('g.duration')}</p>`;
    h += STEPS.map((s, i) => {
      const done = isDone(s);
      const isNext = next && next.id === s.id;
      return `<article class="step${done ? ' done' : ''}${isNext ? ' next' : ''}" id="step-${s.id}">
        <div class="st-n">${done ? I.check : T.n(i + 1)}</div>
        <div class="st-b">
          <div class="st-h"><h3>${esc(L(s.title))}</h3><span class="st-tag ${/New|নতুন/.test(L(s.tag)) ? 't-new' : 't-p'}">${esc(L(s.tag))}</span></div>
          <div class="st-acc">${accLabel(s.acc)}${s.acc2 ? `<span class="arrow">›</span>${accLabel(s.acc2)}` : ''}</div>
          <ul class="st-do">${L(s.do).map((d) => `<li>${d}</li>`).join('')}</ul>
          <p class="st-exp"><b>${t('g.see')}</b>${esc(L(s.expect))}</p>
          <p class="st-why"><b>${t('g.why')}</b>${esc(L(s.why))}</p>
          <button class="btn small ${isNext ? 'primary' : 'ghost'}" data-g="go" data-step="${s.id}">${done ? t('g.again') : t('g.go')} ${I.arrow}</button>
        </div></article>`;
    }).join('');
    if (!next) h += `<div class="callout">${t('g.allDone', { n: STEPS.length })}</div>`;
    h += `<div class="free"><h4>${t('g.free')}</h4><ul>${L(FREE).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    return h;
  }

  function howView() {
    const bn = T.lang === 'bn';
    const C = Dag.engine.CHECKS;
    const STOPS = {
      C1: { en: 'A seller whose NID is not on the khatian. Warns if the name on the deed differs from the NID.', bn: 'যে বিক্রেতার এনআইডি খতিয়ানে নেই। দলিলের নাম এনআইডির সাথে না মিললে সতর্ক করে।' },
      C2: { en: 'Selling more than is left, counting sales not yet mutated; any dag the record over-allocates.', bn: 'যতটুকু বাকি তার বেশি বিক্রি, নামজারি বাকি থাকা বিক্রিসহ; রেকর্ডে অতিরিক্ত বরাদ্দ থাকা দাগ।' },
      C3: { en: 'Two deeds on one dag at the same time.', bn: 'একই দাগে একসাথে দুটি দলিল।' },
      C4: { en: 'A seller without namjari (block); unpaid land tax (warn).', bn: 'নামজারি ছাড়া বিক্রেতা (আটকানো); বকেয়া খাজনা (সতর্কতা)।' },
      C5: { en: 'Khas, acquired, waqf, debottar or vested land.', bn: 'খাস, অধিগৃহীত, ওয়াকফ, দেবোত্তর বা অর্পিত সম্পত্তি।' },
      C6: { en: 'A dag under a court order.', bn: 'আদালতের আদেশে থাকা দাগ।' },
      C7: { en: 'Warns when CS, SA, RS and BS do not link up.', bn: 'সিএস, এসএ, আরএস ও বিএস না মিললে সতর্ক করে।' },
      C8: { en: 'Any deed or mortgage the real owner did not confirm on his phone. Becomes a warning after 48 hours.', bn: 'আসল মালিক নিজের ফোনে নিশ্চিত না করা যেকোনো দলিল বা বন্ধক। ৪৮ ঘণ্টা পর সতর্কতা হয়।' },
      C9: { en: 'Sale of land with a live bank charge.', bn: 'ব্যাংকের চলমান দায় থাকা জমির বিক্রি।' },
    };
    const steps = bn
      ? [
          '<b>সাব-রেজিস্ট্রার দলিল পাঠান</b> <code>POST /api/counter/clearance</code>-এ: দাগ, বিক্রেতার এনআইডি, ক্রেতা, অংশ। সার্ভার তাঁর সেশন ও ভূমিকা যাচাই করে।',
          '<b>এনআইডি সার্ভিস</b> (নমুনা) জানায় এনআইডিটি কার।',
          '<b>ব্যাংক ওরাকল</b> (নমুনা সিআইবি) "এই দাগে কি চলমান দায় আছে?" প্রশ্নের উত্তর নিজের কী দিয়ে স্বাক্ষর করে। গেট সেই স্বাক্ষর যাচাই করে।',
          '<b>নয়টি যাচাই-ই চলে</b>, C1 থেকে C9। প্রথম সমস্যায় থামে না, তাই কর্মকর্তা প্রতিটি কারণ দেখেন।',
          '<b>সবচেয়ে কঠিন ফলটিই চূড়ান্ত</b>: আটকানো, তারপর স্থগিত, তারপর সতর্কতা, তারপর উত্তীর্ণ।',
          '<b>সতর্কবার্তা চালু রাখা মালিকেরা</b> বাংলা ও ইংরেজিতে এসএমএস পান। দাগ লক থাকলে মালিক নিজের লগইনে উত্তর দেন, আর সেই উত্তর দিয়ে যাচাই আবার চলে।',
          '<b>উত্তীর্ণ হলে গেট ক্লিয়ারেন্স স্বাক্ষর করে</b> (ক্যানোনিকাল JSON-এর ওপর Ed25519), আর কিউআর কোডের জন্য একটি ছোট স্বাক্ষরিত লেখা বানায়।',
          '<b>প্রতিটি ধাপ অডিট চেইনে লেখা হয়।</b> প্রতিটি এন্ট্রিতে আগেরটির হ্যাশ থাকে, তাই গোপনে কিছু বদলালে চেইন ভেঙে যায়।',
          '<b>দলিল সম্পন্ন করার মুহূর্তে আবার যাচাই হয়।</b> মাঝে কিছু বদলালে ক্লিয়ারেন্স বাতিল। না বদলালে দলিল নিবন্ধিত হয় আর এসি ল্যান্ডে নামজারি খোলে।',
        ]
      : [
          '<b>The Sub-Registrar sends the deed</b> to <code>POST /api/counter/clearance</code>: dag, seller NID, buyer, share. The server checks her session and her role.',
          '<b>The NID service</b> (mock) returns who that NID belongs to.',
          '<b>The bank oracle</b> (mock CIB) answers "is there a live charge on this dag?" and signs the answer with its own key. The gate checks that signature.',
          '<b>All nine checks run</b>, C1 to C9. The engine never stops at the first problem, so the officer sees every reason.',
          '<b>The worst check decides</b>: blocked beats held beats warn beats pass.',
          '<b>Owners with alerts on</b> get an SMS in Bangla and English. On a locked dag the owner answers on his own login, and the checks run again with his answer.',
          '<b>On a pass the gate signs a clearance</b> (Ed25519 over canonical JSON) and a short signed text for the QR code.',
          '<b>Every step goes into an audit chain.</b> Each entry holds the hash of the one before, so a silent edit breaks the chain.',
          '<b>At execution the checks run once more.</b> If anything changed, the clearance is void. If not, the deed is registered and namjari opens at AC Land.',
        ];
    const sec = bn
      ? [
          ['প্রতিটি কলে ভূমিকা', 'প্রতিটি পথে কোন ভূমিকা ডাকতে পারে তা লেখা থাকে। সেশন না থাকলে ৪০১, ভুল ভূমিকায় ৪০৩।'],
          ['লগইন', 'প্রতি ব্যবহারকারীর আলাদা সল্টসহ ৪০৯৬ বার SHA-512 হ্যাশ, ১২ ঘণ্টার সেশন, ৫ বার ভুল হলে ৬০ সেকেন্ড লক।'],
          ['গোপন কী', 'রেন্ডার সার্ভারে স্বাক্ষরের কী আসে পরিবেশ ভেরিয়েবল থেকে, পাবলিক কোড থেকে নয়। ব্রাউজার সংস্করণে "ডেমো কী" লেখা থাকে।'],
          ['আলাদা ওয়ার্কস্পেস', 'একই সার্ভারে প্রতিটি ব্রাউজার নিজের রেকর্ডের কপি পায়, তাই বিচারকেরা একে অপরের কাজ দেখেন না।'],
          ['কিউআর', 'কিউআর-এ এনআইডির শুধু শেষ চার অঙ্ক থাকে। ফোন শুধু পাবলিক কী দিয়ে ইন্টারনেট ছাড়াই যাচাই করে।'],
          ['ব্যাংকের এক বিট', 'ওরাকল জানায় শুধু হ্যাঁ বা না, তারিখ ও ঋণদাতা। ঋণের পরিমাণ বা ঋণগ্রহীতার অন্য ঋণ কখনও নয়।'],
        ]
      : [
          ['Roles on every call', 'Each route lists who may call it. No session gives 401, the wrong role gives 403.'],
          ['Logins', 'SHA-512 stretched 4096 times with a per-user salt, 12 hour sessions, a 60 second lock after 5 wrong tries.'],
          ['Secret keys', 'On the Render server the signing keys come from environment variables, not from the public code. The browser build says "demo key" on screen.'],
          ['Private workspaces', 'On one shared server each browser gets its own copy of the records, so judges never see each other\'s actions.'],
          ['The QR code', 'It carries only the last four digits of each NID. A phone checks it offline with the public key alone.'],
          ['One bit from the bank', 'The oracle sends yes or no, a date and the lender. Never the amount or the borrower\'s other loans.'],
        ];
    const real = bn
      ? [['রুলস ইঞ্জিন, লেজার, লক, ভূমিকা, নামজারি', 'বাস্তব যুক্তি, ৩৩টি স্বয়ংক্রিয় পরীক্ষায় যাচাই'], ['স্বাক্ষর, অডিট চেইন, কিউআর', 'বাস্তব Ed25519 ও SHA-512 (TweetNaCl)'], ['এইচটিটিপি এপিআই', 'বাস্তব: রেন্ডারে server/http.js, অথবা ব্রাউজারে একই কোড'], ['এনআইডি, সিআইবি, এসএমএস', 'নমুনা সার্ভিস, বাস্তব সার্ভিসের মতো কলের গঠন'], ['রেকর্ড', 'কাল্পনিক: একটি মৌজা, ৮টি দাগ, ১৪ জন ব্যক্তি, ২টি ব্যাংক']]
      : [['Rules engine, ledger, locks, roles, namjari', 'Real logic, covered by 33 automated tests'], ['Signatures, audit chain, QR', 'Real Ed25519 and SHA-512 (TweetNaCl)'], ['HTTP API', 'Real: server/http.js on Render, or the same code in the browser'], ['NID, CIB, SMS', 'Mock services with the call shape a real one would have'], ['Records', 'Invented: one mouza, 8 dags, 14 people, 2 banks']];
    return `<div class="how">
      <h3>${bn ? 'একটি ক্লিয়ারেন্স অনুরোধে যা ঘটে' : 'What happens on one clearance request'}</h3>
      <ol class="flow">${steps.map((x) => `<li>${x}</li>`).join('')}</ol>
      <h3>${bn ? 'গঠন' : 'Architecture'}</h3>
      <div class="diagram">${diagram()}</div>
      <h3>${bn ? 'নয়টি যাচাই' : 'The nine checks'}</h3>
      <table><thead><tr><th>${bn ? 'কোড' : 'Code'}</th><th>${bn ? 'যাচাই' : 'Check'}</th><th>${bn ? 'যা থামায়' : 'Stops'}</th></tr></thead><tbody>
        ${C.map((c) => `<tr class="${c.addition ? 'add' : ''}"><td>${c.code}</td><td>${esc(bn ? c.nameBn : c.name)}${c.addition ? ` <em>${t('chk.new')}</em>` : ''}</td><td>${esc(L(STOPS[c.code]))}</td></tr>`).join('')}
      </tbody></table>
      <h3>${bn ? 'নিরাপত্তা, সহজ ভাষায়' : 'Security, in plain terms'}</h3>
      <dl class="secl">${sec.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
      <h3>${bn ? 'কী বাস্তব, কী নমুনা' : 'What is real and what is mocked'}</h3>
      <table><tbody>${real.map(([a, b]) => `<tr><td class="plain">${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>
      <div class="callout">${bn ? `<b>একই ব্যাকএন্ড, দুই জায়গায়।</b> ভার্সেলের পাতা রেন্ডারের সার্ভারকে ডাকে। রেন্ডার ঘুমিয়ে থাকলে পাতাটি জেগে ওঠার সময় গোনে, আর দেরি হলে একই কোড ব্রাউজারেই চালায়। এই পাতা এখন ব্যবহার করছে: <b>${api.mode === 'http' ? 'সার্ভার' : 'ব্রাউজারের ব্যাকএন্ড'}</b>।` : `<b>One backend, two places.</b> The Vercel page calls the Render server. If Render is asleep, the page counts the seconds while it wakes, and if it takes too long it runs the same code in the browser. This page is using: <b>${api.mode === 'http' ? 'the server' : 'the in-browser backend'}</b>.`}</div>
    </div>`;
  }

  function diagram() {
    const bn = T.lang === 'bn';
    const lb = (en, b) => esc(bn ? b : en);
    const box = (x, y, w, h, tx, sx, fill, stroke, dash) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${dash ? ' stroke-dasharray="4 3"' : ''}/><text x="${x + w / 2}" y="${y + (sx ? h / 2 - 2 : h / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="600" fill="#13221C">${tx}</text>${sx ? `<text x="${x + w / 2}" y="${y + h / 2 + 13}" text-anchor="middle" font-size="10" fill="#6E7C75">${sx}</text>` : ''}`;
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4A5852" stroke-width="1.3" marker-end="url(#ga)"/>`;
    return `<svg viewBox="0 0 620 350" width="100%" role="img" aria-label="${lb('Architecture', 'গঠন')}">
      <defs><marker id="ga" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="#4A5852"/></marker></defs>
      ${box(8, 14, 132, 322, '', '', '#F1F5F0', '#A9D8BF')}
      <text x="74" y="36" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0E3B2E">${lb('Five accounts', 'পাঁচ অ্যাকাউন্ট')}</text>
      ${box(18, 48, 112, 46, lb('Sub-Registrar', 'সাব-রেজিস্ট্রার'), lb('counter', 'কাউন্টার'), '#fff', '#D8E0D9')}
      ${box(18, 102, 112, 46, lb('Landowner', 'জমির মালিক'), lb('Owner Lock', 'মালিকের লক'), '#fff', '#D8E0D9')}
      ${box(18, 156, 112, 46, lb('AC (Land)', 'এসি (ল্যান্ড)'), lb('namjari', 'নামজারি'), '#fff', '#D8E0D9')}
      ${box(18, 210, 112, 46, lb('Bank officer', 'ব্যাংক কর্মকর্তা'), lb('loan desk', 'ঋণ ডেস্ক'), '#fff', '#D8E0D9')}
      ${box(18, 264, 112, 46, lb('Buyer', 'ক্রেতা'), lb('mouza map', 'মৌজা ম্যাপ'), '#fff', '#D8E0D9')}
      <rect x="156" y="14" width="34" height="322" rx="8" fill="#0E3B2E"/>
      <text x="173" y="175" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" transform="rotate(-90 173 175)">JSON API /api  +  ${lb('workspace', 'ওয়ার্কস্পেস')}</text>
      ${arrow(140, 175, 154, 175)}
      ${box(208, 14, 236, 322, '', '', '#fff', '#0E3B2E')}
      <text x="326" y="36" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0E3B2E">${lb('Dag gate', 'দাগ গেট')}</text>
      ${box(220, 48, 212, 42, lb('Rules engine', 'রুলস ইঞ্জিন'), lb('C1 to C9, pure functions', 'C1 থেকে C9'), '#F1F5F0', '#A9D8BF')}
      ${box(220, 98, 103, 42, lb('Roles', 'ভূমিকা'), lb('per route', 'প্রতি পথে'), '#F1F5F0', '#A9D8BF')}
      ${box(329, 98, 103, 42, lb('Owner Lock', 'মালিকের লক'), lb('SMS, 48 h', 'এসএমএস, ৪৮ ঘণ্টা'), '#EFEAF7', '#C8B8E3')}
      ${box(220, 148, 103, 42, lb('Signer', 'স্বাক্ষর'), 'Ed25519, QR', '#F1F5F0', '#A9D8BF')}
      ${box(329, 148, 103, 42, lb('Audit chain', 'অডিট চেইন'), 'SHA-512', '#F1F5F0', '#A9D8BF')}
      ${box(220, 198, 103, 42, lb('Area ledger', 'জমির হিসাব'), lb('shares sold', 'বিক্রীত অংশ'), '#F1F5F0', '#A9D8BF')}
      ${box(329, 198, 103, 42, lb('Record health', 'রেকর্ড পরীক্ষা'), lb('mouza scan', 'মৌজা স্ক্যান'), '#F1F5F0', '#A9D8BF')}
      ${box(220, 248, 212, 42, lb('Re-check, then register', 'আবার যাচাই, তারপর নিবন্ধন'), lb('opens namjari at AC Land', 'এসি ল্যান্ডে নামজারি খোলে'), '#E5F2EA', '#B5DBC4')}
      ${box(220, 296, 212, 30, lb('Loan desk check', 'ঋণ ডেস্কের যাচাই'), '', '#EFEAF7', '#C8B8E3')}
      ${arrow(190, 175, 206, 175)}
      ${box(474, 30, 138, 48, lb('NID service', 'এনআইডি সার্ভিস'), lb('mock', 'নমুনা'), '#FBF4E6', '#C9A36A', true)}
      ${box(474, 92, 138, 48, lb('CIB oracle', 'সিআইবি ওরাকল'), lb('mock bank, own key', 'নমুনা ব্যাংক, নিজস্ব কী'), '#EFEAF7', '#5A3E8E', true)}
      ${box(474, 154, 138, 48, lb('SMS gateway', 'এসএমএস গেটওয়ে'), lb('mock', 'নমুনা'), '#FBF4E6', '#C9A36A', true)}
      ${box(474, 216, 138, 48, lb('AC Land system', 'এসি ল্যান্ড সিস্টেম'), lb('namjari queue', 'নামজারির তালিকা'), '#FBF4E6', '#C9A36A', true)}
      ${arrow(432, 69, 472, 56)}${arrow(432, 118, 472, 116)}${arrow(432, 310, 482, 142)}${arrow(432, 128, 472, 176)}${arrow(432, 268, 472, 242)}
      <text x="543" y="300" text-anchor="middle" font-size="10" fill="#6E7C75">${lb('dashed: systems we do not own', 'ডট রেখা: অন্যের সিস্টেম')}</text>
    </svg>`;
  }

  function apiView() {
    const list = api.entries();
    let h = `<div class="api-top"><span>${t('g.apiTop')}</span><button class="btn ghost small" data-g="clear">${t('g.clear')}</button></div>`;
    if (!list.length) return h + `<div class="hint"><b>${t('g.apiEmptyTitle')}</b><p>${t('g.apiEmptyBody')}</p></div>`;
    h += list.map((e) => {
      const open = G.open.has(e.id);
      return `<div class="lg" id="lg-${e.id}"><button class="lg-h" data-g="log" data-id="${e.id}" aria-expanded="${open}"><span class="m ${e.method === 'POST' ? 'post' : ''}">${e.method}</span><span class="p">${esc(e.path)}</span><span class="s ${e.status < 400 ? 'ok' : 'bad'}">${e.status}</span><span class="ms">${e.ms} ms</span></button>
        ${open ? `<div class="lg-b">
          ${e.request !== undefined ? `<h5>${t('g.req')}</h5><pre>${json(e.request)}</pre>` : ''}
          ${e.trace.length ? `<h5>${t('g.inside', { n: e.trace.length })}</h5><ol class="trace">${e.trace.map((x) => `<li><b>${esc(x.to)}</b><code>${esc(x.call)}</code>${x.data ? `<pre>${json(x.data)}</pre>` : ''}</li>`).join('')}</ol>` : ''}
          <h5>${t('g.res', { code: e.status })}</h5><pre>${json(e.response)}</pre></div>` : ''}</div>`;
    }).join('');
    return h;
  }

  // ---------- second phone ----------
  function modalHtml() {
    const browser = api.mode !== 'http';
    const url = api.shareUrl('owner');
    let qr = '';
    try {
      const q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    } catch (e) {
      qr = '';
    }
    return `<div class="modal" role="dialog" aria-modal="true" aria-label="${t('ss.title')}">
      <h2>${t('ss.title')}</h2>
      ${browser ? `<p class="note">${t('ss.browser')}</p>` : `<div class="ss-qr">${qr}</div><p>${t('ss.body')}</p>`}
      <div class="modal-actions">
        <button class="btn primary" data-g="second-window">${I.phone}${t('ss.window')}</button>
        <button class="btn ghost" data-g="copy" data-url="${esc(url)}">${I.link}${t('ss.copy')}</button>
        <button class="btn ghost" data-g="modal-close">${I.x}${t('common.close')}</button>
      </div></div>`;
  }
  function openModal() {
    const m = $('#modal');
    m.innerHTML = modalHtml();
    m.hidden = false;
  }
  function closeModal() {
    const m = $('#modal');
    m.hidden = true;
    m.innerHTML = '';
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
  function renderAll() {
    renderTop();
    $('#guide').innerHTML = headHtml();
    renderBody();
  }

  async function onClick(e) {
    const el = e.target.closest('[data-g]');
    if (!el) return;
    const d = el.dataset;
    try {
      if (d.g === 'tab') {
        G.tab = d.tab;
        renderAll();
        $('#g-body').scrollTop = 0;
      } else if (d.g === 'lang') {
        T.set(d.lang);
      } else if (d.g === 'play') {
        if (!App.booted()) return;
        await autoplay();
      } else if (d.g === 'reset') {
        await App.reset();
        api.clearLog();
        G.open.clear();
        G.latest = null;
        renderAll();
      } else if (d.g === 'go') {
        if (AP.running || !App.booted()) return;
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
        renderAll();
      } else if (d.g === 'second') {
        openModal();
      } else if (d.g === 'second-window') {
        window.open(api.shareUrl('owner'), 'dag-second', 'width=430,height=900');
        closeModal();
      } else if (d.g === 'copy') {
        try {
          await navigator.clipboard.writeText(d.url);
          App.toast(t('toast.copied'));
        } catch (err) {
          window.prompt('', d.url);
        }
      } else if (d.g === 'modal-close') {
        closeModal();
      }
    } catch (err) {
      App.toast(api.errText(err), 'err');
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
      void last.getBoundingClientRect();
      last.classList.add('flash');
    }
    const count = $('#g-count');
    if (count) count.textContent = T.n(api.entries().length);
    const row = $('.g-row');
    if (row) row.innerHTML = onPhone();
    if (G.tab === 'api') renderBody();
  });
  App.events.on((name) => {
    const row = $('.g-row');
    if (row) row.innerHTML = onPhone();
    if (name === 'user') return;
    if (G.tab === 'steps') {
      renderBody();
      // Bring the next step into view so the judge never has to hunt for it.
      // Only inside the guide's own scroll box: never move the page away from the phone.
      const body = $('#g-body');
      const next = $('#g-body .step.next');
      if (next && body.scrollHeight > body.clientHeight + 4 && getComputedStyle(body).overflowY === 'auto') {
        const b = body.getBoundingClientRect();
        const n = next.getBoundingClientRect();
        if (n.top < b.top || n.bottom > b.bottom) body.scrollBy({ top: n.top - b.top - 12, behavior: 'smooth' });
      }
    }
  });
  api.onStatus(() => renderTop());
  T.on(() => {
    renderAll();
    if (!$('#modal').hidden) openModal();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#topbar, #guide, #modal')) onClick(e);
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });
  $('#caption').addEventListener('click', (e) => {
    if (e.target.closest('[data-ap="stop"]')) AP.stop = true;
  });
  renderAll();
  window.DagGuide = { autoplay, isPlaying: () => AP.running };
  if (params.get('autoplay') === '1') {
    api.ready.then(() => setTimeout(autoplay, 900));
  }
})();
