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
import {
  demoAreaAssignmentDisplay,
  isDemoServiceDate,
  serviceDateParts,
  validateDemoAreaAssignment,
} from "../lib/demo-scheduling/area-planning";
import {
  createDemoAreaAssignmentHandlers,
  createDemoAreaAssignmentItemHandlers,
} from "../lib/demo-scheduling/area-planning-handlers";
import { generateAvailableSlots } from "../lib/demo-scheduling/availability";
import { demoRequestFingerprint } from "../lib/demo-scheduling/client";
import { DEMO_EMAIL_ROUTING } from "../lib/demo-scheduling/email-config";
import { createDemoIcs } from "../lib/demo-scheduling/ics";
import { centralLocalToUtc, endAtForDuration, slotFromLocal } from "../lib/demo-scheduling/time";
import { DEMO_DURATION_MINUTES, DEMO_EQUIPMENT_INTERESTS, DEMO_REQUEST_BOT_TRAP_FIELD, DEMO_SOURCES, type DemoAreaAssignment, type DemoRequest, type DemoServiceArea, type DemoServiceAreaCity } from "../lib/demo-scheduling/types";
import { validateDemoRequest } from "../lib/demo-scheduling/validation";
import { sanitizeEmailFailure } from "../lib/email-diagnostics";

const source = (path: string) => readFileSync(path, "utf8");
const oldMigration = source("supabase/migrations/20260812210000_create_demo_scheduling.sql");
const newMigration = source("supabase/migrations/20260813000000_expand_demo_scheduling_sources_and_equipment.sql");
const durationMigration = source("supabase/migrations/20260814031110_change_demo_scheduling_to_four_hour_blocks.sql");
const areaPlanningMigration = source("supabase/migrations/20260815011728_add_demo_area_planning.sql");
const equipment = source("components/equipment/EquipmentCatalog.tsx");
const homepage = source("components/home/DesktopHomepage.tsx");
const mobileHome = source("components/mobile/MobileHomepage.tsx");
const mobileNavigation = source("components/mobile/MobileHomeNavigation.tsx");
const contact = source("components/contact/HomepageContactSection.tsx");
const priceMatch = source("components/promotions/HomePriceMatch.tsx");
const action = source("components/ids-action/IdsActionCarousel.tsx");
const gallery = source("components/ids-action/IdsActionGallery.tsx");
const modal = source("components/services-scheduling/DemoRequestForm.tsx");
const schedulingCta = source("components/demo-scheduling/ScheduleDemoModal.tsx");
const server = source("lib/demo-scheduling/server.ts");
const notifications = source("lib/demo-scheduling/notifications.ts");
const emailSource = source("lib/email.ts");
const admin = source("app/admin/demo-scheduling/page.tsx");
const areaPlanningServer = source("lib/demo-scheduling/server.ts");
const areaPlanningHandlers = source("lib/demo-scheduling/area-planning-handlers.ts");
const publicAvailabilityRoute = source("app/api/demo-scheduling/availability/route.ts");
const publicRequestRoute = source("app/api/demo-scheduling/requests/route.ts");
const requestHandler = source("lib/demo-scheduling/request-handler.ts");
const correctiveMigration = source("supabase/migrations/20260901154029_enforce_demo_buffer_remove_decision_maker.sql");

