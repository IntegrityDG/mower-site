# Proton Calendar morning briefing

`GET https://integrityautomowers.com/api/calendar/today`

Send `Authorization: Bearer <privately stored bridge token>`. Store the token
in the calling integration's private authentication settings. Never put it in
a URL, prompt, source file, browser bundle, or printed output. Browsing the URL
without authentication returns no calendar data.

## Server configuration

The existing IDS Vercel project requires two **Production Secret** environment
variables, both without a public prefix:

- `PROTON_CALENDAR_ICS_URL`: the existing read-only Proton feed from the current
  automation. Copy directly into protected configuration; never commit it.
- `PROTON_CALENDAR_BRIDGE_TOKEN`: an independent, randomly generated token with
  at least 32 characters. This is the caller credential, not the Proton feed.

Deploy again after environment changes. The function uses Node.js. Its private
HTTP client bypasses Next's URL-based fetch cache/instrumentation and runs under
a request-scoped OpenTelemetry tracing suppression context. Transport debug
logging causes it to fail closed. It performs
only an HTTPS GET to `calendar.proton.me` and rejects redirects. It never logs
the feed, calendar contents, authorization header, or upstream/parser errors.

## Response

The date defaults to the current day in `America/Chicago`. An optional
`?date=YYYY-MM-DD` selects a day within seven days of today for diagnostics.
No client-provided feed URL or timezone is accepted.

JSON contains `date`, `timeZone`, `fetchedAt`, and `events`. Each event contains
`title`, `start`, `end`, `allDay`, and optionally `location`. Timed events use
Chicago ISO timestamps with their UTC offset. All-day events use date strings
and exclusive end dates. Descriptions, attendees, identifiers, raw ICS, and
links are omitted. Cancelled events are excluded.

Recurrence includes RRULE, RDATE, EXDATE, RECURRENCE-ID replacements and
THISANDFUTURE exceptions. Embedded VTIMEZONE definitions are preferred;
recognized IANA zones use server Intl data. Floating times use Chicago.
Events overlapping the day are included, including overnight events.

All responses disable private and CDN caching and search indexing. GET is the
only supported method; other methods return 405. Missing configuration returns
503, missing/incorrect authentication 401, invalid date 400, and fetch/parse
failure 502. A genuine empty day returns 200 with an empty events array;
failures never masquerade as an empty day. Fetching is limited to 12 seconds
and bounded input size; bounded parsing fails safely rather than silently
dropping occurrences.

## Validation

Run the focused parser and bridge tests in `tests/proton-calendar*.test.ts`,
then the production build. Before enabling a briefing, make an authenticated
production request for the actual current Chicago date and check the event
count and times against Proton. Also verify unauthenticated GET returns 401
and write methods return 405. Keep credentials and the underlying feed out of
all test output.

Scheduled ChatGPT tasks that can only browse URLs cannot supply this endpoint's
authentication header. Use a caller with private header authentication, such
as an appropriately configured custom action/integration; do not make the
private calendar public to accommodate an unauthenticated browser.
