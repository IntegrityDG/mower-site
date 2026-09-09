import "server-only";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { operationKey } from "./admin-policy";
import { validateInstallationIntake } from "./validation";
import { requireServiceAvailability } from "@/lib/service/availability";

export async function createSetupOnlyJob(raw: unknown) {
  if (!(await isReviewAdmin())) throw new Error("Unauthorized");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_setup_only_request");
  const { operationKey: key, reason, ...input } = raw as Record<string, unknown>;
  if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) throw new Error("recorded_reason_required");
  if (Object.keys(input).some(k => !["name", "email", "phone", "address", "equipment", "internetAvailability", "startAt", "responsibilitiesAcknowledged", "termsAcknowledged"].includes(k))) throw new Error("invalid_setup_only_request");
  const parsed = validateInstallationIntake({ ...input, idempotencyKey: operationKey(key), setupSelected: true,
    groundingAcknowledged: false, undergroundRequested: false, undergroundAcknowledged: false, cashRequested: false }, "setup_only");
  if (!parsed.ok || !parsed.value.equipment) throw new Error("invalid_setup_only_request");
  await requireServiceAvailability("professional_setup");
  const { data, error } = await getSupabaseServiceClient().rpc("ids_create_setup_only", { p_payload: parsed.value, p_reason: reason.trim() });
  if (error) throw error;
  if (!data?.ok || !data.id || !data.public_token) throw new Error("setup_response_incomplete");
  return data;
}
