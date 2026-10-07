import assert from "node:assert/strict";
import test from "node:test";
import { CalendarParseError, parseBriefing, parseCalendarDigest } from "../lib/calendar/proton";

const calendar = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IDS//Calendar tests//EN", ...events, "END:VCALENDAR", ""].join("\r\n");
const event = (uid: string, ...lines: string[]) => ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20260101T000000Z", ...lines, "END:VEVENT"].join("\r\n");

test("Chicago day includes timezone-aware and UTC events, overnight overlap and zero duration", () => {
  const result = parseBriefing(calendar(
    event("local", "SUMMARY:Morning", "DTSTART;TZID=America/Chicago:20261006T090000", "DTEND;TZID=America/Chicago:20261006T093000"),
    event("utc", "SUMMARY:UTC", "DTSTART:20261007T040000Z", "DURATION:PT30M"),
    event("overnight", "SUMMARY:Overnight", "DTSTART:20261006T040000Z", "DTEND:20261006T060000Z"),
    event("point", "SUMMARY:Point", "DTSTART:20261006T150000Z"),
    event("ended", "SUMMARY:Ended at midnight", "DTSTART:20261006T040000Z", "DTEND:20261006T050000Z"),
    event("next", "SUMMARY:Tomorrow", "DTSTART:20261007T050000Z", "DTEND:20261007T060000Z"),
  ), "2026-10-06");
  assert.equal(result.timeZone, "America/Chicago");
  assert.deepEqual(result.events.map((item) => item.title), ["Overnight", "Morning", "Point", "UTC"]);
  assert.equal(result.events[1].start, "2026-10-06T09:00:00-05:00");
  assert.equal(result.events[3].start, "2026-10-06T23:00:00-05:00");
});

test("all-day dates keep the intended date and DTEND is exclusive", () => {
  const text = calendar(
    event("all", "SUMMARY:Today", "DTSTART;VALUE=DATE:20261006", "DTEND;VALUE=DATE:20261007"),
    event("span", "SUMMARY:Spanning", "DTSTART;VALUE=DATE:20261005", "DTEND;VALUE=DATE:20261007"),
    event("ended", "SUMMARY:Yesterday", "DTSTART;VALUE=DATE:20261005", "DTEND;VALUE=DATE:20261006"),
    event("default", "SUMMARY:Default end", "DTSTART;VALUE=DATE:20261006"),
  );
  const result = parseBriefing(text, "2026-10-06");
  assert.equal(result.events.length, 3);
  assert.deepEqual(result.events.find((item) => item.title === "Today"), { title: "Today", start: "2026-10-06", end: "2026-10-07", allDay: true });
  assert.equal(parseBriefing(text, "2026-10-07").events.length, 0);
});

test("daily RRULE keeps Chicago wall time across fall DST and respects COUNT", () => {
  const text = calendar(event("dst", "SUMMARY:Daily", "DTSTART;TZID=America/Chicago:20261031T090000", "DTEND;TZID=America/Chicago:20261031T100000", "RRULE:FREQ=DAILY;COUNT=3"));
  assert.equal(parseBriefing(text, "2026-10-31").events[0].start, "2026-10-31T09:00:00-05:00");
  assert.equal(parseBriefing(text, "2026-11-01").events[0].start, "2026-11-01T09:00:00-06:00");
  assert.equal(parseBriefing(text, "2026-11-03").events.length, 0);
});

test("RRULE generated spring-gap instances are skipped without consuming COUNT", () => {
  const text = calendar(event("gap-series", "DTSTART;TZID=America/Chicago:20260307T023000", "DURATION:PT30M", "RRULE:FREQ=DAILY;COUNT=3"));
  assert.equal(parseBriefing(text, "2026-03-07").events.length, 1);
  assert.equal(parseBriefing(text, "2026-03-08").events.length, 0);
  assert.equal(parseBriefing(text, "2026-03-09").events[0].start, "2026-03-09T02:30:00-05:00");
  assert.equal(parseBriefing(text, "2026-03-10").events[0].start, "2026-03-10T02:30:00-05:00");
  assert.equal(parseBriefing(text, "2026-03-11").events.length, 0);
});

