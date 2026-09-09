# Remote Support and Service

## Architecture and scope

Baseline: `9f0de78055a6c437418ca19f927c383dc59a80f1` (released footer alignment).
Development takes place in the isolated `local/ids-remote-service` worktree.
The original workspace, retained test databases, production configuration and
production data are outside this change. The endpoint is one local commit;
pushing and deployment are separate release actions.

The repository audit found Next.js App Router, service-role-only database RPCs,
private checkout customer/order records, individually authenticated dealer
members, one existing Master Admin session, Resend delivery helpers, private
Supabase image upload/normalization, and shared Demo/Installation scheduling.
There was no authoritative Remote Support subscription, staff role, Service
invoice, or warranty PDF implementation. The old catalog service selector is
not part of the active machine checkout.

Reuse checkout customers, cryptographic login/session primitives, Master Admin
authentication, Resend and safe image normalization. Dealers do not gain staff
access. New staff accounts have individual identities, revocable sessions and
no fixed account limit. Included support and paid/warranty work share case,
assignment and history infrastructure, but only paid/warranty work has an
Invoice / Work Sheet. Technician-entered quantities are the billing source;
status timestamps are history, never a stopwatch.

## Locked rule and verification checklist

- [x] Header/footer Remote Assistance, Service card, no customer dashboard.
- [x] Machine Optional Services: Install $0, Setup $0, Remote Support $100;
      separate locked Installation/Setup pricing preserved.
- [x] $100 monthly, four issue-based sessions; one issue until resolved, no
      24-hour duration limit, no rollover, Phone/Facebook Messenger.
- [x] Standalone paid activation immediate; machine paid activation +10 days,
      first paid cycle and renewal dates consistent with that activation.
- [x] Name/Phone/Issue-only request; no initial upload or usage; Start Session
      consumes once transactionally; handoff and follow-up do not consume again.
- [x] Resolution notes required, separate from issue notes and case history.
- [x] Staff-only private attachments: three per case, 15 MB each, safe decoded
      image types and race-safe reservations.
- [x] Cancellation >=24 hours free (exact boundary included); late cancellation
      consumes scheduled slot; reschedule advances to next numbered slot.
- [x] No-show consumes scheduled plus next available; duplicate safe; durable
      next-cycle penalty, including Session 4 -> next cycle Session 1.
- [x] Failed renewal immediately suspends access/discount and pauses appointments;
      recovery within 14 days restores; unrecovered at 14 days cancels reliably.
- [x] Voluntary cancellation retains paid-period benefits, no proration/refund.
- [x] Exhausted active subscribers retain 25% labor/travel discount for paid
      Service; authoritative website subscription eligibility also supplies Setup.
- [x] Paid Remote and On-Site share workflow; warranty Yes/Unsure verification
      precedes paid authorization; no assumed coverage or paid appointment.
- [x] Labor $80 first started hour + $40/begun additional 30 minutes; hold/resume
      uses cumulative entered active work, never a new first-hour minimum.
- [x] Initial mapped travel from central Williamsville MO includes 60 minutes
      each way; combined excess $17.50/begun 30 minutes.
- [x] Legitimate return entire trip $5/begun 30 minutes; customer hazard return
      entire trip $17.50/begun 30 minutes; Remote Service has no travel.
- [x] Holds freeze labor except entered actual active work; customer delays have
      explicit staff discretion, hazard safety stop mandatory; expenses authorized.
- [x] Parts/materials/consumables separate and undiscounted; diagnosis billable
      without guaranteed repair; manufacturer/parts waiting not billable.
- [x] Warranty covers equipment and required service; physical work defaults
      shop drop-off; on-site requires explicit IDS approval. Not-covered requires
      customer proceed/cancel authorization, never automatic conversion.
- [x] Covered customer due $0; retain full value at $80/hour warranty labor,
      separate manufacturer reimbursement and no subscriber discount.
- [x] One linked work sheet, blank work/charge lines, work entered once, visits
      and handoffs retain invoice; draft -> review -> final, master may return.
- [x] Technical, invoice and payment statuses remain independent; finalization
      never charges; explicit authorized collection only, decline remains due.
- [x] Stripe payment-method authorization, card on file, different card/pay-now
      link, supported in-person payment path, authorized cash with audit trail.
- [x] Signed/mode-checked/idempotent/reconciled webhooks preserve existing
      machine, Demo and Installation payments; retry/out-of-order handling.
- [x] Warranty PDF only Resolved + Finalized, complete case/work-sheet data,
      prominent zero due; authorized view/download/print; durable automatic
      email to Service.IDS@proton.me without draft or duplicate delivery.
- [x] Master oversight/staff/assignment/warranty/pricing/billing controls;
      technician My Assigned Cases, mobile work sheet, disabled access revoked,
      no self-promotion or unrelated-case access, historical attribution retained.
