const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const listView = document.getElementById('patient-list-view');
const patientView = document.getElementById('patient-view');
const adminView = document.getElementById('admin-view');
const notice = document.getElementById('notice');

const state = {
  user: null,
  meta: null,
  doctors: [],
  patient: null,
  encounters: new Map(),
  dirtyEncounters: new Set(),
  dirtyRegimens: new Set(),
  conflictedEncounters: new Set(),
  saveTimers: new Map(),
  regimenTimers: new Map(),
  saveQueues: new Map(),
  pendingWrites: new Set(),
  candidates: new Map(),
  adminSection: 'users',
  lastListSearch: ''
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value, includeTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return escapeHtml(value);
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}

function displayNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function setNotice(message, type = 'ok') {
  notice.textContent = message;
  notice.hidden = !message;
  notice.className = 'notice' + (type === 'error' ? ' error' : type === 'warn' ? ' warn' : '');
  if (message) window.setTimeout(() => {
    if (notice.textContent === message) notice.hidden = true;
  }, 6000);
}

async function api(path, options = {}) {
  const request = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (options.json !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.json);
    delete request.json;
  }
  const response = await fetch(path, request);
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const body = await response.json();
      message = body.error?.message || message;
      const error = new Error(message);
      error.status = response.status;
      error.details = body.error?.details;
      throw error;
    } catch (error) {
      if (error instanceof Error && error.status) throw error;
      const wrapped = new Error(message);
      wrapped.status = response.status;
      throw wrapped;
    }
  }
  if (options.responseType === 'blob') return response.blob();
  if (contentType.includes('application/json')) return response.json();
  return response.arrayBuffer();
}

function showLogin(message = '') {
  state.user = null;
  appView.hidden = true;
  loginView.hidden = false;
  document.getElementById('login-error').textContent = message;
  document.querySelector('#login-form [name="password"]').value = '';
  document.querySelector('#login-form [name="username"]').focus();
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  document.getElementById('signed-in-user').textContent = state.user.displayName + ' · ' + roleLabel(state.user.role);
  document.getElementById('admin-nav').hidden = !state.meta.permissions.canAdminister;
}

function roleLabel(role) {
  return state.meta?.roles.find((item) => item.value === role)?.label || role;
}

