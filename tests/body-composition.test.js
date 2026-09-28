import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createUser } from '../src/identity/users.js';
import { createPatient, startEpisode, createEncounter, updateEncounter, getEncounter, bodyCompositionTrends, completeEncounter, reopenEncounter } from '../src/clinical.js';
import { createHoanboyAdapter, updateHoanboyMapping } from '../src/integrations/hoanboy/adapter.js';
import { assertBodyCompositionAdapter } from '../src/body-composition/contract.js';
import { linkMeasurement, unlinkMeasurement } from '../src/body-composition/workflow.js';
import { normalizeHoanboyRow, validateDeviceSnapshot } from '../src/integrations/hoanboy/normalizer.js';
import { HoanboyDeviceReader, validateDeviceAddress } from '../src/integrations/hoanboy/device-reader.js';

function syntheticSnapshot(records) {
  const columns = ['uid', 'username', 'time', 'bhWeightKg', 'bhBMI', 'bhBodyFatRate'];
  return {
    isSuccessful: true,
    isSelectQuery: true,
    tableInfos: columns.map((title) => ({ title, isPrimary: title === 'uid' })),
    rows: records.map((record) => columns.map((column) => ({ value: record[column] ?? null })))
  };
}

test('HOANBOY source validation and normalization preserve unverified values as non-trend data', () => {
  const payload = syntheticSnapshot([{
    uid: 'synthetic-reading-1001',
    username: 'Fictional Scale Subject',
    time: '2026-06-01 08:45:00',
    bhWeightKg: 111.2,
    bhBMI: 30.1,
    bhBodyFatRate: 32.5
  }]);
  const validated = validateDeviceSnapshot(payload);
  assert.equal(validated.records.length, 1);
  const metrics = normalizeHoanboyRow(validated.records[0], {});
  assert.equal(metrics.find((metric) => metric.metricCode === 'body_weight').value, 111.2);
  assert.equal(metrics.find((metric) => metric.metricCode === 'body_weight').status, 'unverified');
  assert.equal(metrics.find((metric) => metric.metricCode === 'bmi').status, 'unverified');
  assert.throws(() => validateDeviceAddress('8.8.8.8'));
  assert.throws(() => validateDeviceAddress('localhost'));
  assert.equal(validateDeviceAddress('192.168.50.10'), '192.168.50.10');
});

test('HOANBOY device reader uses read-only endpoints and verifies the source schema around retrieval', async () => {
  const calls = [];
  const payload = syntheticSnapshot([{
    uid: 'synthetic-reader-2001',
    username: 'Fictional Scale Subject',
    time: '2026-06-02 08:45:00',
    bhWeightKg: 110.2,
    bhBMI: 29.8,
    bhBodyFatRate: 31.9
  }]);
  const fetchImplementation = async (url, options) => {
    const requestUrl = new URL(url);
    calls.push({ url: requestUrl, options });
    const response = requestUrl.pathname === '/getTableList'
      ? { isSuccessful: true, rows: ['bodyparm'] }
      : payload;
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const reader = new HoanboyDeviceReader('192.168.50.10', fetchImplementation);
  const snapshot = await reader.synchronize();

  assert.equal(validateDeviceSnapshot(snapshot).records[0].uid, 'synthetic-reader-2001');
  assert.deepEqual(calls.map((call) => call.url.pathname), [
    '/getTableList', '/getAllDataFromTheTable', '/getAllDataFromTheTable'
  ]);
  assert.equal(calls[0].url.searchParams.get('database'), 'heer_scale.db');
  assert.equal(calls[1].url.searchParams.get('tableName'), 'bodyparm');
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
  }
});

