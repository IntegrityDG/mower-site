export const APPOINTMENT_TYPES = ["demo", "install", "setup", "service"] as const;

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export type AppointmentStatus = "pending" | "approved" | "denied" | "cancelled";
export type AppointmentPaymentStatus =
  | "not_started"
  | "checkout_open"
  | "paid"
  | "partially_refunded"
  | "refunded";

export type AppointmentTypeConfig = {
  type: AppointmentType;
  label: string;
  durationMinutes: number;
  active: boolean;
};

export type Appointment = {
  id: string;
  appointmentType: AppointmentType;
  durationMinutes: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  propertyAddress: string;
  requestedStartAt: string;
  requestedEndAt: string;
  status: AppointmentStatus;
  paymentStatus: AppointmentPaymentStatus;
  source: string;
  equipmentInterest: string | null;
  notes: string | null;
  adminMessage: string | null;
  createdAt: string;
  approvedAt: string | null;
  deniedAt: string | null;
  cancelledAt: string | null;
};

export type SchedulingAvailabilityRule = {
  id: string;
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type SchedulingAvailabilityException = {
  id: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reason: string | null;
};

export type AppointmentSlot = {
  startAt: string;
  endAt: string;
  date: string;
  timeLabel: string;
};