async function initialize() {
  try {
    const session = await api('/api/auth/session');
    state.user = session.user;
  } catch {
    showLogin();
    return;
  }
  try {
    const [meta, doctorResult] = await Promise.all([api('/api/meta'), api('/api/doctors')]);
    state.meta = meta;
    state.doctors = doctorResult.doctors;
    showApp();
    await showPatientList();
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function showPatientList(search = '') {
  state.lastListSearch = search;
  listView.hidden = false;
  patientView.hidden = true;
  adminView.hidden = true;
  const result = await api('/api/patients?q=' + encodeURIComponent(search));
  listView.innerHTML = renderPatientList(result.patients, search);
}

function renderPatientList(patients, search) {
  const rows = patients.map((patient) => (
    '<tr>' +
      '<td><button class="link-button" data-action="open-patient" data-id="' + patient.id + '">' + escapeHtml(patient.mrn) + '</button></td>' +
      '<td><button class="link-button" data-action="open-patient" data-id="' + patient.id + '">' + escapeHtml(patient.name) + '</button></td>' +
      '<td>' + escapeHtml(patient.phone || '—') + '</td>' +
      '<td>' + (patient.currentWeightKg == null ? '—' : displayNumber(patient.currentWeightKg) + ' kg') + '</td>' +
      '<td>' + (patient.weightLossPercent == null ? '—' : displayNumber(patient.weightLossPercent) + '%') + '</td>' +
      '<td>' + escapeHtml(formatDate(patient.latestEncounterAt)) + '</td>' +
      '<td>' + (patient.episodeStatus ? statusBadge(patient.episodeStatus) : '<span class="badge">No Episode</span>') + '</td>' +
    '</tr>'
  )).join('');
  return '<div class="page-header"><div><p class="eyebrow">Patient registry</p><h1>Patients</h1><p>Search the longitudinal clinic list by MRN, name or phone.</p></div>' +
    '<div class="actions"><button class="primary" data-action="new-patient">Add Patient</button></div></div>' +
    '<section class="panel"><div class="toolbar"><label>Search<input id="patient-search" type="search" value="' + escapeHtml(search) + '" placeholder="MRN, name or phone" autocomplete="off"></label>' +
    '<button data-action="refresh-list">Refresh</button></div>' +
    (patients.length ? '<div class="table-wrap"><table><thead><tr><th>MRN</th><th>Name</th><th>Phone</th><th>Current weight</th><th>Episode loss</th><th>Last Encounter</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
      '<div class="empty">' + (search ? 'No Patients match this search.' : 'No Patients yet. Add the first Patient to begin.') + '</div>') +
    '</section>';
}

function statusBadge(status) {
  const label = status === 'active' ? 'Active' : status === 'closed' ? 'Closed' :
    status === 'draft' ? 'Draft' : status === 'completed' ? 'Completed' : 'Reopened / corrected';
  return '<span class="badge ' + escapeHtml(status) + '">' + label + '</span>';
}

async function flushPendingSaves() {
  while (true) {
    for (const [id, timer] of [...state.saveTimers]) {
      window.clearTimeout(timer);
      state.saveTimers.delete(id);
      queueDraftSave(id);
    }
    for (const [id, timer] of [...state.regimenTimers]) {
      window.clearTimeout(timer);
      state.regimenTimers.delete(id);
      queueRegimenSave(id);
    }
    const pending = [...state.pendingWrites].map((id) => state.saveQueues.get(id)).filter(Boolean);
    if (pending.length) await Promise.all(pending.map((promise) => promise.catch(() => null)));
    if (!state.saveTimers.size && !state.regimenTimers.size && !state.pendingWrites.size) break;
  }
  if (state.dirtyEncounters.size || state.dirtyRegimens.size) {
    throw new Error('Encounter changes are not saved. Retry the save or reload after resolving the conflict before leaving this Patient.');
  }
}

async function openPatient(patientId) {
  await flushPendingSaves();
  const data = await api('/api/patients/' + patientId);
  state.patient = data;
  state.encounters = new Map(data.encounters.map((encounter) => [encounter.id, encounter]));
  listView.hidden = true;
  adminView.hidden = true;
  patientView.hidden = false;
  patientView.innerHTML = renderPatient(data);
  drawPatientCharts(data);
}

function metricCard(label, value, suffix = '') {
  return '<div class="metric-card"><span>' + escapeHtml(label) + '</span><strong>' +
    escapeHtml(value === null || value === undefined ? '—' : displayNumber(value)) +
    (value === null || value === undefined ? '' : '<small> ' + escapeHtml(suffix) + '</small>') + '</strong></div>';
}

function renderPatient(data) {
  const patient = data.patient;
  const active = data.activeEpisode;
  const episodeActions = active
    ? '<button data-action="new-encounter" data-id="' + patient.id + '">New Encounter</button>' +
      (state.meta.permissions.canManageEpisodes ? '<button class="danger" data-action="close-episode" data-id="' + active.id + '">End Episode</button>' : '')
    : (state.meta.permissions.canManageEpisodes ? '<button class="primary" data-action="start-episode" data-id="' + patient.id + '">Start Episode</button>' : '');
  const summary = active
    ? '<div class="metric-grid">' +
      metricCard('Baseline weight', active.baselineWeightKg, 'kg') +
      metricCard('Current Encounter weight', active.currentWeightKg, 'kg') +
      metricCard('Change from baseline', active.changeKg, 'kg') +
      metricCard('Weight loss', active.weightLossPercent, '%') +
      metricCard('Baseline waist', active.baselineWaistCm, 'cm') +
      metricCard('Current waist', active.currentWaistCm, 'cm') +
      '</div>' +
      '<div class="grid two summary-trends">' +
        trendPanel('Encounter weight', 'kg', active.weightTrend, 'weight-' + active.id) +
        trendPanel('Waist circumference', 'cm', active.waistTrend, 'waist-' + active.id) +
      '</div>'
    : '<div class="empty">No active Weight-loss Episode. Historical Encounters remain available below.</div>';

  const episodes = data.episodes.map((episode) => renderEpisode(episode)).join('');
  const encounters = data.encounters.map((encounter) => renderEncounter(encounter)).join('');

  const bodyTrends = Object.entries(data.bodyComposition.trends).map(([code, series]) =>
    trendPanel(metricLabel(code), series.unit, series.points.map((point) => ({ at: point.at, value: point.value })), 'bc-' + safeId(code))
  ).join('');
  const bodyMeasurements = data.bodyComposition.measurements.map((measurement) => (
    '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(measurement.measuredAt)) + '</strong> · ' +
    escapeHtml(measurement.source) + (measurement.isPrimary ? ' · <span class="badge primary-badge">Primary</span>' : '') +
    '<div class="candidate-metrics">' + escapeHtml(metricsSummary(measurement.metrics)) + '</div></div>' +
    '<button class="small" data-action="measurement-details" data-id="' + measurement.id + '">Details</button></div>'
  )).join('');
  const reports = data.bodyComposition.reports.map((report) => (
    '<details class="report-row"><summary>Historical report · ' + escapeHtml(formatDate(report.createdAt)) + ' · ' +
    escapeHtml(report.templateVersion) + '</summary><iframe class="report-frame" sandbox src="/api/reports/' + report.id + '" title="Historical body-composition report"></iframe></details>'
  )).join('');

  return '<div class="page-header"><div><div class="actions"><button class="small" data-action="home">← Patient list</button><button class="small" data-action="refresh-patient" data-id="' + patient.id + '">Refresh history</button></div>' +
    '<p class="eyebrow">Patient · ' + escapeHtml(patient.mrn) + '</p><h1>' + escapeHtml(patient.name) + '</h1><p>' + escapeHtml(patient.phone || 'No phone recorded') + '</p></div>' +
    '<div class="actions">' + episodeActions + '</div></div>' +
    '<section class="panel"><div class="panel-heading"><div><h2>Active Episode summary</h2><p class="muted">Progress uses Encounter weight and the selected baseline.</p></div></div>' +
    summary + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>Encounter history</h2><p class="muted">Opening this Patient does not create an Encounter.</p></div></div>' +
    (encounters || '<div class="empty">No Encounters have been recorded.</div>') + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>Medication timeline</h2><p class="muted">Clinician-selected regimen tracking · HIS remains the official medication order.</p></div></div>' +
    '<div id="medication-timeline-content">' + renderMedicationTimeline(data.medicationTimeline) + '</div></section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>Body-composition history</h2><p class="muted">Default trends include verified metrics from Primary linked measurements only.</p></div>' +
    (state.meta.permissions.canLinkBodyComposition ? '<button data-action="sync-device">Sync HOANBOY 370</button>' : '') + '</div>' +
    (bodyTrends ? '<div class="trend-grid">' + bodyTrends + '</div>' : '<div class="empty">No verified Primary body-composition trends are available.</div>') +
    '<h3>Measurements</h3>' + (bodyMeasurements || '<p class="muted">No linked or archived measurements for this Patient.</p>') +
    '<div id="device-candidates" class="stack"></div>' +
    '<h3>Historical reports</h3>' + (reports || '<p class="muted">No saved historical reports are available.</p>') + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>Weight-loss Episodes</h2><p class="muted">Closed periods remain available as history.</p></div></div>' +
    (episodes || '<div class="empty">No Episodes have been recorded.</div>') + '</section>';
}

function renderMedicationTimeline(entries) {
  const rows = entries.map((entry) => {
    const items = entry.medications.length
      ? entry.medications.map((item) => escapeHtml(item.medicationName) + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? ' (residual dose)' : '')).join(', ')
      : 'No medication items';
    return '<tr><td>' + escapeHtml(formatDate(entry.occurredAt)) + '</td><td>' + treatmentLabel(entry.treatmentChange) + '</td><td>' + items + '</td></tr>';
  }).join('');
  return rows
    ? '<div class="table-wrap"><table><thead><tr><th>Encounter</th><th>Change type</th><th>Medication and dose</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty">No medication regimen has been recorded.</div>';
}

function renderEpisode(episode) {
  const weightedEncounters = episode.encounters.filter((encounter) => encounter.weightKg !== null);
  const baselineOptions = weightedEncounters.map((encounter) =>
    '<option value="' + encounter.id + '" ' + (encounter.id === episode.baselineEncounterId ? 'selected' : '') + '>' +
    escapeHtml(formatDate(encounter.occurredAt)) + ' · ' + displayNumber(encounter.weightKg) + ' kg</option>').join('');
  const baselineControl = state.meta.permissions.canManageEpisodes
    ? (baselineOptions
      ? '<label class="baseline-picker">Baseline Encounter weight<select data-baseline-select data-episode-id="' + episode.id + '">' + baselineOptions + '</select></label>'
      : '<p class="muted">Baseline will be set when this Episode has a valid Encounter weight.</p>')
    : '';
  return '<details class="encounter-card"><summary><span>' + statusBadge(episode.status) + ' <strong>Episode ' + episode.id + '</strong> · ' +
    escapeHtml(formatDate(episode.startedAt, false)) + (episode.endedAt ? ' – ' + escapeHtml(formatDate(episode.endedAt, false)) : '') +
    '</span><span class="muted">' + (episode.closureReason ? escapeHtml(closureLabel(episode.closureReason)) : '') + '</span></summary>' +
    '<div class="encounter-content"><div class="metric-grid">' +
    metricCard('Baseline weight', episode.baselineWeightKg, 'kg') +
    metricCard('Current weight', episode.currentWeightKg, 'kg') +
    metricCard('Change', episode.changeKg, 'kg') +
    metricCard('Weight loss', episode.weightLossPercent, '%') +
    metricCard('Baseline waist', episode.baselineWaistCm, 'cm') +
    metricCard('Current waist', episode.currentWaistCm, 'cm') + '</div>' + baselineControl + '</div></details>';
}

function renderEncounter(encounter) {
  const editable = encounter.status === 'draft' ||
    (encounter.status === 'reopened' && state.meta.permissions.canCorrectEncounters);
  const status = statusBadge(encounter.status);
  const symptoms = symptomLabels(encounter.symptoms).join(', ') || 'No symptoms recorded';
  const medications = encounter.medications.length
    ? encounter.medications.map((item) => escapeHtml(item.medicationName) + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? ' · residual dose' : '')).join(', ')
    : 'No medication items';
  const editForm = editable ? renderEncounterEditor(encounter) :
    (encounter.status === 'reopened'
      ? '<div class="muted-box">A doctor or administrator must make corrections to this reopened Encounter.</div>'
      : '<div class="muted-box">This Encounter is complete. Reopen it through the correction workflow before changing clinical details.</div>');
  const controls = editable
    ? (state.meta.permissions.canCompleteEncounters
      ? '<div class="actions"><button class="primary" data-action="complete-encounter" data-id="' + encounter.id + '">Complete Encounter</button>' +
        (state.user.role === 'admin' ? renderPhysicianSelect(encounter) : '') + '</div>' : '') +
      (encounter.status === 'draft' ? '<button class="danger small" data-action="delete-empty-draft" data-id="' + encounter.id + '">Discard empty Draft</button>' : '')
    : (state.meta.permissions.canCorrectEncounters
      ? '<button class="small" data-action="reopen-encounter" data-id="' + encounter.id + '">Reopen for correction</button>' : '');
  const linkedMeasurements = encounter.bodyComposition.map((measurement) =>
    '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(measurement.measuredAt)) + '</strong> · device reading ' +
    (measurement.isPrimary ? '<span class="badge active">Primary</span>' : '<span class="badge">Repeat</span>') +
    '</div><div class="actions">' + (editable && !measurement.isPrimary
      ? '<button class="small" data-action="make-primary" data-encounter-id="' + encounter.id + '" data-id="' + measurement.id + '">Make primary</button>' : '') +
      (editable ? '<button class="small danger" data-action="unlink-measurement" data-encounter-id="' + encounter.id + '" data-id="' + measurement.id + '">Unlink</button>' : '') +
    '</div></div>'
  ).join('');
  return '<details class="encounter-card" data-encounter-card="' + encounter.id + '"><summary><span><strong>' +
    escapeHtml(formatDate(encounter.occurredAt)) + '</strong> · ' + status + '</span><span>' +
    (encounter.weightKg === null ? 'No Encounter weight' : displayNumber(encounter.weightKg) + ' kg') + ' · ' +
    escapeHtml(encounter.physicianName || 'Physician not recorded') + '</span></summary>' +
    '<div class="encounter-content"><div class="actions"><span class="muted">Version ' + encounter.version + '</span>' +
    '<div class="save-status" id="save-status-' + encounter.id + '" aria-live="polite"></div></div>' +
    '<div class="grid two"><div><p class="section-label">Symptoms</p><p>' + escapeHtml(symptoms) +
    (encounter.symptomOtherText ? ' · ' + escapeHtml(encounter.symptomOtherText) : '') + '</p></div>' +
    '<div><p class="section-label">Medication record</p><p data-regimen-summary>' + escapeHtml(encounter.treatmentChange ? treatmentLabel(encounter.treatmentChange) : 'No change type recorded') +
    ' · ' + escapeHtml(medications) + '</p></div></div>' + editForm +
    '<div><p class="section-label">Body-composition measurements</p>' +
    (linkedMeasurements || '<p class="muted">No device measurements linked to this Encounter.</p>') +
    (editable && state.meta.permissions.canLinkBodyComposition ? '<button class="small" data-action="find-candidates" data-encounter-id="' + encounter.id + '">Find device measurements</button><div class="candidate-list" id="candidate-list-' + encounter.id + '"></div>' : '') +
    '</div><div class="actions">' + controls + '</div></div></details>';
}

