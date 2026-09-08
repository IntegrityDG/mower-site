# Targeted cash database tests — prepared, NOT EXECUTED

The source task authorized writing these files only. No Docker contact, service start/repair, database SQL, fixtures, tests, or cleanup was performed. Database existence and container identity remain unverified. Source tests use synthetic persistence; they do not certify PostgreSQL atomicity.

## Files and minimal prerequisites

- `scripts/installation-cash-db/runner.ts`: explicit preflight/create/test/cleanup phases, target checks, approved hashes, database OID/marker and manifests.
- `guards.ts`: pure guards exercised by `tests/installation-cash-db-guards.test.ts` without external processes or connections.
- `psql.ts`: two real persistent `docker exec ... psql` sessions for the future test phase, using the pinned container and target database only.
- `00-demo-prerequisite.sql`: minimal synthetic `demo_requests` relation with UUID id, start/end timestamps and status; required by the unchanged pending installation scheduling trigger. It does not recreate production demo constraints, functions, slots, routing, catalog, or history.
- `10-fixtures.sql` and `fixtures.json`: explicit synthetic installations, deposits and work record; fixed UUID namespaces and future nonoverlapping appointments. No production clone or real booking.
- `tests.ts`: executable PostgreSQL assertions and real two-session lock/concurrency/failure tests. Imported by offline guard tests without executing its exported test function.
- `approval.example.json`: exact local source hashes and a deliberately invalid container placeholder; `approved` is false. Copy and review later; never treat the template as authorization.

Required existing cluster prerequisites: PostgreSQL 17; `postgres`, `service_role`, `anon`, `authenticated`; service-role RLS bypass; browser roles without superuser/RLS bypass; `gen_random_uuid`, PL/pgSQL and timestamp ranges. The runner verifies them and stops on discrepancies. It creates or alters no cluster roles, memberships or global default privileges.

The proposed target is the separate database `ids_installation_cash_review_20260907`, in the existing `mower-site-installation-smoke` project/container with loopback database mapping `127.0.0.1:54322` and network `mower-site-installation-smoke-loopback`. Only a local Windows Docker named pipe is allowed. Each phase checks the full reviewed 64-character container ID, name, project label, running state, network and all project port bindings. No Docker start, reset, volume deletion or repair command exists in the runner.

## Exact future invocation order

These are proposed commands, not commands executed during this task. Run from the existing implementation worktree using the existing `tsx` installation. Before preflight, an operator must independently identify and review the local full container ID and create `docs/review/cash-safeguards/database-approval.json` from the example. The example includes hashes for all four SQL files, runner/guards/transport/tests/fixture manifest and trusted accounting/policy source. Any source change invalidates approval.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/installation-cash-db/runner.ts preflight --approval docs/review/cash-safeguards/database-approval.json
```

Preflight is read-only: Docker metadata, role/version/function checks, candidate existence and relevant existing table names. It does not create a database, mutate a manifest or inspect customer records. Review its output and separately authorize creation. If the candidate exists, creation stops rather than reusing or erasing it. Set `approved: true` only following explicit authorization of the reviewed hashes/target. Both that file and an exact phase token are required for writes.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/installation-cash-db/runner.ts create --approval docs/review/cash-safeguards/database-approval.json --manifest docs/review/cash-safeguards/database-run.json --approve-create ids_installation_cash_review_20260907
```

Creation sends only `CREATE DATABASE ids_installation_cash_review_20260907 WITH TEMPLATE template0 OWNER postgres` through the existing `postgres` database. All schema and record writes use the new disposable database. Application order is: private run marker; minimal demo prerequisite; **unchanged** `supabase/migrations/20260904204800_professional_installations.sql`; revised `docs/review/installation-cash-proposed.sql`; synthetic fixtures. No migration-history insert or historical replay occurs. An existing local run manifest is never overwritten by create. The local manifest pins the new database OID, run UUID, approved hashes, created relations/functions/triggers/constraints and initial record IDs/keys; the reviewed fixture manifest declares intended records before creation.

After creation output and manifest review, separately authorize the test phase:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/installation-cash-db/runner.ts test --approval docs/review/cash-safeguards/database-approval.json --manifest docs/review/cash-safeguards/database-run.json --approve-tests ids_installation_cash_review_20260907
```

Test startup rechecks OID, owner-session role/version, private database marker, hashes and object inventory; each persistent connection verifies database/OID/role/marker before changing session settings or executing fixtures. It refuses a second test run against an already-started manifest. Accepted operation identities are appended as observed; a successful run replaces the record inventory with actual persisted IDs/keys and writes `database-results.json`. Observed operations during an unsuccessful run are diagnostic observations, not proof of commit. Preserve the failed target for inspection.

Optional cleanup requires its own explicit approval and exact command; it is never called on success or error:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/installation-cash-db/runner.ts cleanup --approval docs/review/cash-safeguards/database-approval.json --manifest docs/review/cash-safeguards/database-run.json --approve-drop ids_installation_cash_review_20260907
```

Cleanup checks the matching prepared manifest, full container ID, OID, marker, hashes and object inventory, then requires zero target connections. Its only write through `postgres` is `DROP DATABASE ids_installation_cash_review_20260907`, without FORCE. It never deletes a Docker volume or the `postgres` database. The local manifest remains. An incomplete create or unexpected objects stop automated cleanup and require a separately reviewed recovery procedure; do not loosen the guards to force cleanup.

## Actual test coverage prepared

