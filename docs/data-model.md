# Data model

This document describes the logical model. Exact SQL names may differ, but implementation must preserve these relationships and invariants.

## User

Fields:
- id
- username/login identity
- display_name
- role: doctor, nurse_staff, admin
- active
- credential/session-related fields

## Patient

Fields:
- id: internal stable identifier
- mrn: unique string
- name
- phone
- created_at
- updated_at

Invariant:
- MRN is unique and preserves leading zeroes.

## Episode

Fields:
- id
- patient_id
- status: active or closed
- started_at
- ended_at nullable
- closure_reason nullable
- baseline_observation_id nullable
- created_by
- created_at
- updated_at

Invariant:
- at most one active Episode per Patient.

Baseline behavior:
- default to first valid Encounter weight in the Episode;
- doctor may later reassign to another valid Encounter weight.

## Encounter

Fields:
- id
- patient_id
- episode_id
- occurred_at
- status: draft, completed, reopened/corrected
- physician_user_id nullable while Draft
- version: monotonic optimistic-concurrency revision
- created_by
- created_at
- updated_at
- completed_at nullable
- completed_by nullable

Invariant:
- multiple Encounters may occur on the same day.

## Encounter observation

Prefer typed observations or explicit fields where they improve clarity.

Required concepts:
- Encounter weight, optional, kg;
- waist circumference, optional, cm.

Store source/actor/time metadata sufficient for correction audit.

Device-reported weight is not this value.

## Encounter symptoms

Logical fields:
- encounter_id
- selected symptom codes
- other_text optional
- updated_by
- updated_at

MVP stores the latest Encounter symptom state rather than every Draft toggle.

Symptom codes:
- none
- nausea
- vomiting
- diarrhea
- constipation
- bloating
- abdominal_pain
- reflux_discomfort
- appetite_too_low
- dizziness
- headache
- injection_site_discomfort
- other

Invariant:
- none cannot coexist with any other symptom code.

Severity is not an MVP field.

## Treatment record

Fields:
- encounter_id
- change_type:
  - continue
  - increase
  - decrease
  - change
  - pause
  - no_medication
- recorded_by_doctor
- recorded_at

## Medication item

Fields:
- id
- encounter_id
- medication_code
- medication_name_snapshot
- dose_mg
- residual_dose boolean
- route
- frequency
- quantity
- catalog_version or configuration snapshot

MVP catalog:

Mounjaro:
- allowed preset mg: 2.5, 5, 7.5, 10, 12.5, 15
- route: SC
- frequency: weekly
- quantity: 1 pen

Wegovy:
- allowed preset mg: 1, 1.7, 2.4
- route: SC
- frequency: weekly
- quantity: 1 pen

Residual dose:
- manual dose_mg;
- must be numeric and greater than zero;
- no MVP clinical maximum validation.

Continue:
- creates current Encounter items by copying the prior complete regimen as a starting state.

## Body composition source

Represents adapter/vendor/device metadata.

Fields may include:
- id
- adapter_type
- vendor
- device_identifier
- configuration metadata reference
- active

## Body composition measurement

Fields:
- id
- source_id
- source_key
- source_digest/version identity
- measured_at
- captured_at
- raw_snapshot
- mapping_version
- normalization status
- source metadata

Vendor raw data remains available for traceability without leaking vendor schema into core Patient/Encounter tables.

## Normalized body-composition metric

Fields:
- measurement_id
- metric_code
- value
- unit
- source_field
- status: verified, unverified, invalid, missing
- mapping_version

Canonical metric codes are extended as vendors are integrated.

Only verified metrics enter official longitudinal charts.

## Encounter body-composition link

Fields:
- encounter_id
- measurement_id
- is_primary
- linked_by
- linked_at

Invariants:
- a measurement is linked according to defined assignment rules;
- an Encounter may have multiple linked measurements;
- at most one linked measurement per Encounter is Primary.

## Audit / correction event

Fields:
- id
- entity_type
- entity_id
- action
- actor_user_id
- at
- before_snapshot or relevant previous values
- after_snapshot or relevant new values
- reason optional

Do not require an audit row for every Draft keystroke.

Do record post-completion corrections and important lifecycle transitions.

## Derived values

Do not store unless performance or reproducibility requires it.

Examples:
- current weight;
- kg change from Episode baseline;
- weight-loss percentage;
- latest waist.

Weight-loss percentage:
(current weight - baseline weight) / baseline weight * 100

UI may present loss as a positive magnitude if product design chooses, but calculation semantics must be explicit and tested.

## Migration mapping from hoanboy-tracker

Existing data to migrate:
- patients -> Patient;
- measurements -> Body composition measurement;
- normalized metrics -> Normalized body-composition metric;
- assignment to patient -> preserved for migration matching and then associated with the correct Patient;
- existing report snapshots/assets -> historical body-composition report support where feasible.

Migration must not create a second authoritative Patient registry after cutover.
