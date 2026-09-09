import "server-only";
import { ServiceError } from "./validation";

export function serviceControls() {
  return {
    remoteSupport: process.env.REMOTE_SUPPORT_ENABLED === "true",
    serviceIntake: process.env.SERVICE_INTAKE_ENABLED === "true",
    payments: process.env.SERVICE_PAYMENTS_ENABLED === "true",
    cash: process.env.SERVICE_CASH_RECORDING_ENABLED === "true",
    email: process.env.SERVICE_EMAIL_ENABLED === "true",
    maintenance: process.env.SERVICE_MAINTENANCE_ENABLED === "true",
    terminalReader: process.env.SERVICE_TERMINAL_READER_ID?.trim() || null,
  };
}
export function requireServiceControl(control: "remoteSupport" | "serviceIntake" | "payments" | "cash") {
  if (!serviceControls()[control]) throw new ServiceError("This service is not accepting new requests or payments yet.", 503);
}
