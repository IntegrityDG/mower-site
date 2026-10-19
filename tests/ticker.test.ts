import assert from "node:assert/strict";
import test from "node:test";

import { createTickerAdminHandlers } from "../lib/promotions/ticker-admin-handlers";
import { DEFAULT_TICKER_CONFIG, TICKER_MAX_SPEED, TICKER_MIN_SPEED, TICKER_MESSAGE_MAX, TICKER_MESSAGES_MAX, isSafeTickerLink, toPublicTickerSnapshot, validateTickerConfig, type TickerConfig, type TickerMessage } from "../lib/promotions/ticker";

const now = new Date("2026-10-19T18:00:00.000Z");
const message = (fields: Partial<TickerMessage> = {}): TickerMessage => ({ id: "a9bdcf9a-c73a-4e1b-9fbc-ff159c37ea8c", message: "Test promotion", active: true, link: null, startsAt: null, endsAt: null, ...fields });
const config = (fields: Partial<TickerConfig> = {}): TickerConfig => ({ ...DEFAULT_TICKER_CONFIG, enabled: true, messages: [message()], ...fields });
const put = (ticker: unknown, revision: unknown = 0) => new Request("http://local/api/admin/sales-specials/ticker", { method: "PUT", body: JSON.stringify({ ticker, revision }) });

test("ticker default is disabled, has no promotional claims and pauses on hover/focus", () => {
  assert.equal(DEFAULT_TICKER_CONFIG.enabled, false);
  assert.deepEqual(DEFAULT_TICKER_CONFIG.messages, []);
  assert.equal(DEFAULT_TICKER_CONFIG.pauseOnHover, true);
  assert.equal(validateTickerConfig(DEFAULT_TICKER_CONFIG).ok, true);
});

test("ticker validates practical speed boundaries, booleans and six-digit colors", () => {
  for (const speed of [TICKER_MIN_SPEED, 50, TICKER_MAX_SPEED]) assert.equal(validateTickerConfig(config({ speed })).ok, true);
  for (const speed of [0, -1, TICKER_MIN_SPEED - 1, TICKER_MAX_SPEED + 1, 50.1, Infinity, NaN, "50", null]) assert.equal(validateTickerConfig({ ...config(), speed }).ok, false);
  for (const enabled of [true, false]) for (const pauseOnHover of [true, false]) assert.equal(validateTickerConfig(config({ enabled, pauseOnHover })).ok, true);
  for (const field of ["enabled", "pauseOnHover"]) assert.equal(validateTickerConfig({ ...config(), [field]: "true" }).ok, false);
  for (const field of ["backgroundColor", "textColor", "accentColor"]) {
    assert.equal(validateTickerConfig({ ...config(), [field]: "#a1B2c3" }).ok, true);
    for (const color of ["red", "#fff", "#12345678", "#GGGGGG", "url(https://evil.test)", null]) assert.equal(validateTickerConfig({ ...config(), [field]: color }).ok, false);
  }
});

test("messages reject empty, multiline and overly long text without truncation", () => {
  for (const text of ["", "   ", "x".repeat(TICKER_MESSAGE_MAX + 1), "hello\nworld", "x\u0000y"]) assert.equal(validateTickerConfig(config({ messages: [message({ message: text })] })).ok, false);
  for (const text of ["x".repeat(TICKER_MESSAGE_MAX), "🌱".repeat(TICKER_MESSAGE_MAX), "<strong>literal HTML</strong>"]) {
    const parsed = validateTickerConfig(config({ messages: [message({ message: text })] }));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.messages[0].message, text);
  }
});

