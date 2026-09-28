# HOANBOY history import and cutover

This procedure imports old HOANBOY tracker history into the central application. It does not import a clinical Encounter or Episode from a device timestamp because the source archive does not establish that clinic workflow event.

## Before the import

1. Schedule a clinic maintenance window and identify the operator and an active administrator account in the new application.
2. Stop the old tracker cleanly before taking the source database copy, or use its supported SQLite online-backup operation to create a self-contained snapshot. Do not upload only the main `.sqlite` file while committed data may still be in a `-wal` sidecar. Keep the old service read-only throughout validation.
3. Set a protected backup passphrase of at least 20 characters on the new application host. Keep it outside Git and issues. Verify backup and restore in an isolated environment using a synthetic database before using production data.
4. Log in as an administrator, open Administration → Backup & migration, and select the old HOANBOY SQLite database copy.

## Import and validation

The application creates an encrypted, read-only source backup before importing. It validates the source application ID, supported schema version, SQLite integrity, MRN uniqueness and foreign-key relationships. A failed import rolls back Patient, measurement and report rows together.

Patients match by the exact MRN string. Existing Patients are retained as the authoritative records; imported names and phone numbers do not overwrite current values. Measurements, source keys, raw snapshots, normalized metric versions, assignment history, saved report HTML and report-to-measurement links remain associated with the matched Patient. All legacy normalization evidence is retained; metrics without an evidence-backed unit remain unverified.

Review the aggregate import counts shown by the application, including added and total normalized metric versions. Then use the Patient registry and body-composition history to inspect representative histories privately at the clinic and compare counts with the read-only source copy:

- confirm existing MRNs matched the intended Patients and leading zeroes remain intact;
- confirm imported device measurements and source revisions appear under the correct Patient;
- open representative historical reports;
- review measurement details and imported assignment history;
- compare source and destination counts for Patients, measurements, normalization versions and reports.

Do not put real Patient identities, measurements, report links, screenshots or source files in Git, issues, logs or test artifacts.

## Cutover

1. After validation, designate the new application as the only writable Patient registry.
2. Keep the old tracker stopped or access-controlled read-only. Do not accept writes in both systems.
3. Make the central application available only through the approved clinic network path and TLS reverse proxy.
4. Create and verify a protected application backup after cutover.
5. Retain the encrypted source backup and the old read-only reference according to clinic retention policy.

The application never writes to the uploaded source database or changes the old service's access mode. The clinic operator controls the old service and network permissions during the maintenance window.
