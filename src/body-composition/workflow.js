import { transaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { checkEncounterOwner } from '../clinical.js';
import { hasPermission } from '../domain/roles.js';

function requireCorrectionPermission(encounter, actor) {
  if (encounter.status === 'reopened' && !hasPermission(actor.role, 'encounter:correct')) {
    throw forbidden('Only a doctor or administrator can change links on a reopened Encounter.');
  }
}

function getEncounter(database, id) {
  const encounter = database.prepare('SELECT * FROM encounters WHERE id = ?').get(id);
  if (!encounter) throw notFound('Encounter not found.');
  return encounter;
}

function audit(database, action, encounterId, actorId, before, after) {
  database.prepare(
    'INSERT INTO audit_events(entity_type, entity_id, action, actor_user_id, at, before_snapshot, after_snapshot) VALUES(?, ?, ?, ?, ?, ?, ?)'
  ).run('encounter', String(encounterId), action, actorId, new Date().toISOString(),
    before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

function assertVersion(encounter, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw badRequest('A current Encounter version is required.');
  if (encounter.version !== expectedVersion) {
    throw conflict('This Encounter changed in another browser. Reload it before linking a measurement.', {
      currentVersion: encounter.version
    });
  }
}

function assertVersionWrite(result) {
  if (Number(result.changes) !== 1) throw conflict('This Encounter changed in another browser. Reload it before linking a measurement.');
}

function measurement(database, measurementId) {
  const row = database.prepare(
    'SELECT m.*, s.vendor FROM body_composition_measurements m JOIN body_composition_sources s ON s.id = m.source_id WHERE m.id = ?'
  ).get(Number(measurementId));
  if (!row) throw notFound('Body-composition measurement not found.');
  return row;
}

export function linkMeasurement(database, encounterId, input, actor) {
  const encounter = getEncounter(database, encounterId);
  if (encounter.status === 'completed') throw conflict('Reopen this Encounter before changing linked measurements.');
  requireCorrectionPermission(encounter, actor);
  assertVersion(encounter, input.expectedVersion);
  const item = measurement(database, input.measurementId);
  if (item.ignored) throw conflict('This device measurement has been excluded from Patient workflows.');
  if (item.patient_id !== null && item.patient_id !== encounter.patient_id) {
    throw forbidden('This measurement is already associated with another Patient.');
  }
  const existingLink = database.prepare(
    'SELECT encounter_id FROM encounter_body_composition_links WHERE measurement_id = ?'
  ).get(item.id);
  if (existingLink && existingLink.encounter_id !== encounterId) {
    throw conflict('This device measurement is already linked to another Encounter.');
  }
  const primary = input.isPrimary === true;
  const before = encounter.status === 'reopened'
    ? database.prepare('SELECT measurement_id, is_primary FROM encounter_body_composition_links WHERE encounter_id = ?').all(encounterId)
    : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    if (item.patient_id === null) {
      database.prepare('UPDATE body_composition_measurements SET patient_id = ? WHERE id = ? AND patient_id IS NULL')
        .run(encounter.patient_id, item.id);
    }
    if (primary) database.prepare('UPDATE encounter_body_composition_links SET is_primary = 0 WHERE encounter_id = ?').run(encounterId);
    database.prepare(
      'INSERT INTO encounter_body_composition_links(encounter_id, measurement_id, is_primary, linked_by, linked_at) VALUES(?, ?, ?, ?, ?) ' +
      'ON CONFLICT(encounter_id, measurement_id) DO UPDATE SET is_primary = excluded.is_primary, linked_by = excluded.linked_by, linked_at = excluded.linked_at'
    ).run(encounterId, item.id, Number(primary), actor.id, now);
    const changed = database.prepare('UPDATE encounters SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .run(now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    if (encounter.status === 'reopened') {
      const after = database.prepare('SELECT measurement_id, is_primary FROM encounter_body_composition_links WHERE encounter_id = ?').all(encounterId);
      audit(database, 'body_composition_corrected', encounterId, actor.id, before, after);
    }
  });
  return {
    encounterVersion: encounter.version + 1,
    measurements: database.prepare(
      'SELECT l.measurement_id AS id, l.is_primary AS isPrimary, m.measured_at AS measuredAt, m.source_identifier AS sourceIdentifier ' +
      'FROM encounter_body_composition_links l JOIN body_composition_measurements m ON m.id = l.measurement_id WHERE l.encounter_id = ? ORDER BY m.measured_at, m.id'
    ).all(encounterId).map((row) => ({ ...row, isPrimary: Boolean(row.isPrimary) }))
  };
}

export function unlinkMeasurement(database, encounterId, measurementId, input, actor) {
  const encounter = getEncounter(database, encounterId);
  if (encounter.status === 'completed') throw conflict('Reopen this Encounter before changing linked measurements.');
  requireCorrectionPermission(encounter, actor);
  assertVersion(encounter, input.expectedVersion);
  const current = database.prepare(
    'SELECT measurement_id, is_primary FROM encounter_body_composition_links WHERE encounter_id = ? AND measurement_id = ?'
  ).get(encounterId, Number(measurementId));
  if (!current) throw notFound('This measurement is not linked to the Encounter.');
  const before = encounter.status === 'reopened'
    ? database.prepare('SELECT measurement_id, is_primary FROM encounter_body_composition_links WHERE encounter_id = ?').all(encounterId)
    : null;
  const now = new Date().toISOString();
  transaction(database, () => {
    database.prepare('DELETE FROM encounter_body_composition_links WHERE encounter_id = ? AND measurement_id = ?')
      .run(encounterId, Number(measurementId));
    const changed = database.prepare('UPDATE encounters SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .run(now, encounterId, input.expectedVersion);
    assertVersionWrite(changed);
    if (encounter.status === 'reopened') {
      const after = database.prepare('SELECT measurement_id, is_primary FROM encounter_body_composition_links WHERE encounter_id = ?').all(encounterId);
      audit(database, 'body_composition_corrected', encounterId, actor.id, before, after);
    }
  });
  return { encounterVersion: encounter.version + 1 };
}

export function measurementDetails(database, measurementId) {
  const item = measurement(database, measurementId);
  return {
    id: item.id,
    patientId: item.patient_id,
    source: item.vendor,
    sourceKey: item.source_key,
    measuredAt: item.measured_at,
    capturedAt: item.captured_at,
    sourceIdentifier: item.source_identifier,
    mappingVersion: item.mapping_version,
    revision: item.source_revision,
    changedFromId: item.changed_from_id,
    metrics: database.prepare(
      'SELECT metric_code AS metricCode, value, canonical_unit AS unit, source_field AS sourceField, verification_status AS status, evidence ' +
      'FROM normalized_body_metrics WHERE measurement_id = ? AND mapping_version = ? ORDER BY metric_code'
    ).all(item.id, item.mapping_version),
    sourceHistory: database.prepare(
      'SELECT action, actor_label AS actor, at, before_snapshot AS before, after_snapshot AS after ' +
      'FROM imported_source_events WHERE source_entity_id = ? ORDER BY at, id'
    ).all(String(item.id)).map((event) => ({
      ...event,
      before: JSON.parse(event.before || 'null'),
      after: JSON.parse(event.after || 'null')
    }))
  };
}

export function reportContent(database, reportId, patientId = null) {
  const report = database.prepare(
    'SELECT a.content, a.media_type FROM historical_reports r JOIN report_assets a ON a.id = r.asset_id WHERE r.id = ?'
  ).get(Number(reportId));
  if (!report) throw notFound('Body-composition report not found.');
  if (patientId !== null) {
    const owner = database.prepare('SELECT patient_id FROM historical_reports WHERE id = ?').get(Number(reportId));
    if (!owner || owner.patient_id !== patientId) throw forbidden('This report belongs to another Patient.');
  }
  return report;
}
