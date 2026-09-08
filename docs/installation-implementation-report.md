# IDS cash safeguards — local implementation report

Implemented in `C:\Users\Danie\mower-site\.worktrees\ids-installation-controls`, based on HEAD `99a4fdda55fd7c49f2d70bef4f2ed929021d0d65`. The pending migration was preserved. Database execution and installation activation remain outside this completed source task.

## Exact source changes and review patches

[Exact changed-file list](review/cash-safeguards/changed-files.md) and [hash/group manifest](review/cash-safeguards/changed-files.json) describe this task relative to the preserved pre-task implementation. They distinguish existing installation work from this follow-up. [All task changes](review/cash-safeguards/all-task-changes.patch) contains the complete source delta. Scoped diffs are provided for [controls](review/cash-safeguards/controls.patch), [accounting, operations and UI](review/cash-safeguards/accounting_cash.patch), [SQL](review/cash-safeguards/sql-from-reviewed.patch), [database harness](review/cash-safeguards/database_harness.patch), [source tests](review/cash-safeguards/source_tests.patch), and [documentation/tooling](review/cash-safeguards/documentation_tooling.patch).

[Updated controls-only patch](review/installation-activation-controls.patch) targets the reported baseline and is compatible with absent installation tables. It includes the separate cash flag, blocked cash operation/endpoint placeholders, the legacy cash-write rejection and history/unavailable UI. It cannot record cash by enabling a flag alone. The complete [accounting/cash patch](review/installation-balance-cash.patch) layers on top of it and replaces those placeholders. [Tests/documentation patch](review/installation-tests-documentation.patch) and [baseline group manifest](review/installation-change-groups.json) are also updated. These are review artifacts, not instructions to reapply changes to this completed worktree. The controls-only patch passed 14/14 isolated route/control tests, including missing-schema behavior ([log](review/cash-safeguards/evidence/controls-only-test.log)); A, then B and D passed patch-application checks. Patch verification uses plain temporary source files inside ignored `node_modules/.cache`; it creates no worktree, branch, real index update or commit.

## Implemented behavior

All three controls require the exact string `true`; missing/invalid values disable them. `INSTALLATION_CASH_RECORDING_ENABLED` is independent of intake and online payment creation. Cash receipt/correction POSTs and the underlying operations authenticate and reject disabled writes before persistence. Admin controls reflect the server flag and disable new entries when the current balance cannot be calculated/refreshed. The legacy `cash_paid` path rejects before obtaining a database client. Cash approval never adds a payment. Stripe reconciliation has no new cash/intake/Checkout gate.

Browser receipt input is limited to the stable key, dollar amount, received timestamp, optional reference/notes and explicit overpayment consent. Correction input is limited to the stable key, original receipt ID, dollar amount and required reason. Unknown fields, including balances, financial status, ledger snapshot and actor, are rejected. The server supplies **IDS shared administrator** from the existing authenticated administrator model and constructs all accounting/RPC arguments.

Corrections append a linked record without changing the original receipt, approved charges or genuine refund totals. Partial/full corrections are capped at original confirmed cash minus completed refunds and earlier corrections. The new SQL transaction records the correction, financial state and audit together while preserving safety, work, cancellation, forfeiture and reschedule information. The admin history displays receipt/correction IDs, reasons, shared actor and recording time separately from genuine refunds and charge adjustments. Customer/admin balances subtract recording corrections separately. A $750 recording corrected by $675 leaves $75 net cash; with the existing $250 deposit, net paid is $325 and $675 remains due on $1,000 of approved charges. It does not describe $675 as money returned.

Both write operations first ask the read-only RPC to recognize a matching key/payload. They only construct a hypothetical new balance if no operation exists. Authenticated `/cash/confirm` and `/cash/corrections/confirm` remain available when cash writes are off. Another installation's key or a changed normalized payload conflicts without exposing the original. Responses separate immutable `balanceAtRecording` from a newly calculated `currentBalance`. If current calculation fails, the entry remains confirmed with an explicit unavailable-current-balance state. The UI retains unresolved keys/payloads in session storage, restores them after refresh, and offers confirmation/retry using those same details. Failed current calculation retains readable admin history; failed list refresh preserves the existing view and disables new cash entries. Neither condition recommends another key or recording the same cash again.

## Revised SQL — NOT EXECUTED

- [Revised review SQL](review/installation-cash-proposed.sql), SHA-256: `636d3f0f95139de3e9824d015324a53382ed959b283f9345ba39dda82da6051c`.
- [Exact diff from reviewed SQL](review/cash-safeguards/sql-from-reviewed.patch). Prior SHA-256: `6e036d1d0de1a14dc314c94d8400167ffdb405bdafbdfa6ddf09ec764aca075b`.
- Unchanged pending `supabase/migrations/20260904204800_professional_installations.sql`, SHA-256: `01543ab2b5eaffc97dcd96c8e9253a307f9511a60cdf42652d11ba145efaafef`.

