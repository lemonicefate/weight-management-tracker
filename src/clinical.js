import { transaction, parseJson } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { normalizeSymptoms } from './domain/symptoms.js';
import { validateMedicationItems, validateTreatmentChange, publicMedication } from './domain/medications.js';
import { weightSummary } from './domain/calculations.js';
import { hasPermission, roles } from './domain/roles.js';

const closureReasons = new Set(['goal_achieved', 'stops_treatment', 'adverse_effects', 'other']);

function timestamp(value) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw badRequest('Encounter time must be a valid date and time.');
  return new Date(value).toISOString();
}

function optionalPositiveNumber(value, label) {
  if (value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw badRequest(label + ' must be a positive number.');
  if (result > 1000) throw badRequest(label + ' is outside the supported measurement range.');
  return result;
}

function audit(database, entityType, entityId, action, actorId, before, after, reason = null) {
  database.prepare(
    'INSERT INTO audit_events(entity_type, entity_id, action, actor_user_id, at, before_snapshot, after_snapshot, reason) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(entityType, String(entityId), action, actorId, new Date().toISOString(),
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    reason);
}

function ensurePatient(database, patientId) {
  const patient = database.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) throw notFound('Patient not found.');
  return patient;
}

function ensureEpisode(database, episodeId) {
  const episode = database.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId);
  if (!episode) throw notFound('Episode not found.');
  return episode;
}

function encounterRow(database, encounterId) {
  const row = database.prepare(
    'SELECT e.*, p.mrn, p.name AS patient_name FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?'
  ).get(encounterId);
  if (!row) throw notFound('Encounter not found.');
  return row;
}

function medicationRows(database, encounterId) {
  return database.prepare('SELECT * FROM medication_items WHERE encounter_id = ? ORDER BY id').all(encounterId);
}

function encounterSnapshot(database, encounterId) {
  const encounter = encounterRow(database, encounterId);
  const episode = database.prepare('SELECT baseline_encounter_id FROM episodes WHERE id = ?').get(encounter.episode_id);
  const treatment = database.prepare('SELECT change_type FROM treatment_records WHERE encounter_id = ?').get(encounterId);
  return {
    status: encounter.status,
    version: encounter.version,
    episodeBaselineEncounterId: episode?.baseline_encounter_id ?? null,
    occurredAt: encounter.occurred_at,
    physicianUserId: encounter.physician_user_id,
    weightKg: encounter.weight_kg,
    waistCm: encounter.waist_cm,
    symptoms: parseJson(encounter.symptom_codes, []),
    symptomOtherText: encounter.symptom_other_text,
    treatmentChange: treatment?.change_type || null,
    medications: medicationRows(database, encounterId).map(publicMedication)
  };
}

function findOrCreatePatient(database, input) {
  if (typeof input.mrn !== 'string' || !input.mrn.trim() || input.mrn.trim().length > 64) {
    throw badRequest('MRN is required and must be a string of 64 characters or fewer.');
  }
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
    throw badRequest('Patient name is required and must be 120 characters or fewer.');
  }
  if (input.phone !== undefined && typeof input.phone !== 'string') throw badRequest('Phone must be entered as text.');
  if ((input.phone || '').length > 80) throw badRequest('Phone must be 80 characters or fewer.');
  const now = new Date().toISOString();
  try {
    const result = database.prepare(
      'INSERT INTO patients(mrn, name, phone, created_at, updated_at) VALUES(?, ?, ?, ?, ?)'
    ).run(input.mrn.trim(), input.name.trim(), input.phone || '', now, now);
    return database.prepare('SELECT * FROM patients WHERE id = ?').get(result.lastInsertRowid);
  } catch (error) {
    if (/UNIQUE constraint failed: patients.mrn/i.test(error.message)) throw conflict('A Patient with this MRN already exists.');
    throw error;
  }
}

export function createPatient(database, input, actor) {
  const patient = findOrCreatePatient(database, input);
  audit(database, 'patient', patient.id, 'created', actor.id, null, { mrn: patient.mrn });
  return patientView(patient);
}

