export type BoardEmailSender = (message: { to: string; subject: string; text: string }) => Promise<unknown>;

type BoardEmailInput = { recipientName: string; recipientEmail: string; topicTitle: string; origin: string };
const boardUrl = (origin: string) => `${origin}/dealer-tech-resources/member`;

export function sendBoardTopicEmail(input: BoardEmailInput & { responseRequested: boolean }, sender: BoardEmailSender) {
  return sender({
    to: input.recipientEmail,
    subject: input.responseRequested ? "Dealer Network Poll — Response Requested" : "New Dealer Network Board Topic",
    text: [`Hello ${input.recipientName},`, "", `IDS opened a Dealer Network Board topic: ${input.topicTitle}`, input.responseRequested ? "A poll response is requested." : "", "", `Open the Dealer Network Board: ${boardUrl(input.origin)}`, "", "For privacy, participation is available only after signing in to the Dealer Portal."].filter(Boolean).join("\n"),
  });
}

export function sendBoardPollReminderEmail(input: BoardEmailInput & { pollQuestion: string }, sender: BoardEmailSender) {
  return sender({ to: input.recipientEmail, subject: "Reminder: Dealer Network Poll Response Requested", text: [`Hello ${input.recipientName},`, "", `IDS is awaiting your response to: ${input.pollQuestion}`, `Topic: ${input.topicTitle}`, "", `Vote in the Dealer Network Board: ${boardUrl(input.origin)}`].join("\n") });
}

export function sendBoardDiscussionEmail(input: BoardEmailInput, sender: BoardEmailSender) {
  return sender({ to: input.recipientEmail, subject: "Dealer Network Discussion Opened", text: [`Hello ${input.recipientName},`, "", `IDS opened a discussion for: ${input.topicTitle}`, "", `Join the Dealer Network Board: ${boardUrl(input.origin)}`].join("\n") });
}