test("spring gap uses pre-transition offset and fall ambiguity selects first occurrence", () => {
  assert.equal(parseBriefing(calendar(event("gap", "DTSTART;TZID=America/Chicago:20260308T023000", "DURATION:PT30M")), "2026-03-08").events[0].start, "2026-03-08T03:30:00-05:00");
  assert.equal(parseBriefing(calendar(event("ambiguous", "DTSTART;TZID=America/Chicago:20261101T013000", "DURATION:PT30M")), "2026-11-01").events[0].start, "2026-11-01T01:30:00-05:00");
});

test("DURATION distinguishes nominal days from elapsed hours across DST", () => {
  const text = calendar(
    event("nominal", "SUMMARY:Nominal day", "DTSTART;TZID=America/Chicago:20260307T120000", "DURATION:P1D"),
    event("elapsed", "SUMMARY:Elapsed day", "DTSTART;TZID=America/Chicago:20260307T120000", "DURATION:PT24H"),
  );
  const events = parseBriefing(text, "2026-03-08").events;
  assert.equal(events.find((item) => item.title === "Nominal day")?.end, "2026-03-08T12:00:00-05:00");
  assert.equal(events.find((item) => item.title === "Elapsed day")?.end, "2026-03-08T13:00:00-05:00");
});

test("EXDATE removes only the matching hourly occurrence", () => {
  const text = calendar(event("exdate", "SUMMARY:Hourly", "DTSTART;TZID=America/Chicago:20261006T090000", "DURATION:PT30M", "RRULE:FREQ=HOURLY;COUNT=3", "EXDATE;TZID=America/Chicago:20261006T100000"));
  assert.deepEqual(parseBriefing(text, "2026-10-06").events.map((item) => item.start), ["2026-10-06T09:00:00-05:00", "2026-10-06T11:00:00-05:00"]);
});