export function listPatients(database, search = '') {
  const needle = String(search || '').trim().slice(0, 120);
  const escaped = needle.replace(/[\%_]/g, (character) => '\\' + character);
  const rows = database.prepare(
    'SELECT p.*, ' +
    '(SELECT e.weight_kg FROM encounters e WHERE e.patient_id = p.id AND e.weight_kg IS NOT NULL ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1) AS current_weight_kg, ' +
    '(SELECT e.occurred_at FROM encounters e WHERE e.patient_id = p.id ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1) AS latest_encounter_at, ' +
    '(SELECT ep.id FROM episodes ep WHERE ep.patient_id = p.id AND ep.status = \'active\' LIMIT 1) AS active_episode_id, ' +
    '(SELECT ep.id FROM episodes ep WHERE ep.patient_id = p.id ORDER BY ep.started_at DESC, ep.id DESC LIMIT 1) AS latest_episode_id ' +
    'FROM patients p ' +
    'WHERE ? = \'\' OR p.mrn LIKE ? ESCAPE \'\\\' OR p.name LIKE ? ESCAPE \'\\\' OR p.phone LIKE ? ESCAPE \'\\\' ' +
    'ORDER BY p.name COLLATE NOCASE, p.mrn LIMIT 500'
  ).all(needle, '%' + escaped + '%', '%' + escaped + '%', '%' + escaped + '%');

  return rows.map((row) => {
    const episodeId = row.active_episode_id || row.latest_episode_id;
    const episode = episodeId ? database.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) : null;
    const baselineId = episode?.baseline_encounter_id;
    const baseline = baselineId ? database.prepare('SELECT weight_kg FROM encounters WHERE id = ?').get(baselineId) : null;
    const latestEpisodeWeight = episode ? database.prepare(
      'SELECT weight_kg FROM encounters WHERE episode_id = ? AND weight_kg IS NOT NULL ORDER BY occurred_at DESC, id DESC LIMIT 1'
    ).get(episode.id) : null;
    return {
      id: row.id,
      mrn: row.mrn,
      name: row.name,
      phone: row.phone,
      currentWeightKg: row.current_weight_kg,
      latestEncounterAt: row.latest_encounter_at,
      episodeStatus: episode?.status || null,
      weightLossPercent: row.active_episode_id && baseline && latestEpisodeWeight
        ? weightSummary(baseline.weight_kg, latestEpisodeWeight.weight_kg).lossPercent
        : null
    };
  });
}

export function startEpisode(database, patientId, actor) {
  const patient = ensurePatient(database, patientId);
  if (database.prepare("SELECT id FROM episodes WHERE patient_id = ? AND status = 'active'").get(patientId)) {
    throw conflict('This Patient already has an active Episode.');
  }
  const now = new Date().toISOString();
  const result = database.prepare(
    "INSERT INTO episodes(patient_id, status, started_at, created_by, created_at, updated_at) VALUES(?, 'active', ?, ?, ?, ?)"
  ).run(patient.id, now, actor.id, now, now);
  audit(database, 'episode', result.lastInsertRowid, 'started', actor.id, null, { patientId: patient.id, startedAt: now });
  return database.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
}

export function closeEpisode(database, episodeId, input, actor) {
  const episode = ensureEpisode(database, episodeId);
  if (episode.status !== 'active') throw conflict('Only an active Episode can be closed.');
  if (!closureReasons.has(input.reason)) throw badRequest('Choose a supported Episode closure reason.');
  const now = new Date().toISOString();
  database.prepare(
    "UPDATE episodes SET status = 'closed', ended_at = ?, closure_reason = ?, updated_at = ? WHERE id = ? AND status = 'active'"
  ).run(now, input.reason, now, episodeId);
  audit(database, 'episode', episodeId, 'closed', actor.id, { status: 'active' }, { status: 'closed', reason: input.reason, endedAt: now });
  return database.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId);
}

