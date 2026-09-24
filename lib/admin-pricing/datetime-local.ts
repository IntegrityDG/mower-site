import { centralLocalToUtc } from "@/lib/scheduling/time";

export const PRICING_TIME_ZONE = "America/Chicago";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRICING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isoToLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function centralDateTimeInputToIso(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  return centralLocalToUtc(match[1], match[2])?.toISOString() ?? null;
}
