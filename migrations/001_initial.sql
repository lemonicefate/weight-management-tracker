CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'nurse_staff', 'admin')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE INDEX sessions_by_user ON sessions(user_id, revoked_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE patients (
  id INTEGER PRIMARY KEY,
  mrn TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX patients_name ON patients(name COLLATE NOCASE);
CREATE INDEX patients_phone ON patients(phone);

CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  closure_reason TEXT CHECK (closure_reason IN ('goal_achieved', 'stops_treatment', 'adverse_effects', 'other')),
  baseline_encounter_id INTEGER REFERENCES encounters(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'active' AND ended_at IS NULL AND closure_reason IS NULL) OR
         (status = 'closed' AND ended_at IS NOT NULL AND closure_reason IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX one_active_episode_per_patient ON episodes(patient_id) WHERE status = 'active';
CREATE INDEX episodes_by_patient ON episodes(patient_id, started_at DESC);

CREATE TABLE encounters (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'completed', 'reopened')),
  physician_user_id INTEGER REFERENCES users(id),
  weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg > 0),
  waist_cm REAL CHECK (waist_cm IS NULL OR waist_cm > 0),
  symptom_codes TEXT NOT NULL DEFAULT '[]',
  symptom_other_text TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL AND physician_user_id IS NOT NULL) OR status <> 'completed')
) STRICT;
CREATE INDEX encounters_by_patient ON encounters(patient_id, occurred_at DESC, id DESC);
CREATE INDEX encounters_by_episode ON encounters(episode_id, occurred_at, id);

CREATE TABLE treatment_records (
  encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('continue', 'increase', 'decrease', 'change', 'pause', 'no_medication')),
  recorded_by_doctor INTEGER NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE medication_items (
  id INTEGER PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  medication_code TEXT NOT NULL CHECK (medication_code IN ('mounjaro', 'wegovy')),
  medication_name_snapshot TEXT NOT NULL,
  dose_mg REAL NOT NULL CHECK (dose_mg > 0),
  residual_dose INTEGER NOT NULL DEFAULT 0 CHECK (residual_dose IN (0, 1)),
  route TEXT NOT NULL CHECK (route = 'SC'),
  frequency TEXT NOT NULL CHECK (frequency = 'weekly'),
  quantity_text TEXT NOT NULL CHECK (quantity_text = '1 pen'),
  catalog_version TEXT NOT NULL
) STRICT;
CREATE INDEX medication_items_by_encounter ON medication_items(encounter_id, id);

CREATE TABLE body_composition_sources (
  id INTEGER PRIMARY KEY,
  adapter_type TEXT NOT NULL UNIQUE,
  vendor TEXT NOT NULL,
  device_identifier TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE body_composition_measurements (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES body_composition_sources(id) ON DELETE RESTRICT,
  source_key TEXT NOT NULL,
  source_digest TEXT NOT NULL,
  source_revision INTEGER NOT NULL DEFAULT 1,
  patient_id INTEGER REFERENCES patients(id) ON DELETE RESTRICT,
  measured_at TEXT,
  captured_at TEXT NOT NULL,
  source_identifier TEXT,
  source_timezone TEXT,
  clock_status TEXT NOT NULL DEFAULT 'unverified',
  ignored INTEGER NOT NULL DEFAULT 0 CHECK (ignored IN (0, 1)),
  raw_snapshot TEXT NOT NULL,
  mapping_version TEXT NOT NULL,
  changed_from_id INTEGER REFERENCES body_composition_measurements(id),
  imported_from TEXT,
  UNIQUE(source_id, source_key, source_digest)
) STRICT;
CREATE INDEX body_measurements_by_patient ON body_composition_measurements(patient_id, measured_at DESC, id DESC);
CREATE INDEX body_measurements_by_source ON body_composition_measurements(source_id, source_key, id DESC);

CREATE TABLE normalized_body_metrics (
  measurement_id INTEGER NOT NULL REFERENCES body_composition_measurements(id) ON DELETE CASCADE,
  mapping_version TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  value REAL,
  canonical_unit TEXT NOT NULL,
  source_field TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unverified', 'invalid', 'missing')),
  evidence TEXT,
  PRIMARY KEY (measurement_id, mapping_version, metric_code)
) STRICT;

CREATE TABLE encounter_body_composition_links (
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  measurement_id INTEGER NOT NULL REFERENCES body_composition_measurements(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  linked_by INTEGER NOT NULL REFERENCES users(id),
  linked_at TEXT NOT NULL,
  PRIMARY KEY (encounter_id, measurement_id)
) STRICT;
CREATE UNIQUE INDEX one_primary_measurement_per_encounter ON encounter_body_composition_links(encounter_id) WHERE is_primary = 1;
CREATE UNIQUE INDEX one_encounter_per_body_measurement ON encounter_body_composition_links(measurement_id);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL,
  before_snapshot TEXT,
  after_snapshot TEXT,
  reason TEXT
) STRICT;
CREATE INDEX audit_by_entity ON audit_events(entity_type, entity_id, at DESC);
CREATE INDEX audit_by_time ON audit_events(at DESC);

CREATE TABLE report_assets (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE RESTRICT,
  measurement_id INTEGER REFERENCES body_composition_measurements(id) ON DELETE RESTRICT,
  source_report_id TEXT,
  media_type TEXT NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE historical_reports (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  measurement_id INTEGER REFERENCES body_composition_measurements(id) ON DELETE RESTRICT,
  asset_id INTEGER NOT NULL REFERENCES report_assets(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  template_version TEXT NOT NULL,
  mapping_version TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  imported_from TEXT
) STRICT;

CREATE TABLE historical_report_measurements (
  report_id INTEGER NOT NULL REFERENCES historical_reports(id) ON DELETE CASCADE,
  measurement_id INTEGER NOT NULL REFERENCES body_composition_measurements(id) ON DELETE RESTRICT,
  PRIMARY KEY (report_id, measurement_id)
) STRICT;

CREATE TABLE imported_source_events (
  id INTEGER PRIMARY KEY,
  imported_from TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_entity_id TEXT,
  action TEXT NOT NULL,
  actor_label TEXT,
  at TEXT NOT NULL,
  before_snapshot TEXT,
  after_snapshot TEXT,
  UNIQUE(imported_from, source_event_id)
) STRICT;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id)
) STRICT;
