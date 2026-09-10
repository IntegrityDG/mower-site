import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ServiceError } from "../lib/service/validation";

const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/service/api.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, Request, Response, TextDecoder, URL,
  require: (name: string) => name === "server-only" ? {} : name === "./validation" ? { ServiceError } : name === "@/lib/dealer-network/api" ? { dealerNetworkOrigin: () => "https://integrityautomowers.com" } : assert.fail(`Unexpected dependency ${name}`),
});
const api = exports as typeof import("../lib/service/api");
const request = (body = "{}", origin: string | null = "https://integrityautomowers.com", extra: Record<string, string> = {}) => new Request("https://mower-site.vercel.app/api/service/cases", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...extra }, body });
test("Service mutation accepts only its configured public origin even when Next normalizes the internal hostname", async () => {
  assert.equal(JSON.stringify(await api.serviceBody(request('{"key":"test"}'))), '{"key":"test"}');
  for (const origin of [null, "https://attacker.invalid", "https://www.integrityautomowers.com", "https://mower-site.vercel.app", "null"]) await assert.rejects(api.serviceBody(request("{}", origin)), error => error instanceof ServiceError && error.status === 403);
});
test("forged forwarded headers cannot turn a cross-origin Service request into an allowed one", async () => {
  await assert.rejects(api.serviceBody(request("{}", "https://attacker.invalid", { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" })), error => error instanceof ServiceError && error.status === 403);
});
test("Service request parsing rejects malformed JSON, wrong media type and bounded oversized streams", async () => {
  await assert.rejects(api.serviceBody(request("{")), /Invalid request/);
  await assert.rejects(api.serviceBody(request("{}", "https://integrityautomowers.com", { "Content-Type": "text/plain" })), /JSON is required/);
  await assert.rejects(api.serviceBody(request("{}", "https://integrityautomowers.com", { "Content-Length": String(256 * 1024 + 1) })), error => error instanceof ServiceError && error.status === 413);
  await assert.rejects(api.serviceBody(request(JSON.stringify({ notes: "x".repeat(256 * 1024) }))), error => error instanceof ServiceError && error.status === 413);
});
test("Service responses and errors are private and expose only controlled error text", async () => {
  const response = api.serviceResponse({ ok: true }); assert.equal(response.headers.get("cache-control"), "no-store, private"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const failure = api.serviceApiError(new Error("private database or processor details")); assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes("private database"));
});
