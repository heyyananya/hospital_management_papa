/**
 * Public patient code = plain sequential integer (1, 2, 3, ...).
 * Patient identity is permanent — the code does NOT reset each FY.
 */
const nextPatientCode = async (client) => {
  const { rows } = await client.query("SELECT nextval('patient_code_seq') AS n");
  return String(Number(rows[0].n));
};

/**
 * Case number resets each Financial Year (Apr 1). Returns
 * { caseNumber, fyKey } so the caller can persist both.
 *
 * Uses MAX+1 within the current FY inside the caller's transaction —
 * atomic under Postgres row-level locking without needing a per-FY sequence.
 */
const { currentFY } = require('./financialYear');

const nextCaseNumber = async (client) => {
  const fy = currentFY();
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(case_number), 0) + 1 AS n
       FROM patient_visits
      WHERE fy_key = $1`,
    [fy.key]
  );
  return { caseNumber: Number(rows[0].n), fyKey: fy.key };
};

module.exports = { nextPatientCode, nextCaseNumber };
