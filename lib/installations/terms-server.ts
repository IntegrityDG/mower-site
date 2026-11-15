import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";

// The migration adds this column and replaces both creation RPCs in one
// transaction. Probe schema only (zero rows) before creating any request, so an
// app-first or missing-schema rollout cannot silently save the old terms.
export async function requireInstallationCancellationSchema() {
  const { data, error } = await getSupabaseServiceClient().from("installations").select("cancellation_review").limit(0);
  if (error || !Array.isArray(data)) throw new Error("installation_cancellation_schema_unavailable");
}
