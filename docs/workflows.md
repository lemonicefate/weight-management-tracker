# Workflows

## 1. Find or create a patient

1. Open master weight-management patient list.
2. Search by MRN, name or phone.
3. Open the correct Patient.
4. If absent, create Patient with MRN, name and phone.
5. Duplicate MRN is rejected.

## 2. Start a weight-loss Episode

If the Patient has no active Episode:
1. user/doctor starts a new Episode;
2. Episode becomes active;
3. baseline remains unset until a valid Encounter weight exists;
4. first valid weight becomes the default baseline.

Historical closed Episodes remain visible.

## 3. Start an Encounter

1. Open Patient.
2. Click New Encounter.
3. Backend creates Draft Encounter.
4. Opening Patient history alone does not create an Encounter.
5. Same-day additional Encounters are allowed.

## 4. Draft autosave

1. User changes weight, waist, symptoms, body-composition link or medication data.
2. UI immediately or shortly debounced sends autosave with the last known Encounter version.
3. Backend checks version.
4. If current, save and return next version.
5. If stale, reject with conflict.
6. UI tells user data changed elsewhere and reload/reconcile is required.
7. Offline or retryable failures remain visibly unsaved. Valid pending changes retry after reconnection; stale-version conflicts stay locked until explicit reload/reconcile.

Accidental browser Back/tab close does not intentionally discard successful autosaves.

If autosave itself has failed, the UI must visibly warn before presenting the data as saved.

## 5. Record measurements

Staff may enter:
- weight;
- waist circumference.

Either or both may be absent.

These measurements do not block completion.

## 6. Record symptoms

Staff or doctor selects symptom chips.

Rules:
- selecting No significant discomfort clears all other symptoms;
- selecting any other symptom clears No significant discomfort;
- Other may open a short text note;
- no severity in MVP.

Latest Draft selection is the Encounter symptom state.

## 7. Link body composition

From the Patient/Encounter workflow:
1. user requests/synchronizes measurements through the configured adapter;
2. system shows candidate recent measurements;
3. user confirms correct Patient/Encounter association;
4. one or more measurements may be linked;
5. one is designated Primary;
6. repeat measurements remain accessible;
7. verified normalized metrics from Primary measurements feed default longitudinal body-composition charts.

HOANBOY-specific pending/sync behavior may exist inside the adapter workflow, but the user should not have to leave the Patient context for the ordinary case.

## 8. Record medication

Doctor selects treatment-change category.

### Continue previous regimen

1. choose Continue previous regimen;
2. system copies all medication items from the last applicable regimen;
3. doctor reviews the copied set;
4. save into current Encounter.

### Increase / decrease / change

Doctor selects the medication preset and dose.

Mounjaro quick choices:
2.5, 5, 7.5, 10, 12.5, 15 mg.

Wegovy quick choices:
1, 1.7, 2.4 mg.

SC, weekly and quantity 1 pen are auto-filled.

### Residual dose

1. select Residual dose;
2. dose preset unlocks to manual mg entry;
3. value must be greater than zero;
4. no clinical appropriateness recommendation is generated.

### Pause / no medication

The Encounter remains a valid historical node even when no medication item is recorded.

## 9. Complete Encounter

1. user reviews current Draft.
2. Click Complete Encounter.
3. system records completion actor/time and physician identity as required.
4. state becomes Completed.
5. Patient timeline updates.

Completion does not imply the application replaced the HIS order or official record.

## 10. Reopen / correct

If a Completed Encounter needs change:
1. authorized user chooses reopen/correct;
2. system records lifecycle/audit event;
3. edit occurs under concurrency protection;
4. corrected version becomes current;
5. prior relevant values/version remain inspectable through audit.

## 11. View patient history

Patient page provides:
- active Episode summary;
- baseline/current weight;
- kg change;
- weight-loss percentage;
- baseline/current waist;
- weight curve;
- waist curve;
- medication timeline;
- Encounter symptoms;
- body-composition trends;
- detailed body-composition measurements/reports;
- historical Episodes.

## 12. End Episode

Doctor explicitly ends active Episode.

Reason:
- goal achieved;
- patient stops treatment;
- adverse effects;
- other.

No automatic lost-to-follow-up closure.

A later return may start a new Episode with a new baseline sequence.

## 13. Empty Draft cleanup

A Draft containing no clinical content may be automatically removed/cleaned.

If any clinical content was successfully saved, do not silently delete it.

## 14. Migration workflow

1. take controlled backup of old hoanboy-tracker storage;
2. import Patients with MRN uniqueness checks;
3. import raw/normalized body-composition measurements;
4. preserve patient-measurement association;
5. verify counts and representative histories;
6. verify body-composition report access as applicable;
7. cut over to the new Patient master;
8. keep old system read-only/reference during validation;
9. do not continue two writable Patient masters.
