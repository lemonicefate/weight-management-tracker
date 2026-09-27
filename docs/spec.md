# Weight Management Tracker — Product Specification

Status: confirmed product baseline for initial implementation.

## 1. Problem statement

The clinic currently uses paper and fragmented measurements to follow patients receiving weight-management care. Weight, waist circumference, body-composition reports, symptoms and medication changes are difficult to compare longitudinally during a short visit.

The existing HIS remains the official medical record and medication-order system but does not provide the desired longitudinal workflow and visualization.

## 2. Product goal

Build an internal clinic web application that:

- reduces paper use;
- lets staff quickly find a weight-management patient;
- records visit measurements without forcing every visit to have every measurement;
- preserves a longitudinal Episode and Encounter history;
- makes medication changes easy to review;
- records common symptoms quickly;
- integrates body-composition devices through replaceable adapters;
- visualizes weight, waist and verified body-composition trends;
- supports multiple clinic computers and authorized mobile browsers through one backend.

This application is an auxiliary workflow and tracking system. It does not replace the HIS as the authoritative medical record or medication order.

## 3. MVP users and roles

### Doctor

Doctors share the same role permissions.

A doctor can:
- search and view patients;
- create and edit Encounters;
- view and edit measurements;
- record symptoms;
- record medication regimen and treatment-change category;
- mark the Encounter complete;
- reopen/correct completed Encounters according to audit rules;
- end an Episode;
- reassign the baseline measurement;
- view longitudinal trends and body-composition reports.

Every clinical Encounter records which doctor handled the visit when a physician record is saved/completed.

### Nurse / clinic staff

Authorized nursing or clinic staff share the same role permissions.

They can:
- search and view patients;
- create an Encounter;
- enter or edit draft weight and waist;
- record current symptoms;
- link body-composition measurements;
- view the medication record entered by the doctor.

### Admin

Admin can perform normal workflow actions plus:
- manage users/roles;
- manage configuration;
- perform supported correction/maintenance actions;
- manage backup/restore;
- inspect audit information.

## 4. Patient registry

The home screen is a master list of weight-management patients, not a daily appointment list.

Search must support:
- MRN;
- name;
- phone.

MVP patient fields:
- MRN, required and unique;
- name, required;
- phone, stored as entered.

MRN is a string and preserves leading zeroes.

The master list displays:
- MRN;
- name;
- phone;
- current Encounter weight if available;
- total weight-loss percentage for the active Episode if computable;
- last Encounter date/time;
- Active or Closed status.

## 5. Episode model

A Patient may have many historical weight-loss Episodes.

At most one Episode may be active at a time.

Default Episode baseline:
- first valid Encounter weight in the Episode.

A doctor may later select a different valid Encounter weight as baseline.

Episode closure is explicit and physician-driven.

Supported closure reasons:
- goal achieved;
- patient stops treatment;
- adverse effects;
- other.

Do not auto-close an Episode because a patient stopped returning. Lost to follow-up is not an MVP closure reason.

## 6. Encounter creation and lifecycle

A user opens a Patient and explicitly chooses New Encounter.

Simply opening a Patient page does not create an Encounter.

Multiple Encounters for the same Patient on the same calendar day are allowed.

States:
- Draft;
- Completed;
- Reopened / Corrected.

### Autosave

Draft fields autosave after changes.

The intended behavior is that accidental Back navigation, tab closing or browser closing does not discard previously entered fields.

Returning to the Draft restores the saved content.

Only the explicit Complete Encounter action changes Draft to Completed.

A completely empty Draft with no clinical content may be automatically cleaned up.

Once any clinical content exists, the Encounter must not be silently destroyed. Later changes follow correction/reopen rules.

### Optional visit data

No measurement is mandatory.

An Encounter can still exist and be completed when the patient declines or skips:
- weight;
- waist circumference;
- body-composition measurement.

## 7. Weight and waist

Encounter weight and waist are independent optional observations.

