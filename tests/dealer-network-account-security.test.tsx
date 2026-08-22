import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GeocodingProviderError,
  geocodeUsLocation,
} from "../lib/dealer-network/geocoding-adapter";

const source = (path: string) => readFileSync(path, "utf8");
const memberUi = source("components/dealer-network/MemberPortal.tsx");
const accountRoute = source("app/api/dealer-network/member/account/route.ts");
const accountServer = source("lib/dealer-network/member-account-server.ts");
const adminRoute = source("app/api/admin/dealer-network/members/[id]/route.ts");
const adminUi = source("components/dealer-network/DealerNetworkAdmin.tsx");
const adminServer = source("lib/dealer-network/admin-server.ts");
const migration = source(
  "supabase/migrations/20260822031418_add_dealer_member_account_security.sql",
).toLowerCase();

test("member portal exposes a safe Account / Security panel", () => {
  assert.match(memberUi, /\["account", "Account \/ Security"\]/);
  for (const label of [
    "Account Status",
    "Email Verification",
    "Last Login",
    "Active Sessions",
    "Current Session",
    "Business Location",
    "Sign Out Other Sessions",
    "Sign Out Everywhere",
    "Change PIN",
  ])
    assert.match(memberUi, new RegExp(label));
});

test("member account API derives identity only from the authenticated session", () => {
  assert.match(accountRoute, /requireActiveUnlockedMember\(\)/);
  assert.match(accountRoute, /readCurrentMemberTokenHash\(\)/);
  assert.match(accountRoute, /retryOwnBusinessLocation\(session\.memberId\)/);
  assert.match(accountRoute, /changeMemberPin\(session\.memberId, tokenHash, body\)/);
  assert.doesNotMatch(accountRoute, /body\.memberId|searchParams.*memberId/);
});

test("member summary is token-scoped and returns only safe account fields", () => {
  const summaryFunction = migration.slice(
    migration.indexOf("create function public.dealer_network_member_account_summary"),
    migration.indexOf("create function public.dealer_network_revoke_other_sessions"),
  );
  assert.match(summaryFunction, /current_session\.token_hash = p_token_hash/);
  assert.match(summaryFunction, /active_session\.member_id = m\.id/);
  for (const key of [
    "accountstatus",
    "emailverified",
    "lastloginat",
    "activesessioncount",
    "currentsessionexpiresat",
    "businesslocationready",
  ])
    assert.match(summaryFunction, new RegExp(`'${key}'`));
  for (const leakedKey of [
    "pinhash",
    "pinsalt",
    "tokenhash",
    "failedattempts",
    "authlockeduntil",
    "geocodeerror",
    "latitude'",
    "longitude'",
  ])
    assert.doesNotMatch(summaryFunction, new RegExp(`'${leakedKey}`));
});

