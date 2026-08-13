import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DemoSchedulingAdminRequestState,
  demoCalendarOccupancyCount,
  mergeRefreshedDemoRequests,
  reconcileSelectedDemoRequest,
  requestMatchesDemoFilter,
  selectDemoRequestForCalendarDate,
} from "../lib/demo-scheduling/admin-state";
import { generateAvailableSlots } from "../lib/demo-scheduling/availability";
import { demoRequestFingerprint } from "../lib/demo-scheduling/client";
import { createDemoIcs } from "../lib/demo-scheduling/ics";
import { centralLocalToUtc, slotFromLocal } from "../lib/demo-scheduling/time";
import { DEMO_EQUIPMENT_INTERESTS, DEMO_SOURCES, type DemoRequest } from "../lib/demo-scheduling/types";
import { validateDemoRequest } from "../lib/demo-scheduling/validation";
import { sanitizeEmailFailure } from "../lib/email-diagnostics";

const source = (path: string) => readFileSync(path, "utf8");
const oldMigration = source("supabase/migrations/20260812210000_create_demo_scheduling.sql");
const newMigration = source("supabase/migrations/20260813000000_expand_demo_scheduling_sources_and_equipment.sql");
const equipment = source("components/equipment/EquipmentCatalog.tsx");
const homepage = source("app/page.tsx");
const mobileHome = source("components/mobile/MobileHomepage.tsx");
const mobileNavigation = source("components/mobile/MobileHomeNavigation.tsx");
const contact = source("components/contact/HomepageContactSection.tsx");
const priceMatch = source("components/promotions/HomePriceMatch.tsx");
const action = source("components/ids-action/IdsActionCarousel.tsx");
const gallery = source("components/ids-action/IdsActionGallery.tsx");
const modal = source("components/demo-scheduling/ScheduleDemoModal.tsx");
const server = source("lib/demo-scheduling/server.ts");
const notifications = source("lib/demo-scheduling/notifications.ts");
const emailSource = source("lib/email.ts");
const admin = source("app/admin/demo-scheduling/page.tsx");

const valid = {
  name: "A Customer",
  email: "a@example.com",
  phone: "555-555-1212",
  propertyAddress: "1 Main St",
  requestedStartAt: "2026-08-20T15:00:00Z",
  source: "featured_machines",
  equipmentInterest: "Lymow One Plus",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  company: "",
};

const adminNow = Date.parse("2026-08-20T18:00:00.000Z");
const adminRequest = (
  status: DemoRequest["status"],
  id: string,
  requestedEndAt = "2026-08-20T20:00:00.000Z",
): DemoRequest => ({
  id,
  customerName: `${status} customer`,
  customerEmail: `${status}@example.com`,
  customerPhone: "555-555-1212",
  propertyAddress: "1 Main St",
  requestedStartAt: "2026-08-20T19:00:00.000Z",
  requestedEndAt,
  status,
  source: "featured_machines",
  equipmentInterest: "Lymow One Plus",
  adminMessage: null,
  createdAt: "2026-08-19T12:00:00.000Z",
  approvedAt: status === "approved" ? "2026-08-19T13:00:00.000Z" : null,
  deniedAt: status === "denied" ? "2026-08-19T13:00:00.000Z" : null,
  cancelledAt: status === "cancelled" ? "2026-08-19T13:00:00.000Z" : null,
});

test("Pending filter excludes denied requests and clears a denied selection", () => {
  const denied = adminRequest("denied", "denied");
  assert.equal(requestMatchesDemoFilter(denied, "pending", adminNow), false);
  assert.equal(reconcileSelectedDemoRequest(denied, "pending", adminNow), null);
});

test("Denied, Approved, and All filters return their intended requests", () => {
  const requests = [
    adminRequest("pending", "pending"),
    adminRequest("approved", "approved"),
    adminRequest("denied", "denied"),
    adminRequest("cancelled", "cancelled"),
  ];
  const idsFor = (filter: "denied" | "approved" | "all") => requests.filter((item) => requestMatchesDemoFilter(item, filter, adminNow)).map((item) => item.id);

  assert.deepEqual(idsFor("denied"), ["denied"]);
  assert.deepEqual(idsFor("approved"), ["approved"]);
  assert.deepEqual(idsFor("all"), ["pending", "approved", "denied", "cancelled"]);
});

