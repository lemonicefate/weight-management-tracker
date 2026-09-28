import { createHash } from 'node:crypto';
import { hoanboyFields, hoanboyMetricsBySource } from './fields.js';

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function digestSourceRow(row) {
  return createHash('sha256').update(stable(row)).digest('hex');
}

export function mappingVersion(mapping) {
  const canonical = stable(mapping || {});
  return 'hoanboy-1-' + createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function validateDeviceSnapshot(payload) {
  if (!payload || payload.isSuccessful !== true || payload.isSelectQuery !== true) {
    throw new Error('HOANBOY response is not a successful read-only result.');
  }
  const schema = payload.tableInfos;
  const rows = payload.rows;
  if (!Array.isArray(schema) || !Array.isArray(rows) || schema.some((column) => !column || typeof column.title !== 'string')) {
    throw new Error('HOANBOY source schema is invalid.');
  }
  const columns = schema.map((column) => column.title);
  if (new Set(columns).size !== columns.length ||
      !['uid', 'username', 'time', 'bhWeightKg', 'bhBMI', 'bhBodyFatRate'].every((field) => columns.includes(field))) {
    throw new Error('HOANBOY source schema is missing required fields.');
  }
  if (!schema.some((column) => column.title === 'uid' && column.isPrimary === true)) {
    throw new Error('HOANBOY source identity is not verified.');
  }
  const seen = new Set();
  const records = rows.map((row) => {
    if (!Array.isArray(row) || row.length !== columns.length ||
        row.some((cell) => !cell || typeof cell !== 'object' || !Object.hasOwn(cell, 'value'))) {
      throw new Error('HOANBOY source row has an invalid shape.');
    }
    const record = {};
    columns.forEach((column, index) => {
      const value = row[index].value;
      if (value !== null && !['string', 'number'].includes(typeof value)) {
        throw new Error('HOANBOY source contains an unsupported value.');
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('HOANBOY source contains an invalid number.');
      }
      record[column] = value;
    });
    const key = record.uid === null ? '' : String(record.uid);
    if (!key || seen.has(key)) throw new Error('HOANBOY source identity is missing or duplicated.');
    seen.add(key);
    return record;
  });
  return { schema, rows, records };
}

function mappedFields(mapping) {
  const configured = new Map();
  for (const field of hoanboyFields) {
    const entry = mapping?.[field.metricCode];
    if (entry && entry.sourceField === field.sourceField && entry.unit === field.unit &&
        typeof entry.evidence === 'string' && entry.evidence.trim()) {
      configured.set(field.metricCode, entry.evidence.trim());
    }
  }
  return configured;
}

export function normalizeHoanboyRow(record, mapping = {}) {
  const verifiedFields = mappedFields(mapping);
  const rows = [];
  for (const field of hoanboyFields) {
    const rawValue = record[field.sourceField];
    if (rawValue === null || rawValue === '') {
      rows.push({
        metricCode: field.metricCode,
        value: null,
        unit: field.unit,
        sourceField: field.sourceField,
        status: 'missing',
        evidence: verifiedFields.get(field.metricCode) || null
      });
      continue;
    }
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) {
      rows.push({
        metricCode: field.metricCode,
        value: null,
        unit: field.unit,
        sourceField: field.sourceField,
        status: 'invalid',
        evidence: verifiedFields.get(field.metricCode) || null
      });
      continue;
    }
    rows.push({
      metricCode: field.metricCode,
      value,
      unit: field.unit,
      sourceField: field.sourceField,
      status: verifiedFields.has(field.metricCode) ? 'verified' : 'unverified',
      evidence: verifiedFields.get(field.metricCode) || null
    });
  }
  return rows;
}

export function candidateMappingView(mapping = {}) {
  return hoanboyFields.map((field) => {
    const entry = mapping[field.metricCode];
    return {
      metricCode: field.metricCode,
      label: field.label,
      sourceField: field.sourceField,
      unit: field.unit,
      verified: Boolean(entry && entry.sourceField === field.sourceField && entry.unit === field.unit && entry.evidence),
      evidence: entry?.evidence || ''
    };
  });
}

export function legacyMetricsToNormalized(metrics, mappingVersionValue) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return [];
  const legacyCodes = {
    weight: 'body_weight',
    bmi: 'bmi',
    fat_rate: 'body_fat_percent',
    water: 'body_water_kg',
    protein: 'protein_kg',
    mineral: 'mineral_kg',
    fat: 'body_fat_mass_kg',
    fat_free: 'fat_free_mass_kg',
    skeletal: 'skeletal_muscle_kg',
    whr: 'waist_hip_ratio',
    subcutaneous: 'subcutaneous_fat_percent',
    visceral: 'visceral_fat_level',
    ideal: 'ideal_weight_kg',
    weight_control: 'weight_control_kg',
    fat_control: 'fat_control_kg',
    muscle_control: 'muscle_control_kg',
    bmr: 'basal_metabolic_rate',
    body_age: 'body_age_years',
    score: 'body_score',
    muscle_Trunk: 'trunk_muscle_kg',
    muscle_LeftArm: 'left_arm_muscle_kg',
    muscle_RightArm: 'right_arm_muscle_kg',
    muscle_LeftLeg: 'left_leg_muscle_kg',
    muscle_RightLeg: 'right_leg_muscle_kg',
    fat_Trunk: 'trunk_fat_kg',
    fat_LeftArm: 'left_arm_fat_kg',
    fat_RightArm: 'right_arm_fat_kg',
    fat_LeftLeg: 'left_leg_fat_kg',
    fat_RightLeg: 'right_leg_fat_kg'
  };
  const units = new Map(hoanboyFields.map((field) => [field.metricCode, field.unit]));
  return Object.entries(legacyCodes).map(([oldCode, metricCode]) => {
    const metric = metrics[oldCode];
    const raw = metric && typeof metric === 'object' ? metric.value : null;
    const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    const valid = Number.isFinite(value);
    const evidence = metric && typeof metric.evidence === 'string' ? metric.evidence : null;
    const unitKnown = metric?.unit && metric.unit !== '未核對' && metric.unit !== 'unverified';
    const status = !valid ? (raw === null || raw === undefined || raw === '' ? 'missing' : 'invalid') :
      metric?.status === 'verified' && evidence?.trim() && unitKnown ? 'verified' : 'unverified';
    return {
      metricCode,
      value: valid ? value : null,
      unit: metric?.unit && metric.unit !== '未核對' ? metric.unit : units.get(metricCode),
      sourceField: metric?.source || hoanboyFields.find((field) => field.metricCode === metricCode).sourceField,
      status,
      evidence: status === 'verified' ? evidence : null,
      mappingVersion: mappingVersionValue
    };
  });
}

export function sourceFieldForMetric(metricCode) {
  return hoanboyFields.find((field) => field.metricCode === metricCode)?.sourceField || null;
}
