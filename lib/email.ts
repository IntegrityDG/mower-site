import { Resend } from "resend";
import { sanitizeEmailFailure } from "@/lib/email-diagnostics";

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

  let result;
  try {
    result = await getResendClient().emails.send({
      from: "onboarding@resend.dev",
      to: notifyEmail,
      subject,
      text,
    });
  } catch (error) {
    throw new Error(sanitizeEmailFailure(error));
  }

  if ("error" in result && result.error) {
    throw new Error(sanitizeEmailFailure(result.error));
  }

  return result;
}

export async function sendServerEmail({to,subject,text,html,attachments}: {to:string;subject:string;text:string;html?:string;attachments?:{filename:string;content:string;contentType?:string}[]}) {
  const from=process.env.DEMO_FROM_EMAIL?.trim();
  if(!from)throw new Error("DEMO_FROM_EMAIL is missing.");
  let result;
  try {
    result=await getResendClient().emails.send({from,to,subject,text,html,attachments});
  } catch(error) {
    throw new Error(sanitizeEmailFailure(error));
  }
  if("error" in result&&result.error)throw new Error(sanitizeEmailFailure(result.error));
  return result;
}
