/*
 * Mock of the Bangladesh Bank CIB side: the encumbrance oracle.
 * It answers one question, "is there a live charge on this dag?", and signs
 * the answer with its own key. The loan amount, the loan reference and the
 * borrower's other facilities never leave this function.
 */
(function (root) {
  'use strict';
  const Dag = (root.Dag = root.Dag || {});

  function query(st, { dag, askedBy, askedByBn }) {
    const C = Dag.crypto;
    const charge = st.bank.charges.find((c) => c.dag === dag && c.status === 'live') || null;
    const reply = {
      mouza: `${st.mouza.name}, JL ${st.mouza.jl}`,
      dag,
      charge: !!charge,
      since: charge ? charge.since : null,
      lender: charge ? charge.lender : null,
      lenderBn: charge ? charge.lenderBn : null,
      askedBy,
      at: new Date().toISOString(),
      nonce: C.randomHex(6),
    };
    const signature = C.sign(reply, C.keys.oracle());
    st.oracleLog.push({
      at: reply.at,
      dag,
      askedBy,
      askedByBn: askedByBn || askedBy,
      answer: reply.charge,
      disclosed: charge ? ['charge_yes', 'since', 'lender'] : ['charge_no'],
      withheld: charge ? ['amount', 'loanRef', 'borrower'] : ['nothing'],
    });
    if (st.oracleLog.length > 200) st.oracleLog.splice(0, st.oracleLog.length - 200);
    return { reply, signature, keyId: C.fingerprint(C.keys.oracle().publicKey) };
  }

  // The gate only needs the oracle's public key to check the answer.
  const verify = (q) => Dag.crypto.verify(q.reply, q.signature, Dag.crypto.keys.oracle().publicKey);

  Dag.oracle = { query, verify };
})(typeof window !== 'undefined' ? window : globalThis);
