const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const listView = document.getElementById('patient-list-view');
const patientView = document.getElementById('patient-view');
const adminView = document.getElementById('admin-view');
const notice = document.getElementById('notice');

const roleLabels = {
  doctor: '醫師',
  nurse_staff: '護理師／診所人員',
  admin: '管理員'
};

const symptomLabelsByCode = {
  none: '無明顯不適',
  nausea: '噁心',
  vomiting: '嘔吐',
  diarrhea: '腹瀉',
  constipation: '便祕',
  bloating: '腹脹',
  abdominal_pain: '腹痛',
  reflux_discomfort: '胃食道不適',
  appetite_too_low: '食慾過低',
  dizziness: '頭暈',
  headache: '頭痛',
  injection_site_discomfort: '注射部位不適',
  other: '其他'
};

const closureLabels = {
  goal_achieved: '達成目標',
  stops_treatment: '病人停止治療',
  adverse_effects: '不良反應',
  other: '其他'
};

const metricLabels = {
  body_weight: '設備測量體重',
  bmi: 'BMI',
  body_fat_percent: '體脂率',
  body_water_kg: '體水分',
  protein_kg: '蛋白質',
  mineral_kg: '礦物質',
  body_fat_mass_kg: '體脂肪量',
  fat_free_mass_kg: '去脂體重',
  skeletal_muscle_kg: '骨骼肌量',
  waist_hip_ratio: '腰臀比',
  subcutaneous_fat_percent: '皮下脂肪率',
  visceral_fat_level: '內臟脂肪等級',
  ideal_weight_kg: '設備估算理想體重',
  weight_control_kg: '設備估算體重控制量',
  fat_control_kg: '設備估算體脂肪控制量',
  muscle_control_kg: '設備估算肌肉控制量',
  basal_metabolic_rate: '基礎代謝率（BMR）',
  body_age_years: '身體年齡',
  body_score: '身體評分',
  trunk_muscle_kg: '軀幹肌肉量',
  left_arm_muscle_kg: '左臂肌肉量',
  right_arm_muscle_kg: '右臂肌肉量',
  left_leg_muscle_kg: '左腿肌肉量',
  right_leg_muscle_kg: '右腿肌肉量',
  trunk_fat_kg: '軀幹脂肪量',
  left_arm_fat_kg: '左臂脂肪量',
  right_arm_fat_kg: '右臂脂肪量',
  left_leg_fat_kg: '左腿脂肪量',
  right_leg_fat_kg: '右腿脂肪量'
};

const auditActionLabels = {
  created: '建立',
  started: '開始療程',
  closed: '結束療程',
  baseline_reassigned: '重新指定基準體重',
  completed: '完成追蹤紀錄',
  correction_completed: '完成更正',
  reopened: '重新開啟',
  corrected: '更正紀錄',
  regimen_corrected: '更正用藥方案',
  body_composition_corrected: '更正身體組成測量連結',
  restore_completed: '完成資料還原'
};

const errorTranslations = {
  'The request could not be completed.': '操作無法完成，請稍後再試。',
  'Sign in is required.': '登入已逾時，請重新登入。',
  'This action is not allowed for your role.': '您目前的角色無權執行此操作。',
  'The requested record was not found.': '找不到要求的資料，可能已不存在或已更新。',
  'API route not found.': '找不到要求的功能，請重新整理頁面後再試。',
  'Request body must be a valid JSON object.': '送出的資料格式不正確，請重新操作。',
  'Device IP must be text.': '設備 IP 位址格式不正確。',
  'Username or password is incorrect.': '帳號或密碼不正確。',
  'Username is required.': '請輸入使用者名稱。',
  'Username must be 3–64 letters, numbers, dots, underscores or hyphens.': '使用者名稱須為 3 至 64 個字元，僅可使用英文字母、數字、句點、底線或連字號。',
  'Display name is required and must be 120 characters or fewer.': '請輸入顯示名稱，且不可超過 120 個字元。',
  'Choose doctor, nurse/clinic staff or admin.': '請選擇醫師、護理師／診所人員或管理員角色。',
  'A user with that username already exists.': '此使用者名稱已有人使用。',
  'User not found.': '找不到此使用者。',
  'Create or activate another administrator before changing this account.': '請先建立或啟用另一位管理員，再變更此帳號。',
  'Password must contain between 12 and 1024 characters.': '密碼長度須介於 12 至 1024 個字元。',
  'Encounter time must be a valid date and time.': '追蹤日期與時間格式不正確。',
  'Patient not found.': '找不到此病人。',
  'Episode not found.': '找不到此療程。',
  'Encounter not found.': '找不到此追蹤紀錄。',
  'MRN is required and must be a string of 64 characters or fewer.': '請輸入 MRN，且不可超過 64 個字元。',
  'Patient name is required and must be 120 characters or fewer.': '請輸入病人姓名，且不可超過 120 個字元。',
  'Phone must be entered as text.': '電話欄位格式不正確。',
  'Phone must be 80 characters or fewer.': '電話不可超過 80 個字元。',
  'A Patient with this MRN already exists.': '此 MRN 已有病人資料。',
  'This Patient already has an active Episode.': '此病人已有進行中的療程。',
  'Only an active Episode can be closed.': '只有進行中的療程可以結束。',
  'Choose a supported Episode closure reason.': '請選擇有效的療程結束原因。',
  'Choose a valid Encounter weight as the Episode baseline.': '請選擇有效的追蹤紀錄體重作為療程基準。',
  'Baseline must be an Encounter weight in this Episode.': '療程基準必須是此療程中的追蹤紀錄體重。',
  'Start a Weight-loss Episode before creating an Encounter.': '請先開始體重管理療程，再新增追蹤紀錄。',
  'A current Encounter version is required to save.': '儲存前需要最新的追蹤紀錄版本。',
  'A current Encounter version is required.': '需要最新的追蹤紀錄版本，請重新載入。',
  'This Encounter changed in another browser. Reload it before saving.': '此追蹤紀錄已在其他瀏覽器更新。請重新載入後再儲存。',
  'This Encounter changed in another browser. Reload it before linking a measurement.': '此追蹤紀錄已在其他瀏覽器更新。請重新載入後再連結測量資料。',
  'Reopen this Encounter before making a correction.': '請先重新開啟此追蹤紀錄，再進行更正。',
  'Reopen this Encounter before changing linked measurements.': '請先重新開啟此追蹤紀錄，再變更已連結的測量資料。',
  'Only a doctor or administrator can edit a reopened Encounter.': '只有醫師或管理員可以編輯已重新開啟的追蹤紀錄。',
  'Only a doctor or administrator can record a medication regimen.': '只有醫師或管理員可以記錄用藥方案。',
  'Only a doctor or administrator can select a medication regimen.': '只有醫師或管理員可以選擇用藥方案。',
  'Only a doctor or administrator can change links on a reopened Encounter.': '只有醫師或管理員可以變更已重新開啟追蹤紀錄的測量連結。',
  'Encounter update contains an unsupported field.': '追蹤紀錄包含不支援的欄位，請重新整理後再試。',
  'Use Continue previous regimen to copy the prior complete regimen.': '請使用「沿用前次用藥方案」複製完整的前次方案。',
  'Pause and no-medication visits must not contain a medication item.': '選擇暫停用藥或本次未用藥時，不能保留藥品項目。',
  'A doctor must complete the Encounter.': '此追蹤紀錄必須由醫師完成。',
  'Select an active doctor as the Encounter physician.': '請選擇有效的看診醫師。',
  'Only a completed Encounter can be reopened.': '只有已完成的追蹤紀錄可以重新開啟。',
  'Enter a correction reason between 3 and 500 characters.': '請輸入更正原因，長度須介於 3 至 500 個字元。',
  'Only a Draft Encounter can be discarded.': '只有草稿追蹤紀錄可以捨棄。',
  'This Encounter has saved clinical content and cannot be silently deleted.': '此追蹤紀錄已有已儲存的臨床內容，無法直接刪除。',
  'This Encounter does not belong to that Patient.': '此追蹤紀錄不屬於該病人。',
  'Choose symptoms from the documented list.': '請從清單選擇症狀。',
  'One or more symptom choices are not supported.': '選擇的症狀包含不支援的項目。',
  'No significant discomfort cannot be combined with another symptom.': '「無明顯不適」不能與其他症狀同時選取。',
  'The Other note must be 500 characters or fewer.': '其他症狀備註不可超過 500 個字元。',
  'Medication items must be a list.': '藥品項目格式不正確。',
  'An Encounter may contain at most 20 medication items.': '一筆追蹤紀錄最多可記錄 20 項藥品。',
  'Choose Mounjaro or Wegovy from the workflow catalog.': '請從清單選擇 Mounjaro 或 Wegovy。',
  'Dose must be a positive numeric mg value.': '劑量須為大於 0 的數值（mg）。',
  'Choose a documented preset dose or select Residual dose.': '請選擇清單中的劑量，或選擇手動輸入劑量。',
  'Choose a supported treatment-change category.': '請選擇有效的治療調整類別。',
  'A device sync is already in progress.': '設備同步作業正在進行中。',
  'HOANBOY device is not configured.': '尚未設定 HOANBOY 設備。',
  'HOANBOY sync failed. Check device availability and its validated source schema, then try again.': 'HOANBOY 同步失敗。請確認設備可連線，且來源資料格式正確，再重試。',
  'HOANBOY device must use a private IPv4 address on the clinic network.': 'HOANBOY 設備必須使用診所內網的私人 IPv4 位址。',
  'Body-composition measurement not found.': '找不到此身體組成測量資料。',
  'This measurement is not linked to the Encounter.': '此測量資料尚未連結至該追蹤紀錄。',
  'This device measurement has been excluded from Patient workflows.': '此設備測量資料已排除於病人追蹤流程之外。',
  'This measurement is already associated with another Patient.': '此測量資料已連結至另一位病人。',
  'This device measurement is already linked to another Encounter.': '此設備測量資料已連結至另一筆追蹤紀錄。',
  'Body-composition report not found.': '找不到此身體組成報告。',
  'This report belongs to another Patient.': '此報告屬於另一位病人。',
  'Metric mapping must be a list.': '指標對應格式不正確。',
  'Metric mapping entry is invalid.': '指標對應項目格式不正確。',
  'Metric mapping contains an unsupported canonical metric.': '指標對應包含不支援的標準指標。',
  'This metric has no confirmed canonical unit and cannot be verified.': '此指標尚未確認標準單位，因此無法標示為已驗證。',
  'Verified mapping must use the documented HOANBOY field and unit.': '已驗證的對應必須使用文件定義的 HOANBOY 欄位與單位。',
  'A verification evidence reference of 1–500 characters is required.': '請提供 1 至 500 個字元的驗證依據。',
  'Backup could not be decrypted or authenticated. The current database was not changed.': '無法解密或驗證備份檔；目前資料庫未變更。',
  'The backup does not contain this active administrator; the current database was not changed.': '備份檔不包含目前使用中的管理員；目前資料庫未變更。',
  'Backup validation or restore failed. The current database remains active.': '備份驗證或還原失敗；目前資料庫仍維持啟用。',
  'Choose a HOANBOY SQLite database file.': '請選擇 HOANBOY SQLite 資料庫檔案。',
  'The uploaded source could not be safely backed up. No history was imported.': '無法安全備份上傳的來源檔，因此未匯入任何歷史資料。',
  'HOANBOY import validation failed. No Patient, measurement or report rows were committed.': 'HOANBOY 匯入驗證失敗；未寫入任何病人、測量或報告資料。'
};

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
  return new Intl.DateTimeFormat('zh-TW-u-ca-gregory-nu-latn', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}

function displayNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits });
}

function localizeError(message, status) {
  const value = String(message || '').trim();
  if (errorTranslations[value]) return errorTranslations[value];
  if (/[\u3400-\u9fff]/.test(value)) return value;
  const measurement = value.match(/^(Weight|Waist circumference) must be a positive number\.$/);
  if (measurement) return (measurement[1] === 'Weight' ? '體重' : '腰圍') + '必須是大於 0 的數值。';
  const outOfRange = value.match(/^(Weight|Waist circumference) is outside the supported measurement range\.$/);
  if (outOfRange) return (outOfRange[1] === 'Weight' ? '體重' : '腰圍') + '超出可接受的測量範圍。';
  if (status === 401) return '登入失敗或已逾時，請確認帳號密碼或重新登入。';
  if (status === 403) return '您目前的角色無權執行此操作。';
  if (status === 404) return '找不到要求的資料，可能已不存在或已更新。';
  if (status === 409) return '資料已在其他頁面更新，請重新載入後再繼續。';
  if (status >= 400 && status < 500) return '送出的資料無法處理，請檢查內容後再試。';
  return '操作無法完成，請稍後再試。';
}

function setNotice(message, type = 'ok') {
  const visibleMessage = type === 'error' ? localizeError(message) : message;
  notice.textContent = visibleMessage;
  notice.hidden = !visibleMessage;
  notice.className = 'notice' + (type === 'error' ? ' error' : type === 'warn' ? ' warn' : '');
  if (visibleMessage) window.setTimeout(() => {
    if (notice.textContent === visibleMessage) notice.hidden = true;
  }, 6000);
}

async function api(path, options = {}) {
  const request = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (options.json !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.json);
    delete request.json;
  }
  let response;
  try {
    response = await fetch(path, request);
  } catch {
    throw new Error('無法連線至伺服器，請確認網路連線後再試一次。');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const body = await response.json();
      message = localizeError(body.error?.message || message, response.status);
      const error = new Error(message);
      error.status = response.status;
      error.details = body.error?.details;
      throw error;
    } catch (error) {
      if (error instanceof Error && error.status) throw error;
      const wrapped = new Error(localizeError(message, response.status));
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
  document.getElementById('login-error').textContent = message ? localizeError(message) : '';
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
  return roleLabels[role] || role;
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
      '<td>' + (patient.episodeStatus ? statusBadge(patient.episodeStatus) : '<span class="badge">尚無療程</span>') + '</td>' +
    '</tr>'
  )).join('');
  return '<div class="page-header"><div><p class="eyebrow">病人名冊</p><h1>病人清單</h1><p>可依 MRN、姓名或電話搜尋病人追蹤資料。</p></div>' +
    '<div class="actions"><button class="primary" data-action="new-patient">新增病人</button></div></div>' +
    '<section class="panel"><div class="toolbar"><label>搜尋<input id="patient-search" type="search" value="' + escapeHtml(search) + '" placeholder="MRN、姓名或電話" autocomplete="off"></label>' +
    '<button data-action="refresh-list">重新整理</button></div>' +
    (patients.length ? '<div class="table-wrap"><table><thead><tr><th>MRN</th><th>姓名</th><th>電話</th><th>目前體重</th><th>療程減重幅度</th><th>最近追蹤日期</th><th>狀態</th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
      '<div class="empty">' + (search ? '找不到符合搜尋條件的病人。' : '目前沒有病人資料。新增第一位病人以開始使用。') + '</div>') +
    '</section>';
}

