import "server-only";

import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { AccountState, MemberStatus } from "./types";
import {
  createOneTimeToken,
  hashPin,
  hashToken,
  privateIdentifierHash,
  verifyPin,
} from "./security";
import { normalizeEmail, normalizeUsPhone, validatePin } from "./validation";

export const MEMBER_SESSION_COOKIE = "ids_dealer_member";
export const MEMBER_SESSION_SECONDS = 60 * 60 * 12;
const GENERIC_LOGIN_ERROR = "The phone number or PIN is invalid.";
const fakeCredentials = hashPin("000000");

type AuthLookup = {
  memberId: string;
  status: MemberStatus;
  accountLocked: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  failedAttempts: number;
  authLockedUntil: string | null;
  email: string;
  normalizedEmail: string;
  emailVerifiedAt: string | null;
};

export class MemberAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MemberAccessError";
  }
}

export function effectiveLocked(status: MemberStatus, accountLocked: boolean) {
  return status !== "active" || accountLocked;
}

export function requestClientKey(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  return privateIdentifierHash(forwarded || direct || "unknown-client");
}

export async function consumeDealerRateLimit(
  scope: string,
  keyHash: string,
  maximum: number,
  windowSeconds: number,
) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_consume_rate_limit",
    {
      p_scope: scope,
      p_key_hash: keyHash,
      p_max_hits: maximum,
      p_window_seconds: windowSeconds,
    },
  );
  if (error) throw error;
  return data === true;
}

export async function authenticateMember(input: {
  phone: unknown;
  pin: unknown;
  clientKey: string;
}) {
  const normalizedPhone = normalizeUsPhone(input.phone);
  const pin = validatePin(input.pin);
  const combinedKey = privateIdentifierHash(
    `${input.clientKey}:${normalizedPhone ?? "invalid"}`,
  );
  if (!(await consumeDealerRateLimit("member_login", combinedKey, 10, 15 * 60)))
    throw new MemberAccessError(
      429,
      "Too many attempts. Please wait and try again.",
    );
  const client = getSupabaseServiceClient();
  const lookupResult = normalizedPhone
    ? await client.rpc("dealer_network_auth_lookup", {
        p_normalized_phone: normalizedPhone,
      })
    : { data: null, error: null };
  if (lookupResult.error) throw lookupResult.error;
  const account = lookupResult.data as AuthLookup | null;
  const fallback = await fakeCredentials;
  const validPin = pin
    ? await verifyPin(
        pin,
        account?.pinHash ?? fallback.hash,
        account?.pinSalt ?? fallback.salt,
      )
    : false;
  const temporarilyLocked = Boolean(
    account?.authLockedUntil &&
      new Date(account.authLockedUntil).getTime() > Date.now(),
  );
  const loginEligible =
    account?.status === "active" || account?.status === "suspended";
  if (!account || !validPin || temporarilyLocked || !loginEligible) {
    if (account && !validPin && !temporarilyLocked) {
      const { error } = await client.rpc(
        "dealer_network_record_login_failure",
        { p_member_id: account.memberId },
      );
      if (error) throw error;
    }
    throw new MemberAccessError(401, GENERIC_LOGIN_ERROR);
  }
  const { error: clearError } = await client.rpc(
    "dealer_network_clear_login_failures",
    { p_member_id: account.memberId },
  );
  if (clearError) throw clearError;
  const session = createOneTimeToken();
  const expiresAt = new Date(
    Date.now() + MEMBER_SESSION_SECONDS * 1000,
  ).toISOString();
  const { error } = await client.rpc("dealer_network_create_session", {
    p_member_id: account.memberId,
    p_token_hash: session.tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return { token: session.token, expiresAt };
}

export async function readMemberSession(): Promise<AccountState | null> {
  const token = (await cookies()).get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_read_session",
    { p_token_hash: hashToken(token) },
  );
  if (error || !data) return null;
  const session = data as Omit<AccountState, "effectiveLocked">;
  return {
    ...session,
    effectiveLocked: effectiveLocked(session.status, session.accountLocked),
  };
}

export async function readCurrentMemberTokenHash() {
  const token = (await cookies()).get(MEMBER_SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function requireAuthenticatedMember() {
  const session = await readMemberSession();
  if (!session) throw new MemberAccessError(401, "Authentication required.");
  return session;
}

export async function requireActiveUnlockedMember() {
  const session = await requireAuthenticatedMember();
  if (session.effectiveLocked)
    throw new MemberAccessError(403, "Member access is restricted.");
  return session;
}

export async function requireMessagingEnabledMember() {
  const session = await requireActiveUnlockedMember();
  if (!session.messagingEnabled)
    throw new MemberAccessError(
      403,
      "Messaging is disabled for this account. Existing messages remain available.",
    );
  return session;
}

export async function revokeCurrentMemberSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
  if (token)
    await getSupabaseServiceClient().rpc("dealer_network_revoke_session", {
      p_token_hash: hashToken(token),
    });
}

export async function createPinReset(input: {
  phone: unknown;
  email: unknown;
}) {
  const normalizedPhone = normalizeUsPhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedPhone || !normalizedEmail) return null;
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("dealer_network_pin_reset_target", {
    p_normalized_phone: normalizedPhone,
    p_normalized_email: normalizedEmail,
  });
  if (error) throw error;
  const target = data as {
    memberId: string;
    memberName: string;
    email: string;
  } | null;
  if (!target) return null;
  const token = createOneTimeToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data: tokenId, error: tokenError } = await client.rpc(
    "dealer_network_set_pin_reset_token",
    {
      p_member_id: target.memberId,
      p_token_hash: token.tokenHash,
      p_expires_at: expiresAt,
    },
  );
  if (tokenError) throw tokenError;
  return { ...target, ...token, tokenId: String(tokenId) };
}

export async function completePinReset(token: unknown, pinValue: unknown) {
  const pin = validatePin(pinValue);
  if (
    !pin ||
    typeof token !== "string" ||
    token.length < 30 ||
    token.length > 100
  )
    throw new MemberAccessError(400, "This reset link is invalid or expired.");
  const derived = await hashPin(pin);
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_reset_pin",
    {
      p_token_hash: hashToken(token),
      p_pin_hash: derived.hash,
      p_pin_salt: derived.salt,
    },
  );
  if (error || !data)
    throw new MemberAccessError(400, "This reset link is invalid or expired.");
  return String(data);
}

export async function completeActivation(token: unknown, pinValue: unknown) {
  const pin = validatePin(pinValue);
  if (
    !pin ||
    typeof token !== "string" ||
    token.length < 30 ||
    token.length > 100
  )
    throw new MemberAccessError(
      400,
      "This activation link is invalid or expired.",
    );
  const derived = await hashPin(pin);
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_activate_member",
    {
      p_token_hash: hashToken(token),
      p_pin_hash: derived.hash,
      p_pin_salt: derived.salt,
    },
  );
  if (error || !data)
    throw new MemberAccessError(
      400,
      "This activation link is invalid or expired.",
    );
  return String(data);
}
