import assert from "node:assert/strict";
import test from "node:test";
import { loadInstallationModule as load } from "./helpers/installation-module";

class ServiceError extends Error { constructor(message: string, public status = 400) { super(message); } }
const actor = (role: "master" | "technician") => ({ id: role === "master" ? null : crypto.randomUUID(), role, name: role, canCollectPayments: false, canRecordCash: false });

function routeFor(role: "master" | "technician" | "unauthorized") {
  const calls: unknown[] = []; const current = role === "unauthorized" ? null : actor(role);
  const requireStaff = async (master = false) => { if (!current) throw new ServiceError("Staff sign-in required.", 401); if (master && role !== "master") throw new ServiceError("Master Admin access required.", 403); return current; };
  const availability = {
    readServiceAvailability: async () => { calls.push("read"); return []; }, readAvailabilityHistory: async () => [],
    saveServiceAvailability: async (staff: unknown, input: unknown) => { calls.push({ staff, input }); return { ok: true }; },
  };
  const noop = () => {};
  const route = load<typeof import("../app/api/service/staff/[...segments]/route")>("app/api/service/staff/[...segments]/route.ts", {
    "@/lib/service/auth": { activateStaff: noop, currentStaff: async () => current, loginStaff: noop, logoutStaff: noop, requireStaff, serviceRateLimit: noop, staffProfiles: async () => [] },
    "@/lib/service/api": { serviceBody: (request: Request) => request.json(), serviceResponse: (data: unknown, status = 200) => Response.json(data, { status }), serviceApiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "error" }, { status: error instanceof ServiceError ? error.status : 503 }), requireSameOrigin: noop },
    "@/lib/service/server": { applyServiceAction: noop, manageStaff: noop, readCases: noop },
    "@/lib/service/stripe": { createServicePayment: noop, reconcileSubscription: noop, reconcileServicePayments: noop },
    "@/lib/service/attachments": { finishServiceImage: noop, readServiceImage: noop, reserveServiceImage: noop },
    "@/lib/service/outbox": { readWarrantySnapshot: noop, runServiceMaintenance: noop, wakeServiceMaintenance: noop },
    "@/lib/service/repository": { serviceRpc: noop }, "@/lib/service/warranty-pdf": { warrantyPdf: noop },
    "@/lib/service/availability": availability,
    "@/lib/service/types": { SERVICE_AVAILABILITY_KEYS: ["professional_installation", "professional_setup", "new_remote_support_subscriptions", "existing_subscriber_assistance", "paid_remote_service", "onsite_service"] },
    "@/lib/service/validation": { ServiceError, object: (value: unknown) => value as Record<string, unknown>, exact: noop, text: (value: unknown) => String(value ?? ""), uuid: (value: unknown) => String(value), integer: (value: unknown) => Number(value), parsePricing: (value: unknown) => value },
  });
  return { route, calls, current };
}

test("technicians cannot read or change Master Admin availability controls", async () => {
  const { route, calls } = routeFor("technician");
  const context = { params: Promise.resolve({ segments: ["availability"] }) };
  assert.equal((await route.GET(new Request("https://example.invalid"), context)).status, 403);
  assert.equal((await route.POST(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }), context)).status, 403);
  assert.deepEqual(calls, []);
});

test("unauthorized users cannot read or change availability controls", async () => {
  const { route, calls } = routeFor("unauthorized");
  const context = { params: Promise.resolve({ segments: ["availability"] }) };
  assert.equal((await route.GET(new Request("https://example.invalid"), context)).status, 401);
  assert.equal((await route.POST(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), context)).status, 401);
  assert.deepEqual(calls, []);
});

test("Master Admin changes pass the authenticated actor and operation identity", async () => {
  const { route, calls, current } = routeFor("master");
  const context = { params: Promise.resolve({ segments: ["availability"] }) };
  assert.equal((await route.GET(new Request("https://example.invalid"), context)).status, 200);
  const operationKey = crypto.randomUUID();
  const response = await route.POST(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey, serviceKey: "onsite_service", status: "currently_unavailable", publicMessage: "Weather pause" }) }), context);
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify({ staff: current, input: { operationKey, serviceKey: "onsite_service", status: "currently_unavailable", publicMessage: "Weather pause" } }));
});

test("Master Admin can persist each independent service state and public message", async () => {
  const { route, calls } = routeFor("master");
  for (const serviceKey of ["professional_installation", "professional_setup", "new_remote_support_subscriptions", "existing_subscriber_assistance", "paid_remote_service", "onsite_service"]) {
    const context = { params: Promise.resolve({ segments: ["availability"] }) };
    const response = await route.POST(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: crypto.randomUUID(), serviceKey, status: "currently_unavailable", publicMessage: serviceKey + " pause" }) }), context);
    assert.equal(response.status, 200);
  }
  const saves = calls.filter(value => typeof value === "object") as { input: { serviceKey: string; publicMessage: string } }[];
  assert.deepEqual(saves.map(value => value.input.serviceKey), ["professional_installation", "professional_setup", "new_remote_support_subscriptions", "existing_subscriber_assistance", "paid_remote_service", "onsite_service"]);
  assert.ok(saves.every(value => value.input.publicMessage.endsWith(" pause")));
});
