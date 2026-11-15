# Reviewed installation cancellations

## Scope and customer wording

New explicit acceptance uses `2026-11-15-cancellation-review`. The shared public wording is in `lib/installations/cancellation.ts`, shown in booking terms and the customer portal:

> If you cancel before installation begins, IDS will review your cancellation on a case-by-case basis. Materials already purchased for your job using your payment are non-refundable. You may arrange to pick up those materials or choose to forfeit them. A cancellation fee of up to $250 may also be deducted from the amount you’ve paid after the purchased-materials deduction. The rest of your payment will be refunded. No cancellation fee applies if IDS cancels. This policy does not limit any right to a full refund under applicable law.

An existing authorized IDS administrator records the case-by-case decision, reason, and evidence for any purchased materials. Both amounts default to zero. Notice and actual impact are review inputs, not an automatic timing schedule. This feature neither determines legal rights nor charges, issues refunds, changes payment activation, or sends messages.

- Purchased materials means verified actual cost already paid from the customer's funds for that job. It is not the prepaid allowance, an unspent amount, a markup, or travel.
- The calculation retains materials once, then caps the requested cancellation fee at the lesser of $250 and net collected funds remaining after materials. Purchased materials cannot exceed net collected funds. Pending refunds must finish/reconcile before the review is recorded.
- The resulting total replaces prior Installation/Setup/material/travel/other accounting charges. It does not add to them. The remainder appears as customer credit/refund due; only payment evidence confirms money returned.
- Materials initially remain `awaiting_choice`. An administrator may record pickup or forfeiture only after the customer expressly communicates that choice, with a reason/evidence. There is no invented deadline, automatic forfeiture, shipping, purchase, or completed-pickup action.
- IDS-initiated cancellation has no cancellation fee; other accounting is left for separate review, without promising an unapproved materials/travel result. Its labor credit uses saved net Setup charges, not current subscription eligibility.
- A confirmed applicable-law full-refund decision removes all deductions. A later confirmed requirement can correct a closed cancellation through a narrow audited action; original decisions remain in history. The action does not reopen work or return money.
- An unapproved request uses a zero approved-charge baseline, not default future pricing. Unpaid cancellation creates neither an invented fee nor a fictitious price credit.
- Work-session history, even a stopped/corrected zero-duration session, prevents this pre-work path. Existing cash-on-arrival failure, reschedule/forfeit, safety, placement-refusal and legacy cancellation behaviors remain separate.
- Final customer/full-refund settlements cannot be rewritten using generic pricing/material/travel/labor adjustments. Payment evidence and actual refund records remain separate.

Examples (before any actual refund):

| Net collected | Purchased materials | Requested fee | Fee retained | Refund due |
| --- | --- | --- | --- | --- |
| $1,000 | $150 | $250 | $250 | $600 |
| $250 | $100 | $250 | $150 | $0 |
| $250 | $0 | $0 | $0 | $250 |
| $0 | $0 | $250 | $0 | $0 |

## Version compatibility and rollout safety

The current public form and internal Setup-only form pass the exact accepted version. Both existing creation RPCs validate it. Explicit unknown/null/stale versions cannot create a request. Exact saved request retries are checked first and retain their original accepted terms.

Older in-flight forms do not send a version. They may still create a booking under `2026-09-08-setup`, the policy they displayed. They are never silently upgraded. The portal and admin cancellation calculation use the stored version. This compatibility avoids a schema-first rollout interrupting the old application. Unknown stored versions fail closed for cancellation.

`requireInstallationCancellationSchema()` probes only `cancellation_review` with `limit(0)`, never customer rows, before either creation operation. The column and RPC replacements are installed in one transaction. Therefore an app-first release against the old schema cannot create a new-version agreement that the old RPC silently labels legacy.

## Database change

`supabase/migrations/20261115015103_installation_cancellation_review.sql` is prospective:

- Adds nullable `installations.cancellation_review`; no existing accepted version, booking amount, payment, or refund is updated.
- Replaces the same three creation/admin function signatures. No new functions, grants, roles, RLS changes, or persistent access are added.
- Preserves exact-payload replay, existing locks, full expected-state concurrency checks, and the audited operation ledger.
- Adds database guards for reviewed cancellation amounts, evidence, work history, pending refunds, full-refund correction, and no-financial-change customer materials choice.