function renderPhysicianSelect(encounter) {
  const options = state.doctors.map((doctor) =>
    '<option value="' + doctor.id + '" ' + (doctor.id === encounter.physicianUserId ? 'selected' : '') + '>' + escapeHtml(doctor.displayName) + '</option>'
  ).join('');
  return '<label class="physician-picker">Visit physician<select id="physician-' + encounter.id + '"><option value="">Choose doctor</option>' + options + '</select></label>';
}

function renderEncounterEditor(encounter) {
  const choices = state.meta.symptoms.map((symptom) => {
    const checked = encounter.symptoms.includes(symptom.code);
    return '<label class="symptom-choice ' + (checked ? 'selected' : '') + '"><input type="checkbox" data-symptom="' + escapeHtml(symptom.code) +
      '" data-encounter-id="' + encounter.id + '" ' + (checked ? 'checked' : '') + '><span>' + escapeHtml(symptom.label) + '</span></label>';
  }).join('');
  const otherText = encounter.symptoms.includes('other')
    ? '<label>Other symptom note<input maxlength="500" data-draft-field="symptomOtherText" data-encounter-id="' + encounter.id + '" value="' + escapeHtml(encounter.symptomOtherText) + '"></label>' : '';
  const regimen = state.meta.permissions.canManageMedication
    ? renderRegimenEditor(encounter)
    : '<div class="muted-box"><strong>Medication tracking</strong><br>' + escapeHtml(encounter.treatmentChange ? treatmentLabel(encounter.treatmentChange) : 'No treatment-change category saved') +
      ' · ' + escapeHtml(encounter.medications.map((item) => item.medicationName + ' ' + item.doseMg + ' mg').join(', ') || 'No medication items') + '</div>';
  return '<div class="grid two"><label>Encounter weight (kg)<input inputmode="decimal" type="number" min="0.1" step="0.1" data-draft-field="weightKg" data-encounter-id="' + encounter.id +
    '" value="' + escapeHtml(encounter.weightKg ?? '') + '" placeholder="Optional"></label>' +
    '<label>Waist circumference (cm)<input inputmode="decimal" type="number" min="0.1" step="0.1" data-draft-field="waistCm" data-encounter-id="' + encounter.id +
    '" value="' + escapeHtml(encounter.waistCm ?? '') + '" placeholder="Optional"></label></div>' +
    '<div><p class="section-label">Symptoms · no severity or medication causality</p><div class="symptom-list">' + choices + '</div>' + otherText + '</div>' +
    '<div><p class="section-label">Medication workflow</p>' + regimen + '</div>';
}

function renderRegimenEditor(encounter) {
  const savedContinueOption = encounter.treatmentChange === 'continue'
    ? '<option value="continue" selected disabled>Continue previous regimen</option>'
    : '';
  const changeOptions = state.meta.treatmentChangeTypes.filter((change) => change !== 'continue').map((change) =>
    '<option value="' + change + '" ' + (encounter.treatmentChange === change ? 'selected' : '') + '>' + treatmentLabel(change) + '</option>'
  ).join('');
  return '<div class="callout">This is a tracking aid. The clinician selects the regimen; the HIS remains the official order source.</div>' +
    '<div class="inline-form"><label>Treatment-change category<select data-change-type="' + encounter.id + '"><option value="">Choose category</option>' + savedContinueOption + changeOptions + '</select></label>' +
    '<button class="small" data-action="continue-regimen" data-id="' + encounter.id + '">Continue previous regimen</button></div>' +
    '<div id="medication-items-' + encounter.id + '">' + encounter.medications.map((item) => renderMedicationRow(encounter.id, item)).join('') + '</div>' +
    '<div class="actions"><button class="small" data-action="add-medication" data-id="' + encounter.id + '">Add medication</button>' +
    '<button class="small primary" data-action="save-regimen" data-id="' + encounter.id + '">Save medication record</button></div>';
}

function renderMedicationRow(encounterId, item = {}) {
  const medicationCode = item.medicationCode || '';
  const catalog = state.meta.medications[medicationCode];
  const medicationOptions = Object.entries(state.meta.medications).map(([code, medicine]) =>
    '<option value="' + code + '" ' + (code === medicationCode ? 'selected' : '') + '>' + escapeHtml(medicine.name) + '</option>'
  ).join('');
  const doseOptions = catalog ? catalog.doses.map((dose) =>
    '<option value="' + dose + '" ' + (!item.residualDose && Number(item.doseMg) === dose ? 'selected' : '') + '>' + dose + ' mg</option>'
  ).join('') : '';
  const residualSelected = Boolean(item.residualDose);
  return '<div class="medication-row" data-medication-row>' +
    '<label>Medication<select data-medication-code><option value="">Choose medication</option>' + medicationOptions + '</select></label>' +
    '<label>Dose<select data-dose-mode="' + encounterId + '" ' + (!catalog ? 'disabled' : '') + '><option value="">Choose dose</option>' + doseOptions +
    (catalog ? '<option value="residual" ' + (residualSelected ? 'selected' : '') + '>Residual dose</option>' : '') + '</select></label>' +
    (residualSelected ? '<label>Manual dose (mg)<input type="number" min="0.01" step="0.01" data-residual-dose value="' + escapeHtml(item.doseMg) + '"></label>' :
      '<span class="dose-note">SC · weekly · 1 pen</span>') +
    '<button class="small danger" data-action="remove-medication" type="button">Remove</button></div>';
}

function treatmentLabel(value) {
  return ({
    continue: 'Continue previous regimen',
    increase: 'Increase dose',
    decrease: 'Decrease dose',
    change: 'Change medication',
    pause: 'Pause medication',
    no_medication: 'No weight-loss medication this visit'
  })[value] || value || '—';
}

function closureLabel(value) {
  return ({
    goal_achieved: 'Goal achieved',
    stops_treatment: 'Patient stops treatment',
    adverse_effects: 'Adverse effects',
    other: 'Other'
  })[value] || value;
}

function symptomLabels(codes) {
  const map = new Map(state.meta.symptoms.map((symptom) => [symptom.code, symptom.label]));
  return (codes || []).map((code) => map.get(code) || code);
}

