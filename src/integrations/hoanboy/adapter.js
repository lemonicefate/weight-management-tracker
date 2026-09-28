import { transaction, parseJson } from '../../db.js';
import { assertBodyCompositionAdapter } from '../../body-composition/contract.js';
import { badRequest, notFound } from '../../errors.js';
import { HoanboyDeviceReader, validateDeviceAddress } from './device-reader.js';
import {
  candidateMappingView,
  digestSourceRow,
  mappingVersion,
  normalizeHoanboyRow,
  validateDeviceSnapshot
} from './normalizer.js';

const adapterType = 'hoanboy-370';

function setting(database, key) {
  const result = database.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return result?.value || '';
}

function writeSetting(database, key, value, actorId) {
  database.prepare(
    'INSERT INTO app_settings(key, value, updated_at, updated_by) VALUES(?, ?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
  ).run(key, value, new Date().toISOString(), actorId);
}

function currentMapping(database) {
  return parseJson(setting(database, 'hoanboy.metric_mapping'), {});
}

function registerSource(database) {
  const now = new Date().toISOString();
  database.prepare(
    'INSERT INTO body_composition_sources(adapter_type, vendor, created_at) VALUES(?, ?, ?) ON CONFLICT(adapter_type) DO NOTHING'
  ).run(adapterType, 'HOANBOY 370', now);
  return database.prepare('SELECT id FROM body_composition_sources WHERE adapter_type = ?').get(adapterType).id;
}

function parseMeasurementTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replaceAll('/', '-').replace('T', ' ');
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return null;
  return match[1] + 'T' + match[2];
}

function insertMetrics(database, measurementId, version, metrics) {
  const insert = database.prepare(
    'INSERT OR REPLACE INTO normalized_body_metrics(measurement_id, mapping_version, metric_code, value, canonical_unit, source_field, verification_status, evidence) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const metric of metrics) {
    insert.run(measurementId, version, metric.metricCode, metric.value, metric.unit, metric.sourceField, metric.status, metric.evidence);
  }
}

function toCandidate(database, row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    source: 'HOANBOY 370',
    sourceKey: row.source_key,
    measuredAt: row.measured_at,
    capturedAt: row.captured_at,
    sourceIdentifier: row.source_identifier,
    mappingVersion: row.mapping_version,
    metrics: database.prepare(
      'SELECT metric_code AS metricCode, value, canonical_unit AS unit, verification_status AS status ' +
      'FROM normalized_body_metrics WHERE measurement_id = ? AND mapping_version = ? ORDER BY metric_code'
    ).all(row.id, row.mapping_version)
  };
}

