import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateGeneralQuoteRequest } from "../lib/leads/quote-validation";

const generalRoute = readFileSync("app/api/quote-request/route.ts", "utf8");
const pandagRoute = readFileSync("app/api/pandag/project-quote/route.ts", "utf8");
const adminLogin = readFileSync("app/api/admin/reviews/login/route.ts", "utf8");

const valid = {
  name: "Customer",
  email: "Customer@Example.com",
  phone: "555-555-1212",
  productSlug: "yarbo",
  interests: ["Equipment purchase"],
  terrain: [],
  priorities: [],
  productInterest: ["Renamed customer-facing package"],
  autoSuggestion: [],
};

test("general quote validation bounds input while preserving display names as content", () => {
  const parsed = validateGeneralQuoteRequest(valid);
  assert.equal(parsed.email, "customer@example.com");
  assert.deepEqual(parsed.productInterest, ["Renamed customer-facing package"]);
  assert.throws(() => validateGeneralQuoteRequest({ ...valid, unknownPrice: 1 }));
  assert.throws(() => validateGeneralQuoteRequest({ ...valid, extraNotes: "x".repeat(8_001) }));
  assert.throws(() => validateGeneralQuoteRequest({ ...valid, interests: new Array(21).fill("x") }));
  assert.throws(() => validateGeneralQuoteRequest({ ...valid, productInterest: [42] }));
});

test("general quote validation preserves readable extraNotes line breaks only", () => {
  const parsed = validateGeneralQuoteRequest({
    ...valid,
    propertyType: "Single\nLine\u0000",
    extraNotes: "Configuration:\r\nYarbo Core\nBlower Module\u0000\u0007",
  });
  assert.equal(parsed.propertyType, "SingleLine");
  assert.equal(parsed.extraNotes, "Configuration:\nYarbo Core\nBlower Module");
});

test("public lead routes use bounded JSON and durable rate limiting", () => {
  for (const source of [generalRoute, pandagRoute]) {
    assert.match(source, /readLimitedJson\(request|readLimitedJson\(req/);
    assert.match(source, /requireLeadRateLimit\(/);
  }
});

test("shared admin login is protected by the database-backed limiter", () => {
  assert.match(adminLogin, /consumeDealerRateLimit\("admin_login"/);
  assert.match(adminLogin, /status: 429/);
  assert.match(adminLogin, /status: 503/);
});
