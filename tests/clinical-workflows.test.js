import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, fictionalPatient, fictionalEncounterWeight, fictionalWaist } from './helpers.js';
import { verifyPassword } from '../src/identity/passwords.js';

test('authentication gates the Patient API and preserves MRN strings in search', async (t) => {
  const app = await startTestServer(t);
  const client = app.client();
  const page = await fetch(app.baseUrl + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Sign in with your authorized clinic account/);
  assert.equal((await fetch(app.baseUrl + '/clinic.sqlite')).status, 404);
  const denied = await client.request('/api/patients');
  assert.equal(denied.status, 401);

  const login = await client.login();
  assert.equal(login.status, 200);
  const setCookie = login.response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const stored = app.database.prepare('SELECT password_hash FROM users WHERE username = ?').get('fictional-admin');
  assert.notEqual(stored.password_hash, 'Fictional-Admin-Password-123');
  assert.equal(await verifyPassword('Fictional-Admin-Password-123', stored.password_hash), true);

  const created = await client.request('/api/patients', { method: 'POST', json: fictionalPatient });
  assert.equal(created.status, 201);
  assert.equal(created.data.patient.mrn, '000TEST-001');
  assert.equal((await client.request('/api/patients?q=000TEST-001')).data.patients[0].mrn, '000TEST-001');
  assert.equal((await client.request('/api/patients?q=Fictional')).data.patients.length, 1);
  assert.equal((await client.request('/api/patients?q=TEST-PHONE')).data.patients.length, 1);

  const duplicate = await client.request('/api/patients', { method: 'POST', json: { ...fictionalPatient, name: 'Fictional Patient Duplicate' } });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.data.error.message, /MRN/);

  const session = app.database.prepare("SELECT token_hash FROM sessions WHERE user_id = ? AND revoked_at IS NULL").get(login.data.user.id);
  assert.ok(session);
  const signedOut = await client.request('/api/auth/logout', { method: 'POST', json: {} });
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.ok(app.database.prepare('SELECT revoked_at FROM sessions WHERE token_hash = ?').get(session.token_hash).revoked_at);
  assert.equal((await client.request('/api/patients')).status, 401);
});

