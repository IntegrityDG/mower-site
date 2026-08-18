export type DealerBroadcastEmailInput = {
  recipientName: string;
  recipientEmail: string;
  broadcastId: string;
  subject: string;
  origin: string;
};

export type DealerBroadcastEmailSender = (
  message: {
    to: string;
    subject: string;
    text: string;
  },
) => Promise<unknown>;

export function sendDealerBroadcastEmail(
  input: DealerBroadcastEmailInput,
  sender: DealerBroadcastEmailSender,
) {
  return sender({
    to: input.recipientEmail,
    subject:
      "New IDS Dealer & Tech Network Announcement",
    text: [
      `Hello ${input.recipientName},`,
      "",
      "IDS has posted a new announcement in the Dealer & Tech Community.",
      "",
      `Announcement: ${input.subject}`,
      "",
      `Open IDS Announcements: ${input.origin}/dealer-tech-resources/member`,
      "",
      "For privacy and consistency, the full announcement is available only inside the Dealer Portal.",
    ].join("\n"),
  });
}
