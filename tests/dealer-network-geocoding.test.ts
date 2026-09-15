import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as adapter from "../lib/dealer-network/geocoding-adapter";
import * as addresses from "../lib/dealer-network/geocoding-address";
import { diagnoseDealerGeocoder } from "../lib/dealer-network/geocoding-diagnostic";
import { businessLocationLabel } from "../lib/dealer-network/member-location-presentation";
import { filterDirectoryRows, resolveBusinessDirectoryOrigin, toDirectoryResult, type PrivateDirectoryRow } from "../lib/dealer-network/directory";
import * as validation from "../lib/dealer-network/validation";
import { loadDealerGeocodingModule as load } from "./helpers/dealer-geocoding-module";

const member = { id: "safe-member-id", addressLine1: "1 Government Dr", addressLine2: null,
  city: "St. Louis", state: "MO", zipCode: "63110", country: "United States" };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const json = (payload: unknown, status = 200) => (async () => new Response(JSON.stringify(payload), { status })) as typeof fetch;
const good = { status: "OK", results: [{ geometry: { location: { lat: 38.635, lng: -90.29 } } }] };
const noLog = () => undefined;
const source = (path: string) => readFileSync(path, "utf8");

function server(client: unknown, logs: string[] = [], provider = adapter) {
  return load<typeof import("../lib/dealer-network/geocoding")>("lib/dealer-network/geocoding.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => client },
    "./geocoding-adapter": provider, "./geocoding-address": addresses,
  }, logs);
}

