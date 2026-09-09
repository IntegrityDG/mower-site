import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadInstallationModule } from "./helpers/installation-module";
import * as validation from "../lib/service/validation";
import * as policy from "../lib/service/policy";
import type { WorkSheet } from "../lib/service/types";

test("handoff preserves Master and previous technician authors and ignores client attribution claims", async () => {
  const technician = randomUUID(), former = randomUUID(), caseId = randomUUID();
  const line = (technicianId: string | null) => ({ id: randomUUID(), date: "2026-09-09", minutes: 30, description: "Recorded work", technicianId });
  const original = [line(null), line(former)]; let persisted: WorkSheet | undefined;
  const server = loadInstallationModule<typeof import("../lib/service/server")>("lib/service/server.ts", {
    "next/headers": { cookies: () => {} }, "@/lib/dealer-network/security": {}, "@/lib/dealer-network/api": {},
    "./auth": { requireStaff: async () => ({ id: technician, role: "technician" }) },
    "./repository": { serviceRpc: async (name: string, args: { p_data: { sheet: WorkSheet } }) => { if (name === "ids_service_read") return { invoice: { sheet: { labor: original } } }; persisted = args.p_data.sheet; return {}; } },
    "./controls": {}, "./validation": validation, "./security": {}, "./policy": policy,
  });
  const sheet = { ...structuredClone(policy.EMPTY_WORK_SHEET), labor: [...original.map(entry => ({ ...entry, technicianId: technician })), line(former)] };
  await server.applyServiceAction(caseId, { key: randomUUID(), version: 1, action: "save_invoice", data: { sheet } });
  assert.ok(persisted); assert.deepEqual(JSON.parse(JSON.stringify(persisted.labor.map(entry => entry.technicianId))), [null, former, technician]);
});