test("message arrays enforce identity uniqueness and bounded complete sequence", () => {
  assert.equal(validateTickerConfig(config({ messages: [] })).ok, true);
  const messages = Array.from({ length: TICKER_MESSAGES_MAX }, (_, index) => message({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));
  assert.equal(validateTickerConfig(config({ messages })).ok, true);
  assert.equal(validateTickerConfig(config({ messages: [...messages, message()] })).ok, false);
  assert.equal(validateTickerConfig(config({ messages: [message(), message()] })).ok, false);
  assert.equal(validateTickerConfig(config({ messages: [message({ id: "database-row" })] })).ok, false);
  assert.equal(validateTickerConfig({ ...config(), messages: null }).ok, false);
});

test("safe optional links accept site paths and HTTP(S), rejecting unsafe schemes and host escapes", () => {
  for (const link of ["/", "/products/yarbo?source=ticker#details", "https://example.com/sale", "http://localhost:3000/sale"]) {
    assert.equal(isSafeTickerLink(link), true, link);
    assert.equal(validateTickerConfig(config({ messages: [message({ link })] })).ok, true, link);
  }
  assert.equal(validateTickerConfig(config({ messages: [message({ link: null })] })).ok, true);
  for (const link of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,test", "vbscript:bad", "mailto:test@example.com", "//evil.test", "/\\evil.test", "https://user:pass@example.com", "https://", "https://example.com/with space", "https://example.com/\n", "x".repeat(2049)]) {
    assert.equal(isSafeTickerLink(link), false, link);
    assert.equal(validateTickerConfig(config({ messages: [message({ link })] })).ok, false, link);
  }
});

test("schedule dates require explicit timezone, valid calendar dates and increasing interval", () => {
  for (const startsAt of ["2026-03-08T01:30:00-06:00", "2026-03-08T03:30:00-05:00", "2026-11-01T01:30:00-05:00", "2026-11-01T01:30:00-06:00"]) {
    const parsed = validateTickerConfig(config({ messages: [message({ startsAt })] }));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.messages[0].startsAt, new Date(startsAt).toISOString());
  }
  for (const startsAt of ["2026-02-30T12:00:00Z", "2026-10-19T13:00", "not-a-date", "2026-10-19T25:00:00Z", "2026-10-19T12:00:00+99:00"]) assert.equal(validateTickerConfig(config({ messages: [message({ startsAt })] })).ok, false);
  for (const endsAt of ["2026-10-19T18:00:00Z", "2026-10-19T17:59:59Z"]) assert.equal(validateTickerConfig(config({ messages: [message({ startsAt: now.toISOString(), endsAt })] })).ok, false);
});

test("public schedule includes start, excludes end, handles Chicago DST offsets and keeps sequence", () => {
  const fields = [
    message({ id: "00000000-0000-4000-8000-000000000001", message: "No dates" }),
    message({ id: "00000000-0000-4000-8000-000000000002", message: "Future", startsAt: "2026-10-19T13:01:00-05:00" }),
    message({ id: "00000000-0000-4000-8000-000000000003", message: "Active", startsAt: "2026-10-19T13:00:00-05:00", endsAt: "2026-10-19T14:00:00-05:00" }),
    message({ id: "00000000-0000-4000-8000-000000000004", message: "Expired", endsAt: "2026-10-19T13:00:00-05:00" }),
    message({ id: "00000000-0000-4000-8000-000000000005", message: "Inactive", active: false }),
  ];
  const snapshot = toPublicTickerSnapshot(config({ messages: fields }), now);
  assert.deepEqual(snapshot.ticker.messages.map((item) => item.message), ["No dates", "Active"]);
  assert.equal(snapshot.nextChangeAt, "2026-10-19T18:01:00.000Z");
  assert.equal(snapshot.serverTime, now.toISOString());
  const repeatedHour = config({ messages: [message({ startsAt: "2026-11-01T01:30:00-05:00", endsAt: "2026-11-01T01:30:00-06:00" })] });
  assert.equal(toPublicTickerSnapshot(repeatedHour, new Date("2026-11-01T06:29:59Z")).ticker.messages.length, 0);
  assert.equal(toPublicTickerSnapshot(repeatedHour, new Date("2026-11-01T06:30:00Z")).ticker.messages.length, 1);
  assert.equal(toPublicTickerSnapshot(repeatedHour, new Date("2026-11-01T07:30:00Z")).ticker.messages.length, 0);
});

