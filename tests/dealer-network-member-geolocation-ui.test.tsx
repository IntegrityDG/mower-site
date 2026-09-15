import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import * as directory from "../lib/dealer-network/directory";
import { type PrivateDirectoryRow } from "../lib/dealer-network/directory";
import { DEALER_NETWORK_GEOLOCATION_UI_ENABLED, memberDirectorySearchParams } from "../lib/dealer-network/member-features";
import { type DirectoryFilters, type DirectoryResult } from "../lib/dealer-network/types";
import { loadDealerPortal } from "./helpers/dealer-portal-module";
import { loadDealerGeocodingModule } from "./helpers/dealer-geocoding-module";

const brandId = "10000000-0000-4000-8000-000000000001";
const fixtures: PrivateDirectoryRow[] = [
  { id: "failed-member", memberName: "Alex Sample", companyName: "Alpha Mowers", role: "dealer",
    phone: "(573) 555-0100", email: "alpha@example.test", city: "Columbia", state: "MO", zipCode: "65201-1234",
    serviceRegion: "Central Missouri", experience: "Five years", introduction: "Synthetic dealer introduction", websiteUrl: "https://example.test/alpha",
    logoPath: null, latitude: null, longitude: null, geocodeStatus: "failed",
    brands: [{ id: "sold", brandId, brandName: "Sample Brand", relationshipType: "sold" }] },
  { id: "stale-member", memberName: "Blair Sample", companyName: "Beta Repairs", role: "repair_tech",
    phone: "(217) 555-0101", email: "beta@example.test", city: "Springfield", state: "IL", zipCode: "62701",
    serviceRegion: "Central Illinois", experience: "Three years", introduction: "Synthetic repair introduction", websiteUrl: null,
    logoPath: null, latitude: null, longitude: null, geocodeStatus: "stale",
    brands: [{ id: "serviced", brandId, brandName: "Sample Brand", relationshipType: "serviced" }] },
  { id: "success-member", memberName: "Casey Sample", companyName: "Zulu Equipment", role: "both",
    phone: "(314) 555-0102", email: "zulu@example.test", city: "St. Louis", state: "MO", zipCode: "63101",
    serviceRegion: "Eastern Missouri", experience: "Ten years", introduction: "Synthetic equipment introduction", websiteUrl: null,
    logoPath: null, latitude: 38.627, longitude: -90.1994, geocodeStatus: "succeeded", brands: [] },
];
const result = (row = fixtures[0], distance: number | null = null) => directory.toDirectoryResult(row, distance, null);
const panelProps = (results: DirectoryResult[] = fixtures.map((row) => result(row))) => ({
  formRef: { current: {} }, brands: [{ id: brandId, name: "Sample Brand" }], results, searched: true,
  onResults: () => {}, onMessage: () => {}, messagingEnabled: true,
  onFriend: async () => {}, onStartMessage: async () => {}, onBlock: async () => true,
});
const forbiddenUi = /Near ZIP|Search Near ZIP|Use My (?:Business )?Location|Near Me|Radius|miles away|Distance unavailable|Business location|Business Location|Location service temporarily unavailable|Retry Business Location/i;

test("member directory renders retained filters and member details without geolocation", () => {
  assert.equal(DEALER_NETWORK_GEOLOCATION_UI_ENABLED, false);
  const html = loadDealerPortal().render("DirectoryPanel", panelProps());
  for (const label of ["Directory Search", "Member or Company", "Role", "Region / Service Area", "ZIP Code", "Area Code", "Brand Relationship", "Search", "Clear Filters", "Alpha Mowers", "Beta Repairs", "Zulu Equipment", "Service Region", "Experience", "Phone", "Email", "Website / Social Page", "Brands Sold", "Brands Serviced / Repaired"])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, forbiddenUi);
  assert.doesNotMatch(html, /name="(?:nearZip|radius|latitude|longitude)"/);
});

