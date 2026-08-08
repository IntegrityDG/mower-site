import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { AdminReferral } from "./admin";

function result<T>(response: { data: T | null; error: { message: string } | null }) {
  if (response.error || response.data === null) throw new Error(response.error?.message ?? "Referral operation failed.");
  return response.data;
}

export async function listAdminReferrals() {
  return result(await getSupabaseServiceClient().rpc("checkout_admin_list_referrals")) as AdminReferral[];
}

export async function mutateAdminReferral(id: string, action: string, reason: string | null) {
  return result(await getSupabaseServiceClient().rpc("checkout_admin_mutate_referral", {
    p_referral_id: id,
    p_action: action,
    p_reason: reason,
  })) as AdminReferral;
}
