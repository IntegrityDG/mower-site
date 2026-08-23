import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import DealerTechResourcesPage from "../app/dealer-tech-resources/page";
import { applyConsistentAdminProfileUpdate } from "../lib/dealer-network/admin-profile-consistency";
import {
  filterDirectoryRows,
  haversineMiles,
  resolveBusinessDirectoryOrigin,
  toDirectoryResult,
  type PrivateDirectoryRow,
} from "../lib/dealer-network/directory";
import { geocodeUsLocation } from "../lib/dealer-network/geocoding-adapter";
import { browserGeolocationErrorMessage } from "../lib/dealer-network/browser-geolocation";
import { hasExpectedFileSignature } from "../lib/dealer-network/uploads";
import { sendSuggestionStatusEmail } from "../lib/dealer-network/suggestion-status-email";
import {
  normalizeCompanyName,
  normalizeEmail,
  normalizeUsPhone,
  validateDealerApplication,
  validateMemberProfile,
  validatePin,
} from "../lib/dealer-network/validation";

const migrationPath =
  "supabase/migrations/20260815165544_create_dealer_network_portal.sql";
const migration = readFileSync(migrationPath, "utf8");
const brandA = "10000000-0000-4000-8000-000000000001";
const brandB = "10000000-0000-4000-8000-000000000002";
const application = (overrides: Record<string, unknown> = {}) => ({
  applicantName: "Alex Technician",
  companyName: "Robot Mower Pros",
  phone: "(573) 555-1234",
  email: "Alex@Example.com",
  addressLine1: "100 Main Street",
  addressLine2: "",
  city: "Sikeston",
  state: "MO",
  zipCode: "63801",
  websiteUrl: "https://example.com",
  role: "both",
  experience: "Seven years",
  serviceRegion: "Southeast Missouri",
  introduction: "Dealer and factory-trained repair provider.",
  businessType: "robotic_mower_dealer",
  otherBusinessType: "",
  certificationAnswer: null,
  brandsSold: [brandA],
  brandsServiced: [brandA, brandB],
  certifications: [],
  consent: true,
  ...overrides,
});

test("public Dealer & Tech landing contains the approved identity and actions without directory content", () => {
  const html = renderToStaticMarkup(<DealerTechResourcesPage />);
  assert.match(html, /Dealer &amp; Tech Community Resources/);
  assert.match(
    html,
    /Building A U\.S\. Based Network for Dealer &amp; Tech Communication/,
  );
  assert.match(html, /Member Login/);
  assert.match(html, /Apply to Join/);
  assert.doesNotMatch(html, /Directory Search|Brands Sold|miles away/);
});

test("homepage promo remains inside Small Business Spotlight at a 3:1 desktop share and opens securely", () => {
  const source = readFileSync(
    "components/featured-businesses/HomeBusinessSpotlight.tsx",
    "utf8",
  );
  assert.match(source, /Supporting Small Business Spotlight/);
  assert.match(source, /md:grid-cols-\[minmax\(0,3fr\)_minmax\(14rem,1fr\)\]/);
  assert.match(
    source,
    /A private U\.S\.-based network for robotic mower dealers and repair\s+technicians to connect, find brand support, and share professional\s+resources\./,
  );
  assert.match(source, /Open Dealer &amp; Tech Portal/);
  assert.match(source, /href="\/dealer-tech-resources"[\s\S]{0,100}target="_blank"[\s\S]{0,100}rel="noopener noreferrer"/);
  assert.match(source, /Discover Featured Businesses/);
  assert.equal(
    (source.match(/Dealer &amp; Tech Community Resources/g) ?? []).length,
    1,
  );
});

test("application validation normalizes U.S. identity fields and preserves sold versus serviced brands", () => {
  const parsed = validateDealerApplication(application());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.normalizedPhone, "15735551234");
  assert.equal(parsed.value.normalizedEmail, "alex@example.com");
  assert.equal(parsed.value.normalizedCompanyName, "robot mower pros");
  assert.deepEqual(parsed.value.brandsSold, [brandA]);
  assert.deepEqual(parsed.value.brandsServiced, [brandA, brandB]);
});

test("role-specific applications require the relevant sold and serviced relationships", () => {
  assert.equal(
    validateDealerApplication(
      application({ role: "dealer", brandsSold: [], brandsServiced: [brandA] }),
    ).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(
      application({
        role: "repair_tech",
        brandsSold: [brandA],
        brandsServiced: [],
      }),
    ).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(
      application({ role: "both", brandsSold: [brandA], brandsServiced: [] }),
    ).ok,
    false,
  );
});

