import { addDays, centralDate } from "@/lib/demo-scheduling/time";
import { DEMO_TIMEZONE, type DemoSlot } from "@/lib/demo-scheduling/types";
import { APPOINTMENT_TYPE_CONFIG } from "@/lib/scheduling/config";

export function installationAvailabilityRange(now = new Date()) {
  const start = centralDate(now);
  return { start, end: addDays(start, 42) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isoInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function parseInstallationAvailability(payload: unknown, range: { start: string; end: string }): DemoSlot[] {
  const duration = APPOINTMENT_TYPE_CONFIG.install.durationMinutes;
  if (!record(payload) || payload.timezone !== DEMO_TIMEZONE || payload.appointmentType !== "install"
      || payload.durationMinutes !== duration || !Array.isArray(payload.slots)) {
    throw new Error("Invalid availability response");
  }
  const starts = new Set<string>();
  return payload.slots.map((slot: unknown) => {
    if (!record(slot) || !isoInstant(slot.startAt) || !isoInstant(slot.endAt)
        || Date.parse(slot.endAt) - Date.parse(slot.startAt) !== duration * 60_000
        || slot.date !== centralDate(new Date(slot.startAt))
        || typeof slot.date !== "string" || slot.date < range.start || slot.date > range.end
        || typeof slot.timeLabel !== "string" || !slot.timeLabel.trim() || starts.has(slot.startAt)) {
      throw new Error("Invalid availability slot");
    }
    starts.add(slot.startAt);
    return { startAt: slot.startAt, endAt: slot.endAt, date: slot.date, timeLabel: slot.timeLabel };
  });
}

export async function loadInstallationAvailability(signal: AbortSignal, now = new Date()): Promise<DemoSlot[]> {
  const range = installationAvailabilityRange(now);
  const response = await fetch(`/api/installations/availability?${new URLSearchParams(range)}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Availability request failed");
  return parseInstallationAvailability(await response.json(), range);
}
