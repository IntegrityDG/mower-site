export class StripeConfigurationError extends Error {
  readonly code = "STRIPE_CONFIGURATION";
}

export type StripeMode = "test" | "live";
export type StripeConfiguration = { secretKey: string; mode: StripeMode; livemode: boolean; appBaseUrl: string; checkoutSigningSecret: string };

function required(env: NodeJS.ProcessEnv, name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "APP_BASE_URL" | "CHECKOUT_SIGNING_SECRET") {
  const value = env[name];
  if (!value) throw new StripeConfigurationError("Stripe checkout is not configured.");
  return value;
}

export function getStripeConfiguration(env: NodeJS.ProcessEnv = process.env): StripeConfiguration {
  const mode = getStripeMode(env);
  const secretKey = getStripeSecretKey(env);
  const appBaseUrl = required(env, "APP_BASE_URL");
  const checkoutSigningSecret = getCheckoutSigningSecret(env);
  let url: URL;
  try { url = new URL(appBaseUrl); } catch { throw new StripeConfigurationError("APP_BASE_URL is invalid."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new StripeConfigurationError("APP_BASE_URL must be a trusted origin.");
  if (local ? env.NODE_ENV === "production" || url.protocol !== "http:" : url.protocol !== "https:") throw new StripeConfigurationError("APP_BASE_URL must use an approved protocol.");
  return { secretKey, mode, livemode: mode === "live", appBaseUrl: url.origin, checkoutSigningSecret };
}

export function getStripeMode(env: NodeJS.ProcessEnv = process.env): StripeMode {
  const mode = env.STRIPE_MODE;
  if (!mode) return "test";
  if (mode === "test" || mode === "live") return mode;
  throw new StripeConfigurationError("STRIPE_MODE must be test or live.");
}

export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env) {
  const secretKey = required(env, "STRIPE_SECRET_KEY");
  const mode = getStripeMode(env);
  const requiredPrefix = mode === "live" ? "sk_live_" : "sk_test_";
  if (!secretKey.startsWith(requiredPrefix)) throw new StripeConfigurationError("Stripe secret key does not match STRIPE_MODE.");
  return secretKey;
}

export function getStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env) { return required(env, "STRIPE_WEBHOOK_SECRET"); }
export function getCheckoutSigningSecret(env: NodeJS.ProcessEnv = process.env) { return required(env, "CHECKOUT_SIGNING_SECRET"); }
