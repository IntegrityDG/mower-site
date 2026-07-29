export class StripeConfigurationError extends Error {
  readonly code = "STRIPE_CONFIGURATION";
}

export type StripeConfiguration = { secretKey: string; appBaseUrl: string; checkoutSigningSecret: string };

function required(env: NodeJS.ProcessEnv, name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "APP_BASE_URL" | "CHECKOUT_SIGNING_SECRET") {
  const value = env[name];
  if (!value) throw new StripeConfigurationError("Stripe test checkout is not configured.");
  return value;
}

export function getStripeConfiguration(env: NodeJS.ProcessEnv = process.env): StripeConfiguration {
  const secretKey = getStripeSecretKey(env);
  const appBaseUrl = required(env, "APP_BASE_URL");
  const checkoutSigningSecret = getCheckoutSigningSecret(env);
  let url: URL;
  try { url = new URL(appBaseUrl); } catch { throw new StripeConfigurationError("APP_BASE_URL is invalid."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new StripeConfigurationError("APP_BASE_URL must be a trusted origin.");
  if (local ? env.NODE_ENV === "production" || url.protocol !== "http:" : url.protocol !== "https:") throw new StripeConfigurationError("APP_BASE_URL must use an approved protocol.");
  return { secretKey, appBaseUrl: url.origin, checkoutSigningSecret };
}

export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env) {
  const secretKey = required(env, "STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) throw new StripeConfigurationError("Only Stripe test mode is permitted.");
  return secretKey;
}

export function getStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env) { return required(env, "STRIPE_WEBHOOK_SECRET"); }
export function getCheckoutSigningSecret(env: NodeJS.ProcessEnv = process.env) { return required(env, "CHECKOUT_SIGNING_SECRET"); }
