import { createHash, timingSafeEqual } from "node:crypto";
import { debuglog } from "node:util";
import { parseCalendarDigest, type CalendarDigest } from "./proton";

export const DIGEST_RECIPIENT = "integritydistributionsystems@gmail.com";
const TIME_ZONE = "America/Chicago";
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_EMAIL_BYTES = 512 * 1024;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Authorization",
};

export type DigestPayload = {
  date: string;
  from: string;
  to: typeof DIGEST_RECIPIENT;
  subject: string;
  text: string;
  eventCount: number;
};

export type DigestClaim = {
  state: "claimed" | "busy" | "sent" | "needs_review";
  date: string;
  eventCount: number;
  leaseId?: string;
  firstAttemptAt?: string;
  idempotencyKey?: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
};

export type DigestFinish = { state: "sent" | "retryable" | "needs_review" | "stale"; date: string };
export type DigestDependencies = {
  fetchFeed: typeof fetch;
  readExisting: (date: string) => Promise<DigestPayload | null>;
  claim: (payload: DigestPayload) => Promise<DigestClaim>;
  finish: (date: string, leaseId: string, outcome: "sent" | "retryable" | "needs_review", providerId?: string) => Promise<DigestFinish>;
  send: (payload: DigestPayload & { idempotencyKey: string }) => Promise<{ id: string }>;
};

export function chicagoClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")), minute: Number(part("minute")),
  };
}

export function inDigestWindow(now: Date) {
  const clock = chicagoClock(now);
  return clock.hour === 9 && clock.minute >= 30;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function eventTime(value: string, digestDate: string) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("Digest unavailable");
  const clock = chicagoClock(instant);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(instant);
  return `${clock.date === digestDate ? "" : `${dateLabel(clock.date)}, `}${time}`;
}

export function composeCalendarDigest(briefing: CalendarDigest, from: string): DigestPayload {
  if (!from || /[\r\n]/.test(from) || Buffer.byteLength(from) > 320) throw new Error("Digest unavailable");
  const lines = [
    `IDS Daily Proton Calendar Brief — ${briefing.date}`,
    `Calendar date: ${dateLabel(briefing.date)}`,
    "All times: America/Chicago (Central Time)", "",
  ];
  if (!briefing.events.length) lines.push("No calendar events for today.");
  const singleLine = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
  briefing.events.forEach((event, index) => {
    lines.push(`${index + 1}. ${singleLine(event.title)}`);
    if (event.allDay) {
      lines.push(`Time: All day (start ${event.start}; exclusive end ${event.end})`);
    } else {
      lines.push(`Time: ${eventTime(event.start, briefing.date)} – ${eventTime(event.end, briefing.date)}`);
    }
    if (event.location) lines.push(`Location: ${singleLine(event.location)}`);
    if (event.description) lines.push(`Preparation/details:\n${event.description}`);
    lines.push("");
  });
  lines.push("Source: Proton Calendar. This is the daily agenda snapshot for your morning briefing.");
  const text = lines.join("\n");
  if (Buffer.byteLength(text, "utf8") > MAX_EMAIL_BYTES) throw new Error("Digest unavailable");
  return {
    date: briefing.date, from, to: DIGEST_RECIPIENT,
    subject: `IDS Daily Proton Calendar Brief — ${briefing.date}`,
    text, eventCount: briefing.events.length,
  };
}

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

export function digestMethodNotAllowed() {
  const response = reply({ error: "Method not allowed" }, 405);
  response.headers.set("Allow", "GET, POST");
  return response;
}

