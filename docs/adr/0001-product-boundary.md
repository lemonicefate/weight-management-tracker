# ADR 0001 — Product boundary

The application is an auxiliary weight-management clinic workflow and longitudinal tracking system.

The existing HIS remains the official medical record and medication-order authority.

The tracker is responsible for:
- patient weight-management registry;
- Episode and Encounter history;
- weight/waist trends;
- symptoms;
- medication tracking/timeline;
- body-composition integration and visualization.

The MVP does not expand into billing, NHI claims, appointment scheduling, inventory, patient portal, diet/exercise logging or automated treatment recommendations.

This boundary keeps the system focused on the clinic workflow gap that motivated the project and avoids taking on the regulatory and operational scope of a replacement HIS.
