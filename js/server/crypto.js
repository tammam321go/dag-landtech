/*
 * Dag crypto helpers (TweetNaCl).
 *   Ed25519 signatures over canonical JSON, and over the short text that a
 *   clearance QR code carries.
 *   SHA-512 for the audit chain and for stretched password hashes.
 * Keys:
 *   In the browser build the keys come from fixed demo seeds. That is on
 *   purpose: a clearance made on the static site verifies on any phone. The
 *   page labels these keys "demo".
 *   On the Node server, server/http.js calls configure() with secret seeds
 *   from environment variables, so nobody can forge a server clearance from
 *   the public source code.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const nacl = () => root.nacl;
  const enc = new TextEncoder();

  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => Uint8Array.from((h.match(/../g) || []).map((x) => parseInt(x, 16)));
  function toB64(u8) {
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  }
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const toB64url = (u8) => toB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function fromB64url(s) {
    const b = String(s).replace(/-/g, '+').replace(/_/g, '/');
    return fromB64(b + '==='.slice((b.length + 3) % 4));
  }

  // Stable JSON: keys sorted at every level, so the same data always gives
  // the same bytes and therefore the same signature.
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
  const seedKey = (seed) => nacl().sign.keyPair.fromSeed(nacl().hash(enc.encode(String(seed))).slice(0, 32));

  const DEMO = { gate: 'dag-gate-demo-signing-key-v1', oracle: 'cib-oracle-demo-signing-key-v1' };
  const cfg = { mode: 'demo', gateSeed: DEMO.gate, oracleSeed: DEMO.oracle };
  const cache = {};
  function configure(opts) {
    if (opts.gateSeed) cfg.gateSeed = String(opts.gateSeed);
    if (opts.oracleSeed) cfg.oracleSeed = String(opts.oracleSeed);
    cfg.mode = opts.mode || 'server';
    delete cache.gate;
    delete cache.oracle;
  }
  const keys = {
    gate: () => cache.gate || (cache.gate = seedKey(cfg.gateSeed)),
    oracle: () => cache.oracle || (cache.oracle = seedKey(cfg.oracleSeed)),
    demoGate: () => cache.demoGate || (cache.demoGate = seedKey(DEMO.gate)),
  };

  const fingerprint = (publicKey) => hashHex(toHex(publicKey)).slice(0, 16);

  const sign = (obj, kp) => toB64(nacl().sign.detached(enc.encode(canonical(obj)), kp.secretKey));
  function verify(obj, sigB64, publicKey) {
    try {
      return nacl().sign.detached.verify(enc.encode(canonical(obj)), fromB64(sigB64), publicKey);
    } catch (e) {
      return false;
    }
  }

  const signText = (text, kp) => toB64url(nacl().sign.detached(enc.encode(text), kp.secretKey));
  function verifyText(text, sigB64url, publicKey) {
    try {
      return nacl().sign.detached.verify(enc.encode(text), fromB64url(sigB64url), publicKey);
    } catch (e) {
      return false;
    }
  }

  // Password hash: SHA-512 stretched 4096 times with a per-user salt.
  // Production would use Argon2id on the server; this keeps the demo free of
  // native dependencies while still not storing plain or single-hash secrets.
  function hashPassword(password, salt, rounds) {
    let h = nacl().hash(enc.encode(salt + '\u0000' + String(password)));
    const s = enc.encode(salt);
    const buf = new Uint8Array(h.length + s.length);
    for (let i = 0; i < (rounds || 4096); i++) {
      buf.set(h, 0);
      buf.set(s, h.length);
      h = nacl().hash(buf);
    }
    return toHex(h).slice(0, 64);
  }

  const randomHex = (n) => toHex(nacl().randomBytes(n));

  function publicKeys() {
    const g = keys.gate().publicKey;
    const o = keys.oracle().publicKey;
    return {
      mode: cfg.mode,
      gate: { algorithm: 'Ed25519', keyId: fingerprint(g), publicKeyHex: toHex(g) },
      oracle: { algorithm: 'Ed25519', keyId: fingerprint(o), publicKeyHex: toHex(o) },
      demoGate: { algorithm: 'Ed25519', keyId: fingerprint(keys.demoGate().publicKey), publicKeyHex: toHex(keys.demoGate().publicKey) },
    };
  }

  Dag.crypto = {
    canonical, hashHex, sign, verify, signText, verifyText, hashPassword,
    fingerprint, randomHex, toHex, fromHex, toB64url, fromB64url,
    keys, configure, publicKeys, mode: () => cfg.mode,
  };
})(typeof window !== 'undefined' ? window : globalThis);