Both doctors and authorized nurse/staff users may enter/edit them while the Encounter is Draft.

After completion, changes are corrections and must preserve the appropriate audit information.

The main weight-loss curve uses Encounter weight.

Device-reported body-composition weight is not allowed to overwrite Encounter weight.

## 8. Symptoms

Symptoms are Encounter-level observations.

MVP quick-select symptoms:
- no significant discomfort;
- nausea;
- vomiting;
- diarrhea;
- constipation;
- abdominal bloating;
- abdominal pain;
- gastroesophageal discomfort;
- appetite too low;
- dizziness;
- headache;
- injection-site discomfort;
- other.

No significant discomfort is mutually exclusive with every other symptom.

MVP stores the current selected state for the Encounter. It does not need a fine-grained history of every Draft toggle.

If a Completed Encounter is later corrected, normal correction/audit rules apply.

Symptom severity is intentionally out of MVP and will be reconsidered after real clinic feedback.

The system records symptoms but does not automatically claim medication causality.

## 9. Medication workflow

An Encounter may contain zero or more medication items.

The medication record is a tracking aid. The HIS remains the official medication order source.

MVP supports only Mounjaro and Wegovy as fast presets.

### Mounjaro

Preset doses:
- 2.5 mg;
- 5 mg;
- 7.5 mg;
- 10 mg;
- 12.5 mg;
- 15 mg.

Fixed workflow metadata:
- route: SC;
- frequency: weekly;
- quantity: 1 pen.

### Wegovy

Preset doses:
- 1 mg;
- 1.7 mg;
- 2.4 mg.

Fixed workflow metadata:
- route: SC;
- frequency: weekly;
- quantity: 1 pen.

### Residual dose

Both drugs provide a Residual dose option.

When selected:
- preset dose selection is bypassed;
- the user manually enters the mg value;
- MVP validation only requires a positive numeric value;
- the tracker does not impose a clinical maximum or decide whether the dose is appropriate.

### Treatment-change category

The doctor selects one:
- continue previous regimen;
- increase dose;
- decrease dose;
- change medication;
- pause medication;
- no weight-loss medication this visit.

Continue previous regimen copies the complete prior medication regimen into the current Encounter, where it can then be reviewed.

The MVP does not keep a separate doctor-plan record and nursing-administration record.

The MVP does not model in-clinic injection versus take-home completion as separate workflow states.

### Medication history

Patient page must include a chronological medication timeline showing medication, dose and change type so the doctor can rapidly understand escalation, reduction, switch or pause history.

The system must not recommend which drug or dose should be selected.

## 10. Body-composition integration

Body-composition support is vendor-neutral at the core.

The core application consumes a Body Composition Adapter contract. Vendor-specific HTTP endpoints, databases, schemas, parsing and report rules stay inside the adapter.

HOANBOY 370 is the first adapter implementation.

Future device vendors should normally require a new adapter/mapping implementation rather than changes to Patient, Episode, Encounter, medication or trend domain logic.

One Encounter may link multiple body-composition measurements.

At most one linked measurement is Primary.

Repeated measurements remain stored.

Default longitudinal body-composition charts use Primary measurements only.

Only normalized metrics whose meaning and units have been verified may enter official cross-visit trends.

Existing hoanboy-tracker Patient and measurement data will be migrated into this application so production has one Patient master and one primary database.

## 11. Patient page

The Patient page should optimize fast review during a visit.

Core Episode summary:
- baseline weight;
- current Encounter weight;
- absolute weight change in kg;
- weight-loss percentage;
- baseline waist;
- current waist.

Core visualizations:
- Encounter weight over time;
- waist circumference over time when present;
- body-composition trends for verified normalized metrics when available.

The Patient page also exposes:
- Encounter history;
- symptom history by Encounter;
- medication timeline;
- body-composition reports/measurement details;
- historical Episodes.

Avoid overcrowding the primary summary with every possible body-composition metric.