test("general and small-engine repair shops see safe YES and NO certification paths", () => {
  const noCertification = validateDealerApplication(
    application({
      role: "repair_tech",
      brandsSold: [],
      businessType: "general_repair_shop",
      certificationAnswer: false,
    }),
  );
  assert.equal(noCertification.ok, true);
  const yesCertification = validateDealerApplication(
    application({
      role: "repair_tech",
      brandsSold: [],
      businessType: "small_engine_repair_shop",
      certificationAnswer: true,
      certifications: [
        {
          certificationName: "Factory Service",
          brandOrManufacturer: "Lymow",
          issuingOrganization: "Manufacturer",
          dateEarned: "2026-01-10",
          expirationDate: "2027-01-10",
        },
      ],
    }),
  );
  assert.equal(yesCertification.ok, true);
  assert.equal(
    validateDealerApplication(
      application({
        role: "repair_tech",
        brandsSold: [],
        businessType: "general_repair_shop",
        certificationAnswer: true,
        certifications: [],
      }),
    ).ok,
    false,
  );
});

test("consent, URL, ZIP, state, phone, email and PIN validation fail closed", () => {
  assert.equal(
    validateDealerApplication(application({ consent: false })).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(
      application({ websiteUrl: "javascript:alert(1)" }),
    ).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(application({ zipCode: "123" })).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(application({ state: "XX" })).ok,
    false,
  );
  assert.equal(normalizeUsPhone("573.555.1234"), "15735551234");
  assert.equal(normalizeUsPhone("111-555-1234"), null);
  assert.equal(normalizeEmail(" USER@Example.COM "), "user@example.com");
  assert.equal(normalizeCompanyName("  ABC—Mowers, LLC "), "abc mowers llc");
  assert.equal(validatePin("123456"), "123456");
  assert.equal(validatePin("12345"), null);
  assert.equal(validatePin("abcdef"), null);
  assert.equal(
    validateDealerApplication(application({ companyName: "---" })).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(application({ addressLine2: "x".repeat(181) }))
      .ok,
    false,
  );
  assert.equal(
    validateDealerApplication(application({ experience: "x".repeat(1001) })).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(application({ brandsSold: ["not-a-uuid"] })).ok,
    false,
  );
  assert.equal(
    validateDealerApplication(
      application({
        businessType: "general_repair_shop",
        certificationAnswer: true,
        certifications: [
          {
            certificationName: "Training",
            brandOrManufacturer: "Lymow",
            issuingOrganization: "IDS",
            dateEarned: "2026-02-30",
            expirationDate: "",
          },
        ],
      }),
    ).ok,
    false,
  );
});

test("members can self-change every supported role without brand fields or approval state", () => {
  const base = {
    memberName: "Alex Technician",
    companyName: "Robot Mower Pros",
    phone: "5735551234",
    email: "alex@example.com",
    addressLine1: "100 Main Street",
    addressLine2: "",
    city: "Sikeston",
    state: "MO",
    zipCode: "63801",
    websiteUrl: "https://example.com",
    experience: "Seven years",
    serviceRegion: "Southeast Missouri",
    introduction: "Professional robotic mower support.",
    currentPin: "",
  };
  for (const role of ["dealer", "repair_tech", "both"] as const) {
    const parsed = validateMemberProfile({ ...base, role });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.role, role);
  }
  const source = readFileSync("lib/dealer-network/member-server.ts", "utf8");
  assert.match(source, /role: value\.role/);
  assert.doesNotMatch(source, /role[^\n]{0,80}approval_status/);
});

