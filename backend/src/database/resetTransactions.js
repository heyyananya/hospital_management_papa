/**
 * Transactional-data purge — wipes patients / visits / bills / reports /
 * admissions / registers / audit logs and resets every ID sequence to 1.
 *
 * WHAT IS KEPT:
 *   - users              (accounts + admin rights + permissions)
 *   - app_settings       (clinic name, letterpad config, etc.)
 *   - languages, villages, referrals
 *   - service_master, complaint_master, examination_master,
 *     investigation_master, advice_master, plan_master,
 *     medicine_master, known_disease_master
 *   - disease_medicine_templates
 *   - wards, beds        (physical room master; occupied beds are reset FREE)
 *
 * WHAT IS WIPED (with RESTART IDENTITY CASCADE):
 *   - patients, patient_visits and everything referencing them
 *   - bills, bill_services  (both AUTO and IPD)
 *   - reports (rows + uploaded files on disk)
 *   - admissions, indoor_sheet_days
 *   - three_c_amount_overrides, three_c_ipd_entries
 *   - audit_logs, reminders
 *
 * SEQUENCES RESET TO 1:
 *   - patient_code_seq, case_number_seq
 *   - bill_number_seq, final_bill_number_seq
 *
 * SAFETY:  requires CONFIRM=YES to run so nobody nukes prod by tab-complete.
 *
 * Usage:
 *   CONFIRM=YES npm run db:reset-transactions            # bash / macOS / Linux
 *   set CONFIRM=YES && npm run db:reset-transactions     # cmd.exe
 *   $env:CONFIRM='YES'; npm run db:reset-transactions    # PowerShell
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, withTx } = require('../config/db');

const TABLES_TO_WIPE = [
  // Bills first — they reference visits & admissions.
  'bill_services',
  'bills',
  'three_c_amount_overrides',
  'three_c_ipd_entries',
  // Visit-scoped clinical records.
  'reports',
  'prescription_items',
  'doctor_advices',
  'doctor_records',
  'medical_officer_records',
  'patient_known_diseases',
  'visit_complaints',
  'followups',
  'visit_charges',
  // Admissions (IPD).
  'indoor_sheet_days',
  'admissions',
  // Visits + patients.
  'patient_visits',
  'patients',
  // Ops / logs.
  'reminders',
  'audit_logs',
];

const SEQUENCES_TO_RESET = [
  'patient_code_seq',
  'case_number_seq',
  'bill_number_seq',
  'final_bill_number_seq',
];

const REPORTS_DIR = path.resolve(__dirname, '..', 'uploads', 'reports');

(async () => {
  if (process.env.CONFIRM !== 'YES') {
    console.error(
      '[db:reset-transactions] Refusing to run without CONFIRM=YES.\n' +
      '   This will delete every patient, visit, bill, report and admission.\n' +
      '   Set CONFIRM=YES in the environment and re-run.'
    );
    process.exit(1);
  }

  console.log('[db:reset-transactions] Starting…');
  try {
    const summary = await withTx(async (client) => {
      const perTable = {};

      // TRUNCATE with CASCADE + RESTART IDENTITY in a single call so FK
      // ordering doesn't matter and every SERIAL sequence gets reset.
      const tableList = TABLES_TO_WIPE.map((t) => `"${t}"`).join(', ');
      console.log(`  · TRUNCATE ${TABLES_TO_WIPE.length} tables (cascade, restart identity)`);
      await client.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
      TABLES_TO_WIPE.forEach((t) => { perTable[t] = 'cleared'; });

      // Explicit sequence reset for any non-SERIAL sequences (bill number
      // sequences are independent objects created via CREATE SEQUENCE).
      for (const seq of SEQUENCES_TO_RESET) {
        console.log(`  · RESTART SEQUENCE ${seq} WITH 1`);
        await client.query(`ALTER SEQUENCE "${seq}" RESTART WITH 1`);
      }

      // Any bed still marked OCCUPIED refers to an admission we just wiped —
      // put them back to FREE so the ward layout stays consistent.
      const bedsFreed = await client.query(
        `UPDATE beds SET status = 'FREE' WHERE status <> 'FREE'`
      );
      perTable['beds (status → FREE)'] = `${bedsFreed.rowCount} row(s)`;

      return perTable;
    });

    // Delete uploaded report files from disk after the DB commit succeeds
    // (rollback would leave orphan files; committing first + then deleting
    // means a crash here just leaves files for the next run to sweep).
    let filesDeleted = 0;
    if (fs.existsSync(REPORTS_DIR)) {
      for (const name of fs.readdirSync(REPORTS_DIR)) {
        const p = path.join(REPORTS_DIR, name);
        try {
          const stat = fs.statSync(p);
          if (stat.isFile()) { fs.unlinkSync(p); filesDeleted++; }
        } catch (e) {
          console.warn(`  · could not delete ${p}: ${e.message}`);
        }
      }
    }

    console.log('[db:reset-transactions] Done.\n');
    console.table(summary);
    console.log(`Report files deleted from disk: ${filesDeleted}`);
    console.log('\nKept intact: users, app_settings, all masters, wards, beds.');
    console.log('Next patient code: 1  ·  next case number: 1  ·  next bill number: 1');
  } catch (err) {
    console.error('[db:reset-transactions] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
