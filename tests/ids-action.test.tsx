import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicFilter, toPublicEntry } from "../lib/ids-action/public";
import {
  validateIdsActionEntry,
  validateMediaInput,
  IDS_ACTION_IMAGE_TYPES,
  IDS_ACTION_MAX_IMAGE_BYTES,
  IDS_ACTION_MAX_IMAGE_DIMENSION,
} from "../lib/ids-action/validation";
import {
  getOptimizedDimensions,
  validateIdsActionSource,
} from "../lib/ids-action/image-optimization";
import {
  IDS_ACTION_TUS_CHUNK_BYTES,
  IDS_ACTION_TUS_RETRY_DELAYS,
  IDS_ACTION_TUS_STALL_TIMEOUT_MS,
  safeTusUploadError,
} from "../lib/ids-action/tus-upload";
import {
  inspectSignedUploadToken,
  isValidSignedUploadToken,
} from "../lib/ids-action/signed-upload-token";
import {
  IDS_ACTION_MEDIA_TYPES,
  type IdsActionEntry,
} from "../lib/ids-action/types";
const entry = (
  id: string,
  overrides: Partial<IdsActionEntry> = {},
): IdsActionEntry => ({
  id,
  title: `Entry ${id}`,
  description: null,
  category: "Equipment Demo",
  location: null,
  eventDate: `2026-08-${id.padStart(2, "0")}`,
  featured: false,
  published: true,
  sortOrder: 100,
  createdAt: `2026-08-${id.padStart(2, "0")}T00:00:00Z`,
  updatedAt: "2026-08-11T00:00:00Z",
  media: [],
  ...overrides,
});
const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260811180037_create_ids_action_gallery.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  limitMigration = readFileSync(
    new URL(
      "../supabase/migrations/20260811192807_increase_ids_action_media_limit.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  publicRoute = readFileSync(
    new URL("../app/api/ids-in-action/route.ts", import.meta.url),
    "utf8",
  ),
  adminRoute = readFileSync(
    new URL("../app/api/admin/ids-in-action/route.ts", import.meta.url),
    "utf8",
  ),
  uploadRoute = readFileSync(
    new URL(
      "../app/api/admin/ids-in-action/[id]/upload/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  mediaRoute = readFileSync(
    new URL(
      "../app/api/admin/ids-in-action/[id]/media/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  adminPage = readFileSync(
    new URL("../app/admin/ids-in-action/page.tsx", import.meta.url),
    "utf8",
  ),
  tusUpload = readFileSync(
    new URL("../lib/ids-action/tus-upload.ts", import.meta.url),
    "utf8",
  ),
  gallery = readFileSync(
    new URL("../components/ids-action/IdsActionGallery.tsx", import.meta.url),
    "utf8",
  ),
  carousel = readFileSync(
    new URL("../components/ids-action/IdsActionCarousel.tsx", import.meta.url),
    "utf8",
  ),
  homepage = readFileSync(new URL("../components/home/DesktopHomepage.tsx", import.meta.url), "utf8"),
  mobile = readFileSync(
    new URL("../components/mobile/MobileHomeNavigation.tsx", import.meta.url),
    "utf8",
  ),
  mobileHome = readFileSync(
    new URL("../components/mobile/MobileHomepage.tsx", import.meta.url),
    "utf8",
  );
test("public filtering excludes unpublished entries and supports category", () => {
  const rows = [
    entry("1"),
    entry("2", { published: false }),
    entry("3", { category: "Event" }),
  ];
  assert.deepEqual(
    publicFilter(rows, { limit: 24 }).map((x) => x.id),
    ["3", "1"],
  );
  assert.deepEqual(
    publicFilter(rows, { category: "Event", limit: 24 }).map((x) => x.id),
    ["3"],
  );
});
test("featured homepage filtering requires published + featured and is bounded", () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    entry(String(i + 1), { featured: true }),
  );
  rows[0].published = false;
  rows[1].featured = false;
  const result = publicFilter(rows, { featured: true, limit: 8 });
  assert.equal(result.length, 8);
  assert.ok(result.every((x) => x.published && x.featured));
  assert.match(publicRoute, /featured\?10:24/);
});
test("public entries sort newest event date then created date", () => {
  const rows = [entry("1"), entry("3"), entry("2")];
  assert.deepEqual(
    publicFilter(rows, { limit: 24 }).map((x) => x.id),
    ["3", "2", "1"],
  );
});
test("data model is future-video-ready while current upload APIs accept images only", () => {
  assert.deepEqual(IDS_ACTION_MEDIA_TYPES, ["image", "video"]);
  assert.match(migration, /media_type in \('image','video'\)/);
  assert.deepEqual(Object.keys(IDS_ACTION_IMAGE_TYPES), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(
    validateMediaInput({
      mediaType: "video",
      mediaUrl: "https://example.com/v.mp4",
      storagePath: "entries/abc/video.mp4",
      altText: "",
      sortOrder: 1,
    }),
    null,
  );
  assert.doesNotMatch(adminPage, /accept="[^"]*video/);
});
test("multiple image media are publicly ordered and admin fields are removed", () => {
  const output = toPublicEntry({
    id: "e",
    title: "Work",
    description: null,
    category: "Event",
    location: null,
    event_date: "2026-08-11",
    featured: true,
    published: true,
    customer_permission_confirmed: true,
    sort_order: 100,
    created_at: "now",
    updated_at: "now",
    ids_action_media: [
      {
        id: "2",
        entry_id: "e",
        media_type: "image",
        media_url: "https://example.com/2.jpg",
        storage_path: "private",
        thumbnail_url: null,
        alt_text: "Second",
        sort_order: 20,
        created_at: "now",
      },
      {
        id: "1",
        entry_id: "e",
        media_type: "image",
        media_url: "https://example.com/1.jpg",
        storage_path: "private",
        thumbnail_url: null,
        alt_text: "First",
        sort_order: 10,
        created_at: "now",
      },
    ],
  });
  assert.deepEqual(
    output.media.map((x) => x.altText),
    ["First", "Second"],
  );
  assert.equal(output.media[0].storagePath, null);
  assert.equal("customerPermissionConfirmed" in output, false);
});
test("create and edit validation enforce fields and customer permission publishing rule", () => {
  const base = {
    title: "Delivery",
    description: null,
    category: "Customer Delivery",
    location: null,
    eventDate: "2026-08-11",
    featured: true,
    published: true,
    customerPermissionConfirmed: false,
    sortOrder: 100,
  };
  const blocked = validateIdsActionEntry(base);
  assert.equal(blocked.ok, false);
  const allowed = validateIdsActionEntry({
    ...base,
    customerPermissionConfirmed: true,
  });
  assert.equal(allowed.ok, true);
  assert.equal(validateIdsActionEntry({ ...base, title: "" }).ok, false);
  assert.equal(
    validateIdsActionEntry({
      ...base,
      category: "Equipment Demo",
      customerPermissionConfirmed: false,
    }).ok,
    true,
  );
});
test("admin routes require shared authentication and expose CRUD/photo controls", () => {
  assert.match(adminRoute, /isReviewAdmin/);
  assert.match(adminRoute, /status:401/);
  for (const token of [
    "PATCH",
    "DELETE",
    "Published",
    "Featured on homepage",
    "Remove",
    "Photo order",
    "createSignedUploadUrl",
    "uploadIdsActionTus",
  ])
    assert.ok(
      adminPage.includes(token) ||
        readFileSync(
          new URL(
            "../app/api/admin/ids-in-action/[id]/route.ts",
            import.meta.url,
          ),
          "utf8",
        ).includes(token) ||
        uploadRoute.includes(token),
    );
});
test("IDS Action source limit is exactly 50 MB per supported photo", () => {
  assert.equal(IDS_ACTION_MAX_IMAGE_BYTES, 52428800);
  for (const type of ["image/jpeg", "image/png", "image/webp"])
    assert.doesNotThrow(() =>
      validateIdsActionSource({ type, size: 52428800 } as File),
    );
  assert.throws(
    () =>
      validateIdsActionSource({ type: "image/jpeg", size: 52428801 } as File),
    /50 MB/,
  );
  assert.throws(
    () => validateIdsActionSource({ type: "image\/heic", size: 1 } as File),
    /HEIC\/HEIF/,
  );
  assert.match(adminPage, /up to 50 MB per photo/);
  assert.match(limitMigration, /file_size_limit = 52428800/);
  assert.match(limitMigration, /where id = 'ids-action-media'/);
});
test("optimization preserves aspect ratio, never upscales, and caps the longest edge", () => {
  assert.equal(IDS_ACTION_MAX_IMAGE_DIMENSION, 3200);
  assert.deepEqual(getOptimizedDimensions(2400, 1600), {
    width: 2400,
    height: 1600,
  });
  assert.deepEqual(getOptimizedDimensions(6000, 4000), {
    width: 3200,
    height: 2133,
  });
  assert.deepEqual(getOptimizedDimensions(3000, 6000), {
    width: 1600,
    height: 3200,
  });
});
test("IDS Action uses signed resumable TUS uploads with progress, retries, cancellation and stall termination", () => {
  assert.match(uploadRoute, /\.storage\.supabase\.co/);
  assert.match(uploadRoute, /storage\/v1\/upload\/resumable/);
  assert.equal(IDS_ACTION_TUS_CHUNK_BYTES, 6 * 1024 * 1024);
  assert.deepEqual(IDS_ACTION_TUS_RETRY_DELAYS, [0, 1000, 3000, 5000, 10000]);
  assert.equal(IDS_ACTION_TUS_STALL_TIMEOUT_MS, 60000);
  for (const token of [
    "x-signature",
    "signedToken",
    "onProgress",
    "onShouldRetry",
    "retryDelays",
    "abort(true)",
    "Upload stalled for 60 seconds",
  ])
    assert.ok(tusUpload.includes(token));
  for (const token of [
    "Uploading photo ${index + 1} of ${selected.length} — ${percent}%",
    "Connection interrupted. Retrying",
    "Cancel Uploads",
    "Attaching photo",
    "await task.promise",
  ])
    assert.ok(adminPage.includes(token));
});
test("signed upload token validation accepts only matching compact JWS values", () => {
  const token = "header.payload.signature";
  const valid = inspectSignedUploadToken(
    token,
    `https://example.supabase.co/storage/v1/object/upload/sign/bucket/file?token=${token}`,
  );
  assert.deepEqual(valid, {
    tokenPresent: true,
    tokenType: "string",
    tokenLength: token.length,
    tokenSegmentCount: 3,
    tokenSegmentsNonEmpty: true,
    tokenHasWhitespace: false,
    tokenMatchesSignedUrl: true,
  });
  assert.equal(isValidSignedUploadToken(valid), true);
  for (const candidate of [undefined, "", "one.two", "one..three", ` ${token}`, `${token} `]) {
    const diagnostics = inspectSignedUploadToken(
      candidate,
      `https://example.supabase.co/upload?token=${encodeURIComponent(String(candidate ?? ""))}`,
    );
    assert.equal(isValidSignedUploadToken(diagnostics), false);
  }
  assert.equal(inspectSignedUploadToken(token, "https://example.com/?token=different").tokenMatchesSignedUrl, false);
});
test("signed TUS uses the dedicated direct-storage route and maps Compact JWS failures safely", () => {
  assert.match(uploadRoute, /storage\/v1\/upload\/resumable\/sign/);
  assert.match(tusUpload, /storage\/v1\/upload\/resumable\/sign/);
  assert.match(tusUpload, /"x-signature": options\.signedToken/);
  const translated = safeTusUploadError(new Error("HTTP 400: AccessDenied: Invalid Compact JWS"));
  assert.match(translated.message, /authorization was rejected by Supabase/);
  assert.match(translated.message, /HTTP 400 \/ AccessDenied/);
  assert.doesNotMatch(translated.message, /header\.payload\.signature/);
});
test("browser TUS transport uses only the server-supplied endpoint and signed token", () => {
  assert.doesNotMatch(adminPage, /NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)/);
  assert.doesNotMatch(tusUpload, /anonKey|projectUrl|authorization:|apikey:/);
  assert.match(uploadRoute, /tusEndpoint/);
  assert.match(uploadRoute, /inspectSignedUploadToken/);
  assert.match(uploadRoute, /isValidSignedUploadToken/);
  assert.match(uploadRoute, /credentialType/);
  assert.match(uploadRoute, /getSupabaseUrl\(\)/);
  assert.doesNotMatch(uploadRoute, /SERVICE_ROLE.*Response|serviceRole.*Response/i);
  assert.match(tusUpload, /endpoint: validateTusEndpoint\(options\.tusEndpoint\)/);
  assert.match(tusUpload, /"x-signature": options\.signedToken/);
  assert.match(tusUpload, /uploadDataDuringCreation: true/);
  assert.match(tusUpload, /"x-upsert": "false"/);
});
test("upload status remains in the edit modal and retains actionable partial failures", () => {
  assert.match(adminPage, /role="status"/);
  assert.match(adminPage, /\{uploadMessage\}/);
  assert.match(adminPage, /failed before upload started/);
  assert.match(adminPage, /failureReasons\.join\("; "\)/);
  assert.match(adminPage, /setMessage\("Entry saved\."\)/);
  assert.match(adminPage, /setUploadMessage/);
  assert.match(adminPage, /if \(item\) setEditing\(item\)/);
});
test("failed preparation or TUS upload cannot attach media and orphan cleanup remains", () => {
  const tusCompletion = adminPage.indexOf("await task.promise"),
    attachment = adminPage.indexOf("/media`,", tusCompletion);
  assert.ok(tusCompletion > 0 && attachment > tusCompletion);
  assert.match(adminPage, /catch \(error\)[\s\S]*cleanupUpload/);
  assert.match(mediaRoute, /metadata could not be verified/);
  assert.match(mediaRoute, /IDS_ACTION_MAX_IMAGE_BYTES/);
  assert.match(mediaRoute, /media_type: "image"/);
  assert.match(mediaRoute, /remove\(\[value\.storagePath\]\)/);
  assert.match(uploadRoute, /export async function DELETE/);
});
test("public gallery provides filters, multiple-photo lightbox, keyboard and empty state", () => {
  for (const token of [
    "IDS_ACTION_CATEGORIES",
    'role="dialog"',
    "Escape",
    "ArrowRight",
    "ArrowLeft",
    "Previous photo",
    "Next photo",
    "New demonstrations, deliveries, and field projects will be added here soon.",
  ])
    assert.ok(gallery.includes(token));
});
test("homepage carousel supports both viewports, one image at a time, reduced motion, and an empty state omission", () => {
  assert.match(carousel, /setInterval\([^,]+, 3000\)/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
  assert.match(carousel, /entries\.length < 2/);
  assert.match(carousel, /if \(!entries\.length\) return null/);
  assert.match(carousel, /featured=true&limit=8/);
  assert.match(carousel, /VIEW ALL IDS IN ACTION/);
  assert.match(carousel, /href="\/ids-in-action"/);
  assert.match(
    carousel,
    /const entry = entries\[index\];[\s\S]*const photo = entry\.media\[0\]/,
  );
  assert.doesNotMatch(carousel, /matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(carousel, /ScheduleDemoModal source="ids_in_action"/);
});
test("desktop IDS in Action is an isolated selectable view", () => {
  assert.match(homepage, /view === "ids-action" && <IdsActionCarousel \/>/);
  const home = homepage.slice(homepage.indexOf('view === "home"'), homepage.indexOf('view !== "home"'));
  assert.doesNotMatch(home, /IdsActionCarousel|HomeReviews|HomeFinancing/);
});
test("mobile menu selects the featured IDS IN ACTION view before contact without mounting the gallery", () => {
  const reviews = mobile.indexOf('label: "CUSTOMER REVIEWS"'),
    action = mobile.indexOf('label: "IDS IN ACTION"'),
    contact = mobile.indexOf('label: "CONTACT IDS"');
  assert.ok(reviews < action && action < contact);
  assert.match(mobile, /label: "IDS IN ACTION", view: "ids-action"/);
  assert.doesNotMatch(mobile, /href="\/ids-in-action"[^>]*>IDS IN ACTION/);
  assert.match(mobileHome, /view === "ids-action" && <IdsActionCarousel \/>/);
  assert.doesNotMatch(mobileHome, /IdsActionGallery/);
});
