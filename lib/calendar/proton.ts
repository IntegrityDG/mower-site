import ICAL from "ical.js";

export const BRIEFING_TIME_ZONE = "America/Chicago";
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_COMPONENTS = 2_000;
const MAX_PROPERTIES = 30_000;
const MAX_OCCURRENCES = 100_000;
const MAX_RESULTS = 2_000;
const DAY_MS = 86_400_000;

export class CalendarParseError extends Error {
  constructor() {
    super("Calendar data could not be safely parsed.");
    this.name = "CalendarParseError";
  }
}

export type BriefingEvent = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
};

export type CalendarBriefing = {
  date: string;
  timeZone: typeof BRIEFING_TIME_ZONE;
  events: BriefingEvent[];
};

type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type CalendarZone = ICAL.Timezone & { wallAtInstant: (instant: number) => WallTime };
type ZoneTransition = WallTime & { utcOffset: number; prevUtcOffset: number };

function wallMillis(time: WallTime): number {
  const date = new Date(0);
  date.setUTCFullYear(time.year, time.month - 1, time.day);
  date.setUTCHours(time.hour, time.minute, time.second, 0);
  return date.getTime();
}

function dateText(time: { year: number; month: number; day: number }): string {
  return `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function formatterFor(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
}

function wallAt(formatter: Intl.DateTimeFormat, instant: number): WallTime {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** An isolated IANA adapter: no global TimezoneService state shared between requests. */
function ianaZone(timeZone: string): CalendarZone {
  const formatter = formatterFor(timeZone); // Invalid / unknown TZIDs throw here.
  const offsetsByDay = new Map<string, number[]>();
  const zone = new ICAL.Timezone({ tzid: timeZone }) as CalendarZone;
  zone.wallAtInstant = (instant) => wallAt(formatter, instant);
  zone.utcOffset = (time: ICAL.Time): number => {
    const local = wallMillis(time);
    const key = dateText(time);
    let offsets = offsetsByDay.get(key);
    if (!offsets) {
      // Both sides of an offset transition are sampled, including a skipped date.
      const noon = wallMillis({ year: time.year, month: time.month, day: time.day, hour: 12, minute: 0, second: 0 });
      offsets = [...new Set([-2, 0, 2].map((days) => {
        const probe = noon + days * DAY_MS;
        return (wallMillis(wallAt(formatter, probe)) - probe) / 1000;
      }))];
      if (offsetsByDay.size >= 4_096) offsetsByDay.clear();
      offsetsByDay.set(key, offsets);
    }
    const candidates = offsets.map((offset) => {
      const instant = local - offset * 1000;
      return { instant, offset, difference: wallMillis(wallAt(formatter, instant)) - local };
    });
    // RFC 5545: the first occurrence of an ambiguous wall time; for a gap,
    // use the offset before the gap (which maps forward into valid local time).
    const matches = candidates.filter((candidate) => candidate.difference === 0).sort((a, b) => a.instant - b.instant);
    const selected = matches[0] ?? candidates.filter((candidate) => candidate.difference > 0).sort((a, b) => a.difference - b.difference)[0];
    if (!selected || Math.abs(selected.offset) > 24 * 60 * 60) throw new CalendarParseError();
    return selected.offset;
  };
  return zone;
}

function utcWall(instant: number): WallTime {
  const date = new Date(instant);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
}

/** Use the feed's transition definitions, including RFC gap/ambiguity semantics. */
function embeddedZone(component: ICAL.Component, tzid: string): CalendarZone {
  const zone = new ICAL.Timezone({ component, tzid }) as CalendarZone;
  const ensure = (year: number) => {
    zone._ensureCoverage(year);
    if (zone.changes.length > MAX_OCCURRENCES) throw new CalendarParseError();
    return zone.changes as ZoneTransition[];
  };
  zone.wallAtInstant = (instant) => {
    const changes = ensure(new Date(instant).getUTCFullYear());
    let offset = changes[0]?.prevUtcOffset ?? 0;
    for (const change of changes) {
      if (wallMillis(change) > instant) break;
      offset = change.utcOffset;
    }
    return utcWall(instant + offset * 1000);
  };
  zone.utcOffset = (time) => {
    const changes = ensure(time.year);
    const local = wallMillis(time);
    const offsets = [...new Set(changes.flatMap((change) => [change.utcOffset, change.prevUtcOffset]))];
    if (!offsets.length || offsets.some((offset) => !Number.isFinite(offset) || Math.abs(offset) > 86_400)) throw new CalendarParseError();
    const candidates = offsets.map((offset) => {
      const instant = local - offset * 1000;
      return { instant, offset, difference: wallMillis(zone.wallAtInstant(instant)) - local };
    });
    const matches = candidates.filter((candidate) => candidate.difference === 0).sort((a, b) => a.instant - b.instant);
    const selected = matches[0] ?? candidates.filter((candidate) => candidate.difference > 0).sort((a, b) => a.difference - b.difference)[0];
    if (!selected) throw new CalendarParseError();
    return selected.offset;
  };
  return zone;
}

function existingWallTime(time: ICAL.Time): boolean {
  if (time.isDate || time.zone === ICAL.Timezone.utcTimezone) return true;
  return wallMillis((time.zone as CalendarZone).wallAtInstant(instant(time))) === wallMillis(time);
}

function timeInZone(time: ICAL.Time, zone: ICAL.Timezone): ICAL.Time {
  const epoch = instant(time);
  const wall = zone === ICAL.Timezone.utcTimezone ? utcWall(epoch) : (zone as CalendarZone).wallAtInstant(epoch);
  const canonical = new ICAL.Time({ ...wall, isDate: false }, zone);
  if (instant(canonical) !== epoch) throw new CalendarParseError();
  return canonical;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z?)?$/.exec(value);
  if (!match) return false;
  const [, y, m, d, h = "0", minute = "0", second = "0"] = match;
  const wall = { year: Number(y), month: Number(m), day: Number(d), hour: Number(h), minute: Number(minute), second: Number(second) };
  if (wall.year < 1 || wall.year > 9999 || wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.hour > 23 || wall.minute > 59 || wall.second > 59) return false;
  const normalized = new Date(wallMillis(wall));
  return normalized.getUTCFullYear() === wall.year && normalized.getUTCMonth() + 1 === wall.month && normalized.getUTCDate() === wall.day;
}

function safeText(value: unknown, fallback: string, maximum: number, secrets: readonly string[]): string {
  if (typeof value !== "string") return fallback;
  // Redact before truncation so even a secret crossing the output length limit
  // cannot leave a partial credential in an otherwise harmless printable field.
  let sanitized = value;
  for (const secret of secrets) if (secret) sanitized = sanitized.split(secret).join("[redacted]");
  return sanitized.replace(/\b(?:https?|webcal):\/\/[^\s<>]+/gi, "[link omitted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum) || fallback;
}

function cancelled(event: ICAL.Event): boolean {
  return String(event.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
}

function revision(event: ICAL.Event): [number, number] {
  const sequence = event.sequence ?? 0;
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new CalendarParseError();
  const stamp = event.component.getFirstPropertyValue("dtstamp") as ICAL.Time | null;
  return [sequence, stamp instanceof ICAL.Time ? stamp.toUnixTime() : 0];
}

function newest(previous: ICAL.Event | undefined, incoming: ICAL.Event): ICAL.Event {
  if (!previous) return incoming;
  const oldRevision = revision(previous);
  const newRevision = revision(incoming);
  return newRevision[0] > oldRevision[0] || (newRevision[0] === oldRevision[0] && newRevision[1] >= oldRevision[1]) ? incoming : previous;
}

function instant(time: ICAL.Time): number {
  const value = time.toUnixTime() * 1000;
  if (!Number.isFinite(value)) throw new CalendarParseError();
  return value;
}

function durationEnd(start: ICAL.Time, duration: ICAL.Duration): ICAL.Time {
    if (duration.isNegative) throw new CalendarParseError();
    const end = start.clone();
    // RFC 5545 nominal days/weeks preserve wall time; the smaller components
    // are elapsed time. This also resolves a DTSTART inside a DST spring gap.
    end.adjust(duration.weeks * 7 + duration.days, 0, 0, 0);
    const elapsed = (duration.hours * 3600 + duration.minutes * 60 + duration.seconds) * 1000;
    if (start.isDate) {
      if (elapsed) throw new CalendarParseError();
      return end;
    }
    return ICAL.Time.fromJSDate(new Date(instant(end) + elapsed), true);
}

function occurrenceEnd(start: ICAL.Time, event: ICAL.Event): ICAL.Time {
  const duration = event.component.getFirstPropertyValue("duration") as ICAL.Duration | null;
  if (duration) return durationEnd(start, duration);
  if (start.isDate) {
    if (!event.endDate.isDate) throw new CalendarParseError();
    const span = (wallMillis(event.endDate) - wallMillis(event.startDate)) / DAY_MS;
    if (!Number.isSafeInteger(span) || span < 0 || (span === 0 && event.component.hasProperty("dtend"))) throw new CalendarParseError();
    const end = start.clone();
    end.adjust(span, 0, 0, 0);
    return end;
  }
  if (event.endDate.isDate) throw new CalendarParseError();
  // A recurring DTEND establishes an exact elapsed duration for each instance.
  const elapsed = instant(event.endDate) - instant(event.startDate);
  if (elapsed < 0 || (elapsed === 0 && event.component.hasProperty("dtend"))) throw new CalendarParseError();
  return ICAL.Time.fromJSDate(new Date(instant(start) + elapsed), true);
}

function localIso(instantMs: number, formatter: Intl.DateTimeFormat): string {
  const wall = wallAt(formatter, instantMs);
  const offset = Math.round((wallMillis(wall) - instantMs) / 60_000);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${dateText(wall)}T${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}:${String(wall.second).padStart(2, "0")}${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/** Parse only briefing fields. Raw ICS, identifiers, descriptions and links never leave this function. */
export function parseBriefing(icsText: string, date: string, secrets: readonly string[] = []): CalendarBriefing {
  try {
    if (!validDate(date) || date.length !== 10 || typeof icsText !== "string" || Buffer.byteLength(icsText, "utf8") > MAX_FEED_BYTES) throw new CalendarParseError();
    const redactionSecrets = [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!/^BEGIN:VCALENDAR\r?$/m.test(icsText) || !/^END:VCALENDAR\r?$/m.test(icsText)) throw new CalendarParseError();
    const calendar = new ICAL.Component(ICAL.parse(icsText));
    if (calendar.name !== "vcalendar") throw new CalendarParseError();
    const components = calendar.getAllSubcomponents();
    if (components.length > MAX_COMPONENTS) throw new CalendarParseError();
    let propertyCount = 0;
    const countProperties = (component: ICAL.Component) => {
      propertyCount += component.getAllProperties().length;
      if (propertyCount > MAX_PROPERTIES) throw new CalendarParseError();
      for (const child of component.getAllSubcomponents()) countProperties(child);
    };
    countProperties(calendar);

    const zones = new Map<string, CalendarZone>();
    for (const component of calendar.getAllSubcomponents("vtimezone")) {
      const tzid = component.getFirstPropertyValue("tzid");
      if (typeof tzid !== "string" || !tzid || zones.has(tzid) || !component.getAllSubcomponents().some((child) => child.name === "standard" || child.name === "daylight")) throw new CalendarParseError();
      zones.set(tzid, embeddedZone(component, tzid));
    }
    const chicagoZone = ianaZone(BRIEFING_TIME_ZONE);
    const zoneFor = (tzid: string): ICAL.Timezone => {
      let zone = zones.get(tzid);
      if (!zone) { zone = ianaZone(tzid); zones.set(tzid, zone); }
      return zone;
    };

    const normalizeTime = (time: ICAL.Time, property: ICAL.Property) => {
      if (time.isDate || time.zone === ICAL.Timezone.utcTimezone) return;
      const tzid = property.getParameter("tzid");
      time.zone = typeof tzid === "string" && tzid ? zoneFor(tzid) : chicagoZone;
    };
    const eventComponents = calendar.getAllSubcomponents("vevent");
    const periodEndsByComponent = new Map<ICAL.Component, Map<string, ICAL.Time>>();
    const groups = new Map<string, { master?: ICAL.Event; exceptions: Map<string, ICAL.Event> }>();
    for (const component of eventComponents) {
      const periodEnds = new Map<string, ICAL.Time>();
      for (const property of component.getAllProperties()) {
        if (property.type === "date" || property.type === "date-time") {
          const rawValues: unknown[] = property.toJSON().slice(3);
          if (rawValues.some((value) => typeof value !== "string" || !validDate(value))) throw new CalendarParseError();
          for (const time of property.getValues() as ICAL.Time[]) normalizeTime(time, property);
        } else if (property.type === "period") {
          const rawValues: unknown[] = property.toJSON().slice(3);
          if (rawValues.some((value) => !Array.isArray(value) || value.length !== 2 || !validDate(String(value[0])) || (!String(value[1]).startsWith("P") && !validDate(String(value[1]))))) throw new CalendarParseError();
          const periods = property.getValues() as ICAL.Period[];
          for (const period of periods) {
            normalizeTime(period.start, property);
            if (period.end) normalizeTime(period.end, property);
            if (property.name === "rdate") {
              if (period.start.isDate || (!period.end && !period.duration)) throw new CalendarParseError();
              const end = period.end ?? durationEnd(period.start, period.duration);
              if (instant(end) <= instant(period.start)) throw new CalendarParseError();
              periodEnds.set(String(instant(period.start)), end);
            }
          }
          if (property.name === "rdate") {
            // ICAL.js recurrence expansion expects Time values. Preserve each
            // PERIOD's end separately, then expand its start as a normal RDATE.
            property.resetType("date-time");
            property.setValues(periods.map((period) => period.start));
          }
        }
      }
      const uid = component.getFirstPropertyValue("uid");
      if (typeof uid !== "string" || !uid) throw new CalendarParseError();
      // Explicit empty exceptions avoids ICAL.js automatically relating every sibling.
      const event = new ICAL.Event(component, { exceptions: [], strictExceptions: true });
      const recurrenceId = event.recurrenceId;
      if (!event.startDate) {
        if (recurrenceId && cancelled(event)) event.startDate = recurrenceId.clone();
        else if (!cancelled(event)) throw new CalendarParseError();
      }
      for (const ruleProperty of component.getAllProperties("rrule")) {
        const rule = ruleProperty.getFirstValue() as ICAL.Recur;
        if (rule.until && !rule.until.isDate && rule.until.zone === ICAL.Timezone.localTimezone) rule.until.zone = event.startDate.zone;
      }
      // Invalid negative spans and inconsistent DATE/DATE-TIME ends fail safely.
      if (!cancelled(event)) occurrenceEnd(event.startDate, event);
      const group = groups.get(uid) ?? { exceptions: new Map<string, ICAL.Event>() };
      if (recurrenceId) {
        const key = recurrenceId.isDate ? dateText(recurrenceId) : String(instant(recurrenceId));
        group.exceptions.set(key, newest(group.exceptions.get(key), event));
      } else group.master = newest(group.master, event);
      groups.set(uid, group);
      periodEndsByComponent.set(component, periodEnds);
    }

    const [year, month, day] = date.split("-").map(Number);
    const dayStartTime = new ICAL.Time({ year, month, day, hour: 0, minute: 0, second: 0, isDate: false }, chicagoZone);
    const nextDayTime = dayStartTime.clone();
    nextDayTime.adjust(1, 0, 0, 0);
    const dayStart = instant(dayStartTime);
    const dayEnd = instant(nextDayTime);
    const nextDate = dateText(nextDayTime);
    const formatter = formatterFor(BRIEFING_TIME_ZONE);
    const results = new Map<string, { event: BriefingEvent; order: number }>();
    let iterations = 0;
    const add = (uid: string, recurrenceKey: string, event: ICAL.Event, start: ICAL.Time, explicitEnd?: ICAL.Time) => {
      if (cancelled(event)) return;
      const end = explicitEnd ?? occurrenceEnd(start, event);
      const allDay = start.isDate;
      const startMs = instant(start);
      const endMs = instant(end);
      if (endMs < startMs) throw new CalendarParseError();
      const overlaps = allDay
        ? dateText(start) < nextDate && dateText(end) > date
        : startMs < dayEnd && (endMs > dayStart || (endMs === startMs && startMs >= dayStart));
      if (!overlaps) return;
      const location = safeText(event.location, "", 500, redactionSecrets);
      const briefingEvent: BriefingEvent = {
        title: safeText(event.summary, "Untitled event", 1_000, redactionSecrets),
        start: allDay ? dateText(start) : localIso(startMs, formatter),
        end: allDay ? dateText(end) : localIso(endMs, formatter),
        allDay,
        ...(location ? { location } : {}),
      };
      results.set(JSON.stringify([uid, recurrenceKey]), { event: briefingEvent, order: allDay ? dayStart - 1 : startMs });
      if (results.size > MAX_RESULTS) throw new CalendarParseError();
    };

    for (const [uid, group] of groups) {
      const master = group.master;
      if (master && cancelled(master)) continue;
      if (!master) {
        for (const [key, exception] of group.exceptions) add(uid, key, exception, exception.startDate);
        continue;
      }
      let backwardShift = 0;
      for (const exception of group.exceptions.values()) {
        if (exception.recurrenceId.isDate !== master.startDate.isDate) throw new CalendarParseError();
        if (exception.modifiesFuture()) {
          if (!exception.recurrenceId.isDate) exception.recurrenceId = timeInZone(exception.recurrenceId, master.startDate.zone);
          master.relateException(exception);
          backwardShift = Math.max(backwardShift, wallMillis(exception.recurrenceId) - wallMillis(exception.startDate) + 2 * DAY_MS);
        }
      }
      if (master.isRecurring()) {
        const excludedDates = master.component.getAllProperties("exdate").flatMap((property) => property.getValues() as ICAL.Time[]);
        const excludedDays = new Set(excludedDates.filter((time) => time.isDate).map(dateText));
        const excludedInstants = new Set(excludedDates.filter((time) => !time.isDate).map((time) => String(instant(time))));
        const processOccurrence = (occurrence: ICAL.Time) => {
          const key = occurrence.isDate ? dateText(occurrence) : String(instant(occurrence));
          // Matching by instant also handles a RECURRENCE-ID expressed in a
          // different timezone from DTSTART; it always suppresses the original.
          const direct = group.exceptions.get(key);
          if (direct) { add(uid, key, direct, direct.startDate); return; }
          if (excludedDays.has(dateText(occurrence)) || (!occurrence.isDate && excludedInstants.has(key))) return;
          const details = master.getOccurrenceDetails(occurrence);
          const periodEnd = details.item === master ? periodEndsByComponent.get(master.component)?.get(key) : undefined;
          add(uid, key, details.item, details.startDate, periodEnd);
        };
        // DTSTART is part of the recurrence set even for RDATE-only calendars.
        processOccurrence(master.startDate);
        for (const property of master.component.getAllProperties("rrule")) {
          const rule = property.getFirstValue() as ICAL.Recur;
          rule.iterator = (start: ICAL.Time) => {
            const clone = rule.clone();
            // Recur.toJSON serializes UNTIL as a string and loses floating-zone
            // metadata, so preserve the already resolved Time on this clone.
            if (rule.until) clone.until = rule.until.clone();
            const ruleIterator = clone.iterator(start);
            const next = ruleIterator.next.bind(ruleIterator);
            ruleIterator.next = (again = false) => {
              for (;;) {
                const candidate = next(again);
                if (!candidate) return candidate;
                if (++iterations > MAX_OCCURRENCES) throw new CalendarParseError();
                if (wallMillis(candidate) === wallMillis(master.startDate) || existingWallTime(candidate)) return candidate;
                // RFC 5545 §3.3.10: generated nonexistent wall times are ignored
                // without consuming COUNT. Keep the clone's effective limit.
                if (ruleIterator.rule.count) ruleIterator.rule.count += 1;
              }
            };
            return ruleIterator;
          };
        }
        const iterator = master.iterator();
        for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
          if (++iterations > MAX_OCCURRENCES) throw new CalendarParseError();
          if (instant(occurrence) >= dayEnd + backwardShift + (occurrence.isDate ? DAY_MS : 0)) break;
          processOccurrence(occurrence);
        }
      } else if (!group.exceptions.size) add(uid, "single", master, master.startDate);
      else {
        const originalKey = master.startDate.isDate ? dateText(master.startDate) : String(instant(master.startDate));
        if (!group.exceptions.has(originalKey)) add(uid, originalKey, master, master.startDate);
      }
      // A moved occurrence may have its original recurrence ID outside today's
      // expansion window. Include the replacement itself and deduplicate by ID.
      for (const [key, exception] of group.exceptions) add(uid, key, exception, exception.startDate);
    }
    return {
      date, timeZone: BRIEFING_TIME_ZONE,
      events: [...results.values()].sort((a, b) => a.order - b.order || a.event.title.localeCompare(b.event.title)).map(({ event }) => event),
    };
  } catch {
    // Never expose the parser's messages, stack, raw property values or input.
    throw new CalendarParseError();
  }
}