test("Active contains pending and future approved requests only", () => {
  const requests = [
    adminRequest("pending", "pending"),
    adminRequest("approved", "future-approved"),
    adminRequest("approved", "past-approved", "2026-08-20T17:00:00.000Z"),
    adminRequest("denied", "future-denied"),
    adminRequest("cancelled", "future-cancelled"),
  ];

  assert.deepEqual(
    requests.filter((item) => requestMatchesDemoFilter(item, "active", adminNow)).map((item) => item.id),
    ["pending", "future-approved"],
  );
});

test("Past contains requests whose appointments have ended", () => {
  const requests = [
    adminRequest("approved", "past-approved", "2026-08-20T17:00:00.000Z"),
    adminRequest("denied", "past-denied", "2026-08-20T17:00:00.000Z"),
    adminRequest("approved", "future-approved"),
  ];

  assert.deepEqual(
    requests.filter((item) => requestMatchesDemoFilter(item, "past", adminNow)).map((item) => item.id),
    ["past-approved", "past-denied"],
  );
});

test("changing between Denied and Pending clears incompatible selections", () => {
  assert.equal(reconcileSelectedDemoRequest(adminRequest("denied", "denied"), "pending", adminNow), null);
  assert.equal(reconcileSelectedDemoRequest(adminRequest("pending", "pending"), "denied", adminNow), null);
});

test("status transitions immediately reconcile the detail and filtered list", () => {
  const pending = adminRequest("pending", "transitioning");
  const denied: DemoRequest = { ...pending, status: "denied", deniedAt: "2026-08-20T18:05:00.000Z" };
  const approved: DemoRequest = { ...pending, status: "approved", approvedAt: "2026-08-20T18:05:00.000Z" };
  const cancelled: DemoRequest = { ...approved, status: "cancelled", cancelledAt: "2026-08-20T18:10:00.000Z" };

  assert.equal(reconcileSelectedDemoRequest(denied, "pending", adminNow), null);
  assert.equal(requestMatchesDemoFilter(denied, "pending", adminNow), false);
  assert.equal(requestMatchesDemoFilter(denied, "denied", adminNow), true);
  assert.equal(reconcileSelectedDemoRequest(approved, "pending", adminNow), null);
  assert.equal(requestMatchesDemoFilter(approved, "approved", adminNow), true);
  assert.equal(reconcileSelectedDemoRequest(cancelled, "active", adminNow), null);
  assert.equal(requestMatchesDemoFilter(cancelled, "all", adminNow), true);
});

test("calendar occupancy counts pending and approved but excludes denied and cancelled", () => {
  const pending = adminRequest("pending", "pending");
  const approved = adminRequest("approved", "approved");
  const denied = adminRequest("denied", "denied");
  const cancelled = adminRequest("cancelled", "cancelled");

  assert.equal(demoCalendarOccupancyCount([pending]), 1);
  assert.equal(demoCalendarOccupancyCount([approved]), 1);
  assert.equal(demoCalendarOccupancyCount([denied]), 0);
  assert.equal(demoCalendarOccupancyCount([cancelled]), 0);
  assert.equal(demoCalendarOccupancyCount([pending, approved, denied, cancelled]), 2);
});

test("calendar date selection cannot return a request incompatible with the active filter", () => {
  const pending = adminRequest("pending", "pending");
  const approved = adminRequest("approved", "approved");
  const denied = adminRequest("denied", "denied");
  const rows = [denied, approved, pending];

  assert.equal(selectDemoRequestForCalendarDate([denied], "pending", adminNow), null);
  assert.equal(selectDemoRequestForCalendarDate(rows, "pending", adminNow)?.id, "pending");
  assert.equal(selectDemoRequestForCalendarDate(rows, "approved", adminNow)?.id, "approved");
  assert.equal(selectDemoRequestForCalendarDate(rows, "denied", adminNow)?.id, "denied");
  assert.equal(selectDemoRequestForCalendarDate(rows, "active", adminNow)?.id, "approved");
});

