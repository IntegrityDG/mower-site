# Daily Proton Calendar email digest

The production IDS project sends a plain-text daily agenda to
`integritydistributionsystems@gmail.com` using its existing Resend configuration.
Its subject is `IDS Daily Proton Calendar Brief — YYYY-MM-DD`, with the date
determined in `America/Chicago`.

## Schedule and authentication

Vercel calls `GET /api/cron/proton-calendar-digest` at minutes 30, 35, 40, 45,
50 and 55 in both 14:00 and 15:00 UTC. The handler performs work only between
9:30 AM and 9:59 AM in America/Chicago. This covers CST and CDT, including the
days when daylight saving time changes. The extra calls permit retries before
the 10 AM Daily Command Center; the other UTC hour returns skip metadata.

GET requires Vercel's existing private `CRON_SECRET` in Bearer authentication.
For an authorized manual test, POST the same path using the existing private
`PROTON_CALENDAR_BRIDGE_TOKEN` as Bearer authentication. POST sends today's
agenda without the morning time gate. It cannot override the calendar date,
recipient, sender or feed. Both methods reject query parameters and request
bodies, and both require a production deployment. Other methods return 405.

The separate protected read-only route `/api/calendar/today` retains its existing
contract and authentication. The digest does not make that route public.

## Private configuration

The server uses the existing production environment variables:

- `PROTON_CALENDAR_ICS_URL`: protected read-only Proton ICS feed.
- `PROTON_CALENDAR_BRIDGE_TOKEN`: manual-test authentication.
- `CRON_SECRET`: scheduled invocation authentication.
- `RESEND_API_KEY` and `DEMO_FROM_EMAIL`: existing production sending service.
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, and
  `SUPABASE_SERVICE_ROLE_KEY`: service-only durable delivery state.

No secret belongs in a URL, source file, automation prompt, client code, chat,
or log. The handler returns only date, delivery status and event count. All
responses disable caching and indexing. Upstream HTTP tracing is suppressed;
private fetches use an uninstrumented HTTP client, while opt-in transport debug
logging makes the job fail closed. The Resend SDK is called only in production,
where its development error logging is disabled. Provider and parser errors are
not logged or returned.

The feed must be HTTPS on the exact `calendar.proton.me` host. Redirects are
rejected, requests expire after 12 seconds, and feeds larger than 2 MiB are
rejected. Parsing reuses the existing recurrence and timezone engine, including
RRULE, EXDATE, recurrence exceptions, all-day dates, and overnight events. Email
content contains title, start/end Central times, location and up to 2,000
characters of preparation details. Details are plain text; markup and links are
removed and known credential values are redacted before truncation. The entire
rendered agenda is capped at 512 KiB; oversized agendas fail without silently
dropping events.

## Durable duplicate prevention

Apply the dedicated Proton digest migration before enabling the deployed job.
Its private service-only table and RPCs store one immutable delivery snapshot
per Chicago calendar date. The first claim saves sender, recipient, subject,
plain-text body, event count and fixed Resend idempotency key. Atomic five-minute
leases prevent concurrent invocations from beginning separate sends.

After a date has a snapshot, the handler reads that snapshot before contacting
Proton. Feed outages or changes cannot block confirmation of a sent digest or
safe retries of an uncertain delivery. Retries send the exact persisted snapshot
with the same idempotency key. The
state is marked sent only after Resend returns a message ID. If the function
stops after acceptance but before saving that ID, the next lease retries the
same request, which Resend deduplicates. A changed sender configuration fails
closed because the existing email helper always uses `DEMO_FROM_EMAIL`.

Resend retains idempotency keys for 24 hours. An unresolved digest at or beyond
23 hours becomes `needs_review` and cannot be resent automatically. This leaves
a safety margin and prevents an uncertain old delivery from becoming a duplicate
after provider idempotency expires. Delivery-state errors fail closed; process
memory and ephemeral filesystem storage are never used for deduplication.

`sent` means accepted by Resend. Inbox arrival must be confirmed separately in
the connected IDS Gmail account before reporting end-to-end success. The Daily
Command Center should search that account for the exact subject/date and use
the email as its Proton Calendar agenda.
