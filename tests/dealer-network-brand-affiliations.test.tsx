import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260822235900_add_dealer_network_brand_requests.sql",
  "utf8",
);
const memberServer = readFileSync("lib/dealer-network/member-server.ts", "utf8");
const adminServer = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
const memberUi = readFileSync("components/dealer-network/MemberPortal.tsx", "utf8");
const adminUi = readFileSync("components/dealer-network/DealerNetworkAdmin.tsx", "utf8");
const memberRoute = readFileSync(
  "app/api/dealer-network/member/brand-requests/route.ts",
  "utf8",
);
const adminRoute = readFileSync(
  "app/api/admin/dealer-network/brand-requests/[id]/route.ts",
  "utf8",
);

test("existing active brands are added as approved immediately", () => {
  assert.match(memberServer, /\.eq\("status", "active"\)/);
  assert.match(memberServer, /approval_status: "approved"/);
  assert.match(memberServer, /decided_at: new Date\(\)\.toISOString\(\)/);
});

test("member profile returns immediately searchable approved affiliations", () => {
  assert.match(memberServer, /\.eq\("approval_status", "approved"\)/);
  assert.match(memberServer, /dealer_network_directory_rows/);
});

test("member removal is immediate and ownership scoped", () => {
  assert.match(memberServer, /approval_status: "removed"/);
  assert.match(memberServer, /\.eq\("member_id", memberId\)/);
  assert.match(memberServer, /removed_at: new Date\(\)\.toISOString\(\)/);
});

test("member routes derive identity only from the HTTP-only session", () => {
  for (const source of [memberRoute, readFileSync("app/api/dealer-network/member/brands/route.ts", "utf8")]) {
    assert.match(source, /requireActiveUnlockedMember/);
    assert.match(source, /session\.memberId/);
    assert.doesNotMatch(source, /body\.memberId/);
  }
});

test("member affiliation UI has no approval or pending language", () => {
  const profilePanel = memberUi.slice(memberUi.indexOf("function ProfilePanel"));
  for (const wording of [
    "submitted for IDS approval",
    "new affiliations remain pending",
    "not searchable until IDS approves",
    "Request Brand Affiliation",
  ])
    assert.doesNotMatch(profilePanel, new RegExp(wording, "i"));
  assert.match(profilePanel, />\s*Add Brand\s*</);
  assert.match(profilePanel, />\s*Remove\s*</);
});

test("new brand requests do not create affiliations", () => {
  const requestFunction = memberServer.slice(
    memberServer.indexOf("export async function createDealerBrandRequest"),
    memberServer.indexOf("export async function removeMemberBrand"),
  );
  assert.match(requestFunction, /dealer_network_brand_requests/);
  assert.doesNotMatch(requestFunction, /dealer_network_member_brands/);
});

test("new brand names are normalized and validated server-side", () => {
  const validation = readFileSync(
    "lib/dealer-network/brand-request-validation.ts",
    "utf8",
  );
  assert.match(validation, /trim\(\)\.replace\(\/\\s\+\/g, " "\)/);
  assert.match(validation, /requestedName\.length < 2/);
  assert.match(validation, /toLocaleLowerCase/);
});

test("duplicate open requests are prevented race-safely", () => {
  assert.match(migration, /create unique index dealer_network_brand_requests_pending_name_uidx/);
  assert.match(migration, /where status = 'pending'/);
  assert.match(memberServer, /error\?\.code === "23505"/);
});

test("requests for existing catalog brands are rejected", () => {
  assert.match(memberServer, /BRAND_ALREADY_EXISTS/);
  assert.match(memberServer, /dealer_network_brands/);
});

test("admin sees request identity company and date", () => {
  assert.match(adminUi, /New Brand Requests/);
  assert.match(adminUi, /request\.memberName/);
  assert.match(adminUi, /request\.companyName/);
  assert.match(adminUi, /request\.createdAt/);
});

test("admin can add or dismiss requests", () => {
  assert.match(adminUi, /handleRequest\(request\.id, "add"\)/);
  assert.match(adminUi, /handleRequest\(request\.id, "dismiss"\)/);
  assert.match(adminServer, /status: action === "add" \? "resolved" : "dismissed"/);
  assert.match(adminServer, /await saveDealerBrand/);
});

test("admin request mutation requires existing admin authentication", () => {
  assert.match(adminRoute, /requireDealerNetworkAdmin/);
  assert.doesNotMatch(adminRoute, /requireActiveUnlockedMember/);
});

test("old affiliation approval endpoint and UI controls are retired", () => {
  assert.equal(
    existsSync("app/api/admin/dealer-network/member-brands/[id]/route.ts"),
    false,
  );
  assert.doesNotMatch(adminUi, /void decide\(brand\.id/);
  assert.doesNotMatch(adminServer, /export async function decideMemberBrand/);
});

test("brand request table is private and forced through service role", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.dealer_network_brand_requests\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update on table public\.dealer_network_brand_requests\s+to service_role/);
});

test("legacy pending active affiliations are preserved and promoted", () => {
  assert.match(migration, /approval_status = 'approved'/);
  assert.match(migration, /mb\.approval_status = 'pending'/);
  assert.doesNotMatch(migration, /delete from public\.dealer_network_member_brands/i);
});

test("deleted members preserve request audit snapshots", () => {
  assert.match(migration, /member_id uuid references public\.dealer_network_members\(id\) on delete set null/);
  assert.match(migration, /member_name_snapshot/);
  assert.match(migration, /company_name_snapshot/);
});