function statusBadge(status) {
  const labels = {
    active: '進行中',
    closed: '已結束',
    draft: '草稿',
    completed: '已完成',
    reopened: '已重新開啟／更正',
    verified: '已驗證',
    unverified: '未驗證',
    invalid: '無效',
    missing: '缺少資料'
  };
  const label = labels[status] || '其他狀態';
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
    throw new Error('追蹤紀錄尚未儲存。請重試儲存，或解決版本衝突並重新載入後再離開此病人頁面。');
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
    ? '<button data-action="new-encounter" data-id="' + patient.id + '">新增追蹤紀錄</button>' +
      (state.meta.permissions.canManageEpisodes ? '<button class="danger" data-action="close-episode" data-id="' + active.id + '">結束療程</button>' : '')
    : (state.meta.permissions.canManageEpisodes ? '<button class="primary" data-action="start-episode" data-id="' + patient.id + '">開始療程</button>' : '');
  const summary = active
    ? '<div class="metric-grid">' +
      metricCard('基準體重', active.baselineWeightKg, 'kg') +
      metricCard('本次追蹤體重', active.currentWeightKg, 'kg') +
      metricCard('與基準體重差異', active.changeKg, 'kg') +
      metricCard('減重比例', active.weightLossPercent, '%') +
      metricCard('基準腰圍', active.baselineWaistCm, 'cm') +
      metricCard('本次腰圍', active.currentWaistCm, 'cm') +
      '</div>' +
      '<div class="grid two summary-trends">' +
        trendPanel('追蹤體重', 'kg', active.weightTrend, 'weight-' + active.id) +
        trendPanel('腰圍', 'cm', active.waistTrend, 'waist-' + active.id) +
      '</div>'
    : '<div class="empty">目前沒有進行中的體重管理療程。過往追蹤紀錄仍可於下方查看。</div>';

  const episodes = data.episodes.map((episode) => renderEpisode(episode)).join('');
  const encounters = data.encounters.map((encounter) => renderEncounter(encounter)).join('');

  const bodyTrends = Object.entries(data.bodyComposition.trends).map(([code, series]) =>
    trendPanel(metricLabel(code), series.unit, series.points.map((point) => ({ at: point.at, value: point.value })), 'bc-' + safeId(code))
  ).join('');
  const bodyMeasurements = data.bodyComposition.measurements.map((measurement) => (
    '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(measurement.measuredAt)) + '</strong> · ' +
    escapeHtml(measurement.source) + (measurement.isPrimary ? ' · <span class="badge primary-badge">主要測量</span>' : '') +
    '<div class="candidate-metrics">' + escapeHtml(metricsSummary(measurement.metrics)) + '</div></div>' +
    '<button class="small" data-action="measurement-details" data-id="' + measurement.id + '">查看明細</button></div>'
  )).join('');
  const reports = data.bodyComposition.reports.map((report) => (
    '<details class="report-row"><summary>歷史報告 · ' + escapeHtml(formatDate(report.createdAt)) + ' · ' +
    escapeHtml(report.templateVersion) + '</summary><iframe class="report-frame" sandbox src="/api/reports/' + report.id + '" title="歷史身體組成報告"></iframe></details>'
  )).join('');

  return '<div class="page-header"><div><div class="actions"><button class="small" data-action="home">← 返回病人清單</button><button class="small" data-action="refresh-patient" data-id="' + patient.id + '">重新整理紀錄</button></div>' +
    '<p class="eyebrow">病人 · ' + escapeHtml(patient.mrn) + '</p><h1>' + escapeHtml(patient.name) + '</h1><p>' + escapeHtml(patient.phone || '未填寫電話') + '</p></div>' +
    '<div class="actions">' + episodeActions + '</div></div>' +
    '<section class="panel"><div class="panel-heading"><div><h2>目前療程摘要</h2><p class="muted">進度依據本次追蹤體重與指定的基準體重計算。</p></div></div>' +
    summary + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>追蹤紀錄</h2><p class="muted">開啟病人頁面不會自動新增追蹤紀錄。</p></div></div>' +
    (encounters || '<div class="empty">目前沒有追蹤紀錄。</div>') + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>用藥時間軸</h2><p class="muted">記錄醫療人員選擇的用藥方案 · HIS 仍為正式用藥醫囑來源。</p></div></div>' +
    '<div id="medication-timeline-content">' + renderMedicationTimeline(data.medicationTimeline) + '</div></section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>身體組成紀錄</h2><p class="muted">趨勢圖僅顯示已連結主要測量中，已驗證的指標。</p></div>' +
    (state.meta.permissions.canLinkBodyComposition ? '<button data-action="sync-device">同步 HOANBOY 370</button>' : '') + '</div>' +
    (bodyTrends ? '<div class="trend-grid">' + bodyTrends + '</div>' : '<div class="empty">目前沒有已驗證的主要身體組成趨勢資料。</div>') +
    '<h3>測量資料</h3>' + (bodyMeasurements || '<p class="muted">此病人沒有已連結或封存的測量資料。</p>') +
    '<div id="device-candidates" class="stack"></div>' +
    '<h3>歷史報告</h3>' + (reports || '<p class="muted">目前沒有已儲存的歷史報告。</p>') + '</section>' +
    '<section class="panel"><div class="panel-heading"><div><h2>療程歷史</h2><p class="muted">已結束的療程仍會保留供查閱。</p></div></div>' +
    (episodes || '<div class="empty">目前沒有療程紀錄。</div>') + '</section>';
}

function renderMedicationTimeline(entries) {
  const rows = entries.map((entry) => {
    const items = entry.medications.length
      ? entry.medications.map((item) => escapeHtml(item.medicationName) + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? '（手動輸入）' : '')).join('、')
      : '未記錄藥品';
    return '<tr><td>' + escapeHtml(formatDate(entry.occurredAt)) + '</td><td>' + treatmentLabel(entry.treatmentChange) + '</td><td>' + items + '</td></tr>';
  }).join('');
  return rows
    ? '<div class="table-wrap"><table><thead><tr><th>追蹤日期</th><th>治療調整</th><th>藥品與劑量</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty">目前沒有用藥方案紀錄。</div>';
}

