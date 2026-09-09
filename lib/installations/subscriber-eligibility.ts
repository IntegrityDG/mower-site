import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";

/**
 * The sole runtime source of Remote Support discount eligibility for this job.
 * Ownership is linked only by possession of both private customer links.
 * The website's active paid subscription records are authoritative. Missing
 * or unverifiable subscriptions fail closed. Never use browser claims,
 * a manual flag, or an environment override as evidence of a subscription.
 */
export async function getRemoteSupportEligibility(installationId: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) return false;
  const db = getSupabaseServiceClient();
  const { data: binding, error } = await db.from("service_installation_customers").select("customer_id").eq("installation_id", installationId).maybeSingle();
  // Before the Remote Support migration is released, eligibility remains off.
  if (error && ["42P01", "PGRST205"].includes(error.code)) return false;
  if (error) throw error;
  if (!binding) return false;
  const result = await db.rpc("ids_support_eligible", { p_customer: binding.customer_id });
  if (result.error) throw result.error;
  return result.data === true;
}
