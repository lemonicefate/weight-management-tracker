# Weight Management Tracker

診所減重門診的輔助看診、紀錄與圖像化追蹤系統。

## Purpose

本專案用來補足既有 HIS 在 longitudinal weight-management tracking 上的不足，將病人的減重療程、每次就診量測、症狀、減重藥物歷程與身體組成資料集中管理，降低紙本使用並提升看診效率。

本系統不是正式電子病歷或正式醫囑來源；HIS 仍是法定／正式病歷與醫囑的權威來源。

## Status

The MVP is being implemented as a central Node.js application with a server-owned SQLite database. Confirmed behavior is defined by `docs/spec.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/workflows.md` and `docs/adr/`.

## Local operation

Use Node.js 24.15 or newer. Copy `.env.example` to `.env`, set a one-time initial administrator username and password, then run:

```text
npm start
```

The first start creates the configured administrator. Bootstrap credentials are not stored in the database; the server clears them from its process environment after initialization. Remove them from `.env` and the host environment after startup. The database and local configuration stay outside Git.

The application listens on 127.0.0.1 by default. For clinic network use, put it behind an approved TLS reverse proxy and bind it only to the host interface reachable by that proxy. Set `NODE_ENV=production` and `WMT_COOKIE_SECURE=true`; the application refuses to start in production without secure cookies. Do not expose the development server directly to the public internet.

For a Windows clinic host, configure a dedicated service identity and restrict the local NTFS data directory to that identity and local Administrators. See [Windows host deployment](docs/deployment/windows.md).

Run the server and domain suite with `npm test`. The tests use fictional records and isolated temporary databases. To run the browser suite, install dependencies and Chromium once with `npm ci` and `npx playwright install chromium`, then run `npm run test:browser`.

For a source HOANBOY database, the administrator migration page accepts an operator-provided database file, creates a protected source backup, and reports aggregate import counts. The source database is never modified. Keep the old system read-only during validation.

Follow [the HOANBOY cutover runbook](docs/migration/hoanboy-cutover.md) for source backup, validation and the one-registry cutover.

## Core concepts

- Patient：以診所病歷號（MRN）唯一識別。
- Episode：一段減重療程；同一病人同時最多一個 active Episode。
- Encounter：一次減重門診紀錄；同一天可有多次。
- Symptoms：Encounter-level 快速症狀紀錄。
- Medication regimen：每次 Encounter 的減重用藥紀錄與變化。
- Body composition：透過可替換的 device adapter 整合；HOANBOY 370 是第一個 adapter，不是核心系統依賴。

## Privacy rule

**禁止將任何真實病人資料、病歷號、姓名、電話、量測原始資料、QR／報告私密連結、密碼、token、憑證或資料庫備份提交到 Git。**

測試、issue、PR、截圖與 fixture 一律使用明確的虛構資料。

## Related project

現有 HOANBOY 370 介接原型：
https://github.com/lemonicefate/hoanboy-tracker

其設備讀取、mapping、report 與同步能力預計移植為本專案 body-composition integration layer 的第一個 adapter。