function renderEpisode(episode) {
  const weightedEncounters = episode.encounters.filter((encounter) => encounter.weightKg !== null);
  const baselineOptions = weightedEncounters.map((encounter) =>
    '<option value="' + encounter.id + '" ' + (encounter.id === episode.baselineEncounterId ? 'selected' : '') + '>' +
    escapeHtml(formatDate(encounter.occurredAt)) + ' · ' + displayNumber(encounter.weightKg) + ' kg</option>').join('');
  const baselineControl = state.meta.permissions.canManageEpisodes
    ? (baselineOptions
      ? '<label class="baseline-picker">基準追蹤體重<select data-baseline-select data-episode-id="' + episode.id + '">' + baselineOptions + '</select></label>'
      : '<p class="muted">此療程有有效的追蹤體重後，系統會自動設定基準。</p>')
    : '';
  return '<details class="encounter-card"><summary><span>' + statusBadge(episode.status) + ' <strong>療程 ' + episode.id + '</strong> · ' +
    escapeHtml(formatDate(episode.startedAt, false)) + (episode.endedAt ? ' – ' + escapeHtml(formatDate(episode.endedAt, false)) : '') +
    '</span><span class="muted">' + (episode.closureReason ? escapeHtml(closureLabel(episode.closureReason)) : '') + '</span></summary>' +
    '<div class="encounter-content"><div class="metric-grid">' +
    metricCard('基準體重', episode.baselineWeightKg, 'kg') +
    metricCard('目前體重', episode.currentWeightKg, 'kg') +
    metricCard('體重差異', episode.changeKg, 'kg') +
    metricCard('減重比例', episode.weightLossPercent, '%') +
    metricCard('基準腰圍', episode.baselineWaistCm, 'cm') +
    metricCard('目前腰圍', episode.currentWaistCm, 'cm') + '</div>' + baselineControl + '</div></details>';
}

function renderEncounter(encounter) {
  const editable = encounter.status === 'draft' ||
    (encounter.status === 'reopened' && state.meta.permissions.canCorrectEncounters);
  const status = statusBadge(encounter.status);
  const symptoms = symptomLabels(encounter.symptoms).join('、') || '未記錄症狀';
  const medications = encounter.medications.length
    ? encounter.medications.map((item) => escapeHtml(item.medicationName) + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? ' · 手動輸入' : '')).join('、')
    : '未記錄藥品';
  const editForm = editable ? renderEncounterEditor(encounter) :
    (encounter.status === 'reopened'
      ? '<div class="muted-box">此追蹤紀錄已重新開啟，須由醫師或管理員進行更正。</div>'
      : '<div class="muted-box">此追蹤紀錄已完成。如需變更臨床內容，請先透過更正流程重新開啟。</div>');
  const controls = editable
    ? (state.meta.permissions.canCompleteEncounters
      ? '<div class="actions"><button class="primary" data-action="complete-encounter" data-id="' + encounter.id + '">完成追蹤紀錄</button>' +
        (state.user.role === 'admin' ? renderPhysicianSelect(encounter) : '') + '</div>' : '') +
      (encounter.status === 'draft' ? '<button class="danger small" data-action="delete-empty-draft" data-id="' + encounter.id + '">捨棄空白草稿</button>' : '')
    : (state.meta.permissions.canCorrectEncounters
      ? '<button class="small" data-action="reopen-encounter" data-id="' + encounter.id + '">重新開啟以更正</button>' : '');
  const linkedMeasurements = encounter.bodyComposition.map((measurement) =>
    '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(measurement.measuredAt)) + '</strong> · 設備測量 ' +
    (measurement.isPrimary ? '<span class="badge active">主要測量</span>' : '<span class="badge">重複測量</span>') +
    '</div><div class="actions">' + (editable && !measurement.isPrimary
      ? '<button class="small" data-action="make-primary" data-encounter-id="' + encounter.id + '" data-id="' + measurement.id + '">設為主要測量</button>' : '') +
      (editable ? '<button class="small danger" data-action="unlink-measurement" data-encounter-id="' + encounter.id + '" data-id="' + measurement.id + '">解除連結</button>' : '') +
    '</div></div>'
  ).join('');
  return '<details class="encounter-card" data-encounter-card="' + encounter.id + '"><summary><span><strong>' +
    escapeHtml(formatDate(encounter.occurredAt)) + '</strong> · ' + status + '</span><span>' +
    (encounter.weightKg === null ? '未記錄體重' : displayNumber(encounter.weightKg) + ' kg') + ' · ' +
    escapeHtml(encounter.physicianName || '未記錄看診醫師') + '</span></summary>' +
    '<div class="encounter-content"><div class="actions"><span class="muted">版本 ' + encounter.version + '</span>' +
    '<div class="save-status" id="save-status-' + encounter.id + '" aria-live="polite"></div></div>' +
    '<div class="grid two"><div><p class="section-label">症狀</p><p>' + escapeHtml(symptoms) +
    (encounter.symptomOtherText ? ' · ' + escapeHtml(encounter.symptomOtherText) : '') + '</p></div>' +
    '<div><p class="section-label">用藥紀錄</p><p data-regimen-summary>' + escapeHtml(encounter.treatmentChange ? treatmentLabel(encounter.treatmentChange) : '未記錄治療調整') +
    ' · ' + escapeHtml(medications) + '</p></div></div>' + editForm +
    '<div><p class="section-label">身體組成測量</p>' +
    (linkedMeasurements || '<p class="muted">此追蹤紀錄尚未連結設備測量資料。</p>') +
    (editable && state.meta.permissions.canLinkBodyComposition ? '<button class="small" data-action="find-candidates" data-encounter-id="' + encounter.id + '">尋找設備測量資料</button><div class="candidate-list" id="candidate-list-' + encounter.id + '"></div>' : '') +
    '</div><div class="actions">' + controls + '</div></div></details>';
}

function renderPhysicianSelect(encounter) {
  const options = state.doctors.map((doctor) =>
    '<option value="' + doctor.id + '" ' + (doctor.id === encounter.physicianUserId ? 'selected' : '') + '>' + escapeHtml(doctor.displayName) + '</option>'
  ).join('');
  return '<label class="physician-picker">看診醫師<select id="physician-' + encounter.id + '"><option value="">選擇醫師</option>' + options + '</select></label>';
}

function renderEncounterEditor(encounter) {
  const choices = state.meta.symptoms.map((symptom) => {
    const checked = encounter.symptoms.includes(symptom.code);
    return '<label class="symptom-choice ' + (checked ? 'selected' : '') + '"><input type="checkbox" data-symptom="' + escapeHtml(symptom.code) +
      '" data-encounter-id="' + encounter.id + '" ' + (checked ? 'checked' : '') + '><span>' + escapeHtml(symptomLabelsByCode[symptom.code] || '其他症狀') + '</span></label>';
  }).join('');
  const otherText = encounter.symptoms.includes('other')
    ? '<label>其他症狀備註<input maxlength="500" data-draft-field="symptomOtherText" data-encounter-id="' + encounter.id + '" value="' + escapeHtml(encounter.symptomOtherText) + '"></label>' : '';
  const regimen = state.meta.permissions.canManageMedication
    ? renderRegimenEditor(encounter)
    : '<div class="muted-box"><strong>用藥追蹤</strong><br>' + escapeHtml(encounter.treatmentChange ? treatmentLabel(encounter.treatmentChange) : '尚未記錄治療調整') +
      ' · ' + escapeHtml(encounter.medications.map((item) => item.medicationName + ' ' + item.doseMg + ' mg').join('、') || '未記錄藥品') + '</div>';
  return '<div class="grid two"><label>本次體重（kg）<input inputmode="decimal" type="number" min="0.1" step="0.1" data-draft-field="weightKg" data-encounter-id="' + encounter.id +
    '" value="' + escapeHtml(encounter.weightKg ?? '') + '" placeholder="選填"></label>' +
    '<label>腰圍（cm）<input inputmode="decimal" type="number" min="0.1" step="0.1" data-draft-field="waistCm" data-encounter-id="' + encounter.id +
    '" value="' + escapeHtml(encounter.waistCm ?? '') + '" placeholder="選填"></label></div>' +
    '<div><p class="section-label">症狀（不記錄嚴重程度或藥物因果關係）</p><div class="symptom-list">' + choices + '</div>' + otherText + '</div>' +
    '<div><p class="section-label">用藥流程</p>' + regimen + '</div>';
}

