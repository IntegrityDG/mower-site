import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import HomepageContactSection from "../components/contact/HomepageContactSection";
import {
  isPublicTroubleshootingPhotoVisible,
  isPublicTroubleshootingRecordVisible,
  toPublicTroubleshootingEntry,
  validatePublicTroubleshootingFilters,
  type PublicTroubleshootingEntryRow,
  type PublicTroubleshootingPhotoRow,
} from "../lib/public-troubleshooting/types";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260816060715_add_public_troubleshooting_publication.sql",
).toLowerCase();
const publicServer = source("lib/public-troubleshooting/server.ts");
const publicApi = source("app/api/troubleshooting/route.ts");
const publicDetailApi = source("app/api/troubleshooting/[id]/route.ts");
const publicPhotoApi = source("app/api/troubleshooting/photos/[id]/route.ts");
const adminServer = source("lib/dealer-network/troubleshooting-server.ts");
const adminUi = source("components/dealer-network/DealerNetworkAdmin.tsx");
const memberUi = source(
  "components/dealer-network/TroubleshootingPanel.tsx",
);

const entryId = "00000000-0000-4000-8000-000000000001";
const publicPhotoId = "00000000-0000-4000-8000-000000000002";
const privatePhotoId = "00000000-0000-4000-8000-000000000003";

test("only approved and explicitly published records satisfy public visibility", () => {
  assert.equal(
    isPublicTroubleshootingRecordVisible({
      status: "approved",
      publiclyPublished: true,
    }),
    true,
  );
  for (const state of [
    { status: "approved", publiclyPublished: false },
    { status: "pending", publiclyPublished: true },
    { status: "denied", publiclyPublished: true },
  ] as const)
    assert.equal(isPublicTroubleshootingRecordVisible(state), false);
  assert.equal(
    isPublicTroubleshootingRecordVisible({
      status: "approved",
      publiclyPublished: false,
    }),
    false,
    "unpublishing removes public visibility",
  );
});

test("public photo access requires all three independent visibility gates", () => {
  assert.equal(
    isPublicTroubleshootingPhotoVisible({
      status: "approved",
      publiclyPublished: true,
      publiclyVisible: true,
    }),
    true,
  );
  for (const state of [
    {
      status: "approved",
      publiclyPublished: true,
      publiclyVisible: false,
    },
    {
      status: "approved",
      publiclyPublished: false,
      publiclyVisible: true,
    },
    {
      status: "pending",
      publiclyPublished: true,
      publiclyVisible: true,
    },
    {
      status: "denied",
      publiclyPublished: true,
      publiclyVisible: true,
    },
  ] as const)
    assert.equal(isPublicTroubleshootingPhotoVisible(state), false);
});

test("the public DTO is constructed as an allowlist and omits private and hidden photo data", () => {
  const privateSentinel = "PRIVATE-MEMBER-DATA-MUST-NOT-LEAK";
  const row = {
    id: entryId,
    title: "GPS position jumps after startup",
    brand: "Example Brand",
    model: "R1",
    issue_date: "2026-08-01",
    firmware_software_version: "1.2.3",
    system_area: "Navigation",
    bad_part: "Antenna cable",
    issue_description: "Position moved on the map.",
    fix_description: "Replace the cable and recalibrate.",
    member_id: privateSentinel,
    member_name_snapshot: privateSentinel,
    company_name_snapshot: privateSentinel,
    email: privateSentinel,
    phone: privateSentinel,
    address: privateSentinel,
    admin_notes: privateSentinel,
  } as PublicTroubleshootingEntryRow;
  const photos = [
    {
      id: publicPhotoId,
      entry_id: entryId,
      photo_kind: "issue",
      width: 1200,
      height: 900,
      position: 0,
      publicly_visible: true,
      storage_path: privateSentinel,
    },
    {
      id: privatePhotoId,
      entry_id: entryId,
      photo_kind: "fix",
      width: 1200,
      height: 900,
      position: 0,
      publicly_visible: false,
      storage_path: privateSentinel,
    },
  ] as unknown as PublicTroubleshootingPhotoRow[];

  const dto = toPublicTroubleshootingEntry(row, photos);
  assert.deepEqual(Object.keys(dto).sort(), [
    "badPart",
    "brand",
    "firmwareSoftwareVersion",
    "fixDescription",
    "id",
    "issueDate",
    "issueDescription",
    "model",
    "photos",
    "systemArea",
    "title",
  ]);
  assert.equal(dto.photos.length, 1);
  assert.equal(dto.photos[0].id, publicPhotoId);
  assert.deepEqual(Object.keys(dto.photos[0]).sort(), [
    "height",
    "id",
    "photoKind",
    "position",
    "url",
    "width",
  ]);
  assert.doesNotMatch(JSON.stringify(dto), new RegExp(privateSentinel));
  assert.doesNotMatch(JSON.stringify(dto), /storage_path|member|company|email|phone|address|admin/i);

  const zeroPhotoDto = toPublicTroubleshootingEntry(row, [
    photos[1],
  ] as PublicTroubleshootingPhotoRow[]);
  assert.deepEqual(zeroPhotoDto.photos, []);
});