function authorized(request: Request, expected: string) {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return supplied.length > 0 && timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

async function emptyRequestBody(request: Request) {
  if (request.body === null) return true;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), 1500);
  });
  try {
    // Vercel can provide an empty readable stream for a bodyless POST. Check
    // for EOF without buffering content; any byte rejects the request. Bound
    // both waiting time and zero-length chunks from unusual stream sources.
    for (let chunks = 0; chunks < 16; chunks++) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result === null) return false;
      if (result.done) return true;
      if (!(result.value instanceof Uint8Array) || result.value.byteLength > 0) return false;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // An untrusted stream's cancellation can also stall. Start cancellation
    // without waiting on it, then release the lock and keep the handler bounded.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function digestFeedUrl(env: NodeJS.ProcessEnv) {
  const feed = env.PROTON_CALENDAR_ICS_URL?.trim();
  if (!feed) throw new Error("Digest unavailable");
  const url = new URL(feed);
  if (url.protocol !== "https:" || url.hostname !== "calendar.proton.me" ||
      (url.port && url.port !== "443") || url.username || url.password || url.hash) {
    throw new Error("Digest unavailable");
  }
  return url;
}

export function digestSecrets(env: NodeJS.ProcessEnv, feedUrl: URL) {
  return [
    env.PROTON_CALENDAR_ICS_URL?.trim(), env.PROTON_CALENDAR_BRIDGE_TOKEN,
    env.CRON_SECRET, env.RESEND_API_KEY, env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_ANON_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ...feedUrl.searchParams.values(),
    ...feedUrl.pathname.split("/").filter(part => part.length >= 16),
  ].filter((value): value is string => !!value).sort((left, right) => right.length - left.length);
}

export async function loadCalendarDigest(
  env: NodeJS.ProcessEnv, date: string, fetchFeed: typeof fetch,
): Promise<CalendarDigest> {
  const feedUrl = digestFeedUrl(env);
  const upstream = await fetchFeed(feedUrl, {
    method: "GET", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(12000), headers: { Accept: "text/calendar" },
  });
  if (!upstream.ok || !upstream.body || Number(upstream.headers.get("content-length")) > MAX_FEED_BYTES) {
    throw new Error("Digest unavailable");
  }
  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) throw new Error("Digest unavailable");
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error("Digest unavailable");
  } finally {
    reader.releaseLock();
  }
  return parseCalendarDigest(Buffer.concat(chunks).toString("utf8"), date, digestSecrets(env, feedUrl));
}

function validateClaim(claim: DigestClaim, payload: DigestPayload) {
  if (!["claimed", "busy", "sent", "needs_review"].includes(claim.state) ||
      claim.date !== payload.date || !Number.isInteger(claim.eventCount) || claim.eventCount < 0 || claim.eventCount > 2000) {
    throw new Error("Digest unavailable");
  }
  if (claim.state !== "claimed") return;
  if (!claim.leaseId || !claim.firstAttemptAt || claim.idempotencyKey !== `proton-calendar-digest/${payload.date}/v1` ||
      claim.to !== DIGEST_RECIPIENT || claim.subject !== payload.subject ||
      typeof claim.from !== "string" || /[\r\n]/.test(claim.from) ||
      typeof claim.text !== "string" || Buffer.byteLength(claim.text) > MAX_EMAIL_BYTES) {
    throw new Error("Digest unavailable");
  }
}

function validatePayload(payload: DigestPayload, date: string) {
  if (payload.date !== date || payload.to !== DIGEST_RECIPIENT ||
      payload.subject !== `IDS Daily Proton Calendar Brief — ${date}` ||
      typeof payload.from !== "string" || !payload.from || /[\r\n]/.test(payload.from) ||
      Buffer.byteLength(payload.from) > 320 || typeof payload.text !== "string" ||
      Buffer.byteLength(payload.text) > MAX_EMAIL_BYTES || !Number.isInteger(payload.eventCount) ||
      payload.eventCount < 0 || payload.eventCount > 2000) {
    throw new Error("Digest unavailable");
  }
}

