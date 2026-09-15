# Dealer Network geocoding repair

Production audit on September 15, 2026 found `GOOGLE_MAPS_GEOCODING_API_KEY` missing in Production, Preview, and Development. All five non-deleted members have complete U.S. addresses. Their private location records are failed with `NOT_CONFIGURED`. Four members are active and one awaits activation. Seven deleted, archived accounts have incomplete, scrubbed addresses and no location; they must not be backfilled.

The controlled public-address diagnostic returned `NOT_CONFIGURED` without contacting Google. No evidence establishes whether the intended Google project's API, billing, or restrictions are correct. Those settings require a real server credential before they can be tested. The Vercel CLI cannot pull sensitive Production secrets; use the authenticated production admin diagnostic after configuring the key.

## Existing path and defects

- Approval and activation already attempt initial geocoding. Member and admin address edits, explicit retries, and a business-origin directory fallback also invoke it.
- Stored required fields are nullable for historical/deleted records. `String(null)` previously generated literal `null` query parts. Queries now validate completeness and normalize whitespace, optional suite, uppercase state, ZIP+4, and commas without rewriting profile data.
- Google requests still use the existing Geocoding v3 endpoint, `components=country:US`, and an eight-second timeout. There are no automatic provider retries. Structured diagnostics distinguish provider statuses, HTTP failure, timeout/network failure, bad responses, configuration categories, and database failures without copying provider error text.
- Coordinate success requires numeric, finite, bounded latitude and longitude. The database's existing pair/range/status/member-FK constraints remain in place.
- Address updates previously saved profile data before independently clearing coordinates. A database trigger now invalidates the private point in the same address-update transaction. A new service-only save RPC locks and compares the address snapshot after the external request, refusing outdated results. It retains a successful current point if a same-address retry fails.
- The service-only directory RPC masks failed/stale coordinates. Distance calculations and business-origin reuse require a succeeded valid point. The existing directory is a member-authenticated search/nearby experience, not a public coordinate map. Its explicit API projection retains rounded distance and omits street address and raw coordinates.
- Retry identity continues to come exclusively from the member session. Forged fields are rejected and explicit member retries are limited to five per five minutes. Existing account refresh after retry is retained. A safe location-state enum distinguishes ready, needs attention, refreshing, and temporarily unavailable.

## Database scope

`20260915161119_repair_dealer_geocoding_location_consistency.sql` adds only geocoding functions/trigger and updates the existing safe account/directory projections. It does not create public location storage, change existing addresses or coordinates, or alter unrelated tables. Existing RLS and service-only grants remain intact; new functions explicitly revoke browser-role execution.

The migration was the only pending migration and was applied successfully after a dry-run. SHA-256: `A21ED8ED835CA6F40B4775B1BF9392D9279561FC891C06CC94F946EDB1E428EA`. Post-apply checks confirmed forced RLS, no anonymous/authenticated reads of private points, and service-only execution of all location/account/directory RPCs. A rollback-only production database test passed success persistence, preservation on transient retry failure, address-snapshot rejection, atomic invalidation, and stale-point directory masking. All synthetic test changes rolled back; location counts remained unchanged.

## Google and Vercel action

1. In the intended Google Cloud project, open **Billing** and verify an active billing account and valid payment method.
2. Open **APIs & Services > Library**, select **Geocoding API**, and enable it for that same project.
3. Open **APIs & Services > Credentials** and create or identify a separate server geocoding API key. Under **API restrictions**, restrict it to **Geocoding API**. Do not reuse a browser/referrer-restricted key for this server request.
4. For source restrictions, use **IP addresses** with the actual stable outbound addresses for the Vercel function regions. Vercel's default outbound addresses are dynamic; a deployment/domain IP is not an outbound allowlist. Verify **Project Settings > Connectivity > Static IPs** or Secure Compute before choosing an IP allowlist. No stable outbound configuration was established by this audit. A stable-egress setup requires an explicit infrastructure/cost decision; this repair does not enable paid infrastructure or weaken an existing key's restrictions.
5. In **Vercel > mower-site > Settings > Environment Variables**, set `GOOGLE_MAPS_GEOCODING_API_KEY` as a sensitive, server-only Production variable using the approved server key. Never use `NEXT_PUBLIC_*`, source control, logs, or chat for its value. Configure separate Preview/Development credentials only if those environments need real geocoding.
6. Redeploy the latest `main` production release so the server receives the new variable. Existing deployments do not acquire later environment changes.
7. Sign into **/admin/dealer-network**, open the readiness area, and click **Check Geocoding Service**. Expected: configured, reason `SUCCESS`, HTTP 200, Google `OK`, at least one result, valid point yes. No address or coordinate is displayed.
8. If denied, use the safe `configurationIssue` category to check the same project's API enablement, billing, API restriction, application/IP restriction, or key validity. `OVER_QUERY_LIMIT` is a quota issue; `OVER_DAILY_LIMIT` can indicate key/billing/cap problems. The check does not expose Google's raw error message.

Google security guidance: https://developers.google.com/maps/api-security-best-practices

Google response statuses: https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding

Vercel stable egress: https://vercel.com/changelog/static-ips-are-now-available-for-more-secure-connectivity

## Controlled backfill and retest

After the public check succeeds, **Refresh Missing Business Locations** processes at most five eligible, non-deleted active/pending accounts. Successful points and incomplete/malformed addresses are skipped. Calls run sequentially with 1.1-second spacing; a fresh successful status is rechecked before each attempt. Configuration is checked first, and infrastructure failures stop the batch. The global batch rate limit allows one request per 15 minutes. A POST with `{ "dryRun": true }` to the same admin-only geocoding endpoint returns counts without provider or location writes; omitted `dryRun` also defaults to a dry-run.

Then verify a member's **Account / Security > Business Location** becomes ready after retry without logout, and directory business/ZIP distance search uses the stored point. An ordinary non-distance directory search remains available when location resolution fails. Anonymous account, directory, diagnostic, and storage-RPC access must still fail. Do not create public fake listings or print private addresses/coordinates for validation.

No member backfill should run while the public check is blocked. Initial audit counts are succeeded 0, failed 5, stale 0, pending 0, missing 7; the seven missing entries are deleted accounts.

## Verification

36 executable geocoding tests cover address quality, provider outcomes, bounded/validated results, private persistence, database failures, address races, retry identity/rate limits, safe account refresh, directory projection, and bounded backfill. All 290 Dealer Network tests and the full 1,203-test suite passed. TypeScript and production build passed; lint has zero errors and ten pre-existing image warnings. No Y40/Y40P, pricing, preorder, Stripe, payment-method, unrelated messaging, PIN, activation, service, installation, demo, or featured-business behavior is changed.
