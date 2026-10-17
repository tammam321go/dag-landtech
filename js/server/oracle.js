/*
 * Mock of the Bangladesh Bank CIB side: the encumbrance oracle.
 * It answers one question, "is there a live charge on this dag?", and signs
 * the answer with its own key. Loan amount, loan reference and the borrower's
 * other facilities never leave this function.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  function query(state, { dag, askedBy }) {
    const C = Dag.crypto;
    const charge = state.bank.charges.find((c) => c.dag === dag && c.status === 'live') || null;
    const reply = {
      mouza: `${state.mouza.name}, JL ${state.mouza.jl}`,
      dag,
      charge: !!charge,
      since: charge ? charge.since : null,
      lender: charge ? charge.lender : null,
      askedBy,
      at: new Date().toISOString(),
      nonce: C.randomHex(6),
    };
    const signature = C.sign(reply, C.keys.oracle());
    state.oracleLog.push({
      at: reply.at,
      dag,
      askedBy,
      answer: reply.charge,
      disclosed: charge ? ['charge: yes', 'since', 'lender'] : ['charge: no'],
      withheld: charge ? ['loan amount', 'loan reference', 'borrower and other loans'] : ['nothing held on this dag'],
    });
    return { reply, signature, keyId: C.fingerprint(C.keys.oracle().publicKey) };
  }

  // The gate only needs the oracle's public key to check the answer.
  const verify = (q) => Dag.crypto.verify(q.reply, q.signature, Dag.crypto.keys.oracle().publicKey);

  Dag.oracle = { query, verify };
})(typeof window !== 'undefined' ? window : globalThis);