export async function runDailyDigest(
  request: Request, env: NodeJS.ProcessEnv, dependencies: DigestDependencies, now = new Date(),
) {
  if (request.method !== "GET" && request.method !== "POST") return digestMethodNotAllowed();
  const token = request.method === "GET" ? env.CRON_SECRET : env.PROTON_CALENDAR_BRIDGE_TOKEN;
  if (!token || token.length < (request.method === "POST" ? 32 : 16)) {
    return reply({ error: "Calendar digest unavailable" }, 503);
  }
  if (!authorized(request, token)) return reply({ error: "Unauthorized" }, 401);
  if (new URL(request.url).search || !(await emptyRequestBody(request))) {
    return reply({ error: "Query parameters and request bodies are not supported" }, 400);
  }
  const date = chicagoClock(now).date;
  const metadata = (status: string, eventCount = 0, httpStatus = 200) => reply({ date, status, eventCount }, httpStatus);
  if (env.VERCEL_ENV !== "production" || env.NODE_ENV !== "production") {
    return reply({ error: "Calendar digest unavailable" }, 503);
  }
  if (request.method === "GET" && !inDigestWindow(now)) return metadata("skipped");
  // Debug transport logging and alternate Resend API endpoints could expose
  // credentials or calendar text. Fail closed without affecting other IDS routes.
  if (debuglog("fetch").enabled || debuglog("undici").enabled ||
      /(?:^|[\s,])(?:\*|fetch|undici|https?)(?:$|[\s,*])/i.test(env.NODE_DEBUG ?? "") ||
      (env.RESEND_BASE_URL && env.RESEND_BASE_URL !== "https://api.resend.com") ||
      !env.RESEND_API_KEY || !env.DEMO_FROM_EMAIL?.trim()) {
    return reply({ error: "Calendar digest unavailable" }, 503);
  }
  try {
    // Once a date has a durable snapshot, its successful delivery or safe retry
    // must not depend on the feed remaining available or unchanged.
    let payload = await dependencies.readExisting(date);
    if (payload) {
      validatePayload(payload, date);
    } else {
      const briefing = await loadCalendarDigest(env, date, dependencies.fetchFeed);
      payload = composeCalendarDigest(briefing, env.DEMO_FROM_EMAIL.trim());
    }
    const claim = await dependencies.claim(payload);
    validateClaim(claim, payload);
    if (claim.state === "sent") return metadata("already_sent", claim.eventCount);
    if (claim.state === "busy") return metadata("busy", claim.eventCount, 202);
    if (claim.state === "needs_review") return metadata("needs_review", claim.eventCount, 503);
    const age = now.getTime() - new Date(claim.firstAttemptAt!).getTime();
    // The database sets firstAttemptAt after the feed request. Allow bounded
    // request latency / clock skew while retaining a one-hour safety margin
    // before Resend's24-hour idempotency expiry.
    if (!Number.isFinite(age) || age < -120000 || age >= RETRY_WINDOW_MS || claim.from !== env.DEMO_FROM_EMAIL.trim()) {
      await dependencies.finish(date, claim.leaseId!, "needs_review");
      return metadata("needs_review", claim.eventCount, 503);
    }
    let sent: { id: string };
    try {
      // Always retry the persisted payload; feed changes never alter the same
      // date's body or Resend idempotency key.
      sent = await dependencies.send({
        date, from: claim.from!, to: DIGEST_RECIPIENT, subject: claim.subject!,
        text: claim.text!, eventCount: claim.eventCount, idempotencyKey: claim.idempotencyKey!,
      });
      if (!sent.id || typeof sent.id !== "string") throw new Error("Digest unavailable");
    } catch {
      await dependencies.finish(date, claim.leaseId!, "retryable");
      return metadata("retry_required", claim.eventCount, 503);
    }
    const result = await dependencies.finish(date, claim.leaseId!, "sent", sent.id);
    if (result.date !== date || !["sent", "retryable", "needs_review", "stale"].includes(result.state)) {
      throw new Error("Digest unavailable");
    }
    return result.state === "sent"
      ? metadata("sent", claim.eventCount)
      : metadata("retry_required", claim.eventCount, 503);
  } catch {
    // Neither provider errors nor private calendar data belong in runtime logs.
    return reply({ error: "Calendar digest temporarily unavailable" }, 503);
  }
}