function renderRegimenEditor(encounter) {
  const savedContinueOption = encounter.treatmentChange === 'continue'
    ? '<option value="continue" selected disabled>維持前次用藥方案</option>'
    : '';
  const changeOptions = state.meta.treatmentChangeTypes.filter((change) => change !== 'continue').map((change) =>
    '<option value="' + change + '" ' + (encounter.treatmentChange === change ? 'selected' : '') + '>' + treatmentLabel(change) + '</option>'
  ).join('');
  return '<div class="callout">此功能僅供追蹤記錄。用藥方案由醫療人員選擇；HIS 仍為正式醫囑來源。</div>' +
    '<div class="inline-form"><label>治療調整類別<select data-change-type="' + encounter.id + '"><option value="">選擇類別</option>' + savedContinueOption + changeOptions + '</select></label>' +
    '<button class="small" data-action="continue-regimen" data-id="' + encounter.id + '">沿用前次用藥方案</button></div>' +
    '<div id="medication-items-' + encounter.id + '">' + encounter.medications.map((item) => renderMedicationRow(encounter.id, item)).join('') + '</div>' +
    '<div class="actions"><button class="small" data-action="add-medication" data-id="' + encounter.id + '">新增藥品</button>' +
    '<button class="small primary" data-action="save-regimen" data-id="' + encounter.id + '">儲存用藥紀錄</button></div>';
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
    '<label>藥品<select data-medication-code><option value="">選擇藥品</option>' + medicationOptions + '</select></label>' +
    '<label>劑量<select data-dose-mode="' + encounterId + '" ' + (!catalog ? 'disabled' : '') + '><option value="">選擇劑量</option>' + doseOptions +
    (catalog ? '<option value="residual" ' + (residualSelected ? 'selected' : '') + '>手動輸入劑量</option>' : '') + '</select></label>' +
    (residualSelected ? '<label>自行輸入劑量（mg）<input type="number" min="0.01" step="0.01" data-residual-dose value="' + escapeHtml(item.doseMg) + '"></label>' :
      '<span class="dose-note">SC · 每週 · 1 支注射筆</span>') +
    '<button class="small danger" data-action="remove-medication" type="button">移除</button></div>';
}

function treatmentLabel(value) {
  return ({
    continue: '維持前次用藥方案',
    increase: '調高劑量',
    decrease: '調低劑量',
    change: '更換藥物',
    pause: '暫停用藥',
    no_medication: '本次未使用體重管理藥物'
  })[value] || value || '—';
}

function closureLabel(value) {
  return closureLabels[value] || '其他';
}

function symptomLabels(codes) {
  return (codes || []).map((code) => symptomLabelsByCode[code] || '其他症狀');
}

function auditActionLabel(action) {
  return auditActionLabels[action] || '系統紀錄更新';
}

function auditEntityLabel(entityType) {
  return ({
    patient: '病人',
    episode: '療程',
    encounter: '追蹤紀錄',
    system: '系統'
  })[entityType] || '其他資料';
}

function metricLabel(code) {
  return metricLabels[code] || '其他指標（' + String(code).replaceAll('_', ' ') + '）';
}

function unitLabel(unit) {
  return ({
    unverified: '尚未確認',
    years: '年',
    points: '分',
    level: '級',
    ratio: '比值'
  })[unit] || unit;
}

function auditReasonLabel(reason) {
  return reason === 'Continue previous regimen' ? '沿用前次用藥方案' : reason;
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function metricsSummary(metrics) {
  const preferred = new Set(['body_weight', 'body_fat_percent', 'bmi']);
  return metrics.filter((metric) => preferred.has(metric.metricCode) && metric.value !== null)
    .map((metric) => metricLabel(metric.metricCode) + ' ' + displayNumber(metric.value) + ' ' + unitLabel(metric.unit) +
      (metric.status === 'verified' ? '' : '（尚未驗證）')).join(' · ') || '尚無對應指標';
}

function trendPanel(title, unit, points, id) {
  const data = points || [];
  if (!data.length || data.every((point) => point.value === null || point.value === undefined)) {
    return '<div class="trend-card"><h4>' + escapeHtml(title) + '</h4><div class="chart-empty">目前沒有測量資料。</div></div>';
  }
  return '<div class="trend-card"><h4>' + escapeHtml(title) + ' <small>(' + escapeHtml(unitLabel(unit)) + ')</small></h4>' +
    '<canvas class="chart" id="' + escapeHtml(id) + '" data-points="' + escapeHtml(JSON.stringify(data)) + '" aria-label="' + escapeHtml(title) + ' 趨勢圖"></canvas></div>';
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
  context.font = '11px "Noto Sans TC", "Microsoft JhengHei UI", sans-serif';
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
    setSaveStatus(encounterId, '資料衝突 · 請重新載入後再編輯', 'error');
    return;
  }
  const prior = state.saveTimers.get(encounterId);
  if (prior) window.clearTimeout(prior);
  state.dirtyEncounters.add(encounterId);
  setSaveStatus(encounterId, navigator.onLine ? '尚有變更未儲存' : '離線 · 變更尚未儲存', navigator.onLine ? '' : 'error');
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
      setSaveStatus(encounterId, '離線 · 變更尚未儲存', 'error');
      return;
    }
    const signature = JSON.stringify(fields);
    setSaveStatus(encounterId, '儲存中…');
    try {
      const result = await api('/api/encounters/' + encounterId, {
        method: 'PATCH',
        json: { expectedVersion: current.version, ...fields }
      });
      state.encounters.set(encounterId, result.encounter);
      if (!state.saveTimers.has(encounterId) && JSON.stringify(draftFormValues(encounterId)) === signature) {
        state.dirtyEncounters.delete(encounterId);
        setSaveStatus(encounterId, '已儲存 · ' + formatDate(new Date().toISOString()), 'saved');
      } else {
        setSaveStatus(encounterId, '尚有變更未儲存');
      }
      if (state.patient) {
        const index = state.patient.encounters.findIndex((item) => item.id === encounterId);
        if (index >= 0) state.patient.encounters[index] = result.encounter;
      }
    } catch (error) {
      const status = document.getElementById('save-status-' + encounterId);
      setSaveStatus(encounterId, error.status === 409
        ? '資料衝突 · 請重新載入後再編輯'
        : '儲存失敗 · 變更尚未儲存', 'error');
      if (status) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'small';
        action.dataset.action = error.status === 409 ? 'reload-encounter' : 'retry-save';
        action.dataset.id = String(encounterId);
        action.textContent = error.status === 409 ? '重新載入追蹤紀錄' : '重試儲存';
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
    setSaveStatus(encounterId, '資料衝突 · 請重新載入後再編輯', 'error');
    return;
  }
  const prior = state.regimenTimers.get(encounterId);
  if (prior) window.clearTimeout(prior);
  state.regimenTimers.delete(encounterId);
  state.dirtyRegimens.add(encounterId);
  const form = readRegimenForm(encounterId);
  if (!form) {
    setSaveStatus(encounterId, '用藥資料尚未填完整 · 未儲存', 'error');
    return;
  }
  if (!navigator.onLine) {
    setSaveStatus(encounterId, '離線 · 用藥變更尚未儲存', 'error');
    return;
  }
  setSaveStatus(encounterId, '用藥變更尚未儲存');
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
      setSaveStatus(encounterId, '用藥資料尚未填完整 · 未儲存', 'error');
      return;
    }
    if (!navigator.onLine) {
      setSaveStatus(encounterId, '離線 · 用藥變更尚未儲存', 'error');
      return;
    }
    const signature = JSON.stringify(form);
    setSaveStatus(encounterId, '正在儲存用藥紀錄…');
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
          ? result.encounter.medications.map((item) => item.medicationName + ' ' + displayNumber(item.doseMg, 2) + ' mg' + (item.residualDose ? '（手動輸入）' : '')).join('、')
          : '未記錄藥品';
        summary.textContent = (result.encounter.treatmentChange ? treatmentLabel(result.encounter.treatmentChange) : '未記錄治療調整') + ' · ' + medications;
      }
      if (JSON.stringify(readRegimenForm(encounterId)) === signature && !state.regimenTimers.has(encounterId)) {
        state.dirtyRegimens.delete(encounterId);
        setSaveStatus(encounterId, '用藥紀錄已儲存 · ' + formatDate(new Date().toISOString()), 'saved');
      } else {
        setSaveStatus(encounterId, '用藥變更尚未儲存');
      }
    } catch (error) {
      const status = document.getElementById('save-status-' + encounterId);
      setSaveStatus(encounterId, error.status === 409
        ? '資料衝突 · 請重新載入後再編輯'
        : '用藥儲存失敗 · 變更尚未儲存', 'error');
      if (status) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'small';
        action.dataset.action = error.status === 409 ? 'reload-encounter' : 'retry-regimen-save';
        action.dataset.id = String(encounterId);
        action.textContent = error.status === 409 ? '重新載入追蹤紀錄' : '重試儲存用藥';
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
  if (!patientId) throw new Error('請重新開啟病人頁面，以重新載入此追蹤紀錄。');
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
    '<header><div><p class="eyebrow">診所工作流程</p><h2 id="dialog-title">' + escapeHtml(title) + '</h2></div>' +
    '<button class="small" data-action="close-modal" aria-label="關閉">關閉</button></header>' + body + '</section></div>');
  document.querySelector('#dialog-backdrop input')?.focus();
}