- [x] Transaction/RLS/concurrency, unit/integration/route/browser/security tests;
      full tests, typecheck, lint, build and diff checks.
- [x] Second complete rule audit, stale copy search, complete diff/secret review,
      one intended local commit; no cache, credentials or test artifacts.

## External implementation references

- Supabase changelog reviewed: https://supabase.com/changelog
- Private storage and resumable signed uploads:
  https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Stripe subscription/Checkout APIs: https://docs.stripe.com/api/subscriptions
  and https://docs.stripe.com/api/checkout/sessions

## Runtime controls and release configuration

All new controls default off and require the exact value `true`. This local
implementation does not activate or change any production setting.

| Setting | Purpose |
| --- | --- |
| `REMOTE_SUPPORT_ENABLED` | Standalone and machine subscription intake; included requests |
| `SERVICE_INTAKE_ENABLED` | Paid/warranty intake and current public Service rates |
| `SERVICE_PAYMENTS_ENABLED` | Explicit Service/Remote Support payment creation and overdue retry |
| `SERVICE_CASH_RECORDING_ENABLED` | Audited cash receipts, additionally subject to staff permission |
| `SERVICE_EMAIL_ENABLED` | Private links, staff invitations and final warranty PDF delivery |
| `SERVICE_MAINTENANCE_ENABLED` | After-response and daily scheduled reconciliation/delivery |
| `SERVICE_TERMINAL_READER_ID` | Optional provisioned Stripe Terminal reader; no browser card data |

