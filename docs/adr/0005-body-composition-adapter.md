# ADR 0005 — Body-composition devices use a replaceable adapter contract

The weight-management core must not depend directly on HOANBOY database tables, field indexes, API paths or vendor-specific report logic.

A stable Body Composition Adapter contract separates the core application from each vendor.

Adapter responsibilities include:
- device/vendor identity;
- availability/health information;
- measurement synchronization or retrieval;
- source identity and deduplication support;
- raw source preservation;
- measurement timestamp and source metadata;
- normalized metric mapping;
- verification status and mapping version;
- optional detailed report support.

HOANBOY 370 is the first adapter implementation.

Existing validated HOANBOY reader, mapping, deduplication and report logic should be migrated behind this boundary.

Future body-composition vendors should normally require a new adapter rather than changes to Patient, Episode, Encounter, symptoms, medication or trend domain logic.

One Encounter may contain multiple body-composition measurements, but only one is Primary. Default cross-Encounter body-composition trends use Primary measurements and only verified normalized metrics.

Encounter weight and device weight remain separate data sources.
