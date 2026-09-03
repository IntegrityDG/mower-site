import type { ApplicationStatus, MemberStatus } from "./types";
import { normalizeEmail } from "./validation";

export type ActivationResendEligibility =
  | { eligible: true; email: string }
  | {
      eligible: false;
      reason:
        | "APPLICATION_NOT_APPROVED"
        | "MEMBER_NOT_PENDING_ACTIVATION"
        | "INVALID_EMAIL";
    };

export function activationResendEligibility(input: {
  applicationStatus: ApplicationStatus;
  memberStatus: MemberStatus | null;
  activatedAt: string | null;
  email: unknown;
}): ActivationResendEligibility {
  if (input.applicationStatus !== "approved")
    return { eligible: false, reason: "APPLICATION_NOT_APPROVED" };
  if (input.memberStatus !== "pending_activation" || input.activatedAt)
    return { eligible: false, reason: "MEMBER_NOT_PENDING_ACTIVATION" };
  const email = normalizeEmail(input.email);
  if (!email || email.length > 254)
    return { eligible: false, reason: "INVALID_EMAIL" };
  return { eligible: true, email };
}
