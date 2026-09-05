-- =====================================================================
-- Doctor Clinic Management System - PostgreSQL schema
-- Normalised, audit-friendly, single-clinic single-doctor configuration.
-- =====================================================================

-- Roles enum (admin/doctor, receptionist, medical_officer).
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Visit lifecycle status.
DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM (
    'WAITING_FOR_MEDICAL_OFFICER',
    'WAITING_FOR_DOCTOR',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(60)  UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  role            user_role    NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  -- NULL = "use the role defaults". Explicit array = the admin has customised
  -- this user's rights (see utils/permissions on the frontend for the catalog).
  -- Admin accounts always effectively get every permission — this column is
  -- consulted for RECEPTIONIST / MEDICAL_OFFICER only.
  permissions     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Additive migration for older installs that predate the permissions column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;
-- Plaintext copy of the password so admins can look it up from the Users
-- page. Populated on create + every reset; NULL for legacy accounts whose
-- password was never touched after upgrade.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- ---------------------------------------------------------------------
-- MASTER TABLES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS languages (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(60) UNIQUE NOT NULL,
  is_active BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS villages (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(120) UNIQUE NOT NULL,
  taluka    VARCHAR(120),
  district  VARCHAR(120),
  state     VARCHAR(120),
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS referrals (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(120) UNIQUE NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS known_disease_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(20)  UNIQUE NOT NULL,
  name      VARCHAR(120) NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS advice_master (
  id        SERIAL PRIMARY KEY,
  text      VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS examination_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)  UNIQUE NOT NULL,
  label     VARCHAR(120) NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS complaint_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)  UNIQUE NOT NULL,
  name      VARCHAR(120) NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS investigation_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)  UNIQUE NOT NULL,
  name      VARCHAR(120) NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Catalogue of drugs the doctor can pick from in the Prescription panel.
-- `form` lets the UI hint at the unit ("Tablet", "Syrup", "Inhaler", ...).
CREATE TABLE IF NOT EXISTS medicine_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)  UNIQUE NOT NULL,
  name      VARCHAR(160) NOT NULL,
  form      VARCHAR(40),
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Treatment plan options the doctor can pick from in the Plan panel.
CREATE TABLE IF NOT EXISTS plan_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)  UNIQUE NOT NULL,
  name      VARCHAR(120) NOT NULL,
  is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Disease-medicine templates: for each known disease the admin can
