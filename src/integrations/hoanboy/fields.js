export const hoanboyFields = Object.freeze([
  { metricCode: 'body_weight', sourceField: 'bhWeightKg', unit: 'kg', label: 'Device weight' },
  { metricCode: 'bmi', sourceField: 'bhBMI', unit: 'kg/m²', label: 'BMI' },
  { metricCode: 'body_fat_percent', sourceField: 'bhBodyFatRate', unit: '%', label: 'Body fat' },
  { metricCode: 'body_water_kg', sourceField: 'bhWaterKg', unit: 'kg', label: 'Body water' },
  { metricCode: 'protein_kg', sourceField: 'bhProteinKg', unit: 'kg', label: 'Protein' },
  { metricCode: 'mineral_kg', sourceField: 'bhMineralKg', unit: 'kg', label: 'Mineral' },
  { metricCode: 'body_fat_mass_kg', sourceField: 'bhBodyFatKg', unit: 'kg', label: 'Body fat mass' },
  { metricCode: 'fat_free_mass_kg', sourceField: 'bhBodyFatFreeMassKg', unit: 'kg', label: 'Fat-free mass' },
  { metricCode: 'skeletal_muscle_kg', sourceField: 'bhSkeletalMuscleKg', unit: 'kg', label: 'Skeletal muscle' },
  { metricCode: 'waist_hip_ratio', sourceField: 'bhWHR', unit: 'ratio', label: 'Waist to hip ratio' },
  { metricCode: 'subcutaneous_fat_percent', sourceField: 'bhbhBodyFatSubCutRate', unit: '%', label: 'Subcutaneous fat' },
  { metricCode: 'visceral_fat_level', sourceField: 'bhVFAL', unit: 'level', label: 'Visceral fat' },
  { metricCode: 'ideal_weight_kg', sourceField: 'bhIdealWeightKg', unit: 'kg', label: 'Device ideal weight' },
  { metricCode: 'weight_control_kg', sourceField: 'bhWeightKgCon', unit: 'kg', label: 'Device weight control' },
  { metricCode: 'fat_control_kg', sourceField: 'bhBodyFatKgCon', unit: 'kg', label: 'Device fat control' },
  { metricCode: 'muscle_control_kg', sourceField: 'bhMuscleKgCon', unit: 'kg', label: 'Device muscle control' },
  { metricCode: 'basal_metabolic_rate', sourceField: 'bhBMR', unit: 'unverified', label: 'Basal metabolic rate' },
  { metricCode: 'body_age_years', sourceField: 'bhBodyAge', unit: 'years', label: 'Body age' },
  { metricCode: 'body_score', sourceField: 'bhBodyScore', unit: 'points', label: 'Body score' },
  { metricCode: 'trunk_muscle_kg', sourceField: 'bhMuscleKgTrunk', unit: 'kg', label: 'Trunk muscle' },
  { metricCode: 'left_arm_muscle_kg', sourceField: 'bhMuscleKgLeftArm', unit: 'kg', label: 'Left arm muscle' },
  { metricCode: 'right_arm_muscle_kg', sourceField: 'bhMuscleKgRightArm', unit: 'kg', label: 'Right arm muscle' },
  { metricCode: 'left_leg_muscle_kg', sourceField: 'bhMuscleKgLeftLeg', unit: 'kg', label: 'Left leg muscle' },
  { metricCode: 'right_leg_muscle_kg', sourceField: 'bhMuscleKgRightLeg', unit: 'kg', label: 'Right leg muscle' },
  { metricCode: 'trunk_fat_kg', sourceField: 'bhBodyFatKgTrunk', unit: 'kg', label: 'Trunk fat' },
  { metricCode: 'left_arm_fat_kg', sourceField: 'bhBodyFatKgLeftArm', unit: 'kg', label: 'Left arm fat' },
  { metricCode: 'right_arm_fat_kg', sourceField: 'bhBodyFatKgRightArm', unit: 'kg', label: 'Right arm fat' },
  { metricCode: 'left_leg_fat_kg', sourceField: 'bhBodyFatKgLeftLeg', unit: 'kg', label: 'Left leg fat' },
  { metricCode: 'right_leg_fat_kg', sourceField: 'bhBodyFatKgRightLeg', unit: 'kg', label: 'Right leg fat' }
]);

export const hoanboyMetricsBySource = new Map(hoanboyFields.map((field) => [field.sourceField, field]));
export const hoanboyMetricsByCode = new Map(hoanboyFields.map((field) => [field.metricCode, field]));
