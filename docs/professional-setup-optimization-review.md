# Professional Setup & Optimization and equipment return footer policy — implementation review

Date: September 8, 2026. Status: **complete and commit-ready; no remaining blocker.**

## Locked Remote Support eligibility rule

The authoritative eligibility source will be the website's own active Remote Support subscription records. IDS confirmed that this subscription system has not been implemented or launched and will be the next feature. The released repository and read-only Supabase schema inspection contain no existing subscriber implementation to connect. The released migration history ends with `20260907235702_installation_stripe_reconciliation`; this patch's migration has not been applied there.

`lib/installations/subscriber-eligibility.ts` is the single server-only runtime provider. It currently returns **false for every job**. Authenticated admin operations call it with the server-resolved job ID before calculating a new operation; matching retries return their already-recorded result. A provider failure aborts before a financial write. Browser input, guessed job fields, environment flags, and administrator verification actions cannot grant eligibility. No subscriber checkbox, manual eligibility field, eligibility evidence record, or subscription table is introduced.

The future Remote Support implementation must connect this provider to the verified customer's active website subscription records and retain a fail-closed result for missing or unverifiable subscriptions. The 25% calculation remains independently tested with explicit synthetic `eligible=true` arguments and a controlled provider double, including persisted discounts and replay behavior. These tests do not create an eligibility record or enable an actual customer discount.

Per the locked IDS rule, the missing future subscription source is **not a blocker** to Setup commit-readiness. IDS intends to complete Remote Support before activating these services. This patch does not design or implement that future system.

## Baseline and workspace

- Baseline and verified starting `origin/main`: `21a47a2d9e9b88ca9bb6b55cffa17483fd75e4bf` — Complete Professional Installation controls, accounting, and scheduling.
- Task worktree: `C:\Users\Danie\mower-site\.worktrees\ids-setup-addon`.
- Branch: `local/ids-setup-addon`.
- HEAD remains the baseline. Nothing is staged or committed.
- Original workspace HEAD/status/index and 871 captured file hashes are unchanged. Original backups and existing local test evidence were preserved.

## Implemented behavior and complete diff summary

Customer information and request screens offer **Add Professional Setup & Optimization — $500** within Installation. Selecting it shows the combined price and one deposit. Setup has no separate primary public service card; Demo and Service remain on the existing scheduling page. Public selection uses the existing Installation intake flag and strict server validation. Customer requests cannot set prices, service ownership, or subscriber eligibility.

Admin and the existing customer portal show selected components, approved Setup price, each labor total/remaining included time/overtime, actual Setup parts, one travel charge, discounts, and the shared financial balance. Internal administrator notes, pricing reasons, raw request payloads, work notes, and actor details are excluded from the customer API projection. Existing payment/refund history remains available.

Admin can create and approve a real **Setup-only job for an existing mower owner** through a connected authenticated form/API/RPC. This saves `installation_selected=false`, `setup_selected=true`, zero Installation labor/materials allowance, and no fabricated grounding acknowledgment. The existing customer record, availability, audit, and ledger are reused. No email or processor request occurs on creation.

The patch extends the existing pricing snapshot with the optional saved Setup price. Legacy snapshots remain valid. A future default-price change does not change an approved job. Individual overrides and selection changes use existing atomic admin operations, with previous/new values, reason, shared IDS administrator identity, and timestamp retained in audit history.

Setup base labor, overtime, actual parts, and discounts use attributed, append-only adjustments in the existing ledger. The accounting and Stripe modules and their payment/refund RPC signatures remain unchanged. The local database runner now includes the additive migration, Setup calculator source hashes, and targeted Setup database checks.

## Equipment return and refund footer addition

One reusable `EquipmentReturnPolicyModal` adds a visible **Returns & Refunds** button to every existing public footer variant: the desktop homepage footer, mobile homepage footer, and Services & Scheduling footer. The root layout does not have a universal footer; existing footer render conditions and navigation are retained. Desktop homepage views share their footer, while the mobile footer keeps its existing home-view placement.