test("complete Missouri and out-of-state U.S. address queries retain their logical fields", () => {
  assert.equal(addresses.memberAddressQuery(member), "1 Government Dr, St. Louis, MO, 63110, United States");
  assert.equal(addresses.memberAddressQuery({ ...member, addressLine1: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", zipCode: "20500" }),
    "1600 Pennsylvania Ave NW, Washington, DC, 20500, United States");
});

test("optional suite, whitespace, state, ZIP+4, and commas are normalized only for the query", () => {
  const input = { ...member, addressLine1: "  1  Government Dr, , ", addressLine2: " Suite   100 ",
    city: " St. Louis ", state: " mo ", zipCode: " 63110 - 1234 " };
  const before = JSON.stringify(input);
  assert.equal(addresses.memberAddressQuery(input), "1 Government Dr, Suite 100, St. Louis, MO, 63110-1234, United States");
  assert.equal(JSON.stringify(input), before);
  for (const addressLine2 of [null, undefined, "", " \n "]) {
    assert.equal(addresses.memberAddressQuery({ ...member, addressLine2 }), addresses.memberAddressQuery(member));
  }
});

test("incomplete historical rows, placeholders, invalid state/ZIP, and non-US countries are rejected before Google", () => {
  for (const key of ["addressLine1", "city", "state", "zipCode", "country"] as const) {
    assert.equal(addresses.inspectMemberGeocodeAddress({ ...member, [key]: null }).quality, "INCOMPLETE");
    assert.equal(addresses.inspectMemberGeocodeAddress({ ...member, [key]: "null" }).quality, "MALFORMED");
    assert.equal(addresses.inspectMemberGeocodeAddress({ ...member, [key]: " undefined " }).query, null);
  }
  for (const change of [{ state: "ZZ" }, { zipCode: "6311" }, { zipCode: "63110-12" }, { country: "Canada" }, { addressLine2: "null" }])
    assert.equal(addresses.inspectMemberGeocodeAddress({ ...member, ...change }).quality, "MALFORMED");
});

test("Google OK validates a finite point and emits only safe success metadata", async () => {
  const calls: URL[] = [], diagnostics: adapter.GeocodeDiagnostic[] = [];
  const point = await adapter.geocodeUsLocation("PUBLIC TEST ADDRESS", (async (url, options) => {
    calls.push(new URL(String(url)));
    assert.ok(options?.signal instanceof AbortSignal);
    return json(good)("https://example.com");
  }) as typeof fetch, "synthetic-secret", (event) => diagnostics.push(event));
  assert.deepEqual(point, { latitude: 38.635, longitude: -90.29 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("components"), "country:US");
  assert.deepEqual(diagnostics, [{ reason: "SUCCESS", httpStatus: 200, providerStatus: "OK", resultCount: 1, validPoint: true }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic-secret|PUBLIC TEST ADDRESS|38\.635|-90\.29/);
});

for (const status of ["REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "INVALID_REQUEST"] as const) {
  test(`Google ${status} remains distinguishable, with no retries or raw provider text`, async () => {
    let calls = 0;
    const events: adapter.GeocodeDiagnostic[] = [];
    await assert.rejects(() => adapter.geocodeUsLocation("PRIVATE ADDRESS CANARY", (async () => {
      calls++;
      return json({ status, error_message: "PRIVATE ADDRESS CANARY api-key-canary" })("https://example.com");
    }) as typeof fetch, "api-key-canary", (event) => events.push(event)),
    (error) => error instanceof adapter.GeocodingProviderError && error.reason === status && error.diagnostic?.providerStatus === status);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(events), /CANARY|api-key-canary|error_message/);
  });
}

test("Google ZERO_RESULTS is an address-resolution outcome, distinct from an outage", async () => {
  const events: adapter.GeocodeDiagnostic[] = [];
  assert.equal(await adapter.geocodeUsLocation("SYNTHETIC NO RESULT", json({ status: "ZERO_RESULTS", results: [] }), "synthetic", (event) => events.push(event)), null);
  assert.equal(events[0].reason, "ZERO_RESULTS");
  assert.equal(events[0].httpStatus, 200);
});

for (const [message, category] of [
  ["Geocoding API has not been enabled", "API_DISABLED"], ["Billing must be enabled", "BILLING"],
  ["IP address is not allowed", "IP_RESTRICTION"], ["API keys with referer restrictions cannot use this API", "APPLICATION_RESTRICTION"],
  ["API key is invalid", "INVALID_KEY"], ["This key is not authorized for this API", "API_RESTRICTION"],
] as const) test(`denial diagnostic recognizes ${category} without copying Google's error message`, async () => {
  const result = await diagnoseDealerGeocoder(json({ status: "REQUEST_DENIED", error_message: `${message} PRIVATE CANARY secret-canary` }), "secret-canary");
  assert.equal(result.diagnostic.configurationIssue, category);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE CANARY|secret-canary|error_message/);
});

test("HTTP failure, timeout, network failure, and malformed JSON retain separate diagnostic categories", async () => {
  const cases: Array<[typeof fetch, adapter.GeocodeDiagnosticReason]> = [
    [(async () => new Response("unavailable", { status: 503 })) as typeof fetch, "HTTP_ERROR"],
    [(async () => { throw new DOMException("private request URL", "TimeoutError"); }) as typeof fetch, "TIMEOUT"],
    [(async () => { throw new Error("https://private/address?key=secret"); }) as typeof fetch, "NETWORK_ERROR"],
    [(async () => new Response("not json")) as typeof fetch, "BAD_PROVIDER_RESPONSE"],
    [json(null), "BAD_PROVIDER_RESPONSE"], [json([]), "BAD_PROVIDER_RESPONSE"],
    [json({ status: "UNTRUSTED PRIVATE TEXT" }), "BAD_PROVIDER_RESPONSE"],
  ];
  for (const [fetcher, expected] of cases) {
    await assert.rejects(() => adapter.geocodeUsLocation("private-address", fetcher, "secret", noLog),
      (error) => error instanceof adapter.GeocodingProviderError && error.reason === "UNAVAILABLE" && error.diagnostic?.reason === expected);
  }
});

test("missing key never calls Google and returns a safe non-mutating public-address diagnostic", async () => {
  let calls = 0;
  const result = await diagnoseDealerGeocoder((async () => { calls++; throw new Error(); }) as typeof fetch, " ");
  assert.equal(calls, 0);
  assert.equal(result.configured, false);
  assert.equal(result.diagnostic.reason, "NOT_CONFIGURED");
  assert.equal(result.diagnostic.httpStatus, null);
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|formatted_address|addressLine/);
});

test("invalid points, including strings, NaN, Infinity, and missing geometry, never become success", async () => {
  for (const point of [{ latitude: NaN, longitude: 0 }, { latitude: Infinity, longitude: 0 },
    { latitude: 0, longitude: -Infinity }, { latitude: 90.01, longitude: 0 },
    { latitude: 0, longitude: -180.01 }, { latitude: "38", longitude: "-90" }, {}])
    assert.equal(adapter.validGeocodePoint(point), false);
  assert.equal(adapter.validGeocodePoint({ latitude: -90, longitude: 180 }), true);
  for (const results of [[], [{}], [{ geometry: { location: { lat: "38", lng: -90 } } }],
    [{ geometry: { location: { lat: 91, lng: -90 } } }]]) {
    await assert.rejects(() => adapter.geocodeUsLocation("public", json({ status: "OK", results }), "synthetic", noLog),
      (error) => error instanceof adapter.GeocodingProviderError && error.diagnostic?.reason === "BAD_PROVIDER_RESPONSE");
  }
});

test("successful member geocoding stores an address-checked private point as succeeded", async () => {
  const writes: Array<{ name: string; args: Record<string, unknown> }> = [], logs: string[] = [];
  const service = server({ rpc: async (name: string, args: Record<string, unknown>) => { writes.push({ name, args }); return { data: true, error: null }; } }, logs);
  const result = await service.refreshMemberGeocode(member, async (query) => {
    assert.equal(query, addresses.memberAddressQuery(member)); return { latitude: 38.635, longitude: -90.29 };
  });
  assert.equal(result.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, "dealer_network_save_geocode");
  assert.equal(writes[0].args.p_status, "succeeded");
  assert.deepEqual(plain(writes[0].args.p_expected_address), addresses.storedGeocodeAddress(member));
  assert.equal(writes[0].args.p_latitude, 38.635);
  assert.doesNotMatch(logs.join("\n"), /Government|St\. Louis|38\.635|-90\.29/);
  assert.match(logs.join("\n"), /safe-member-id.*SUCCESS/);
});

test("no-result and provider-denial failures persist safe reasons with no coordinates", async () => {
  for (const reason of ["NO_RESULTS", "REQUEST_DENIED", "TIMEOUT"] as const) {
    const writes: Record<string, unknown>[] = [], logs: string[] = [];
    const service = server({ rpc: async (_name: string, args: Record<string, unknown>) => { writes.push(args); return { data: true, error: null }; } }, logs);
    const result = await service.refreshMemberGeocode(member, async () => {
      if (reason === "NO_RESULTS") return null;
      throw new adapter.GeocodingProviderError(reason);
    });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.reason, reason);
    assert.equal(writes[0].p_status, "failed");
    assert.equal(writes[0].p_error, reason);
    assert.equal(writes[0].p_latitude, null);
    assert.equal(writes[0].p_longitude, null);
  }
});

test("incomplete/malformed member addresses do not call Google; invalid injected points do not store success", async () => {
  let calls = 0;
  const writes: Record<string, unknown>[] = [];
  const service = server({ rpc: async (_name: string, args: Record<string, unknown>) => { writes.push(args); return { data: true, error: null }; } });
  const geocoder = async () => { calls++; return { latitude: Infinity, longitude: 0 }; };
  await service.refreshMemberGeocode({ ...member, city: null }, geocoder);
  await service.refreshMemberGeocode({ ...member, state: "null" }, geocoder);
  assert.equal(calls, 0);
  assert.deepEqual(writes.map((row) => row.p_error), ["INCOMPLETE_ADDRESS", "MALFORMED_ADDRESS"]);
  await service.refreshMemberGeocode(member, geocoder);
  assert.equal(writes[2].p_error, "BAD_PROVIDER_RESPONSE");
  assert.equal(writes[2].p_latitude, null);
});

test("database save failures are observable without exposing raw row details", async () => {
  const logs: string[] = [];
  const service = server({ rpc: async () => ({ data: null, error: { code: "23514", message: "PRIVATE ADDRESS CANARY secret-key 38.635" } }) }, logs);
  const result = await service.refreshMemberGeocode(member, async () => ({ latitude: 38.635, longitude: -90.29 }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, "DATABASE_SAVE_FAILED");
  assert.match(logs.join("\n"), /DATABASE_SAVE_FAILED.*23514/);
  assert.doesNotMatch(logs.join("\n"), /PRIVATE ADDRESS|secret-key|38\.635/);
});

test("a raced address edit rejects the old provider result instead of declaring the location ready", async () => {
  const result = await server({ rpc: async () => ({ data: false, error: null }) }).refreshMemberGeocode(member, async () => ({ latitude: 38, longitude: -90 }));
  assert.deepEqual(plain(result), { success: false, status: "stale", reason: "ADDRESS_CHANGED" });
});

test("stored-address refresh preserves nulls, reads country, and excludes deleted members", async () => {
  const calls: unknown[][] = [], writes: Record<string, unknown>[] = [];
  const chain = { select: (value: string) => { calls.push(["select", value]); return chain; },
    eq: (key: string, value: string) => { calls.push([key, value]); return chain; },
    is: (key: string, value: null) => { calls.push([key, value]); return chain; },
    single: async () => ({ data: { id: member.id, address_line_1: null, address_line_2: null, city: null, state: null, zip_code: null, country: null }, error: null }) };
  const service = server({ from: () => chain, rpc: async (_name: string, args: Record<string, unknown>) => { writes.push(args); return { data: true, error: null }; } });
  const result = await service.refreshStoredMemberGeocode(member.id);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, "INCOMPLETE_ADDRESS");
  assert.ok(calls.some(([key, value]) => key === "deleted_at" && value === null));
  assert.match(String(calls[0][1]), /country/);
  assert.equal((writes[0].p_expected_address as Record<string, unknown>).address_line_1, null);
});

test("directory distances use only succeeded valid points; failed/stale locations stay in ordinary browsing", () => {
  const base = { ...member, id: "other", memberName: "Synthetic", companyName: "Synthetic", phone: "13145550101", email: "test@example.com",
    websiteUrl: null, role: "dealer", experience: "test", serviceRegion: "MO", introduction: "test", logoPath: null, brands: [],
    latitude: 38.635, longitude: -90.29, geocodeStatus: "succeeded" } as PrivateDirectoryRow;
  const rows = [base, { ...base, id: "stale", geocodeStatus: "stale" }, { ...base, id: "failed", geocodeStatus: "failed" },
    { ...base, id: "invalid", latitude: Infinity }];
  assert.equal(filterDirectoryRows(rows, {}, null).length, 4);
  assert.deepEqual(filterDirectoryRows(rows, {}, { latitude: 38.635, longitude: -90.29 }).map(({ row }) => row.id), ["other"]);
  const result = toDirectoryResult({ ...base, addressLine1: "PRIVATE CANARY" } as PrivateDirectoryRow, 1.234, null);
  assert.equal(result.distanceMiles, 1.2);
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|geocodeStatus|addressLine|PRIVATE CANARY/);
});