const rows: PrivateDirectoryRow[] = [
  {
    id: "member-a",
    memberName: "Alex",
    companyName: "Alpha Mowers",
    phone: "(314) 555-1000",
    email: "a@example.com",
    city: "St. Louis",
    state: "MO",
    zipCode: "63101",
    websiteUrl: null,
    role: "repair_tech",
    experience: "5 years",
    serviceRegion: "Eastern Missouri",
    introduction: "Service",
    logoPath: "members/member-a/logo/private.jpg",
    latitude: 38.627,
    longitude: -90.1994,
    geocodeStatus: "succeeded",
    brands: [
      {
        id: "rel-a",
        brandId: brandA,
        brandName: "Lymow",
        relationshipType: "serviced",
      },
    ],
  },
  {
    id: "member-b",
    memberName: "Blake",
    companyName: "Beta Dealers",
    phone: "(312) 555-2000",
    email: "b@example.com",
    city: "Chicago",
    state: "IL",
    zipCode: "60601",
    websiteUrl: "https://beta.example",
    role: "dealer",
    experience: "8 years",
    serviceRegion: "Northern Illinois",
    introduction: "Sales",
    logoPath: null,
    latitude: 41.8781,
    longitude: -87.6298,
    geocodeStatus: "succeeded",
    brands: [
      {
        id: "rel-b",
        brandId: brandA,
        brandName: "Lymow",
        relationshipType: "sold",
      },
    ],
  },
];

test("near-me uses correct miles, radius filtering, combinations, and nearest-first ordering", () => {
  const distance = haversineMiles(
    { latitude: 38.627, longitude: -90.1994 },
    { latitude: 41.8781, longitude: -87.6298 },
  );
  assert.ok(distance > 250 && distance < 320);
  const origin = { latitude: 38.63, longitude: -90.2 };
  assert.deepEqual(
    filterDirectoryRows(rows, { radiusMiles: 25 }, origin).map(
      (item) => item.row.id,
    ),
    ["member-a"],
  );
  assert.deepEqual(
    filterDirectoryRows(rows, { radiusMiles: 250 }, origin).map(
      (item) => item.row.id,
    ),
    ["member-a"],
  );
  assert.deepEqual(
    filterDirectoryRows(
      rows,
      {
        radiusMiles: 250,
        role: "repair_tech",
        brandId: brandA,
        relationshipType: "serviced",
      },
      origin,
    ).map((item) => item.row.id),
    ["member-a"],
  );
  assert.deepEqual(
    filterDirectoryRows(
      rows,
      { radiusMiles: 250, relationshipType: "sold", brandId: brandA },
      origin,
    ),
    [],
  );
});

test("directory supports name, company, region, ZIP, area code, role and relationship filters", () => {
  assert.equal(
    filterDirectoryRows(rows, { query: "beta" }, null)[0]?.row.id,
    "member-b",
  );
  assert.deepEqual(
    filterDirectoryRows(
      rows,
      {
        region: "missouri",
        zipCode: "631",
        areaCode: "314",
        role: "repair_tech",
      },
      null,
    ).map((item) => item.row.id),
    ["member-a"],
  );
  assert.deepEqual(
    filterDirectoryRows(
      rows,
      { brandId: brandA, relationshipType: "sold" },
      null,
    ).map((item) => item.row.id),
    ["member-b"],
  );
});

test("directory DTO is an explicit allowlist with no raw coordinates or private security fields", () => {
  const result = toDirectoryResult(rows[0], 12.34, "signed-logo-url");
  assert.equal(result.distanceMiles, 12.3);
  const serialized = JSON.stringify(result);
  for (const field of [
    "latitude",
    "longitude",
    "pin",
    "salt",
    "token",
    "admin",
    "addressLine1",
    "logoPath",
  ])
    assert.doesNotMatch(serialized, new RegExp(field, "i"));
  assert.deepEqual(result.brandsServiced, [{ id: brandA, name: "Lymow" }]);
  assert.deepEqual(result.brandsSold, []);
});

test("schema normalizes workflows, relationships, credentials, locations, audit and notifications", () => {
  for (const table of [
    "dealer_network_brands",
    "dealer_network_applications",
    "dealer_network_application_brands",
    "dealer_network_application_certifications",
    "dealer_network_members",
    "dealer_network_member_brands",
    "dealer_network_suggestions",
    "dealer_network_notification_events",
    "dealer_network_status_events",
    "credentials",
    "sessions",
    "activation_tokens",
    "pin_reset_tokens",
    "member_locations",
    "rate_limits",
  ])
    assert.match(
      migration,
      new RegExp(`create table (?:public|dealer_network_private)\\.${table}`),
    );
  assert.match(
    migration,
    /status in \('pending','more_information_requested','approved','denied'\)/,
  );
  assert.match(
    migration,
    /status in \('pending_activation','active','suspended','archived'\)/,
  );
  assert.match(migration, /relationship_type in \('sold','serviced'\)/);
  assert.match(migration, /normalized_phone text not null unique/);
  assert.match(migration, /duplicate_matches jsonb/);
});

