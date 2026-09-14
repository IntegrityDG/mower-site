import type { PaymentMethodSettings } from "./types";
import { toPublicPaymentMethodAvailability } from "./types";

export const PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE =
  "Payment options are temporarily unavailable.";

type PublicPaymentMethodAvailabilityDependencies = {
  readSettings: () => Promise<PaymentMethodSettings>;
  achEnvironmentEnabled: () => boolean;
  logReadFailure?: () => void;
};

export function createPublicPaymentMethodAvailabilityHandler({
  readSettings,
  achEnvironmentEnabled,
  logReadFailure = () => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Payment method availability settings read failed.",
        route: "/api/checkout/payment-methods",
      }),
    );
  },
}: PublicPaymentMethodAvailabilityDependencies) {
  return async function GET() {
    try {
      const settings = await readSettings();
      return Response.json(
        toPublicPaymentMethodAvailability(
          settings,
          achEnvironmentEnabled(),
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      logReadFailure();
      return Response.json(
        { error: PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
}