export function assignBaseline(database, episodeId, input, actor) {
  const episode = ensureEpisode(database, episodeId);
  if (!input || !Number.isSafeInteger(input.encounterId) || input.encounterId < 1) {
    throw badRequest('Choose a valid Encounter weight as the Episode baseline.');
  }
  const encounter = database.prepare(
    'SELECT id, episode_id, weight_kg FROM encounters WHERE id = ?'
  ).get(input.encounterId);
  if (!encounter || encounter.episode_id !== episode.id || encounter.weight_kg === null) {
    throw badRequest('Baseline must be an Encounter weight in this Episode.');
  }
  const previous = episode.baseline_encounter_id;
  database.prepare('UPDATE episodes SET baseline_encounter_id = ?, updated_at = ? WHERE id = ?')
    .run(encounter.id, new Date().toISOString(), episodeId);
  audit(database, 'episode', episodeId, 'baseline_reassigned', actor.id, { encounterId: previous }, { encounterId: encounter.id });
  return database.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId);
}

export function createEncounter(database, patientId, input, actor) {
  ensurePatient(database, patientId);
  const episode = database.prepare("SELECT * FROM episodes WHERE patient_id = ? AND status = 'active'").get(patientId);
  if (!episode) throw conflict('Start a Weight-loss Episode before creating an Encounter.');
  const occurredAt = timestamp(input.occurredAt);
  const now = new Date().toISOString();
  let encounterId;
  transaction(database, () => {
    const result = database.prepare(
      "INSERT INTO encounters(patient_id, episode_id, occurred_at, status, created_by, created_at, updated_at) VALUES(?, ?, ?, 'draft', ?, ?, ?)"
    ).run(patientId, episode.id, occurredAt, actor.id, now, now);
    encounterId = Number(result.lastInsertRowid);
    audit(database, 'encounter', encounterId, 'created', actor.id, null, {
      patientId,
      episodeId: episode.id,
      occurredAt,
      status: 'draft',
      version: 1
    });
  });
  return getEncounter(database, encounterId);
}

export function getEncounter(database, encounterId) {
  const row = encounterRow(database, encounterId);
  const treatment = database.prepare('SELECT change_type, recorded_at, recorded_by_doctor FROM treatment_records WHERE encounter_id = ?').get(encounterId);
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientMrn: row.mrn,
    episodeId: row.episode_id,
    occurredAt: row.occurred_at,
    status: row.status,
    physicianUserId: row.physician_user_id,
    weightKg: row.weight_kg,
    waistCm: row.waist_cm,
    symptoms: parseJson(row.symptom_codes, []),
    symptomOtherText: row.symptom_other_text || '',
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    treatmentChange: treatment?.change_type || null,
    medications: medicationRows(database, encounterId).map(publicMedication),
    bodyComposition: database.prepare(
      'SELECT l.measurement_id AS id, l.is_primary AS isPrimary, m.measured_at AS measuredAt, m.source_identifier AS sourceIdentifier ' +
      'FROM encounter_body_composition_links l JOIN body_composition_measurements m ON m.id = l.measurement_id ' +
      'WHERE l.encounter_id = ? ORDER BY m.measured_at, m.id'
    ).all(encounterId).map((link) => ({ ...link, isPrimary: Boolean(link.isPrimary) }))
  };
}

function checkExpectedVersion(row, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw badRequest('A current Encounter version is required to save.');
  if (row.version !== expectedVersion) {
    throw conflict('This Encounter changed in another browser. Reload it before saving.', { currentVersion: row.version });
  }
}

function assertVersionWrite(result) {
  if (Number(result.changes) !== 1) {
    throw conflict('This Encounter changed in another browser. Reload it before saving.');
  }
}

function requireEditable(row) {
  if (row.status === 'completed') throw conflict('Reopen this Encounter before making a correction.');
}

function chooseDefaultBaseline(database, episodeId) {
  const episode = database.prepare('SELECT baseline_encounter_id FROM episodes WHERE id = ?').get(episodeId);
  if (!episode) return;
  if (episode.baseline_encounter_id) {
    const current = database.prepare(
      'SELECT id FROM encounters WHERE id = ? AND episode_id = ? AND weight_kg IS NOT NULL'
    ).get(episode.baseline_encounter_id, episodeId);
    if (current) return;
  }
  const first = database.prepare(
    'SELECT id FROM encounters WHERE episode_id = ? AND weight_kg IS NOT NULL ORDER BY occurred_at, id LIMIT 1'
  ).get(episodeId);
  const nextBaselineId = first ? Number(first.id) : null;
  if (episode.baseline_encounter_id === nextBaselineId) return;
  database.prepare('UPDATE episodes SET baseline_encounter_id = ?, updated_at = ? WHERE id = ?')
    .run(nextBaselineId, new Date().toISOString(), episodeId);
}

