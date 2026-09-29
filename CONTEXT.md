# Domain context

## Patient

A clinic patient participating in weight-management follow-up.

Primary identity: MRN.

MVP stored fields:
- MRN
- name
- phone

Do not use phone number as the unique identity.

## MRN

Clinic medical record number. It is a string, unique within this system, and may contain leading zeroes.

## Weight-loss Episode

A continuous period of weight-management treatment/follow-up.

A Patient may have multiple historical Episodes but at most one active Episode.

The default baseline weight is the first valid Encounter weight in that Episode. A physician may later reassign which measurement is the baseline.

## Encounter

One weight-management clinic record at a specific time. The same Patient may have multiple Encounters on the same day.

An Encounter may contain:
- weight
- waist circumference
- linked body-composition measurements
- symptom selection
- physician identity
- treatment-change category
- medication regimen

All of those clinical data elements are optional so a rushed visit is not blocked.

## Draft

An Encounter that has been explicitly created but not marked complete. Draft edits autosave and must survive accidental navigation, tab closure or browser closure.

## Completed

An Encounter explicitly marked complete by a user. Later edits require reopen/correction behavior.

## Symptoms

Encounter-level observations such as nausea, vomiting or abdominal bloating.

Symptoms are observations recorded during the visit. The application must not assert that a symptom was caused by a particular medication.

## Medication regimen

The set of zero or more weight-management medication items recorded for an Encounter.

MVP medication catalog:
- Mounjaro
- Wegovy

The HIS remains the official medication-order source.

## Residual dose

Clinic workflow label for a dose entered manually instead of choosing one of the preset mg values.

The tracker records the entered positive mg value and does not decide whether it is clinically appropriate.

## Body-composition measurement

One measurement produced by a body-composition device.

A single Encounter can link multiple repeated measurements and designate one as primary.

## Body Composition Adapter

Vendor-specific integration implementing a stable core contract for reading, identifying, normalizing and optionally rendering device measurements.

HOANBOY 370 is the first implementation.

## Primary body-composition measurement

The single preferred body-composition measurement for an Encounter. Default cross-Encounter body-composition trends use primary measurements only.

## Encounter weight

Weight entered for the clinic Encounter. This is the source for the main weight-loss curve.

It is distinct from a device-reported body-composition weight.

## Correction

A post-completion change that preserves who changed the record, when it changed, and the previous value or version as required by the data model.

## zh-TW user-interface terms

These are display labels for the existing domain concepts. Localization must not change stored values, API codes or workflow behavior.

- Patient: 病人.
- Weight-loss Episode: 體重管理療程; use 療程 where the shorter label is clearer.
- Encounter: 追蹤紀錄.
- Body-composition measurement: 身體組成測量.
- Primary body-composition measurement: 主要測量.
- Residual dose: 手動輸入劑量; a dose entered manually instead of selected from the preset values.
