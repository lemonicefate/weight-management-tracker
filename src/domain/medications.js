import { badRequest } from '../errors.js';

export const medicationCatalog = Object.freeze({
  mounjaro: Object.freeze({
    name: 'Mounjaro',
    doses: Object.freeze([2.5, 5, 7.5, 10, 12.5, 15]),
    route: 'SC',
    frequency: 'weekly',
    quantity: '1 pen',
    version: 'mvp-1'
  }),
  wegovy: Object.freeze({
    name: 'Wegovy',
    doses: Object.freeze([1, 1.7, 2.4]),
    route: 'SC',
    frequency: 'weekly',
    quantity: '1 pen',
    version: 'mvp-1'
  })
});

export const treatmentChangeTypes = Object.freeze([
  'continue', 'increase', 'decrease', 'change', 'pause', 'no_medication'
]);

export function validateMedicationItems(items) {
  if (!Array.isArray(items)) throw badRequest('Medication items must be a list.');
  if (items.length > 20) throw badRequest('An Encounter may contain at most 20 medication items.');

  return items.map((item) => {
    const catalog = medicationCatalog[item?.medicationCode];
    if (!catalog) throw badRequest('Choose Mounjaro or Wegovy from the workflow catalog.');
    if (!['number', 'string'].includes(typeof item.doseMg) ||
        (typeof item.doseMg === 'string' && !item.doseMg.trim())) {
      throw badRequest('Dose must be a positive numeric mg value.');
    }
    const dose = Number(item.doseMg);
    if (!Number.isFinite(dose) || dose <= 0) throw badRequest('Dose must be a positive numeric mg value.');
    const residualDose = item.residualDose === true;
    if (!residualDose && !catalog.doses.includes(dose)) {
      throw badRequest('Choose a documented preset dose or select Residual dose.');
    }
    return {
      medicationCode: item.medicationCode,
      medicationName: catalog.name,
      doseMg: dose,
      residualDose,
      route: catalog.route,
      frequency: catalog.frequency,
      quantity: catalog.quantity,
      catalogVersion: catalog.version
    };
  });
}

export function validateTreatmentChange(value) {
  if (!treatmentChangeTypes.includes(value)) {
    throw badRequest('Choose a supported treatment-change category.');
  }
  return value;
}

export function publicMedication(item) {
  return {
    id: item.id,
    medicationCode: item.medication_code,
    medicationName: item.medication_name_snapshot,
    doseMg: item.dose_mg,
    residualDose: Boolean(item.residual_dose),
    route: item.route,
    frequency: item.frequency,
    quantity: item.quantity_text
  };
}
