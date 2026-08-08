import { Resend } from "resend";

let resend: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  resend ??= new Resend(apiKey);

  return resend;
}

export async function sendLeadEmail(
  content: string,
  subject = "New Mower Lead"
) {
  return sendIdsNotification({ subject, text: content });
}

export async function sendIdsNotification({ subject, text }: { subject: string; text: string }) {
  const notifyEmail = process.env.NOTIFY_EMAIL;

  if (!notifyEmail) {
    throw new Error("NOTIFY_EMAIL is missing.");
  }

  const result = await getResendClient().emails.send({
    from: "onboarding@resend.dev",
    to: notifyEmail,
    subject,
    text,
  });

  if ("error" in result && result.error) {
    throw new Error("Resend failed to send IDS notification.");
  }

  return result;
}
