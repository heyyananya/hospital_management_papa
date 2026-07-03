-- Seed default master data. Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO languages (name) VALUES
  ('English'), ('Hindi'), ('Marathi'), ('Gujarati'), ('Tamil'), ('Telugu'), ('Kannada'), ('Bengali')
ON CONFLICT (name) DO NOTHING;

INSERT INTO known_disease_master (code, name) VALUES
  ('DM',             'Diabetes Mellitus'),
  ('HT',             'Hypertension'),
  ('IHD',            'Ischemic Heart Disease'),
  ('HYPO',           'Hypothyroidism'),
  ('BA',             'Bronchial Asthma'),
  ('COPD',           'Chronic Obstructive Pulmonary Disease'),
  ('BRE',            'Bronchiectasis'),
  ('ILD',            'Interstitial Lung Disease')
ON CONFLICT (code) DO NOTHING;

INSERT INTO complaint_master (code, name) VALUES
  ('COUGH',            'Cough'),
  ('COUGH_PRODUCTIVE', 'Cough (productive)'),
  ('SOB',              'Shortness of breath'),
  ('CHEST_PAIN',       'Chest Pain'),
  ('FEVER_LOW',        'Fever (Low grade)'),
  ('FEVER_HIGH',       'Fever (High grade)'),
  ('WHEEZING',         'Wheezing'),
  ('HOARSENESS',       'Hoarseness of voice'),
  ('OEDEMA_FEET',      'Oedema feet'),
  ('SWELLING_NECK',    'Swelling in neck'),
  ('HEMOPTYSIS',       'Hemoptysis')
ON CONFLICT (code) DO NOTHING;

INSERT INTO examination_master (code, label) VALUES
  ('BLAE',             'BLAE'),
  ('AE_LEFT_DOWN',     'AE Left Decreased'),
  ('AE_RIGHT_DOWN',    'AE Right Decreased'),
  ('RHONCHI_PRESENT',  'Rhonchi Present'),
  ('CREPITATION',      'Crepitation')
ON CONFLICT (code) DO NOTHING;

INSERT INTO investigation_master (code, name) VALUES
  ('CBC',         'CBC (Complete Blood Count)'),
  ('ESR',         'ESR'),
  ('CRP',         'CRP'),
  ('CXR_PA',      'Chest X-Ray (PA View)'),
  ('HRCT',        'HRCT Chest'),
  ('SPUTUM_AFB',  'Sputum AFB'),
  ('PFT',         'PFT (Pulmonary Function Test)'),
  ('ECG',         'ECG'),
  ('ECHO',        '2D-Echo'),
  ('ABG',         'ABG (Arterial Blood Gas)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO medicine_master (code, name, form) VALUES
  ('AZITHRO_500',     'Azithromycin 500 mg',              'Tablet'),
  ('AMOXICLAV_625',   'Amoxiclav 625 mg',                 'Tablet'),
  ('CEFIXIME_200',    'Cefixime 200 mg',                  'Tablet'),
  ('LEVOFLOX_500',    'Levofloxacin 500 mg',              'Tablet'),
  ('DOXY_100',        'Doxycycline 100 mg',               'Capsule'),
  ('PARA_500',        'Paracetamol 500 mg',               'Tablet'),
  ('CETIRIZINE_10',   'Cetirizine 10 mg',                 'Tablet'),
  ('LEVOCET_5',       'Levocetirizine 5 mg',              'Tablet'),
  ('MONTELU_10',      'Montelukast 10 mg',                'Tablet'),
  ('DEFLAZA_6',       'Deflazacort 6 mg',                 'Tablet'),
  ('PRED_10',         'Prednisolone 10 mg',               'Tablet'),
  ('THEO_200',        'Theophylline 200 mg',              'Tablet'),
  ('DOXOFYL_400',     'Doxofylline 400 mg',               'Tablet'),
  ('AMBROXOL',        'Ambroxol Syrup',                   'Syrup'),
  ('ACETYLCYS',       'Acetylcysteine 600 mg',            'Sachet'),
  ('SALBUTAMOL_INH',  'Salbutamol Inhaler (100 mcg)',     'Inhaler'),
  ('BUDECORT_INH',    'Budecort Inhaler (200 mcg)',       'Inhaler'),
  ('FORACORT_INH',    'Foracort Inhaler',                 'Inhaler'),
  ('NEB_BUDECORT',    'Budecort Respules (0.5 mg)',       'Nebulization'),
  ('NEB_DULCOFLO',    'Duolin Respules',                  'Nebulization')
ON CONFLICT (code) DO NOTHING;

INSERT INTO advice_master (text) VALUES
  ('Plenty of oral fluids'),
  ('Steam inhalation twice a day'),
  ('Salt water gargles'),
  ('Avoid cold and spicy food'),
  ('Take complete bed rest'),
  ('Follow up if symptoms persist')
ON CONFLICT (text) DO NOTHING;

INSERT INTO referrals (name) VALUES
  ('Self'), ('Family'), ('Friend'), ('Other Doctor')
ON CONFLICT (name) DO NOTHING;

INSERT INTO villages (name, taluka, district, state) VALUES
  ('Default', 'Default', 'Default', 'Default')
ON CONFLICT (name) DO NOTHING;

-- Default service/price master. NEW_CASE and OLD_CASE are special - they get
-- auto-charged when a corresponding visit is created.
INSERT INTO service_master (code, name, price) VALUES
  ('NEW_CASE',     'Consultation - New Case', 400),
  ('OLD_CASE',     'Consultation - Old Case', 200),
  ('ECG',          'ECG',                   200),
  ('INJECTION',    'Injection',             100),
  ('NEBULIZATION', 'Nebulization',          150),
  ('DRESSING',     'Dressing',              100),
  ('BP_CHECK',     'BP Check',               50),
  ('GLUCOSE_TEST', 'Glucose Test',           50)
ON CONFLICT (code) DO NOTHING;

-- Default clinic settings. Editable later from Settings page.
INSERT INTO app_settings (key, value) VALUES
  ('clinic_name',    'My Clinic'),
  ('doctor_name',    'Dr. Ajit'),
  ('clinic_address', ''),
  ('clinic_phone',   ''),
  ('receipt_footer', 'Thank you for visiting. Get well soon!')
ON CONFLICT (key) DO NOTHING;
