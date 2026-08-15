export type NewMessageEmailInput = {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  origin: string;
};

export type NewMessageEmailSender = (message: {
  to: string;
  subject: string;
  text: string;
}) => Promise<unknown>;

export function sendNewMessageEmail(
  input: NewMessageEmailInput,
  sender: NewMessageEmailSender,
) {
  return sender({
    to: input.recipientEmail,
    subject: "You Have a New Message in the IDS Dealer & Tech Network",
    text: `Hello ${input.recipientName},\n\nYou have a new private message from ${input.senderName} in the IDS Dealer & Tech Community.\n\nOpen your messages: ${input.origin}/dealer-tech-resources/member\n\nFor privacy, this email does not include the message or photos.`,
  });
}
