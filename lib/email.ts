import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("RESEND_API_KEY is missing.");
}

const resend = new Resend(apiKey);

export async function sendLeadEmail(content: string) {
  console.log("sendLeadEmail called");
  console.log("NOTIFY_EMAIL:", process.env.NOTIFY_EMAIL);

  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: process.env.NOTIFY_EMAIL!,
    subject: "New Mower Lead",
    text: content,
  });

  console.log("Resend raw result:", result);

  if ("error" in result && result.error) {
    throw new Error(
      `Resend error: ${result.error.message || JSON.stringify(result.error)}`
    );
  }

  return result;
}