export function updateEncounter(database, encounterId, input, actor) {
  const row = encounterRow(database, encounterId);
  requireEditable(row);
  if (row.status === 'reopened' && !hasPermission(actor.role, 'encounter:correct')) {
    throw forbidden('Only a doctor or administrator can edit a reopened Encounter.');
  }
  checkExpectedVersion(row, input.expectedVersion);
  const allowed = new Set(['expectedVersion', 'weightKg', 'waistCm', 'symptomCodes', 'symptomOtherText']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw badRequest('Encounter update contains an unsupported field.');
  const weight = input.weightKg === undefined ? row.weight_kg : optionalPositiveNumber(input.weightKg, 'Weight');
  const waist = input.waistCm === undefined ? row.waist_cm : optionalPositiveNumber(input.waistCm, 'Waist circumference');
  const symptoms = input.symptomCodes === undefined
    ? { codes: parseJson(row.symptom_codes, []), otherText: row.symptom_other_text || '' }
    : normalizeSymptoms(input.symptomCodes, input.symptomOtherText ?? row.symptom_other_text ?? '');
  const otherText = input.symptomCodes === undefined && input.symptomOtherText !== undefined
    ? normalizeSymptoms(parseJson(row.symptom_codes, []), input.symptomOtherText).otherText
    : symptoms.otherText;
  const before = row.status === 'reopened' ? encounterSnapshot(database, encounterId) : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    const changed = database.prepare(
      'UPDATE encounters SET weight_kg = ?, waist_cm = ?, symptom_codes = ?, symptom_other_text = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?'
    ).run(weight, waist, JSON.stringify(symptoms.codes), otherText || null, now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    chooseDefaultBaseline(database, row.episode_id);
    if (row.status === 'reopened') {
      audit(database, 'encounter', encounterId, 'corrected', actor.id, before, encounterSnapshot(database, encounterId), null);
    }
  });
  return getEncounter(database, encounterId);
}

function replaceMedicationItems(database, encounterId, items) {
  database.prepare('DELETE FROM medication_items WHERE encounter_id = ?').run(encounterId);
  const insert = database.prepare(
    'INSERT INTO medication_items(encounter_id, medication_code, medication_name_snapshot, dose_mg, residual_dose, route, frequency, quantity_text, catalog_version) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const item of items) {
    insert.run(encounterId, item.medicationCode, item.medicationName, item.doseMg, Number(item.residualDose), item.route, item.frequency, item.quantity, item.catalogVersion);
  }
}

export function updateRegimen(database, encounterId, input, actor) {
  if (![roles.doctor, roles.admin].includes(actor.role)) throw forbidden('Only a doctor or administrator can record a medication regimen.');
  const row = encounterRow(database, encounterId);
  requireEditable(row);
  checkExpectedVersion(row, input.expectedVersion);
  const changeType = validateTreatmentChange(input.changeType);
  const existingTreatment = database.prepare('SELECT change_type FROM treatment_records WHERE encounter_id = ?').get(encounterId);
  if (changeType === 'continue' && existingTreatment?.change_type !== 'continue') {
    throw badRequest('Use Continue previous regimen to copy the prior complete regimen.');
  }
  const items = validateMedicationItems(input.items || []);
  if (['pause', 'no_medication'].includes(changeType) && items.length) {
    throw badRequest('Pause and no-medication visits must not contain a medication item.');
  }
  const before = row.status === 'reopened' ? encounterSnapshot(database, encounterId) : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    database.prepare(
      'INSERT INTO treatment_records(encounter_id, change_type, recorded_by_doctor, recorded_at) VALUES(?, ?, ?, ?) ' +
      'ON CONFLICT(encounter_id) DO UPDATE SET change_type = excluded.change_type, recorded_by_doctor = excluded.recorded_by_doctor, recorded_at = excluded.recorded_at'
    ).run(encounterId, changeType, actor.id, now);
    replaceMedicationItems(database, encounterId, items);
    const changed = database.prepare('UPDATE encounters SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .run(now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    if (row.status === 'reopened') {
      audit(database, 'encounter', encounterId, 'regimen_corrected', actor.id, before, encounterSnapshot(database, encounterId), null);
    }
  });
  return getEncounter(database, encounterId);
}

