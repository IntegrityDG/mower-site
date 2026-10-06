import { createHash, timingSafeEqual } from "node:crypto";
import { debuglog } from "node:util";
import { parseBriefing } from "./proton";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Authorization",
};

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

function authorized(request: Request, token: string) {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return supplied.length > 0 && timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(token).digest(),
  );
}

function chicagoToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readFeed(response: Response) {
  if (!response.ok || !response.body) throw new Error("Calendar unavailable");
  const size = Number(response.headers.get("content-length"));
  if (size > MAX_FEED_BYTES) throw new Error("Calendar unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) throw new Error("Calendar unavailable");
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error("Calendar unavailable");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function calendarBridge(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  fetchFeed: typeof fetch = fetch,
  now: Date = new Date(),
) {
  if (request.method !== "GET") {
    const response = reply({ error: "Method not allowed" }, 405);
    response.headers.set("Allow", "GET");
    return response;
  }
  const token = env.PROTON_CALENDAR_BRIDGE_TOKEN;
  if (!token || token.length < 32) return reply({ error: "Calendar bridge unavailable" }, 503);
  if (!authorized(request, token)) return reply({ error: "Unauthorized" }, 401);

  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(k => k !== "date") || query.getAll("date").length > 1) {
    return reply({ error: "Only an optional date (YYYY-MM-DD) is supported" }, 400);
  }
  const date = query.get("date") ?? chicagoToday(now);
  if (!validDate(date)) return reply({ error: "Invalid date; use YYYY-MM-DD" }, 400);
  const distance = Math.abs(new Date(`${date}T00:00:00Z`).getTime() - new Date(`${chicagoToday(now)}T00:00:00Z`).getTime());
  if (distance > 7 * 86400000) return reply({ error: "Date must be within seven days of today" }, 400);

  const feed = env.PROTON_CALENDAR_ICS_URL?.trim();
  if (!feed) return reply({ error: "Calendar bridge unavailable" }, 503);
  // Node's opt-in transport debug output can contain the complete upstream URL.
  // Fail closed if it is enabled, without changing logging for other IDS routes.
  if (debuglog("fetch").enabled || debuglog("undici").enabled ||
      /(?:^|[\s,])(?:\*|fetch|undici|https?)(?:$|[\s,*])/i.test(env.NODE_DEBUG ?? "")) {
    return reply({ error: "Calendar bridge unavailable" }, 503);
  }
  let feedUrl: URL;
  try {
    feedUrl = new URL(feed);
    if (feedUrl.protocol !== "https:" || feedUrl.hostname !== "calendar.proton.me" ||
        (feedUrl.port && feedUrl.port !== "443") || feedUrl.username || feedUrl.password || feedUrl.hash) {
      throw new Error("Calendar unavailable");
    }
  } catch {
    return reply({ error: "Calendar bridge unavailable" }, 503);
  }

  try {
    // The route injects a private HTTP client under a suppressed tracing context;
    // do not put this secret URL through Next's instrumented fetch/cache.
    const upstream = await fetchFeed(feedUrl, {
      method: "GET", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "text/calendar" },
    });
    const text = await readFeed(upstream);
    const secrets = [feed, token, ...feedUrl.searchParams.values(),
      ...feedUrl.pathname.split("/").filter(part => part.length >= 16),
    ].filter(Boolean).sort((a, b) => b.length - a.length);
    const briefing = parseBriefing(text, date, secrets);
    // Defence in depth if an event title or location itself contains the feed.
    const clean = (value: string) => secrets.reduce((cleaned, secret) =>
      cleaned.split(secret).join("[redacted]"), value)
      .replace(/https?:\/\/\S+/gi, "[link omitted]");
    const events = briefing.events.map(event => ({
      ...event, title: clean(event.title),
      ...(event.location ? { location: clean(event.location) } : {}),
    }));
    return reply({ ...briefing, events, fetchedAt: new Date().toISOString() });
  } catch {
    // Deliberately do not log errors: fetch/parser errors can embed private URLs
    // or event values. Never turn an upstream failure into an empty calendar.
    return reply({ error: "Calendar temporarily unavailable" }, 502);
  }
}