test('adapter contract syncs and deduplicates source revisions, links repeats, and keeps device weight separate', async () => {
  const database = await openDatabase(':memory:');
  try {
    const doctor = await createUser(database, {
      username: 'fictional-doctor',
      displayName: 'Fictional Doctor',
      role: 'doctor',
      password: 'Fictional-Doctor-Password-123'
    });
    const patient = createPatient(database, {
      mrn: '000BC-TEST-001',
      name: 'Fictional Body Composition Patient',
      phone: 'TEST-PHONE-BC'
    }, doctor);
    startEpisode(database, patient.id, doctor);
    const encounter = createEncounter(database, patient.id, { occurredAt: '2026-06-01T09:00:00.000Z' }, doctor);
    const savedEncounter = updateEncounter(database, encounter.id, {
      expectedVersion: 1,
      weightKg: 150.4,
      waistCm: null,
      symptomCodes: []
    }, doctor);
    assert.equal(savedEncounter.weightKg, 150.4);

    let records = [
      {
        uid: 'synthetic-reading-1001',
        username: 'Fictional Scale Subject',
        time: '2026-06-01 08:45:00',
        bhWeightKg: 111.2,
        bhBMI: 30.1,
        bhBodyFatRate: 32.5
      },
      {
        uid: 'synthetic-reading-1002',
        username: 'Fictional Scale Subject',
        time: '2026-06-01 08:47:00',
        bhWeightKg: 110.8,
        bhBMI: 29.9,
        bhBodyFatRate: 32.1
      }
    ];
    const readerFactory = () => ({
      async health() { return { available: true }; },
      async synchronize() { return syntheticSnapshot(records); }
    });
    const adapter = createHoanboyAdapter(database, '192.168.50.10', readerFactory);
    assertBodyCompositionAdapter(adapter);
    assert.deepEqual(await adapter.health(), { available: true, configured: true });
    const firstSync = await adapter.synchronize();
    assert.deepEqual(firstSync, { status: 'success', added: 2, updated: 0, unchanged: 0, capturedAt: firstSync.capturedAt });
    assert.equal((await adapter.synchronize()).unchanged, 2);

    records = [
      { ...records[0], bhWeightKg: 111.1 },
      records[1]
    ];
    const changedSync = await adapter.synchronize();
    assert.equal(changedSync.updated, 1);
    assert.equal(changedSync.unchanged, 1);

    const mappingItems = [
      { metricCode: 'body_weight', sourceField: 'bhWeightKg', unit: 'kg', verified: true, evidence: 'Fictional bench validation WM-TEST-1' }
    ];
    const configuration = updateHoanboyMapping(database, mappingItems, doctor.id);
    assert.equal(configuration.mappings.find((item) => item.metricCode === 'body_weight').verified, true);
    assert.equal(configuration.mappings.find((item) => item.metricCode === 'bmi').verified, false);
    assert.throws(() => updateHoanboyMapping(database, [
      { metricCode: 'basal_metabolic_rate', sourceField: 'bhBMR', unit: 'unverified', verified: true, evidence: 'not enough' }
    ], doctor.id));

    const candidates = await adapter.listCandidates(patient.id);
    assert.equal(candidates.length, 3);
    const latestRevision = candidates.find((item) => item.sourceKey === 'synthetic-reading-1001');
    const repeat = candidates.find((item) => item.sourceKey === 'synthetic-reading-1002');
    assert.equal(latestRevision.metrics.find((item) => item.metricCode === 'body_weight').status, 'verified');
    assert.equal(latestRevision.metrics.find((item) => item.metricCode === 'bmi').status, 'unverified');

    const firstLink = linkMeasurement(database, encounter.id, {
      expectedVersion: savedEncounter.version,
      measurementId: latestRevision.id,
      isPrimary: true
    }, doctor);
    assert.equal((await adapter.listCandidates(patient.id)).some((item) => item.id === latestRevision.id), false);
    const otherEncounter = createEncounter(database, patient.id, { occurredAt: '2026-06-01T09:05:00.000Z' }, doctor);
    assert.throws(() => linkMeasurement(database, otherEncounter.id, {
      expectedVersion: 1,
      measurementId: latestRevision.id,
      isPrimary: true
    }, doctor), (error) => error.status === 409);
    const secondLink = linkMeasurement(database, encounter.id, {
      expectedVersion: firstLink.encounterVersion,
      measurementId: repeat.id,
      isPrimary: false
    }, doctor);
    assert.equal(secondLink.measurements.length, 2);
    assert.equal(secondLink.measurements.filter((measurement) => measurement.isPrimary).length, 1);
    const promoteRepeat = linkMeasurement(database, encounter.id, {
      expectedVersion: secondLink.encounterVersion,
      measurementId: repeat.id,
      isPrimary: true
    }, doctor);
    assert.equal(promoteRepeat.measurements.filter((measurement) => measurement.isPrimary).length, 1);
    assert.equal(promoteRepeat.measurements.find((measurement) => measurement.id === repeat.id).isPrimary, true);

    const trends = bodyCompositionTrends(database, patient.id);
    assert.deepEqual(trends.body_weight.points.map((point) => point.value), [110.8]);
    assert.equal(trends.bmi, undefined);
    assert.equal(getEncounter(database, encounter.id).weightKg, 150.4);
    const linkCount = database.prepare('SELECT COUNT(*) AS count FROM encounter_body_composition_links WHERE encounter_id = ?').get(encounter.id).count;
    assert.equal(linkCount, 2);

    const completed = completeEncounter(database, encounter.id, {
      expectedVersion: promoteRepeat.encounterVersion
    }, doctor);
    const reopened = reopenEncounter(database, encounter.id, {
      expectedVersion: completed.version,
      reason: 'Fictional body-composition correction'
    }, doctor);
    const nurse = await createUser(database, {
      username: 'fictional-nurse',
      displayName: 'Fictional Nurse',
      role: 'nurse_staff',
      password: 'Fictional-Nurse-Password-123'
    });
    assert.throws(() => linkMeasurement(database, encounter.id, {
      expectedVersion: reopened.version, measurementId: repeat.id, isPrimary: false
    }, nurse), (error) => error.status === 403);
    assert.throws(() => unlinkMeasurement(database, encounter.id, repeat.id, {
      expectedVersion: reopened.version
    }, nurse), (error) => error.status === 403);
  } finally {
    database.close();
  }
});