-- configure the "usual" 4–5 medicines the doctor prescribes. When the
-- doctor picks the disease during a visit, these rows are copied into
-- the Prescription section and can then be edited freely.
CREATE TABLE IF NOT EXISTS disease_medicine_templates (
  id            SERIAL PRIMARY KEY,
  disease_id    INTEGER NOT NULL REFERENCES known_disease_master(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  medicine_id   INTEGER REFERENCES medicine_master(id),
  medicine_name VARCHAR(160) NOT NULL,
  dosage        VARCHAR(40),
  intake        VARCHAR(40),
  days          INTEGER,
  qty           INTEGER,
  remarks       VARCHAR(120),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dmt_disease
  ON disease_medicine_templates (disease_id, position);

-- ---------------------------------------------------------------------
-- APP SETTINGS (clinic name, doctor name, etc.)
-- Simple key/value store - one row per setting.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  INTEGER REFERENCES users(id)
);

-- Service / Price master (Old Case 200, New Case 400, ECG, Injection, ...).
-- Codes NEW_CASE and OLD_CASE are special - they get auto-charged when
-- the receptionist creates a corresponding visit.
CREATE TABLE IF NOT EXISTS service_master (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(40)   UNIQUE NOT NULL,
  name      VARCHAR(120)  NOT NULL,
  price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- PATIENT (permanent identity)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id              SERIAL PRIMARY KEY,
  patient_code    VARCHAR(20) UNIQUE NOT NULL,            -- e.g. P000001
  first_name      VARCHAR(60) NOT NULL,
  middle_name     VARCHAR(60),
  surname         VARCHAR(60) NOT NULL,
  gender          VARCHAR(20) NOT NULL,
  age             INTEGER,
  language_id     INTEGER REFERENCES languages(id),
  address         TEXT,
  village_id      INTEGER REFERENCES villages(id),
  village_name    VARCHAR(120) NOT NULL,
  taluka          VARCHAR(120) NOT NULL,
  district        VARCHAR(120) NOT NULL,
  state           VARCHAR(120) NOT NULL,
  mobile          VARCHAR(15)  NOT NULL,
  referred_by_id  INTEGER REFERENCES referrals(id),
  referred_by_text VARCHAR(120),
  remarks         TEXT,
  allergies       TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_mobile      ON patients (mobile);
CREATE INDEX IF NOT EXISTS idx_patients_code        ON patients (patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_name        ON patients (LOWER(first_name), LOWER(surname));
CREATE INDEX IF NOT EXISTS idx_patients_village     ON patients (village_name);

-- ---------------------------------------------------------------------
-- VISIT (each consultation)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_visits (
  id               SERIAL PRIMARY KEY,
  case_number      INTEGER      NOT NULL,               -- resets each FY
  fy_key           VARCHAR(7)   NOT NULL,               -- e.g. '2026-27'
  patient_id       INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  visit_date       DATE        NOT NULL,
  visit_time       TIME        NOT NULL,
  case_type        VARCHAR(20) NOT NULL CHECK (case_type IN ('NEW', 'OLD')),
  status           visit_status NOT NULL DEFAULT 'WAITING_FOR_MEDICAL_OFFICER',
  created_by       INTEGER REFERENCES users(id),
  doctor_id        INTEGER REFERENCES users(id),
  mo_id            INTEGER REFERENCES users(id),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fy_key, case_number)
);

-- Backfill fy_key + drop legacy single-column UNIQUE for clinics upgrading.
ALTER TABLE patient_visits ADD COLUMN IF NOT EXISTS fy_key VARCHAR(7);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'patient_visits'
       AND constraint_name = 'patient_visits_case_number_key'
  ) THEN
    ALTER TABLE patient_visits DROP CONSTRAINT patient_visits_case_number_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visits_patient   ON patient_visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_status    ON patient_visits (status);
CREATE INDEX IF NOT EXISTS idx_visits_date      ON patient_visits (visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_case      ON patient_visits (case_number);

-- ---------------------------------------------------------------------
-- MEDICAL OFFICER record per visit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_officer_records (
  id           SERIAL PRIMARY KEY,
  visit_id     INTEGER UNIQUE NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  weight_kg    NUMERIC(5,2),
  pulse        INTEGER,
  bp_systolic  INTEGER,
  bp_diastolic INTEGER,
  spo2         INTEGER,
  complaints   TEXT,
  mo_user_id   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Known diseases recorded per visit (multi-select, optional custom additions).
CREATE TABLE IF NOT EXISTS patient_known_diseases (
  id           SERIAL PRIMARY KEY,
  visit_id     INTEGER NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  disease_id   INTEGER REFERENCES known_disease_master(id),
  custom_name  VARCHAR(120),
  CHECK (disease_id IS NOT NULL OR custom_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pkd_visit ON patient_known_diseases (visit_id);

-- Presenting complaints per visit. Each row is one complaint with a duration
-- ("3 days", "1 week", etc.). Either a complaint_master link or a free-text
-- custom name must be present.
CREATE TABLE IF NOT EXISTS visit_complaints (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  complaint_id  INTEGER REFERENCES complaint_master(id),
  custom_name   VARCHAR(120),
  duration      VARCHAR(60),
  CHECK (complaint_id IS NOT NULL OR custom_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vc_visit ON visit_complaints (visit_id);

-- ---------------------------------------------------------------------
-- DOCTOR record per visit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_records (
  id              SERIAL PRIMARY KEY,
  visit_id        INTEGER UNIQUE NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  examination     TEXT,                  -- JSON array of examination labels
  investigation   TEXT,                  -- JSON array of investigation labels
  prescription    TEXT,                  -- multiline rich text
  plan            TEXT,                  -- multiline treatment plan
  doctor_user_id  INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill columns for existing installations.
ALTER TABLE doctor_records ADD COLUMN IF NOT EXISTS investigation TEXT;
ALTER TABLE doctor_records ADD COLUMN IF NOT EXISTS plan TEXT;

-- Structured prescription rows. One row per medicine line in the Rx grid.
-- `medicine_name` is denormalised so a renamed master entry doesn't change
-- the historical prescription.
CREATE TABLE IF NOT EXISTS prescription_items (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  medicine_id   INTEGER REFERENCES medicine_master(id),
  medicine_name VARCHAR(160) NOT NULL,
  dosage        VARCHAR(40),
  intake        VARCHAR(40),
  days          INTEGER,
  qty           INTEGER,
  remarks       VARCHAR(120)
);

-- Backfill for clinics upgrading from an earlier schema.
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS remarks VARCHAR(120);
ALTER TABLE prescription_items ALTER COLUMN intake TYPE VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_prescription_items_visit ON prescription_items (visit_id);

-- Advice selected by doctor for a visit (multi-select from master).
CREATE TABLE IF NOT EXISTS doctor_advices (
  id          SERIAL PRIMARY KEY,
  visit_id    INTEGER NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  advice_id   INTEGER REFERENCES advice_master(id),
  custom_text VARCHAR(255),
  CHECK (advice_id IS NOT NULL OR custom_text IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_doctor_advices_visit ON doctor_advices (visit_id);

-- ---------------------------------------------------------------------
-- FOLLOW UP
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS followups (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER UNIQUE NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  followup_date DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_date ON followups (followup_date);

-- ---------------------------------------------------------------------
-- VISIT CHARGES (billing line items per visit)
-- price + service_name are *snapshotted* at the time of charge so that
-- renaming a service later does not rewrite history.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visit_charges (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
  service_id    INTEGER REFERENCES service_master(id),
  service_name  VARCHAR(120)  NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  quantity      INTEGER       NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_charges_visit ON visit_charges (visit_id);

-- ---------------------------------------------------------------------
-- BILLS (the hospital invoice entity)
-- One AUTO bill is created per visit. Optional FINAL bills are editable
-- copies created when a patient requests a printed bill.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
  id              SERIAL PRIMARY KEY,
  bill_number     VARCHAR(40) UNIQUE NOT NULL,         -- BILL-2026-000001 / FBILL-2026-000001 / IBILL-2026-000001
  bill_type       VARCHAR(10) NOT NULL CHECK (bill_type IN ('AUTO', 'FINAL', 'IPD')),
  parent_bill_id  INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  visit_id        INTEGER REFERENCES patient_visits(id) ON DELETE CASCADE,      -- required for AUTO/FINAL, NULL for IPD
  admission_id    INTEGER,                                                       -- set for IPD bills only; FK added after admissions table exists
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id       INTEGER REFERENCES users(id),
  case_type       VARCHAR(10),                          -- NEW / OLD (snapshot from visit)
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',-- ACTIVE / LOCKED
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  additional      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  printed_at      TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_visit     ON bills (visit_id);
CREATE INDEX IF NOT EXISTS idx_bills_admission ON bills (admission_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient   ON bills (patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_type      ON bills (bill_type);
CREATE INDEX IF NOT EXISTS idx_bills_date      ON bills (created_at DESC);

CREATE TABLE IF NOT EXISTS bill_services (
  id            SERIAL PRIMARY KEY,
  bill_id       INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  service_id    INTEGER REFERENCES service_master(id),
  service_name  VARCHAR(120)  NOT NULL,
  quantity      INTEGER       NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL,
  total         NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_services_bill ON bill_services (bill_id);

CREATE SEQUENCE IF NOT EXISTS bill_number_seq        START 1;
CREATE SEQUENCE IF NOT EXISTS final_bill_number_seq  START 1;

-- ---------------------------------------------------------------------
-- 3C Register OPD — per-day amount overrides
-- Lets Admin / Reception correct a day's total without touching bills.
-- One row per date; NULL/missing row = use the computed sum of bills.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS three_c_amount_overrides (
  register_date DATE          PRIMARY KEY,
  amount        NUMERIC(12,2) NOT NULL,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3C Register IPD — manual ledger of admitted-and-discharged patients.
--
-- Two counters run in parallel:
-- ---------------------------------------------------------------------
-- INDOOR PATIENT DEPARTMENT (IPD)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wards (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) UNIQUE NOT NULL,
  floor      VARCHAR(40),
  -- FALSE = shared ward (multiple beds in one room, e.g. General Room)
  -- TRUE  = each bed is a private room (e.g. Special Room, IRCU)
  is_private BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE wards ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS beds (
  id         SERIAL PRIMARY KEY,
  ward_id    INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  bed_number VARCHAR(40) NOT NULL,
  bed_type   VARCHAR(40) NOT NULL DEFAULT 'General',   -- free-form (General / Special / IRCU / …)
  status     VARCHAR(20)   NOT NULL DEFAULT 'FREE'
             CHECK (status IN ('FREE', 'OCCUPIED', 'UNDER_MAINTENANCE')),
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (ward_id, bed_number)
);
-- Legacy: drop the daily_rate column from existing installs. Beds no longer
-- carry a per-day price; billing lives on the bill entity.
ALTER TABLE beds DROP COLUMN IF EXISTS daily_rate;
CREATE INDEX IF NOT EXISTS idx_beds_ward   ON beds (ward_id);
CREATE INDEX IF NOT EXISTS idx_beds_status ON beds (status);

CREATE TABLE IF NOT EXISTS admissions (
  id                   SERIAL PRIMARY KEY,
  admission_number     INTEGER      NOT NULL,     -- resets each FY
  fy_key               VARCHAR(7)   NOT NULL,
  patient_id           INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  source_visit_id      INTEGER REFERENCES patient_visits(id) ON DELETE SET NULL,
  bed_id               INTEGER REFERENCES beds(id) ON DELETE SET NULL,
  admitting_doctor_id  INTEGER REFERENCES users(id),
  admission_diagnosis  TEXT,
  status               VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED'
                       CHECK (status IN ('REQUESTED','ADMITTED','DISCHARGED','CANCELLED')),
  admitted_at          TIMESTAMPTZ,
  discharged_at        TIMESTAMPTZ,
  discharge_notes      TEXT,
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fy_key, admission_number)
);
CREATE INDEX IF NOT EXISTS idx_admissions_status  ON admissions (status);
CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions (patient_id);
CREATE INDEX IF NOT EXISTS idx_admissions_bed     ON admissions (bed_id);

-- Wire the bills → admissions FK now that both tables exist. Defined here
-- (rather than inline in the bills CREATE TABLE) because bills is declared
-- earlier in this file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_admission_id_fkey'
  ) THEN
    ALTER TABLE bills
      ADD CONSTRAINT bills_admission_id_fkey
      FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3C Register IPD — manual ledger of admitted-and-discharged patients.
--
-- Two counters run in parallel:
--   - reg_seq          : 1, 2, 3 … within each calendar month, formatted
--                        for display as NN/MM-YY  (e.g. 01/05-26)
--   - receipt_number   : 1, 2, 3 … within each Financial Year (fy_key).
--
-- Rows can be added by hand OR seeded from a real Admission record when
-- one is discharged (admission_id links them).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS three_c_ipd_entries (
  id             SERIAL       PRIMARY KEY,
  admission_id   INTEGER      REFERENCES admissions(id) ON DELETE SET NULL,
  entry_month    DATE         NOT NULL,   -- first-of-month; scopes reg_seq
  reg_seq        INTEGER      NOT NULL,
  fy_key         VARCHAR(7)   NOT NULL,   -- e.g. 2026-27; scopes receipt_number
  receipt_number INTEGER      NOT NULL,
  patient_name   VARCHAR(200) NOT NULL,
  age            VARCHAR(20),
  village        VARCHAR(200),
  diagnosis      TEXT,
  doa            DATE,
  dod            DATE,
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (entry_month, reg_seq),
  UNIQUE (fy_key,      receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_3c_ipd_dod        ON three_c_ipd_entries (dod);
CREATE INDEX IF NOT EXISTS idx_3c_ipd_created_at ON three_c_ipd_entries (created_at DESC);

-- ---------------------------------------------------------------------
-- Indoor Sheet — per-admission daily observation chart.
--
-- One row per admission-day, four vital snapshots (10 AM / 4 PM / 10 PM /
-- 6 AM), plus a free-text medicine field and steam / chest PT counters.
-- Denormalized on purpose: the physical sheet is exactly this shape and
-- the upsert stays trivial.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indoor_sheet_days (
  id             SERIAL PRIMARY KEY,
  admission_id   INTEGER NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  reading_date   DATE    NOT NULL,
  pulse_10am     VARCHAR(20), bp_10am    VARCHAR(30), spo2_10am    VARCHAR(20),
  pulse_4pm      VARCHAR(20), bp_4pm     VARCHAR(30), spo2_4pm     VARCHAR(20),
  pulse_10pm     VARCHAR(20), bp_10pm    VARCHAR(30), spo2_10pm    VARCHAR(20),
  pulse_6am      VARCHAR(20), bp_6am     VARCHAR(30), spo2_6am     VARCHAR(20),
  medicine       TEXT,                                        -- legacy: single line notes
  medicine_lines JSONB   NOT NULL DEFAULT '[]'::jsonb,        -- array of { med, dose, route, freq }
  steam          INTEGER NOT NULL DEFAULT 0,                  -- morning box
  chest_pt       INTEGER NOT NULL DEFAULT 0,                  -- morning box
  steam_pm       INTEGER NOT NULL DEFAULT 0,                  -- evening box
  chest_pt_pm    INTEGER NOT NULL DEFAULT 0,                  -- evening box
  updated_by     INTEGER REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admission_id, reading_date)
);
CREATE INDEX IF NOT EXISTS idx_indoor_sheet_adm ON indoor_sheet_days (admission_id);

-- ---------------------------------------------------------------------
-- REPORTS / file uploads
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id        INTEGER REFERENCES patient_visits(id) ON DELETE SET NULL,
  original_name   VARCHAR(255) NOT NULL,
  stored_name     VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(80)  NOT NULL,
  size_bytes      BIGINT       NOT NULL,
  uploaded_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_patient ON reports (patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_visit   ON reports (visit_id);

-- ---------------------------------------------------------------------
-- AUDIT LOGS (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      VARCHAR(60)  NOT NULL,
  entity      VARCHAR(60)  NOT NULL,
  entity_id   VARCHAR(60),
  meta        JSONB,
  ip          VARCHAR(60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------
-- REMINDERS — admin notes that pop up at login and live in the bell menu
-- while their time window is current.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id            SERIAL PRIMARY KEY,
  text          TEXT        NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'SHORT_TERM'
                CHECK (type IN ('SHORT_TERM', 'LONG_TERM')),
  -- Which roles see this reminder. ADMIN is always present so the
  -- author themselves never loses sight of it.
  target_roles  TEXT[]      NOT NULL DEFAULT ARRAY['ADMIN']::TEXT[],
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
-- Backfill columns for clinics upgrading.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS type VARCHAR(20)
  NOT NULL DEFAULT 'SHORT_TERM';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS target_roles TEXT[]
  NOT NULL DEFAULT ARRAY['ADMIN']::TEXT[];
-- Marking a reminder complete (admin ticked it off) is a soft-close: the
-- row stays for the audit trail but stops appearing in the bell/login popup.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id);
-- Recurrence: one row per "template". When both are set, the reminder is
-- treated as active only on days where the calendar date matches the rule
-- (day-of-month AND months-since-start divisible by the interval).
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_day_of_month INTEGER;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_every_months INTEGER;
CREATE INDEX IF NOT EXISTS idx_reminders_window
  ON reminders (starts_at, ends_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- SEQUENCES helper for patient_code (P000001 ...)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS case_number_seq  START 1;

-- ---------------------------------------------------------------------
-- updated_at auto-touch trigger (generic)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users','patients','patient_visits',
      'medical_officer_records','doctor_records','bills'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER touch_%I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Lightweight in-place migrations (idempotent)
-- These let `db:init` evolve an existing database without dropping it.
-- ---------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE patients ALTER COLUMN address DROP NOT NULL;

-- ---------------------------------------------------------------------
-- BACKFILL: ensure every existing visit has an Auto bill.
-- Safe to run repeatedly — only inserts for visits that don't already
-- have a bill row. Bill number uses the existing bill_number_seq.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v RECORD;
  new_bill_id INTEGER;
  bill_num TEXT;
  svc_id INTEGER;
  svc_name TEXT;
  svc_price NUMERIC;
  case_code TEXT;
BEGIN
  FOR v IN
    SELECT pv.id, pv.patient_id, pv.doctor_id, pv.case_type,
           pv.created_by, pv.created_at
      FROM patient_visits pv
     WHERE pv.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.visit_id = pv.id)
     ORDER BY pv.id
  LOOP
    case_code := CASE WHEN v.case_type = 'NEW' THEN 'NEW_CASE' ELSE 'OLD_CASE' END;

    SELECT s.id, s.name, s.price
      INTO svc_id, svc_name, svc_price
      FROM service_master s
     WHERE s.code = case_code AND s.is_active = TRUE
     LIMIT 1;

    IF svc_id IS NULL THEN
      svc_name  := CASE WHEN v.case_type = 'NEW' THEN 'Consultation - New Case'
                                                 ELSE 'Consultation - Old Case' END;
      svc_price := CASE WHEN v.case_type = 'NEW' THEN 400 ELSE 200 END;
    END IF;

    bill_num := 'BILL-' || EXTRACT(YEAR FROM v.created_at)::INTEGER || '-'
                || LPAD(nextval('bill_number_seq')::TEXT, 6, '0');

    INSERT INTO bills (
      bill_number, bill_type, visit_id, patient_id, doctor_id,
      case_type, status, subtotal, total, created_by, created_at, updated_at
    ) VALUES (
      bill_num, 'AUTO', v.id, v.patient_id, v.doctor_id,
      v.case_type, 'ACTIVE', svc_price, svc_price, v.created_by, v.created_at, v.created_at
    ) RETURNING id INTO new_bill_id;

    INSERT INTO bill_services (bill_id, service_id, service_name, quantity, unit_price, total)
    VALUES (new_bill_id, svc_id, svc_name, 1, svc_price, svc_price);
  END LOOP;
END $$;

-- Default prices for system case-type services: NEW=400, OLD=200.
-- Other services (ECG, Injection, etc.) are left alone — admin/reception
-- can edit those freely from Services & Prices.
UPDATE service_master SET price = 200 WHERE code = 'OLD_CASE';
UPDATE service_master SET price = 400 WHERE code = 'NEW_CASE';

-- Re-price the consultation line on every existing AUTO bill so historical
-- bills match the new defaults. FINAL bills are NEVER touched here - they
-- are the patient-customised copies.
UPDATE bill_services bs
   SET unit_price = CASE WHEN b.case_type = 'NEW' THEN 400 ELSE 200 END,
       total      = (CASE WHEN b.case_type = 'NEW' THEN 400 ELSE 200 END) * bs.quantity
  FROM bills b
 WHERE bs.bill_id = b.id
   AND b.bill_type = 'AUTO'
   AND bs.service_id IN (
     SELECT id FROM service_master WHERE code IN ('NEW_CASE', 'OLD_CASE')
   );

-- Recompute AUTO bill totals from their line items.
UPDATE bills b
   SET subtotal = sub.total,
       total    = sub.total - COALESCE(b.discount, 0) + COALESCE(b.additional, 0)
  FROM (SELECT bill_id, SUM(total)::NUMERIC(10,2) AS total
          FROM bill_services GROUP BY bill_id) sub
 WHERE b.id = sub.bill_id
   AND b.bill_type = 'AUTO';

-- Patient code: plain sequential integer (1, 2, 3, ...).
-- Strips legacy 'P' prefix AND any leading zeros from earlier formats.
-- Idempotent: rows already in the new format are unaffected.
UPDATE patients
   SET patient_code = (REGEXP_REPLACE(patient_code, '^P?0*', ''))
 WHERE patient_code ~ '^P?0+[0-9]+$'
    OR patient_code LIKE 'P%';

-- Guard against accidental empty string if a code was literally '0' or 'P0'.
UPDATE patients SET patient_code = '0' WHERE patient_code = '';