test("admin filtering and calendar helpers never mutate request records", () => {
  const requests = [adminRequest("pending", "pending"), adminRequest("denied", "denied")];
  const before = structuredClone(requests);

  requests.filter((item) => requestMatchesDemoFilter(item, "pending", adminNow));
  demoCalendarOccupancyCount(requests);
  selectDemoRequestForCalendarDate(requests, "pending", adminNow);
  reconcileSelectedDemoRequest(requests[1], "pending", adminNow);

  assert.deepEqual(requests, before);
});

test("approval component state resists a stale follow-up GET with failed notifications", async () => {
  const pending = adminRequest("pending", "approval-race");
  const approved: DemoRequest = {
    ...pending,
    status: "approved",
    approvedAt: "2026-08-20T18:05:00.000Z",
  };
  const failedNotifications = [
    { event_type: "customer_approved", status: "failed", last_error: "Resend domain not verified (validation_error, HTTP 403)" },
    { event_type: "ids_calendar_invite", status: "failed", last_error: "Resend domain not verified (validation_error, HTTP 403)" },
  ];
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "PATCH") {
      assert.deepEqual(JSON.parse(String(init?.body)), { action: "approve", message: null });
      return Response.json({
        request: approved,
        warning: "Appointment approved, but one or more emails could not be delivered. Retry from this page.",
      });
    }
    return Response.json({
      requests: [pending, pending],
      rules: [],
      exceptions: [],
      notifications: { [pending.id]: failedNotifications },
    });
  };

  const requestState = new DemoSchedulingAdminRequestState([pending]);
  let requests = requestState.applyRefresh([pending]);
  let filter: "pending" | "approved" | "active" | "all" | "denied" = "pending";
  let selected: DemoRequest | null = pending;
  let notifications: Record<string, typeof failedNotifications> = {};

  const patchResponse = await fetchMock(`/api/admin/demo-scheduling/requests/${pending.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", message: null }),
  });
  const patchPayload = await patchResponse.json() as { request: DemoRequest; warning: string };
  requests = requestState.applyTransition(patchPayload.request);
  selected = reconcileSelectedDemoRequest(patchPayload.request, filter, adminNow);

  const reloadResponse = await fetchMock("/api/admin/demo-scheduling");
  const reloadPayload = await reloadResponse.json() as { requests: DemoRequest[]; notifications: Record<string, typeof failedNotifications> };
  requests = requestState.applyRefresh(reloadPayload.requests);
  notifications = reloadPayload.notifications;
  if (selected) {
    const refreshedSelection = requests.find((request) => request.id === selected?.id) ?? null;
    selected = reconcileSelectedDemoRequest(refreshedSelection, filter, adminNow);
  }

  const openFilter = (next: "pending" | "approved" | "active" | "all" | "denied") => {
    filter = next;
    selected = reconcileSelectedDemoRequest(selected, next, adminNow);
    return requests.filter((request) => requestMatchesDemoFilter(request, next, adminNow));
  };

  assert.deepEqual(calls, [
    { url: `/api/admin/demo-scheduling/requests/${pending.id}`, method: "PATCH" },
    { url: "/api/admin/demo-scheduling", method: "GET" },
  ]);
  assert.deepEqual(openFilter("pending"), []);
  assert.equal(selected, null);
  assert.deepEqual(openFilter("approved").map((request) => request.status), ["approved"]);
  assert.deepEqual(openFilter("active").map((request) => request.status), ["approved"]);
  assert.deepEqual(openFilter("all").map((request) => request.status), ["approved"]);
  assert.deepEqual(openFilter("denied"), []);
  assert.equal(requests.filter((request) => request.id === pending.id).length, 1);
  assert.equal(demoCalendarOccupancyCount(requests), 1);
  assert.equal(notifications[pending.id].every((event) => event.status === "failed"), true);
  assert.match(patchPayload.warning, /approved.*emails could not be delivered/i);
});

test("stale refreshes cannot regress denied or cancelled component state", () => {
  const pending = adminRequest("pending", "denial-race");
  const denied: DemoRequest = { ...pending, status: "denied", deniedAt: "2026-08-20T18:05:00.000Z" };
  const approved = adminRequest("approved", "cancellation-race");
  const cancelled: DemoRequest = { ...approved, status: "cancelled", cancelledAt: "2026-08-20T18:10:00.000Z" };
  const state = new DemoSchedulingAdminRequestState([pending, approved]);

  state.applyTransition(denied);
  state.applyTransition(cancelled);
  const requests = state.applyRefresh([pending, pending, approved, approved]);

  assert.deepEqual(requests.map((request) => [request.id, request.status]), [
    [pending.id, "denied"],
    [approved.id, "cancelled"],
  ]);
  assert.deepEqual(requests.filter((request) => requestMatchesDemoFilter(request, "pending", adminNow)), []);
  assert.deepEqual(requests.filter((request) => requestMatchesDemoFilter(request, "approved", adminNow)), []);
  assert.deepEqual(requests.filter((request) => requestMatchesDemoFilter(request, "active", adminNow)), []);
  assert.deepEqual(requests.filter((request) => requestMatchesDemoFilter(request, "denied", adminNow)).map((request) => request.id), [pending.id]);
  assert.equal(demoCalendarOccupancyCount(requests), 0);
});

test("refresh merge accepts forward server transitions and rejects status regressions", () => {
  const pending = adminRequest("pending", "forward");
  const approved: DemoRequest = { ...pending, status: "approved", approvedAt: "2026-08-20T18:05:00.000Z" };
  const cancelled: DemoRequest = { ...approved, status: "cancelled", cancelledAt: "2026-08-20T18:10:00.000Z" };

  assert.equal(mergeRefreshedDemoRequests([pending], [approved])[0].status, "approved");
  assert.equal(mergeRefreshedDemoRequests([approved], [cancelled])[0].status, "cancelled");
  assert.equal(mergeRefreshedDemoRequests([approved], [pending])[0].status, "approved");
  assert.equal(mergeRefreshedDemoRequests([cancelled], [approved])[0].status, "cancelled");
});

test("public and legacy source values are controlled exactly", () => {
  assert.deepEqual(DEMO_SOURCES, ["featured_lymow", "featured_yarbo", "featured_machines", "contact_ids", "meet_or_beat", "ids_in_action"]);
});

test("machine interest values are controlled exactly", () => {
  assert.deepEqual(DEMO_EQUIPMENT_INTERESTS, ["Lymow One Plus", "Yarbo Core", "Help Me Decide"]);
});

test("new public sources and existing shared sources validate", () => {
  for (const requestSource of ["featured_machines", "contact_ids", "meet_or_beat", "ids_in_action"]) {
    assert.equal(validateDemoRequest({ ...valid, source: requestSource }).ok, true, requestSource);
  }
});

test("legacy sources remain valid and no longer dictate machine interest", () => {
  assert.equal(validateDemoRequest({ ...valid, source: "featured_lymow", equipmentInterest: "Yarbo Core" }).ok, true);
  assert.equal(validateDemoRequest({ ...valid, source: "featured_yarbo", equipmentInterest: "Help Me Decide" }).ok, true);
});

test("new requests require a valid machine interest", () => {
  assert.equal(validateDemoRequest({ ...valid, equipmentInterest: undefined }).ok, false);
  assert.equal(validateDemoRequest({ ...valid, equipmentInterest: null }).ok, false);
  assert.equal(validateDemoRequest({ ...valid, equipmentInterest: "Pandag G1" }).ok, false);
  assert.equal(validateDemoRequest({ ...valid, equipmentInterest: "" }).ok, false);
});

test("honeypot and unknown sources remain rejected", () => {
  assert.equal(validateDemoRequest({ ...valid, source: "pandag" }).ok, false);
  assert.equal(validateDemoRequest({ ...valid, company: "spam" }).ok, false);
});

test("scheduler mounts its overlay in a body-level React portal", () => {
  assert.match(modal, /import \{ createPortal \} from "react-dom"/);
  assert.match(modal, /createPortal\(overlay, document\.body\)/);
  assert.match(modal, /open && typeof document !== "undefined"/);
  assert.match(modal, /data-demo-scheduling-portal="body"/);
});

test("portal dialog remains viewport-safe and scrolls internally", () => {
  assert.match(modal, /fixed inset-0/);
  assert.match(modal, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(modal, /overflow-y-auto overflow-x-hidden overscroll-contain/);
  assert.match(modal, /sticky top-0/);
});

test("dialog keeps Escape, backdrop, focus trap, focus return, and body scroll restoration", () => {
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(modal, /origin\?\.focus\(\)/);
  assert.match(modal, /event\.key !== "Tab"/);
});

test("machine question is an accessible required radio group", () => {
  assert.match(modal, /<fieldset>/);
  assert.match(modal, /Which machine would you like to see\?/);
  assert.match(modal, /type="radio" name="equipmentInterest" value=\{option\} required/);
  assert.match(modal, /DEMO_EQUIPMENT_INTERESTS\.map/);
});

test("shared dialog still captures required customer fields and pending copy", () => {
  for (const name of ["name", "email", "phone", "propertyAddress"]) assert.match(modal, new RegExp(`name="${name}"`));
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /not confirmed until IDS approves/);
  assert.match(modal, /Central Time/);
});

test("Featured Machines desktop has one section-level scheduler", () => {
  assert.equal((homepage.match(/<ScheduleDemoModal source="featured_machines"/g) ?? []).length, 1);
  assert.ok(homepage.indexOf("Featured Machines") < homepage.indexOf('<ScheduleDemoModal source="featured_machines"'));
});

test("machine cards contain no scheduler triggers", () => {
  assert.doesNotMatch(equipment, /ScheduleDemoModal|featured_lymow|featured_yarbo/);
});

test("Pandag, quote flow, Accessories, and Aftermarket receive no demo trigger", () => {
  assert.doesNotMatch(source("app/pandag/project-quote/page.tsx"), /ScheduleDemo/);
  assert.doesNotMatch(source("components/equipment/AccessoryCatalog.tsx"), /ScheduleDemo/);
  assert.doesNotMatch(equipment, /ScheduleDemo/);
});

test("mobile machines view has one scheduler above its cards", () => {
  assert.equal((mobileHome.match(/<ScheduleDemoModal source="featured_machines"/g) ?? []).length, 1);
  const cta = mobileHome.indexOf('<ScheduleDemoModal source="featured_machines"');
  const cards = mobileHome.indexOf("<EquipmentCatalog />", cta);
  assert.ok(cta > mobileHome.indexOf("Featured Machines") && cards > cta);
});

test("Contact IDS reuses Contact Us and a contact_ids scheduler on desktop and mobile", () => {
  assert.match(contact, /ContactInformationModal/);
  assert.match(contact, /ScheduleDemoModal source="contact_ids"/);
  assert.match(contact, /flex flex-col gap-3 sm:flex-row/);
  assert.match(mobileHome, /view === "contact" && <HomepageContactSection \/>/);
});

test("Meet or Beat retains Contact Us and scheduling", () => {
  assert.match(priceMatch, /ContactInformationModal[\s\S]*ScheduleDemoModal source="meet_or_beat"/);
});

test("IDS Action carousel fetches featured entries on every viewport", () => {
  assert.match(action, /\/api\/ids-in-action\?featured=true&limit=8/);
  assert.doesNotMatch(action, /matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(action, /const entry = entries\[index\]/);
});

test("IDS Action featured experience includes View All and Schedule a Demo", () => {
  assert.match(action, /VIEW ALL IDS IN ACTION/);
  assert.match(action, /href="\/ids-in-action"/);
  assert.match(action, /ScheduleDemoModal source="ids_in_action"/);
  assert.match(action, /prefers-reduced-motion: reduce/);
});

test("mobile IDS IN ACTION is an internal featured view, not a direct gallery link", () => {
  assert.match(mobileNavigation, /"ids-action"/);
  assert.match(mobileNavigation, /label: "IDS IN ACTION", view: "ids-action"/);
  assert.doesNotMatch(mobileNavigation, /href="\/ids-in-action"[^>]*>IDS IN ACTION/);
  assert.match(mobileHome, /view === "ids-action" && <IdsActionCarousel \/>/);
});

test("standalone IDS Action gallery remains the unfeatured full gallery", () => {
  assert.match(gallery, /\/api\/ids-in-action\?limit=24&category=/);
  assert.doesNotMatch(gallery, /featured=true/);
  assert.match(source("app/ids-in-action/page.tsx"), /<IdsActionGallery\/>/);
});

const fingerprintBase = {
  name: " A Customer ",
  email: "A@EXAMPLE.COM ",
  phone: " 555-555-1212 ",
  propertyAddress: " 1 Main St ",
  requestedStartAt: "2026-08-20T15:00:00Z",
  source: "featured_machines" as const,
  equipmentInterest: "Lymow One Plus" as const,
};

test("canonical payload fingerprint is stable for an exact logical retry", () => {
  assert.equal(demoRequestFingerprint(fingerprintBase), demoRequestFingerprint({ ...fingerprintBase, name: "A Customer", email: "a@example.com", phone: "555-555-1212", propertyAddress: "1 Main St" }));
});

test("canonical payload fingerprint changes for every material field", () => {
  const original = demoRequestFingerprint(fingerprintBase);
  const changes = [
    { name: "Different Customer" }, { email: "other@example.com" }, { phone: "555-555-9999" },
    { propertyAddress: "2 Main St" }, { requestedStartAt: "2026-08-20T16:00:00Z" },
    { source: "contact_ids" as const }, { equipmentInterest: "Yarbo Core" as const },
    { equipmentInterest: "Help Me Decide" as const },
  ];
  for (const change of changes) assert.notEqual(demoRequestFingerprint({ ...fingerprintBase, ...change }), original);
});

test("modal reuses keys only for the same canonical fingerprint", () => {
  assert.match(modal, /attemptedFingerprint\.current !== fingerprint/);
  assert.match(modal, /attemptedFingerprint\.current = fingerprint/);
  assert.equal((modal.match(/crypto\.randomUUID\(\)/g) ?? []).length, 1);
});

test("database idempotency mismatch protection remains authoritative", () => {
  assert.match(oldMigration, /raise exception 'idempotency_conflict'/);
  for (const field of ["customer_phone", "property_address", "requested_start_at", "requested_end_at", "source", "equipment_interest"]) assert.match(oldMigration, new RegExp(`v_existing\\.${field} is distinct from`));
  assert.match(oldMigration, /lower\(v_existing\.customer_email\) is distinct from lower\(p_email\)/);
  assert.match(source("app/api/demo-scheduling/requests/route.ts"), /idempotency_conflict/);
});

test("new migration expands source and equipment constraints only", () => {
  for (const value of DEMO_SOURCES) assert.match(newMigration, new RegExp(`'${value}'`));
  for (const value of DEMO_EQUIPMENT_INTERESTS) assert.match(newMigration, new RegExp(`'${value}'`));
  assert.match(newMigration, /drop constraint demo_requests_source_check/);
  assert.match(newMigration, /drop constraint demo_requests_equipment_interest_check/);
  assert.doesNotMatch(newMigration, /drop table|delete from|truncate|update public\.demo_requests/i);
});

test("historical NULL equipment interest remains database-compatible", () => {
  assert.match(newMigration, /equipment_interest is null/);
});

test("the applied migration remains unchanged and the expansion is separate", () => {
  assert.match(oldMigration, /source in \('featured_lymow','featured_yarbo','meet_or_beat','ids_in_action'\)/);
  assert.match(oldMigration, /equipment_interest is null or equipment_interest in \('Lymow One Plus','Yarbo Core'\)/);
  assert.doesNotMatch(oldMigration, /featured_machines|contact_ids|Help Me Decide/);
  assert.match(newMigration, /^begin;[\s\S]*commit;\s*$/);
});

test("PII tables keep RLS and public availability remains slots-only", () => {
  for (const table of ["demo_requests", "demo_availability_rules", "demo_availability_exceptions", "demo_settings", "demo_notification_events"]) assert.match(oldMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  const availabilityRoute = source("app/api/demo-scheduling/availability/route.ts");
  assert.match(availabilityRoute, /slots:await getAvailableSlots/);
  assert.doesNotMatch(availabilityRoute, /customer_name|customer_email|property_address/);
});

test("pending and approved requests still occupy slots", () => {
  assert.match(server, /\.in\("status",\["pending","approved"\]\)/);
  assert.doesNotMatch(server, /"denied"/);
});

test("database overlap and exact slot-boundary protections remain", () => {
  assert.match(oldMigration, /exclude using gist[\s\S]*status in \('pending','approved'\)/);
  assert.match(oldMigration, /exception when exclusion_violation then raise exception 'slot_conflict'/);
  assert.match(oldMigration, /v_local<>date_trunc\('minute',v_local\)/);
  assert.match(oldMigration, /mod\(extract\(epoch from \(v_local::time-v_rule\.start_time\)\)::bigint,v_settings\.duration_minutes\*60\)<>0/);
});

test("approval, denial, cancellation, and sent-notification idempotency remain database-controlled", () => {
  for (const token of ["p_action='approve'", "p_action='deny'", "p_action='cancel'", "if e.status='sent'"]) assert.match(oldMigration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(oldMigration, /unique\(request_id,event_type\)/);
});

test("Central conversion remains DST safe", () => {
  assert.equal(centralLocalToUtc("2026-01-15", "09:00")?.toISOString(), "2026-01-15T15:00:00.000Z");
  assert.equal(centralLocalToUtc("2026-07-15", "09:00")?.toISOString(), "2026-07-15T14:00:00.000Z");
  assert.equal(centralLocalToUtc("2026-03-08", "02:30"), null);
});

test("availability removes blackouts and occupied ranges", () => {
  const first = slotFromLocal("2026-08-17", "09:00")!;
  const second = slotFromLocal("2026-08-17", "10:00")!;
  const third = slotFromLocal("2026-08-17", "11:00")!;
  const slots = generateAvailableSlots({ start: "2026-08-17", end: "2026-08-17", now: new Date("2026-08-16T12:00:00Z"), rules: [{ weekday: 1, enabled: true, start_time: "09:00", end_time: "12:00" }], duration: 60, horizon: 90, exceptions: [{ starts_at: first.startAt, ends_at: first.endAt }], requests: [{ requested_start_at: second.startAt, requested_end_at: second.endAt }] });
  assert.deepEqual(slots.map((slot) => slot.startAt), [third.startAt]);
});

const request: DemoRequest = { id: "10000000-0000-4000-8000-000000000001", customerName: "Doe, Jane; Jr", customerEmail: "jane@example.com", customerPhone: "555-555-1212", propertyAddress: "1 Main St; Unit 2, Town", requestedStartAt: "2026-08-20T19:00:00.000Z", requestedEndAt: "2026-08-20T20:00:00.000Z", status: "approved", source: "featured_machines", equipmentInterest: "Help Me Decide", adminMessage: null, createdAt: "2026-08-12T00:00:00Z", approvedAt: "2026-08-12T01:00:00Z", deniedAt: null, cancelledAt: null };
const calendarOptions = { organizerEmail: "demos@integrityautomowers.com", attendeeEmail: "jane@example.com", attendeeName: "Doe, Jane; Jr" };

test("ICS keeps stable request semantics and includes machine interest", () => {
  const ics = createDemoIcs(request, calendarOptions).replace(/\r\n /g, "");
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:demo-10000000-0000-4000-8000-000000000001@integrityautomowers\.com/);
  assert.match(ics, /DTSTART:20260820T190000Z/);
  assert.match(ics, /DTEND:20260820T200000Z/);
  assert.match(ics, /Equipment Interest: Help Me Decide/);
  assert.match(ics, /LOCATION:1 Main St\\; Unit 2\\, Town/);
});

test("ICS rejects header injection and keeps organizer and attendee", () => {
  assert.throws(() => createDemoIcs(request, { ...calendarOptions, attendeeEmail: "jane@example.com\r\nX-INJECTED:yes" }), /valid calendar email/);
  const ics = createDemoIcs(request, calendarOptions).replace(/\r\n /g, "");
  assert.match(ics, /ORGANIZER;CN="Integrity Distribution Systems":mailto:demos@integrityautomowers\.com/);
  assert.match(ics, /ATTENDEE;CN="Doe, Jane; Jr";RSVP=FALSE:mailto:jane@example\.com/);
});

test("machine interest appears in IDS, customer, calendar, and admin information", () => {
  assert.match(notifications, /Equipment: \$\{r\.equipmentInterest/);
  assert.equal((notifications.match(/Machine requested: \$\{r\.equipmentInterest/g) ?? []).length, 2);
  assert.match(source("lib/demo-scheduling/ics.ts"), /Equipment Interest: \$\{request\.equipmentInterest/);
  assert.match(admin, /selected\.equipmentInterest\?\?"Not specified"/);
});

test("Resend diagnostics classify useful failure reasons without returning raw messages", () => {
  assert.match(sanitizeEmailFailure({ name: "invalid_from_address", statusCode: 403, message: "The integrityautomowers.com domain is not verified" }), /Resend domain not verified.*invalid_from_address.*HTTP 403/);
  assert.match(sanitizeEmailFailure({ name: "validation_error", statusCode: 422, message: "bad payload" }), /Resend validation error/);
  assert.match(sanitizeEmailFailure({ name: "application_error", statusCode: 400, message: "recipient jane@example.com was rejected" }), /Resend recipient rejected/);
  const sanitized = sanitizeEmailFailure(new Error("Authorization: Bearer secret-key for jane@example.com"));
  assert.equal(sanitized, "Resend API error");
  assert.doesNotMatch(sanitized, /secret|jane|Authorization/);
  assert.ok(sanitized.length <= 100);
});

test("server email requires DEMO_FROM_EMAIL and never falls back after failure", () => {
  const serverEmail = emailSource.slice(emailSource.indexOf("export async function sendServerEmail"));
  assert.match(serverEmail, /DEMO_FROM_EMAIL\?\.trim\(\)/);
  assert.match(serverEmail, /sanitizeEmailFailure\(result\.error\)/);
  assert.doesNotMatch(serverEmail, /onboarding@resend\.dev/);
});

test("notification delivery failures persist short sanitized errors without rolling back transitions", () => {
  assert.match(notifications, /p_status:"failed"/);
  assert.match(notifications, /error\.message\.slice\(0,100\)/);
  assert.match(oldMigration, /char_length\(last_error\)<=100/);
  assert.match(admin, /event\?\.status==="failed"&&event\.last_error&&<span/);
  assert.match(admin, /Retry Failed Notifications/);
});

test("Resend attachment fields match the installed SDK", () => {
  const resendTypes = source("node_modules/resend/dist/index.d.mts");
  assert.match(resendTypes, /interface Attachment[\s\S]*contentType\?: string/);
  assert.match(notifications, /contentType:"text\/calendar; method=REQUEST; charset=UTF-8"/);
});

test("request route keeps size, notification, and generic error protections", () => {
  const route = source("app/api/demo-scheduling/requests/route.ts");
  assert.match(route, /new TextEncoder\(\)\.encode\(raw\)\.byteLength>12000/);
  assert.match(route, /await notifyNewDemoRequest/);
  assert.doesNotMatch(route, /customer_email|stored payload|service_role/i);
});

test("availability loading is reset around every fetch", () => {
  assert.match(modal, /setLoading\(true\)/);
  assert.match(modal, /\.finally\(\(\) => \{ if \(active\) setLoading\(false\); \}\)/);
});
