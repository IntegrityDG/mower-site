export const TICKER_MIN_SPEED = 20;
export const TICKER_MAX_SPEED = 120;
export const TICKER_MESSAGE_MAX = 200;
export const TICKER_MESSAGES_MAX = 50;
export const TICKER_TIME_ZONE = "America/Chicago";

export type TickerMessage = {
  id: string;
  message: string;
  active: boolean;
  link: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type TickerConfig = {
  enabled: boolean;
  /** Pixels per second, independent of the viewport or message-track width. */
  speed: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  pauseOnHover: boolean;
  messages: TickerMessage[];
};

export type PublicTickerSnapshot = {
  ticker: TickerConfig;
  serverTime: string;
  nextChangeAt: string | null;
};
export type PublicSalesTickerSnapshot = PublicTickerSnapshot;

export type TickerRecord = { ticker: TickerConfig; revision: number };

export const DEFAULT_TICKER_CONFIG: TickerConfig = {
  enabled: false,
  speed: 50,
  backgroundColor: "#0F172A",
  textColor: "#FFFFFF",
  accentColor: "#FACC15",
  pauseOnHover: true,
  messages: [],
};

export type TickerValidation =
  | { ok: true; value: TickerConfig }
  | { ok: false; errors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

/** Only root-relative site paths and HTTP(S) URLs can become link targets. */
export function isSafeTickerLink(value: string): boolean {
  if (!value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Require an explicit offset: never interpret an Admin's date in the server timezone. */
function normalizedDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, , offset] = match;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  calendar.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (Number(year) < 2000 || calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day) || calendar.getUTCHours() !== Number(hour) || calendar.getUTCMinutes() !== Number(minute) || calendar.getUTCSeconds() !== Number(second)) return undefined;
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const normalized = new Date(timestamp);
  return normalized.getUTCFullYear() >= 2000 && normalized.getUTCFullYear() <= 9999 ? normalized.toISOString() : undefined;
}

export function validateTickerConfig(value: unknown): TickerValidation {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: Record<string, string> = {};
  if (typeof input.enabled !== "boolean") errors.enabled = "Ticker visibility must be enabled or disabled.";
  if (typeof input.pauseOnHover !== "boolean") errors.pauseOnHover = "Pause on hover / focus must be enabled or disabled.";
  if (!Number.isInteger(input.speed) || Number(input.speed) < TICKER_MIN_SPEED || Number(input.speed) > TICKER_MAX_SPEED) errors.speed = `Scroll speed must be a whole number from ${TICKER_MIN_SPEED} to ${TICKER_MAX_SPEED} pixels per second.`;
  for (const key of ["backgroundColor", "textColor", "accentColor"]) {
    if (typeof input[key] !== "string" || !HEX_COLOR.test(input[key])) errors[key] = "Enter a six-digit hex color such as #FFFFFF.";
  }
  if (!Array.isArray(input.messages) || input.messages.length > TICKER_MESSAGES_MAX) errors.messages = `Use at most ${TICKER_MESSAGES_MAX} ticker messages.`;
  const seen = new Set<string>();
  const messages: TickerMessage[] = [];
  if (Array.isArray(input.messages) && input.messages.length <= TICKER_MESSAGES_MAX) {
    input.messages.forEach((raw, index) => {
      const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const prefix = `messages.${index}.`;
      const message = typeof row.message === "string" ? row.message.trim() : "";
      if (typeof row.id !== "string" || !UUID.test(row.id) || seen.has(row.id.toLowerCase())) errors[`${prefix}id`] = "Each message must have a unique identity. Duplicate messages using the Duplicate button.";
      else seen.add(row.id.toLowerCase());
      if (!message) errors[`${prefix}message`] = "Message text is required.";
      else if ([...message].length > TICKER_MESSAGE_MAX) errors[`${prefix}message`] = `Message must be ${TICKER_MESSAGE_MAX} characters or fewer.`;
      if (/[\u0000-\u001f\u007f]/u.test(message)) errors[`${prefix}message`] = "Keep each message on a single line without control characters.";
      if (typeof row.active !== "boolean") errors[`${prefix}active`] = "Message status must be active or inactive.";
      const link = row.link;
      if (link !== null && (typeof link !== "string" || !isSafeTickerLink(link))) errors[`${prefix}link`] = "Use a site path starting with / or a complete http:// or https:// URL, without spaces or credentials.";
      const startsAt = normalizedDate(row.startsAt);
      const endsAt = normalizedDate(row.endsAt);
      if (startsAt === undefined) errors[`${prefix}startsAt`] = "Choose a valid start date/time with a timezone.";
      if (endsAt === undefined) errors[`${prefix}endsAt`] = "Choose a valid end date/time with a timezone.";
      if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) errors[`${prefix}endsAt`] = "End date/time must be after the start date/time.";
      messages.push({ id: row.id as string, message, active: row.active as boolean, link: link as string | null, startsAt: startsAt ?? null, endsAt: endsAt ?? null });
    });
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      enabled: input.enabled as boolean,
      speed: input.speed as number,
      backgroundColor: input.backgroundColor as string,
      textColor: input.textColor as string,
      accentColor: input.accentColor as string,
      pauseOnHover: input.pauseOnHover as boolean,
      messages,
    },
  };
}

export function isTickerMessageEligible(message: TickerMessage, now: number | Date = Date.now()): boolean {
  const timestamp = Number(now);
  return message.active && (!message.startsAt || Date.parse(message.startsAt) <= timestamp) && (!message.endsAt || Date.parse(message.endsAt) > timestamp);
}

export function activeTickerMessages(messages: TickerMessage[], now: number | Date = Date.now()): TickerMessage[] {
  return messages.filter((message) => isTickerMessageEligible(message, now));
}

/** Project a validated config without exposing future, inactive or expired message bodies. */
export function toPublicTickerSnapshot(value: unknown, now: Date = new Date()): PublicTickerSnapshot {
  const parsed = validateTickerConfig(value);
  const config = parsed.ok ? parsed.value : { ...DEFAULT_TICKER_CONFIG, messages: [] };
  let nextChange = Infinity;
  if (config.enabled) {
    for (const message of config.messages) {
      if (!message.active) continue;
      for (const boundary of [message.startsAt, message.endsAt]) {
        if (boundary && Date.parse(boundary) > now.getTime()) nextChange = Math.min(nextChange, Date.parse(boundary));
      }
    }
  }
  return {
    ticker: { ...config, messages: config.enabled ? config.messages.filter((message) => isTickerMessageEligible(message, now)) : [] },
    serverTime: now.toISOString(),
    nextChangeAt: Number.isFinite(nextChange) ? new Date(nextChange).toISOString() : null,
  };
}
