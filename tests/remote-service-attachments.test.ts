/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import * as processing from "../lib/dealer-network/image-processing";
import * as policy from "../lib/service/policy";
import * as validation from "../lib/service/validation";
import { loadInstallationModule } from "./helpers/installation-module";

// Exercise the real attachment controller and image decoder against a controlled
// private Storage boundary. PostgreSQL tests separately prove the concurrent cap.
async function harness() {
  const caseId = randomUUID(), imageId = randomUUID();
  const bytes = await sharp({ create: { width: 120, height: 80, channels: 3, background: "green" } }).jpeg().withMetadata({ exif: { IFD0: { Artist: "Synthetic private metadata" } } }).toBuffer();
  const row: any = { id: imageId, case_id: caseId, name: "Photo.jpg", storage_path: `pending/${caseId}/${imageId}`, status: "pending", content_type: "image/jpeg", expected_bytes: bytes.length, expires_at: new Date(Date.now() + 60000).toISOString() };
  const stored = new Map<string, Blob>([[row.storage_path, new Blob([bytes])]]), calls: any[] = [];
  let authorized = true;
  const bucket = { createSignedUploadUrl: async (path: string, options: any) => { calls.push(["sign", path, options]); return { data: { signedUrl: "https://example.invalid/private-upload" }, error: null }; },
    download: async (path: string) => { calls.push(["download", path]); return { data: stored.get(path), error: null }; },
    upload: async (path: string, data: ArrayBuffer, options: any) => { calls.push(["upload", path, options]); if (stored.has(path)) return { error: new Error("Already exists") }; stored.set(path, new Blob([data])); return { error: null }; },
    remove: async (paths: string[]) => { paths.forEach(path => stored.delete(path)); return { error: null }; } };
  const database = { storage: { from: (name: string) => { assert.equal(name, "ids-service-private"); return bucket; } }, from: () => { const q: any = { select: () => q, eq: () => q, single: async () => ({ data: { ...row }, error: null }) }; return q; } };
  const requireStaff = async () => { if (!authorized) throw new validation.ServiceError("Staff sign-in required.", 401); return { id: "tech", role: "technician" }; };
  const api = loadInstallationModule<typeof import("../lib/service/attachments")>("lib/service/attachments.ts", {
    "node:crypto": { createHash }, "@/lib/dealer-network/image-processing": processing, "./auth": { requireStaff }, "./repository": { serviceDatabase: () => database, serviceRpc: async (name: string, args: any) => { calls.push([name, args]); if (name === "ids_service_attachment_reserve") return row; if (args.p_success) { row.status = "ready"; row.storage_path = `ready/${caseId}/${imageId}.jpg`; } }, databaseError: (error: Error) => { throw error; } },
    "./policy": policy, "./validation": validation, "./server": { readCases: requireStaff },
  });
  return { api, caseId, imageId, row, stored, calls, bytes, disable: () => { authorized = false; } };
}
test("attachment validation rejects over-15MB and unsupported input before signing an upload", async () => {
  const h = await harness();
  for (const input of [{ size: policy.MAX_CASE_IMAGE_BYTES + 1, type: "image/jpeg" }, { size: 30, type: "image/svg+xml" }]) await assert.rejects(h.api.reserveServiceImage(h.caseId, { id: h.imageId, name: "image.jpg", ...input }));
  assert.equal(h.calls.length, 0);
});
test("image finalization produces private normalized JPEG without EXIF and repeat does not duplicate", async () => {
  const h = await harness(); assert.ok((await sharp(h.bytes).metadata()).exif);
  await h.api.finishServiceImage(h.caseId, h.imageId); const result = await h.api.readServiceImage(h.caseId, h.imageId);
  const metadata = await sharp(Buffer.from(await result.arrayBuffer())).metadata(); assert.equal(metadata.format, "jpeg"); assert.equal(metadata.exif, undefined); assert.equal(metadata.width, 120);
  await h.api.finishServiceImage(h.caseId, h.imageId); assert.equal(h.calls.filter(c => c[0] === "upload").length, 1); assert.equal(h.stored.size, 1);
});
test("revocation blocks upload/finalization/read before touching private storage", async () => {
  const h = await harness(); h.disable();
  await assert.rejects(h.api.reserveServiceImage(h.caseId, { id: h.imageId, name: "image.jpg", size: h.bytes.length, type: "image/jpeg" }));
  await assert.rejects(h.api.finishServiceImage(h.caseId, h.imageId)); await assert.rejects(h.api.readServiceImage(h.caseId, h.imageId)); assert.equal(h.calls.length, 0);
});
test("malformed or mismatched-size upload is rejected and clears its pending object", async () => {
  for (const malformed of [false, true]) {
    const h = await harness(); if (malformed) { const data = new Blob(["not a JPEG"]); h.stored.set(h.row.storage_path, data); h.row.expected_bytes = data.size; } else h.row.expected_bytes++;
    await assert.rejects(h.api.finishServiceImage(h.caseId, h.imageId), /not a safe supported image/);
    assert.ok(h.calls.some(c => c[0] === "ids_service_attachment_finish" && c[1].p_success === false)); assert.equal(h.stored.size, 0);
  }
});
test("expired reservation cannot sign a new upload or normalize a late one", async () => {
  const h = await harness(); h.row.expires_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(h.api.reserveServiceImage(h.caseId, { id: h.imageId, name: "image.jpg", size: h.bytes.length, type: "image/jpeg" }), /no longer available/);
  await assert.rejects(h.api.finishServiceImage(h.caseId, h.imageId), /expired/); assert.ok(!h.calls.some(c => c[0] === "download" || c[0] === "sign"));
});
test("interrupted finalization accepts only identical server-normalized bytes at its private destination", async () => {
  const h = await harness(), normalized = await processing.normalizeMessageImage(h.bytes, "image/jpeg");
  h.stored.set(`ready/${h.caseId}/${h.imageId}.jpg`, new Blob([processing.exactStorageArrayBuffer(normalized.buffer)]));
  await h.api.finishServiceImage(h.caseId, h.imageId); assert.equal(h.row.status, "ready");
  const bad = await harness(); bad.stored.set(`ready/${bad.caseId}/${bad.imageId}.jpg`, new Blob(["different content"]));
  await assert.rejects(bad.api.finishServiceImage(bad.caseId, bad.imageId), /reconciliation failed/); assert.equal(bad.row.status, "pending");
});
