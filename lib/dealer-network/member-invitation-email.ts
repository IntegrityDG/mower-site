export type DealerMemberInvitationEmailInput = {
  invitationId: string;
  inviterMemberId: string;
  inviterName: string;
  inviterCompanyName: string | null;
  inviteeName: string;
  inviteeEmail: string;
  personalMessage: string | null;
  origin: string;
};

export type DealerMemberInvitationEmailSender = (
  message: {
    to: string;
    subject: string;
    text: string;
  },
) => Promise<unknown>;

export function sendDealerMemberInvitationEmail(
  input: DealerMemberInvitationEmailInput,
  sender: DealerMemberInvitationEmailSender,
) {
  const inviterIdentity = input.inviterCompanyName
    ? `${input.inviterName} of ${input.inviterCompanyName}`
    : input.inviterName;

  const personalMessage = input.personalMessage
    ? [
        "",
        "Personal message from your inviter:",
        input.personalMessage,
      ]
    : [];

  return sender({
    to: input.inviteeEmail,
    subject:
      "You Have Been Invited to the IDS Dealer & Tech Community",
    text: [
      `Hello ${input.inviteeName},`,
      "",
      `${inviterIdentity} has invited you to apply to join the IDS Dealer & Tech Community.`,
      "",
      "The community connects robotic mower dealers, repair technicians, and other qualified industry professionals.",
      ...personalMessage,
      "",
      "Apply to Join:",
      `${input.origin}/dealer-tech-resources/apply`,
      "",
      "Membership is reviewed by IDS. Receiving an invitation does not guarantee approval or provide immediate portal access.",
      "",
      "If you were not expecting this invitation, you may simply ignore this email.",
    ].join("\n"),
  });
}