test('idle and absolute session expiry revoke stale sessions', async (t) => {
  const app = await startTestServer(t);
  const client = app.client();
  const firstLogin = await client.login();
  const idleBoundary = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  app.database.prepare('UPDATE sessions SET last_seen_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(idleBoundary, firstLogin.data.user.id);
  assert.equal((await client.request('/api/patients')).status, 401);
  assert.ok(app.database.prepare('SELECT revoked_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(firstLogin.data.user.id).revoked_at);

  const secondLogin = await client.login();
  app.database.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(new Date(Date.now() - 1000).toISOString(), secondLogin.data.user.id);
  assert.equal((await client.request('/api/patients')).status, 401);
  assert.ok(app.database.prepare('SELECT revoked_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(secondLogin.data.user.id).revoked_at);
});

test('Patient history stays side-effect free; Episodes and same-day Draft Encounters follow explicit actions', async (t) => {
  const app = await startTestServer(t);
  const client = app.client();
  await client.login();
  const patient = (await client.request('/api/patients', { method: 'POST', json: fictionalPatient })).data.patient;

  const opened = await client.request('/api/patients/' + patient.id);
  assert.equal(opened.status, 200);
  assert.equal(opened.data.episodes.length, 0);
  assert.equal(opened.data.encounters.length, 0);

  const missingEpisode = await client.request('/api/patients/' + patient.id + '/encounters', { method: 'POST', json: {} });
  assert.equal(missingEpisode.status, 409);
  const started = await client.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  assert.equal(started.status, 201);
  assert.equal(started.data.episode.baseline_encounter_id, null);
  const secondEpisode = await client.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  assert.equal(secondEpisode.status, 409);

  const first = await client.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-01T09:00:00.000Z' }
  });
  const second = await client.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-01T09:00:00.000Z' }
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.data.encounter.status, 'draft');
  assert.equal(first.data.encounter.weightKg, null);
  assert.notEqual(first.data.encounter.id, second.data.encounter.id);
  const encounterCreated = app.database.prepare(
    "SELECT actor_user_id, at FROM audit_events WHERE entity_type = 'encounter' AND entity_id = ? AND action = 'created'"
  ).get(String(first.data.encounter.id));
  assert.ok(encounterCreated.actor_user_id);
  assert.ok(encounterCreated.at);
  const creationAudit = (await client.request('/api/admin/audit')).data.events.find((event) =>
    event.entityType === 'encounter' && event.entityId === String(first.data.encounter.id) && event.action === 'created'
  );
  assert.equal(creationAudit.actor, 'Clinic administrator');
  assert.ok(creationAudit.at);

  const weightSave = await client.request('/api/encounters/' + first.data.encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 1, weightKg: fictionalEncounterWeight, waistCm: fictionalWaist, symptomCodes: [] }
  });
  assert.equal(weightSave.status, 200);
  assert.equal(weightSave.data.encounter.version, 2);
  const savedDraftDelete = await client.request('/api/encounters/' + first.data.encounter.id, {
    method: 'DELETE', json: { expectedVersion: 2 }
  });
  assert.equal(savedDraftDelete.status, 409);
  const secondWeight = await client.request('/api/encounters/' + second.data.encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 1, weightKg: 122.2, waistCm: null, symptomCodes: [] }
  });
  assert.equal(secondWeight.status, 200);
  const stale = await client.request('/api/encounters/' + first.data.encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 1, weightKg: 121, waistCm: null, symptomCodes: [] }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.details.currentVersion, 2);

  const invalidSymptoms = await client.request('/api/encounters/' + first.data.encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 2, symptomCodes: ['none', 'nausea'] }
  });
  assert.equal(invalidSymptoms.status, 400);

  const history = (await client.request('/api/patients/' + patient.id)).data;
  assert.equal(history.encounters.length, 2);
  assert.equal(history.activeEpisode.baselineWeightKg, fictionalEncounterWeight);
  assert.equal(history.activeEpisode.baselineWaistCm, fictionalWaist);
  assert.equal(history.activeEpisode.weightLossPercent, 0.97);
  const listPatient = (await client.request('/api/patients')).data.patients[0];
  assert.equal(listPatient.currentWeightKg, 122.2);
  assert.equal(listPatient.weightLossPercent, 0.97);
  assert.equal(listPatient.latestEncounterAt, second.data.encounter.occurredAt);
  assert.equal(listPatient.episodeStatus, 'active');
  const reopenedBrowser = app.client();
  await reopenedBrowser.login();
  const persistedDraft = await reopenedBrowser.request('/api/encounters/' + first.data.encounter.id);
  assert.equal(persistedDraft.data.encounter.weightKg, fictionalEncounterWeight);
  assert.equal(persistedDraft.data.encounter.waistCm, fictionalWaist);
  const baselineDoctorUser = await client.request('/api/admin/users', {
    method: 'POST',
    json: { username: 'fictional-baseline-doctor', displayName: 'Fictional Baseline Doctor', role: 'doctor', password: 'Fictional-Baseline-Doctor-123' }
  });
  assert.equal(baselineDoctorUser.status, 201);
  const baselineDoctor = app.client();
  await baselineDoctor.login('fictional-baseline-doctor', 'Fictional-Baseline-Doctor-123');

  const closed = await client.request('/api/episodes/' + started.data.episode.id + '/close', {
    method: 'POST', json: { reason: 'goal_achieved' }
  });
  assert.equal(closed.status, 200);
  const reassigned = await baselineDoctor.request('/api/episodes/' + started.data.episode.id + '/baseline', {
    method: 'PUT', json: { encounterId: second.data.encounter.id }
  });
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.data.episode.baseline_encounter_id, second.data.encounter.id);
  const closedHistory = (await client.request('/api/patients/' + patient.id)).data;
  assert.equal(closedHistory.episodes[0].baselineWeightKg, 122.2);
  assert.equal(closedHistory.episodes[0].weightLossPercent, 0);
  assert.equal((await client.request('/api/patients')).data.patients[0].weightLossPercent, null);
  const returnedEpisode = await baselineDoctor.request('/api/patients/' + patient.id + '/episodes', {
    method: 'POST', json: {}
  });
  assert.equal(returnedEpisode.status, 201);
  assert.equal(returnedEpisode.data.episode.baseline_encounter_id, null);
  const emptyDraft = await baselineDoctor.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: {}
  });
  assert.equal(emptyDraft.status, 201);
  const discarded = await baselineDoctor.request('/api/encounters/' + emptyDraft.data.encounter.id, {
    method: 'DELETE', json: { expectedVersion: 1 }
  });
  assert.equal(discarded.status, 200);
  assert.equal(app.database.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'encounter' AND entity_id = ?"
  ).get(String(emptyDraft.data.encounter.id)).count, 0);
});

