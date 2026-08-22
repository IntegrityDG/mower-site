import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { hashPin, verifyPin } from "./security";
import { refreshStoredMemberGeocode } from "./geocoding";
import type { MemberAccountSecuritySummary } from "./types";
import { validatePin } from "./validation";

export async function readMemberAccountSecurity(tokenHash: string) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_member_account_summary",
    { p_token_hash: tokenHash },
  );
  if (error || !data) throw error ?? new Error("ACCOUNT_SUMMARY_UNAVAILABLE");
  const summary = data as MemberAccountSecuritySummary;
  return {
    accountStatus: summary.accountStatus,
    emailVerified: Boolean(summary.emailVerified),
    lastLoginAt: summary.lastLoginAt,
    activeSessionCount: Number(summary.activeSessionCount),
    currentSessionExpiresAt: String(summary.currentSessionExpiresAt),
    businessLocationReady: Boolean(summary.businessLocationReady),
  } satisfies MemberAccountSecuritySummary;
}

export async function revokeOtherMemberSessions(tokenHash: string) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_revoke_other_sessions",
    { p_token_hash: tokenHash },
  );
  if (error) throw error;
  return Number(data ?? 0);
}

export async function revokeAllMemberSessions(memberId: string) {
  const { error } = await getSupabaseServiceClient().rpc(
    "dealer_network_revoke_member_sessions",
    { p_member_id: memberId },
  );
  if (error) throw error;
}

export async function changeMemberPin(
  memberId: string,
  tokenHash: string,
  input: unknown,
) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const currentPin = validatePin(body.currentPin);
  const newPin = validatePin(body.newPin);
  if (!currentPin) return { ok: false as const, error: "Current PIN is incorrect." };
  if (!newPin)
    return { ok: false as const, error: "New PIN must be exactly 6 digits." };
  if (body.confirmNewPin !== newPin)
    return { ok: false as const, error: "New PIN confirmation does not match." };

  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("dealer_network_member_security", {
    p_member_id: memberId,
  });
  if (error || !data) throw error ?? new Error("CREDENTIALS_UNAVAILABLE");
  const credentials = data as { pinHash: string | null; pinSalt: string | null };
  if (
    !credentials.pinHash ||
    !credentials.pinSalt ||
    !(await verifyPin(currentPin, credentials.pinHash, credentials.pinSalt))
  )
    return { ok: false as const, error: "Current PIN is incorrect." };

  const replacement = await hashPin(newPin);
  const { data: changed, error: changeError } = await client.rpc(
    "dealer_network_change_pin",
    {
      p_token_hash: tokenHash,
      p_expected_pin_hash: credentials.pinHash,
      p_pin_hash: replacement.hash,
      p_pin_salt: replacement.salt,
    },
  );
  if (changeError) throw changeError;
  if (!changed)
    return {
      ok: false as const,
      error: "Your PIN could not be changed. Refresh and try again.",
    };
  return { ok: true as const };
}

export async function retryOwnBusinessLocation(memberId: string) {
  const result = await refreshStoredMemberGeocode(memberId);
  if (result.success)
    return {
      ok: true as const,
      message: "Your business location was updated successfully.",
    };
  if (result.reason === "NO_RESULTS" || result.reason === "INVALID_REQUEST")
    return {
      ok: false as const,
      status: 422,
      error:
        "We couldn't locate your business address. Check the address in My Profile and try again.",
    };
  return {
    ok: false as const,
    status: 503,
    error: "The location service is temporarily unavailable. Please try again later.",
  };
}
