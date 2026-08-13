const RESEND_ERROR_CODES = new Set([
  "invalid_idempotency_key", "validation_error", "missing_api_key", "restricted_api_key",
  "invalid_api_key", "not_found", "method_not_allowed", "invalid_idempotent_request",
  "concurrent_idempotent_requests", "invalid_attachment", "invalid_from_address",
  "invalid_access", "invalid_parameter", "invalid_region", "missing_required_field",
  "monthly_quota_exceeded", "daily_quota_exceeded", "rate_limit_exceeded",
  "security_error", "application_error", "internal_server_error",
]);

const VALIDATION_CODES = new Set(["validation_error", "invalid_attachment", "invalid_parameter", "missing_required_field"]);

export function sanitizeEmailFailure(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const rawCode = typeof value.name === "string" ? value.name : "";
  const code = RESEND_ERROR_CODES.has(rawCode) ? rawCode : "";
  const message = typeof value.message === "string" ? value.message.toLowerCase() : error instanceof Error ? error.message.toLowerCase() : "";
  const status = typeof value.statusCode === "number" && value.statusCode >= 100 && value.statusCode <= 599 ? value.statusCode : null;
  let category = "Resend API error";

  if (/domain.{0,30}(not verified|unverified)|verify.{0,30}domain/.test(message)) {
    category = "Resend domain not verified";
  } else if (code === "invalid_from_address" || /invalid.{0,20}(from|sender)|sender.{0,20}invalid/.test(message)) {
    category = "Resend sender invalid";
  } else if (/recipient.{0,30}(reject|invalid|suppress)|not allowed to send to|to address.{0,20}invalid/.test(message)) {
    category = "Resend recipient rejected";
  } else if (VALIDATION_CODES.has(code)) {
    category = "Resend validation error";
  } else if (code === "missing_api_key" || /api key.{0,20}missing|missing.{0,20}api key|resend_api_key.{0,20}missing/.test(message)) {
    category = "Resend API configuration error";
  }

  const details = [code || null, status ? `HTTP ${status}` : null].filter(Boolean);
  return `${category}${details.length ? ` (${details.join(", ")})` : ""}`.slice(0, 100);
}
