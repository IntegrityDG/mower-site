import assert from "node:assert/strict";
import test from "node:test";
import {
  chicagoClock, composeCalendarDigest, DIGEST_RECIPIENT, inDigestWindow, loadCalendarDigest,
  runDailyDigest, type DigestClaim, type DigestDependencies, type DigestPayload,
} from "../lib/calendar/digest";

const bridgeToken = "synthetic-bridge-token-at-least-32-characters";
const cronToken = "synthetic-cron-private-token";
const feedUrl = "https://calendar.proton.me/api/calendar/v1/url/synthetic-private-feed/calendar.ics?key=synthetic-feed-key";
const now = new Date("2026-10-06T14:30:00Z");
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", VERCEL_ENV: "production", PROTON_CALENDAR_BRIDGE_TOKEN: bridgeToken,
  CRON_SECRET: cronToken, PROTON_CALENDAR_ICS_URL: feedUrl,
  DEMO_FROM_EMAIL: "IDS <briefing@example.test>", RESEND_API_KEY: "synthetic-resend-key",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-db-private-key",
};
const fixture = (summary = "Morning meeting", details = "Bring mower measurements") => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:synthetic-event",
  "DTSTART;TZID=America/Chicago:20261006T150000", "DTEND;TZID=America/Chicago:20261006T160000",
  `SUMMARY:${summary}`, "LOCATION:IDS showroom", `DESCRIPTION:${details}`, "END:VEVENT", "END:VCALENDAR", "",
].join("\r\n");

function request(method = "POST", token = method === "GET" ? cronToken : bridgeToken, query = "", body?: string) {
  return new Request(`https://example.test/api/cron/proton-calendar-digest${query}`, {
    method, headers: { Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body }),
  });
}

function fakeDependencies() {
  let snapshot: DigestPayload | undefined;
  let firstAttemptAt = now.toISOString();
  let state: DigestClaim["state"] = "claimed";
  let locked = false;
  let source = fixture();
  let failSend = false;
  let failFinish = false;
  const sent: Array<DigestPayload & { idempotencyKey: string }> = [];
  const outcomes: string[] = [];
  let feedCalls = 0;
  let readCalls = 0;
  let claimCalls = 0;
  const dependencies: DigestDependencies = {
    fetchFeed: async () => { feedCalls++; return new Response(source); },
    readExisting: async () => { readCalls++; return snapshot ?? null; },
    claim: async (candidate) => {
      claimCalls++;
      snapshot ??= { ...candidate };
      if (state === "sent" || state === "needs_review") return { state, date: snapshot.date, eventCount: snapshot.eventCount };
      if (locked) return { state: "busy", date: snapshot.date, eventCount: snapshot.eventCount };
      locked = true;
      return {
        ...snapshot, state: "claimed", leaseId: "synthetic-lease-id", firstAttemptAt,
        idempotencyKey: `proton-calendar-digest/${snapshot.date}/v1`,
      };
    },
    finish: async (date, _lease, outcome) => {
      outcomes.push(outcome);
      if (failFinish) throw new Error(`private error ${feedUrl} ${bridgeToken}`);
      locked = false;
      if (outcome === "sent" || outcome === "needs_review") state = outcome;
      return { date, state: outcome };
    },
    send: async (payload) => {
      sent.push(payload);
      if (failSend) throw new Error(`private provider error ${env.RESEND_API_KEY}`);
      return { id: "synthetic-provider-id" };
    },
  };
  return {
    dependencies, sent, outcomes,
    get feedCalls() { return feedCalls; }, get readCalls() { return readCalls; }, get claimCalls() { return claimCalls; },
    setSource(value: string) { source = value; },
    setFirstAttempt(value: string) { firstAttemptAt = value; },
    setSendFailure(value: boolean) { failSend = value; },
    setFinishFailure(value: boolean) { failFinish = value; },
    expireLease() { locked = false; },
  };
}

