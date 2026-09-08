import assert from "node:assert/strict";
import test from "node:test";
import { loadInstallationModule as load } from "./helpers/installation-module";
import * as errors from "../lib/installations/errors";
import * as stripeConfig from "../lib/stripe/config-values";
type Controls = typeof import("../lib/installations/controls");
const forbidden = () => { throw new Error("External operation must not run"); };
const controls = (env = {}) => load<Controls>("lib/installations/controls.ts", { "@/lib/stripe/config-values": stripeConfig }, env);

for (const value of [undefined, "", "false", "TRUE", "1", "yes", " true ", "invalid"]) {
  test(`creation flags fail closed for ${JSON.stringify(value)}`, () => {
    const c = controls({ INSTALLATION_INTAKE_ENABLED: value, INSTALLATION_ONLINE_PAYMENTS_ENABLED: value });
    assert.equal(c.installationControls().intakeEnabled, false);
    assert.equal(c.installationControls().onlinePaymentsEnabled, false);
    assert.throws(c.requireInstallationIntake, /disabled/);
    assert.throws(c.requireInstallationOnlinePayments, /disabled/);
  });
}
test("creation controls are independent", () => {
  assert.equal(controls({ INSTALLATION_INTAKE_ENABLED: "true" }).installationControls().onlinePaymentsEnabled, false);
  assert.equal(controls({ INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true" }).installationControls().intakeEnabled, false);
});
test("effective customer payment availability also respects the existing test-mode safeguard", () => {
  for (const STRIPE_MODE of ["live", "invalid"]) assert.equal(controls({ INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true", STRIPE_MODE }).installationCheckoutAvailable(), false);
  assert.equal(controls({ INSTALLATION_ONLINE_PAYMENTS_ENABLED: "true", STRIPE_MODE: "test" }).installationCheckoutAvailable(), true);
});
test("direct disabled intake POST rejects before parsing or accessing installation tables", async () => {
  const route = load<typeof import("../app/api/installations/route")>("app/api/installations/route.ts", {
    "@/lib/installations/controls": controls(), "@/lib/installations/server": { createInstallation: forbidden },
    "@/lib/installations/validation": { validateInstallationIntake: forbidden },
  });
  assert.equal((await route.POST(new Request("http://localhost/api/installations", { method: "POST", body: "malformed" }))).status, 503);
});
test("direct disabled checkout POST rejects before Stripe or DB", async () => {
  const route = load<typeof import("../app/api/installations/[token]/checkout/route")>("app/api/installations/[token]/checkout/route.ts", {
    "@/lib/installations/controls": controls(), "@/lib/installations/stripe": { createInstallationCheckout: forbidden },
  });
  assert.equal((await route.POST(new Request("http://localhost", { method: "POST", body: "malformed" }), { params: Promise.resolve({ token: "synthetic" }) })).status, 503);
});
test("admin authorization precedes reads; missing schema is distinct from an empty database", async () => {
  for (const authorized of [false, true]) {
    const route = load<typeof import("../app/api/admin/installations/route")>("app/api/admin/installations/route.ts", {
      "@/lib/reviews/admin-auth": { isReviewAdmin: async () => authorized },
      "@/lib/installations/errors": errors, "@/lib/installations/controls": controls(),
      "@/lib/installations/server": { adminInstallations: async () => { if (!authorized) forbidden(); throw { code: "42P01" }; } },
    });
    const response = await route.GET();
    assert.equal(response.status, authorized ? 503 : 401);
    if (authorized) assert.equal((await response.json()).code, "installation_not_initialized");
  }
});