test("public projection hides disabled/future/private content and malformed configuration falls back safely", () => {
  const raw = { ...config(), updated_by: "private", messages: [{ ...message(), internal_note: "private" }] };
  const snapshot = toPublicTickerSnapshot(raw, now);
  assert.deepEqual(Object.keys(snapshot).sort(), ["nextChangeAt", "serverTime", "ticker"]);
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
  assert.equal(toPublicTickerSnapshot(config({ enabled: false }), now).ticker.messages.length, 0);
  const future = toPublicTickerSnapshot(config({ messages: [message({ message: "Private future promotion", startsAt: "2026-10-20T00:00:00Z" })] }), now);
  assert.equal(future.ticker.messages.length, 0);
  assert.equal(future.ticker.enabled, true);
  assert.equal(future.nextChangeAt, "2026-10-20T00:00:00.000Z");
  assert.equal(JSON.stringify(future).includes("Private future promotion"), false);
  for (const input of [null, {}, { ...config(), speed: -1 }, { ...config(), textColor: "bad" }]) assert.deepEqual(toPublicTickerSnapshot(input, now).ticker, DEFAULT_TICKER_CONFIG);
});

test("Admin authentication protects all ticker reads/writes before accessing persistence", async () => {
  let calls = 0;
  const handlers = createTickerAdminHandlers({ isAdmin: async () => false, read: async () => { calls++; return null; }, save: async () => { calls++; return null; } });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.PUT(put(config()))).status, 401);
  assert.equal(calls, 0);
});

test("Admin atomic saves persist creation, edits, duplicate identity, sequence and delete", async () => {
  let stored = { ticker: config({ messages: [] }), revision: 0 };
  const handlers = createTickerAdminHandlers({ isAdmin: async () => true, read: async () => stored, save: async (ticker, revision) => revision !== stored.revision ? null : (stored = { ticker, revision: revision + 1 }) });
  const first = message();
  assert.equal((await handlers.PUT(put(config({ messages: [first] }), 0))).status, 200);
  const copy = { ...first, id: "00000000-0000-4000-8000-000000000006", message: "Edited duplicate", active: false };
  assert.equal((await handlers.PUT(put(config({ messages: [copy, { ...first, message: "Edited original" }] }), 1))).status, 200);
  assert.deepEqual(stored.ticker.messages.map((item) => item.message), ["Edited duplicate", "Edited original"]);
  assert.equal((await handlers.PUT(put(config({ messages: [copy] }), 2))).status, 200);
  const response = await handlers.GET();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), stored);
  assert.equal(stored.revision, 3);
  assert.equal(stored.ticker.messages.length, 1);
});

test("Admin stale revisions cannot overwrite newer saved settings", async () => {
  const handlers = createTickerAdminHandlers({ isAdmin: async () => true, read: async () => ({ ticker: config(), revision: 1 }), save: async () => null });
  const response = await handlers.PUT(put(config(), 0));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /another Admin session/);
});

test("Admin rejects invalid revisions/configuration/JSON without saving and handles persistence failure", async () => {
  let saves = 0;
  const handlers = createTickerAdminHandlers({ isAdmin: async () => true, read: async () => { throw new Error("private error"); }, save: async () => { saves++; throw new Error("private error"); } });
  for (const revision of [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await handlers.PUT(put(config(), revision))).status, 400);
  assert.equal((await handlers.PUT(new Request("http://local", { method: "PUT", body: "{" }))).status, 400);
  const invalid = await handlers.PUT(put(config({ speed: 0 })));
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).errors.speed);
  assert.equal(saves, 0);
  assert.equal((await handlers.GET()).status, 503);
  const failed = await handlers.PUT(put(config()));
  assert.equal(failed.status, 500);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /private error/);
});