test("Chicago schedule covers exact DST transitions and keeps both UTC-hour schedules before 10 AM", () => {
  const checks: Array<[string, string, boolean]> = [
    ["2026-03-07T15:30:00Z", "2026-03-07", true],
    ["2026-03-08T14:30:00Z", "2026-03-08", true],
    ["2026-03-08T15:30:00Z", "2026-03-08", false],
    ["2026-10-31T14:30:00Z", "2026-10-31", true],
    ["2026-11-01T14:30:00Z", "2026-11-01", false],
    ["2026-11-01T15:30:00Z", "2026-11-01", true],
    ["2026-10-06T14:29:59Z", "2026-10-06", false],
    ["2026-10-06T14:59:59Z", "2026-10-06", true],
    ["2026-10-06T15:00:00Z", "2026-10-06", false],
    ["2026-10-07T04:59:59Z", "2026-10-06", false],
  ];
  for (const [instant, date, allowed] of checks) {
    assert.equal(chicagoClock(new Date(instant)).date, date);
    assert.equal(inDigestWindow(new Date(instant)), allowed);
  }
});

test("only protected cron GET and bridge-token POST can initiate the job", async () => {
  const fake = fakeDependencies();
  for (const method of ["HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal((await runDailyDigest(request(method), env, fake.dependencies, now)).status, 405);
  }
  for (const req of [request("GET", bridgeToken), request("POST", cronToken), request("POST", "wrong"), request("POST", "éééé")]) {
    assert.equal((await runDailyDigest(req, env, fake.dependencies, now)).status, 401);
  }
  assert.equal((await runDailyDigest(request(), { ...env, PROTON_CALENDAR_BRIDGE_TOKEN: undefined }, fake.dependencies, now)).status, 503);
  assert.equal((await runDailyDigest(request("GET"), { ...env, CRON_SECRET: "too-short" }, fake.dependencies, now)).status, 503);
  assert.equal(fake.feedCalls, 0);
  assert.equal(fake.readCalls, 0);
  assert.equal(fake.claimCalls, 0);
});

test("query overrides, request bodies, preview builds and opt-in transport debug fail before any private work", async () => {
  const fake = fakeDependencies();
  for (const query of ["?date=2026-10-06", "?to=someone@example.test", "?url=https://example.test"]) {
    assert.equal((await runDailyDigest(request("POST", bridgeToken, query), env, fake.dependencies, now)).status, 400);
  }
  assert.equal((await runDailyDigest(request("POST", bridgeToken, "", "{}"), env, fake.dependencies, now)).status, 400);
  for (const changed of [{ VERCEL_ENV: "preview" }, { NODE_ENV: "development" }, { NODE_DEBUG: "undici" }, { NODE_DEBUG: "http*" }, { RESEND_BASE_URL: "https://elsewhere.test" }]) {
    assert.equal((await runDailyDigest(request(), { ...env, ...changed } as NodeJS.ProcessEnv, fake.dependencies, now)).status, 503);
  }
  assert.equal(fake.feedCalls, 0);
  assert.equal(fake.readCalls, 0);
});

test("wrong-hour cron returns only skip metadata and makes no network requests", async () => {
  const fake = fakeDependencies();
  const response = await runDailyDigest(request("GET"), env, fake.dependencies, new Date("2026-10-06T15:30:00Z"));
  assert.deepEqual(await response.json(), { date: "2026-10-06", status: "skipped", eventCount: 0 });
  assert.equal(fake.feedCalls, 0);
  assert.equal(fake.readCalls, 0);
  assert.equal(fake.claimCalls, 0);
});

test("secure Proton loader rejects alternate hosts, redirects and oversized/invalid responses", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls++;
    assert.equal(String(input), feedUrl);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    return new Response(fixture());
  };
  const parsed = await loadCalendarDigest(env, "2026-10-06", fetcher);
  assert.equal(parsed.events.length, 1);
  for (const url of ["http://calendar.proton.me/a", "https://calendar.proton.me.attacker.test/a", "https://user:secret@calendar.proton.me/a", "https://calendar.proton.me:444/a", "https://calendar.proton.me/a#secret"]) {
    await assert.rejects(loadCalendarDigest({ ...env, PROTON_CALENDAR_ICS_URL: url }, "2026-10-06", fetcher));
  }
  assert.equal(calls, 1);
  for (const response of [new Response("bad", { status: 302 }), new Response("bad"), new Response(fixture(), { headers: { "content-length": "4000000" } }), new Response("x".repeat(2 * 1024 * 1024 + 1))]) {
    await assert.rejects(loadCalendarDigest(env, "2026-10-06", async () => response));
  }
});