async function showAdmin(section = state.adminSection) {
  await flushPendingSaves();
  state.adminSection = section;
  listView.hidden = true;
  patientView.hidden = true;
  adminView.hidden = false;
  const tabs = '<nav class="admin-tabs" aria-label="管理功能分頁">' +
    adminTab('users', '使用者與角色') + adminTab('audit', '稽核紀錄') +
    adminTab('config', '流程設定') + adminTab('data', '備份與資料匯入') + '</nav>';
  let content = '';
  if (section === 'users') content = await renderAdminUsers();
  if (section === 'audit') content = await renderAdminAudit();
  if (section === 'config') content = await renderAdminConfig();
  if (section === 'data') content = renderAdminData();
  adminView.innerHTML = '<div class="page-header"><div><p class="eyebrow">管理功能</p><h1>診所設定</h1><p>每項操作都會由系統確認使用者權限。</p></div></div>' +
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
    '<label>顯示名稱<input name="displayName" value="' + escapeHtml(user.displayName) + '" required></label>' +
    '<label>角色<select name="role">' + state.meta.roles.map((role) =>
      '<option value="' + role.value + '" ' + (role.value === user.role ? 'selected' : '') + '>' + escapeHtml(roleLabel(role.value)) + '</option>'
    ).join('') + '</select></label>' +
    '<label>新密碼<input name="password" type="password" autocomplete="new-password" placeholder="留白則不變更" minlength="12"></label>' +
    '<label class="primary-switch"><input name="active" type="checkbox" ' + (user.active ? 'checked' : '') + '> 啟用</label>' +
    '<button class="small" type="submit">儲存</button></form>'
  ).join('');
  return '<section class="panel"><div class="panel-heading"><div><h2>診所使用者</h2><p class="muted">變更角色或重設密碼會讓既有登入工作階段失效。</p></div></div>' +
    '<form id="create-user-form" class="two-column-form"><label>使用者名稱<input name="username" minlength="3" maxlength="64" required></label>' +
    '<label>顯示名稱<input name="displayName" maxlength="120" required></label><label>角色<select name="role">' +
    state.meta.roles.map((role) => '<option value="' + role.value + '">' + escapeHtml(roleLabel(role.value)) + '</option>').join('') +
    '</select></label><label>初始密碼<input name="password" type="password" minlength="12" autocomplete="new-password" required></label>' +
    '<div class="full"><button class="primary" type="submit">建立使用者</button></div></form></section>' +
    '<section class="panel"><h2>現有使用者</h2>' + (rows || '<div class="empty">尚未設定使用者。</div>') + '</section>';
}

async function renderAdminAudit() {
  const result = await api('/api/admin/audit?limit=200');
  const rows = result.events.map((event) =>
    '<tr><td>' + escapeHtml(formatDate(event.at)) + '</td><td>' + escapeHtml(event.actor) + '</td><td>' +
    escapeHtml(auditActionLabel(event.action)) + '</td><td>' + escapeHtml(auditEntityLabel(event.entityType)) + ' · ' + escapeHtml(event.entityId) + '</td>' +
    '<td>' + escapeHtml(auditReasonLabel(event.reason || '—')) +
    '<details><summary>變更內容</summary><pre>' + escapeHtml(JSON.stringify({ 變更前: event.before, 變更後: event.after }, null, 2)) + '</pre></details></td></tr>'
  ).join('');
  return '<section class="panel"><div class="panel-heading"><div><h2>重要稽核事件</h2><p class="muted">草稿自動儲存的輸入過程不會列為臨床稽核事件。</p></div></div>' +
    (rows ? '<div class="table-wrap"><table><thead><tr><th>時間</th><th>操作者</th><th>動作</th><th>資料</th><th>原因</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">目前沒有稽核事件。</div>') + '</section>';
}