test("session actions preserve only the current session or revoke all as requested", () => {
  const otherSessions = migration.slice(
    migration.indexOf("create function public.dealer_network_revoke_other_sessions"),
    migration.indexOf("create function public.dealer_network_change_pin"),
  );
  assert.match(otherSessions, /member_id = current_session\.member_id/);
  assert.match(otherSessions, /id <> current_session\.id/);
  assert.match(accountRoute, /revokeAllMemberSessions\(session\.memberId\)/);
  assert.match(accountRoute, /maxAge: 0/);
  assert.match(memberUi, /window\.confirm\("Sign out every active session/);
});

test("PIN change verifies and validates with existing security helpers then revokes sessions", () => {
  assert.match(accountServer, /validatePin\(body\.currentPin\)/);
  assert.match(accountServer, /validatePin\(body\.newPin\)/);
  assert.match(accountServer, /body\.confirmNewPin !== newPin/);
  assert.match(
    accountServer,
    /verifyPin\([\s\S]*?currentPin,[\s\S]*?credentials\.pinHash,[\s\S]*?credentials\.pinSalt/,
  );
  assert.match(accountServer, /hashPin\(newPin\)/);
  assert.match(accountServer, /dealer_network_change_pin/);
  assert.match(migration, /pin_hash = p_expected_pin_hash/);
  assert.match(migration, /sessions[\s\S]*?revoked_at = coalesce\(revoked_at, now\(\)\)/);
  assert.match(memberUi, /notice=pin-changed/);
});

test("member location retry returns friendly results without internal diagnostics", () => {
  assert.match(accountServer, /refreshStoredMemberGeocode\(memberId\)/);
  assert.match(accountServer, /business location was updated successfully/i);
  assert.match(accountServer, /couldn't locate your business address/i);
  assert.match(accountServer, /location service is temporarily unavailable/i);
  const routeResponses = accountRoute.replace(/result\.reason/g, "");
  assert.doesNotMatch(
    routeResponses,
    /NOT_CONFIGURED|REQUEST_DENIED|OVER_QUERY_LIMIT|INVALID_REQUEST|NO_RESULTS/,
  );
});

test("admin geocode retry reports real outcomes, disables duplicates, and reloads", () => {
  assert.match(adminRoute, /if \(result\.success\)/);
  assert.match(adminRoute, /NO_RESULTS[\s\S]*?422/);
  assert.match(adminRoute, /NOT_CONFIGURED[\s\S]*?503/);
  assert.match(adminUi, /retryingGeocodeId/);
  assert.match(adminUi, /disabled=\{retryingGeocodeId !== null\}/);
  assert.match(adminUi, /Retrying…/);
  assert.match(adminUi, /payload\.error \?\? "Geocoding retry failed\."/);
  const retry = adminUi.slice(
    adminUi.indexOf("async function retryGeocoding"),
    adminUi.indexOf("async function permanentlyDeleteMember"),
  );
  assert.match(retry, /const resultMessage =/);
  assert.ok(retry.indexOf("await reload()") < retry.indexOf("notify(resultMessage)"));
  assert.match(retry, /catch\s*\{[\s\S]*?Geocoding retry could not be completed\./);
});

test("member account security summary is explicitly never cached", () => {
  assert.match(
    memberUi,
    /fetch\("\/api\/dealer-network\/member\/account",\s*\{\s*cache: "no-store"/,
  );
  const getHandler = accountRoute.slice(
    accountRoute.indexOf("export async function GET"),
    accountRoute.indexOf("export async function PATCH"),
  );
  assert.match(getHandler, /"Cache-Control": "no-store"/);
  assert.match(getHandler, /response\.headers\.set\("Cache-Control", "no-store"\)/);
});

test("admin configuration diagnostic exposes only runtime presence", () => {
  assert.match(
    adminServer,
    /geocodingConfigured: Boolean\(\s*process\.env\.GOOGLE_MAPS_GEOCODING_API_KEY\?\.trim\(\)/,
  );
  assert.match(adminUi, /geocodingConfigured \? "Configured" : "Not Configured"/);
  assert.doesNotMatch(
    adminServer,
    /GOOGLE_MAPS_GEOCODING_API_KEY[\s\S]{0,80}(length|slice|substring)/,
  );
});

test("Google response statuses are classified without provider response leakage", async () => {
  for (const [status, reason] of [
    ["REQUEST_DENIED", "REQUEST_DENIED"],
    ["OVER_QUERY_LIMIT", "OVER_QUERY_LIMIT"],
    ["INVALID_REQUEST", "INVALID_REQUEST"],
    ["UNKNOWN_ERROR", "UNAVAILABLE"],
  ] as const) {
    const fetcher = (async () =>
      new Response(JSON.stringify({ status }), { status: 200 })) as typeof fetch;
    await assert.rejects(
      () => geocodeUsLocation("100 Main St", fetcher, "test-key"),
      (error) =>
        error instanceof GeocodingProviderError && error.reason === reason,
    );
  }
  assert.equal(
    await geocodeUsLocation(
      "Unknown address",
      (async () =>
        new Response(JSON.stringify({ status: "ZERO_RESULTS" }), {
          status: 200,
        })) as typeof fetch,
      "test-key",
    ),
    null,
  );
});

test("new security RPCs remain private and service-role only", () => {
  for (const signature of [
    "dealer_network_member_account_summary(text)",
    "dealer_network_revoke_other_sessions(text)",
    "dealer_network_change_pin(text, text, text, text)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to service_role`),
    );
  }
});