The source prerequisite is `20260908152507_professional_setup_addon.sql`, after the four released Installation migrations. Read-only production metadata on 2026-11-15 confirmed all five prerequisites in the project named `mower-site`, project ref `zyualbcbjchuhajyrpvw`, and confirmed the existing three function bodies exactly match the prerequisite source. All three existing RPC ACLs are `postgres` and `service_role` only, security-invoker. No hosted schema or customer data was changed during implementation.

## Database release checkpoint

On 2026-11-15, the reviewed SQL was applied once to the verified production project `zyualbcbjchuhajyrpvw`. Supabase recorded `20261115015103` / `installation_cancellation_review`; the repository filename now matches that entry. The SQL is byte-identical to the reviewed artifact, SHA-256 `57c1ad79600063c3821018ba5e1b2f06f6a4bbe2e09ef2c03f9570d81168e270`.

Read-only metadata verification confirmed the nullable JSON column, exact source-body hashes for all three replaced functions, their unchanged service-role-only ACLs and security-invoker mode, and enabled installation RLS. No customer records or payment operations were read or changed for verification. The application release still requires the exact-head preview and production deployment checks below. Do not reapply the migration.

## Review and release checklist

This work is a draft until final review. Do not test by creating real bookings or moving money.

1. Recheck main/PR state and the production project binding immediately before release. Confirm the target is `mower-site`, not either separately named verification project. Read migration/schema/function metadata only, not customer rows or secrets.
2. Confirm the exact reviewed SQL checksum, function prerequisites/ACLs, absent new column, and absence of another migration with this name. Verify the normal production build and exact-SHA preview before publication.
3. After explicit release approval, apply only the reviewed SQL through the supported migration connector to the verified target. Do not `db push` against this repository: unrelated historical timestamps differ between the repository and hosted migration history.
4. The connector chooses the migration timestamp. After the single apply, read history and identify the unique new `installation_cancellation_review` entry. Rename only this repository migration file to that verified version before final merge. Preserve its SQL byte-for-byte; never rewrite unrelated hosted history. If the apply outcome or new history entry is uncertain, inspect it and stop rather than reapply.
5. Verify the new nullable field, function definitions/version logic, unchanged RPC ACLs/RLS, and new migration entry. Old app/form payloads still map to legacy terms, so schema-first does not assign them new terms or require a booking outage.
6. Merge only the reviewed app commit; verify the exact deployment commit and public terms/intake visibility without submitting a real request. Keep existing intake/payment/cash flags and live-payment restrictions unchanged.
7. For rollback, prefer a forward fix. The old app works with the additive schema and versionless intake remains legacy. Keep the expanded schema: do not drop the column, remove audit data, rewrite accepted versions, or revert the RPCs. An old admin app attempting a new-policy cancellation without review fields is rejected by the new RPC guards instead of applying legacy timing. If new-policy staff controls are unavailable during rollback, keep those operations pending for the corrected app.

## Verification

- Focused TypeScript/SSR tests: `node --import tsx --test tests/installation-cancellation-review.test.tsx tests/installation-cancellation-boundaries.test.ts`.
- All installation tests: `node --import tsx --test tests/installation-*.test.ts tests/installation-*.test.tsx`.
- Synthetic PostgreSQL: `scripts/installation-cancellation-db.mjs`, pinned PGlite 0.5.16 installed outside the project; pass `PGLITE_PACKAGE` as described in that file. It loads five real prerequisites with synthetic demo scheduling dependencies and checks 28 checkpoints. It is not a complete Supabase stack and makes no hosted connections.
- The full repository suite has 13 pre-existing homepage/sitemap/support-form failures, reproduced on unchanged main `9263f7e`. No unrelated tests or product behavior were changed to conceal them.
- The normal `npm run build` (Next 16.3.5 Turbopack, Node 24.22.1) passes after using a real dependency directory. Its TypeScript stage passes. The alternate webpack build produces a pre-existing route-export type error on both this branch and clean main; no unrelated route was changed and no checks were disabled.
- Vercel preview for application commit `0119b6700911a153e7d44ae9ce221550d054306f` completed READY. GET `/professional-installation` returned HTTP 200 and the approved wording, with intake displaying CURRENTLY UNAVAILABLE under existing availability. No form was submitted.
- Full ESLint has no errors and 11 pre-existing warnings.
- No browser-driven or hosted database-backed mutation, real booking, or live payment test was performed. State-changing flows were tested only with synthetic local records. Production publication is not complete merely because a preview or local tests exist.
