import type { AppointmentSlot } from "./types";

export const SCHEDULING_TIMEZONE = "America/Chicago";
const MILLISECONDS_PER_MINUTE = 60_000;
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const labelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULING_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULING_TIMEZONE,
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function parts(date: Date) {
  return Object.fromEntries(
    partsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function centralLocalToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desired;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const renderedParts = parts(new Date(instant));
    const rendered = Date.UTC(
      Number(renderedParts.year),
      Number(renderedParts.month) - 1,
      Number(renderedParts.day),
      Number(renderedParts.hour),
      Number(renderedParts.minute),
    );
    instant += desired - rendered;
  }
  const check = parts(new Date(instant));
  if (
    Number(check.year) !== year ||
    Number(check.month) !== month ||
    Number(check.day) !== day ||
    Number(check.hour) !== hour ||
    Number(check.minute) !== minute
  ) return null;
  return new Date(instant);
}

export function centralDate(date: Date) {
  const value = parts(date);
  return `${value.year}-${value.month}-${value.day}`;
}

export function centralWeekday(date: string) {
  const instant = centralLocalToUtc(date, "12:00");
  if (!instant) return -1;
  const shortName = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULING_TIMEZONE,
    weekday: "short",
  }).format(instant);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(shortName);
}

export function addDays(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function minutes(time: string) {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function endAtForDuration(start: Date, durationMinutes: number) {
  return new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);
}

export function slotFromLocal(date: string, time: string, durationMinutes: number): AppointmentSlot | null {
  const start = centralLocalToUtc(date, time);
  if (!start) return null;
  const end = endAtForDuration(start, durationMinutes);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    date,
    timeLabel: labelFormatter.format(start),
  };
}

export function humanAppointmentTime(start: string, end: string) {
  return `${dateFormatter.format(new Date(start))}, ${labelFormatter.format(new Date(start))} – ${labelFormatter.format(new Date(end))} CT`;
}
