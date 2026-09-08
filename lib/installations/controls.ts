import "server-only";
import { getStripeMode } from "@/lib/stripe/config-values";

// Only the exact value "true" opts in. Never query a table to check activation.
export function installationControls() {
  return {
    intakeEnabled: process.env.INSTALLATION_INTAKE_ENABLED === "true",
    onlinePaymentsEnabled: process.env.INSTALLATION_ONLINE_PAYMENTS_ENABLED === "true",
    cashRecordingEnabled: process.env.INSTALLATION_CASH_RECORDING_ENABLED === "true",
  };
}

export function requireInstallationIntake() {
  if (!installationControls().intakeEnabled) throw new Error("installation_intake_disabled");
}

export function requireInstallationOnlinePayments() {
  if (!installationControls().onlinePaymentsEnabled) throw new Error("installation_online_payments_disabled");
}

export function requireInstallationCashRecording() {
  if (!installationControls().cashRecordingEnabled) throw new Error("installation_cash_recording_disabled");
}

export function installationCheckoutAvailable() {
  if (!installationControls().onlinePaymentsEnabled) return false;
  try { return getStripeMode(process.env) === "test"; } catch { return false; }
}
