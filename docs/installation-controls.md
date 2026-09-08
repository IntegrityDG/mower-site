# Installation write controls

All three server-only controls default off. Only the exact string `true` enables a control. Missing, empty, invalid, whitespace-padded, or differently cased values disable it.

| Variable | Scope |
| --- | --- |
| `INSTALLATION_INTAKE_ENABLED` | New request route, underlying intake operation, public form. |
| `INSTALLATION_ONLINE_PAYMENTS_ENABLED` | New installation Checkout route, underlying operation, customer payment buttons. |
| `INSTALLATION_CASH_RECORDING_ENABLED` | Receipt, correction, and actual cash-return POSTs, underlying authenticated operations, admin write controls. |

Control evaluation never queries the database. Receipt/correction writes authenticate and check the cash flag before parsing a request or accessing persistence. Cash approval remains a separate administrative decision and never implies payment. The legacy `cash_paid` bypass is rejected before accessing the database.

Authorized reads and prior-key confirmation remain available with cash writes off. A missing schema returns an explicit unavailable response. Failed current-balance calculations retain readable admin history and prior-entry confirmation while disabling new cash entries. Stripe webhook/payment/refund reconciliation is not gated by any of these controls. Installation Stripe operations remain restricted to test mode.

The final independently reviewable `review/installation-readiness/01-controls-only.patch` targets baseline `99a4fdda55fd7c49f2d70bef4f2ed929021d0d65`. Its cash operations/endpoints are blocked placeholders: they authenticate and apply the control, then report that the implementation is unavailable. They require no installation schema and cannot activate cash recording even if a flag is accidentally enabled. The schema-dependent application patch replaces those placeholders. These patches are review alternatives to the completed local files; do not apply them again to this worktree. Earlier patches and reports outside the readiness directory remain historical evidence.

Release order: default-off controls; approved ordered database changes; schema-dependent application; separately approved activation after verification. See the final readiness report for actual local evidence and the remaining actual Stripe credential/check requirement. No production activation is authorized by this task.