SQL validates both JSON balance objects, all required integer money fields, JSON/SQL nulls, bounds, signs, net/refund/correction arithmetic, charge/balance/due/credit arithmetic, deltas and payment status. Overpayment uses validated before-due, fixing the inflated-due counterexample. Exact ledger comparison includes corrections and occurs under the parent lock. The shared TypeScript calculator remains authoritative; SQL does not independently recompute all totals. Internally consistent invented totals from a privileged caller and retained direct table privileges remain an explicit trusted-server boundary.

The pending audit-sequence GRANT was already present; it was not the missing REVOKE. Revised SQL revokes all sequence privileges from PUBLIC, anon, authenticated and service_role, then regrants only service USAGE/SELECT. Later GRANTs do not remove earlier table privileges: existing installation tables retain broad service DML. New correction records allow service SELECT/INSERT, revoke other DML, enable RLS and enforce append-only/cap/link triggers. Database owners/privileged schema writers can defeat these protections. No global defaults, roles, migration history or SECURITY DEFINER workaround was introduced.

## Source validation

Commands used the existing `scripts/installation-local-command.mjs`, which rejects worktree environment files, removes inherited service credentials, supplies synthetic local values and explicitly sets all three controls false. No dependency or production setting was changed.

| Requested check | Result |
| --- | --- |
| `npm test` | PASS — 890/890, zero failures; [log](review/cash-safeguards/evidence/test.log). |
| `npx tsc --noEmit` | PASS using `--no-install`; [log](review/cash-safeguards/evidence/typecheck.log). |
| `npm run lint` | PASS — zero errors, 10 pre-existing image warnings; [log](review/cash-safeguards/evidence/lint.log). |
| `npm run build` | PASS ? compilation, TypeScript and 95/95 static pages; [log](review/cash-safeguards/evidence/build.log). |

Tests include the approved A–E accounting examples, enabled/disabled direct endpoints, forged financial fields, partial/full corrections, $750/$75 arithmetic, repeated/conflicting submissions, current-balance failures after confirmation, history preservation, denied confirmation, and rendered status/control behavior. Synthetic cash operations assert no Stripe calls or outgoing emails. Offline runner guard tests cover target/hash/container/database/cleanup rejection and no-argument refusal before any external process. These are source/mock tests, not PostgreSQL transaction evidence. Earlier HTTP/mobile screenshots are historical evidence for the earlier receipt implementation, not verification of this new correction flow. No dev server or new browser session was started for this task.

## Prepared database files and invocation order

[Detailed test plan and exact commands](installation-cash-database-test-plan.md) accompanies these actual files:

1. `scripts/installation-cash-db/runner.ts`
2. `scripts/installation-cash-db/guards.ts`
3. `scripts/installation-cash-db/psql.ts`
4. `scripts/installation-cash-db/00-demo-prerequisite.sql`
5. `scripts/installation-cash-db/10-fixtures.sql`
6. `scripts/installation-cash-db/fixtures.json`
7. `scripts/installation-cash-db/tests.ts`
8. `scripts/installation-cash-db/approval.example.json`

Future order is **preflight → separately approved create → separately approved test → optional separately approved cleanup**. There is no default/all phase. The candidate `ids_installation_cash_review_20260907` is unverified; creation refuses an existing database. The example approval is false and has an invalid container placeholder. Approved hashes, exact phase tokens, full local container/project/network/port verification, PostgreSQL role/version, disposable database OID/run marker and created-object/record manifests gate future writes. Only CREATE/DROP of that database may write through `postgres`; schema/fixtures/tests target the new database. Cleanup never runs automatically or deletes Docker volumes.

The test implementation uses two persistent real PostgreSQL sessions and observes blocking. It covers identical/conflicting keys, competing receipts, another ledger writer, correction races/caps, original preservation, malformed financial input, effective inherited ACLs, lifecycle preservation, deterministic fixture CHECK failures after entry insertion or at audit insertion, rollback and same-key retry. No part of it has been executed against PostgreSQL.

## Limits and preservation

Actual PostgreSQL syntax, atomicity, locking and ACL results remain unverified. Real PostgREST/application-to-database checks are subsequent work; the existing PostgREST target is untouched. The minimal demo relation cannot certify every production scheduling dependency. Existing Stripe reconciliation remains unfinished, including full identity/amount validation and duplicate/out-of-order recovery. Actual cash-refund/payout recording is still absent; corrections do not complete the cash lifecycle. Separate invoicing/PDF/email systems and mobile Back-scroll work were not resumed.

Preservation passed: all 871 original files in the captured inventory retain their hashes; original HEAD/status and both real indexes are unchanged. [Preservation result](review/cash-safeguards/preservation-result.json) compares the original file inventory, HEAD/status and both real indexes with the pre-task capture. Original configuration, backups and unrelated work were not edited. No commit, push, deployment, environment activation, Docker contact/start/repair, database setup/SQL/test/cleanup, real payment/refund/booking or email was performed. Stop point: implementation and review artifacts prepared; future database phases remain unauthorized.
