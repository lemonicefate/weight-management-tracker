# Weight Management Tracker

診所減重門診的輔助看診、紀錄與圖像化追蹤系統。

## Purpose

本專案用來補足既有 HIS 在 longitudinal weight-management tracking 上的不足，將病人的減重療程、每次就診量測、症狀、減重藥物歷程與身體組成資料集中管理，降低紙本使用並提升看診效率。

本系統不是正式電子病歷或正式醫囑來源；HIS 仍是法定／正式病歷與醫囑的權威來源。

## Status

目前為需求與架構定義階段。正式實作前以 `docs/spec.md`、`docs/architecture.md`、`docs/data-model.md`、`docs/workflows.md` 與 `docs/adr/` 為主要依據。

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
