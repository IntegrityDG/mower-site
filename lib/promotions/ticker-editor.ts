import { DEFAULT_TICKER_CONFIG, isSafeTickerLink, type TickerConfig, type TickerMessage, validateTickerConfig } from "./ticker";

export type TickerEditorMessage = Omit<TickerMessage, "link" | "startsAt" | "endsAt"> & {
  link: string;
  startsAt: string;
  endsAt: string;
  originalStartsAt: string | null;
  originalEndsAt: string | null;
};
export type TickerEditorConfig = Omit<TickerConfig, "messages"> & { messages: TickerEditorMessage[] };

const chicagoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function isoToChicagoInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(chicagoFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function chicagoInputCandidates(value: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return [];
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const normalized = new Date(utc).toISOString().slice(0, 16);
  if (normalized !== value) return [];
  // Chicago's modern scheduling offsets are UTC-6 (CST) and UTC-5 (CDT).
  return [5, 6].map((offset) => new Date(utc + offset * 60 * 60 * 1000).toISOString())
    .filter((candidate) => isoToChicagoInput(candidate) === value);
}

/** Resolve a Chicago wall time without guessing through a DST gap or repeated hour. */
export function chicagoInputToIso(value: string, original: string | null = null): string | null {
  if (!value) return null;
  if (original && isoToChicagoInput(original) === value) return original;
  const naive = new Date(`${value}:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(naive.getTime()) || naive.toISOString().slice(0, 16) !== value) throw new Error("Enter a valid date and time.");
  const candidates = chicagoInputCandidates(value);
  if (candidates.length === 0) throw new Error("This time does not exist in America/Chicago because clocks move forward. Choose another time.");
  if (candidates.length > 1) throw new Error("This time occurs twice in America/Chicago because clocks move back. Choose the first or second occurrence below the date field.");
  return candidates[0];
}

export function tickerToEditor(ticker: TickerConfig): TickerEditorConfig {
  return { ...ticker, messages: ticker.messages.map((message) => ({
    ...message, link: message.link ?? "", startsAt: isoToChicagoInput(message.startsAt), endsAt: isoToChicagoInput(message.endsAt),
    originalStartsAt: message.startsAt, originalEndsAt: message.endsAt,
  })) };
}

export function newTickerEditorMessage(id: string): TickerEditorMessage {
  return { id, message: "", active: true, link: "", startsAt: "", endsAt: "", originalStartsAt: null, originalEndsAt: null };
}

export function duplicateTickerEditorMessage(message: TickerEditorMessage, id: string): TickerEditorMessage {
  return { id, message: message.message, active: message.active, link: message.link, startsAt: message.startsAt, endsAt: message.endsAt, originalStartsAt: message.originalStartsAt, originalEndsAt: message.originalEndsAt };
}

export function moveTickerMessage<T>(messages: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= messages.length || to >= messages.length || from === to) return messages;
  const result = [...messages];
  const [message] = result.splice(from, 1);
  result.splice(to, 0, message);
  return result;
}

function editorMessageToTicker(message: TickerEditorMessage): TickerMessage {
  return {
    id: message.id, message: message.message, active: message.active, link: message.link.trim() || null,
    startsAt: chicagoInputToIso(message.startsAt, message.originalStartsAt),
    endsAt: chicagoInputToIso(message.endsAt, message.originalEndsAt),
  };
}

export function validateTickerEditor(draft: TickerEditorConfig): ReturnType<typeof validateTickerConfig> {
  const errors: Record<string, string> = {};
  const messages = draft.messages.map((message, index) => {
    for (const key of ["startsAt", "endsAt"] as const) {
      try { chicagoInputToIso(message[key], message[key === "startsAt" ? "originalStartsAt" : "originalEndsAt"]); }
      catch (error) { errors[`messages.${index}.${key}`] = error instanceof Error ? error.message : "Invalid time."; }
    }
    if (errors[`messages.${index}.startsAt`] || errors[`messages.${index}.endsAt`]) return null;
    return editorMessageToTicker(message);
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  return validateTickerConfig({ ...draft, messages });
}

/** A malformed in-progress field cannot inject styles, navigation, or bad schedule values. */
export function tickerEditorPreview(draft: TickerEditorConfig): TickerConfig {
  const color = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return {
    ...draft, enabled: true,
    backgroundColor: color(draft.backgroundColor, DEFAULT_TICKER_CONFIG.backgroundColor),
    textColor: color(draft.textColor, DEFAULT_TICKER_CONFIG.textColor),
    accentColor: color(draft.accentColor, DEFAULT_TICKER_CONFIG.accentColor),
    messages: draft.messages.flatMap((message) => {
      if (!message.message.trim()) return [];
      try { const link = message.link.trim(); return [{ ...editorMessageToTicker(message), link: isSafeTickerLink(link) ? link : null }]; }
      catch { return []; }
    }),
  };
}

export function tickerContrastRatio(foreground: string, background: string): number | null {
  if (![foreground, background].every((value) => /^#[0-9a-f]{6}$/i.test(value))) return null;
  function luminance(hex: string) {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