## 12. Concurrency and editing

Multiple browsers/computers may open the same Encounter.

Use optimistic concurrency.

A save based on a stale record version must never silently overwrite a newer saved version.

The user must be shown a conflict and be able to reload/reconcile.

Draft autosave follows the same concurrency protection.

## 13. Audit and corrections

At minimum, record:
- who created/completed/reopened/corrected an Encounter;
- relevant timestamps;
- physician identity associated with the visit;
- post-completion corrections with enough prior-version information to understand what changed.

Fine-grained history of every Draft symptom toggle is not required.

Completely empty Draft cleanup is not considered a clinical deletion.

## 14. Deployment boundary

Initial target:
- one clinic;
- one central application backend and database;
- browser clients on clinic computers and authorized mobile devices;
- local/private network deployment first;
- architecture must not require clients to open a shared SQLite file directly.

The backend exclusively owns database access.

Remote/public internet exposure is not an MVP requirement.

## 15. Data protection

No real patient data or production secrets may enter the Git repository.

Application implementation must provide:
- authenticated access;
- role checks;
- secure credential storage;
- auditability for meaningful clinical changes;
- backup/restore;
- transport protection appropriate to the deployment;
- safe session behavior on shared clinic devices.

Exact infrastructure choices belong in architecture/implementation work.

## 16. Migration from hoanboy-tracker

Migration scope:
- existing Patients;
- archived HOANBOY measurements;
- patient-to-measurement assignment;
- source/raw data needed for traceability;
- normalized metrics;
- report data/assets required for supported historical viewing.

After migration, do not maintain parallel authoritative Patient databases in both applications.

The old repository remains a historical/reference implementation.

## 17. MVP out of scope

Not in the first implementation:
- replacing the official HIS record/order;
- billing or payment;
- NHI claim logic;
- appointment scheduling;
- drug inventory;
- patient portal;
- LINE workflow;
- diet/calorie/exercise logs;
- progress photos;
- automatic treatment recommendations;
- automatic clinical dose selection;
- symptom severity;
- automatic Episode closure for non-return;
- multi-clinic tenancy;
- vendor-specific assumptions in the core domain.

## 18. Acceptance criteria

### Patient and Episode

- duplicate MRN is rejected;
- leading-zero MRN is preserved;
- a Patient cannot have two active Episodes;
- baseline defaults correctly and can be reassigned by a doctor;
- Episode closure remains manual.

### Encounter

- opening a Patient does not create an Encounter;
- explicit New Encounter creates Draft;
- same-day multiple Encounters work;
- weight/waist/body composition may all be absent;
- Draft changes autosave;
- browser navigation/closure does not lose already-saved Draft data;
- explicit Complete changes state;
- empty Draft may be cleaned up;
- non-empty records cannot be silently deleted.

### Concurrency

- two clients can read the same Encounter;
- a stale save cannot overwrite a newer save without a visible conflict.

### Symptoms

- quick-select symptoms save correctly;
- no significant discomfort is mutually exclusive with all other symptoms;
- symptom severity is not required.

### Medication

- an Encounter can contain multiple medication items;
- Mounjaro preset values are exactly the configured MVP set;
- Wegovy preset values are exactly the configured MVP set;
- route/frequency/quantity are automatically filled per MVP configuration;
- Residual dose accepts a positive manual mg value;
- Continue previous regimen copies the previous full regimen;
- timeline reflects dose increase/decrease/switch/pause history;
- no automated treatment recommendation is produced.

### Body composition

- core workflows function without a HOANBOY-specific dependency;
- HOANBOY adapter can normalize verified data into the core contract;
- multiple measurements can link to one Encounter;
- only one may be Primary;
- primary-only default trend behavior is correct;
- Encounter weight remains separate from device weight.

### Migration

- existing HOANBOY-linked history can be migrated without creating duplicate Patient identities;
- historical links remain traceable;
- production does not require two separate Patient databases after cutover.