function metricLabel(code) {
  const map = {
    body_weight: 'Device weight',
    bmi: 'BMI',
    body_fat_percent: 'Body fat',
    body_water_kg: 'Body water',
    protein_kg: 'Protein',
    mineral_kg: 'Mineral',
    body_fat_mass_kg: 'Body fat mass',
    fat_free_mass_kg: 'Fat-free mass',
    skeletal_muscle_kg: 'Skeletal muscle',
    waist_hip_ratio: 'Waist to hip ratio',
    subcutaneous_fat_percent: 'Subcutaneous fat',
    visceral_fat_level: 'Visceral fat',
    ideal_weight_kg: 'Device ideal weight',
    weight_control_kg: 'Device weight control',
    fat_control_kg: 'Device fat control',
    muscle_control_kg: 'Device muscle control',
    basal_metabolic_rate: 'Basal metabolic rate',
    body_age_years: 'Body age',
    body_score: 'Body score'
  };
  return map[code] || code.replaceAll('_', ' ');
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function metricsSummary(metrics) {
  const preferred = new Set(['body_weight', 'body_fat_percent', 'bmi']);
  return metrics.filter((metric) => preferred.has(metric.metricCode) && metric.value !== null)
    .map((metric) => metricLabel(metric.metricCode) + ' ' + displayNumber(metric.value) + ' ' + metric.unit +
      (metric.status === 'verified' ? '' : ' (unverified)')).join(' · ') || 'No mapped metrics';
}

function trendPanel(title, unit, points, id) {
  const data = points || [];
  if (!data.length || data.every((point) => point.value === null || point.value === undefined)) {
    return '<div class="trend-card"><h4>' + escapeHtml(title) + '</h4><div class="chart-empty">No measurements available.</div></div>';
  }
  return '<div class="trend-card"><h4>' + escapeHtml(title) + ' <small>(' + escapeHtml(unit) + ')</small></h4>' +
    '<canvas class="chart" id="' + escapeHtml(id) + '" data-points="' + escapeHtml(JSON.stringify(data)) + '" aria-label="' + escapeHtml(title) + ' trend"></canvas></div>';
}

function drawPatientCharts(data) {
  for (const episode of data.episodes) {
    drawChart('weight-' + episode.id);
    drawChart('waist-' + episode.id);
  }
  for (const [code] of Object.entries(data.bodyComposition.trends)) drawChart('bc-' + safeId(code));
}

function drawChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const points = JSON.parse(canvas.dataset.points || '[]');
  const context = canvas.getContext('2d');
  const width = Math.max(280, Math.floor(canvas.clientWidth));
  const height = 190;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const values = points.map((point) => point.value)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (!values.length) return;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = { top: 18, right: 16, bottom: 30, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const spread = Math.max(1, maxValue - minValue);
  const low = minValue - spread * 0.12;
  const high = maxValue + spread * 0.12;
  context.font = '11px Segoe UI, sans-serif';
  context.strokeStyle = '#e3ebed';
  context.fillStyle = '#73848b';
  context.lineWidth = 1;
  for (let line = 0; line < 4; line += 1) {
    const y = padding.top + plotHeight * line / 3;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    const label = high - (high - low) * line / 3;
    context.fillText(displayNumber(label), 3, y + 4);
  }
  const coordinate = (value, index) => ({
    x: padding.left + (points.length <= 1 ? plotWidth / 2 : plotWidth * index / (points.length - 1)),
    y: padding.top + plotHeight * (high - Number(value)) / (high - low)
  });
  let previous = null;
  points.forEach((point, index) => {
    if (point.value === null || point.value === undefined) {
      previous = null;
      return;
    }
    const current = coordinate(point.value, index);
    if (previous) {
      context.beginPath();
      context.strokeStyle = '#087d78';
      context.lineWidth = 2.4;
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
    context.beginPath();
    context.fillStyle = '#087d78';
    context.arc(current.x, current.y, 3.4, 0, Math.PI * 2);
    context.fill();
    previous = current;
  });
  const firstTime = points.find((point) => point.at)?.at;
  const lastTime = [...points].reverse().find((point) => point.at)?.at;
  context.fillStyle = '#73848b';
  if (firstTime) context.fillText(formatDate(firstTime, false), padding.left, height - 8);
  if (lastTime && points.length > 1) {
    const text = formatDate(lastTime, false);
    context.fillText(text, width - context.measureText(text).width - padding.right, height - 8);
  }
}

function draftFormValues(encounterId) {
  const card = document.querySelector('[data-encounter-card="' + encounterId + '"]');
  if (!card) return null;
  const read = (field) => card.querySelector('[data-draft-field="' + field + '"][data-encounter-id="' + encounterId + '"]')?.value;
  const symptomCodes = [...card.querySelectorAll('[data-symptom][data-encounter-id="' + encounterId + '"]:checked')]
    .map((input) => input.dataset.symptom);
  return {
    weightKg: read('weightKg') === '' ? null : Number(read('weightKg')),
    waistCm: read('waistCm') === '' ? null : Number(read('waistCm')),
    symptomCodes,
    symptomOtherText: read('symptomOtherText') || ''
  };
}

function setSaveStatus(encounterId, message, type = '') {
  const node = document.getElementById('save-status-' + encounterId);
  if (!node) return;
  node.textContent = message;
  node.className = 'save-status' + (type ? ' ' + type : '');
}

function trackSaveQueue(encounterId, promise) {
  state.saveQueues.set(encounterId, promise);
  state.pendingWrites.add(encounterId);
  promise.finally(() => {
    if (state.saveQueues.get(encounterId) === promise) state.pendingWrites.delete(encounterId);
  }).catch(() => null);
  return promise;
}

function lockEncounterFields(encounterId) {
  const card = document.querySelector('[data-encounter-card="' + encounterId + '"]');
  card?.querySelectorAll('input, select, button').forEach((control) => {
    if (control.dataset.action !== 'reload-encounter') control.disabled = true;
  });
}

function scheduleDraftSave(encounterId, immediate = false) {
  if (state.conflictedEncounters.has(encounterId)) {
    setSaveStatus(encounterId, 'Conflict · reload before editing further', 'error');
    return;
  }
  const prior = state.saveTimers.get(encounterId);
  if (prior) window.clearTimeout(prior);
  state.dirtyEncounters.add(encounterId);
  setSaveStatus(encounterId, navigator.onLine ? 'Unsaved changes' : 'Offline · changes not saved', navigator.onLine ? '' : 'error');
  if (immediate) {
    state.saveTimers.delete(encounterId);
    queueDraftSave(encounterId);
  } else {
    state.saveTimers.set(encounterId, window.setTimeout(() => {
      state.saveTimers.delete(encounterId);
      queueDraftSave(encounterId);
    }, 450));
  }
}

function queueDraftSave(encounterId) {
  const previous = state.saveQueues.get(encounterId) || Promise.resolve();
  const next = previous.catch(() => null).then(async () => {
    if (state.conflictedEncounters.has(encounterId)) return;
    const current = state.encounters.get(encounterId);
    const fields = draftFormValues(encounterId);
    if (!current || !fields) return;
    if (!navigator.onLine) {
      setSaveStatus(encounterId, 'Offline · changes not saved', 'error');
      return;
    }
    const signature = JSON.stringify(fields);
    setSaveStatus(encounterId, 'Saving…');
    try {
      const result = await api('/api/encounters/' + encounterId, {
        method: 'PATCH',
        json: { expectedVersion: current.version, ...fields }
      });
      state.encounters.set(encounterId, result.encounter);
      if (!state.saveTimers.has(encounterId) && JSON.stringify(draftFormValues(encounterId)) === signature) {
        state.dirtyEncounters.delete(encounterId);
        setSaveStatus(encounterId, 'Saved · ' + formatDate(new Date().toISOString()), 'saved');
      } else {
        setSaveStatus(encounterId, 'Unsaved changes');
      }
      if (state.patient) {
        const index = state.patient.encounters.findIndex((item) => item.id === encounterId);
        if (index >= 0) state.patient.encounters[index] = result.encounter;
      }
    } catch (error) {
      const status = document.getElementById('save-status-' + encounterId);
      setSaveStatus(encounterId, error.status === 409
        ? 'Conflict · reload before editing further'
        : 'Save failed · changes are not saved', 'error');
      if (status) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'small';
        action.dataset.action = error.status === 409 ? 'reload-encounter' : 'retry-save';
        action.dataset.id = String(encounterId);
        action.textContent = error.status === 409 ? 'Reload Encounter' : 'Retry save';
        status.appendChild(action);
      }
      if (error.status === 409) {
        state.conflictedEncounters.add(encounterId);
        lockEncounterFields(encounterId);
      }
      if (error.status === 409) setNotice(error.message, 'error');
      else setNotice(error.message, 'error');
    }
  });
  return trackSaveQueue(encounterId, next);
}

function readRegimenForm(encounterId) {
  const card = document.querySelector('[data-encounter-card="' + encounterId + '"]');
  if (!card) return null;
  const changeType = card.querySelector('[data-change-type]')?.value || '';
  if (!changeType) return null;
  const items = [];
  for (const row of card.querySelectorAll('[data-medication-row]')) {
    const medicationCode = row.querySelector('[data-medication-code]')?.value || '';
    const doseMode = row.querySelector('[data-dose-mode]')?.value || '';
    if (!medicationCode || !doseMode) return null;
    const residualDose = doseMode === 'residual';
    const doseInput = residualDose ? row.querySelector('[data-residual-dose]')?.value : doseMode;
    const doseMg = Number(doseInput);
    if (!doseInput || !Number.isFinite(doseMg) || doseMg <= 0) return null;
    const catalog = state.meta.medications[medicationCode];
    if (!catalog || (!residualDose && !catalog.doses.includes(doseMg))) return null;
    items.push({ medicationCode, doseMg, residualDose });
  }
  if (['pause', 'no_medication'].includes(changeType) && items.length) return null;
  return { changeType, items };
}

function scheduleRegimenSave(encounterId, immediate = false) {
  if (state.conflictedEncounters.has(encounterId)) {
    setSaveStatus(encounterId, 'Conflict · reload before editing further', 'error');
    return;
  }
  const prior = state.regimenTimers.get(encounterId);
  if (prior) window.clearTimeout(prior);
  state.regimenTimers.delete(encounterId);
  state.dirtyRegimens.add(encounterId);
  const form = readRegimenForm(encounterId);
  if (!form) {
    setSaveStatus(encounterId, 'Medication changes are incomplete · not saved', 'error');
    return;
  }
  if (!navigator.onLine) {
    setSaveStatus(encounterId, 'Offline · medication changes are not saved', 'error');
    return;
  }
  setSaveStatus(encounterId, 'Medication changes not yet saved');
  if (immediate) {
    queueRegimenSave(encounterId);
  } else {
    state.regimenTimers.set(encounterId, window.setTimeout(() => {
      state.regimenTimers.delete(encounterId);
      queueRegimenSave(encounterId);
    }, 450));
  }
}

function queueRegimenSave(encounterId) {
  const previous = state.saveQueues.get(encounterId) || Promise.resolve();
  const next = previous.catch(() => null).then(async () => {
    if (state.conflictedEncounters.has(encounterId)) return;
    const current = state.encounters.get(encounterId);
    const form = readRegimenForm(encounterId);
    if (!current || !form) {
      setSaveStatus(encounterId, 'Medication changes are incomplete · not saved', 'error');
      return;
    }
    if (!navigator.onLine) {
      setSaveStatus(encounterId, 'Offline · medication changes are not saved', 'error');
      return;
    }
    const signature = JSON.stringify(form);
    setSaveStatus(encounterId, 'Saving medication record…');
    try {
      const result = await api('/api/encounters/' + encounterId + '/regimen', {
        method: 'PUT',
        json: { expectedVersion: current.version, ...form }
      });
      state.encounters.set(encounterId, result.encounter);
      if (state.patient) {
        const encounterIndex = state.patient.encounters.findIndex((item) => item.id === encounterId);
        if (encounterIndex >= 0) state.patient.encounters[encounterIndex] = result.encounter;
        const entry = {
          encounterId,
          occurredAt: result.encounter.occurredAt,
          treatmentChange: result.encounter.treatmentChange,
          medications: result.encounter.medications
        };
        const timeline = state.patient.medicationTimeline;
        const timelineIndex = timeline.findIndex((item) => item.encounterId === encounterId);
        if (entry.treatmentChange) {
          if (timelineIndex >= 0) timeline[timelineIndex] = entry;
          else timeline.push(entry);
        } else if (timelineIndex >= 0) {
          timeline.splice(timelineIndex, 1);
        }
        timeline.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.encounterId - left.encounterId);
        const timelineNode = document.getElementById('medication-timeline-content');
        if (timelineNode) timelineNode.innerHTML = renderMedicationTimeline(timeline);
      }
      const summary = document.querySelector('[data-encounter-card="' + encounterId + '"] [data-regimen-summary]');
      if (summary) {
        const medications = result.encounter.medications.length
          ? result.encounter.medications.map((item) => item.medicationName + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? ' (residual dose)' : '')).join(', ')
          : 'No medication items';
        summary.textContent = (result.encounter.treatmentChange ? treatmentLabel(result.encounter.treatmentChange) : 'No change type recorded') + ' · ' + medications;
      }
      if (JSON.stringify(readRegimenForm(encounterId)) === signature && !state.regimenTimers.has(encounterId)) {
        state.dirtyRegimens.delete(encounterId);
        setSaveStatus(encounterId, 'Medication record saved · ' + formatDate(new Date().toISOString()), 'saved');
      } else {
        setSaveStatus(encounterId, 'Medication changes not yet saved');
      }
    } catch (error) {
      const status = document.getElementById('save-status-' + encounterId);
      setSaveStatus(encounterId, error.status === 409
        ? 'Conflict · reload before editing further'
        : 'Medication save failed · changes are not saved', 'error');
      if (status) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'small';
        action.dataset.action = error.status === 409 ? 'reload-encounter' : 'retry-regimen-save';
        action.dataset.id = String(encounterId);
        action.textContent = error.status === 409 ? 'Reload Encounter' : 'Retry medication save';
        status.appendChild(action);
      }
      if (error.status === 409) {
        state.conflictedEncounters.add(encounterId);
        lockEncounterFields(encounterId);
      }
      setNotice(error.message, 'error');
    }
  });
  return trackSaveQueue(encounterId, next);
}