| Area | PostgreSQL assertions written |
| --- | --- |
| Accounting A–E | $1,000 approved: $250 deposit/$750 due; +$750 cash/$0 due; +$50 cash/$700 due; $50 deposit refund/$800 due; $60 materials credit on a fully paid installation creates $60 customer credit, then completed refund clears it. Pending/failed payments excluded; linked completed refund mirror counted once. |
| Balance contract | Both JSON structures; every money field missing, JSON null, SQL-null root, wrong type, scalar/array, fractional cents, unsafe integer, nonnegative rules, net/charge/due/credit arithmetic and financial status. Inflated before-due counterexample rejects. |
| Receipt/correction | Original $750 receipt plus $675 linked recording correction; approved charges unchanged, net cash $75, refund totals unchanged. Partial/full corrections and caps net of completed refunds. Original immutable; service correction UPDATE/DELETE denied. |
| Retry | Saved balance remains the recording snapshot; confirmation does not require pricing/current calculation. Cross-installation lookup conflicts without returning another receipt. Exact normalized-payload reuse/conflicts. |
| Real concurrency | Two distinct backend PIDs. Same-key receipts block then replay one receipt/audit; conflicting reuse blocks then rejects; different-key receipts reject stale inputs and require refreshed overpayment review; another adjustment writer changes the locked ledger; same-key corrections replay one correction/audit, competing corrections reject stale snapshots and exceed-cap retries. Blocking is observed with `pg_blocking_pids`, not inferred from elapsed time. |
| Atomic failures | Fixture-specific CHECK constraint rejects the guaranteed financial status transition after receipt/correction insertion, or rejects that operation's audit insert. Savepoint rollback plus another session confirm no partial receipt/correction/audit or financial/work mutation survived. Same-key retry succeeds once the fixture constraint is rolled back. Identity-sequence privilege removal is deliberately not used. |
| Privileges | Effective `has_function_privilege`, `has_table_privilege`, `has_sequence_privilege`, role membership and RLS checks; actual denied browser-role calls/inserts; no PUBLIC function execution; intended service sequence USAGE/SELECT only. Unexpected inherited access fails verification instead of changing cluster roles. |
| Lifecycle | Suspended, terminated/forfeited, cancelled/reschedule and completed states retain every installation field except allowed financial status/time; forfeiture remains unchanged. |

Valid dollar input with up to two decimal places is accepted (for example `75`, `75.5`, `75.50`). Fractional **cents**, such as `75.501`, are rejected by the route's shared validation; SQL receives positive integer cents bounded by its integer argument. Aggregate money fields use JavaScript-safe integer cents. Offline unit/route tests verify browser fields cannot choose balances, ledger snapshots, status or actor and make no Stripe/email calls.

## SQL permissions and trusted boundary

The pending migration already grants audit-sequence USAGE/SELECT. That existing **GRANT is not a REVOKE**. The revised draft first revokes all sequence privileges from PUBLIC, anon, authenticated and service_role, then regrants only USAGE/SELECT to service_role. Effective access may also come through inheritance/ownership; future tests check that and stop on unexpected privilege paths.

Later GRANT statements are additive. Existing installation tables retain SELECT/INSERT/UPDATE/DELETE service-role privileges from the pending migration; this is not function-only access. New correction records revoke all four grantees then grant only service SELECT/INSERT, enable RLS and use append-only/cap/link triggers. New functions are SECURITY INVOKER with an empty search path and restricted execution. Existing scheduling function permissions remain as defined by the unchanged pending migration.

Authenticated server code constructs normalized financial arguments with the shared TypeScript calculator. SQL validates structure, arithmetic, deltas and exact ledger freshness under the installation lock, including corrections. It does **not** independently recompute every total. A privileged caller can invent internally consistent totals or use retained direct-write privileges; owners/superusers can change protections. Direct inserts do not automatically acquire the RPC's full audit/financial transaction contract. Protect service credentials and use the authenticated operations. No second accounting engine, global default privilege change, role redesign or SECURITY DEFINER workaround is introduced.

## Remaining verification and cash lifecycle gaps

All real PostgreSQL syntax, trigger, ACL, rollback and concurrency results remain unverified until these prepared phases are separately authorized and executed. The minimal demo table proves only the installation trigger's narrow relation interface, not every production scheduling dependency. Tests explicitly exercise a concurrent adjustment writer; broader scheduling and all production writer/deadlock interactions remain subsequent integration work.

Real PostgREST UUID/JSONB/timestamp serialization, role exposure and authenticated application-to-database behavior are a subsequent phase. This runner does not retarget the existing PostgREST service, start an application or create a second Supabase stack. No real browser-to-database verification is claimed.

A receipt correction records an earlier entry mistake. It does not return money, issue a Stripe refund, or represent cash handed back. Actual cash-refund/payout recording remains absent and requires a separately designed, linked and auditable money-return flow. Duplicate/out-of-order Stripe event recovery and complete Stripe refund reconciliation also remain unfinished. Existing reconciliation is not disabled by the cash flag. No invoicing, PDF, email, automatic payout or new technician identity was added.

Reference for failure assertions: PostgreSQL 17 [psql variables](https://www.postgresql.org/docs/17/app-psql.html) expose SQLSTATE and LAST_ERROR_MESSAGE; sequence ACL revocation is not the deterministic failure mechanism for identity-backed inserts. [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) documents transaction/row/advisory locks. These references support the design; they are not execution evidence.
