import { generateAppointmentSlots } from "@/lib/scheduling/availability";
import type { DemoRequest } from "./types";

export function generateAvailableSlots(input:{start:string;end:string;now:Date;rules:{weekday:number;enabled:boolean;start_time:string;end_time:string}[];exceptions:{starts_at:string;ends_at:string}[];requests:{requested_start_at:string;requested_end_at:string;status:DemoRequest["status"]}[];duration:number;horizon:number}) {
  return generateAppointmentSlots({start:input.start,end:input.end,now:input.now,rules:input.rules,exceptions:input.exceptions,appointments:input.requests,durationMinutes:input.duration,horizonDays:input.horizon});
}
