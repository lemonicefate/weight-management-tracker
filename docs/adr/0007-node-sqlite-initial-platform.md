# ADR 0007 — Node.js modular monolith with backend-owned SQLite

The first clinic deployment uses one Node.js 24 application process, a same-origin browser client, and a SQLite database opened only by the backend.

The repository has no existing application runtime or package dependencies. Node.js is available in the implementation environment, and Node 24 includes SQLite and online database backup APIs without requiring native third-party packages. The application uses Node.js 24.15 or newer. The SQLite API is a release candidate in this Node line, so the runtime version is pinned by the project engine requirement and must be reviewed before a runtime upgrade.

This choice favors a small deployable modular monolith with a low dependency and native-module burden on the clinic's Windows host. SQLite transactions serialize short writes in the single backend process, while explicit Encounter revisions reject stale browser writes. A shared SQLite file is never opened by browser clients or placed on a network share.

The synchronous database API can block the application event loop during large queries, and a single SQLite writer is not intended for sustained multi-clinic or high-concurrency use. Keep queries bounded and review measured clinic use before expanding deployment. A future server database can replace persistence without changing the Patient, Episode, Encounter, or Body Composition Adapter contracts.