test("business-origin repair rejects stale or invalid stored and repaired points", async () => {
  let repaired = 0;
  const repair = async () => { repaired++; return { latitude: 38, longitude: -90 }; };
  assert.deepEqual(await resolveBusinessDirectoryOrigin({ latitude: 39, longitude: -90, geocodeStatus: "stale" }, repair), { latitude: 38, longitude: -90 });
  assert.equal(repaired, 1);
  assert.deepEqual(await resolveBusinessDirectoryOrigin({ latitude: 38, longitude: -90, geocodeStatus: "succeeded" }, repair), { latitude: 38, longitude: -90 });
  assert.equal(repaired, 1);
  assert.equal(await resolveBusinessDirectoryOrigin(undefined, async () => ({ latitude: NaN, longitude: 0 })), null);
});

test("member location presentation distinguishes ready, needs-attention, refreshing, and unavailable", () => {
  assert.equal(businessLocationLabel({ businessLocationReady: true }), "Business location ready");
  assert.equal(businessLocationLabel({ businessLocationReady: false }), "Business location needs attention");
  assert.equal(businessLocationLabel({ businessLocationReady: false, businessLocationState: "unavailable" }), "Location service temporarily unavailable");
  assert.equal(businessLocationLabel({ businessLocationReady: false }, true), "Business location is being refreshed");
});