export function continuePreviousRegimen(database, encounterId, input, actor) {
  if (![roles.doctor, roles.admin].includes(actor.role)) throw forbidden('Only a doctor or administrator can select a medication regimen.');
  const row = encounterRow(database, encounterId);
  requireEditable(row);
  checkExpectedVersion(row, input.expectedVersion);
  const previous = database.prepare(
    'SELECT e.id, tr.change_type FROM encounters e JOIN treatment_records tr ON tr.encounter_id = e.id ' +
    'WHERE e.patient_id = ? AND e.id <> ? AND e.status IN (\'completed\', \'reopened\') ' +
    'AND (e.occurred_at < ? OR (e.occurred_at = ? AND e.id < ?)) ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1'
  ).get(row.patient_id, encounterId, row.occurred_at, row.occurred_at, encounterId);
  const copied = previous ? medicationRows(database, previous.id).map((item) => ({
    medicationCode: item.medication_code,
    medicationName: item.medication_name_snapshot,
    doseMg: item.dose_mg,
    residualDose: Boolean(item.residual_dose),
    route: item.route,
    frequency: item.frequency,
    quantity: item.quantity_text,
    catalogVersion: item.catalog_version
  })) : [];
  const before = row.status === 'reopened' ? encounterSnapshot(database, encounterId) : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    database.prepare(
      'INSERT INTO treatment_records(encounter_id, change_type, recorded_by_doctor, recorded_at) VALUES(?, \'continue\', ?, ?) ' +
      'ON CONFLICT(encounter_id) DO UPDATE SET change_type = excluded.change_type, recorded_by_doctor = excluded.recorded_by_doctor, recorded_at = excluded.recorded_at'
    ).run(encounterId, actor.id, now);
    replaceMedicationItems(database, encounterId, copied);
    const changed = database.prepare('UPDATE encounters SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .run(now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    if (row.status === 'reopened') {
      audit(database, 'encounter', encounterId, 'regimen_corrected', actor.id, before, encounterSnapshot(database, encounterId), 'Continue previous regimen');
    }
  });
  return { encounter: getEncounter(database, encounterId), copiedFromEncounterId: previous?.id || null };
}

export function completeEncounter(database, encounterId, input, actor) {
  const row = encounterRow(database, encounterId);
  requireEditable(row);
  checkExpectedVersion(row, input.expectedVersion);
  let physicianId = input.physicianUserId === undefined ? actor.id : Number(input.physicianUserId);
  if (actor.role !== roles.doctor && actor.role !== roles.admin && physicianId !== actor.id) {
    throw forbidden('A doctor must complete the Encounter.');
  }
  const physician = database.prepare("SELECT id, role, active FROM users WHERE id = ? AND role = 'doctor'").get(physicianId);
  if (!physician || !physician.active) throw badRequest('Select an active doctor as the Encounter physician.');
  const before = row.status === 'reopened' ? encounterSnapshot(database, encounterId) : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    const changed = database.prepare(
      "UPDATE encounters SET status = 'completed', physician_user_id = ?, completed_at = ?, completed_by = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
    ).run(physicianId, now, actor.id, now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    audit(database, 'encounter', encounterId, row.status === 'reopened' ? 'correction_completed' : 'completed',
      actor.id, before, { physicianUserId: physicianId, completedAt: now, version: row.version + 1 });
  });
  return getEncounter(database, encounterId);
}

