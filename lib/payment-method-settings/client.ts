import type { PurchaseMethodKey } from "@/lib/products/types";
import {
  customerPurchaseMethodIsAvailable,
  isPublicPaymentMethodAvailability,
  type PaymentMethodAvailabilityLoadState,
  type PublicPaymentMethodAvailability,
} from "./types";

export const PAYMENT_METHOD_AVAILABILITY_RETRY_DELAYS_MS = [300, 900] as const;

type AvailabilityResponse = Pick<Response, "json" | "ok">;
type AvailabilityFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<AvailabilityResponse>;
type RetryWait = (delayMs: number, signal: AbortSignal) => Promise<void>;

function abortedRequestError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted.", "AbortError");
}

const waitForRetry: RetryWait = (delayMs, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortedRequestError(signal));
      return;
    }

    const handleAbort = () => {
      clearTimeout(timeout);
      reject(abortedRequestError(signal));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });

export async function loadPaymentMethodAvailability({
  signal,
  fetcher = fetch,
  retryDelaysMs = PAYMENT_METHOD_AVAILABILITY_RETRY_DELAYS_MS,
  wait = waitForRetry,
}: {
  signal: AbortSignal;
  fetcher?: AvailabilityFetch;
  retryDelaysMs?: readonly number[];
  wait?: RetryWait;
}): Promise<PublicPaymentMethodAvailability> {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    if (signal.aborted) throw abortedRequestError(signal);

    try {
      const response = await fetcher("/api/checkout/payment-methods", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Payment options request failed.");

      const value: unknown = await response.json();
      if (!isPublicPaymentMethodAvailability(value)) {
        throw new Error("Payment options response was malformed.");
      }

      return value;
    } catch {
      if (signal.aborted) throw abortedRequestError(signal);
      if (attempt === retryDelaysMs.length) {
        throw new Error("Payment options could not be loaded.");
      }
      await wait(retryDelaysMs[attempt], signal);
    }
  }

  throw new Error("Payment options could not be loaded.");
}

export function retainAvailablePurchaseMethod(
  selectedMethod: PurchaseMethodKey | "",
  paymentMethods: PaymentMethodAvailabilityLoadState,
  checkoutAvailable: boolean,
): PurchaseMethodKey | "" {
  if (!selectedMethod || paymentMethods.status !== "ready") return "";
  return customerPurchaseMethodIsAvailable(
    selectedMethod,
    paymentMethods.availability,
    checkoutAvailable,
  )
    ? selectedMethod
    : "";
}
