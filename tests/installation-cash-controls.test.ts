// This test is also included in the schema-independent controls-only patch.
import assert from "node:assert/strict";
import test from "node:test";
import { loadInstallationModule as load } from "./helpers/installation-module";
import * as stripeConfig from "../lib/stripe/config-values";
import * as errors from "../lib/installations/errors";
test("direct cash endpoint fails closed before parsing or reaching persistence", async () => {
  const controls = load<typeof import("../lib/installations/controls")>("lib/installations/controls.ts", { "@/lib/stripe/config-values": stripeConfig }, {});
  let called = false;
  const route = load<typeof import("../app/api/admin/installations/[id]/cash/route")>("app/api/admin/installations/[id]/cash/route.ts", {
    "@/lib/reviews/admin-auth": { isReviewAdmin: async () => true }, "@/lib/installations/controls": controls,
    "@/lib/installations/cash": { recordInstallationCash: () => { called = true; throw new Error("Unexpected cash operation"); } },
    "@/lib/installations/cash-validation": {}, "@/lib/installations/errors": errors,
  });
  const response = await route.POST(new Request("http://localhost", { method: "POST", body: "invalid JSON" }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
  assert.equal(response.status, 503); assert.equal(called, false);
  assert.deepEqual(JSON.parse(JSON.stringify(controls.installationControls())),  { intakeEnabled: false, onlinePaymentsEnabled: false, cashRecordingEnabled: false });
});