The component contains the exact IDS-approved **Equipment Return & Refund Policy** title, paragraphs, and section headings in one place. The rendered wording, including curly punctuation, matches the approved text exactly after whitespace normalization; a regression test locks that complete wording with its SHA-256 digest. The 30-day return terms, warranty-first evaluation, replacement receipt restarting the period, 25% restocking fee for other equipment returns, prior authorization, equipment-only scope, separate service terms, and applicable-law savings language are all present.

The native modal dialog follows the existing dialog approach without adding a dependency. It has a labelled trigger, unique dialog/heading IDs, modal semantics, initial heading focus, a visible sticky Close button, Escape support, native background inertness, body scroll locking, and focus restoration. The URL does not change. The responsive dialog scrolls internally; reopening resets its scroll position to the beginning. This reset was corrected after browser review found that the previous position persisted.

Desktop (1440 × 900), mobile (390 × 844), small mobile (320 × 568), and Services & Scheduling browser checks passed for keyboard opening, exact text, Close/Escape, focus return, background blocking, viewport fit, reaching the last paragraph, persistent access to Close, unchanged URL, and reopening at the top. The dialog accessibility scan reported 0 violations and 0 incomplete checks. Rendered policy text contrast was at least 10.35:1. No browser application errors or overlays occurred in these flows. The isolated local server had no production credentials; unrelated Demo availability remained unavailable and the existing Oswald promotional font used a fallback when its download was sandbox-blocked. The final network-enabled production build passed.

This is informational equipment policy only. It adds no refund automation and changes no Installation, Setup, or Remote Support financial policy, cancellation terms, deposits, labor/travel logic, accounting, or existing 7–12-business-day service-refund notice. The completed Setup source and migration were preserved; the only additional Services page changes are the policy import and footer component.

## Financial behavior

| Booking | Approved initial charges | One deposit | Remaining after deposit |
|---|---:|---:|---:|
| Installation only | $1,000 | $250 | $750 |
| Installation + Setup | $1,500 | $250 | $1,250 |
| Combined, 150-minute one-way drive | $1,535 | $250 | $1,285 |
| Combined, 210-minute one-way drive | $1,570 | $250 | $1,320 |
| Setup removed before work, no other charges | $1,000 | Original $250 retained | $750 |
| Setup-only, no travel/parts | $500 | $250 | $250 |

Installation retains $800 labor plus its $200 materials allowance. Setup has no allowance: customer-supplied blades carry no parts charge; actual customer-authorized IDS parts/consumables are reconciled separately. Removing Setup appends the base credit and retains the payment/deposit history and authorized actual parts expenses. It makes no refund call.

Combined travel includes 120 one-way drive minutes from Williamsville, Missouri. It charges $35 per started excess one-way hour **total**: 120 minutes $0; 150 or 180 minutes $35; 210 minutes $70. No return-direction multiplier or second Setup travel line is added. Installation-only and genuinely separate Setup-only visits retain the existing round-trip travel calculation. Reconciliation targets the existing travel total, so repeating it or continuing work cannot accumulate another charge. Adding Setup to an existing Installation explicitly reconciles travel under the combined rule with an audited delta; removing Setup retains already approved travel.

Installation and Setup have separate cumulative 240-minute included labor buckets. Sessions identify their component; corrections cannot switch it. Pause/resume retains each total. Setup overtime is $125/hour in started 15-minute increments: 240 minutes $0; 241 $31.25; 256 $62.50; 300 $125; 315 $156.25. Installation 300 / Setup 180 minutes produces $125 Installation overtime and no Setup overtime. Installation 180 / Setup 315 produces no Installation overtime and $156.25 Setup overtime. Travel, waiting, and lodging are excluded from Setup work time.

For an explicitly eligible fixture, Setup base/overtime and the single eligible travel charge receive 25% off once. Installation labor and materials/parts are not discounted. The final eligible amount is rounded once to the nearest cent. The actual server provider currently returns false, so no customer receives this subscriber discount until the authoritative future source is connected.

