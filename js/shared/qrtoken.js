/*
 * The text inside a clearance QR code, and how anyone can verify it.
 *
 *   1~CLR-2026-0001~112~412~1001~1002~10~1760707380~p~50e22d95~<signature>
 *   v  clearance id  JL  dag  seller buyer share issued  verdict key  Ed25519
 *                          (last 4 NID digits only)
 *
 * The phone that scans it needs only the gate's public key. No server is
 * asked, so it works offline. NIDs are cut to their last four digits, so a
 * QR printed on a deed does not leak anyone's full NID.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});
  const SEP = '~';

  function make(clearance, kp) {
    const C = Dag.crypto;
    const p = clearance;
    const fields = [
      '1',
      p.id,
      p.jl,
      p.dag,
      String(p.seller.nid).slice(-4),
      String(p.buyer.nid).slice(-4),
      String(Dag.fmt.r2(p.share)),
      String(Math.floor(Date.parse(p.issuedAt) / 1000)),
      p.verdict === 'warn' ? 'w' : 'p',
      C.fingerprint(kp.publicKey).slice(0, 8),
    ];
    const text = fields.join(SEP);
    return text + SEP + C.signText(text, kp);
  }

  function parse(token) {
    const s = String(token || '').trim();
    const i = s.lastIndexOf(SEP);
    if (i < 0) return null;
    const text = s.slice(0, i);
    const sig = s.slice(i + 1);
    const f = text.split(SEP);
    if (f.length !== 10 || f[0] !== '1') return null;
    return {
      text, sig,
      id: f[1], jl: f[2], dag: f[3], seller4: f[4], buyer4: f[5],
      share: Number(f[6]), issuedAt: new Date(Number(f[7]) * 1000).toISOString(),
      verdict: f[8] === 'w' ? 'warn' : 'pass', keyId: f[9],
    };
  }

  // keyring: [{ keyId, publicKeyHex, label }]
  function verify(token, keyring) {
    const t = parse(token);
    if (!t) return { ok: false, reason: 'format' };
    const key = (keyring || []).find((k) => k.keyId.slice(0, 8) === t.keyId);
    if (!key) return { ok: false, reason: 'unknown_key', token: t };
    const ok = Dag.crypto.verifyText(t.text, t.sig, Dag.crypto.fromHex(key.publicKeyHex));
    return { ok, reason: ok ? null : 'bad_signature', token: t, key };
  }

  Dag.qrtoken = { make, parse, verify };
})(typeof window !== 'undefined' ? window : globalThis);
