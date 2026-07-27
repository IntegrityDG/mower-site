import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Stripe is not configured on this server.");
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}