test('Other symptom text is saved as an optional Encounter note and clears when removed', async (t) => {
  const app = await startTestServer(t);
  const doctor = app.client();
  await doctor.login();
  const patient = (await doctor.request('/api/patients', { method: 'POST', json: fictionalPatient })).data.patient;
  await doctor.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  const encounter = (await doctor.request('/api/patients/' + patient.id + '/encounters', { method: 'POST', json: {} })).data.encounter;
  const other = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 1, symptomCodes: ['other'], symptomOtherText: 'Fictional symptom note' }
  });
  assert.deepEqual(other.data.encounter.symptoms, ['other']);
  assert.equal(other.data.encounter.symptomOtherText, 'Fictional symptom note');
  const replaced = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 2, symptomCodes: ['nausea'] }
  });
  assert.deepEqual(replaced.data.encounter.symptoms, ['nausea']);
  assert.equal(replaced.data.encounter.symptomOtherText, '');
});

test('correcting away a baseline weight reselects the earliest remaining weight and audits the change', async (t) => {
  const app = await startTestServer(t);
  const admin = app.client();
  await admin.login();
  const patient = (await admin.request('/api/patients', { method: 'POST', json: fictionalPatient })).data.patient;
  await admin.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  const first = (await admin.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-05T09:00:00.000Z' }
  })).data.encounter;
  const second = (await admin.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-06T09:00:00.000Z' }
  })).data.encounter;
  const firstWeight = await admin.request('/api/encounters/' + first.id, {
    method: 'PATCH', json: { expectedVersion: 1, weightKg: 123.4, waistCm: null, symptomCodes: [] }
  });
  await admin.request('/api/encounters/' + second.id, {
    method: 'PATCH', json: { expectedVersion: 1, weightKg: 122.2, waistCm: null, symptomCodes: [] }
  });
  assert.equal((await admin.request('/api/patients/' + patient.id)).data.activeEpisode.baselineEncounterId, first.id);

  const doctor = await admin.request('/api/admin/users', {
    method: 'POST',
    json: { username: 'fictional-baseline-correction', displayName: 'Fictional Baseline Doctor', role: 'doctor', password: 'Fictional-Baseline-Doctor-123' }
  });
  const completed = await admin.request('/api/encounters/' + first.id + '/complete', {
    method: 'POST', json: { expectedVersion: firstWeight.data.encounter.version, physicianUserId: doctor.data.user.id }
  });
  const reopened = await admin.request('/api/encounters/' + first.id + '/reopen', {
    method: 'POST', json: { expectedVersion: completed.data.encounter.version, reason: 'Fictional weight correction' }
  });
  const corrected = await admin.request('/api/encounters/' + first.id, {
    method: 'PATCH',
    json: { expectedVersion: reopened.data.encounter.version, weightKg: null, waistCm: null, symptomCodes: [] }
  });
  assert.equal(corrected.status, 200);

  const history = (await admin.request('/api/patients/' + patient.id)).data;
  assert.equal(history.activeEpisode.baselineEncounterId, second.id);
  assert.equal(history.activeEpisode.baselineWeightKg, 122.2);
  const correction = app.database.prepare(
    "SELECT before_snapshot, after_snapshot FROM audit_events WHERE entity_type = 'encounter' AND entity_id = ? AND action = 'corrected'"
  ).get(String(first.id));
  assert.equal(JSON.parse(correction.before_snapshot).episodeBaselineEncounterId, first.id);
  assert.equal(JSON.parse(correction.after_snapshot).episodeBaselineEncounterId, second.id);
});