test("member retry uses actual server handling and returns only friendly outcomes", async () => {
  for (const reason of [null, "NO_RESULTS", "INCOMPLETE_ADDRESS", "REQUEST_DENIED", "TIMEOUT", "DATABASE_SAVE_FAILED"] as const) {
    const seen: string[] = [];
    const account = load<typeof import("../lib/dealer-network/member-account-server")>("lib/dealer-network/member-account-server.ts", {
      "@/lib/supabase": {}, "./security": {}, "./validation": validation,
      "./geocoding": { refreshStoredMemberGeocode: async (id: string) => { seen.push(id); return reason ?
        { success: false, status: "failed", reason } : { success: true, status: "succeeded", point: { latitude: 38, longitude: -90 } }; } },
    });
    const result = await account.retryOwnBusinessLocation("session-member");
    assert.deepEqual(seen, ["session-member"]);
    if (reason === null) assert.equal(result.ok, true);
    else if (!result.ok) {
      assert.equal(result.status, ["NO_RESULTS", "INCOMPLETE_ADDRESS"].includes(reason) ? 422 : 503);
      assert.match(result.error, ["NO_RESULTS", "INCOMPLETE_ADDRESS"].includes(reason) ? /check the address/i : /temporarily unavailable/i);
    }
    assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|REQUEST_DENIED|TIMEOUT|DATABASE_SAVE_FAILED/);
  }
});

