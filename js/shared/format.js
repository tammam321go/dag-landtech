/*
 * Dag formatting, shared by the server and the browser.
 * Bangla numerals, money with lakh/crore grouping, and dates in Dhaka time.
 * Dates are computed by hand (UTC + 6 h, Bangladesh has no daylight saving),
 * so Node and every browser print exactly the same text.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  const BN = '০১২৩৪৫৬৭৮৯';
  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  };
  const DHAKA = 6 * 3600 * 1000;

  // Latin digits to Bangla digits. Letters and codes such as "BS-217" keep
  // their Latin digits only when passed through keep().
  const digits = (v, lang) => (lang === 'bn' ? String(v).replace(/[0-9]/g, (d) => BN[+d]) : String(v));
  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  const num = (n, lang) => digits(String(r2(n)), lang);
  const f2 = (n, lang) => digits(r2(n).toFixed(2), lang);

  // 15000000 -> 1,50,00,000 (Bangladesh groups by lakh and crore).
  function group(n) {
    const s = String(Math.round(Math.abs(Number(n))));
    if (s.length <= 3) return s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }
  const money = (n, lang) => (lang === 'bn' ? '৳' + digits(group(n), 'bn') : 'Tk ' + group(n));

  function parts(iso) {
    const d = new Date(Date.parse(iso) + DHAKA);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }
  const pad = (n) => String(n).padStart(2, '0');
  function date(iso, lang) {
    if (!iso) return '';
    const p = parts(iso.length === 10 ? iso + 'T06:00:00Z' : iso);
    return digits(`${p.d} ${MONTHS[lang === 'bn' ? 'bn' : 'en'][p.m]} ${p.y}`, lang);
  }
  function time(iso, lang) {
    if (!iso) return '';
    const p = parts(iso);
    return digits(`${pad(p.h)}:${pad(p.mi)}`, lang);
  }
  const dateTime = (iso, lang) => (iso ? `${time(iso, lang)}, ${date(iso, lang)}` : '');
  const fy = (s, lang) => digits(s, lang);

  // Names: pick the Bangla name when the language is Bangla and one exists.
  const name = (obj, lang, key) => {
    if (!obj) return '';
    const k = key || 'name';
    return lang === 'bn' && obj[k + 'Bn'] ? obj[k + 'Bn'] : obj[k];
  };

  // Bangla case endings for names and places, so text reads naturally:
  //   possessive  করিম মিয়া -> করিম মিয়ার, সেলিনা আক্তার -> সেলিনা আক্তারের
  //   locative    কাশফুল সাব-রেজিস্ট্রি অফিস -> ...অফিসে, শাখা -> শাখায়
  // A name still in Latin letters gets a hyphenated ending: Selina-এর.
  const VOWEL_END = /[অ-ঔা-ৌৗ]$/;
  const BANGLA_END = /[ঀ-৿]$/;
  function bnOf(s) {
    const t = String(s || '').trim();
    if (!BANGLA_END.test(t)) return t + '-এর';
    return VOWEL_END.test(t) ? t + 'র' : t + 'ের';
  }
  function bnAt(s) {
    const t = String(s || '').trim();
    if (!BANGLA_END.test(t)) return t + '-এ';
    return VOWEL_END.test(t) ? t + 'য়' : t + 'ে';
  }

  // Objective: করিম মিয়া -> করিম মিয়াকে
  const bnTo = (s) => {
    const t = String(s || '').trim();
    return BANGLA_END.test(t) ? t + 'কে' : t + '-কে';
  };

  Dag.fmt = { digits, r2, num, f2, money, group, date, time, dateTime, fy, name, bnOf, bnAt, bnTo, BN };
})(typeof window !== 'undefined' ? window : globalThis);