export function reopenEncounter(database, encounterId, input, actor) {
  const row = encounterRow(database, encounterId);
  if (row.status !== 'completed') throw conflict('Only a completed Encounter can be reopened.');
  checkExpectedVersion(row, input.expectedVersion);
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    throw badRequest('Enter a correction reason between 3 and 500 characters.');
  }
  const before = encounterSnapshot(database, encounterId);
  const now = new Date().toISOString();
  transaction(database, () => {
    const changed = database.prepare(
      "UPDATE encounters SET status = 'reopened', version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
    ).run(now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    audit(database, 'encounter', encounterId, 'reopened', actor.id, before,
      { status: 'reopened', version: row.version + 1 }, input.reason.trim());
  });
  return getEncounter(database, encounterId);
}

export function deleteEmptyDraft(database, encounterId, input, actor) {
  const row = encounterRow(database, encounterId);
  if (row.status !== 'draft') throw conflict('Only a Draft Encounter can be discarded.');
  checkExpectedVersion(row, input.expectedVersion);
  const hasContent = row.weight_kg !== null || row.waist_cm !== null ||
    parseJson(row.symptom_codes, []).length > 0 || Boolean(row.symptom_other_text) ||
    database.prepare('SELECT 1 FROM treatment_records WHERE encounter_id = ?').get(encounterId) ||
    database.prepare('SELECT 1 FROM encounter_body_composition_links WHERE encounter_id = ?').get(encounterId);
  if (hasContent) throw conflict('This Encounter has saved clinical content and cannot be silently deleted.');
  transaction(database, () => {
    const deleted = database.prepare('DELETE FROM encounters WHERE id = ? AND version = ?').run(encounterId, input.expectedVersion);
    assertVersionWrite(deleted);
    database.prepare("DELETE FROM audit_events WHERE entity_type = 'encounter' AND entity_id = ? AND action = 'created'")
      .run(String(encounterId));
  });
  return { deleted: true };
}

function patientView(patient) {
  return { id: patient.id, mrn: patient.mrn, name: patient.name, phone: patient.phone };
}

function bodyMetricsForMeasurement(database, measurementId) {
  return database.prepare(
    'SELECT metric_code AS metricCode, value, canonical_unit AS unit, source_field AS sourceField, verification_status AS status, evidence, mapping_version AS mappingVersion ' +
    'FROM normalized_body_metrics WHERE measurement_id = ? ORDER BY metric_code'
  ).all(measurementId);
}

