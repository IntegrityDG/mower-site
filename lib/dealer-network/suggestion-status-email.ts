export type SuggestionEmailStatus = "reviewed" | "resolved";

export type SuggestionStatusEmailInput = {
  memberName: string;
  memberEmail: string;
  status: SuggestionEmailStatus;
};

export type SuggestionStatusEmailSender = (message: {
  to: string;
  subject: string;
  text: string;
}) => Promise<unknown>;

export function sendSuggestionStatusEmail(
  input: SuggestionStatusEmailInput,
  sender: SuggestionStatusEmailSender,
) {
  const resolved = input.status === "resolved";
  const status = resolved ? "Resolved" : "Reviewed";
  return sender({
    to: input.memberEmail,
    subject: `Your IDS Dealer Network Suggestion Has Been ${status}`,
    text: `Hello ${input.memberName},\n\nThank you for helping improve the IDS Dealer & Tech Network. Your suggestion status is now ${status}.`,
  });
}
