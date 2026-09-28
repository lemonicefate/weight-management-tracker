import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.js';
import { createUser } from '../src/identity/users.js';
import { createPatient } from '../src/clinical.js';
import { createHoanboyAdapter } from '../src/integrations/hoanboy/adapter.js';
import { migrateHoanboyDatabase } from '../src/integrations/hoanboy/migration.js';
import { createEncryptedDatabaseBackup } from '../src/backup/service.js';
import { decryptBackup } from '../src/backup/archive.js';
import { startTestServer, fictionalPatient } from './helpers.js';

function createSyntheticHoanboyDatabase(path) {
  const database = new DatabaseSync(path);
  database.exec([
    'PRAGMA application_id = 1213153614;',
    'PRAGMA user_version = 2;',
    'CREATE TABLE patients (id INTEGER PRIMARY KEY, mrn TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT \'\', updated_at TEXT NOT NULL);',
    'CREATE TABLE measurements (id INTEGER PRIMARY KEY, device TEXT NOT NULL, source_key TEXT NOT NULL, digest TEXT NOT NULL, raw TEXT NOT NULL, source_schema TEXT NOT NULL, source_row TEXT NOT NULL, captured_at TEXT NOT NULL, source_time TEXT, sort_time TEXT, source_timezone TEXT, clock_status TEXT NOT NULL, source_identifier TEXT, metrics TEXT NOT NULL, mapping_version TEXT NOT NULL, changed_from INTEGER, patient_id INTEGER, ignored INTEGER NOT NULL DEFAULT 0);',
    'CREATE TABLE normalizations (id INTEGER PRIMARY KEY, measurement_id INTEGER NOT NULL, metrics TEXT NOT NULL, mapping_version TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL);',
    'CREATE TABLE reports (id INTEGER PRIMARY KEY, measurement_id INTEGER NOT NULL, patient_id INTEGER NOT NULL, created_at TEXT NOT NULL, template_version TEXT NOT NULL, mapping_version TEXT NOT NULL, status TEXT NOT NULL, snapshot TEXT NOT NULL, html TEXT NOT NULL);',
    'CREATE TABLE report_measurements (report_id INTEGER NOT NULL, measurement_id INTEGER NOT NULL, PRIMARY KEY(report_id, measurement_id));',
    'CREATE TABLE assignment_events (id INTEGER PRIMARY KEY, measurement_id INTEGER NOT NULL, before_patient INTEGER, after_patient INTEGER, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);'
  ].join('\n'));
  database.prepare('INSERT INTO patients(id, mrn, name, phone, updated_at) VALUES(?, ?, ?, ?, ?)').run(
    41, '000BC-TEST-001', 'Fictional Legacy Patient', 'TEST-LEGACY-PHONE', '2026-04-01T08:00:00.000Z'
  );
  const raw = { uid: 'legacy-synthetic-1001', username: 'Fictional Scale Subject', time: '2026-03-01 09:15:00', bhWeightKg: 109.7 };
  const metrics = {
    weight: { value: 109.7, source: 'bhWeightKg', unit: 'kg', status: 'verified', evidence: 'Fictional legacy unit validation WM-TEST-2' }
  };
  database.prepare(
    'INSERT INTO measurements(id, device, source_key, digest, raw, source_schema, source_row, captured_at, source_time, sort_time, source_timezone, clock_status, source_identifier, metrics, mapping_version, patient_id, ignored) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(90, 'HOANBOY 370', raw.uid, 'fictional-digest-90', JSON.stringify(raw), JSON.stringify([{ title: 'uid' }]),
    JSON.stringify([{ value: raw.uid }]), '2026-03-01T09:16:00.000Z', raw.time, '2026-03-01T09:15:00',
    null, 'unverified', raw.username, JSON.stringify(metrics), 'candidate-1+synthetic', 41, 0);
  database.prepare(
    'INSERT INTO normalizations(id, measurement_id, metrics, mapping_version, at, actor) VALUES(?, ?, ?, ?, ?, ?)'
  ).run(1, 90, JSON.stringify(metrics), 'candidate-1+synthetic', '2026-03-01T09:16:00.000Z', 'fictional-import-operator');
  database.prepare(
    'INSERT INTO reports(id, measurement_id, patient_id, created_at, template_version, mapping_version, status, snapshot, html) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(12, 90, 41, '2026-03-01T09:17:00.000Z', 'synthetic-template-1', 'candidate-1+synthetic',
    'draft', JSON.stringify({ note: 'Fictional historical report' }), '<html><body><h1>Fictional historical report</h1></body></html>');
  database.prepare('INSERT INTO report_measurements(report_id, measurement_id) VALUES(?, ?)').run(12, 90);
  database.prepare(
    'INSERT INTO assignment_events(id, measurement_id, before_patient, after_patient, action, actor, at) VALUES(?, ?, ?, ?, ?, ?, ?)'
  ).run(19, 90, null, 41, 'assign', 'fictional-import-operator', '2026-03-01T09:16:30.000Z');
  database.close();
}