export function patientHistory(database, patientId) {
  const patient = ensurePatient(database, patientId);
  const episodeRows = database.prepare('SELECT * FROM episodes WHERE patient_id = ? ORDER BY started_at DESC, id DESC').all(patientId);
  const encounters = database.prepare(
    'SELECT e.*, u.display_name AS physician_name FROM encounters e LEFT JOIN users u ON u.id = e.physician_user_id ' +
    'WHERE e.patient_id = ? ORDER BY e.occurred_at DESC, e.id DESC'
  ).all(patientId).map((row) => ({
    ...getEncounter(database, row.id),
    physicianName: row.physician_name || null
  }));
  const episodes = episodeRows.map((episode) => {
    const episodeEncounters = encounters.filter((encounter) => encounter.episodeId === episode.id);
    const baselineEncounter = episode.baseline_encounter_id
      ? episodeEncounters.find((encounter) => encounter.id === episode.baseline_encounter_id)
      : [...episodeEncounters].reverse().find((encounter) => encounter.weightKg !== null);
    const currentWeightEncounter = episodeEncounters.find((encounter) => encounter.weightKg !== null);
    const baselineWaist = baselineEncounter?.waistCm ?? null;
    const currentWaist = episodeEncounters.find((encounter) => encounter.waistCm !== null)?.waistCm ?? null;
    const summary = weightSummary(baselineEncounter?.weightKg, currentWeightEncounter?.weightKg);
    return {
      id: episode.id,
      status: episode.status,
      startedAt: episode.started_at,
      endedAt: episode.ended_at,
      closureReason: episode.closure_reason,
      baselineEncounterId: baselineEncounter?.id ?? null,
      baselineWeightKg: baselineEncounter?.weightKg ?? null,
      currentWeightKg: currentWeightEncounter?.weightKg ?? null,
      changeKg: summary.changeKg,
      weightLossPercent: summary.lossPercent,
      baselineWaistCm: baselineWaist,
      currentWaistCm: currentWaist,
      weightTrend: [...episodeEncounters].reverse().map((encounter) => ({
        encounterId: encounter.id, at: encounter.occurredAt, value: encounter.weightKg
      })),
      waistTrend: [...episodeEncounters].reverse().map((encounter) => ({
        encounterId: encounter.id, at: encounter.occurredAt, value: encounter.waistCm
      })),
      encounters: episodeEncounters
    };
  });

  const measurements = database.prepare(
    'SELECT m.*, s.vendor, s.adapter_type, l.encounter_id, l.is_primary ' +
    'FROM body_composition_measurements m JOIN body_composition_sources s ON s.id = m.source_id ' +
    'LEFT JOIN encounter_body_composition_links l ON l.measurement_id = m.id ' +
    'WHERE m.patient_id = ? ORDER BY m.measured_at DESC, m.id DESC'
  ).all(patientId).map((measurement) => ({
    id: measurement.id,
    source: measurement.vendor,
    adapterType: measurement.adapter_type,
    sourceKey: measurement.source_key,
    measuredAt: measurement.measured_at,
    capturedAt: measurement.captured_at,
    sourceIdentifier: measurement.source_identifier,
    mappingVersion: measurement.mapping_version,
    changedFromId: measurement.changed_from_id,
    encounterId: measurement.encounter_id,
    isPrimary: Boolean(measurement.is_primary),
    metrics: bodyMetricsForMeasurement(database, measurement.id),
    sourceRevision: measurement.source_revision
  }));

  const reports = database.prepare(
    'SELECT r.id, r.measurement_id AS measurementId, r.created_at AS createdAt, r.template_version AS templateVersion, r.mapping_version AS mappingVersion, r.status, m.measured_at AS measuredAt ' +
    'FROM historical_reports r LEFT JOIN body_composition_measurements m ON m.id = r.measurement_id ' +
    'WHERE r.patient_id = ? ORDER BY r.created_at DESC, r.id DESC'
  ).all(patientId);

  const active = episodes.find((episode) => episode.status === 'active') || null;
  return {
    patient: patientView(patient),
    episodes,
    activeEpisode: active,
    encounters,
    medicationTimeline: encounters
      .filter((encounter) => encounter.treatmentChange)
      .map((encounter) => ({
        encounterId: encounter.id,
        occurredAt: encounter.occurredAt,
        treatmentChange: encounter.treatmentChange,
        medications: encounter.medications
      })),
    bodyComposition: {
      measurements,
      reports,
      trends: bodyCompositionTrends(database, patientId)
    }
  };
}

export function bodyCompositionTrends(database, patientId) {
  return database.prepare(
    'SELECT m.metric_code AS metricCode, m.canonical_unit AS unit, x.measured_at AS measuredAt, x.id AS measurementId, e.id AS encounterId, m.value ' +
    'FROM encounter_body_composition_links l ' +
    'JOIN encounters e ON e.id = l.encounter_id ' +
    'JOIN body_composition_measurements x ON x.id = l.measurement_id ' +
    'JOIN normalized_body_metrics m ON m.measurement_id = x.id AND m.mapping_version = x.mapping_version ' +
    "WHERE e.patient_id = ? AND l.is_primary = 1 AND m.verification_status = 'verified' AND m.value IS NOT NULL " +
    'ORDER BY m.metric_code, x.measured_at, x.id'
  ).all(patientId).reduce((trends, point) => {
    if (!trends[point.metricCode]) trends[point.metricCode] = { unit: point.unit, points: [] };
    trends[point.metricCode].points.push({
      at: point.measuredAt,
      value: point.value,
      encounterId: point.encounterId,
      measurementId: point.measurementId
    });
    return trends;
  }, {});
}

export function checkEncounterOwner(database, encounterId, patientId) {
  const row = database.prepare('SELECT patient_id FROM encounters WHERE id = ?').get(encounterId);
  if (!row) throw notFound('Encounter not found.');
  if (row.patient_id !== patientId) throw forbidden('This Encounter does not belong to that Patient.');
}