async function reloadEncounter(encounterId) {
  const patientId = state.encounters.get(encounterId)?.patientId || state.patient?.patient?.id;
  state.conflictedEncounters.add(encounterId);
  lockEncounterFields(encounterId);
  for (const timerMap of [state.saveTimers, state.regimenTimers]) {
    const timer = timerMap.get(encounterId);
    if (timer) window.clearTimeout(timer);
    timerMap.delete(encounterId);
  }
  await state.saveQueues.get(encounterId)?.catch(() => null);
  for (const timerMap of [state.saveTimers, state.regimenTimers]) {
    const timer = timerMap.get(encounterId);
    if (timer) window.clearTimeout(timer);
    timerMap.delete(encounterId);
  }
  state.dirtyEncounters.delete(encounterId);
  state.dirtyRegimens.delete(encounterId);
  state.conflictedEncounters.delete(encounterId);
  if (!patientId) throw new Error('Open the Patient again to reload this Encounter.');
  await openPatient(patientId);
}

async function refreshPatient() {
  if (!state.patient) return;
  await openPatient(state.patient.patient.id);
}

function openModal(title, body) {
  const existing = document.getElementById('dialog-backdrop');
  existing?.remove();
  document.body.insertAdjacentHTML('beforeend',
    '<div class="dialog-backdrop" id="dialog-backdrop"><section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">' +
    '<header><div><p class="eyebrow">Clinic workflow</p><h2 id="dialog-title">' + escapeHtml(title) + '</h2></div>' +
    '<button class="small" data-action="close-modal" aria-label="Close">Close</button></header>' + body + '</section></div>');
  document.querySelector('#dialog-backdrop input')?.focus();
}

async function showAdmin(section = state.adminSection) {
  await flushPendingSaves();
  state.adminSection = section;
  listView.hidden = true;
  patientView.hidden = true;
  adminView.hidden = false;
  const tabs = '<nav class="admin-tabs" aria-label="Administration sections">' +
    adminTab('users', 'Users & roles') + adminTab('audit', 'Audit history') +
    adminTab('config', 'Workflow configuration') + adminTab('data', 'Backup & migration') + '</nav>';
  let content = '';
  if (section === 'users') content = await renderAdminUsers();
  if (section === 'audit') content = await renderAdminAudit();
  if (section === 'config') content = await renderAdminConfig();
  if (section === 'data') content = renderAdminData();
  adminView.innerHTML = '<div class="page-header"><div><p class="eyebrow">Administration</p><h1>Clinic settings</h1><p>Access is checked by the backend for every action.</p></div></div>' +
    tabs + content;
}

function adminTab(name, label) {
  return '<button data-action="admin-section" data-section="' + name + '" ' +
    (state.adminSection === name ? 'aria-current="page"' : '') + '>' + label + '</button>';
}

async function renderAdminUsers() {
  const result = await api('/api/admin/users');
  const rows = result.users.map((user) =>
    '<form class="user-row inline-form" data-user-form="' + user.id + '">' +
    '<strong>' + escapeHtml(user.username) + '</strong>' +
    '<label>Display name<input name="displayName" value="' + escapeHtml(user.displayName) + '" required></label>' +
    '<label>Role<select name="role">' + state.meta.roles.map((role) =>
      '<option value="' + role.value + '" ' + (role.value === user.role ? 'selected' : '') + '>' + escapeHtml(role.label) + '</option>'
    ).join('') + '</select></label>' +
    '<label>New password<input name="password" type="password" autocomplete="new-password" placeholder="Leave unchanged" minlength="12"></label>' +
    '<label class="primary-switch"><input name="active" type="checkbox" ' + (user.active ? 'checked' : '') + '> Active</label>' +
    '<button class="small" type="submit">Save</button></form>'
  ).join('');
  return '<section class="panel"><div class="panel-heading"><div><h2>Clinic users</h2><p class="muted">Role changes and credential resets revoke existing sessions.</p></div></div>' +
    '<form id="create-user-form" class="two-column-form"><label>Username<input name="username" minlength="3" maxlength="64" required></label>' +
    '<label>Display name<input name="displayName" maxlength="120" required></label><label>Role<select name="role">' +
    state.meta.roles.map((role) => '<option value="' + role.value + '">' + escapeHtml(role.label) + '</option>').join('') +
    '</select></label><label>Initial password<input name="password" type="password" minlength="12" autocomplete="new-password" required></label>' +
    '<div class="full"><button class="primary" type="submit">Create user</button></div></form></section>' +
    '<section class="panel"><h2>Existing users</h2>' + (rows || '<div class="empty">No users are configured.</div>') + '</section>';
}

