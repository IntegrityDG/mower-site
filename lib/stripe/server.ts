import "server-only";

import Stripe from "stripe";
import { getStripeSecretKey } from "./config";

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  const secretKey = getStripeSecretKey();
  stripeClient ??= new Stripe(secretKey, { maxNetworkRetries: 2 });
  return stripeClient;
}
