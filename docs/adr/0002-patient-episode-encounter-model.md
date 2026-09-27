# ADR 0002 — Patient, Episode and Encounter are separate concepts

Patient identity uses the clinic MRN.

A Patient may have multiple weight-loss Episodes over time but at most one active Episode.

Each Episode contains many Encounters. Multiple Encounters may occur on the same calendar day.

The Episode baseline defaults to its first valid Encounter weight. A physician may later reassign the baseline measurement.

Weight, waist and body-composition are optional for each Encounter so clinic workflow is not blocked when a patient declines measurement or is in a hurry.

This model prevents a later restart of weight-management treatment from incorrectly sharing the original baseline and preserves the actual visit timeline without forcing one-record-per-day assumptions.
