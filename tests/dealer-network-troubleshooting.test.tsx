import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TROUBLESHOOTING_BATCH_BYTES,
  TROUBLESHOOTING_DESCRIPTION_LIMIT,
  validateTroubleshootingEntry,
  validateTroubleshootingSearch,
  validateTroubleshootingUploadRequest,
} from "../lib/dealer-network/troubleshooting-validation";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260816043437_add_dealer_network_troubleshooting.sql",
).toLowerCase();
const server = source("lib/dealer-network/troubleshooting-server.ts");
const memberUi = source(
  "components/dealer-network/TroubleshootingPanel.tsx",
);
const adminUi = source(
  "components/dealer-network/DealerNetworkAdmin.tsx",
);
const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const entry = (overrides: Record<string, unknown> = {}) => ({
  title: "GPS position jumps after firmware update",
  brand: "Example Robotics",
  model: "R-500",
  issueDate: "2026-08-01",
  firmwareSoftwareVersion: "4.7.2",
  systemArea: "GPS",
  badPart: "GNSS antenna cable",
  issueDescription: "The map position shifted after startup.",
  fixDescription: "Replaced the damaged antenna cable and recalibrated.",
  uploadIds: [uuid(1), uuid(2)],
  ...overrides,
});

test("troubleshooting entry validation requires the requested fields and bounds both narratives", () => {
  const parsed = validateTroubleshootingEntry(entry());
  assert.ok(parsed);
  assert.equal(parsed.title, "GPS position jumps after firmware update");
  assert.equal(parsed.uploadIds.length, 2);
  assert.equal(
    validateTroubleshootingEntry(entry({ title: "" })),
    null,
  );
  assert.equal(
    validateTroubleshootingEntry(
      entry({ issueDescription: "x".repeat(TROUBLESHOOTING_DESCRIPTION_LIMIT + 1) }),
    ),
    null,
  );
  assert.equal(
    validateTroubleshootingEntry(
      entry({ fixDescription: "x".repeat(TROUBLESHOOTING_DESCRIPTION_LIMIT + 1) }),
    ),
    null,
  );
  assert.equal(validateTroubleshootingEntry(entry({ issueDate: "2999-01-01" })), null);
  assert.ok(validateTroubleshootingEntry(entry({ badPart: "" })));
});

test("troubleshooting photo preparation allows only three photos in each issue/fix group", () => {
  const accepted = validateTroubleshootingUploadRequest({
    files: [
      ...Array.from({ length: 3 }, (_, position) => ({
        photoKind: "issue",
        position,
        contentType: "image/jpeg",
        byteSize: 100,
      })),
      ...Array.from({ length: 3 }, (_, position) => ({
        photoKind: "fix",
        position,
        contentType: "image/heic",
        byteSize: 100,
      })),
    ],
  });
  assert.ok(accepted);
  assert.equal(accepted.files.length, 6);
  assert.equal(
    validateTroubleshootingUploadRequest({
      files: Array.from({ length: 4 }, (_, position) => ({
        photoKind: "issue",
        position,
        contentType: "image/jpeg",
        byteSize: 100,
      })),
    }),
    null,
  );
  assert.equal(
    validateTroubleshootingUploadRequest({
      files: [
        { photoKind: "issue", position: 0, contentType: "image/svg+xml", byteSize: 100 },
      ],
    }),
    null,
  );
  assert.equal(TROUBLESHOOTING_BATCH_BYTES, 45 * 1024 * 1024);
});

test("title search input is bounded and the server searches only approved title vectors", () => {
  assert.equal(validateTroubleshootingSearch("  gps motor  "), "gps motor");
  assert.equal(validateTroubleshootingSearch("x".repeat(101)), null);
  assert.match(server, /\.eq\("status", "approved"\)/);
  assert.match(server, /\.textSearch\("title_search", search,/);
  assert.doesNotMatch(server, /textSearch\("issue_description"/);
  assert.doesNotMatch(server, /textSearch\("fix_description"/);
  assert.match(migration, /title_search tsvector generated always/);
  assert.match(migration, /using gin \(title_search\)/);
});

test("troubleshooting schema defaults submissions to pending and is service-role only", () => {
  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /status in \('pending','approved','denied'\)/);
  for (const table of [
    "dealer_network_troubleshooting_entries",
    "dealer_network_troubleshooting_photos",
    "dealer_network_troubleshooting_uploads",
  ]) assert.match(migration, new RegExp(`'${table}'`));
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all on table public\.%i from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.%i to service_role/,
  );
  assert.match(
    migration,
    /dealer-network-troubleshooting-private[\s\S]*?false,[\s\S]*?15728640/,
  );
});

test("photo processing normalizes private uploads and atomically links each record to its entry", () => {
  assert.match(server, /normalizeMessageImage/);
  assert.match(server, /exactStorageArrayBuffer/);
  assert.match(server, /dealer_network_create_troubleshooting_entry/);
  assert.match(
    migration,
    /insert into public\.dealer_network_troubleshooting_entries[\s\S]*?insert into public\.dealer_network_troubleshooting_photos/,
  );
  assert.match(migration, /unique \(entry_id, photo_kind, position\)/);
  assert.match(migration, /issue_photo_total > 3 or fix_photo_total > 3/);
  assert.match(server, /createSignedUrl\(photo\.storage_path/);
  assert.match(
    server,
    /entry\.status !== "approved" && entry\.member_id !== memberId/,
  );
  assert.match(server, /cacheControl: "3600"/);
});

test("member and admin surfaces expose the complete moderated troubleshooting workflow", () => {
  assert.match(memberUi, /Please fill out completely\./);
  for (const name of [
    "title",
    "brand",
    "model",
    "issueDate",
    "firmwareSoftwareVersion",
    "systemArea",
    "badPart",
    "issueDescription",
    "fixDescription",
  ]) assert.match(memberUi, new RegExp(`name="${name}"`));
  assert.match(memberUi, /label="Issue Photos"/);
  assert.match(memberUi, /label="Fix Photos"/);
  assert.match(memberUi, /multiple/);
  assert.match(memberUi, /TROUBLESHOOTING_DESCRIPTION_LIMIT/);
  assert.match(memberUi, /Submit to IDS for Approval/);
  assert.match(adminUi, /Troubleshooting \(/);
  assert.match(adminUi, /"approved"/);
  assert.match(adminUi, /"denied"/);
});

test("every troubleshooting route authenticates member or admin access", () => {
  for (const path of [
    "app/api/dealer-network/member/troubleshooting/route.ts",
    "app/api/dealer-network/member/troubleshooting/uploads/route.ts",
    "app/api/dealer-network/member/troubleshooting/uploads/[id]/route.ts",
    "app/api/dealer-network/member/troubleshooting/photos/[id]/route.ts",
  ]) assert.match(source(path), /requireActiveUnlockedMember/);
  for (const path of [
    "app/api/admin/dealer-network/troubleshooting/[id]/route.ts",
    "app/api/admin/dealer-network/troubleshooting/photos/[id]/route.ts",
  ]) assert.match(source(path), /requireDealerNetworkAdmin/);
});