test("public search is bounded, blank-browse capable, partial, and case-insensitive", () => {
  assert.deepEqual(validatePublicTroubleshootingFilters({ q: "  GpS  " }), {
    query: "GpS",
    brand: "",
    model: "",
    systemArea: "",
  });
  assert.deepEqual(validatePublicTroubleshootingFilters({ q: "" }), {
    query: "",
    brand: "",
    model: "",
    systemArea: "",
  });
  assert.equal(
    validatePublicTroubleshootingFilters({ q: "x".repeat(101) }),
    null,
  );
  assert.match(publicServer, /if \(filters\.query\)/);
  assert.match(publicServer, /\.ilike\("title", likeContains\(filters\.query\)\)/);
  assert.match(publicServer, /return `%\$\{escaped\}%`/);
  assert.match(publicServer, /\.eq\("status", "approved"\)/);
  assert.match(publicServer, /\.eq\("publicly_published", true\)/);
});

test("public APIs expose only sanitized DTOs and disable response caching", () => {
  assert.match(publicServer, /PUBLIC_TROUBLESHOOTING_ENTRY_COLUMNS/);
  assert.match(
    publicServer,
    /"id,title,brand,model,issue_date,firmware_software_version,system_area,bad_part,issue_description,fix_description"/,
  );
  assert.doesNotMatch(
    publicServer.match(
      /PUBLIC_TROUBLESHOOTING_ENTRY_COLUMNS\s*=\s*[\s\S]*?;/,
    )?.[0] ?? "",
    /member|company|email|phone|address|storage|admin/i,
  );
  for (const route of [publicApi, publicDetailApi, publicPhotoApi]) {
    assert.match(route, /PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS/);
    assert.match(route, /force-dynamic/);
  }
});

test("the public photo proxy reauthorizes opaque IDs and never redirects to storage", () => {
  assert.match(publicServer, /validateUuid\(photoId\)/);
  assert.match(publicServer, /\.eq\("publicly_visible", true\)/);
  assert.match(publicServer, /\.eq\("status", "approved"\)/);
  assert.match(publicServer, /\.eq\("publicly_published", true\)/);
  assert.match(publicServer, /\.download\(photo\.storage_path\)/);
  assert.doesNotMatch(publicPhotoApi, /location|createSignedUrl|storage_path/);
  assert.match(publicPhotoApi, /"x-content-type-options": "nosniff"/);
  assert.match(publicPhotoApi, /status: 404/);
});

test("the migration adds safe defaults, approval invariants, and no browser grants", () => {
  assert.match(
    migration,
    /add column publicly_published boolean not null default false/,
  );
  assert.match(
    migration,
    /add column publicly_visible boolean not null default false/,
  );
  assert.match(
    migration,
    /check \(not publicly_published or status = 'approved'\)/,
  );
  assert.match(migration, /new\.publicly_published := false/);
  assert.match(migration, /before insert or update of status, publicly_published/);
  assert.doesNotMatch(migration, /grant select[\s\S]*?(anon|authenticated)/);
  assert.doesNotMatch(migration, /storage\.buckets[\s\S]*?public\s*=\s*true/);
});

test("admin publication controls are separate and admin-authenticated", () => {
  assert.match(adminUi, /Dealer Network Status/);
  assert.match(adminUi, /Public Website/);
  assert.match(adminUi, /Show on Public Website/);
  assert.match(adminUi, /entry\.status !== "approved"/);
  assert.match(adminServer, /PUBLICATION_REQUIRES_APPROVAL/);
  assert.match(adminServer, /publicly_published: false/);
  for (const route of [
    "app/api/admin/dealer-network/troubleshooting/[id]/publication/route.ts",
    "app/api/admin/dealer-network/troubleshooting/photos/[id]/publication/route.ts",
  ])
    assert.match(source(route), /requireDealerNetworkAdmin/);
});

test("member submissions cannot send or receive public moderation controls", () => {
  assert.doesNotMatch(memberUi, /publiclyPublished|publiclyVisible/);
  assert.doesNotMatch(
    source("lib/dealer-network/troubleshooting-validation.ts"),
    /publiclyPublished|publiclyVisible/,
  );
  assert.doesNotMatch(
    source("app/api/dealer-network/member/troubleshooting/route.ts"),
    /publiclyPublished|publiclyVisible/,
  );
});

test("the homepage contact section keeps both actions and adds the public troubleshooting link", () => {
  const html = renderToStaticMarkup(<HomepageContactSection />);
  assert.match(html, /<button[^>]*>Contact Us<\/button>/);
  assert.match(html, /<button[^>]*>Schedule a Demo<\/button>/);
  assert.match(
    html,
    /href="\/troubleshoot-your-robot"[^>]*>Troubleshoot Your Robot<\/a>/,
  );
});