test("distance is hidden even when a result includes a computed distance", () => {
  const html = loadDealerPortal().render("DirectoryCard", { ...panelProps(), result: result(fixtures[2], 12.4) });
  assert.match(html, /Zulu Equipment/);
  assert.doesNotMatch(html, /12\.4|miles|distance/i);
});

for (const state of ["ready", "needs_attention", "refreshing", "unavailable"]) {
  test(`account remains usable with hidden business location state ${state}`, () => {
    const html = loadDealerPortal().render("AccountSecurityPanel", {}, [{
      accountStatus: "Active", emailVerified: true, lastLoginAt: null, activeSessionCount: 1,
      currentSessionExpiresAt: "2026-10-01T12:00:00Z", businessLocationReady: state === "ready", businessLocationState: state,
    }, null, ""]);
    assert.match(html, /Account &amp; Security|Account &amp;amp; Security/);
    assert.match(html, /Change PIN/);
    assert.match(html, /Sign Out Other Sessions/);
    assert.doesNotMatch(html, forbiddenUi);
  });
}

test("empty directory state is about matching filters and never geocoding", () => {
  const html = loadDealerPortal().render("DirectoryPanel", panelProps([]));
  assert.match(html, /No eligible members matched those filters/);
  assert.doesNotMatch(html, /Unable to locate|geocod|location unavailable/i);
});

test("ordinary requests retain non-geographic filters and omit all origin/radius values", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ query: " Alex ", role: "dealer", brandId, relationshipType: "sold", region: " MO ", zip: "65201", areaCode: "573", nearZip: "63101", radius: "25", latitude: "38.6", longitude: "-90.2", near: "business" })) form.set(key, value);
  for (const near of [undefined, "business", "zip", "coordinates"] as const) {
    const params = memberDirectorySearchParams(form, near, { latitude: 38.6, longitude: -90.2 });
    assert.deepEqual([...params.keys()], ["query", "role", "brandId", "relationshipType", "region", "zip", "areaCode"]);
    assert.equal(params.get("query"), "Alex");
    assert.equal(params.get("region"), "MO");
  }
  assert.equal(memberDirectorySearchParams(new FormData()).toString(), "");
});

function findElement(tree: React.ReactNode, type: string): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(tree)) return;
  if (tree.type === type) return tree;
  for (const child of React.Children.toArray(tree.props.children as React.ReactNode)) {
    const found = findElement(child, type); if (found) return found;
  }
}

test("actual directory form submits non-geolocation request and accepts failed-member results", async () => {
  let requestedUrl = "", submittedResults: unknown;
  const notices: unknown[] = [];
  const portal = loadDealerPortal((async (input) => {
    requestedUrl = String(input);
    return Response.json({ results: [result()] });
  }) as typeof fetch);
  const tree = portal.tree("DirectoryPanel", { ...panelProps(), formRef: { current: { query: "Alpha", region: "MO", radius: "25", nearZip: "63101" } },
    onResults: (value: unknown) => { submittedResults = value; }, onMessage: (value: unknown) => notices.push(value) });
  const form = findElement(tree, "form");
  assert.ok(form);
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requestedUrl, "/api/dealer-network/member/directory?query=Alpha&region=MO");
  assert.deepEqual(submittedResults, [result()]);
  assert.deepEqual(notices, [""]);
});

for (const [label, filters, ids] of [
  ["member name", { query: "Alex" }, ["failed-member"]],
  ["company name", { query: "Alpha" }, ["failed-member"]],
  ["dealer role", { role: "dealer" }, ["failed-member"]],
  ["repair tech role", { role: "repair_tech" }, ["stale-member"]],
  ["both role", { role: "both" }, ["success-member"]],
  ["service region", { region: "Central Missouri" }, ["failed-member"]],
  ["city", { region: "Columbia" }, ["failed-member"]],
  ["state", { region: "IL" }, ["stale-member"]],
  ["ZIP", { zipCode: "65201" }, ["failed-member"]],
  ["ZIP+4", { zipCode: "65201-1234" }, ["failed-member"]],
  ["area code", { areaCode: "573" }, ["failed-member"]],
  ["brand sold", { brandId, relationshipType: "sold" }, ["failed-member"]],
  ["brand serviced", { brandId, relationshipType: "serviced" }, ["stale-member"]],
] as Array<[string, DirectoryFilters, string[]]>) {
  test(`${label} filter works without coordinates or Google`, () => {
    assert.deepEqual(directory.filterDirectoryRows(fixtures, filters, null).map(({ row }) => row.id), ids);
  });
}