test("digest email includes only title, Central times, location and preparation; endpoint exposes metadata only", async () => {
  const fake = fakeDependencies();
  const response = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  assert.deepEqual(await response.json(), { date: "2026-10-06", status: "sent", eventCount: 1 });
  assert.equal(fake.sent.length, 1);
  assert.equal(fake.sent[0].to, DIGEST_RECIPIENT);
  assert.equal(fake.sent[0].subject, "IDS Daily Proton Calendar Brief — 2026-10-06");
  assert.match(fake.sent[0].text, /3:00 PM CDT – 4:00 PM CDT/);
  assert.match(fake.sent[0].text, /Location: IDS showroom/);
  assert.match(fake.sent[0].text, /Bring mower measurements/);
  assert.equal(fake.sent[0].text.includes("synthetic-event"), false);
  assert.equal(fake.sent[0].text.includes("BEGIN:VCALENDAR"), false);
});

test("calendar text redacts every known credential before email delivery", async () => {
  const fake = fakeDependencies();
  const secrets = [feedUrl, bridgeToken, cronToken, env.RESEND_API_KEY!, env.SUPABASE_SERVICE_ROLE_KEY!, "synthetic-feed-key", "synthetic-private-feed"];
  fake.setSource(fixture("Meeting", `Bring notes ${secrets.join(" ")} https://example.test/private <script>private html</script> <b>check battery</b>`));
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 200);
  for (const secret of secrets) assert.equal(fake.sent[0].text.includes(secret), false);
  assert.equal(fake.sent[0].text.includes("https://"), false);
  assert.equal(fake.sent[0].text.includes("<script>"), false);
  assert.match(fake.sent[0].text, /check battery/);
});

test("concurrent invocations and future same-date attempts cannot duplicate successful delivery", async () => {
  const fake = fakeDependencies();
  const responses = await Promise.all([
    runDailyDigest(request(), env, fake.dependencies, now),
    runDailyDigest(request(), env, fake.dependencies, now),
  ]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(bodies.some(body => body.status === "sent"), true);
  assert.equal(fake.sent.length, 1);
  const again = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.deepEqual(await again.json(), { date: "2026-10-06", status: "already_sent", eventCount: 1 });
  assert.equal(fake.sent.length, 1);
});

test("retry after uncertain send reuses exact persisted body and idempotency key despite feed edits", async () => {
  const fake = fakeDependencies();
  fake.setSendFailure(true);
  const failed = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { date: "2026-10-06", status: "retry_required", eventCount: 1 });
  fake.setSource(fixture("Changed meeting", "New details"));
  fake.setSendFailure(false);
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 200);
  assert.equal(fake.sent.length, 2);
  assert.deepEqual(fake.sent[1], fake.sent[0]);
});

test("a sent snapshot remains confirmed when Proton's feed is subsequently unavailable", async () => {
  const fake = fakeDependencies();
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 200);
  const calls = fake.feedCalls;
  fake.dependencies.fetchFeed = async () => { throw new Error(feedUrl); };
  const again = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.deepEqual(await again.json(), { date: "2026-10-06", status: "already_sent", eventCount: 1 });
  assert.equal(fake.sent.length, 1);
  assert.equal(fake.feedCalls, calls);
});

test("an uncertain delivery retries its immutable snapshot without reading an unavailable feed", async () => {
  const fake = fakeDependencies();
  fake.setSendFailure(true);
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 503);
  const original = { ...fake.sent[0] };
  const calls = fake.feedCalls;
  fake.dependencies.fetchFeed = async () => { throw new Error(feedUrl); };
  fake.setSendFailure(false);
  const again = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.deepEqual(await again.json(), { date: "2026-10-06", status: "sent", eventCount: 1 });
  assert.deepEqual(fake.sent[1], original);
  assert.equal(fake.feedCalls, calls);
});

test("malformed persisted snapshots fail closed before claim or send", async () => {
  const fake = fakeDependencies();
  const original: DigestPayload = {
    date: "2026-10-06", from: env.DEMO_FROM_EMAIL!, to: DIGEST_RECIPIENT,
    subject: "IDS Daily Proton Calendar Brief — 2026-10-06", text: "Morning agenda", eventCount: 1,
  };
  for (const change of [{ date: "2026-10-07" }, { to: "other@example.test" }, { subject: "Different subject" }, { eventCount: -1 }, { from: "sender\r\ninjection" }]) {
    fake.dependencies.readExisting = async () => ({ ...original, ...change }) as DigestPayload;
    assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 503);
  }
  assert.equal(fake.claimCalls, 0);
  assert.equal(fake.feedCalls, 0);
  assert.equal(fake.sent.length, 0);
});

