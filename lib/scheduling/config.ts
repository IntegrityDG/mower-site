import {
  APPOINTMENT_TYPES,
  type AppointmentType,
  type AppointmentTypeConfig,
} from "./types";

export const APPOINTMENT_TYPE_CONFIG: Record<AppointmentType, AppointmentTypeConfig> = {
  demo: { type: "demo", label: "Demo", durationMinutes: 240, active: true },
  install: { type: "install", label: "Install", durationMinutes: 240, active: false },
  setup: { type: "setup", label: "Setup", durationMinutes: 240, active: false },
  service: { type: "service", label: "Service", durationMinutes: 120, active: false },
};

export const APPOINTMENT_TYPES_IN_ORDER = APPOINTMENT_TYPES.map((type) => APPOINTMENT_TYPE_CONFIG[type]);

export function isAppointmentType(value: unknown): value is AppointmentType {
  return typeof value === "string" && APPOINTMENT_TYPES.includes(value as AppointmentType);
}

export function appointmentDurationMinutes(type: AppointmentType) {
  return APPOINTMENT_TYPE_CONFIG[type].durationMinutes;
}

export function appointmentTypeIsPubliclyActive(type: AppointmentType) {
  return APPOINTMENT_TYPE_CONFIG[type].active;
}
