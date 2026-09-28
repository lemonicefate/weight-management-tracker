import { badRequest } from '../errors.js';

export const symptomCatalog = Object.freeze([
  { code: 'none', label: 'No significant discomfort' },
  { code: 'nausea', label: 'Nausea' },
  { code: 'vomiting', label: 'Vomiting' },
  { code: 'diarrhea', label: 'Diarrhea' },
  { code: 'constipation', label: 'Constipation' },
  { code: 'bloating', label: 'Abdominal bloating' },
  { code: 'abdominal_pain', label: 'Abdominal pain' },
  { code: 'reflux_discomfort', label: 'Gastroesophageal discomfort' },
  { code: 'appetite_too_low', label: 'Appetite too low' },
  { code: 'dizziness', label: 'Dizziness' },
  { code: 'headache', label: 'Headache' },
  { code: 'injection_site_discomfort', label: 'Injection-site discomfort' },
  { code: 'other', label: 'Other' }
]);

const codes = new Set(symptomCatalog.map((item) => item.code));

export function normalizeSymptoms(selectedCodes, otherText = '') {
  if (!Array.isArray(selectedCodes)) throw badRequest('Choose symptoms from the documented list.');
  const unique = [...new Set(selectedCodes)];
  if (unique.some((code) => typeof code !== 'string' || !codes.has(code))) {
    throw badRequest('One or more symptom choices are not supported.');
  }
  if (unique.includes('none') && unique.length > 1) {
    throw badRequest('No significant discomfort cannot be combined with another symptom.');
  }
  const text = typeof otherText === 'string' ? otherText.trim() : '';
  if (text.length > 500) throw badRequest('The Other note must be 500 characters or fewer.');
  return { codes: unique, otherText: unique.includes('other') ? text : '' };
}