test("process failure after provider acceptance can retry only after a lease with the same stored payload", async () => {
  const fake = fakeDependencies();
  fake.setFinishFailure(true);
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 503);
  assert.deepEqual(await (await runDailyDigest(request(), env, fake.dependencies, now)).json(), { date: "2026-10-06", status: "busy", eventCount: 1 });
  assert.equal(fake.sent.length, 1);
  fake.expireLease();
  fake.setFinishFailure(false);
  fake.setSource(fixture("Changed after crash"));
  assert.equal((await runDailyDigest(request(), env, fake.dependencies, now)).status, 200);
  assert.deepEqual(fake.sent[1], fake.sent[0]);
});

test("new claims set slightly after invocation time send successfully; excessive future timestamps fail closed", async () => {
  const delayed = fakeDependencies();
  delayed.setFirstAttempt("2026-10-06T14:30:05Z");
  assert.equal((await runDailyDigest(request(), env, delayed.dependencies, now)).status, 200);
  assert.equal(delayed.sent.length, 1);
  const future = fakeDependencies();
  future.setFirstAttempt("2026-10-06T14:35:00Z");
  assert.equal((await runDailyDigest(request(), env, future.dependencies, now)).status, 503);
  assert.equal(future.sent.length, 0);
});

test("unresolved attempts after 23 hours and changed sender fail closed instead of starting a new email", async () => {
  const fake = fakeDependencies();
  fake.setFirstAttempt("2026-10-06T05:30:00Z");
  const response = await runDailyDigest(request(), env, fake.dependencies, new Date("2026-10-07T04:30:00Z"));
  assert.deepEqual(await response.json(), { date: "2026-10-06", status: "needs_review", eventCount: 1 });
  assert.equal(fake.sent.length, 0);
  assert.deepEqual(fake.outcomes, ["needs_review"]);

  const changed = fakeDependencies();
  changed.setSendFailure(true);
  await runDailyDigest(request(), env, changed.dependencies, now);
  const before = changed.sent.length;
  const mismatch = await runDailyDigest(request(), { ...env, DEMO_FROM_EMAIL: "New <other@example.test>" }, changed.dependencies, now);
  assert.deepEqual(await mismatch.json(), { date: "2026-10-06", status: "needs_review", eventCount: 1 });
  assert.equal(changed.sent.length, before);
});

test("empty calendars produce an explicit agenda; all-day and overnight events remain understandable", () => {
  const empty = composeCalendarDigest({ date: "2026-10-06", timeZone: "America/Chicago", events: [] }, env.DEMO_FROM_EMAIL!);
  assert.match(empty.text, /No calendar events for today/);
  const dates = composeCalendarDigest({ date: "2026-10-06", timeZone: "America/Chicago", events: [
    { title: "All-day preparation", start: "2026-10-06", end: "2026-10-07", allDay: true },
    { title: "Overnight", start: "2026-10-05T23:30:00-05:00", end: "2026-10-06T01:00:00-05:00", allDay: false },
  ] }, env.DEMO_FROM_EMAIL!);
  assert.match(dates.text, /All day \(start 2026-10-06; exclusive end 2026-10-07\)/);
  assert.match(dates.text, /Oct 5, 2026, 11:30 PM CDT – 1:00 AM CDT/);
});

test("an empty parsed calendar sends a clear no-events agenda without inventing events", async () => {
  const fake = fakeDependencies();
  fake.setSource("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n");
  const response = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.deepEqual(await response.json(), { date: "2026-10-06", status: "sent", eventCount: 0 });
  assert.match(fake.sent[0].text, /No calendar events for today/);
});

test("oversized rendered digests fail closed without silently dropping events", () => {
  const events = Array.from({ length: 300 }, () => ({
    title: "Meeting", start: "2026-10-06T15:00:00-05:00", end: "2026-10-06T16:00:00-05:00",
    allDay: false, description: "x".repeat(2000),
  }));
  assert.throws(() => composeCalendarDigest({ date: "2026-10-06", timeZone: "America/Chicago", events }, env.DEMO_FROM_EMAIL!));
});

test("provider/database/upstream errors never expose secrets or create a misleading empty digest", async () => {
  const fake = fakeDependencies();
  fake.dependencies.fetchFeed = async () => { throw new Error(feedUrl); };
  const unavailable = await runDailyDigest(request(), env, fake.dependencies, now);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "Calendar digest temporarily unavailable" });
  assert.equal(fake.sent.length, 0);
  assert.equal(fake.claimCalls, 0);
});
