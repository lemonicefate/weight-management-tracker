# Architecture

Status: initial architecture baseline. Framework choices may be refined during implementation without violating the product specification or ADRs.

## 1. Architectural style

Use a modular monolith for the MVP.

One application backend owns:
- authentication and roles;
- Patient/Episode/Encounter domain logic;
- medication tracking;
- symptoms;
- trends;
- body-composition adapter orchestration;
- persistence;
- audit;
- backup/restore.

Browser clients access the backend through application APIs. Clients never open the database file directly.

Do not split the first implementation into microservices.

## 2. Deployment shape

Initial clinic deployment:

Browser on clinic PC / authorized phone
            |
        HTTPS/HTTP on private clinic network
            |
     Weight Management App
            |
       Primary database
            |
   Body-composition adapters
            |
   HOANBOY 370 / future devices

The application should be deployable on a dedicated or approved clinic Windows host. Exact process manager/container choice is an implementation decision.

## 3. Suggested module boundaries

### identity

Users, sessions, role authorization.

### patients

Patient registry and MRN uniqueness.

### episodes

Episode lifecycle and baseline assignment.

### encounters

Draft autosave, completion, reopen/correction, doctor association and concurrency versioning.

### observations

Weight, waist and symptom state.

### medications

Medication catalog configuration, Encounter regimen, treatment-change category and longitudinal medication timeline.

### body_composition

Core normalized model, adapter contract, measurement linking, primary/repeat designation and trend queries.

### integrations/hoanboy

HOANBOY-specific reader, source schema validation, mapping, deduplication and report behavior migrated from hoanboy-tracker.

### trends

Longitudinal series and derived display values.

### audit

Meaningful actor/time/version events.

### backup

Application data backup and tested restore workflow.

## 4. Persistence

Initial database may be SQLite if deployment and concurrency tests show it is sufficient for expected clinic use.

Rules:
- only backend opens the database;
- clients do not access SQLite over a network share;
- enable foreign-key constraints;
- use explicit migrations;
- backup the database plus any required report assets;
- schema evolution must preserve historical clinical records.

If real concurrency/load later outgrows SQLite, migration to a server database should not require changing core domain semantics.

## 5. Encounter autosave

Each Encounter has a revision/version value.

Client autosave flow:
1. client loads Encounter and version;
2. user changes a field;
3. client debounces briefly and sends the changed state with expected version;
4. backend updates only when expected version matches;
5. backend returns a new version;
6. version mismatch returns a conflict, never a last-write-wins silent overwrite.

The UI should also save immediately for discrete actions such as symptom chip selection and medication preset selection.

Autosave failures must be visible.

## 6. Correction model

Draft fields may be edited normally.

Completed Encounter edits require explicit reopen/correction flow.

A correction should preserve:
- actor;
- timestamp;
- previous version or relevant previous values;
- new version.

Do not build event sourcing unless later requirements justify it.

## 7. Body Composition Adapter contract

Core code must not know vendor database names, endpoint paths or vendor field positions.

Conceptual adapter responsibilities:
- identify adapter/vendor/device;
- health check / availability;
- synchronize or fetch measurements;
- return stable source identity for deduplication;
- preserve raw source snapshot for traceability;
- expose measurement time and source metadata;
- normalize verified metrics into canonical metric codes and units;
- expose verification status;
- optionally render or provide data for a vendor-specific detailed report.

Conceptual normalized metric shape:
- metric_code;
- numeric/string value as appropriate;
- canonical unit;
- source field;
- verification status;
- mapping version.

Prefer an extensible metric collection over adding a database column for every future vendor-specific measurement.

## 8. HOANBOY integration

Reuse validated behavior from lemonicefate/hoanboy-tracker but move it behind the adapter contract.

Vendor-specific implementation may include:
- current LAN read mechanism;
- bodyparm/source schema handling;
- source-key and digest-based deduplication;
- mapping and verification;
- offline report reconstruction where supported.

Patient identity and Encounter logic must not live inside the HOANBOY adapter.

## 9. Trend rules

Weight trend:
- uses Encounter weight.

Waist trend:
- uses Encounter waist.

Body-composition trends:
- use Primary measurement for each Encounter;
- include only metrics mapped to canonical codes with verified meaning/unit;
- preserve missing values as missing;
- do not fill, average or invent values unless a future explicit requirement adds such behavior.

## 10. Security baseline

Because the app handles identifiable clinic information:
- authentication is mandatory;
- role checks are enforced server-side;
- password storage uses a modern password hash;
- sessions expire and can be revoked;
- logs avoid patient-identifying payloads where possible;
- production secrets live outside Git;
- backup files are protected;
- network access is limited to authorized clinic use;
- TLS is preferred even on local networks when operationally feasible.

## 11. Testing strategy

Prioritize:
- domain unit tests for calculations and state transitions;
- API/integration tests against a temporary real database;
- concurrency tests for revision conflicts;
- migration tests;
- adapter contract tests;
- HOANBOY fixture-based parsing with synthetic/de-identified fixtures;
- browser tests for patient search, Draft autosave, completion, medication entry and trends;
- backup/restore validation.

Never use real patient data in automated tests.