async function renderAdminAudit() {
  const result = await api('/api/admin/audit?limit=200');
  const rows = result.events.map((event) =>
    '<tr><td>' + escapeHtml(formatDate(event.at)) + '</td><td>' + escapeHtml(event.actor) + '</td><td>' +
    escapeHtml(event.action.replaceAll('_', ' ')) + '</td><td>' + escapeHtml(event.entityType) + ' · ' + escapeHtml(event.entityId) + '</td>' +
    '<td>' + escapeHtml(event.reason || '—') +
    '<details><summary>Values</summary><pre>' + escapeHtml(JSON.stringify({ before: event.before, after: event.after }, null, 2)) + '</pre></details></td></tr>'
  ).join('');
  return '<section class="panel"><div class="panel-heading"><div><h2>Meaningful audit events</h2><p class="muted">Draft autosave keystrokes are not listed as clinical audit events.</p></div></div>' +
    (rows ? '<div class="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Reason</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">No audit events yet.</div>') + '</section>';
}

async function renderAdminConfig() {
  const result = await api('/api/admin/config');
  const hoanboy = result.hoanboy;
  const rows = hoanboy.mappings.map((mapping) =>
    '<div class="mapping-row" data-mapping-row="' + escapeHtml(mapping.metricCode) + '">' +
    '<span class="mapping-title">' + escapeHtml(mapping.label) + '</span>' +
    '<span class="mapping-field">' + escapeHtml(mapping.sourceField) + '</span>' +
    '<span>' + escapeHtml(mapping.unit) + '</span>' +
    '<label><span class="visually-hidden">Evidence for ' + escapeHtml(mapping.label) + '</span><input type="text" data-mapping-evidence maxlength="500" value="' + escapeHtml(mapping.evidence) + '" placeholder="Evidence reference"></label>' +
    '<label class="primary-switch"><input type="checkbox" data-mapping-verified ' + (mapping.verified ? 'checked' : '') +
    (mapping.unit === 'unverified' ? ' disabled' : '') + '> Verified</label></div>'
  ).join('');
  const medicines = Object.entries(result.medicationCatalog).map(([code, catalog]) =>
    '<tr><td>' + escapeHtml(catalog.name) + '</td><td>' + catalog.doses.map((dose) => dose + ' mg').join(', ') +
    ' · Residual dose</td><td>' + escapeHtml(catalog.route) + '</td><td>' + escapeHtml(catalog.frequency) + '</td><td>' + escapeHtml(catalog.quantity) + '</td></tr>'
  ).join('');
  return '<section class="panel"><h2>HOANBOY 370 adapter</h2><p class="muted">Vendor retrieval and field parsing stay inside its replaceable adapter.</p>' +
    '<form id="hoanboy-device-form" class="inline-form"><label>Private device IPv4 address<input name="deviceIp" value="' + escapeHtml(hoanboy.deviceIp || '') + '" placeholder="192.168.1.100"></label>' +
    '<button class="primary" type="submit">Save device</button><span>' + (hoanboy.deviceConfigured ? '<span class="badge active">Configured</span>' : '<span class="badge">Not configured</span>') + '</span></form>' +
    '<form id="mapping-form"><p class="callout warning">Metrics enter cross-Encounter trends only after an administrator records evidence confirming both meaning and unit. Metrics without confirmed units cannot be verified.</p>' +
    '<div class="mapping-row"><strong>Metric</strong><strong>Source field</strong><strong>Unit</strong><strong>Evidence reference</strong><strong>Verified</strong></div>' + rows +
    '<p><button class="primary" type="submit">Save verified mappings</button></p></form></section>' +
    '<section class="panel"><h2>Medication workflow presets</h2><p class="muted">Fixed MVP workflow configuration. These values are not clinical recommendations.</p>' +
    '<div class="table-wrap"><table><thead><tr><th>Medication</th><th>Preset doses</th><th>Route</th><th>Frequency</th><th>Quantity</th></tr></thead><tbody>' + medicines + '</tbody></table></div></section>';
}

function renderAdminData() {
  return '<section class="panel"><h2>Protected backup</h2><p class="muted">The backup contains the database and saved report assets. It is encrypted with the host-configured backup passphrase.</p>' +
    '<div class="actions"><button class="primary" data-action="create-backup">Download encrypted backup</button></div>' +
    '<form id="restore-form" class="stack admin-upload"><label>Restore encrypted backup<input name="backup" type="file" accept=".wmtbackup,application/vnd.weight-management-tracker.backup" required></label>' +
    '<label class="primary-switch"><input name="confirm" type="checkbox" required> Replace current application data after validation</label>' +
    '<button class="danger" type="submit">Validate and restore</button></form></section>' +
    '<section class="panel"><h2>HOANBOY history migration</h2><p class="muted">Choose a read-only copy of the old application database. The system saves an encrypted source backup before import and matches Patients by exact MRN.</p>' +
    '<form id="migration-form" class="stack admin-upload"><label>HOANBOY SQLite database<input name="source" type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" required></label>' +
    '<button class="primary" type="submit">Back up and import history</button></form><div class="callout warning">Keep the old tracker read-only during validation. This import does not create Encounters or Episodes from device timestamps.</div></section>';
}

async function saveRegimen(encounterId) {
  const alreadyPending = state.dirtyRegimens.has(encounterId);
  await flushEncounterTimer(encounterId);
  const timer = state.regimenTimers.get(encounterId);
  if (timer) {
    window.clearTimeout(timer);
    state.regimenTimers.delete(encounterId);
  }
  if (!readRegimenForm(encounterId)) throw new Error('Choose a treatment-change category and finish each medication dose before saving.');
  if (!alreadyPending) {
    state.dirtyRegimens.add(encounterId);
    await queueRegimenSave(encounterId);
  }
  if (state.dirtyRegimens.has(encounterId)) throw new Error('The medication record is not saved. Retry or reload before continuing.');
  setNotice('Medication record saved.');
  await refreshPatient();
}

async function flushEncounterTimer(encounterId) {
  while (true) {
    const draftTimer = state.saveTimers.get(encounterId);
    if (draftTimer) {
      window.clearTimeout(draftTimer);
      state.saveTimers.delete(encounterId);
      queueDraftSave(encounterId);
    }
    const regimenTimer = state.regimenTimers.get(encounterId);
    if (regimenTimer) {
      window.clearTimeout(regimenTimer);
      state.regimenTimers.delete(encounterId);
      queueRegimenSave(encounterId);
    }
    if (state.pendingWrites.has(encounterId)) {
      await state.saveQueues.get(encounterId)?.catch(() => null);
    }
    if (!state.saveTimers.has(encounterId) && !state.regimenTimers.has(encounterId) && !state.pendingWrites.has(encounterId)) break;
  }
  if (state.dirtyEncounters.has(encounterId) || state.dirtyRegimens.has(encounterId)) {
    throw new Error('Encounter changes are not saved. Retry or reload before continuing.');
  }
}

async function showCandidates(encounterId) {
  const encounter = state.encounters.get(encounterId);
  const target = document.getElementById('candidate-list-' + encounterId);
  if (!encounter || !target) return;
  try {
    const result = await api('/api/body-composition/candidates?patientId=' + encounter.patientId);
    state.candidates.set(encounterId, result.candidates);
    const currentPrimary = encounter.bodyComposition.some((measurement) => measurement.isPrimary);
    target.innerHTML = result.candidates.length ? result.candidates.map((candidate) =>
      '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(candidate.measuredAt)) + '</strong> · ' + escapeHtml(candidate.source || 'Body-composition device') +
      (candidate.sourceIdentifier ? ' · ' + escapeHtml(candidate.sourceIdentifier) : '') +
      '<div class="candidate-metrics">' + escapeHtml(metricsSummary(candidate.metrics)) + '</div></div>' +
      '<label class="primary-switch"><input type="checkbox" data-candidate-primary="' + candidate.id + '" ' +
      (!currentPrimary ? 'checked' : '') + '> Primary</label>' +
      '<button class="small" data-action="link-measurement" data-encounter-id="' + encounterId + '" data-id="' + candidate.id + '">Confirm link</button></div>'
    ).join('') : '<p class="muted">No eligible device measurements are available. Sync the adapter or review the Patient association.</p>';
  } catch (error) {
    target.textContent = error.message;
  }
}