test('symptom exclusivity, completion, reopening, correction audit and stale correction checks work', async (t) => {
  const app = await startTestServer(t);
  const admin = app.client();
  await admin.login();
  assert.equal((await admin.request('/api/admin/users')).status, 200);
  assert.equal((await admin.request('/api/admin/audit')).status, 200);
  const doctorCreate = await admin.request('/api/admin/users', {
    method: 'POST',
    json: { username: 'fictional-doctor', displayName: 'Fictional Doctor', role: 'doctor', password: 'Fictional-Doctor-Password-123' }
  });
  assert.equal(doctorCreate.status, 201);
  const doctor = app.client();
  await doctor.login('fictional-doctor', 'Fictional-Doctor-Password-123');
  const doctorMeta = await doctor.request('/api/meta');
  assert.equal(doctorMeta.data.permissions.canAdminister, false);
  assert.equal((await doctor.request('/api/admin/users')).status, 403);
  assert.equal((await doctor.request('/api/admin/audit')).status, 403);
  assert.equal((await doctor.request('/api/admin/config')).status, 403);
  const patient = (await doctor.request('/api/patients', { method: 'POST', json: fictionalPatient })).data.patient;
  await doctor.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  const encounter = (await doctor.request('/api/patients/' + patient.id + '/encounters', { method: 'POST', json: {} })).data.encounter;

  const none = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH', json: { expectedVersion: 1, symptomCodes: ['none'], symptomOtherText: '' }
  });
  assert.deepEqual(none.data.encounter.symptoms, ['none']);
  const symptom = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH', json: { expectedVersion: 2, symptomCodes: ['nausea'], symptomOtherText: '' }
  });
  assert.deepEqual(symptom.data.encounter.symptoms, ['nausea']);
  assert.equal(symptom.data.encounter.symptomOtherText, '');

  const completed = await doctor.request('/api/encounters/' + encounter.id + '/complete', {
    method: 'POST', json: { expectedVersion: 3 }
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.encounter.status, 'completed');
  assert.equal(completed.data.encounter.physicianUserId, doctorCreate.data.user.id);
  assert.ok(completed.data.encounter.completedAt);
  assert.ok(completed.data.encounter.completedBy);

  const directEdit = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH', json: { expectedVersion: 4, weightKg: 130, waistCm: null, symptomCodes: ['nausea'] }
  });
  assert.equal(directEdit.status, 409);
  const reopened = await doctor.request('/api/encounters/' + encounter.id + '/reopen', {
    method: 'POST', json: { expectedVersion: 4, reason: 'Fictional correction reason' }
  });
  assert.equal(reopened.status, 200);
  const nurseCreate = await admin.request('/api/admin/users', {
    method: 'POST',
    json: { username: 'fictional-nurse', displayName: 'Fictional Nurse', role: 'nurse_staff', password: 'Fictional-Nurse-Password-123' }
  });
  const nurse = app.client();
  await nurse.login('fictional-nurse', 'Fictional-Nurse-Password-123');
  const nurseCorrection = await nurse.request('/api/encounters/' + encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 5, weightKg: 130, waistCm: null, symptomCodes: ['nausea'] }
  });
  assert.equal(nurseCorrection.status, 403);
  const corrected = await doctor.request('/api/encounters/' + encounter.id, {
    method: 'PATCH',
    json: { expectedVersion: 5, weightKg: fictionalEncounterWeight, waistCm: fictionalWaist, symptomCodes: ['nausea'] }
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.encounter.version, 6);
  const stale = await doctor.request('/api/encounters/' + encounter.id + '/complete', {
    method: 'POST', json: { expectedVersion: 5 }
  });
  assert.equal(stale.status, 409);

  const events = (await admin.request('/api/admin/audit?limit=50')).data.events;
  const correction = events.find((event) => event.action === 'corrected' && event.entityId === String(encounter.id));
  assert.ok(correction);
  assert.equal(correction.actor, 'Fictional Doctor');
  assert.equal(correction.before.weightKg, null);
  assert.equal(correction.after.weightKg, fictionalEncounterWeight);
  assert.equal(correction.reason, null);

  const nurseView = await nurse.request('/api/patients/' + patient.id);
  assert.equal(nurseView.status, 200);
  const nurseCreatedPatient = await nurse.request('/api/patients', {
    method: 'POST',
    json: { mrn: '000TEST-NURSE-001', name: 'Fictional Nurse Created Patient', phone: 'TEST-PHONE-NURSE' }
  });
  assert.equal(nurseCreatedPatient.status, 201);
  const nurseBaselineChange = await nurse.request('/api/episodes/1/baseline', {
    method: 'PUT', json: { encounterId: 1 }
  });
  assert.equal(nurseBaselineChange.status, 403);
  const nurseComplete = await nurse.request('/api/encounters/' + encounter.id + '/complete', {
    method: 'POST', json: { expectedVersion: 6 }
  });
  assert.equal(nurseComplete.status, 403);
  const disabled = await admin.request('/api/admin/users/' + nurseCreate.data.user.id, {
    method: 'PATCH', json: { active: false }
  });
  assert.equal(disabled.status, 200);
  assert.equal((await nurse.request('/api/patients')).status, 401);
  const changedRole = await admin.request('/api/admin/users/' + doctorCreate.data.user.id, {
    method: 'PATCH', json: { role: 'nurse_staff' }
  });
  assert.equal(changedRole.status, 200);
  assert.equal((await doctor.request('/api/patients')).status, 401);
  const signedInWithNewRole = app.client();
  await signedInWithNewRole.login('fictional-doctor', 'Fictional-Doctor-Password-123');
  assert.equal((await signedInWithNewRole.request('/api/encounters/' + encounter.id + '/regimen', {
    method: 'PUT', json: { expectedVersion: 6, changeType: 'no_medication', items: [] }
  })).status, 403);
});