The existing within-72-hours full-initial-payment requirement, cancellation deposit tiers, cash-on-arrival failure/reschedule/forfeiture rules, and 7–12 business-day refund notice remain. Changes to Setup within 72 hours refresh the required initial amount without creating or refunding any deposit. Safety/weather, technician authority, customer permissions, and material property-use-plan approval are included in the terms.

Scheduling retains one initial four-hour reservation and the existing continuation/rescheduling structure. This is not an eight-hour public slot or two overlapping reservations. Both labor buckets survive continuation; authoritative calendar checks and Demo conflict protection remain.

## Additive migration

`supabase/migrations/20260908152507_professional_setup_addon.sql`

- Adds Setup pricing defaults, selected service components, and travel-policy/discount fields to existing tables. It adds no subscriber eligibility fields or subscription table.
- Adds work-session component identity and a constraint/trigger preventing component changes or cross-component corrections.
- Retains mandatory grounding acknowledgment for Installation while allowing genuine Setup-only jobs.
- Extends the existing intake/admin/default-pricing RPC implementations without changing their signatures or weakening existing grants/RLS.
- Adds the service-role-only `ids_create_setup_only` RPC with canonical retry matching, existing schedule locks, validation, and audit.
- Does not backfill Setup charges or rewrite historical pricing. No already-applied migration was edited.

Exact final local sequence tested in a fresh disposable database: existing Demo structural prerequisite; existing admin-login prerequisite; the four released Installation migrations in order; 20 legacy Installation fixtures; then the final Setup migration. The 20 existing jobs, approved prices, payments, and adjustments matched their pre-migration values exactly after excluding the additive default columns. Database checks also confirmed that no subscription table or Remote Support status fields exist and that the admin RPC rejects a manual eligibility patch.

## Validation results

| Check | Result |
|---|---|
| New Setup and eligibility unit/component/server-boundary tests | 40 passed |
| New equipment-policy component/content/footer tests | 6 passed |
| Latest affected focused suite, including existing footer/contact and Setup tests | 53 passed |
| Real PostgreSQL Setup checks | 6 groups passed |
| Existing real PostgreSQL regression | 23 groups passed: cash 10, workflow/calendar 7, controlled Stripe 6 |
| `npm test` | 999 passed; 0 failed/skipped |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; 0 errors, the same 10 pre-existing `no-img-element` warnings; no new warnings |
| `npm run build` | Passed; 97/97 static-generation entries |
| `git diff --check` | Passed; new files also checked without staging |
| Secret/artifact audit | No credential signatures found in candidate files; cache/environment/database/browser artifacts excluded |

The initial sandboxed build could not download its existing Google Fonts dependency. The authorized network-enabled local build passed; no font or unrelated source change was made.

Actual browser → API → local PostgreSQL → rendered-record checks passed for public combined creation and authenticated Setup-only creation/approval. The approved combined portal showed $1,535 charges, $35 travel, and one $250 deposit. Setup-only showed $500 and no Installation allowance. Unauthorized Setup-only creation returned 401; disabled checkout returned 503. Public intake-off rendered information without the request form. No browser application errors/overlays were observed on the Setup flows. The Services page retained Demo and Installation navigation with no Setup primary card.

The isolated local fixture contains only the Demo structural dependencies needed for shared-calendar testing, so its Demo availability HTTP endpoint returned 503; a complete Demo browser booking was not claimed. Existing Demo tests and the real two-connection calendar-conflict/DST regression passed. Existing Installation, cash, Stripe reconciliation, refund lifecycle, event replay, and stale-ledger safeguards passed. Stripe evidence in this patch's tests was controlled and synthetic: no actual Stripe API transaction was made or needed for the new amount calculation.

## Corrections found during review