test("database boundary enables and forces RLS, revokes browser roles, and keeps private storage private", () => {
  assert.match(
    migration,
    /foreach table_name[\s\S]*enable row level security[\s\S]*force row level security/,
  );
  assert.match(
    migration,
    /revoke all on all tables in schema dealer_network_private from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /revoke all on table public\.%I from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /'dealer-network-private','dealer-network-private',false,8388608/,
  );
  assert.match(migration, /No storage\.objects policies are created/);
  assert.doesNotMatch(
    migration,
    /grant (select|insert|update|delete)[^;]+ to (anon|authenticated)/i,
  );
});

test("PIN, session, activation and reset security use hashes, expiry, one-time use and revocation", () => {
  const security = readFileSync("lib/dealer-network/security.ts", "utf8");
  assert.match(security, /nodeScrypt/);
  assert.match(security, /N: 32768/);
  assert.match(security, /randomBytes\(16\)/);
  assert.match(security, /timingSafeEqual/);
  assert.doesNotMatch(security, /sha256[^\n]+pin/i);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /used_at timestamptz/);
  assert.match(migration, /expires_at<=now\(\)/);
  assert.match(
    migration,
    /sessions set revoked_at=coalesce\(revoked_at,now\(\)\)/,
  );
  assert.doesNotMatch(
    migration,
    /\bpin\s+text|\bactivation_token\s+text|\breset_token\s+text|\bsession_token\s+text/i,
  );
});