test('medication roles, presets, residual doses and Continue copy are enforced', async (t) => {
  const app = await startTestServer(t);
  const admin = app.client();
  await admin.login();
  const users = await Promise.all([
    admin.request('/api/admin/users', {
      method: 'POST',
      json: { username: 'fictional-doctor', displayName: 'Fictional Doctor', role: 'doctor', password: 'Fictional-Doctor-Password-123' }
    }),
    admin.request('/api/admin/users', {
      method: 'POST',
      json: { username: 'fictional-nurse', displayName: 'Fictional Nurse', role: 'nurse_staff', password: 'Fictional-Nurse-Password-123' }
    })
  ]);
  const doctor = app.client();
  const nurse = app.client();
  await doctor.login('fictional-doctor', 'Fictional-Doctor-Password-123');
  await nurse.login('fictional-nurse', 'Fictional-Nurse-Password-123');
  const patient = (await doctor.request('/api/patients', { method: 'POST', json: fictionalPatient })).data.patient;
  await doctor.request('/api/patients/' + patient.id + '/episodes', { method: 'POST', json: {} });
  const first = (await doctor.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-02T09:00:00.000Z' }
  })).data.encounter;

  const unauthorizedRegimen = await nurse.request('/api/encounters/' + first.id + '/regimen', {
    method: 'PUT', json: { expectedVersion: 1, changeType: 'increase', items: [] }
  });
  assert.equal(unauthorizedRegimen.status, 403);

  const invalidPreset = await doctor.request('/api/encounters/' + first.id + '/regimen', {
    method: 'PUT',
    json: { expectedVersion: 1, changeType: 'increase', items: [{ medicationCode: 'mounjaro', doseMg: 3, residualDose: false }] }
  });
  assert.equal(invalidPreset.status, 400);
  const invalidResidual = await doctor.request('/api/encounters/' + first.id + '/regimen', {
    method: 'PUT',
    json: { expectedVersion: 1, changeType: 'increase', items: [{ medicationCode: 'wegovy', doseMg: 0, residualDose: true }] }
  });
  assert.equal(invalidResidual.status, 400);
  const booleanDose = await doctor.request('/api/encounters/' + first.id + '/regimen', {
    method: 'PUT',
    json: { expectedVersion: 1, changeType: 'increase', items: [{ medicationCode: 'mounjaro', doseMg: true }] }
  });
  assert.equal(booleanDose.status, 400);

  const regimen = await doctor.request('/api/encounters/' + first.id + '/regimen', {
    method: 'PUT',
    json: {
      expectedVersion: 1,
      changeType: 'increase',
      items: [
        { medicationCode: 'mounjaro', doseMg: 7.5, residualDose: false },
        { medicationCode: 'wegovy', doseMg: 1234.5, residualDose: true }
      ]
    }
  });
  assert.equal(regimen.status, 200);
  assert.equal(regimen.data.encounter.medications.length, 2);
  assert.equal(regimen.data.encounter.medications[0].route, 'SC');
  assert.equal(regimen.data.encounter.medications[0].frequency, 'weekly');
  assert.equal(regimen.data.encounter.medications[0].quantity, '1 pen');
  assert.equal(regimen.data.encounter.medications[1].doseMg, 1234.5);
  assert.equal(regimen.data.encounter.medications[1].residualDose, true);

  const done = await doctor.request('/api/encounters/' + first.id + '/complete', {
    method: 'POST', json: { expectedVersion: 2 }
  });
  assert.equal(done.status, 200);
  const second = (await doctor.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-03T09:00:00.000Z' }
  })).data.encounter;
  const unsupportedContinue = await doctor.request('/api/encounters/' + second.id + '/regimen', {
    method: 'PUT', json: { expectedVersion: 1, changeType: 'continue', items: [] }
  });
  assert.equal(unsupportedContinue.status, 400);
  const continued = await doctor.request('/api/encounters/' + second.id + '/regimen/continue', {
    method: 'POST', json: { expectedVersion: 1 }
  });
  assert.equal(continued.status, 200);
  assert.equal(continued.data.copiedFromEncounterId, first.id);
  assert.equal(continued.data.encounter.treatmentChange, 'continue');
  assert.deepEqual(continued.data.encounter.medications.map((item) => [item.medicationCode, item.doseMg]), [
    ['mounjaro', 7.5], ['wegovy', 1234.5]
  ]);
  const completedSecond = await doctor.request('/api/encounters/' + second.id + '/complete', {
    method: 'POST', json: { expectedVersion: 2 }
  });
  assert.equal(completedSecond.status, 200);
  const reopenedSecond = await doctor.request('/api/encounters/' + second.id + '/reopen', {
    method: 'POST', json: { expectedVersion: 3, reason: 'Fictional regimen correction' }
  });
  assert.equal(reopenedSecond.status, 200);
  const paused = await doctor.request('/api/encounters/' + second.id + '/regimen', {
    method: 'PUT', json: { expectedVersion: 4, changeType: 'pause', items: [] }
  });
  assert.equal(paused.status, 200);
  assert.equal(paused.data.encounter.treatmentChange, 'pause');
  assert.equal(paused.data.encounter.medications.length, 0);
  const regimenAudit = app.database.prepare(
    "SELECT before_snapshot, after_snapshot FROM audit_events WHERE entity_id = ? AND action = 'regimen_corrected'"
  ).get(String(second.id));
  assert.equal(JSON.parse(regimenAudit.before_snapshot).medications.length, 2);
  assert.equal(JSON.parse(regimenAudit.after_snapshot).medications.length, 0);

  const third = (await doctor.request('/api/patients/' + patient.id + '/encounters', {
    method: 'POST', json: { occurredAt: '2026-05-04T09:00:00.000Z' }
  })).data.encounter;
  const noMedication = await doctor.request('/api/encounters/' + third.id + '/regimen', {
    method: 'PUT', json: { expectedVersion: 1, changeType: 'no_medication', items: [] }
  });
  assert.equal(noMedication.status, 200);
  assert.equal(noMedication.data.encounter.treatmentChange, 'no_medication');
  assert.equal(noMedication.data.encounter.medications.length, 0);
  const nurseHistory = await nurse.request('/api/patients/' + patient.id);
  assert.equal(nurseHistory.data.medicationTimeline.find((entry) => entry.encounterId === first.id).medications.length, 2);
  assert.equal(users.length, 2);
});
