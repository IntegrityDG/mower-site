import assert from "node:assert/strict";
import test from "node:test";
import * as adapter from "../lib/dealer-network/geocoding-adapter";
import * as addresses from "../lib/dealer-network/geocoding-address";
import * as validation from "../lib/dealer-network/validation";
import { loadDealerGeocodingModule as load } from "./helpers/dealer-geocoding-module";

test("successful actual retry persists the point and makes the next token-scoped account GET ready", async () => {
  let ready = false;
  const chain = { select: () => chain, eq: () => chain, is: () => chain,
    single: async () => ({ data: { id: "member", address_line_1: "1 Government Dr", address_line_2: null,
      city: "St. Louis", state: "MO", zip_code: "63110", country: "United States" }, error: null }) };
  const client = { from: () => chain, rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "dealer_network_save_geocode") { ready = args.p_status === "succeeded"; return { data: true, error: null }; }
    assert.equal(name, "dealer_network_member_account_summary");
    assert.equal(args.p_token_hash, "session-token");
    return { data: { accountStatus: "Active", businessLocationReady: ready, businessLocationState: ready ? "ready" : "needs_attention" }, error: null };
  } };
  const geocoding = load<typeof import("../lib/dealer-network/geocoding")>("lib/dealer-network/geocoding.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => client }, "./geocoding-address": addresses,
    "./geocoding-adapter": { ...adapter, geocodeUsLocation: async () => ({ latitude: 38, longitude: -90 }) },
  });
  const account = load<typeof import("../lib/dealer-network/member-account-server")>("lib/dealer-network/member-account-server.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => client }, "./geocoding": geocoding, "./security": {}, "./validation": validation,
  });
  const route = load<typeof import("../app/api/dealer-network/member/account/route")>("app/api/dealer-network/member/account/route.ts", {
    "next/server": {}, "@/lib/dealer-network/member-auth": { requireActiveUnlockedMember: async () => ({ memberId: "member" }),
      readCurrentMemberTokenHash: async () => "session-token", consumeDealerRateLimit: async () => true },
    "@/lib/dealer-network/security": { privateIdentifierHash: () => "safe-hash" },
    "@/lib/dealer-network/member-account-server": account,
  });
  assert.equal((await (await route.GET()).json()).summary.businessLocationReady, false);
  const retry = await route.PATCH(new Request("https://example.com", { method: "PATCH", body: JSON.stringify({ action: "retry_business_location" }) }));
  assert.equal(retry.status, 200);
  const refreshed = await route.GET();
  assert.equal(refreshed.headers.get("Cache-Control"), "no-store");
  const payload = await refreshed.json();
  assert.equal(payload.summary.businessLocationReady, true);
  assert.doesNotMatch(JSON.stringify(payload), /latitude|longitude|address_line|Government/);
});

function backfillModule(ids: string[], outcomes: Record<string, { success: boolean; reason?: string }>,
  diagnosticReason = "SUCCESS", current: Record<string, string> = {}) {
  const calls: string[] = [], pauses: number[] = [];
  const backfillExports = load<typeof import("../lib/dealer-network/geocoding-backfill")>("lib/dealer-network/geocoding-backfill.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "dealer_network_geocode_candidates") { assert.equal(args.p_limit, 5); return { data: ids, error: null }; }
      assert.equal(name, "dealer_network_admin_security");
      return { data: { geocodeStatus: current[String(args.p_member_id)] }, error: null };
    } }) },
    "./geocoding-diagnostic": { diagnoseDealerGeocoder: async () => ({ diagnostic: { reason: diagnosticReason } }) },
    "./geocoding": { refreshStoredMemberGeocode: async (id: string) => { calls.push(id); return outcomes[id] ?? { success: true }; } },
  });
  return { module: backfillExports, calls, pauses, pause: async (ms: number) => { pauses.push(ms); } };
}

test("backfill is capped, deduplicated, sequentially paced, and skips newly successful points", async () => {
  const run = backfillModule(["a", "a", "b", "c", "d", "e", "f"], {}, "SUCCESS", { b: "succeeded" });
  const result = await run.module.backfillDealerGeocodes(false, run.pause);
  assert.deepEqual(run.calls, ["a", "c", "d", "e"]);
  assert.deepEqual(run.pauses, [1100, 1100, 1100]);
  assert.equal(result.eligible, 5);
  assert.equal(result.skipped, 1);
  assert.equal(result.succeeded, 4);
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|address/);
});

test("backfill dry-run does not call the provider; missing/denied configuration blocks all member calls", async () => {
  const dry = backfillModule(["a", "b"], {});
  assert.equal((await dry.module.backfillDealerGeocodes()).eligible, 2);
  assert.equal(dry.calls.length, 0);
  for (const reason of ["NOT_CONFIGURED", "REQUEST_DENIED", "OVER_QUERY_LIMIT"]) {
    const run = backfillModule(["a", "b"], {}, reason);
    assert.equal((await run.module.backfillDealerGeocodes(false, run.pause)).blocked, reason);
    assert.equal(run.calls.length, 0);
  }
});

test("backfill records address no-results and stops immediately on infrastructure failure", async () => {
  const run = backfillModule(["a", "b", "c"], { a: { success: false, reason: "NO_RESULTS" }, b: { success: false, reason: "REQUEST_DENIED" } });
  const result = await run.module.backfillDealerGeocodes(false, run.pause);
  assert.deepEqual(run.calls, ["a", "b"]);
  assert.equal(result.failed, 2);
  assert.equal(result.blocked, "REQUEST_DENIED");
});

test("admin diagnostic and bounded backfill require existing admin authentication and expose no point", async () => {
  class DealerNetworkAdminError extends Error { constructor() { super("Unauthorized"); this.name = "DealerNetworkAdminError"; } }
  let admin = false, calls = 0, allowed = true;
  const route = load<typeof import("../app/api/admin/dealer-network/geocoding/route")>("app/api/admin/dealer-network/geocoding/route.ts", {
    "@/lib/dealer-network/admin-auth": { requireDealerNetworkAdmin: async () => { if (!admin) throw new DealerNetworkAdminError(); } },
    "@/lib/dealer-network/member-auth": { consumeDealerRateLimit: async () => allowed, requestClientKey: () => "safe-client" },
    "@/lib/dealer-network/security": { privateIdentifierHash: () => "safe-hash" },
    "@/lib/dealer-network/geocoding-diagnostic": { diagnoseDealerGeocoder: async () => { calls++; return {
      configured: true, diagnostic: { reason: "SUCCESS", httpStatus: 200, providerStatus: "OK", resultCount: 1, validPoint: true } }; } },
    "@/lib/dealer-network/geocoding-adapter": { logGeocodeDiagnostic: () => undefined },
    "@/lib/dealer-network/geocoding-backfill": { backfillDealerGeocodes: async (dryRun: boolean) => { calls++; return { dryRun, eligible: 0, attempted: 0, blocked: null }; } },
  });
  const request = new Request("https://example.com");
  assert.equal((await route.GET(request)).status, 401);
  assert.equal(calls, 0);
  admin = true;
  const check = await route.GET(request);
  assert.equal(check.status, 200);
  assert.doesNotMatch(JSON.stringify(await check.json()), /latitude|longitude|address|key/);
  assert.equal((await route.POST(new Request("https://example.com", { method: "POST", body: JSON.stringify({ memberId: "victim" }) }))).status, 400);
  const batch = await route.POST(new Request("https://example.com", { method: "POST", body: "{}" }));
  assert.equal((await batch.json()).dryRun, true);
  allowed = false;
  assert.equal((await route.GET(request)).status, 429);
  assert.equal(calls, 2);
});
