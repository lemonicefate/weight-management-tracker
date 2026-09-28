import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { transaction, parseJson } from '../../db.js';
import { conflict } from '../../errors.js';
import { legacyMetricsToNormalized } from './normalizer.js';

const sourceApplicationId = 1213153614;
const importName = 'hoanboy-tracker';

function hasTable(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function decodeJson(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return parseJson(value, fallback);
}

function safeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return new Date(0).toISOString();
  return value;
}

function stable(value) {
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sourceFingerprint(source) {
  const hash = createHash('sha256');
  const applicationId = source.prepare('PRAGMA application_id').get().application_id;
  const version = source.prepare('PRAGMA user_version').get().user_version;
  hash.update([applicationId, version].join(':'));
  for (const table of ['patients', 'measurements', 'normalizations', 'reports', 'report_measurements', 'assignment_events', 'sync_runs']) {
    if (!hasTable(source, table)) continue;
    hash.update(table + ':');
    for (const row of source.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').iterate()) {
      hash.update(stable(row));
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}

function validateSource(source) {
  const applicationId = source.prepare('PRAGMA application_id').get().application_id;
  const version = source.prepare('PRAGMA user_version').get().user_version;
  if (applicationId !== sourceApplicationId || ![0, 1, 2].includes(version) ||
      !hasTable(source, 'patients') || !hasTable(source, 'measurements')) {
    throw new Error('The uploaded file is not a supported HOANBOY tracker database.');
  }
  const integrity = source.prepare('PRAGMA integrity_check').get().integrity_check;
  if (integrity !== 'ok') throw new Error('The source database did not pass its integrity check.');
  if (source.prepare('PRAGMA foreign_key_check').get()) {
    throw new Error('The source database contains an invalid relationship.');
  }
}

function insertNormalized(database, measurementId, version, metrics) {
  const insert = database.prepare(
    'INSERT OR REPLACE INTO normalized_body_metrics(measurement_id, mapping_version, metric_code, value, canonical_unit, source_field, verification_status, evidence) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const metric of metrics) {
    insert.run(measurementId, version, metric.metricCode, metric.value, metric.unit, metric.sourceField, metric.status, metric.evidence);
  }
}

function patientForSource(database, sourcePatient, counts) {
  const mrn = String(sourcePatient.mrn ?? '');
  if (!mrn) throw new Error('A source Patient is missing an MRN.');
  const existing = database.prepare('SELECT * FROM patients WHERE mrn = ?').get(mrn);
  if (existing) {
    counts.patientsMatched += 1;
    return existing.id;
  }
  const name = typeof sourcePatient.name === 'string' ? sourcePatient.name.trim() : '';
  if (!name) throw new Error('A source Patient is missing a name.');
  const created = safeTimestamp(sourcePatient.updated_at);
  const result = database.prepare(
    'INSERT INTO patients(mrn, name, phone, created_at, updated_at) VALUES(?, ?, ?, ?, ?)'
  ).run(mrn, name, String(sourcePatient.phone || ''), created, created);
  counts.patientsCreated += 1;
  return Number(result.lastInsertRowid);
}

function mapLegacyMetrics(database, measurementId, version, rawMetrics) {
  const normalized = legacyMetricsToNormalized(rawMetrics, version);
  insertNormalized(database, measurementId, version, normalized);
}

function importPatients(source, database, counts) {
  const sourcePatients = source.prepare('SELECT * FROM patients ORDER BY id').all();
  const patientMap = new Map();
  const seenMrns = new Set();
  for (const patient of sourcePatients) {
    const mrn = String(patient.mrn ?? '');
    if (!mrn || seenMrns.has(mrn)) throw new Error('Source Patient MRN values are missing or duplicated.');
    seenMrns.add(mrn);
    patientMap.set(patient.id, patientForSource(database, patient, counts));
  }
  return patientMap;
}

function importMeasurements(source, database, patientMap, fingerprint, counts) {
  const sourceId = database.prepare(
    'SELECT id FROM body_composition_sources WHERE adapter_type = ?'
  ).get('hoanboy-370')?.id;
  const resultByOldId = new Map();
  const sourceRows = source.prepare('SELECT * FROM measurements ORDER BY id').all();
  for (const measurement of sourceRows) {
    const raw = decodeJson(measurement.raw, {});
    const schema = decodeJson(measurement.source_schema, []);
    const sourceRow = decodeJson(measurement.source_row, []);
    const legacyMetrics = decodeJson(measurement.metrics, {});
    const key = String(measurement.source_key || measurement.id);
    const digest = String(measurement.digest || createHash('sha256').update(JSON.stringify(raw)).digest('hex'));
    const existing = database.prepare(
      'SELECT id, patient_id FROM body_composition_measurements WHERE source_id = ? AND source_key = ? AND source_digest = ?'
    ).get(sourceId, key, digest);
    let measurementId;
    if (existing) {
      measurementId = existing.id;
      const expectedPatientId = measurement.patient_id === null ? null : patientMap.get(measurement.patient_id);
      if (expectedPatientId && existing.patient_id && expectedPatientId !== existing.patient_id) {
        throw conflict('An imported device measurement is already associated with another Patient.');
      }
      if (expectedPatientId && !existing.patient_id) {
        database.prepare('UPDATE body_composition_measurements SET patient_id = ? WHERE id = ?').run(expectedPatientId, measurementId);
      }
      counts.measurementsMatched += 1;
    } else {
      const previous = database.prepare(
        'SELECT id, source_revision FROM body_composition_measurements WHERE source_id = ? AND source_key = ? ORDER BY source_revision DESC LIMIT 1'
      ).get(sourceId, key);
      const patientId = measurement.patient_id === null ? null : patientMap.get(measurement.patient_id) || null;
      const mappingVersion = String(measurement.mapping_version || 'hoanboy-import-unknown');
      const snapshot = {
        record: raw,
        raw,
        schema,
        sourceRow,
        importedMetrics: legacyMetrics,
        importedFrom: importName,
        sourceSchema: measurement.source_schema || null
      };
      const inserted = database.prepare(
        'INSERT INTO body_composition_measurements(source_id, source_key, source_digest, source_revision, patient_id, measured_at, captured_at, source_identifier, source_timezone, clock_status, ignored, raw_snapshot, mapping_version, changed_from_id, imported_from) ' +
        'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        sourceId,
        key,
        digest,
        previous ? previous.source_revision + 1 : 1,
        patientId,
        measurement.sort_time || measurement.source_time || null,
        safeTimestamp(measurement.captured_at),
        measurement.source_identifier || null,
        measurement.source_timezone || null,
        measurement.clock_status || 'unverified',
        Number(Boolean(measurement.ignored)),
        JSON.stringify(snapshot),
        mappingVersion,
        previous?.id || null,
        importName + ':' + fingerprint
      );
      measurementId = Number(inserted.lastInsertRowid);
      mapLegacyMetrics(database, measurementId, mappingVersion, legacyMetrics);
      counts.measurementsImported += 1;
    }
    resultByOldId.set(measurement.id, measurementId);
  }
  return resultByOldId;
}

function importNormalizationHistory(source, database, measurementMap) {
  if (!hasTable(source, 'normalizations')) return;
  for (const row of source.prepare('SELECT * FROM normalizations ORDER BY id').all()) {
    const measurementId = measurementMap.get(row.measurement_id);
    if (!measurementId) continue;
    const metrics = decodeJson(row.metrics, {});
    const version = String(row.mapping_version || 'hoanboy-import-unknown');
    mapLegacyMetrics(database, measurementId, version, metrics);
  }
}

function importReports(source, database, patientMap, measurementMap, fingerprint, counts) {
  if (!hasTable(source, 'reports')) return new Map();
  const reportMap = new Map();
  for (const report of source.prepare('SELECT * FROM reports ORDER BY id').all()) {
    const patientId = patientMap.get(report.patient_id);
    if (!patientId) continue;
    const oldMeasurementId = measurementMap.get(report.measurement_id);
    const measurementId = oldMeasurementId || null;
    const sourceReportId = importName + ':' + fingerprint + ':' + report.id;
    const existing = database.prepare('SELECT id FROM historical_reports WHERE imported_from = ?').get(sourceReportId);
    if (existing) {
      reportMap.set(report.id, existing.id);
      counts.reportsMatched += 1;
      continue;
    }
    const html = typeof report.html === 'string' ? report.html : '';
    const asset = database.prepare(
      'INSERT INTO report_assets(patient_id, measurement_id, source_report_id, media_type, content, created_at) VALUES(?, ?, ?, ?, ?, ?)'
    ).run(patientId, measurementId, sourceReportId, 'text/html; charset=utf-8', Buffer.from(html, 'utf8'), safeTimestamp(report.created_at));
    const historical = database.prepare(
      'INSERT INTO historical_reports(patient_id, measurement_id, asset_id, created_at, template_version, mapping_version, status, snapshot, imported_from) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(patientId, measurementId, Number(asset.lastInsertRowid), safeTimestamp(report.created_at),
      String(report.template_version || 'legacy'), String(report.mapping_version || 'legacy'),
      String(report.status || 'imported'), String(report.snapshot || '{}'), sourceReportId);
    reportMap.set(report.id, Number(historical.lastInsertRowid));
    counts.reportsImported += 1;
  }
  return reportMap;
}

function importReportMeasurementLinks(source, database, reportMap, measurementMap) {
  if (!hasTable(source, 'report_measurements')) return;
  const insert = database.prepare(
    'INSERT OR IGNORE INTO historical_report_measurements(report_id, measurement_id) VALUES(?, ?)'
  );
  for (const link of source.prepare('SELECT * FROM report_measurements').all()) {
    const reportId = reportMap.get(link.report_id);
    const measurementId = measurementMap.get(link.measurement_id);
    if (reportId && measurementId) insert.run(reportId, measurementId);
  }
}

function importAssignmentEvents(source, database, patientMap, measurementMap, fingerprint) {
  if (!hasTable(source, 'assignment_events')) return;
  const insert = database.prepare(
    'INSERT OR IGNORE INTO imported_source_events(imported_from, source_event_id, source_entity_id, action, actor_label, at, before_snapshot, after_snapshot) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const event of source.prepare('SELECT * FROM assignment_events ORDER BY id').all()) {
    const measurementId = measurementMap.get(event.measurement_id);
    const beforePatientId = event.before_patient === null ? null : patientMap.get(event.before_patient) || null;
    const afterPatientId = event.after_patient === null ? null : patientMap.get(event.after_patient) || null;
    insert.run(
      importName + ':' + fingerprint,
      String(event.id),
      measurementId === undefined ? null : String(measurementId),
      String(event.action || 'assignment'),
      event.actor === null ? null : String(event.actor),
      safeTimestamp(event.at),
      JSON.stringify({ patientId: beforePatientId }),
      JSON.stringify({ patientId: afterPatientId })
    );
  }
}

function countNormalizationVersions(database, sourceId) {
  return database.prepare(
    'SELECT COUNT(*) AS count FROM (' +
    'SELECT DISTINCT n.measurement_id, n.mapping_version FROM normalized_body_metrics n ' +
    'JOIN body_composition_measurements m ON m.id = n.measurement_id ' +
    'WHERE m.source_id = ?'
    + ')'
  ).get(sourceId).count;
}

export function migrateHoanboyDatabase(sourcePath, database, actor) {
  const source = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
  try {
    validateSource(source);
    const fingerprint = sourceFingerprint(source);
    const counts = {
      patientsCreated: 0,
      patientsMatched: 0,
      measurementsImported: 0,
      measurementsMatched: 0,
      reportsImported: 0,
      reportsMatched: 0,
      normalizationVersionsImported: 0,
      normalizationVersionsTotal: 0
    };
    const sourceId = database.prepare(
      'SELECT id FROM body_composition_sources WHERE adapter_type = ?'
    ).get('hoanboy-370')?.id;
    if (!sourceId) throw new Error('HOANBOY adapter source has not been initialized.');
    const normalizationVersionsBefore = countNormalizationVersions(database, sourceId);

    transaction(database, () => {
      const patientMap = importPatients(source, database, counts);
      const measurementMap = importMeasurements(source, database, patientMap, fingerprint, counts);
      importNormalizationHistory(source, database, measurementMap);
      const reportMap = importReports(source, database, patientMap, measurementMap, fingerprint, counts);
      importReportMeasurementLinks(source, database, reportMap, measurementMap);
      importAssignmentEvents(source, database, patientMap, measurementMap, fingerprint);
      const normalizationVersionsAfter = countNormalizationVersions(database, sourceId);
      counts.normalizationVersionsImported = normalizationVersionsAfter - normalizationVersionsBefore;
      counts.normalizationVersionsTotal = normalizationVersionsAfter;
      database.prepare(
        'INSERT INTO audit_events(entity_type, entity_id, action, actor_user_id, at, after_snapshot) VALUES(?, ?, ?, ?, ?, ?)'
      ).run('migration', 'hoanboy', 'import_completed', actor.id, new Date().toISOString(),
        JSON.stringify({ fingerprint: fingerprint.slice(0, 16), ...counts }));
    });
    return { sourceFingerprint: fingerprint.slice(0, 16), counts };
  } finally {
    source.close();
  }
}
