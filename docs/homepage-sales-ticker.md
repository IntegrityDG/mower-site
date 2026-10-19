# Homepage Sales Ticker

Sales & Specials → Homepage Sales Ticker manages the shared desktop/mobile strip. It renders immediately after the main header/navigation and before Intro, only on the home view. Existing promotion banners and Bulletin Board retain their positions. Homepage metadata is unchanged.

The strip is fixed at 36px, with 14px mobile / 15px desktop text. Speed is 20–120 pixels per second (default 50), independent of viewport width. A ResizeObserver measures the sequence and repeats it to fill two equal CSS animation groups. Repeated content is hidden from assistive technology and removed from the tab sequence. Hover/focus pause defaults on; a separate pause button always lets visitors stop movement. Reduced motion shows one static, internally scrollable sequence. Keyboard focus exposes the original sequence and scrolls its links into view.

## Admin and scheduling

All editing and Live Preview stay local until **Save Ticker Changes**. Controls include enabled, speed, background/text/accent hex fields and pickers, and hover/focus pause. Poor text contrast produces a warning without changing the chosen colors. The editor supports up to 50 messages of 200 Unicode code points each, optional safe links, active/inactive state, create/edit/duplicate/confirmed delete, native drag ordering, and Move Up/Move Down. Array order is the sequence; duplicated messages receive new UUIDs.

Schedules use America/Chicago wall times and persist explicit UTC instants. A nonexistent spring-forward time is rejected; an ambiguous fall-back time requires choosing the first or second occurrence. Loaded instants retain their precision. A start is inclusive and an end is exclusive. Inactive/future/expired content is omitted publicly. Disabled or empty content renders no strip or gap. A server snapshot supplies only safe eligible fields and the next schedule boundary; an already-open homepage refreshes at that boundary. Server time plus elapsed monotonic browser time handles incorrect visitor clocks. No cron or frame-by-frame JavaScript loop is required.

## Data and release

`20261019214332_add_homepage_sales_ticker.sql` additively extends the existing `homepage_sales_specials` record with a bounded JSON document, revision, update timestamp and shared **IDS Administrator** actor. It starts disabled with no messages or promotional claims. Existing promotion fields and secondary promotion remain independent. The whole document saves atomically through a revision-checked database function; a stale Admin session receives HTTP 409 and retains its draft.

Both Admin API methods authenticate using the existing server-side shared Admin cookie. Database rows and functions remain inaccessible to `anon` and `authenticated`; only the server service role can access them. Public reads explicitly project validated fields and omit unpublished text and audit metadata. Messages render as escaped text. Links allow root-relative paths and HTTP(S), excluding protocol-relative paths, unsafe schemes, credentials, whitespace and backslashes. Colors and speed have server and database checks.

This patch does **not** apply the migration, enable the ticker, push, or deploy. A later separately authorized release must apply the additive migration before Admin editing is available. Public rendering safely collapses if the migration is absent or the database is unavailable.

## Reproduce local verification

Use an isolated checkout with project dependencies installed and no `.env` files. The runner removes inherited service credentials and uses synthetic loopback-only settings. No production account is needed. Local QA dependencies, logs, screenshots and PostgreSQL memory data are ignored under `.ticker-qa/` and are not part of the commit.

```powershell
npm.cmd install --prefix .ticker-qa --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.10 @axe-core/playwright@4.14.0 playwright@1.64.1
node scripts/sales-ticker-local-command.mjs test
node scripts/sales-ticker-local-command.mjs typecheck
node scripts/sales-ticker-local-command.mjs lint
node scripts/sales-ticker-local-command.mjs build
node --import tsx scripts/verify-sales-ticker-db.mjs
node --import tsx scripts/verify-sales-ticker-browser.mjs
git diff --check
```

The first three validation commands run the full npm test suite, `tsc --noEmit`, and `npm run lint`; build invokes `npm run build`. Existing Google Fonts require network access during a fresh build. Browser verification uses installed Chrome at its standard Windows location; adjust its executable path for another host.

Database verification runs the exact migration against real PostgreSQL through PGlite, with the two current Sales & Specials table migrations as its minimal schema fixture. It checks defaults, constraints, atomic saves/order, revision conflicts, attribution, scheduling projection and role/RLS denials. The browser harness runs the production Next server against that fixture through a loopback HTTP adapter. It exercises real application authentication, APIs and database functions; unrelated public datasets use empty local responses. Browser checks cover Admin persistence/preview, rendering, all loop phases, responsive widths, keyboard access, pause, reduced motion, scheduling, link navigation, axe scans and existing public route smoke checks. This is local verification, not a hosted Supabase/PostgREST integration test.
