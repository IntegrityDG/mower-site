# Professional Installation local smoke test

## Setup

Apply `supabase/migrations/20260904204800_professional_installations.sql` to the development Supabase project. It adds service-role-only installation settings, requests, immutable pricing snapshots, adjustments, payment/refund records, work sessions, audit events, acknowledgements, travel data, safety/remediation state, RLS/grants, and shared demo/installation conflict triggers. No existing rows are modified.

Configure existing Supabase variables, `REVIEWS_ADMIN_PASSWORD`, application base URL, and Stripe test keys/webhook secret. `STRIPE_MODE` must be `test`; installation checkout refuses live mode. Forward test events to `/api/stripe/webhook`. Do not enable real email delivery.

## A–AL verification matrix

- **A–E — Standard request, approval, deposit, balance:** Submit `/professional-installation`, approve in `/admin/installations`, pay the $250 test deposit, verify it is credited—not added—and verify $750 remains on the standard $1,000 amount.
- **F — Modified pricing:** Set one installation’s labor, materials, deposit, overtime, underground, and travel rate through the authenticated pricing action. Approve, change global defaults, and verify saved and historical snapshots remain unchanged. Deliberately edit one approved snapshot with a reason; verify audit history and cents-based balance recalculation.
- **G–H — Travel:** Enter one-way road time. Verify 120 min = $0; 121/150/180 = $70; 181 = $140; 270 = $210 at $35. Confirm both directions, started hours, no proration/mileage/labor time. Override charge, require a reason, inspect audit. Verify $1,000 + $70 − $250 = $820.
- **I–J — 72 hours:** Pay more than 72 hours before. Approve at exactly/under 72 hours and verify full approved initial charges are due immediately; more than 72 hours requires the saved deposit first.
- **K–M — Cash:** Customer requests cash and cannot approve it. Admin approves and denies separate cases; approved cash is not an ordinary overdue online balance.
- **N–P — Cash failure:** Mark cash unavailable before work; verify no session starts, cash is revoked, and exactly one reschedule exists. Reschedule over 72 hours away; exactly 72 hours is rejected. Miss prepayment and forfeit the whole saved deposit, superseding cancellation refunds.
- **Q–S — Connectivity:** Submit Yes, No, Unsure. Verify persistence; No/Unsure is visible and not auto-rejected.
- **T–V — Acknowledgements:** Grounding/terms are always required; 811 is required for underground work. Confirm grounding, responsibilities, terms, and 811 timestamps in admin.
- **W–AA — Time:** Start at zero; work 90 minutes, pause/suspend, return another day, resume from 90. Return travel creates no labor or fee. Exactly 240 minutes has no overtime; 255/270/285/300 produce 1/2/3/4 saved-rate increments. Correct time through the authenticated action and verify the original is superseded.
- **AB — Overtime:** Change one saved overtime rate/increment; verify future overtime uses it without changing history.
- **AC–AE — Safety/weather:** Record suspension, notes/evidence, remediation pending/approved, one continuation, and customer-controlled termination. Verify no automatic labor refund/return fee, time persists, and unused materials remain reconcilable. Weather postponement must preserve job/payment state and apply no cancellation penalty.
- **AF — Placement refusal:** At cumulative minute 60, 61–120, and 121+, use the authenticated placement-refusal action. Verify 50%, 25%, and 0% labor credits using saved labor—not the deposit—with materials separate.
- **AG–AH — Materials/refunds:** Reconcile unused versus used/cut/opened/non-reusable materials with auditable entries. Verify unused allowance credit. Issue partial/full Stripe test refunds; refunded funds no longer count as fully paid.
- **AI — Webhook replay:** Replay deposit, balance, refund events. Confirm signature validation, metadata, stable payment rows, no duplicate credit, and no redirect-only payment success.
- **AJ–AK — Mobile:** At narrow viewport complete customer request/status/payment and admin travel/safety/payment/time flows without inaccessible controls.
- **AL — Scheduling regression:** Create demo/installation conflicts both ways and valid separate slots. Confirm existing demo approval, denial, blackouts, calendar, and area planning still work.

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Existing unrelated `no-img-element` warnings are expected; new errors are not.

Production deployment, live Stripe mode, real payment methods, and real customer emails are outside this smoke test.