async function downloadBackup() {
  try {
    const blob = await api('/api/admin/backups', { method: 'POST', responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'weight-management-backup-' + new Date().toISOString().slice(0, 10) + '.wmtbackup';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Encrypted backup downloaded.');
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function onClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = Number(button.dataset.id);
  try {
    if (action === 'home') {
      await flushPendingSaves();
      await showPatientList(state.lastListSearch);
    } else if (action === 'logout') {
      await flushPendingSaves();
      await api('/api/auth/logout', { method: 'POST', json: {} });
      showLogin();
    } else if (action === 'new-patient') {
      openModal('Add Patient', '<form id="create-patient-form" class="stack"><label>MRN<input name="mrn" maxlength="64" required></label>' +
        '<label>Name<input name="name" maxlength="120" required></label><label>Phone<input name="phone" maxlength="80"></label>' +
        '<button class="primary" type="submit">Create Patient</button></form>');
    } else if (action === 'close-modal') {
      document.getElementById('dialog-backdrop')?.remove();
    } else if (action === 'open-patient') {
      await openPatient(id);
    } else if (action === 'refresh-list') {
      await showPatientList(document.getElementById('patient-search')?.value || '');
    } else if (action === 'refresh-patient') {
      await refreshPatient();
    } else if (action === 'start-episode') {
      await api('/api/patients/' + id + '/episodes', { method: 'POST', json: {} });
      setNotice('Weight-loss Episode started.');
      await openPatient(id);
    } else if (action === 'new-encounter') {
      const result = await api('/api/patients/' + id + '/encounters', { method: 'POST', json: {} });
      setNotice('Draft Encounter created. Changes autosave as you enter them.');
      await openPatient(id);
      const card = document.querySelector('[data-encounter-card="' + result.encounter.id + '"]');
      if (card) card.open = true;
    } else if (action === 'close-episode') {
      const options = state.meta.closureReasons.map((reason) => '<option value="' + reason.value + '">' + escapeHtml(reason.label) + '</option>').join('');
      openModal('End Weight-loss Episode', '<form id="close-episode-form" class="stack" data-episode-id="' + id + '"><label>Closure reason<select name="reason">' + options + '</select></label>' +
        '<button class="primary" type="submit">Close Episode</button></form>');
    } else if (action === 'complete-encounter') {
      const encounter = state.encounters.get(id);
      await flushEncounterTimer(id);
      const physicianSelect = document.getElementById('physician-' + id);
      const payload = { expectedVersion: state.encounters.get(id).version };
      if (physicianSelect) payload.physicianUserId = physicianSelect.value ? Number(physicianSelect.value) : null;
      const result = await api('/api/encounters/' + id + '/complete', { method: 'POST', json: payload });
      state.encounters.set(id, result.encounter);
      setNotice('Encounter completed.');
      await refreshPatient();
    } else if (action === 'reopen-encounter') {
      const reason = window.prompt('Enter the reason for this correction (3–500 characters).');
      if (!reason) return;
      const encounter = state.encounters.get(id);
      await api('/api/encounters/' + id + '/reopen', { method: 'POST', json: { expectedVersion: encounter.version, reason } });
      setNotice('Encounter reopened. Corrections are audited.');
      await refreshPatient();
    } else if (action === 'delete-empty-draft') {
      if (!window.confirm('Discard this Draft only if it contains no saved clinical content?')) return;
      await flushEncounterTimer(id);
      const encounter = state.encounters.get(id);
      await api('/api/encounters/' + id, { method: 'DELETE', json: { expectedVersion: encounter.version } });
      setNotice('Empty Draft discarded.');
      await refreshPatient();
    } else if (action === 'reload-encounter') {
      await reloadEncounter(id);
    } else if (action === 'retry-save') {
      scheduleDraftSave(id, true);
    } else if (action === 'retry-regimen-save') {
      scheduleRegimenSave(id, true);
    } else if (action === 'save-regimen') {
      await saveRegimen(id);
    } else if (action === 'continue-regimen') {
      await flushEncounterTimer(id);
      const encounter = state.encounters.get(id);
      const result = await api('/api/encounters/' + id + '/regimen/continue', {
        method: 'POST', json: { expectedVersion: encounter.version }
      });
      state.encounters.set(id, result.encounter);
      setNotice(result.copiedFromEncounterId ? 'Previous regimen copied for clinician review.' : 'No prior regimen was available; the current list is empty.');
      await refreshPatient();
      const card = document.querySelector('[data-encounter-card="' + id + '"]');
      if (card) card.open = true;
    } else if (action === 'add-medication') {
      const container = document.getElementById('medication-items-' + id);
      container.insertAdjacentHTML('beforeend', renderMedicationRow(id));
      scheduleRegimenSave(id);
    } else if (action === 'remove-medication') {
      button.closest('[data-medication-row]')?.remove();
      const encounterId = Number(button.closest('[id^="medication-items-"]')?.id.replace('medication-items-', ''));
      if (encounterId) scheduleRegimenSave(encounterId, true);
    } else if (action === 'find-candidates') {
      await showCandidates(Number(button.dataset.encounterId));
    } else if (action === 'sync-device') {
      const result = await api('/api/body-composition/sync', { method: 'POST', json: {} });
      setNotice('Device sync finished: ' + result.added + ' new, ' + result.updated + ' changed, ' + result.unchanged + ' unchanged.');
      await refreshPatient();
    } else if (action === 'link-measurement') {
      const encounterId = Number(button.dataset.encounterId);
      await flushEncounterTimer(encounterId);
      const encounter = state.encounters.get(encounterId);
      const primaryInput = document.querySelector('[data-candidate-primary="' + id + '"]');
      const result = await api('/api/encounters/' + encounterId + '/body-composition-links', {
        method: 'POST',
        json: { expectedVersion: encounter.version, measurementId: id, isPrimary: Boolean(primaryInput?.checked) }
      });
      encounter.version = result.encounterVersion;
      setNotice('Device measurement linked to the confirmed Encounter.');
      await refreshPatient();
    } else if (action === 'make-primary') {
      const encounterId = Number(button.dataset.encounterId);
      await flushEncounterTimer(encounterId);
      const encounter = state.encounters.get(encounterId);
      const result = await api('/api/encounters/' + encounterId + '/body-composition-links', {
        method: 'POST',
        json: { expectedVersion: encounter.version, measurementId: id, isPrimary: true }
      });
      encounter.version = result.encounterVersion;
      setNotice('Primary body-composition measurement updated.');
      await refreshPatient();
    } else if (action === 'unlink-measurement') {
      const encounterId = Number(button.dataset.encounterId);
      await flushEncounterTimer(encounterId);
      const encounter = state.encounters.get(encounterId);
      await api('/api/encounters/' + encounterId + '/body-composition-links/' + id, {
        method: 'DELETE',
        json: { expectedVersion: encounter.version }
      });
      setNotice('Measurement unlinked. Its Patient association remains available for history.');
      await refreshPatient();
    } else if (action === 'measurement-details') {
      const result = await api('/api/body-composition/measurements/' + id);
      const metrics = result.measurement.metrics.map((metric) =>
        '<tr><td>' + escapeHtml(metricLabel(metric.metricCode)) + '</td><td>' + (metric.value === null ? '—' : displayNumber(metric.value, 2)) + '</td>' +
        '<td>' + escapeHtml(metric.unit) + '</td><td>' + statusBadge(metric.status) + '</td></tr>'
      ).join('');
      const sourceHistory = result.measurement.sourceHistory.length
        ? '<h3>Imported source assignment history</h3><ul>' + result.measurement.sourceHistory.map((event) =>
          '<li>' + escapeHtml(formatDate(event.at)) + ' · ' + escapeHtml(event.action) + ' · ' + escapeHtml(event.actor || 'Source operator') + '</li>'
        ).join('') + '</ul>' : '';
      openModal('Body-composition measurement', '<p class="muted">' + escapeHtml(formatDate(result.measurement.measuredAt)) +
        ' · Source revision ' + result.measurement.revision + ' · Source key ' + escapeHtml(result.measurement.sourceKey) +
        '</p><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th><th>Unit</th><th>Verification</th></tr></thead><tbody>' + metrics + '</tbody></table></div>' + sourceHistory);
    } else if (action === 'admin') {
      await showAdmin();
    } else if (action === 'admin-section') {
      await showAdmin(button.dataset.section);
    } else if (action === 'create-backup') {
      await downloadBackup();
    }
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    if (form.id === 'login-form') {
      const result = await api('/api/auth/login', { method: 'POST', json: { username: data.get('username'), password: data.get('password') } });
      state.user = result.user;
      state.meta = await api('/api/meta');
      state.doctors = (await api('/api/doctors')).doctors;
      showApp();
      await showPatientList();
      setNotice('Signed in.');
    } else if (form.id === 'create-patient-form') {
      const result = await api('/api/patients', { method: 'POST', json: {
        mrn: data.get('mrn'), name: data.get('name'), phone: data.get('phone') || ''
      } });
      document.getElementById('dialog-backdrop')?.remove();
      setNotice('Patient created.');
      await openPatient(result.patient.id);
    } else if (form.id === 'create-user-form') {
      await api('/api/admin/users', { method: 'POST', json: {
        username: data.get('username'), displayName: data.get('displayName'),
        role: data.get('role'), password: data.get('password')
      } });
      setNotice('Clinic user created.');
      await showAdmin('users');
    } else if (form.id === 'close-episode-form') {
      await api('/api/episodes/' + form.dataset.episodeId + '/close', { method: 'POST', json: { reason: data.get('reason') } });
      document.getElementById('dialog-backdrop')?.remove();
      setNotice('Episode closed.');
      await refreshPatient();
    } else if (form.matches('[data-user-form]')) {
      const userId = Number(form.dataset.userForm);
      await api('/api/admin/users/' + userId, { method: 'PATCH', json: {
        displayName: data.get('displayName'), role: data.get('role'),
        password: data.get('password') || undefined, active: data.get('active') === 'on'
      } });
      if (userId === state.user.id && data.get('role') !== state.user.role) {
        setNotice('Your role changed; sign in again to refresh permissions.', 'warn');
        await api('/api/auth/logout', { method: 'POST', json: {} });
        showLogin();
        return;
      }
      setNotice('User updated. Existing sessions were revoked when access changed.');
      await showAdmin('users');
    } else if (form.id === 'hoanboy-device-form') {
      const result = await api('/api/admin/config/hoanboy/device', { method: 'PUT', json: { deviceIp: data.get('deviceIp') } });
      setNotice(result.hoanboy.deviceConfigured ? 'HOANBOY adapter configured.' : 'HOANBOY adapter disabled.');
      await showAdmin('config');
    } else if (form.id === 'mapping-form') {
      const mappings = [...form.querySelectorAll('[data-mapping-row]')].map((row) => ({
        metricCode: row.dataset.mappingRow,
        sourceField: row.querySelector('.mapping-field').textContent,
        unit: row.querySelectorAll('span')[2]?.textContent || '',
        verified: row.querySelector('[data-mapping-verified]').checked,
        evidence: row.querySelector('[data-mapping-evidence]').value
      }));
      await api('/api/admin/config/hoanboy/mappings', { method: 'PUT', json: { mappings } });
      setNotice('Metric mappings saved. Only verified normalized values enter default trends.');
      await showAdmin('config');
    } else if (form.id === 'restore-form') {
      if (data.get('confirm') !== 'on') throw new Error('Confirm replacement before restoring.');
      const file = data.get('backup');
      if (!file || !file.size) throw new Error('Choose an encrypted backup file.');
      if (!window.confirm('Restore this backup and replace current clinic data?')) return;
      const result = await api('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.weight-management-tracker.backup' },
        body: file
      });
      setNotice(result.restored ? 'Restore verified and completed. Sign in again.' : 'Restore did not complete.', 'warn');
      showLogin();
    } else if (form.id === 'migration-form') {
      const file = data.get('source');
      if (!file || !file.size) throw new Error('Choose a HOANBOY database file.');
      if (!window.confirm('Back up and import this HOANBOY database? The source will remain unchanged.')) return;
      const result = await api('/api/admin/migrate/hoanboy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.sqlite3' },
        body: file
      });
      const counts = result.counts;
      setNotice('Migration complete. ' + counts.patientsCreated + ' Patients added, ' + counts.patientsMatched +
        ' matched, ' + counts.measurementsImported + ' measurements added, ' + counts.normalizationVersionsImported +
        ' normalized metric versions added (' + counts.normalizationVersionsTotal + ' total), ' + counts.reportsImported +
        ' reports added. Source backup saved as ' + result.sourceBackupName + '.', 'ok');
      await showAdmin('data');
    }
  } catch (error) {
    if (form.id === 'login-form') showLogin(error.message);
    else setNotice(error.message, 'error');
  }
}

