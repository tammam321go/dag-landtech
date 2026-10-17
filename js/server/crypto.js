/*
 * Dag crypto helpers.
 * Ed25519 signatures (TweetNaCl) over canonical JSON, and SHA-512 hashing for
 * the audit chain. Works in the browser and in Node (for tests).
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const nacl = () => root.nacl;
  const enc = new TextEncoder();

  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const toB64 = (u8) => {
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // Stable JSON: keys sorted at every level, so the same data always gives
  // the same bytes, and therefore the same signature.
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return (
      '{' +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  }

  const hashHex = (s) => toHex(nacl().hash(enc.encode(String(s)))).slice(0, 64);

  // Demo keys are derived from fixed labels so that a clearance signed
  // yesterday still verifies today. Production keys would live in an HSM.
  const keyFromLabel = (label) =>
    nacl().sign.keyPair.fromSeed(nacl().hash(enc.encode(label)).slice(0, 32));

  const sign = (obj, kp) => toB64(nacl().sign.detached(enc.encode(canonical(obj)), kp.secretKey));

  const verify = (obj, sigB64, publicKey) => {
    try {
      return nacl().sign.detached.verify(enc.encode(canonical(obj)), fromB64(sigB64), publicKey);
    } catch (e) {
      return false;
    }
  };

  const fingerprint = (publicKey) => hashHex(toHex(publicKey)).slice(0, 16);
  const randomHex = (n) => toHex(nacl().randomBytes(n));

  const cache = {};
  const keys = {
    gate: () => cache.gate || (cache.gate = keyFromLabel('dag-gate-demo-signing-key-v1')),
    oracle: () => cache.oracle || (cache.oracle = keyFromLabel('cib-oracle-demo-signing-key-v1')),
  };

  Dag.crypto = { canonical, hashHex, sign, verify, fingerprint, randomHex, toHex, keys };
})(typeof window !== 'undefined' ? window : globalThis);
