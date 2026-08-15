import "server-only";

import { sendIdsNotification, sendServerEmail } from "@/lib/email";
import { sanitizeEmailFailure } from "@/lib/email-diagnostics";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { sendNewMessageEmail } from "./new-message-email";
import type { NotificationEventType } from "./types";

type Claim = { claimed: boolean; eventId: string; claimedAt: string };
type EventContext = {
  eventKey: string;
  eventType: NotificationEventType;
  applicationId?: string | null;
  memberId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export async function deliverDealerNotification(
  context: EventContext,
  send: () => Promise<unknown>,
) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc(
    "dealer_network_claim_notification",
    {
      p_event_key: context.eventKey,
      p_event_type: context.eventType,
      p_application_id: context.applicationId ?? null,
      p_member_id: context.memberId ?? null,
    },
  );
  if (error || !data) throw new Error("Notification claim failed.");
  const claim = data as Claim;
  if (!claim.claimed) return "skipped" as const;
  if (context.conversationId || context.messageId) {
    const { error: contextError } = await client
      .from("dealer_network_notification_events")
      .update({
        conversation_id: context.conversationId ?? null,
        message_id: context.messageId ?? null,
      })
      .eq("id", claim.eventId);
    if (contextError) throw new Error("Notification context failed.");
  }
  try {
    await send();
    await client.rpc("dealer_network_finish_notification", {
      p_event_id: claim.eventId,
      p_claimed_at: claim.claimedAt,
      p_status: "sent",
      p_error: null,
    });
    return "sent" as const;
  } catch (error) {
    await client.rpc("dealer_network_finish_notification", {
      p_event_id: claim.eventId,
      p_claimed_at: claim.claimedAt,
      p_status: "failed",
      p_error: sanitizeEmailFailure(error),
    });
    throw error;
  }
}

export function notifyNewDealerMessage(
  input: {
    messageId: string;
    conversationId: string;
    recipientMemberId: string;
    recipientName: string;
    recipientEmail: string;
    senderName: string;
    origin: string;
  },
  sender = sendServerEmail,
) {
  return deliverDealerNotification(
    {
      eventKey: `dealer-message:${input.messageId}:first-unread`,
      eventType: "member_new_message",
      memberId: input.recipientMemberId,
      conversationId: input.conversationId,
      messageId: input.messageId,
    },
    () => sendNewMessageEmail(input, sender),
  );
}

type ApplicationNotice = {
  id: string;
  applicantName: string;
  companyName: string;
  role: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  zipCode: string;
  createdAt: string;
  reviewMessage?: string | null;
};

export function notifyNewDealerApplication(
  application: ApplicationNotice,
  sender = sendIdsNotification,
) {
  return deliverDealerNotification(
    {
      eventKey: `dealer-application:${application.id}:submitted`,
      eventType: "ids_new_application",
      applicationId: application.id,
    },
    () =>
      sender({
        subject: "IDS Dealer Network — New Application",
        text: [
          `Applicant: ${application.applicantName}`,
          `Company: ${application.companyName}`,
          `Role: ${application.role}`,
          `Phone: ${application.phone}`,
          `Email: ${application.email}`,
          `Business location: ${application.city}, ${application.state} ${application.zipCode}`,
          `Submitted: ${new Date(application.createdAt).toLocaleString("en-US")}`,
          "",
          `Review: /admin/dealer-network`,
        ].join("\n"),
      }),
  );
}

export function notifyDealerActivation(
  application: ApplicationNotice,
  memberId: string,
  token: string,
  origin: string,
  sender = sendServerEmail,
) {
  return deliverDealerNotification(
    {
      eventKey: `dealer-application:${application.id}:activation`,
      eventType: "applicant_activation",
      applicationId: application.id,
      memberId,
    },
    () => sendDealerActivationEmail(application, token, origin, sender),
  );
}

export function sendDealerActivationEmail(
  application: ApplicationNotice,
  token: string,
  origin: string,
  sender = sendServerEmail,
) {
  return sender({
    to: application.email,
    subject: "Activate Your IDS Dealer & Tech Community Account",
    text: `Hello ${application.applicantName},\n\nIDS approved your Dealer & Tech Community Resources application. Choose your six-digit PIN using this secure, single-use link:\n\n${origin}/dealer-tech-resources/activate?token=${encodeURIComponent(token)}\n\nThe link expires in 24 hours.`,
  });
}

export function notifyDealerDecision(
  application: ApplicationNotice,
  kind: "denied" | "more_information",
  sender = sendServerEmail,
) {
  const denied = kind === "denied";
  return deliverDealerNotification(
    {
      eventKey: `dealer-application:${application.id}:${kind}`,
      eventType: denied ? "applicant_denied" : "applicant_more_information",
      applicationId: application.id,
    },
    () =>
      sender({
        to: application.email,
        subject: denied
          ? "Update on Your IDS Dealer Network Application"
          : "More Information Requested for Your IDS Dealer Network Application",
        text: `Hello ${application.applicantName},\n\n${application.reviewMessage}\n\n${denied ? "Your application was not approved at this time." : "Please contact IDS with the requested clarification. Your application has not been denied."}`,
      }),
  );
}

export function notifyPinReset(
  input: {
    memberId: string;
    memberName: string;
    email: string;
    tokenId: string;
    token: string;
    origin: string;
    eventKey?: string;
  },
  sender = sendServerEmail,
) {
  return deliverDealerNotification(
    {
      eventKey:
        input.eventKey ??
        `dealer-member:${input.memberId}:pin-reset:${input.tokenId}`,
      eventType: "member_pin_reset",
      memberId: input.memberId,
    },
    () => sendPinResetEmail(input, sender),
  );
}

export function sendPinResetEmail(
  input: { memberName: string; email: string; token: string; origin: string },
  sender = sendServerEmail,
) {
  return sender({
    to: input.email,
    subject: "Reset Your IDS Dealer Network PIN",
    text: `Hello ${input.memberName},\n\nUse this secure, single-use link to choose a new six-digit PIN:\n\n${input.origin}/dealer-tech-resources/reset-pin?token=${encodeURIComponent(input.token)}\n\nThe link expires in 30 minutes. If you did not request this, you can ignore this message.`,
  });
}