async function renderAdminConfig() {
  const result = await api('/api/admin/config');
  const hoanboy = result.hoanboy;
  const rows = hoanboy.mappings.map((mapping) =>
    '<div class="mapping-row" data-mapping-row="' + escapeHtml(mapping.metricCode) + '">' +
    '<span class="mapping-title">' + escapeHtml(metricLabel(mapping.metricCode)) + '</span>' +
    '<span class="mapping-field">' + escapeHtml(mapping.sourceField) + '</span>' +
    '<span data-mapping-unit data-unit="' + escapeHtml(mapping.unit) + '">' + escapeHtml(unitLabel(mapping.unit)) + '</span>' +
    '<label><span class="visually-hidden">' + escapeHtml(metricLabel(mapping.metricCode)) + '的驗證依據</span><input type="text" data-mapping-evidence maxlength="500" value="' + escapeHtml(mapping.evidence) + '" placeholder="驗證依據"></label>' +
    '<label class="primary-switch"><input type="checkbox" data-mapping-verified ' + (mapping.verified ? 'checked' : '') +
    (mapping.unit === 'unverified' ? ' disabled' : '') + '> 已驗證</label></div>'
  ).join('');
  const medicines = Object.entries(result.medicationCatalog).map(([code, catalog]) =>
    '<tr><td>' + escapeHtml(catalog.name) + '</td><td>' + catalog.doses.map((dose) => dose + ' mg').join('、') +
    ' · 手動輸入</td><td>' + escapeHtml(catalog.route) + '</td><td>每週</td><td>1 支注射筆</td></tr>'
  ).join('');
  return '<section class="panel"><h2>HOANBOY 370 身體組成分析設備</h2><p class="muted">設備資料讀取與欄位解析由可替換的設備介接模組負責。</p>' +
    '<form id="hoanboy-device-form" class="inline-form"><label>設備內網 IPv4 位址<input name="deviceIp" value="' + escapeHtml(hoanboy.deviceIp || '') + '" placeholder="192.168.1.100"></label>' +
    '<button class="primary" type="submit">儲存設備設定</button><span>' + (hoanboy.deviceConfigured ? '<span class="badge active">已設定</span>' : '<span class="badge">尚未設定</span>') + '</span></form>' +
    '<form id="mapping-form"><p class="callout warning">管理員須記錄指標意義與單位的驗證依據，指標才會納入跨次追蹤趨勢。尚未確認標準單位的指標無法標示為已驗證。</p>' +
    '<div class="mapping-row"><strong>指標</strong><strong>來源欄位</strong><strong>單位</strong><strong>驗證依據</strong><strong>驗證狀態</strong></div>' + rows +
    '<p><button class="primary" type="submit">儲存已驗證的對應</button></p></form></section>' +
    '<section class="panel"><h2>用藥流程預設選項</h2><p class="muted">初版固定流程設定，不代表臨床建議。</p>' +
    '<div class="table-wrap"><table><thead><tr><th>藥品</th><th>預設劑量</th><th>途徑</th><th>頻率</th><th>數量</th></tr></thead><tbody>' + medicines + '</tbody></table></div></section>';
}

function renderAdminData() {
  return '<section class="panel"><h2>加密備份</h2><p class="muted">備份包含資料庫與已儲存的報告檔案，並使用主機設定的備份密語加密。</p>' +
    '<div class="actions"><button class="primary" data-action="create-backup">下載加密備份</button></div>' +
    '<form id="restore-form" class="stack admin-upload"><label>還原加密備份<input name="backup" type="file" accept=".wmtbackup,application/vnd.weight-management-tracker.backup" required></label>' +
    '<label class="primary-switch"><input name="confirm" type="checkbox" required> 驗證後以備份資料取代目前的應用程式資料</label>' +
    '<button class="danger" type="submit">驗證並還原</button></form></section>' +
    '<section class="panel"><h2>匯入 HOANBOY 歷史資料</h2><p class="muted">請選擇舊版應用程式資料庫的唯讀副本。匯入前系統會先加密備份來源檔，並以完全相同的 MRN 比對病人資料。</p>' +
    '<form id="migration-form" class="stack admin-upload"><label>HOANBOY SQLite 資料庫<input name="source" type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" required></label>' +
    '<button class="primary" type="submit">備份並匯入歷史資料</button></form><div class="callout warning">驗證期間請將舊版追蹤系統維持唯讀。匯入作業不會依設備時間戳記建立追蹤紀錄或療程。</div></section>';
}

