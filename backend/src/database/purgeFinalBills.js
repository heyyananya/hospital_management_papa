/**
 * One-shot cleanup: delete EVERY Final / Edited bill in the system and
 * reset the FBILL number sequence back to 1.
 *
 * Auto bills are NOT touched — they are the permanent hospital record.
 *
 * Usage:  npm run bills:purge-final
 */
require('dotenv').config();
const { pool, withTx } = require('../config/db');

(async () => {
  try {
    const result = await withTx(async (client) => {
      // bill_services rows are removed automatically via ON DELETE CASCADE.
      const { rowCount } = await client.query(
        `DELETE FROM bills WHERE bill_type = 'FINAL'`
      );

      // Restart the sequence so the next FBILL is FBILL-YYYY-000001 again.
      await client.query(`ALTER SEQUENCE final_bill_number_seq RESTART WITH 1`);

      return rowCount;
    });

    console.log(`[bills:purge-final] Deleted ${result} Final bill(s). Sequence reset.`);
  } catch (err) {
    console.error('[bills:purge-final] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
