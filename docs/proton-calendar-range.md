# Read-only Proton Calendar range bridge

`GET /api/calendar/range?start=YYYY-MM-DD&end=YYYY-MM-DD`

Both dates are required and inclusive America/Chicago calendar days, 1–60 days
per request. Both endpoints must also fall within 60 Central calendar days before
or after today. The interval is local midnight on `start` through (excluding) local
midnight after `end`, including overnight overlaps. All-day `end` remains the
calendar's exclusive date. Events spanning multiple days appear once. Times
include the applicable Central UTC offset, including DST transitions.

Authentication: `Authorization: Bearer <range credential>`. The independent
server-only `PROTON_CALENDAR_RANGE_TOKEN` must be at least 32 characters and must
not equal `PROTON_CALENDAR_BRIDGE_TOKEN`. Missing/misconfigured range credentials
leave the route disabled (503); the old today credential cannot authorize it.
No credential is accepted through query parameters. Never copy credentials into
URLs, logs, source, prompts, client-side code, or documentation.

Response fields: `startDate`, `endDate`, `timeZone`, `fetchedAt`, `events`.
Each event contains only `title` (bounded to 200 characters, plain scrubbed text),
`start`, `end`, and `allDay`. No location, description, organizer, attendee, UID,
internal ID, raw ICS, or source URL is returned. Known configured credentials and
credential-shaped text are redacted; URL-like material is removed. Event titles
can still reveal personal schedule information. Only authorize trusted recipients.

## Scope and limits

This credential authorizes reading the single feed configured by the server's
existing `PROTON_CALENDAR_ICS_URL`. There is no calendar URL or calendar selection
parameter and no write action. It is not OAuth, a ChatGPT integration, or an MCP
server. No new external issuer or account access is configured by this change.

The 60-day request bound is a resource/data-minimization limit. The separate
±60-day endpoint envelope limits live access to recent/near-term dates. A credential
holder can request multiple windows inside that moving envelope, not arbitrary
historical exports. Separate per-user grants, expiry, revocation, allowed-date
bounds, calendar restrictions, and consent are future integration concerns. A
work-only published feed gives stronger scope than filtering a mixed feed by title.
Do not expose the bearer to a third-party integration without separately reviewing
and authorizing its access. Titles are untrusted data, never assistant instructions.

## Safety and compatibility

Existing `/api/calendar/today` and digest cron behavior remain unchanged. Shared
recurrence expansion retains exceptions, overrides, cancellation, embedded timezone
and IANA DST handling. Range parsing expands once under existing feed/component/
property/occurrence/result limits; it never returns a silently truncated success.

All responses are private/no-store, noindex; non-GET methods return 405. The
upstream URL is server-configured HTTPS to calendar.proton.me only, redirects are
rejected, transport tracing is suppressed, transport debugging fails closed,
upstream bytes/time are capped, and parser/upstream errors are fixed generic 502s.
A legitimate empty schedule is 200 with an empty array; failure is never disguised
as empty availability. Credentials are not logged; no cache or schedule database
is created. Provider/framework request logs may still include requested dates.

## Verification and rollout

Run `node --import tsx --test tests/proton-calendar*.test.ts`, typecheck, lint, and
full regression checks. Synthetic fixtures only; don't fetch a private feed or
resend a digest as a test. Provision a distinct strong range credential only after
integration review/approval. No existing environment secrets need to be pulled.
Preview/runtime checks must verify unauthenticated denial and no-store behavior;
any authorized live schedule test must keep content private. Hold production
merge/deployment until the coordinating reviewer approves the architecture.