async function saveRegimen(encounterId) {
  const alreadyPending = state.dirtyRegimens.has(encounterId);
  await flushEncounterTimer(encounterId);
  const timer = state.regimenTimers.get(encounterId);
  if (timer) {
    window.clearTimeout(timer);
    state.regimenTimers.delete(encounterId);
  }
  if (!readRegimenForm(encounterId)) throw new Error('儲存前請先選擇治療調整類別，並完成每項藥品劑量。');
  if (!alreadyPending) {
    state.dirtyRegimens.add(encounterId);
    await queueRegimenSave(encounterId);
  }
  if (state.dirtyRegimens.has(encounterId)) throw new Error('用藥紀錄尚未儲存。請重試，或重新載入後再繼續。');
  setNotice('用藥紀錄已儲存。');
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
    throw new Error('追蹤紀錄尚未儲存。請重試，或重新載入後再繼續。');
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
      '<div class="candidate-row"><div><strong>' + escapeHtml(formatDate(candidate.measuredAt)) + '</strong> · ' + escapeHtml(candidate.source || '身體組成分析設備') +
      (candidate.sourceIdentifier ? ' · ' + escapeHtml(candidate.sourceIdentifier) : '') +
      '<div class="candidate-metrics">' + escapeHtml(metricsSummary(candidate.metrics)) + '</div></div>' +
      '<label class="primary-switch"><input type="checkbox" data-candidate-primary="' + candidate.id + '" ' +
      (!currentPrimary ? 'checked' : '') + '> 設為主要測量</label>' +
      '<button class="small" data-action="link-measurement" data-encounter-id="' + encounterId + '" data-id="' + candidate.id + '">確認連結</button></div>'
    ).join('') : '<p class="muted">目前沒有可連結的設備測量資料。請同步設備或確認病人配對資料。</p>';
  } catch (error) {
    target.textContent = localizeError(error.message, error.status);
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
    setNotice('已下載加密備份。');
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
      openModal('新增病人', '<form id="create-patient-form" class="stack"><label>MRN<input name="mrn" maxlength="64" required></label>' +
        '<label>姓名<input name="name" maxlength="120" required></label><label>電話<input name="phone" maxlength="80"></label>' +
        '<button class="primary" type="submit">建立病人</button></form>');
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
      setNotice('已開始體重管理療程。');
      await openPatient(id);
    } else if (action === 'new-encounter') {
      const result = await api('/api/patients/' + id + '/encounters', { method: 'POST', json: {} });
      setNotice('已新增追蹤紀錄草稿。輸入內容會自動儲存。');
      await openPatient(id);
      const card = document.querySelector('[data-encounter-card="' + result.encounter.id + '"]');
      if (card) card.open = true;
    } else if (action === 'close-episode') {
      const options = state.meta.closureReasons.map((reason) => '<option value="' + reason.value + '">' + escapeHtml(closureLabel(reason.value)) + '</option>').join('');
      openModal('結束體重管理療程', '<form id="close-episode-form" class="stack" data-episode-id="' + id + '"><label>結束原因<select name="reason">' + options + '</select></label>' +
        '<button class="primary" type="submit">結束療程</button></form>');
    } else if (action === 'complete-encounter') {
      const encounter = state.encounters.get(id);
      await flushEncounterTimer(id);
      const physicianSelect = document.getElementById('physician-' + id);
      const payload = { expectedVersion: state.encounters.get(id).version };
      if (physicianSelect) payload.physicianUserId = physicianSelect.value ? Number(physicianSelect.value) : null;
      const result = await api('/api/encounters/' + id + '/complete', { method: 'POST', json: payload });
      state.encounters.set(id, result.encounter);
      setNotice('追蹤紀錄已完成。');
      await refreshPatient();
    } else if (action === 'reopen-encounter') {
      const reason = window.prompt('請輸入重新開啟原因（3 至 500 個字元）。');
      if (!reason) return;
      const encounter = state.encounters.get(id);
      await api('/api/encounters/' + id + '/reopen', { method: 'POST', json: { expectedVersion: encounter.version, reason } });
      setNotice('追蹤紀錄已重新開啟，更正內容會留下稽核紀錄。');
      await refreshPatient();
    } else if (action === 'delete-empty-draft') {
      if (!window.confirm('只有在草稿沒有任何已儲存的臨床內容時，才能捨棄。確定要繼續嗎？')) return;
      await flushEncounterTimer(id);
      const encounter = state.encounters.get(id);
      await api('/api/encounters/' + id, { method: 'DELETE', json: { expectedVersion: encounter.version } });
      setNotice('空白草稿已捨棄。');
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
      setNotice(result.copiedFromEncounterId ? '已複製前次用藥方案，請確認內容。' : '沒有可沿用的用藥方案，目前清單為空。');
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
      setNotice('設備同步完成：新增 ' + result.added + ' 筆、更新 ' + result.updated + ' 筆、未變更 ' + result.unchanged + ' 筆。');
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
      setNotice('設備測量資料已連結至這筆追蹤紀錄。');
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
      setNotice('主要身體組成測量資料已更新。');
      await refreshPatient();
    } else if (action === 'unlink-measurement') {
      const encounterId = Number(button.dataset.encounterId);
      await flushEncounterTimer(encounterId);
      const encounter = state.encounters.get(encounterId);
      await api('/api/encounters/' + encounterId + '/body-composition-links/' + id, {
        method: 'DELETE',
        json: { expectedVersion: encounter.version }
      });
      setNotice('已解除測量資料連結；該資料與病人的關聯仍會保留供查閱。');
      await refreshPatient();
    } else if (action === 'measurement-details') {
      const result = await api('/api/body-composition/measurements/' + id);
      const metrics = result.measurement.metrics.map((metric) =>
        '<tr><td>' + escapeHtml(metricLabel(metric.metricCode)) + '</td><td>' + (metric.value === null ? '—' : displayNumber(metric.value, 2)) + '</td>' +
        '<td>' + escapeHtml(unitLabel(metric.unit)) + '</td><td>' + statusBadge(metric.status) + '</td></tr>'
      ).join('');
      const sourceHistory = result.measurement.sourceHistory.length
        ? '<h3>匯入來源指派歷史</h3><ul>' + result.measurement.sourceHistory.map((event) =>
          '<li>' + escapeHtml(formatDate(event.at)) + ' · ' + escapeHtml(auditActionLabel(event.action)) + ' · ' + escapeHtml(event.actor || '來源資料管理者') + '</li>'
        ).join('') + '</ul>' : '';
      openModal('身體組成測量明細', '<p class="muted">' + escapeHtml(formatDate(result.measurement.measuredAt)) +
        ' · 來源版本 ' + result.measurement.revision + ' · 來源識別碼 ' + escapeHtml(result.measurement.sourceKey) +
        '</p><div class="table-wrap"><table><thead><tr><th>指標</th><th>數值</th><th>單位</th><th>驗證狀態</th></tr></thead><tbody>' + metrics + '</tbody></table></div>' + sourceHistory);
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
      setNotice('登入成功。');
    } else if (form.id === 'create-patient-form') {
      const result = await api('/api/patients', { method: 'POST', json: {
        mrn: data.get('mrn'), name: data.get('name'), phone: data.get('phone') || ''
      } });
      document.getElementById('dialog-backdrop')?.remove();
      setNotice('病人資料已建立。');
      await openPatient(result.patient.id);
    } else if (form.id === 'create-user-form') {
      await api('/api/admin/users', { method: 'POST', json: {
        username: data.get('username'), displayName: data.get('displayName'),
        role: data.get('role'), password: data.get('password')
      } });
      setNotice('診所使用者已建立。');
      await showAdmin('users');
    } else if (form.id === 'close-episode-form') {
      await api('/api/episodes/' + form.dataset.episodeId + '/close', { method: 'POST', json: { reason: data.get('reason') } });
      document.getElementById('dialog-backdrop')?.remove();
      setNotice('療程已結束。');
      await refreshPatient();
    } else if (form.matches('[data-user-form]')) {
      const userId = Number(form.dataset.userForm);
      await api('/api/admin/users/' + userId, { method: 'PATCH', json: {
        displayName: data.get('displayName'), role: data.get('role'),
        password: data.get('password') || undefined, active: data.get('active') === 'on'
      } });
      if (userId === state.user.id && data.get('role') !== state.user.role) {
        setNotice('您的角色已變更，請重新登入以更新權限。', 'warn');
        await api('/api/auth/logout', { method: 'POST', json: {} });
        showLogin();
        return;
      }
      setNotice('使用者資料已更新。權限變更時，既有登入工作階段會一併失效。');
      await showAdmin('users');
    } else if (form.id === 'hoanboy-device-form') {
      const result = await api('/api/admin/config/hoanboy/device', { method: 'PUT', json: { deviceIp: data.get('deviceIp') } });
      setNotice(result.hoanboy.deviceConfigured ? 'HOANBOY 設備已設定。' : 'HOANBOY 設備整合已停用。');
      await showAdmin('config');
    } else if (form.id === 'mapping-form') {
      const mappings = [...form.querySelectorAll('[data-mapping-row]')].map((row) => ({
        metricCode: row.dataset.mappingRow,
        sourceField: row.querySelector('.mapping-field').textContent,
        unit: row.querySelector('[data-mapping-unit]')?.dataset.unit || '',
        verified: row.querySelector('[data-mapping-verified]').checked,
        evidence: row.querySelector('[data-mapping-evidence]').value
      }));
      await api('/api/admin/config/hoanboy/mappings', { method: 'PUT', json: { mappings } });
      setNotice('指標對應已儲存。只有已驗證的標準化數值會納入預設趨勢圖。');
      await showAdmin('config');
    } else if (form.id === 'restore-form') {
      if (data.get('confirm') !== 'on') throw new Error('還原前請先勾選確認欄位。');
      const file = data.get('backup');
      if (!file || !file.size) throw new Error('請選擇加密備份檔。');
      if (!window.confirm('要還原此備份並取代目前的診所資料嗎？')) return;
      const result = await api('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.weight-management-tracker.backup' },
        body: file
      });
      setNotice(result.restored ? '備份已驗證並完成還原，請重新登入。' : '還原尚未完成。', 'warn');
      showLogin();
    } else if (form.id === 'migration-form') {
      const file = data.get('source');
      if (!file || !file.size) throw new Error('請選擇 HOANBOY 資料庫檔案。');
      if (!window.confirm('要先備份並匯入此 HOANBOY 資料庫嗎？來源檔不會變更。')) return;
      const result = await api('/api/admin/migrate/hoanboy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.sqlite3' },
        body: file
      });
      const counts = result.counts;
      setNotice('資料匯入完成：新增 ' + counts.patientsCreated + ' 位病人、配對 ' + counts.patientsMatched +
        ' 位病人、匯入 ' + counts.measurementsImported + ' 筆測量資料、' + counts.normalizationVersionsImported +
        ' 個標準化指標版本（共 ' + counts.normalizationVersionsTotal + ' 個），新增 ' + counts.reportsImported +
        ' 份報告。來源備份已儲存為 ' + result.sourceBackupName + '。', 'ok');
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
      editor?.insertAdjacentHTML('beforeend', '<label>其他症狀備註<input maxlength="500" data-draft-field="symptomOtherText" data-encounter-id="' + encounterId + '"></label>');
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
      row?.insertAdjacentHTML('beforeend', '<label>自行輸入劑量（mg）<input type="number" min="0.01" step="0.01" data-residual-dose required></label>');
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
      setNotice('療程基準已更新。');
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
  setNotice('網路連線已恢復，正在重試尚未儲存的變更。');
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
window.addEventListener('offline', () => setNotice('目前離線，草稿變更會在網路恢復後儲存。', 'error'));
window.addEventListener('resize', () => {
  if (state.patient) drawPatientCharts(state.patient);
});

initialize();
