import { addDays, centralWeekday, minutes, slotFromLocal, timeFromMinutes } from "./time";
import type { AppointmentSlot, AppointmentStatus, AppointmentType } from "./types";

export type CalendarOccupancy = {
  appointment_type?: AppointmentType;
  requested_start_at: string;
  requested_end_at: string;
  status: AppointmentStatus;
};

export function appointmentRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

export function appointmentOccupiesCalendar(status: AppointmentStatus) {
  return status === "pending" || status === "approved";
}

export function generateAppointmentSlots(input: {
  start: string;
  end: string;
  now: Date;
  rules: { weekday: number; enabled: boolean; start_time: string; end_time: string }[];
  exceptions: { starts_at: string; ends_at: string }[];
  appointments: CalendarOccupancy[];
  durationMinutes: number;
  horizonDays: number;
}) {
  const ruleMap = new Map(input.rules.map((rule) => [Number(rule.weekday), rule]));
  const latest = input.now.getTime() + input.horizonDays * 86_400_000;
  const slots: AppointmentSlot[] = [];
  for (let date = input.start; date <= input.end; date = addDays(date, 1)) {
    const rule = ruleMap.get(centralWeekday(date));
    if (!rule?.enabled) continue;
    for (
      let at = minutes(rule.start_time);
      at + input.durationMinutes <= minutes(rule.end_time);
      at += input.durationMinutes
    ) {
      const slot = slotFromLocal(date, timeFromMinutes(at), input.durationMinutes);
      if (!slot || Date.parse(slot.startAt) <= input.now.getTime() || Date.parse(slot.startAt) > latest) continue;
      if (input.exceptions.some((exception) => appointmentRangesOverlap(slot.startAt, slot.endAt, exception.starts_at, exception.ends_at))) continue;
      if (input.appointments.some((appointment) => appointmentOccupiesCalendar(appointment.status) && appointmentRangesOverlap(slot.startAt, slot.endAt, appointment.requested_start_at, appointment.requested_end_at))) continue;
      slots.push(slot);
    }
  }
  return slots;
}
