# Agent instructions

Before changing application code, read these files in order:

1. CONTEXT.md
2. docs/spec.md
3. docs/architecture.md
4. docs/data-model.md
5. docs/workflows.md
6. all applicable files under docs/adr/

## Source of truth

- Confirmed product behavior belongs in docs/spec.md.
- Architectural choices with meaningful tradeoffs belong in docs/adr/.
- Names and domain meanings belong in CONTEXT.md.
- Do not silently change a confirmed requirement while implementing code.
- If code and docs conflict, stop and reconcile the docs before expanding the implementation.

## Product boundary

This is an auxiliary clinic workflow and longitudinal weight-management tracker. It does not replace the HIS as the official medical record or medication order system.

Do not add billing, NHI claims, appointment scheduling, inventory, patient portal, diet logging, calorie tracking, exercise tracking, AI treatment recommendations, or automatic clinical dosing logic unless the specification is explicitly expanded.

## Privacy and security

Never commit real patient data or secrets.

Forbidden in Git, issues, PRs, screenshots, logs, fixtures, or test artifacts:
- real MRN
- real patient name
- real phone number
- raw real measurements
- QR/report private URLs
- passwords or password hashes copied from production
- API tokens, cookies, credentials or private keys
- production database files or backups

Tests must use clearly fictional data.

## Data integrity

- MRN is a string and must preserve leading zeroes.
- A Patient may have many Episodes but at most one active Episode.
- An Encounter is created only by an explicit user action.
- Draft Encounter edits autosave.
- Completed records are corrected or reopened; they are not destructively overwritten without audit.
- Use optimistic concurrency. A stale browser must never silently overwrite a newer saved version.
- Encounter weight and body-composition-device weight are different measurements and must not overwrite one another.
- One Encounter may have multiple body-composition measurements, with at most one primary measurement.

## Body-composition integration

The core product must depend only on the Body Composition Adapter contract and normalized metrics.

Vendor-specific schemas, database names, HTTP endpoints and parsing logic belong inside the adapter implementation. HOANBOY 370 is the first adapter, not a permanent core dependency.

## Medication safety boundary

The application records the clinician-selected regimen. It must not recommend a drug, recommend a dose, infer a clinically appropriate dose, or replace the HIS order.

The MVP preset list is a workflow configuration, not clinical guidance.

## Implementation style

Prefer a modular monolith over microservices for the initial clinic deployment. Keep device integrations, domain logic, persistence and UI boundaries explicit so components can evolve independently.

Add tests around domain behavior, persistence, migrations, concurrency, adapter normalization and critical workflows rather than private implementation details.