- Adding Setup after Installation approval now reconciles the prior round-trip travel price to the combined-trip price once, with history.
- Legacy draft/approved records receive and retain the intended Setup price; admin fields no longer show an undefined-price value.
- Add-on changes within 72 hours refresh the full initial amount, including a newly approved Setup price.
- Setup-only wording and acknowledgment display identify the actual purchased service; zero discounts render as `$0.00`.
- The customer projection now excludes internal notes and pricing/eligibility reasons.
- The locked eligibility rule is centralized in one server-only provider returning false; proposed manual eligibility columns were removed before shipping. Controlled eligible cases remain tested without storing subscriber status. The boundary test harness now accurately represents nullable pricing on unapproved requests.
- The equipment policy reopens at its beginning after scrolling and closing. Existing page-render test fixtures now include the new shared policy component dependency.

## Exact changed files

These 33 files are the exact commit-intended manifest. All remain unstaged, awaiting IDS review.

```text
app/admin/installations/page.tsx
app/api/admin/installations/setup-only/route.ts
app/professional-installation/[token]/page.tsx
app/professional-installation/page.tsx
app/services-scheduling/page.tsx
components/home/DesktopHomepage.tsx
components/installations/InstallationAdminAction.tsx
components/installations/InstallationBookingForm.tsx
components/installations/InstallationServiceSummary.tsx
components/installations/SetupOnlyJobForm.tsx
components/installations/SetupTerms.tsx
components/mobile/MobileHomepage.tsx
components/policies/EquipmentReturnPolicyModal.tsx
docs/professional-setup-optimization-review.md
lib/installations/admin-policy.ts
lib/installations/operations.ts
lib/installations/policy.ts
lib/installations/server.ts
lib/installations/setup-server.ts
lib/installations/setup.ts
lib/installations/subscriber-eligibility.ts
lib/installations/validation.ts
scripts/installation-cash-db/runner.ts
scripts/installation-cash-db/setup-tests.ts
scripts/installation-cash-db/workflow-tests.ts
supabase/migrations/20260908152507_professional_setup_addon.sql
tests/equipment-return-policy.test.tsx
tests/helpers/installation-harness.ts
tests/helpers/installation-service-page.ts
tests/installation-service-entry.test.tsx
tests/installation-setup-boundaries.test.tsx
tests/installation-setup.test.ts
tests/installation-subscriber-eligibility.test.ts
```

## Preservation and release boundary

All private helpers, logs, browser profiles/screenshots, synthetic service credentials, and evidence remain under ignored `node_modules/.cache/ids-setup-addon/`. No `node_modules/.cache/**`, `stripe.env`, environment file, database dump, or disposable database artifact is in the source manifest. No package or lockfile changes were made.

All 10 disposable databases predating this Setup task retain their original identities and were not reset, deleted, or written by this task. The earlier Setup verification database `ids_installation_cash_review_20260907_setup` also remains unchanged by the final eligibility work: 42 synthetic jobs, 68 payment records, 18 work sessions, and 195 audit events. Thus all 11 databases preceding this final pass are preserved.

The final migration was applied only to a new disposable database, `ids_installation_cash_review_20260907_setup_final`, retained with 33 synthetic jobs, 62 payment records, 12 work sessions, and 141 audit events. No database was dropped or reset. The task-owned browser/app/proxy services were stopped; the task REST container remains stopped and retained. Existing REST configuration was verified unchanged.

The subsequent footer-policy addition performed no database operations. All 12 disposable databases were retained. Its screenshots, browser results, test logs, and pre-addition hashes are under the same ignored task cache. Its local app/browser services were stopped after verification.

Installation control code remains unchanged and defaults intake, online payments, and cash recording off. The local browser test enabled only isolated test intake temporarily; it had no Stripe credential and payments/cash stayed off. No production configuration was changed or activated. Production access was read-only schema/migration inspection only. Production Vercel environment values were not separately retrieved in this task.

Nothing was staged, committed, pushed, deployed, or migrated in production. No customer email, live money movement, or real refund was sent. The original dirty workspace, its index/backups, the released commit, and prior evidence remain intact.

Professional Setup & Optimization plus the IDS Equipment Return & Refund footer policy are complete and commit-ready. Awaiting IDS review before staging, commit, push, migration, deployment, or activation.