test("login is generic, rate-limited, temporarily locked, and uses a distinct secure cookie", () => {
  const auth = readFileSync("lib/dealer-network/member-auth.ts", "utf8");
  const route = readFileSync(
    "app/api/dealer-network/auth/login/route.ts",
    "utf8",
  );
  assert.match(auth, /The phone number or PIN is invalid\./);
  assert.match(auth, /dealer_network_consume_rate_limit/);
  assert.match(migration, /failed_attempts>=5|failures>=5/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(route, /ids_dealer_member|MEMBER_SESSION_COOKIE/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /sameSite: "strict"/);
  assert.doesNotMatch(route, /ids_reviews_admin|ADMIN_COOKIE/);
});

test("locked, suspended and archived states are enforced server-side and excluded from directory", () => {
  const portal = readFileSync(
    "components/dealer-network/MemberPortal.tsx",
    "utf8",
  );
  const auth = readFileSync("lib/dealer-network/member-auth.ts", "utf8");
  assert.match(
    portal,
    /Please Contact IDS About Your Member Details|LOCKED_MEMBER_MESSAGE/,
  );
  assert.match(auth, /status !== "active" \|\| accountLocked/);
  assert.match(
    migration,
    /where m\.status='active' and m\.account_locked=false/,
  );
  for (const route of [
    "profile/route.ts",
    "logo/route.ts",
    "brands/route.ts",
    "directory/route.ts",
    "suggestions/route.ts",
  ])
    assert.match(
      readFileSync(`app/api/dealer-network/member/${route}`, "utf8"),
      /requireActiveUnlockedMember/,
    );
});

test("member ownership comes only from the authenticated session across profile, logo, brands and suggestions", () => {
  for (const route of [
    "profile/route.ts",
    "logo/route.ts",
    "brands/route.ts",
    "suggestions/route.ts",
  ]) {
    const source = readFileSync(
      `app/api/dealer-network/member/${route}`,
      "utf8",
    );
    assert.match(source, /session\.memberId/);
    assert.doesNotMatch(
      source,
      /body\.memberId|searchParams\.get\(["']memberId/,
    );
  }
  const server = readFileSync("lib/dealer-network/member-server.ts", "utf8");
  assert.match(server, /\.eq\("member_id", memberId\)/);
  assert.ok(server.includes("members/${memberId}/logo/"));
});

test("active brand additions are immediate, removals are immediate, and approved brands are searchable", () => {
  const server = readFileSync("lib/dealer-network/member-server.ts", "utf8");
  assert.match(server, /approval_status: "approved"/);
  assert.match(server, /decided_at: new Date\(\)\.toISOString\(\)/);
  assert.match(server, /approval_status: "removed"/);
  assert.match(migration, /mb\.approval_status='approved'/);
  assert.match(migration, /where b\.status='active'/);
});

test("application and decision email state is idempotent, retryable and cannot roll back saved state", () => {
  const route = readFileSync(
    "app/api/dealer-network/applications/route.ts",
    "utf8",
  );
  const notifications = readFileSync(
    "lib/dealer-network/notifications.ts",
    "utf8",
  );
  assert.ok(
    route.indexOf("createDealerApplication") <
      route.indexOf("notifyNewDealerApplication"),
  );
  assert.match(route, /notifyNewDealerApplication\(application\)\.catch/);
  assert.match(migration, /event_key text not null unique/);
  assert.match(migration, /event\.status='failed'/);
  assert.match(
    migration,
    /event\.status='pending' and event\.claimed_at<=now\(\)-interval '10 minutes'/,
  );
  assert.match(notifications, /dealer_network_finish_notification/);
  assert.match(notifications, /sanitizeEmailFailure/);
  assert.doesNotMatch(notifications, /RESEND_API_KEY|service_role/i);
});

test("activation approval never assigns a PIN and token retry preparation happens only after event claim", () => {
  const admin = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
  assert.match(admin, /dealer_network_approve_application/);
  assert.match(admin, /notifyDealerActivation/);
  assert.ok(
    admin.indexOf(
      'deliverDealerNotification({ eventKey: event.event_key, eventType: "applicant_activation"',
    ) < admin.indexOf("dealer_network_replace_activation_token"),
  );
  assert.match(migration, /status='pending_activation'/);
  assert.match(migration, /dealer_network_activate_member/);
  assert.match(migration, /pin_hash=p_pin_hash,pin_salt=p_pin_salt/);
});

test("forgot PIN is non-enumerating and reset revokes existing sessions", () => {
  const forgot = readFileSync(
    "app/api/dealer-network/auth/forgot-pin/route.ts",
    "utf8",
  );
  assert.match(forgot, /Always return the same non-enumerating response/);
  assert.match(forgot, /If the information matches an eligible member account/);
  assert.match(migration, /c\.email_verified_at is not null/);
  assert.match(migration, /pin_reset_tokens set used_at=now\(\)/);
  assert.match(
    migration,
    /sessions set revoked_at=coalesce\(revoked_at,now\(\)\)/,
  );
});

test("certification documents and logos have scoped private paths, allowlists and server-only upload", () => {
  const applications = readFileSync(
    "lib/dealer-network/applications-server.ts",
    "utf8",
  );
  const members = readFileSync("lib/dealer-network/member-server.ts", "utf8");
  assert.ok(
    applications.includes("applications/${applicationId}/certifications/"),
  );
  assert.match(applications, /application\/pdf/);
  assert.ok(members.includes("members/${memberId}/logo/"));
  assert.match(members, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
  assert.match(members, /createSignedUrl/);
  assert.doesNotMatch(
    readFileSync("lib/dealer-network/directory.ts", "utf8"),
    /evidence|certification/i,
  );
});

test("private uploads verify file signatures instead of trusting browser MIME labels", async () => {
  const png = new File(
    [
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
      ]),
    ],
    "logo.png",
    { type: "image/png" },
  );
  const disguised = new File(["<script>alert(1)</script>"], "logo.png", {
    type: "image/png",
  });
  const pdf = new File(["%PDF-1.7\n"], "training.pdf", {
    type: "application/pdf",
  });
  assert.equal(await hasExpectedFileSignature(png), true);
  assert.equal(await hasExpectedFileSignature(pdf), true);
  assert.equal(await hasExpectedFileSignature(disguised), false);
});

test("geocoding is isolated server-side, supports retry/failure, and never returns raw points", () => {
  const geocodingAdapter = readFileSync(
    "lib/dealer-network/geocoding-adapter.ts",
    "utf8",
  );
  const geocoding = readFileSync("lib/dealer-network/geocoding.ts", "utf8");
  const memberRoute = readFileSync(
    "app/api/admin/dealer-network/members/[id]/route.ts",
    "utf8",
  );
  assert.match(geocodingAdapter, /GOOGLE_MAPS_GEOCODING_API_KEY/);
  assert.match(
    geocodingAdapter,
    /maps\.googleapis\.com\/maps\/api\/geocode\/json/,
  );
  assert.match(geocoding, /p_status: point \? "succeeded" : "failed"/);
  assert.match(memberRoute, /retry_geocode/);
  const directoryRoute = readFileSync(
    "app/api/dealer-network/member/directory/route.ts",
    "utf8",
  );
  assert.doesNotMatch(
    directoryRoute,
    /return[^\n]+latitude|Response\.json\([^\n]+longitude/i,
  );
});

test("admin member correction remounts by selection and rejects stale source data", async () => {
  const adminUi = readFileSync(
    "components/dealer-network/DealerNetworkAdmin.tsx",
    "utf8",
  );
  const profileForm = adminUi.slice(
    adminUi.indexOf("<form\n          key={selected.id}"),
    adminUi.indexOf("<h3 className=\"text-xl font-black\">Brand Affiliations"),
  );
  assert.match(profileForm, /key=\{selected\.id\}/);
  assert.match(profileForm, /name="profileSourceMemberId"/);
  assert.match(profileForm, /value=\{selected\.id\}/);

  let updates = 0;
  const update = async (memberId: string, profile: unknown) => {
    updates += 1;
    return { ok: true as const, memberId, profile };
  };
  const stale = await applyConsistentAdminProfileUpdate(
    "member-b",
    "member-a",
    { memberName: "Member A" },
    update,
  );
  assert.deepEqual(stale, { stale: true });
  assert.equal(updates, 0);

  const current = await applyConsistentAdminProfileUpdate(
    "member-b",
    "member-b",
    { memberName: "Member B" },
    update,
  );
  assert.equal(current.stale, false);
  assert.equal(updates, 1);
  if (!current.stale) {
    assert.equal(current.result.memberId, "member-b");
    assert.deepEqual(current.result.profile, { memberName: "Member B" });
  }

  const route = readFileSync(
    "app/api/admin/dealer-network/members/[id]/route.ts",
    "utf8",
  );
  assert.match(route, /update\.stale[\s\S]*?status: 409/);
  assert.match(route, /Member selection changed\. Reload the profile before saving\./);
});

test("business-location search repairs missing coordinates but reuses valid stored points", async () => {
  let repairs = 0;
  const stored = await resolveBusinessDirectoryOrigin(
    { latitude: 38.2, longitude: -90 },
    async () => {
      repairs += 1;
      return { latitude: 1, longitude: 2 };
    },
  );
  assert.deepEqual(stored, { latitude: 38.2, longitude: -90 });
  assert.equal(repairs, 0);
  const repaired = await resolveBusinessDirectoryOrigin(undefined, async () => {
    repairs += 1;
    return { latitude: 38.3, longitude: -89.9 };
  });
  assert.deepEqual(repaired, { latitude: 38.3, longitude: -89.9 });
  assert.equal(repairs, 1);
});

test("browser geolocation failures have distinct actionable messages", () => {
  const denied = browserGeolocationErrorMessage(1);
  const unavailable = browserGeolocationErrorMessage(2);
  const timeout = browserGeolocationErrorMessage(3);
  assert.match(denied, /blocked or denied.*Enable location permission/i);
  assert.match(unavailable, /could not determine.*ZIP or business/i);
  assert.match(timeout, /timed out.*Try again/i);
  assert.equal(new Set([denied, unavailable, timeout]).size, 3);
});

test("approval and directory UI keep geocoding best-effort and clear busy state", () => {
  const admin = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
  const memberServer = readFileSync("lib/dealer-network/member-server.ts", "utf8");
  const memberUi = readFileSync("components/dealer-network/MemberPortal.tsx", "utf8");
  const approval = admin.slice(
    admin.indexOf("export async function approveDealerApplication"),
    admin.indexOf("export async function transitionDealerApplication"),
  );
  assert.match(approval, /refreshStoredMemberGeocode\(outcome\.memberId\)\.catch/);
  assert.match(memberServer, /resolveBusinessDirectoryOrigin[\s\S]*?refreshStoredMemberGeocode/);
  assert.match(memberUi, /params\.set\("latitude", String\(coordinates\.latitude\)\)/);
  assert.match(memberUi, /params\.set\("longitude", String\(coordinates\.longitude\)\)/);
  assert.match(memberUi, /finally\s*\{[\s\S]*?setSearching\(false\)/);
  assert.match(memberUi, /browserGeolocationErrorMessage\(error\.code\)[\s\S]*?setSearching\(false\)/);
});

test("geocoding adapter uses mocked provider responses and fails safely without real network calls", async () => {
  const calls: URL[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    calls.push(new URL(String(input)));
    return new Response(
      JSON.stringify({
        status: "OK",
        results: [{ geometry: { location: { lat: 38.2081, lng: -89.994 } } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  assert.deepEqual(
    await geocodeUsLocation("100 Main St, Red Bud, IL", fetcher, "test-key"),
    { latitude: 38.2081, longitude: -89.994 },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("components"), "country:US");
  assert.equal(calls[0].searchParams.get("key"), "test-key");
  const noResult = (async () =>
    new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
      status: 200,
    })) as typeof fetch;
  assert.equal(await geocodeUsLocation("00000", noResult, "test-key"), null);
  const unavailable = (async () =>
    new Response("unavailable", { status: 503 })) as typeof fetch;
  await assert.rejects(
    () => geocodeUsLocation("63101", unavailable, "test-key"),
    /GEOCODER_UNAVAILABLE/,
  );
  await assert.rejects(
    () => geocodeUsLocation("63101", fetcher, ""),
    /GEOCODER_NOT_CONFIGURED/,
  );
});

test("suggestions are member-owned and admin workflows reuse existing IDS authentication", () => {
  const memberServer = readFileSync(
    "lib/dealer-network/member-server.ts",
    "utf8",
  );
  assert.match(memberServer, /company_name_snapshot: member\.company_name/);
  assert.match(memberServer, /\.eq\("member_id", memberId\)/);
  const adminRoutes = [
    "route.ts",
    "applications/[id]/route.ts",
    "brands/route.ts",
    "brands/[id]/route.ts",
    "brand-requests/[id]/route.ts",
    "members/[id]/route.ts",
    "notifications/[id]/retry/route.ts",
    "suggestions/[id]/route.ts",
  ];
  for (const route of adminRoutes)
    assert.match(
      readFileSync(`app/api/admin/dealer-network/${route}`, "utf8"),
      /requireDealerNetworkAdmin/,
    );
  assert.match(
    readFileSync("lib/dealer-network/admin-auth.ts", "utf8"),
    /isReviewAdmin/,
  );
});

test("suggestion Reviewed and Resolved emails use the current member address and fire only on transitions", async () => {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const sender = async (message: (typeof sent)[number]) => sent.push(message);
  await sendSuggestionStatusEmail(
    {
      memberName: "Member",
      memberEmail: "current@example.com",
      status: "reviewed",
    },
    sender,
  );
  await sendSuggestionStatusEmail(
    {
      memberName: "Member",
      memberEmail: "current@example.com",
      status: "resolved",
    },
    sender,
  );
  assert.deepEqual(
    sent.map((message) => message.subject),
    [
      "Your IDS Dealer Network Suggestion Has Been Reviewed",
      "Your IDS Dealer Network Suggestion Has Been Resolved",
    ],
  );
  assert.ok(sent.every((message) => message.to === "current@example.com"));
  assert.ok(
    sent.every((message) =>
      message.text.includes("helping improve the IDS Dealer & Tech Network"),
    ),
  );

  const admin = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
  assert.match(admin, /\.neq\("status", status\)[\s\S]*?\.select\("member_id"\)/);
  assert.match(
    admin,
    /from\("dealer_network_members"\)[\s\S]*?\.select\("member_name,email"\)/,
  );
  assert.match(admin, /if \(!suggestion \|\| status === "new"\) return/);
  const updateSuggestion =
    admin.match(
      /export async function updateSuggestionStatus[\s\S]*?\n}/,
    )?.[0] ?? "";
  assert.ok(
    updateSuggestion.indexOf("if (error) throw error") <
      updateSuggestion.indexOf("await notifySuggestionStatus"),
  );
  assert.match(admin, /Suggestion status email failed after status update/);
  assert.match(admin, /sanitizeEmailFailure\(error\)/);
});

test("Dealer Network feature adds no payment, checkout, pricing, demo or Aftermarket integration", () => {
  const featureSources = [
    "lib/dealer-network/types.ts",
    "lib/dealer-network/member-server.ts",
    "lib/dealer-network/admin-server.ts",
    "components/dealer-network/MemberPortal.tsx",
    "components/dealer-network/DealerNetworkAdmin.tsx",
    migrationPath,
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(
    featureSources,
    /stripe|checkout|subscription|billing|dealer_cost|temporary_sale|demo_scheduling|aftermarket/i,
  );
});