Reuse the existing server-side Supabase configuration, mode-matching
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_MODE`, trusted public
application origin, `CHECKOUT_SIGNING_SECRET`, Master Admin authentication,
`RESEND_API_KEY`, verified `DEMO_FROM_EMAIL`, and `CRON_SECRET`. No credentials
belong in source control. Keep the signing secret stable: private links and
pending delivery jobs depend on it.

The release migration is
`supabase/migrations/20260909011843_remote_support_and_service.sql`.
It adds private Service/subscription ledgers, RPCs, an image bucket, authoritative
Setup ownership bindings, and shared-calendar protections. It preserves the
released equipment, Demo, Installation and Setup ledgers and functions. Deployment
and applying this migration are separate authorized release tasks. Before a later
activation, deploy the matching code/schema and configure the existing signed
Stripe webhook endpoint for Checkout completion/expiry, asynchronous payment
success/failure, PaymentIntent events, subscription events, invoice paid/payment
failed, charge refunds, refund lifecycle and dispute lifecycle notifications.

The existing daily Featured Businesses cron remains unchanged. A second daily
cron invokes `/api/cron/service-maintenance` at 15:00 UTC. Authorized mutations
also wake durable maintenance after the response. Stripe failure cancellation
is scheduled with `cancel_at`, so the fourteen-day boundary does not depend on
the daily cron running at an exact minute. Access checks also enforce paid dates
directly. Jobs use leases, bounded batches, backoff and fair subscription rotation.

Master Admin enters through `/admin/service`, which uses the shared staff
workspace. Technicians activate their individual, time-limited invitation and
sign in at `/staff/service/login`. Disabling staff deletes sessions; reenabling
does not revive an old session. The account identity email is immutable; password
reset issues a new activation link. There is no fixed ten-person account cap.

Setup eligibility is now supplied by the website's actual paid Remote Support
records. Possession of both the subscription and Installation private links
creates a customer ownership binding, never a manual subscriber/discount flag.
Missing bindings and pre-migration lookup absence remain ineligible; operational
database failures abort repricing instead of silently granting a discount.

## Recovery and operations

- Invoice finalization does not collect payment. Use an explicit authorized
  card, pay-now link, configured Terminal reader, or cash action afterward.
- Use **Reconcile / close unpaid attempts** before switching collection methods.
  Processing or ambiguous attempts stay blocked. Unlinked attempts search
  current Stripe objects by immutable metadata; bounded complete absence is
  accepted only after 48 hours. Processor creation retries stop after 23 hours.
- Repeated/stale webhook notifications reconcile current Stripe state. Partial
  and full refunds/disputes preserve the original finalized invoice totals and
  technical outcome. Financial adjustment facts remain visible for Master review;
  they never automatically collect another payment or issue another refund.
- Unknown recurring failure timing suspends benefits pending reconciliation; it
  never invents a fresh fourteen-day grace period. Late payments are retained for
  review and cannot revive cancelled eligibility. Existing recurring subscriptions
  are recovered by customer/metadata identity before another is created.
- Final warranty delivery is queued only after resolution and finalization.
  The recipient is always `Service.IDS@proton.me`. Resend receives a stable semantic
  idempotency key and deterministic final PDF. An uncertain attempt beyond 23
  hours is held as `needs_review`. Check the provider's delivery record before
  any operational resend; the application deliberately does not offer a blind
  retry outside the provider's retention window.
- Terminal supports a server-driven, provisioned reader. Phone Tap to Pay needs
  a supported native Stripe Terminal application/device; this browser does not
  pretend to provide native NFC access. Physical-device qualification is a later
  activation check, separate from the simulated-reader result below.

## Verification and retained evidence

Testing used synthetic records in guarded local PostgreSQL databases and Stripe
TEST mode only. All earlier test databases remain intact. The final migration
was applied successfully to `ids_installation_cash_review_20260907_remote_019`;
all **27 real PostgreSQL scenarios passed**, including RLS/grants, concurrent
session consumption, no-show carry-forward, exact cancellation boundaries,
suspension/recovery, immutable history, twelve technicians plus Master,
concurrent image limits, warranty finalization, customer-attributed cancellation,
outbox leases, cash permissions, shared calendar conflicts, refund/dispute
accounting, Setup binding, machine card/ACH/wire snapshots and versioned pricing.

Actual Stripe TEST verification, with the real app/server module and persistent
local accounting:

- $100 standalone Checkout; repeated creation returns the same session.
- Declined test card leaves subscription pending and creates no paid cycle.
- Successful replacement card activates one four-session cycle and creates one
  monthly subscription, with no duplicate first-month charge.
- Zero-charge card authorization, explicit $120 Service collection, declined
  collection remaining Payment Due, then a successful different-card pay-now link.
- $30 partial refund followed by the remaining $90 refund; repeated idempotent
  requests retain the same refunds and final cumulative $120 refund.
- A simulated Terminal reader collects $80 once and persists Paid while the
  technical case stays Resolved. The setup fixture used a confirmed real TEST
  SetupIntent and trusted local RPCs; this was not physical reader testing.
- Stripe CLI forwarded original signed TEST notifications and repeated delivery.
  The initial concurrent recurring-setup race produced one retryable 503, followed
  by successful delivery and a single subscription/cycle. Subsequent payment and
  refund outcomes were reconciled successfully without duplicate ledger entries.

Renewal/failure/recovery/deadline behavior is covered by actual server-module
tests with controlled Stripe boundaries and real PostgreSQL scenarios. No claim
is made that a real month elapsed or that Stripe Test Clock renewal was run.
Email tests capture the provider boundary; **no customer/staff/warranty email was
actually sent**. Image tests exercise the real decoder/controller against a
controlled private Storage boundary, plus database concurrency/authorization;
they do not claim a production Storage upload.

The actual warranty workflow generated a two-page PDF: $178 full Service value,
$0 customer due, with $160 manufacturer reimbursement separate. Both rendered
pages were visually inspected, and pre-final access was rejected. Browser review
covered customer subscription/intake, warranty selection, Master assignment and
coverage review, subscription/payment status, technician login/work-sheet draft,
submission/resolution, and desktop/mobile layouts including 320px without
horizontal overflow. The technician's browser Start Session and Continue same
session actions persisted exactly one consumed slot with no hourly invoice.
The first Start Session request returned a temporary database error; the same
operation succeeded on retry without duplicate usage. The retained result does
not hide that initial failure. Browser error inspection was empty afterward.
Public header/footer entries and Services & Scheduling destinations were checked.
The machine builder exposed all three Optional Services and blocked continuing
with Remote Support until explicit recurring consent. Actual HTTP checks rejected
anonymous access, unrelated-case access, self-promotion and disabled sessions.

Final checks after implementation corrections:

- `npm test`: **1,096 passed**, zero failed/skipped.
- `npx tsc --noEmit`: passed.
- `npm run lint`: zero errors; ten existing `next/no-img-element` warnings in
  unchanged image markup. No new lint warning was introduced.
- `npm run build`: passed, including TypeScript and all 102 generated pages.
  The existing Google Fonts fetch required network-enabled execution.
- `git diff --check`: passed.
- Complete candidate review: 90 source, migration, documentation and test files;
  no credential signatures or accidental artifacts detected.

The second locked-rule audit also corrected customer cancellation attribution,
Master-authored work surviving technician handoff, shop-drop-off travel rejection,
warranty zero-due visibility, explicit cumulative rate breakdowns, changed-card
retry identity, and email-disabled outbox fairness. Focused regressions and the
final full suite passed after these corrections.

Ignored local evidence is under `node_modules/.cache/ids-remote-service/`, including
test logs, local manifests, signed delivery receipts, screenshots and PDFs.
Credentials, cache files and disposable database artifacts are excluded from the
source commit. No production migration, configuration change, Stripe activity,
email, push or deployment occurred.
