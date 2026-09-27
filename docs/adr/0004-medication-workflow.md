# ADR 0004 — Fast medication presets without clinical decision support

An Encounter may record multiple medication items.

The MVP fast catalog contains only Mounjaro and Wegovy.

Mounjaro presets:
- 2.5, 5, 7.5, 10, 12.5, 15 mg;
- SC weekly;
- quantity 1 pen.

Wegovy presets:
- 1, 1.7, 2.4 mg;
- SC weekly;
- quantity 1 pen.

Both provide a Residual dose mode that accepts a manually entered positive mg value instead of a preset. MVP does not impose a clinical maximum or dose-appropriateness rule.

The doctor records one treatment-change category:
- continue previous regimen;
- increase dose;
- decrease dose;
- change medication;
- pause medication;
- no weight-loss medication this visit.

Continue previous regimen copies the previous complete medication regimen as the current starting state.

The MVP does not maintain separate doctor-plan and nursing-administration records and does not split in-clinic injection versus take-home medication into different completion workflows.

The tracker records clinician decisions but does not recommend a drug or dose. The HIS remains the official order source.