const valid = {
  name: "A Customer",
  email: "a@example.com",
  phone: "555-555-1212",
  propertyAddress: "1 Main St",
  requestedStartAt: "2026-08-20T15:00:00Z",
  source: "featured_machines",
  equipmentInterest: "Lymow One Plus",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  [DEMO_REQUEST_BOT_TRAP_FIELD]: "",
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

test("obscure honeypot and unknown sources remain rejected", () => {
  assert.equal(validateDemoRequest({ ...valid, source: "pandag" }).ok, false);
  assert.equal(validateDemoRequest({ ...valid, [DEMO_REQUEST_BOT_TRAP_FIELD]: "spam" }).ok, false);
  assert.doesNotMatch(modal, /name="company"|form\.get\("company"\)/);
});

test("legacy scheduler CTA now routes into the permanent service hub", () => {
  assert.match(schedulingCta, /href=\{`\/services-scheduling\?service=demo&source=/);
  assert.match(schedulingCta, /#request-demo/);
  assert.match(schedulingCta, />Schedule Service\/Demo<\/Link>/);
  assert.doesNotMatch(schedulingCta, /createPortal|role="dialog"/);
});

test("inline scheduler loads a bounded date range and groups returned slots", () => {
  assert.match(modal, /end\.setDate\(end\.getDate\(\) \+ 42\)/);
  assert.match(modal, /\/api\/demo-scheduling\/availability\?start=/);
  assert.match(modal, /slots\.reduce<Map<string, DemoSlot\[\]>>/);
  assert.match(modal, /All times are Central Time/);
});

test("scheduler exposes Private Demo and Demo Party as one accessible choice", () => {
  assert.match(modal, /<fieldset>/);
  assert.match(modal, /Choose your demo format/);
  assert.match(modal, /value="private"/);
  assert.match(modal, /value="party"/);
});

test("machine question is an accessible required radio group", () => {
  assert.match(modal, /<fieldset>/);
  assert.match(modal, /Machine interest/);
  assert.match(modal, /type="radio" name="equipmentInterest" value=\{option\} required/);
  assert.match(modal, /DEMO_EQUIPMENT_INTERESTS\.map/);
});

test("shared form captures required customer fields and pending copy", () => {
  for (const name of ["name", "email", "phone", "propertyAddress"]) assert.match(modal, new RegExp(`name="${name}"`));
  assert.match(modal, /pending until approved/);
  assert.match(modal, /Central Time/);
});

test("scheduling UI contains no one-hour copy and admin describes four-hour windows", () => {
  assert.doesNotMatch(modal, /60[- ]minute|1 hour|one-hour|hourly appointments/i);
  assert.doesNotMatch(admin, /60[- ]minute|1 hour|one-hour|hourly appointments/i);
  assert.match(admin, /Recurring four-hour appointment windows in Central Time/);
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

test("inline form reuses keys only for the same logical payload", () => {
  assert.match(modal, /attempt\.current\.fingerprint !== fingerprint/);
  assert.match(modal, /attempt\.current = \{ fingerprint, id: crypto\.randomUUID\(\) \}/);
  assert.equal((modal.match(/crypto\.randomUUID\(\)/g) ?? []).length, 1);
});

test("database idempotency mismatch protection remains authoritative", () => {
  assert.match(oldMigration, /raise exception 'idempotency_conflict'/);
  for (const field of ["customer_phone", "property_address", "requested_start_at", "requested_end_at", "source", "equipment_interest"]) assert.match(oldMigration, new RegExp(`v_existing\\.${field} is distinct from`));
  assert.match(oldMigration, /lower\(v_existing\.customer_email\) is distinct from lower\(p_email\)/);
  assert.match(requestHandler, /idempotency_conflict/);
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

test("duration migration changes only the demo setting to 240 minutes", () => {
  assert.match(durationMigration, /drop constraint demo_settings_duration_minutes_check/);
  assert.match(durationMigration, /alter column duration_minutes set default 240/);
  assert.match(durationMigration, /update public\.demo_settings[\s\S]*set duration_minutes = 240/);
  assert.match(durationMigration, /check \(duration_minutes = 240\)/);
  assert.match(durationMigration, /^begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(durationMigration, /update public\.demo_requests|delete from|truncate|drop table/i);
  for (const preserved of ["timezone", "scheduling_horizon_days", "demo_availability_rules", "demo_availability_exceptions", "demo_notification_events", "demo_requests_no_overlap", "source", "equipment_interest"]) {
    assert.doesNotMatch(durationMigration, new RegExp(`(?:alter|update|delete|drop)[^;]*${preserved}`, "i"));
  }
});

const areaId = "10000000-0000-4000-8000-000000000010";
const cityId = "10000000-0000-4000-8000-000000000011";
const assignmentInput: {
  serviceDate: string;
  regionId: string;
  cityId: string | null;
  customCity: string | null;
  internalNote: string | null;
} = {
  serviceDate: "2026-08-18",
  regionId: areaId,
  cityId: null,
  customCity: null,
  internalNote: null,
};
const areaAssignment: DemoAreaAssignment = { id: "10000000-0000-4000-8000-000000000012", ...assignmentInput, createdAt: "2026-08-14T00:00:00Z", updatedAt: "2026-08-14T00:00:00Z" };
const southernIllinois: DemoServiceArea = { id: areaId, name: "Southern Illinois", description: null, active: true, sortOrder: 130, createdAt: "2026-08-14T00:00:00Z", updatedAt: "2026-08-14T00:00:00Z" };
const marion: DemoServiceAreaCity = { id: cityId, regionId: areaId, name: "Marion", stateAbbreviation: "IL", active: true, sortOrder: 80, createdAt: "2026-08-14T00:00:00Z", updatedAt: "2026-08-14T00:00:00Z" };

test("admin can create a region-only day assignment and Specific City remains null", async () => {
  let saved: typeof assignmentInput | null = null;
  const handlers = createDemoAreaAssignmentHandlers({ isAdmin: async () => true, save: async (value) => { saved = value; return areaAssignment; } });
  const response = await handlers.PUT(new Request("https://ids.test/api/admin/demo-scheduling/day-plans", { method: "PUT", body: JSON.stringify(assignmentInput) }));
  assert.equal(response.status, 200);
  assert.deepEqual(saved, assignmentInput);
  assert.equal((await response.json()).assignment.cityId, null);
});

test("Southern Illinois with blank city and blank note validates successfully", () => {
  const parsed = validateDemoAreaAssignment({ ...assignmentInput, cityId: "", customCity: "", internalNote: "" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, assignmentInput);
});

test("region plus a saved city validates successfully", () => {
  const parsed = validateDemoAreaAssignment({ ...assignmentInput, cityId });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.cityId, cityId);
});

test("existing day assignments can change region, city, custom city, and internal note", () => {
  const withCity = validateDemoAreaAssignment({ ...assignmentInput, cityId, internalNote: "Start near Marion" });
  assert.equal(withCity.ok, true);
  const withCustomCity = validateDemoAreaAssignment({ ...assignmentInput, customCity: "Makanda", internalNote: "Updated route" });
  assert.equal(withCustomCity.ok, true);
  if (withCustomCity.ok) assert.deepEqual(withCustomCity.value, { ...assignmentInput, customCity: "Makanda", internalNote: "Updated route" });
});

test("optional city and internal note can be removed without removing the region", () => {
  const parsed = validateDemoAreaAssignment({ ...assignmentInput, cityId: "", customCity: " ", internalNote: " " });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, assignmentInput);
});

test("malformed dates, region IDs, mixed city modes, and overlong notes are rejected", () => {
  assert.equal(validateDemoAreaAssignment({ ...assignmentInput, serviceDate: "2026-02-30" }).ok, false);
  assert.equal(validateDemoAreaAssignment({ ...assignmentInput, regionId: "missing" }).ok, false);
  assert.equal(validateDemoAreaAssignment({ ...assignmentInput, cityId, customCity: "Marion" }).ok, false);
  assert.equal(validateDemoAreaAssignment({ ...assignmentInput, internalNote: "x".repeat(501) }).ok, false);
});

test("calendar display shows region only when no city exists and never invents a placeholder", () => {
  const display = demoAreaAssignmentDisplay(areaAssignment, [southernIllinois], [marion]);
  assert.deepEqual(display, { regionName: "Southern Illinois", cityName: null });
  assert.doesNotMatch(JSON.stringify(display), /No city selected/i);
});

test("calendar display adds the optional saved or custom city", () => {
  assert.deepEqual(demoAreaAssignmentDisplay({ ...areaAssignment, cityId }, [southernIllinois], [marion]), { regionName: "Southern Illinois", cityName: "Marion" });
  assert.deepEqual(demoAreaAssignmentDisplay({ ...areaAssignment, customCity: "Makanda" }, [southernIllinois], [marion]), { regionName: "Southern Illinois", cityName: "Makanda" });
});

test("historical assignments remain readable after a region or city becomes inactive", () => {
  const inactiveArea = { ...southernIllinois, active: false };
  const inactiveCity = { ...marion, active: false };
  assert.deepEqual(demoAreaAssignmentDisplay({ ...areaAssignment, cityId }, [inactiveArea], [inactiveCity]), { regionName: "Southern Illinois", cityName: "Marion" });
});

test("unauthenticated users cannot create or edit area assignments", async () => {
  let writes = 0;
  const handlers = createDemoAreaAssignmentHandlers({ isAdmin: async () => false, save: async () => { writes += 1; return areaAssignment; } });
  for (let index = 0; index < 2; index++) {
    const response = await handlers.PUT(new Request("https://ids.test/api/admin/demo-scheduling/day-plans", { method: "PUT", body: JSON.stringify(assignmentInput) }));
    assert.equal(response.status, 401);
  }
  assert.equal(writes, 0);
});

test("unauthenticated users cannot clear an area assignment", async () => {
  let clears = 0;
  const handlers = createDemoAreaAssignmentItemHandlers({ isAdmin: async () => false, clear: async () => { clears += 1; } });
  const response = await handlers.DELETE("2026-08-18");
  assert.equal(response.status, 401);
  assert.equal(clears, 0);
});

test("authenticated admin can clear an assignment by stable service date", async () => {
  let cleared = "";
  const handlers = createDemoAreaAssignmentItemHandlers({ isAdmin: async () => true, clear: async (date) => { cleared = date; } });
  const response = await handlers.DELETE("2026-08-18");
  assert.equal(response.status, 204);
  assert.equal(cleared, "2026-08-18");
});

test("server rejects missing, inactive, and mismatched region or city records", () => {
  for (const code of ["region_not_found", "inactive_region", "city_not_found", "inactive_city", "city_region_mismatch"]) assert.match(areaPlanningServer, new RegExp(code));
  assert.match(areaPlanningServer, /city\.region_id!==normalizedValue\.regionId/);
  assert.match(areaPlanningServer, /!region\.active&&existing\?\.region_id!==normalizedValue\.regionId/);
});

test("migration creates private normalized planning tables with optional city columns", () => {
  for (const table of ["demo_service_areas", "demo_service_area_cities", "demo_area_assignments"]) {
    assert.match(areaPlanningMigration, new RegExp(`create table public\\.${table}`));
    assert.match(areaPlanningMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(areaPlanningMigration, /service_date date not null unique/);
  assert.match(areaPlanningMigration, /city_id uuid,/);
  assert.match(areaPlanningMigration, /custom_city text check/);
  assert.doesNotMatch(areaPlanningMigration, /city_id uuid not null|custom_city text not null/);
  assert.match(areaPlanningMigration, /internal_note text check \(internal_note is null or char_length\(internal_note\) <= 500\)/);
});

test("one service date cannot receive duplicate day-plan rows and city-region integrity is database-enforced", () => {
  assert.match(areaPlanningMigration, /service_date date not null unique/);
  assert.match(areaPlanningMigration, /foreign key \(city_id, region_id\)[\s\S]*references public\.demo_service_area_cities\(id, region_id\)/);
  assert.match(areaPlanningServer, /upsert\([\s\S]*onConflict:"service_date"/);
});

test("regions and cities archive in place and cannot be hard-deleted through grants or APIs", () => {
  assert.match(areaPlanningMigration, /grant select, insert, update\s+on table public\.demo_service_areas, public\.demo_service_area_cities/);
  assert.doesNotMatch(areaPlanningMigration, /grant[^;]*delete[^;]*demo_service_areas|grant[^;]*delete[^;]*demo_service_area_cities/i);
  assert.equal(source("app/api/admin/demo-scheduling/areas/[id]/route.ts").includes("DELETE"), false);
  assert.match(areaPlanningMigration, /on delete restrict/g);
});

test("planning tables expose no anon or authenticated policies or privileges", () => {
  assert.match(areaPlanningMigration, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(areaPlanningMigration, /create policy/i);
  assert.doesNotMatch(areaPlanningMigration, /grant[^;]*(?:anon|authenticated)/i);
  assert.match(areaPlanningHandlers, /if \(!\(await dependencies\.isAdmin\(\)\)\) return unauthorized\(\)/);
});

test("every area-planning mutation route reuses existing IDS admin authentication", () => {
  for (const route of [
    "app/api/admin/demo-scheduling/day-plans/route.ts",
    "app/api/admin/demo-scheduling/day-plans/[date]/route.ts",
    "app/api/admin/demo-scheduling/areas/route.ts",
    "app/api/admin/demo-scheduling/areas/[id]/route.ts",
    "app/api/admin/demo-scheduling/areas/[id]/cities/route.ts",
    "app/api/admin/demo-scheduling/areas/[id]/cities/[cityId]/route.ts",
  ]) assert.match(source(route), /isReviewAdmin/);
  assert.equal((areaPlanningHandlers.match(/if \(!\(await dependencies\.isAdmin\(\)\)\) return unauthorized\(\)/g) ?? []).length, 6);
});

test("migration seeds all thirteen active regions in the requested order", () => {
  const names = ["St. Louis Metro / Eastern Missouri", "Cape Girardeau Area", "Sikeston / Bootheel", "Poplar Bluff Area", "West Plains Area", "Springfield / Branson", "Joplin Area", "Northeastern Arkansas", "Northwestern Arkansas", "Paducah / Western Kentucky", "Jackson / Western Tennessee", "Memphis Metro", "Southern Illinois"];
  let previous = -1;
  names.forEach((name, index) => {
    const position = areaPlanningMigration.indexOf(`('${name}', ${(index + 1) * 10})`);
    assert.ok(position > previous, name);
    previous = position;
  });
  assert.match(areaPlanningMigration, /active boolean not null default true/);
});

test("starter cities are seeded without making city selection required", () => {
  for (const city of ["St. Louis", "Cape Girardeau", "Sikeston", "Poplar Bluff", "West Plains", "Springfield", "Joplin", "Jonesboro", "Bentonville", "Paducah", "Jackson", "Memphis", "Marion"]) assert.match(areaPlanningMigration, new RegExp(`'${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  assert.match(areaPlanningMigration, /demo_service_area_cities_region_name_state_unique/);
  assert.doesNotMatch(areaPlanningMigration, /city_id uuid not null/);
});

test("public scheduling APIs expose only sanitized area planning and never internal notes", () => {
  assert.match(publicAvailabilityRoute, /getPublicDemoAreaPlanning/);
  for (const route of [publicAvailabilityRoute, publicRequestRoute]) assert.doesNotMatch(route, /internal_note|internalNote/);
  assert.doesNotMatch(publicRequestRoute, /areaPlanning|demo_area_assignments/);
});

test("admin calendar keeps occupancy separate from region and optional city labels", () => {
  assert.match(admin, /demoAreaAssignmentDisplay/);
  assert.match(admin, /display\.regionName/);
  assert.match(admin, /display\.cityName\s*&&/);
  assert.match(admin, /occupancyCount > 0/);
  assert.match(admin, /Demo\{occupancyCount === 1/);
  assert.doesNotMatch(admin, /No city selected/);
});

test("calendar date selection keeps Day Plan and customer request access together", () => {
  assert.match(admin, /setSelectedDate\(date\)/);
  assert.match(admin, /selectDemoRequestForCalendarDate\(rows, current\.filter, now\)/);
  assert.match(admin, /Requests on this date/);
  assert.match(admin, /setRequestView\(\{ filter: "all", selected: request \}\)/);
});

test("Day Plan UI supports save, update, optional city and note, and clear", () => {
  for (const copy of ["Day Plan / Area Planning", "Area / Region", "Specific City", "(optional)", "Internal Note", "Save Day Plan", "Update Day Plan", "Clear Area Assignment"]) assert.match(admin, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(admin, /cityId: customAreaSelected \? null : dayPlanDraft\.cityId \|\| null/);
  assert.match(admin, /internalNote: dayPlanDraft\.internalNote \|\| null/);
  assert.match(admin, /serviceAreas\.filter\(\(area\) => area\.active \|\| area\.id === selectedAssignment\?\.regionId\)/);
});

test("Manage Areas supports region and city creation, editing, sort, and active state", () => {
  for (const copy of ["Demo Service Areas", "Add Area / Region", "Edit Region", "City Options", "Sort order", "Active", "Save Region"]) assert.match(admin, new RegExp(copy));
  for (const route of ["/api/admin/demo-scheduling/areas", "/cities"]) assert.match(admin, new RegExp(route));
});

test("approval and fixed-fee notice appears before submission", () => {
  assert.match(modal, /Approval and \$100 fee/);
  assert.match(modal, /charged only after IDS approves/);
  assert.ok(modal.indexOf("Approval and $100 fee") < modal.indexOf("Request ${format"));
});

test("area planning and travel notice add no automated fee or payment behavior", () => {
  const newFeatureSource = [areaPlanningMigration, areaPlanningHandlers, source("lib/demo-scheduling/area-planning.ts"), source("app/api/admin/demo-scheduling/day-plans/route.ts")].join("\n");
  assert.doesNotMatch(newFeatureSource, /Stripe|payment_intent|line_items|mileage|fuel_price|charge a card/i);
  assert.doesNotMatch(modal, /calculate mileage|automatic fuel fee|payment authorization/i);
});

test("service dates preserve YYYY-MM-DD semantics without timezone conversion", () => {
  assert.equal(isDemoServiceDate("2026-08-18"), true);
  assert.deepEqual(serviceDateParts("2026-08-18"), { year: 2026, month: 8, day: 18 });
  assert.equal(isDemoServiceDate("2026-02-29"), false);
  assert.equal(isDemoServiceDate("2028-02-29"), true);
  assert.doesNotMatch(source("lib/demo-scheduling/area-planning.ts"), /toISOString|Date\.parse|new Date/);
});

test("area assignments do not participate in availability or mutate demo requests", () => {
  assert.doesNotMatch(areaPlanningServer.slice(areaPlanningServer.indexOf("export async function getAvailableSlots"), areaPlanningServer.indexOf("export async function getPublicDemoAreaPlanning")), /demo_area_assignments|demo_service_areas/);
  const requestRecord = adminRequest("pending", "planning-isolated");
  const before = structuredClone(requestRecord);
  validateDemoAreaAssignment(assignmentInput);
  assert.deepEqual(requestRecord, before);
  assert.doesNotMatch(areaPlanningServer.slice(areaPlanningServer.indexOf("export async function saveDemoAreaAssignment")), /from\("demo_requests"\)\.(?:update|delete|insert|upsert)/);
});

test("the public availability contract reports the unchanged four-hour duration", () => {
  assert.equal(DEMO_DURATION_MINUTES, 240);
  assert.match(publicAvailabilityRoute, /durationMinutes:APPOINTMENT_TYPE_CONFIG\.demo\.durationMinutes/);
  assert.doesNotMatch(publicAvailabilityRoute, /durationMinutes:60/);
});

test("PII tables keep RLS and public availability remains free of customer data", () => {
  for (const table of ["demo_requests", "demo_availability_rules", "demo_availability_exceptions", "demo_settings", "demo_notification_events"]) assert.match(oldMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  const availabilityRoute = source("app/api/demo-scheduling/availability/route.ts");
  assert.match(availabilityRoute, /getAvailableSlots/);
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

type SlotRequests = Parameters<typeof generateAvailableSlots>[0]["requests"];
type SlotExceptions = Parameters<typeof generateAvailableSlots>[0]["exceptions"];
const mondaySlots = (startTime:string,endTime:string,requests:SlotRequests=[],exceptions:SlotExceptions=[]) => generateAvailableSlots({
  start: "2026-08-17",
  end: "2026-08-17",
  now: new Date("2026-08-16T12:00:00Z"),
  rules: [{ weekday: 1, enabled: true, start_time: startTime, end_time: endTime }],
  duration: 240,
  horizon: 90,
  exceptions,
  requests,
});

test("08:00-18:00 availability generates four-hour Demos five hours apart", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  assert.deepEqual(mondaySlots("08:00", "18:00").map(({startAt,endAt})=>[startAt,endAt]), [
    [first.startAt, first.endAt],
    [second.startAt, second.endAt],
  ]);
});

test("09:00-16:00 availability generates only 09:00-13:00", () => {
  const only = slotFromLocal("2026-08-17", "09:00", 240)!;
  assert.deepEqual(mondaySlots("09:00", "16:00").map(({startAt,endAt})=>[startAt,endAt]), [[only.startAt, only.endAt]]);
});

test("availability never generates a partial four-hour block", () => {
  const only = slotFromLocal("2026-08-17", "08:00", 240)!;
  assert.deepEqual(mondaySlots("08:00", "15:00").map(({startAt,endAt})=>[startAt,endAt]), [[only.startAt, only.endAt]]);
});

test("request creation delegates the exact duration to shared database configuration", () => {
  const start = new Date("2026-08-17T13:00:00.000Z");
  assert.equal(endAtForDuration(start, 240).toISOString(), "2026-08-17T17:00:00.000Z");
  assert.match(server, /rpc\("scheduling_create_demo_request"/);
  assert.match(server, /p_start_at:new Date\(value\.startAt\)\.toISOString\(\)/);
  assert.doesNotMatch(server, /3600000/);
  const schedulingMigration = source("supabase/migrations/20260831231030_services_scheduling_demo_party.sql");
  assert.match(schedulingMigration, /request_end:=p_start_at\+make_interval\(mins=>type_settings\.duration_minutes\)/);
  assert.match(correctiveMigration, /mod\(extract\(epoch from \(local_start::time-availability_rule\.start_time\)\)::bigint,\(type_settings\.duration_minutes\+60\)\*60\)<>0/);
});

test("a pending four-hour request keeps only the exact one-hour-gap slot", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const requests:SlotRequests = [{requested_start_at:first.startAt,requested_end_at:first.endAt,status:"pending"}];
  assert.deepEqual(mondaySlots("08:00", "18:00", requests).map(slot=>slot.startAt), [second.startAt]);
});

test("an approved four-hour request keeps only the exact one-hour-gap slot", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const requests:SlotRequests = [{requested_start_at:first.startAt,requested_end_at:first.endAt,status:"approved"}];
  assert.deepEqual(mondaySlots("08:00", "18:00", requests).map(slot=>slot.startAt), [second.startAt]);
});

test("a denied request releases its four-hour slot", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const requests:SlotRequests = [{requested_start_at:first.startAt,requested_end_at:first.endAt,status:"denied"}];
  assert.deepEqual(mondaySlots("08:00", "18:00", requests).map(slot=>slot.startAt), [first.startAt,second.startAt]);
});

test("a cancelled request releases its four-hour slot", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const requests:SlotRequests = [{requested_start_at:first.startAt,requested_end_at:first.endAt,status:"cancelled"}];
  assert.deepEqual(mondaySlots("08:00", "18:00", requests).map(slot=>slot.startAt), [first.startAt,second.startAt]);
});

test("public availability never offers a Demo inside the one-hour buffer", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const requests:SlotRequests = [{requested_start_at:first.startAt,requested_end_at:first.endAt,status:"pending"}];
  assert.deepEqual(mondaySlots("08:00", "18:00", requests).map(slot=>slot.startAt), [second.startAt]);
  assert.match(correctiveMigration, /tsrange\([\s\S]*requested_start_at at time zone 'UTC'[\s\S]*\(requested_end_at at time zone 'UTC'\) \+ interval '1 hour'/);
});

test("a blackout overlapping any part of a four-hour slot removes that slot", () => {
  const first = slotFromLocal("2026-08-17", "08:00", 240)!;
  const second = slotFromLocal("2026-08-17", "13:00", 240)!;
  const blackoutStart = centralLocalToUtc("2026-08-17", "10:00")!.toISOString();
  const blackoutEnd = centralLocalToUtc("2026-08-17", "11:00")!.toISOString();
  assert.deepEqual(mondaySlots("08:00", "18:00", [], [{starts_at:blackoutStart,ends_at:blackoutEnd}]).map(slot=>slot.startAt), [second.startAt]);
  assert.notEqual(first.startAt, second.startAt);
});

const request: DemoRequest = { id: "10000000-0000-4000-8000-000000000001", customerName: "Doe, Jane; Jr", customerEmail: "jane@example.com", customerPhone: "555-555-1212", propertyAddress: "1 Main St; Unit 2, Town", requestedStartAt: "2026-08-20T19:00:00.000Z", requestedEndAt: "2026-08-20T23:00:00.000Z", status: "approved", source: "featured_machines", equipmentInterest: "Help Me Decide", adminMessage: null, createdAt: "2026-08-12T00:00:00Z", approvedAt: "2026-08-12T01:00:00Z", deniedAt: null, cancelledAt: null };
const calendarOptions = { organizerEmail: "verified-sender@example.com", attendeeEmail: "jane@example.com", attendeeName: "Doe, Jane; Jr" };

test("ICS keeps stable request semantics and includes machine interest", () => {
  const ics = createDemoIcs(request, calendarOptions).replace(/\r\n /g, "");
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:demo-10000000-0000-4000-8000-000000000001@integrityautomowers\.com/);
  assert.match(ics, /DTSTART:20260820T190000Z/);
  assert.match(ics, /DTEND:20260820T230000Z/);
  assert.equal(Date.parse(request.requestedEndAt)-Date.parse(request.requestedStartAt), 240*60000);
  assert.match(ics, /Equipment Interest: Help Me Decide/);
  assert.match(ics, /LOCATION:1 Main St\\; Unit 2\\, Town/);
});

test("customer confirmation ICS uses the persisted four-hour range", () => {
  const ics = createDemoIcs(request, calendarOptions).replace(/\r\n /g, "");
  assert.match(ics, /DTSTART:20260820T190000Z[\s\S]*DTEND:20260820T230000Z/);
  assert.match(notifications, /attachments: \[attachment\(request, request\.customerEmail, request\.customerName\)\]/);
});

test("IDS Proton invitation uses the persisted four-hour range", () => {
  const ics = createDemoIcs(request, {...calendarOptions,attendeeEmail:DEMO_EMAIL_ROUTING.staffRecipient,attendeeName:"IDS Demo Calendar"}).replace(/\r\n /g, "");
  assert.match(ics, /DTSTART:20260820T190000Z[\s\S]*DTEND:20260820T230000Z/);
  assert.match(notifications, /attachments: \[attachment\(request, calendarEmail, "IDS Demo Calendar"\)\]/);
});

test("ICS rejects header injection and keeps organizer and attendee", () => {
  assert.throws(() => createDemoIcs(request, { ...calendarOptions, attendeeEmail: "jane@example.com\r\nX-INJECTED:yes" }), /valid calendar email/);
  const ics = createDemoIcs(request, calendarOptions).replace(/\r\n /g, "");
  assert.match(ics, /ORGANIZER;CN="Integrity Distribution Systems":mailto:verified-sender@example\.com/);
  assert.match(ics, /ATTENDEE;CN="Doe, Jane; Jr";RSVP=FALSE:mailto:jane@example\.com/);
});

test("demo staff delivery and replies use the centralized Proton mailbox", () => {
  const retiredAddress = ["demos", "integrityautomowers.com"].join("@");
  assert.deepEqual(DEMO_EMAIL_ROUTING, {
    staffRecipient: "demos.IDS@proton.me",
    replyTo: "demos.IDS@proton.me",
  });
  assert.notEqual(DEMO_EMAIL_ROUTING.staffRecipient, retiredAddress);
  assert.notEqual(DEMO_EMAIL_ROUTING.replyTo, retiredAddress);
  assert.doesNotMatch(`${source("lib/demo-scheduling/email-config.ts")}\n${notifications}`, new RegExp(retiredAddress.replace(".", "\\."), "i"));
  assert.match(notifications, /sendIdsNotification\(\{ to: DEMO_EMAIL_ROUTING\.staffRecipient, replyTo: DEMO_EMAIL_ROUTING\.replyTo/);
  assert.match(notifications, /const calendarEmail = DEMO_EMAIL_ROUTING\.staffRecipient/);
  assert.match(notifications, /sendServerEmail\(\{ \.\.\.message, replyTo: DEMO_EMAIL_ROUTING\.replyTo \}\)/);
  assert.equal(notifications.match(/sendServerEmail\(/g)?.length, 1);
  assert.doesNotMatch(notifications, /process\.env\.(?:DEMO_CALENDAR_EMAIL|NOTIFY_EMAIL)/);
});

test("machine interest appears in IDS, customer, calendar, and admin information", () => {
  assert.match(notifications, /Equipment: \$\{request\.equipmentInterest/);
  assert.match(notifications, /Machine requested: \$\{request\.equipmentInterest/);
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
  assert.match(serverEmail, /emails\.send\(\{from,to,\.\.\.\(replyTo\?\{replyTo\}:\{\}\),subject,text,html,attachments\}\)/);
  assert.match(serverEmail, /sanitizeEmailFailure\(result\.error\)/);
  assert.doesNotMatch(serverEmail, /onboarding@resend\.dev/);
});

test("notification delivery failures persist short sanitized errors without rolling back transitions", () => {
  assert.match(notifications, /p_status: "failed"/);
  assert.match(notifications, /error\.message\.slice\(0, 100\)/);
  assert.match(oldMigration, /char_length\(last_error\)<=100/);
  assert.match(admin, /event\?\.status==="failed"&&event\.last_error&&<span/);
  assert.match(admin, /Retry Failed Notifications/);
});

test("Resend attachment fields match the installed SDK", () => {
  const resendTypes = source("node_modules/resend/dist/index.d.mts");
  assert.match(resendTypes, /interface Attachment[\s\S]*contentType\?: string/);
  assert.match(notifications, /contentType: "text\/calendar; method=REQUEST; charset=UTF-8"/);
});

test("request route keeps size, notification, and generic error protections", () => {
  const route = source("app/api/demo-scheduling/requests/route.ts");
  assert.match(route, /handleDemoRequestPost/);
  assert.match(requestHandler, /new TextEncoder\(\)\.encode\(raw\)\.byteLength > 16_000/);
  assert.match(requestHandler, /await dependencies\.notifyRequest\(saved\)/);
  assert.doesNotMatch(`${route}\n${requestHandler}`, /customer_email|stored payload|service_role/i);
});

test("availability loading is reset around every fetch", () => {
  assert.match(modal, /useState\(true\)/);
  assert.match(modal, /\.finally\(\(\) => \{ if \(active\) setLoading\(false\); \}\)/);
});