test("exceptions moved into and out of today, cancellation and order before master", () => {
  const text = calendar(
    event("series", "SUMMARY:Moved into today", "RECURRENCE-ID;TZID=America/Chicago:20261008T090000", "DTSTART;TZID=America/Chicago:20261006T130000", "DTEND;TZID=America/Chicago:20261006T140000"),
    event("series", "SUMMARY:Series", "DTSTART;TZID=America/Chicago:20261005T090000", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=4"),
    event("series", "SUMMARY:Moved out", "RECURRENCE-ID;TZID=America/Chicago:20261006T090000", "DTSTART;TZID=America/Chicago:20261009T090000", "DURATION:PT1H"),
    event("series", "RECURRENCE-ID;TZID=America/Chicago:20261007T090000", "STATUS:CANCELLED"),
  );
  assert.deepEqual(parseBriefing(text, "2026-10-06").events.map((item) => item.title), ["Moved into today"]);
  assert.equal(parseBriefing(text, "2026-10-07").events.length, 0);
  assert.equal(parseBriefing(text, "2026-10-08").events.length, 0);
  assert.equal(parseBriefing(text, "2026-10-09").events[0].title, "Moved out");
});

test("RECURRENCE-ID in another timezone suppresses the same instant of the original", () => {
  const text = calendar(
    event("other-zone", "SUMMARY:Original", "DTSTART;TZID=America/Chicago:20261005T090000", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=3"),
    event("other-zone", "SUMMARY:Moved", "RECURRENCE-ID;TZID=America/New_York:20261006T100000", "DTSTART;TZID=America/Chicago:20261007T150000", "DURATION:PT1H"),
  );
  assert.equal(parseBriefing(text, "2026-10-06").events.length, 0);
  assert.deepEqual(parseBriefing(text, "2026-10-07").events.map((item) => item.title), ["Original", "Moved"]);
});

test("a cancelled master without DTSTART suppresses its series", () => {
  const text = calendar(
    event("cancel", "SUMMARY:Base", "DTSTART:20261006T150000Z", "RRULE:FREQ=DAILY;COUNT=3"),
    event("cancel", "SEQUENCE:1", "STATUS:CANCELLED"),
  );
  assert.deepEqual(parseBriefing(text, "2026-10-06").events, []);
});

test("RANGE THISANDFUTURE shifts later occurrences and direct override takes precedence", () => {
  const text = calendar(
    event("range", "SUMMARY:Base", "DTSTART;TZID=America/Chicago:20261004T090000", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=6"),
    event("range", "SUMMARY:Shifted", "RECURRENCE-ID;TZID=America/Chicago;RANGE=THISANDFUTURE:20261005T090000", "DTSTART;TZID=America/Chicago:20261005T110000", "DURATION:PT2H"),
    event("range", "SUMMARY:Direct", "RECURRENCE-ID;TZID=America/Chicago:20261007T090000", "DTSTART;TZID=America/Chicago:20261007T150000", "DURATION:PT30M"),
  );
  const shifted = parseBriefing(text, "2026-10-06").events;
  assert.equal(shifted.length, 1);
  assert.equal(shifted[0].title, "Shifted");
  assert.equal(shifted[0].start, "2026-10-06T11:00:00-05:00");
  assert.equal(shifted[0].end, "2026-10-06T13:00:00-05:00");
  assert.equal(parseBriefing(text, "2026-10-07").events[0].start, "2026-10-07T15:00:00-05:00");
});

test("RANGE shifted backward into today scans beyond the original day", () => {
  const text = calendar(
    event("range", "SUMMARY:Base", "DTSTART;TZID=America/Chicago:20261008T090000", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=4"),
    event("range", "SUMMARY:Shifted", "RECURRENCE-ID;TZID=America/Chicago;RANGE=THISANDFUTURE:20261008T090000", "DTSTART;TZID=America/Chicago:20261004T090000", "DURATION:PT1H"),
  );
  assert.equal(parseBriefing(text, "2026-10-06").events[0].start, "2026-10-06T09:00:00-05:00");
});

test("floating times are interpreted in Chicago independently of the host", () => {
  const text = calendar(event("floating", "SUMMARY:Floating", "DTSTART:20261006T090000", "DTEND:20261006T093000", "RRULE:FREQ=DAILY;UNTIL=20261007T090000", "EXDATE:20261007T090000"));
  assert.equal(parseBriefing(text, "2026-10-06").events[0].start, "2026-10-06T09:00:00-05:00");
  assert.equal(parseBriefing(text, "2026-10-07").events.length, 0);
});

test("floating UNTIL is inclusive and preserves its resolved zone in recurrence clones", () => {
  const text = calendar(event("until", "DTSTART:20261006T090000", "DURATION:PT30M", "RRULE:FREQ=DAILY;UNTIL=20261007T090000"));
  assert.equal(parseBriefing(text, "2026-10-07").events[0].start, "2026-10-07T09:00:00-05:00");
  assert.equal(parseBriefing(text, "2026-10-08").events.length, 0);
});

test("embedded VTIMEZONE overrides ICU rules and custom TZIDs are supported", () => {
  const zone = ["BEGIN:VTIMEZONE", "TZID:Private/Fixed", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0200", "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
  const text = calendar(zone, event("custom", "SUMMARY:Custom", "DTSTART;TZID=Private/Fixed:20261006T090000", "DTEND;TZID=Private/Fixed:20261006T100000"));
  assert.equal(parseBriefing(text, "2026-10-06").events[0].start, "2026-10-06T02:00:00-05:00");
});

test("embedded timezone definitions do not contaminate another feed or IANA fallback", () => {
  const definition = (offset: string) => ["BEGIN:VTIMEZONE", "TZID:America/Chicago", "BEGIN:STANDARD", "DTSTART:19700101T000000", `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
  const local = event("local", "DTSTART;TZID=America/Chicago:20261006T090000", "DURATION:PT1H");
  assert.equal(parseBriefing(calendar(definition("+0200"), local), "2026-10-06").events[0].start, "2026-10-06T02:00:00-05:00");
  assert.equal(parseBriefing(calendar(definition("+0100"), local), "2026-10-06").events[0].start, "2026-10-06T03:00:00-05:00");
  assert.equal(parseBriefing(calendar(local), "2026-10-06").events[0].start, "2026-10-06T09:00:00-05:00");
});

test("embedded DST rules use the first ambiguous time and skip generated gaps", () => {
  const zone = ["BEGIN:VTIMEZONE", "TZID:Private/Chicago", "BEGIN:STANDARD", "DTSTART:20071104T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0600", "END:STANDARD", "BEGIN:DAYLIGHT", "DTSTART:20070311T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0500", "END:DAYLIGHT", "END:VTIMEZONE"].join("\r\n");
  const ambiguous = calendar(zone, event("ambiguous", "DTSTART;TZID=Private/Chicago:20261101T013000", "DURATION:PT30M"));
  assert.equal(parseBriefing(ambiguous, "2026-11-01").events[0].start, "2026-11-01T01:30:00-05:00");
  const gap = calendar(zone, event("gap", "DTSTART;TZID=Private/Chicago:20260307T023000", "DURATION:PT30M", "RRULE:FREQ=DAILY;COUNT=3"));
  assert.equal(parseBriefing(gap, "2026-03-08").events.length, 0);
  assert.equal(parseBriefing(gap, "2026-03-10").events[0].start, "2026-03-10T02:30:00-05:00");
});

test("duplicate overrides use newest sequence and unrelated UIDs remain separate", () => {
  const text = calendar(
    event("a", "SUMMARY:A", "DTSTART:20261006T150000Z", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=2"),
    event("b", "SUMMARY:B", "DTSTART:20261006T150000Z", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=2"),
    event("a", "SEQUENCE:2", "SUMMARY:Newest", "RECURRENCE-ID:20261006T150000Z", "DTSTART:20261006T170000Z", "DURATION:PT1H"),
    event("a", "SEQUENCE:1", "SUMMARY:Old", "RECURRENCE-ID:20261006T150000Z", "DTSTART:20261006T180000Z", "DURATION:PT1H"),
  );
  assert.deepEqual(parseBriefing(text, "2026-10-06").events.map((item) => item.title), ["B", "Newest"]);
});

test("RDATE and date-only EXDATE participate in expansion", () => {
  const text = calendar(event("dates", "SUMMARY:Days", "DTSTART;VALUE=DATE:20261005", "RRULE:FREQ=DAILY;COUNT=2", "RDATE;VALUE=DATE:20261008", "EXDATE;VALUE=DATE:20261006"));
  assert.equal(parseBriefing(text, "2026-10-06").events.length, 0);
  assert.equal(parseBriefing(text, "2026-10-08").events[0].start, "2026-10-08");
});

test("RDATE-only recurrence includes DTSTART and applies its EXDATE", () => {
  const text = calendar(event("rdate-only", "DTSTART:20261006T140000Z", "DURATION:PT1H", "RDATE:20261007T140000Z"));
  assert.equal(parseBriefing(text, "2026-10-06").events[0].start, "2026-10-06T09:00:00-05:00");
  assert.equal(parseBriefing(text, "2026-10-07").events.length, 1);
  const excluded = calendar(event("excluded-start", "DTSTART:20261006T140000Z", "DURATION:PT1H", "RDATE:20261007T140000Z", "EXDATE:20261006T140000Z"));
  assert.equal(parseBriefing(excluded, "2026-10-06").events.length, 0);
});

test("RDATE PERIOD uses its own end and duration with EXDATE and override precedence", () => {
  const text = calendar(
    event("periods", "SUMMARY:Periods", "DTSTART:20261005T140000Z", "DURATION:PT1H", "RDATE;VALUE=PERIOD:20261006T140000Z/20261006T180000Z,20261006T190000Z/PT2H,20261006T220000Z/PT1H", "EXDATE:20261006T220000Z"),
    event("periods", "SUMMARY:Override", "RECURRENCE-ID:20261006T190000Z", "DTSTART:20261006T193000Z", "DURATION:PT30M"),
  );
  const events = parseBriefing(text, "2026-10-06").events;
  assert.equal(events.length, 2);
  assert.equal(events[0].start, "2026-10-06T09:00:00-05:00");
  assert.equal(events[0].end, "2026-10-06T13:00:00-05:00");
  assert.equal(events[1].title, "Override");
  assert.equal(events[1].start, "2026-10-06T14:30:00-05:00");
  assert.equal(events[1].end, "2026-10-06T15:00:00-05:00");
  const duration = calendar(event("duration-period", "DTSTART:20261005T140000Z", "DURATION:PT1H", "RDATE;VALUE=PERIOD:20261006T140000Z/PT2H"));
  assert.equal(parseBriefing(duration, "2026-10-06").events[0].end, "2026-10-06T11:00:00-05:00");
});

test("briefing strips nonessential fields and URLs from printable fields", () => {
  const result = parseBriefing(calendar(event("private-id", "SUMMARY:Meeting https://example.test/private-secret", "LOCATION:Office", "DESCRIPTION:private credential", "URL:https://example.test/secret", "ATTENDEE:mailto:private@example.test", "DTSTART:20261006T150000Z")), "2026-10-06");
  assert.deepEqual(Object.keys(result.events[0]).sort(), ["allDay", "end", "location", "start", "title"]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(result.events[0].title, "Meeting [link omitted]");
});

test("known credentials are redacted before title and location truncation", () => {
  const token = "synthetic-secret-0123456789abcdef";
  const text = calendar(event("redaction", `SUMMARY:${"x".repeat(995)}${token}`, `LOCATION:${"y".repeat(495)}${token}`, "DTSTART:20261006T150000Z"));
  const result = parseBriefing(text, "2026-10-06", [token]);
  assert.equal(result.events[0].title, `${"x".repeat(995)}[reda`);
  assert.equal(result.events[0].location, `${"y".repeat(495)}[reda`);
  assert.equal(JSON.stringify(result).includes("synt"), false);
});

test("unknown zones, malformed dates, inverted spans and excessive expansion fail safely", () => {
  for (const text of [
    calendar(event("unknown", "DTSTART;TZID=Unknown/Zone:20261006T090000")),
    calendar(event("bad-date", "DTSTART:20260230T090000Z")),
    calendar(event("backwards", "DTSTART:20261006T150000Z", "DTEND:20261006T140000Z")),
    calendar(event("equal", "DTSTART:20261006T150000Z", "DTEND:20261006T150000Z")),
    calendar(event("complex", "DTSTART:20261001T000000Z", "RRULE:FREQ=SECONDLY")),
    "not calendar data with private-secret",
  ]) {
    assert.throws(() => parseBriefing(text, "2026-10-06"), (error: unknown) => error instanceof CalendarParseError && error.message === "Calendar data could not be safely parsed.");
  }
  assert.throws(() => parseBriefing(calendar(), "2026-02-30"), CalendarParseError);
});

test("digest adds description without changing briefing fields or event selection", () => {
  const text = calendar(
    event("digest", "SUMMARY:Daily", "LOCATION:Office", "DESCRIPTION:Prepare agenda\\nBring notes", "DTSTART;TZID=America/Chicago:20261005T090000", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=3"),
    event("digest", "SUMMARY:Moved", "RECURRENCE-ID;TZID=America/New_York:20261006T100000", "DTSTART;TZID=America/Chicago:20261007T150000", "DURATION:PT1H"),
  );
  const digest = parseCalendarDigest(text, "2026-10-07");
  const briefing = parseBriefing(text, "2026-10-07");
  assert.deepEqual(digest.events.map((item) => {
    const { description, ...briefingFields } = item;
    void description;
    return briefingFields;
  }), briefing.events);
  assert.deepEqual(digest.events.map((item) => item.description), ["Prepare agenda Bring notes", "Prepare agenda Bring notes"]);
  assert.equal(JSON.stringify(briefing).includes("description"), false);
  assert.equal(parseCalendarDigest(text, "2026-10-06").events.length, 0);
});

test("digest descriptions inherit range/master and respect explicit replacement or clearing", () => {
  const text = calendar(
    event("inherit", "SUMMARY:Base", "DESCRIPTION:Master details", "DTSTART:20261004T140000Z", "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=6"),
    event("inherit", "RECURRENCE-ID;RANGE=THISANDFUTURE:20261005T140000Z", "DTSTART:20261005T150000Z", "DURATION:PT1H", "DESCRIPTION:Range details"),
    event("inherit", "RECURRENCE-ID;RANGE=THISANDFUTURE:20261006T140000Z", "DTSTART:20261006T160000Z", "DURATION:PT1H"),
    event("inherit", "RECURRENCE-ID:20261007T140000Z", "DTSTART:20261007T170000Z", "DURATION:PT1H"),
    event("inherit", "RECURRENCE-ID:20261008T140000Z", "DTSTART:20261008T170000Z", "DURATION:PT1H", "DESCRIPTION:Specific details"),
    event("inherit", "RECURRENCE-ID:20261009T140000Z", "DTSTART:20261009T170000Z", "DURATION:PT1H", "DESCRIPTION:"),
  );
  assert.equal(parseCalendarDigest(text, "2026-10-04").events[0].description, "Master details");
  assert.equal(parseCalendarDigest(text, "2026-10-06").events[0].description, "Range details");
  assert.equal(parseCalendarDigest(text, "2026-10-07").events[0].description, "Range details");
  assert.equal(parseCalendarDigest(text, "2026-10-08").events[0].description, "Specific details");
  assert.equal(Object.hasOwn(parseCalendarDigest(text, "2026-10-09").events[0], "description"), false);
});

test("digest strips HTML-ish markup, active content, decoded links and known credentials", () => {
  const token = "synthetic-digest-secret";
  const description = '<p>Bring <strong>notes</strong> &amp; agenda.</p><script>alert(1)</script><style>secret css</style><a href="https://example.test/private">Meeting room</a><br>https&colon;&sol;&sol;example.test/link mailto:private@example.test www.example.test example.test/plain [Map](https://example.test/map) &#115;ynthetic-digest-secret';
  const text = calendar(event("html", `DESCRIPTION:${description}`, "DTSTART:20261006T150000Z"));
  const result = parseCalendarDigest(text, "2026-10-06", [token]);
  assert.equal(result.events[0].description, "Bring notes & agenda. Meeting room [link omitted] [link omitted] [link omitted] [link omitted] Map [redacted]");
  const serialized = JSON.stringify(result);
  for (const hidden of ["<", "alert", "css", "example.test", "synthetic-digest-secret", "private@"]) assert.equal(serialized.includes(hidden), false);
});

test("digest description is bounded and secrets are removed before truncation", () => {
  const token = "synthetic-digest-secret-0123456789";
  const text = calendar(event("bounded", `DESCRIPTION:${"x".repeat(1995)}${token}Tail`, "DTSTART:20261006T150000Z"));
  const result = parseCalendarDigest(text, "2026-10-06", [token]);
  assert.equal(result.events[0].description, `${"x".repeat(1995)}[reda`);
  assert.equal(result.events[0].description?.length, 2_000);
  assert.equal(JSON.stringify(result).includes("synt"), false);
  const empty = calendar(event("empty", "DTSTART:20261006T150000Z"));
  assert.equal(Object.hasOwn(parseCalendarDigest(empty, "2026-10-06").events[0], "description"), false);
});