test("no-origin results include succeeded, failed, stale, and missing points in company order", () => {
  const missing = { ...fixtures[0], id: "missing-member", companyName: "Delta Mowers", geocodeStatus: "", latitude: null, longitude: null };
  const matches = directory.filterDirectoryRows([fixtures[2], missing, fixtures[1], fixtures[0]], {}, null);
  assert.deepEqual(matches.map(({ row }) => row.id), ["failed-member", "stale-member", "missing-member", "success-member"]);
  assert.ok(matches.every(({ distance }) => distance === null));
});

test("actual directory service uses no origin and never calls geocoding for ordinary filters", async () => {
  let providerCalls = 0;
  const client = { rpc: async () => ({ data: fixtures, error: null }), from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) };
  const server = loadDealerGeocodingModule<{ searchDealerDirectory: (id: string, filters: DirectoryFilters) => Promise<DirectoryResult[]> }>("lib/dealer-network/member-server.ts", {
    "node:crypto": {}, "@/lib/supabase": { getSupabaseServiceClient: () => client }, "./directory": directory,
    "./geocoding": { geocodeUsLocation: () => { providerCalls++; throw new Error("NOT_CONFIGURED"); }, refreshStoredMemberGeocode: () => { providerCalls++; throw new Error("REQUEST_DENIED"); } },
    "./security": {}, "./brand-request-validation": {}, "./uploads": {}, "./validation": {},
  });
  const matches = await server.searchDealerDirectory("current-member", { query: "Alpha", region: "MO", zipCode: "65201", brandId, relationshipType: "sold", role: "dealer" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "failed-member");
  assert.equal(matches[0].distanceMiles, null);
  assert.equal(providerCalls, 0);
});

test("directory DTO and actual card omit private address, points, and geocode metadata", () => {
  const privateRow = { ...fixtures[0], address_line_1: "999 Synthetic Private Street", last_error: "NOT_CONFIGURED" };
  const dto = directory.toDirectoryResult(privateRow, null, null);
  assert.doesNotMatch(JSON.stringify(dto), /999 Synthetic|address_line_1|latitude|longitude|geocodeStatus|last_error|NOT_CONFIGURED/);
  const html = loadDealerPortal().render("DirectoryCard", { ...panelProps(), result: { ...dto, ...privateRow } });
  assert.doesNotMatch(html, /999 Synthetic|NOT_CONFIGURED|latitude|longitude/);
});

test("one source flag can restore retained location controls and labels", () => {
  const portal = loadDealerPortal(fetch, true);
  assert.match(portal.render("DirectoryPanel", panelProps()), /Use My Location|Radius/);
  assert.match(portal.render("DirectoryCard", { ...panelProps(), result: result(fixtures[2], 12.4) }), /12\.4 miles away/);
});

test("admin diagnostics and member retry API remain available behind existing authentication", () => {
  const source = (path: string) => readFileSync(path, "utf8");
  assert.match(source("components/dealer-network/DealerNetworkAdmin.tsx"), /<GeocodingServiceCheck \/>/);
  assert.match(source("components/dealer-network/GeocodingServiceCheck.tsx"), /Check Geocoding Service/);
  assert.match(source("app/api/admin/dealer-network/geocoding/route.ts"), /await requireDealerNetworkAdmin\(\)/);
  assert.match(source("app/api/dealer-network/member/account/route.ts"), /retryOwnBusinessLocation\(session\.memberId\)/);
});
