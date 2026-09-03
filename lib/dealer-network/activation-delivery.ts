export const ACTIVATION_EMAIL_COOLDOWN_SECONDS = 5 * 60;

export type ActivationDeliveryErrorCode =
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_NOT_APPROVED"
  | "MEMBER_NOT_FOUND"
  | "MEMBER_NOT_PENDING_ACTIVATION"
  | "MEMBER_STATE_CHANGED"
  | "INVALID_EMAIL"
  | "RATE_LIMIT"
  | "ACTIVATION_STAGING_FAILED"
  | "ACTIVATION_FINALIZATION_FAILED";

export class ActivationDeliveryError extends Error {
  constructor(public readonly code: ActivationDeliveryErrorCode) {
    super(code);
    this.name = "ActivationDeliveryError";
  }
}

export type StagedActivationToken = {
  tokenId: string;
  memberId: string;
  recipientEmail: string;
};

export async function deliverStagedActivation(input: {
  applicationId: string;
  memberId: string;
  expectedEmail: string;
  createToken: () => { token: string; tokenHash: string };
  stage: (value: {
    applicationId: string;
    memberId: string;
    expectedEmail: string;
    tokenHash: string;
  }) => Promise<StagedActivationToken>;
  send: (value: {
    memberId: string;
    recipientEmail: string;
    token: string;
  }) => Promise<unknown>;
  finalize: (value: {
    memberId: string;
    tokenId: string;
    expectedEmail: string;
  }) => Promise<{ finalized: boolean; reason?: string }>;
}) {
  const token = input.createToken();
  const staged = await input.stage({
    applicationId: input.applicationId,
    memberId: input.memberId,
    expectedEmail: input.expectedEmail,
    tokenHash: token.tokenHash,
  });

  await input.send({
    memberId: staged.memberId,
    recipientEmail: staged.recipientEmail,
    token: token.token,
  });

  const finalized = await input.finalize({
    memberId: staged.memberId,
    tokenId: staged.tokenId,
    expectedEmail: staged.recipientEmail,
  });
  if (!finalized.finalized) {
    throw new ActivationDeliveryError(
      finalized.reason === "member_state_changed" ||
        finalized.reason === "member_email_changed"
        ? "MEMBER_STATE_CHANGED"
        : "ACTIVATION_FINALIZATION_FAILED",
    );
  }

  return {
    memberId: staged.memberId,
    recipientEmail: staged.recipientEmail,
  } as const;
}
