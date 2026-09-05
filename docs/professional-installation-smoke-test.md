# Professional Installation local smoke test

## Configuration and migration

Apply `supabase/migrations/20260904204800_professional_installations.sql` to the development Supabase project. It adds installation settings, requests, immutable pricing snapshots, adjustments, payments/refunds, auditable work sessions, audit events, RLS/grants, and shared scheduler conflict triggers. No existing rows are modified. New public tables are deliberately service-role only.

Use the existing `NEXT_PUBLIC_SUPABASE_URL`, server-only Supabase service key, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE=test`, application base URL, Resend configuration, and `REVIEWS_ADMIN_PASSWORD`. Stripe must be in test mode. Forward Stripe events to `/api/stripe/webhook`.

## Manual smoke test

1. Open `/professional-installation`; confirm the $1,000 breakdown and that the $250 deposit is clearly applied, not added.
2. Submit with Internet = No or Unsure; confirm it is accepted and flagged in `/admin/installations`.
3. Submit underground work; confirm 811 acknowledgement and estimated feet are required.
4. Attempt a time occupied by a demo and confirm the shared conflict is rejected.
5. Admin-approve the request; confirm a pricing snapshot and server-calculated 72-hour due date are saved. An approval at or inside 72 hours requires the full initial amount.
6. Follow the customer status URL and pay with Stripe test card `4242 4242 4242 4242`; confirm webhook updates deposit/payment and installation state.
7. Test cash requested/approved/denied. For cash failure at arrival, confirm cancellation, cash revocation, and special one-reschedule condition persist.
8. Begin, pause/suspend, and resume work twice; confirm cumulative minutes and session history. Travel must be entered as an adjustment and never a work session.
9. Enter one-way road time: verify 120 minutes = $0, 121/150/180 = $70, 181 = $140, and 270 = $210. Verify overrides require a reason and are visible before approval.
10. Exercise safety suspension, remediation pending/approved, weather postponement, and permanent termination. Confirm cumulative work time never resets, weather is not treated as customer cancellation, and unused materials remain reconcilable.
11. Add underground, material, additional-labor, and credit adjustments; confirm the balance is derived from snapshot + adjustments − net payments.
12. Mark cash paid before beginning work, complete work, and verify reconciliation. Exercise Stripe refund events and confirm payment/refund state.
13. Run `npm test`, `npm run lint`, and `npm run build`.

Production deployment is intentionally excluded.