let searchTimer;
document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('input', (event) => {
  if (event.target.id === 'patient-search') {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => showPatientList(event.target.value).catch((error) => setNotice(error.message, 'error')), 180);
  }
  if (event.target.matches('[data-draft-field]')) scheduleDraftSave(Number(event.target.dataset.encounterId));
  if (event.target.matches('[data-residual-dose]')) {
    const encounterId = Number(event.target.closest('[data-encounter-card]')?.dataset.encounterCard);
    if (encounterId) scheduleRegimenSave(encounterId);
  }
  if (event.target.matches('[data-mapping-verified]')) {
    const row = event.target.closest('[data-mapping-row]');
    const evidence = row?.querySelector('[data-mapping-evidence]');
    if (evidence) evidence.required = event.target.checked;
  }
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-symptom]')) {
    const encounterId = Number(event.target.dataset.encounterId);
    const card = document.querySelector('[data-encounter-card="' + encounterId + '"]');
    if (event.target.dataset.symptom === 'none' && event.target.checked) {
      card.querySelectorAll('[data-symptom]').forEach((item) => { if (item !== event.target) item.checked = false; });
    } else if (event.target.checked) {
      const none = card.querySelector('[data-symptom="none"]');
      if (none) none.checked = false;
    }
    card.querySelectorAll('.symptom-choice').forEach((choice) => {
      choice.classList.toggle('selected', Boolean(choice.querySelector('input')?.checked));
    });
    const current = state.encounters.get(encounterId);
    current.symptoms = [...card.querySelectorAll('[data-symptom]:checked')].map((item) => item.dataset.symptom);
    const container = card.querySelector('[data-draft-field="symptomOtherText"]')?.parentElement;
    if (current.symptoms.includes('other') && !container) {
      const editor = card.querySelector('.symptom-list')?.parentElement;
      editor?.insertAdjacentHTML('beforeend', '<label>Other symptom note<input maxlength="500" data-draft-field="symptomOtherText" data-encounter-id="' + encounterId + '"></label>');
    } else if (!current.symptoms.includes('other') && container) {
      container.remove();
    }
    scheduleDraftSave(encounterId, true);
  }
  if (event.target.matches('[data-dose-mode]')) {
    const row = event.target.closest('[data-medication-row]');
    const encounterId = Number(event.target.dataset.doseMode);
    row?.querySelector('[data-residual-dose]')?.remove();
    if (event.target.value === 'residual') {
      row?.insertAdjacentHTML('beforeend', '<label>Manual dose (mg)<input type="number" min="0.01" step="0.01" data-residual-dose required></label>');
    }
    if (encounterId) scheduleRegimenSave(encounterId, event.target.value !== 'residual');
  }
  if (event.target.matches('[data-medication-code]')) {
    const row = event.target.closest('[data-medication-row]');
    const encounterId = Number(row?.closest('[id^="medication-items-"]')?.id.replace('medication-items-', ''));
    row?.outerHTML && (row.outerHTML = renderMedicationRow(encounterId, { medicationCode: event.target.value }));
    if (encounterId) scheduleRegimenSave(encounterId);
  }
  if (event.target.matches('[data-change-type]')) {
    const encounterId = Number(event.target.dataset.changeType);
    if (['pause', 'no_medication'].includes(event.target.value)) {
      const target = document.getElementById('medication-items-' + encounterId);
      if (target) target.innerHTML = '';
    }
    scheduleRegimenSave(encounterId, true);
  }
  if (event.target.matches('[data-baseline-select]')) {
    const episodeId = event.target.dataset.episodeId;
    const encounterId = Number(event.target.value);
    flushPendingSaves().then(() => api('/api/episodes/' + episodeId + '/baseline', {
      method: 'PUT', json: { encounterId }
    })).then(() => {
      setNotice('Episode baseline updated.');
      return refreshPatient();
    }).catch((error) => setNotice(error.message, 'error'));
  }
});
window.addEventListener('beforeunload', (event) => {
  if (state.saveTimers.size || state.dirtyEncounters.size || state.regimenTimers.size || state.dirtyRegimens.size || state.pendingWrites.size) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('online', async () => {
  setNotice('Connection restored. Retrying unsaved edits.');
  const encounterIds = new Set([...state.dirtyEncounters, ...state.dirtyRegimens]);
  await Promise.all([...encounterIds].map(async (encounterId) => {
    if (state.pendingWrites.has(encounterId)) {
      await state.saveQueues.get(encounterId)?.catch(() => null);
    }
    if (!navigator.onLine || state.conflictedEncounters.has(encounterId)) return;
    if (state.dirtyEncounters.has(encounterId)) scheduleDraftSave(encounterId, true);
    if (state.dirtyRegimens.has(encounterId) && readRegimenForm(encounterId)) {
      scheduleRegimenSave(encounterId, true);
    }
  }));
});
window.addEventListener('offline', () => setNotice('Offline. Draft edits are not saved until the connection returns.', 'error'));
window.addEventListener('resize', () => {
  if (state.patient) drawPatientCharts(state.patient);
});

initialize();