export function createHoanboyAdapter(database, configuredDeviceIp = '', deviceReaderFactory = (address) => new HoanboyDeviceReader(address)) {
  const sourceId = registerSource(database);
  let synchronizationInProgress = false;

  const adapter = {
    async health() {
      const address = setting(database, 'hoanboy.device_ip') || configuredDeviceIp;
      if (!address) return { available: false, configured: false };
      try {
        const reader = deviceReaderFactory(validateDeviceAddress(address));
        const result = await reader.health();
        return { available: result.available, configured: true };
      } catch {
        return { available: false, configured: true };
      }
    },

    async synchronize() {
      if (synchronizationInProgress) throw badRequest('A device sync is already in progress.', 'sync_busy');
      synchronizationInProgress = true;
      try {
        const address = setting(database, 'hoanboy.device_ip') || configuredDeviceIp;
        if (!address) throw badRequest('HOANBOY device is not configured.', 'device_not_configured');
        const reader = deviceReaderFactory(validateDeviceAddress(address));
        const payload = await reader.synchronize();
        const validated = validateDeviceSnapshot(payload);
        const mapping = currentMapping(database);
        const version = mappingVersion(mapping);
        const capturedAt = new Date().toISOString();
        const counts = { added: 0, updated: 0, unchanged: 0 };

        transaction(database, () => {
          const insert = database.prepare(
            'INSERT INTO body_composition_measurements(source_id, source_key, source_digest, source_revision, measured_at, captured_at, source_identifier, clock_status, raw_snapshot, mapping_version) ' +
            'VALUES(?, ?, ?, ?, ?, ?, ?, \'unverified\', ?, ?)'
          );
          for (let index = 0; index < validated.records.length; index += 1) {
            const record = validated.records[index];
            const sourceKey = String(record.uid);
            const digest = digestSourceRow(record);
            const existing = database.prepare(
              'SELECT id FROM body_composition_measurements WHERE source_id = ? AND source_key = ? AND source_digest = ?'
            ).get(sourceId, sourceKey, digest);
            if (existing) {
              counts.unchanged += 1;
              continue;
            }
            const previous = database.prepare(
              'SELECT id, source_revision FROM body_composition_measurements WHERE source_id = ? AND source_key = ? ORDER BY source_revision DESC LIMIT 1'
            ).get(sourceId, sourceKey);
            counts[previous ? 'updated' : 'added'] += 1;
            const snapshot = {
              record,
              schema: validated.schema,
              sourceRow: validated.rows[index],
              raw: record
            };
            const result = insert.run(
              sourceId,
              sourceKey,
              digest,
              previous ? previous.source_revision + 1 : 1,
              parseMeasurementTime(record.time),
              capturedAt,
              record.username === null ? null : String(record.username),
              JSON.stringify(snapshot),
              version
            );
            insertMetrics(database, Number(result.lastInsertRowid), version, normalizeHoanboyRow(record, mapping));
          }
        });
        return { status: 'success', ...counts, capturedAt };
      } catch {
        throw badRequest('HOANBOY sync failed. Check device availability and its validated source schema, then try again.', 'device_sync_failed');
      } finally {
        synchronizationInProgress = false;
      }
    },

    async listCandidates(patientId) {
      const rows = database.prepare(
        'SELECT m.* FROM body_composition_measurements m WHERE m.source_id = ? AND m.ignored = 0 AND (m.patient_id IS NULL OR m.patient_id = ?) ' +
        'AND NOT EXISTS (SELECT 1 FROM encounter_body_composition_links l WHERE l.measurement_id = m.id) ' +
        'ORDER BY m.measured_at DESC, m.id DESC LIMIT 300'
      ).all(sourceId, patientId);
      return rows.map((row) => toCandidate(database, row));
    },

    async getMeasurement(measurementId) {
      const row = database.prepare(
        'SELECT * FROM body_composition_measurements WHERE source_id = ? AND id = ?'
      ).get(sourceId, Number(measurementId));
      if (!row) throw notFound('Body-composition measurement not found.');
      return toCandidate(database, row);
    }
  };
  return assertBodyCompositionAdapter(adapter);
}

export function getHoanboyAdminConfiguration(database, configuredDeviceIp = '') {
  const address = setting(database, 'hoanboy.device_ip') || configuredDeviceIp;
  const mappings = currentMapping(database);
  return {
    deviceConfigured: Boolean(address),
    deviceIp: address,
    mappings: candidateMappingView(mappings)
  };
}

export function updateHoanboyDeviceIp(database, address, actorId) {
  const value = address.trim();
  if (value) validateDeviceAddress(value);
  writeSetting(database, 'hoanboy.device_ip', value, actorId);
}

export function updateHoanboyMapping(database, items, actorId) {
  if (!Array.isArray(items)) throw badRequest('Metric mapping must be a list.');
  const next = {};
  for (const item of items) {
    if (!item || typeof item.metricCode !== 'string') throw badRequest('Metric mapping entry is invalid.');
    const known = candidateMappingView({}).find((entry) => entry.metricCode === item.metricCode);
    if (!known) throw badRequest('Metric mapping contains an unsupported canonical metric.');
    if (item.verified === true) {
      if (known.unit === 'unverified') throw badRequest('This metric has no confirmed canonical unit and cannot be verified.');
      if (item.sourceField !== known.sourceField || item.unit !== known.unit) {
        throw badRequest('Verified mapping must use the documented HOANBOY field and unit.');
      }
      if (typeof item.evidence !== 'string' || !item.evidence.trim() || item.evidence.trim().length > 500) {
        throw badRequest('A verification evidence reference of 1–500 characters is required.');
      }
      next[item.metricCode] = {
        sourceField: known.sourceField,
        unit: known.unit,
        evidence: item.evidence.trim()
      };
    }
  }
  const version = mappingVersion(next);
  transaction(database, () => {
    writeSetting(database, 'hoanboy.metric_mapping', JSON.stringify(next), actorId);
    const measurements = database.prepare(
      'SELECT id, raw_snapshot FROM body_composition_measurements WHERE source_id = ?'
    ).all(registerSource(database));
    for (const measurement of measurements) {
      const snapshot = parseJson(measurement.raw_snapshot, {});
      const record = snapshot.record || snapshot.raw;
      if (!record || typeof record !== 'object') continue;
      database.prepare('UPDATE body_composition_measurements SET mapping_version = ? WHERE id = ?').run(version, measurement.id);
      insertMetrics(database, measurement.id, version, normalizeHoanboyRow(record, next));
    }
  });
  return getHoanboyAdminConfiguration(database);
}