test('HOANBOY migration matches by exact MRN, preserves history and reports, and leaves the source read-only', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wmt-legacy-fictional-'));
  const sourcePath = join(directory, 'fictional-hoanboy.sqlite');
  createSyntheticHoanboyDatabase(sourcePath);
  const before = await readFile(sourcePath);
  const destination = await openDatabase(':memory:');
  try {
    const admin = await createUser(destination, {
      username: 'fictional-admin',
      displayName: 'Fictional Administrator',
      role: 'admin',
      password: 'Fictional-Admin-Password-123'
    });
    const existing = createPatient(destination, {
      mrn: '000BC-TEST-001',
      name: 'Fictional Existing Patient Record',
      phone: 'TEST-CURRENT-PHONE'
    }, admin);
    createHoanboyAdapter(destination);

    const first = migrateHoanboyDatabase(sourcePath, destination, admin);
    assert.equal(first.counts.patientsCreated, 0);
    assert.equal(first.counts.patientsMatched, 1);
    assert.equal(first.counts.measurementsImported, 1);
    assert.equal(first.counts.reportsImported, 1);
    assert.equal(first.counts.normalizationVersionsImported, 1);
    assert.equal(first.counts.normalizationVersionsTotal, 1);
    const repeated = migrateHoanboyDatabase(sourcePath, destination, admin);
    assert.equal(repeated.counts.patientsCreated, 0);
    assert.equal(repeated.counts.measurementsImported, 0);
    assert.equal(repeated.counts.measurementsMatched, 1);
    assert.equal(repeated.counts.reportsImported, 0);
    assert.equal(repeated.counts.reportsMatched, 1);
    assert.equal(repeated.counts.normalizationVersionsImported, 0);
    assert.equal(repeated.counts.normalizationVersionsTotal, 1);

    const patients = destination.prepare('SELECT id, mrn, name, phone FROM patients').all();
    assert.equal(patients.length, 1);
    assert.equal(patients[0].id, existing.id);
    assert.equal(patients[0].mrn, '000BC-TEST-001');
    assert.equal(patients[0].name, 'Fictional Existing Patient Record');
    const measurement = destination.prepare('SELECT * FROM body_composition_measurements').get();
    assert.equal(measurement.patient_id, existing.id);
    assert.equal(measurement.source_key, 'legacy-synthetic-1001');
    assert.ok(measurement.imported_from.startsWith('hoanboy-tracker:' + first.sourceFingerprint));
    const normalized = destination.prepare(
      'SELECT value, verification_status, evidence FROM normalized_body_metrics WHERE measurement_id = ? AND metric_code = ?'
    ).get(measurement.id, 'body_weight');
    assert.equal(normalized.value, 109.7);
    assert.equal(normalized.verification_status, 'verified');
    assert.match(normalized.evidence, /Fictional legacy/);

    const report = destination.prepare('SELECT r.id, a.content FROM historical_reports r JOIN report_assets a ON a.id = r.asset_id').get();
    assert.ok(Buffer.from(report.content).toString('utf8').includes('Fictional historical report'));
    assert.equal(destination.prepare('SELECT COUNT(*) AS count FROM historical_report_measurements').get().count, 1);
    assert.equal(destination.prepare('SELECT COUNT(*) AS count FROM imported_source_events').get().count, 1);
    assert.equal(destination.prepare('SELECT COUNT(*) AS count FROM episodes').get().count, 0);
    assert.equal(destination.prepare('SELECT COUNT(*) AS count FROM encounters').get().count, 0);
    assert.deepEqual(await readFile(sourcePath), before);
  } finally {
    destination.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('administrator migration endpoint backs up the source and exposes imported history for review', async (t) => {
  const app = await startTestServer(t);
  const admin = app.client();
  await admin.login();
  const sourceDirectory = await mkdtemp(join(tmpdir(), 'wmt-upload-fictional-'));
  t.after(() => rm(sourceDirectory, { recursive: true, force: true }));
  const sourcePath = join(sourceDirectory, 'fictional-hoanboy.sqlite');
  createSyntheticHoanboyDatabase(sourcePath);
  const sourceBytes = await readFile(sourcePath);

  const imported = await admin.request('/api/admin/migrate/hoanboy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.sqlite3' },
    body: sourceBytes
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.data.counts.patientsCreated, 1);
  assert.equal(imported.data.counts.measurementsImported, 1);
  assert.equal(imported.data.counts.reportsImported, 1);
  assert.equal(imported.data.counts.normalizationVersionsImported, 1);
  assert.equal(imported.data.sourceBackupStored, true);
  assert.match(imported.data.sourceBackupName, /^hoanboy-source-[0-9a-f-]+\.wmsource$/);
  const encryptedSourceBackup = await readFile(join(app.config.dataDirectory, 'backups', imported.data.sourceBackupName));
  assert.equal(encryptedSourceBackup.subarray(0, 8).toString('ascii'), 'WMTBAK01');
  assert.equal(decryptBackup(encryptedSourceBackup, app.config.backupPassphrase).subarray(0, 16).toString('ascii'), 'SQLite format 3\u0000');
  assert.deepEqual(await readFile(sourcePath), sourceBytes);

  const patients = await admin.request('/api/patients?q=000BC-TEST-001');
  assert.equal(patients.status, 200);
  assert.equal(patients.data.patients.length, 1);
  const history = await admin.request('/api/patients/' + patients.data.patients[0].id);
  assert.equal(history.data.episodes.length, 0);
  assert.equal(history.data.encounters.length, 0);
  assert.equal(history.data.bodyComposition.measurements.length, 1);
  assert.equal(history.data.bodyComposition.reports.length, 1);
  const report = await admin.request('/api/reports/' + history.data.bodyComposition.reports[0].id);
  assert.equal(report.status, 200);
  assert.equal(report.response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(report.response.headers.get('content-security-policy'), /sandbox/);
  assert.match(report.data.toString('utf8'), /Fictional historical report/);
});

test('encrypted database backup verifies and restores atomically, revoking old sessions', async (t) => {
  const app = await startTestServer(t);
  const admin = app.client();
  await admin.login();
  const first = await admin.request('/api/patients', { method: 'POST', json: fictionalPatient });
  assert.equal(first.status, 201);
  const patientId = first.data.patient.id;
  const episode = await admin.request('/api/patients/' + patientId + '/episodes', { method: 'POST', json: {} });
  assert.equal(episode.status, 201);
  const encounter = await admin.request('/api/patients/' + patientId + '/encounters', { method: 'POST', json: {} });
  assert.equal(encounter.status, 201);
  const saved = await admin.request('/api/encounters/' + encounter.data.encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 1, weightKg: 123.4, waistCm: 198.7, symptomCodes: ['nausea'] }
  });
  assert.equal(saved.status, 200);
  const doctor = await admin.request('/api/admin/users', {
    method: 'POST',
    json: { username: 'fictional-backup-doctor', displayName: 'Fictional Backup Doctor', role: 'doctor', password: 'Fictional-Backup-Doctor-123' }
  });
  assert.equal(doctor.status, 201);

  const sourceId = app.database.prepare('SELECT id FROM body_composition_sources WHERE adapter_type = ?').get('hoanboy-370').id;
  const measuredAt = '2026-06-01T08:45:00.000Z';
  const sourceKey = 'synthetic-backup-reading-1001';
  const rawSnapshot = JSON.stringify({
    uid: sourceKey,
    username: 'Fictional Scale Subject',
    time: measuredAt,
    bhWeightKg: 111.2
  });
  const measurement = app.database.prepare(
    'INSERT INTO body_composition_measurements(source_id, source_key, source_digest, source_revision, measured_at, captured_at, source_identifier, clock_status, raw_snapshot, mapping_version) ' +
    'VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?, ?)'
  ).run(sourceId, sourceKey, 'synthetic-backup-digest-1001', measuredAt, measuredAt,
    'Fictional Scale Subject', 'verified', rawSnapshot, 'synthetic-mapping-1');
  const measurementId = Number(measurement.lastInsertRowid);
  app.database.prepare(
    'INSERT INTO normalized_body_metrics(measurement_id, mapping_version, metric_code, value, canonical_unit, source_field, verification_status, evidence) ' +
    'VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(measurementId, 'synthetic-mapping-1', 'body_weight', 111.2, 'kg', 'bhWeightKg', 'verified', 'Fictional device bench validation');
  const linked = await admin.request('/api/encounters/' + encounter.data.encounter.id + '/body-composition-links', {
    method: 'POST',
    json: { expectedVersion: saved.data.encounter.version, measurementId, isPrimary: true }
  });
  assert.equal(linked.status, 200);
  const completed = await admin.request('/api/encounters/' + encounter.data.encounter.id + '/complete', {
    method: 'POST',
    json: { expectedVersion: linked.data.encounterVersion, physicianUserId: doctor.data.user.id }
  });
  assert.equal(completed.status, 200);

  const reportHtml = Buffer.from('<html><body><h1>Fictional backup report</h1></body></html>');
  const createdAt = '2026-06-01T08:50:00.000Z';
  const asset = app.database.prepare(
    'INSERT INTO report_assets(patient_id, measurement_id, source_report_id, media_type, content, created_at) VALUES(?, ?, ?, ?, ?, ?)'
  ).run(patientId, measurementId, 'synthetic-report-1001', 'text/html; charset=utf-8', reportHtml, createdAt);
  const report = app.database.prepare(
    'INSERT INTO historical_reports(patient_id, measurement_id, asset_id, created_at, template_version, mapping_version, status, snapshot) ' +
    'VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(patientId, measurementId, Number(asset.lastInsertRowid), createdAt, 'synthetic-template-1',
    'synthetic-mapping-1', 'saved', JSON.stringify({ title: 'Fictional backup report' }));
  const reportId = Number(report.lastInsertRowid);
  app.database.prepare('INSERT INTO historical_report_measurements(report_id, measurement_id) VALUES(?, ?)')
    .run(reportId, measurementId);

  const backupResponse = await admin.request('/api/admin/backups', { method: 'POST' });
  assert.equal(backupResponse.status, 200);
  assert.match(backupResponse.response.headers.get('content-type'), /weight-management-tracker\.backup/);
  const archive = backupResponse.data;
  assert.equal(archive.subarray(0, 8).toString('ascii'), 'WMTBAK01');
  assert.equal(archive.toString('utf8').includes(fictionalPatient.mrn), false);
  const plaintext = decryptBackup(archive, app.config.backupPassphrase);
  assert.ok(plaintext.length > 0);

  const second = await admin.request('/api/patients', {
    method: 'POST',
    json: { mrn: '000TEST-002', name: 'Fictional Patient Two', phone: 'TEST-PHONE-002' }
  });
  assert.equal(second.status, 201);
  const replaceDatabase = app.server.manager.replaceFromSnapshot.bind(app.server.manager);
  let beginReplacement;
  let finishReplacement;
  const replacementStarted = new Promise((resolve) => { beginReplacement = resolve; });
  app.server.manager.replaceFromSnapshot = async (...args) => {
    await new Promise((resolve) => {
      finishReplacement = resolve;
      beginReplacement();
    });
    return replaceDatabase(...args);
  };
  const restoration = admin.request('/api/admin/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.weight-management-tracker.backup' },
    body: archive
  });
  await replacementStarted;
  const duringRestore = await admin.request('/api/patients');
  finishReplacement();
  const restored = await restoration;
  assert.equal(duringRestore.status, 503);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.restored, true);
  assert.equal((await admin.request('/api/auth/session')).status, 401);
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM patients').get().count, 1);
  const restoredEpisode = app.database.prepare('SELECT * FROM episodes WHERE patient_id = ?').get(patientId);
  assert.equal(restoredEpisode.id, episode.data.episode.id);
  assert.equal(restoredEpisode.baseline_encounter_id, encounter.data.encounter.id);
  const restoredEncounter = app.database.prepare('SELECT * FROM encounters WHERE id = ?').get(encounter.data.encounter.id);
  assert.equal(restoredEncounter.episode_id, restoredEpisode.id);
  assert.equal(restoredEncounter.status, 'completed');
  assert.equal(restoredEncounter.physician_user_id, doctor.data.user.id);
  assert.equal(restoredEncounter.weight_kg, 123.4);
  assert.deepEqual(JSON.parse(restoredEncounter.symptom_codes), ['nausea']);
  const restoredMeasurement = app.database.prepare(
    'SELECT m.patient_id, m.source_key, m.raw_snapshot, x.value, x.verification_status ' +
    'FROM body_composition_measurements m JOIN normalized_body_metrics x ON x.measurement_id = m.id ' +
    'WHERE m.id = ? AND x.metric_code = ?'
  ).get(measurementId, 'body_weight');
  assert.equal(restoredMeasurement.patient_id, patientId);
  assert.equal(restoredMeasurement.source_key, sourceKey);
  assert.match(restoredMeasurement.raw_snapshot, /synthetic-backup-reading-1001/);
  assert.equal(restoredMeasurement.value, 111.2);
  assert.equal(restoredMeasurement.verification_status, 'verified');
  assert.equal(app.database.prepare(
    'SELECT is_primary FROM encounter_body_composition_links WHERE encounter_id = ? AND measurement_id = ?'
  ).get(encounter.data.encounter.id, measurementId).is_primary, 1);
  assert.equal(app.database.prepare(
    'SELECT COUNT(*) AS count FROM historical_report_measurements WHERE report_id = ? AND measurement_id = ?'
  ).get(reportId, measurementId).count, 1);
  assert.ok(app.database.prepare(
    'SELECT id FROM audit_events WHERE entity_type = ? AND entity_id = ? AND action = ?'
  ).get('encounter', String(encounter.data.encounter.id), 'completed'));
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'restore_completed'").get().count, 1);

  const signedInAgain = app.client();
  await signedInAgain.login();
  const health = await signedInAgain.request('/api/body-composition/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.configured, false);
  const reportResponse = await signedInAgain.request('/api/reports/' + reportId);
  assert.equal(reportResponse.status, 200);
  assert.match(reportResponse.data.toString('utf8'), /Fictional backup report/);
  const bad = await signedInAgain.request('/api/admin/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.weight-management-tracker.backup' },
    body: Buffer.from('not an encrypted backup')
  });
  assert.notEqual(bad.status, 200);
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM patients').get().count, 1);
});

test('backup archive encryption rejects tampering and wrong keys', async () => {
  const database = await openDatabase(':memory:');
  try {
    const passphrase = 'Fictional-Backup-Passphrase-0123456789';
    const archive = await createEncryptedDatabaseBackup(database, passphrase);
    assert.throws(() => decryptBackup(archive, 'Wrong-Fictional-Passphrase-12345'));
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => decryptBackup(tampered, passphrase));
  } finally {
    database.close();
  }
});