test("member account retry authenticates, rejects forged IDs, and enforces the bounded rate limit", async () => {
  const retried: string[] = [];
  class MemberAccessError extends Error { constructor(public status: number, message: string) { super(message); } }
  let authenticated = true, allowed = true;
  const route = load<typeof import("../app/api/dealer-network/member/account/route")>("app/api/dealer-network/member/account/route.ts", {
    "next/server": {}, "@/lib/dealer-network/member-auth": { MEMBER_SESSION_COOKIE: "session", MemberAccessError,
      requireActiveUnlockedMember: async () => { if (!authenticated) throw new MemberAccessError(401, "Authentication required."); return { memberId: "session-member" }; },
      readCurrentMemberTokenHash: async () => "safe-token-hash", consumeDealerRateLimit: async () => allowed },
    "@/lib/dealer-network/security": { privateIdentifierHash: (id: string) => `hash-${id}` },
    "@/lib/dealer-network/member-account-server": { retryOwnBusinessLocation: async (id: string) => { retried.push(id); return { ok: true, message: "Updated" }; } },
  });
  const request = (extra = {}) => new Request("https://example.com", { method: "PATCH", body: JSON.stringify({ action: "retry_business_location", ...extra }) });
  assert.equal((await route.PATCH(request({ memberId: "victim" }))).status, 400);
  assert.equal(retried.length, 0);
  assert.equal((await route.PATCH(request())).status, 200);
  assert.deepEqual(retried, ["session-member"]);
  allowed = false;
  assert.equal((await route.PATCH(request())).status, 429);
  authenticated = false;
  assert.equal((await route.PATCH(request())).status, 401);
  assert.equal(retried.length, 1);
});

test("account summary projection exposes safe location state and excludes sensitive diagnostics", async () => {
  const account = load<typeof import("../lib/dealer-network/member-account-server")>("lib/dealer-network/member-account-server.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => ({ rpc: async () => ({ data: {
      accountStatus: "Active", emailVerified: true, activeSessionCount: 1, currentSessionExpiresAt: "future",
      businessLocationReady: true, businessLocationState: "ready", latitude: 38, longitude: -90,
      addressLine1: "PRIVATE CANARY", geocodeError: "REQUEST_DENIED", pinHash: "PRIVATE HASH" }, error: null }) }) },
    "./security": {}, "./validation": validation, "./geocoding": {},
  });
  const summary = await account.readMemberAccountSecurity("safe-token-hash");
  assert.equal(summary.businessLocationReady, true);
  assert.equal(summary.businessLocationState, "ready");
  assert.doesNotMatch(JSON.stringify(summary), /latitude|longitude|addressLine|geocodeError|pinHash|PRIVATE/);
  const ui = source("components/dealer-network/MemberPortal.tsx");
  const action = ui.slice(ui.indexOf("async function accountAction"), ui.indexOf("async function changePin"));
  assert.match(action, /await refresh\(\)/);
});

test("new migration guards stale writes and preserves service-only private location architecture", () => {
  const migration = source("supabase/migrations/20260915161119_repair_dealer_geocoding_location_consistency.sql");
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /AFTER UPDATE OF address_line_1, address_line_2, city, state, zip_code, country/);
  assert.match(migration, /latitude = NULL, longitude = NULL, geocode_status = 'stale'/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /IS DISTINCT FROM p_expected_address THEN RETURN false/);
  assert.match(migration, /p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180/);
  assert.match(migration, /CASE WHEN l.geocode_status = 'succeeded' THEN l.latitude ELSE NULL END/);
  assert.match(migration, /l.geocode_status IS DISTINCT FROM 'succeeded'/);
  assert.match(migration, /m.deleted_at IS NULL/);
  for (const name of ["dealer_network_save_geocode", "dealer_network_geocode_candidates"]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?FROM PUBLIC, anon, authenticated`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*?TO service_role`));
  }
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|GRANT.*TO anon|CREATE TABLE|UPDATE public\.dealer_network_members/i);
});
