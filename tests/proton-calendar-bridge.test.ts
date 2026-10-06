import assert from "node:assert/strict";
import test from "node:test";
import { calendarBridge } from "../lib/calendar/bridge";

const now = new Date("2026-10-06T15:00:00Z");
const token = "synthetic-test-token-32-characters-minimum";
const feed = "https://calendar.proton.me/api/calendar/v1/url/synthetic/calendar.ics?key=synthetic";
const env = { NODE_ENV: "test" as const, PROTON_CALENDAR_BRIDGE_TOKEN: token, PROTON_CALENDAR_ICS_URL: feed };
const request = (suffix = "", method = "GET", auth = true) => new Request(`https://example.test/api/calendar/today${suffix}`, {
  method, headers: auth ? { Authorization: `Bearer ${token}` } : {},
});
const fixture = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:synthetic\r\nDTSTART:20261006T140000Z\r\nDTEND:20261006T150000Z\r\nSUMMARY:Morning meeting\r\nDESCRIPTION:Do not return this\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

test("authentication and non-GET requests never fetch the private feed", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error(feed); };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await calendarBridge(request("", method), env, fetcher, now)).status, 405);
  }
  assert.equal((await calendarBridge(request("", "GET", false), env, fetcher, now)).status, 401);
  assert.equal((await calendarBridge(request(), { NODE_ENV: "test" }, fetcher, now)).status, 503);
  assert.equal(calls, 0);
});

test("default date is today in Chicago, and only minimal event fields escape", async () => {
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(String(input), feed);
    assert.equal(options?.method, "GET");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    return new Response(fixture, { headers: { "Content-Type": "text/calendar" } });
  };
  const response = await calendarBridge(request(), env, fetcher, new Date("2026-10-07T03:00:00Z"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  const body = await response.json();
  assert.equal(body.date, "2026-10-06");
  assert.equal(body.timeZone, "America/Chicago");
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].title, "Morning meeting");
  assert.equal("description" in body.events[0], false);
  assert.equal("uid" in body.events[0], false);
  assert.equal(JSON.stringify(body).includes(feed), false);
  assert.equal(JSON.stringify(body).includes(token), false);
});

test("invalid dates, distant dates and attempts to override the upstream are rejected", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response(fixture); };
  for (const suffix of ["?date=2026-02-30", "?date=2027-10-06", "?url=https://example.test", "?date=2026-10-06&date=2026-10-07"]) {
    assert.equal((await calendarBridge(request(suffix), env, fetcher, now)).status, 400);
  }
  assert.equal(calls, 0);
});

test("only the fixed HTTPS Proton host can be fetched", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response(fixture); };
  for (const url of ["http://calendar.proton.me/a", "https://calendar.proton.me.attacker.test/a", "https://127.0.0.1/a", "https://calendar.proton.me:444/a", "https://user:pass@calendar.proton.me/a"]) {
    const response = await calendarBridge(request(), { ...env, PROTON_CALENDAR_ICS_URL: url }, fetcher, now);
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
});

test("transport debug logging fails closed before private data is fetched", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response(fixture); };
  for (const NODE_DEBUG of ["fetch", "undici", "http*", "*"]) {
    assert.equal((await calendarBridge(request(), { ...env, NODE_DEBUG }, fetcher, now)).status, 503);
  }
  assert.equal(calls, 0);
});

test("upstream and parse failures return fixed errors and never imply an empty calendar", async () => {
  const fetchers: Array<typeof fetch> = [
    async () => { throw new Error(`request failed ${feed} ${token}`); },
    async () => new Response("Upstream details", { status: 503 }),
    async () => new Response("not a calendar"),
    async () => new Response(fixture, { headers: { "content-length": "5000000" } }),
  ];
  for (const fetcher of fetchers) {
    const response = await calendarBridge(request(), env, fetcher, now);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Calendar temporarily unavailable" });
  }
});

test("secret-bearing links embedded in event text are omitted from the response", async () => {
  const fetcher: typeof fetch = async () => new Response(fixture.replace("Morning meeting", `Meeting ${feed}`));
  const response = await calendarBridge(request(), env, fetcher, now);
  assert.equal(response.status, 200);
  const body = JSON.stringify(await response.json());
  assert.equal(body.includes(feed), false);
  assert.equal(body.includes("key=synthetic"), false);
});

test("literal known keys are redacted even when event text is truncated", async () => {
  const title = `${token} key synthetic ${"x".repeat(940)} ${token}`;
  const fetcher: typeof fetch = async () => new Response(fixture.replace("Morning meeting", title));
  const response = await calendarBridge(request(), env, fetcher, now);
  assert.equal(response.status, 200);
  const body = JSON.stringify(await response.json());
  assert.equal(body.includes(token), false);
  assert.equal(body.includes("synthetic"), false);
  assert.equal(body.includes(token.slice(0, 10)), false);
});
