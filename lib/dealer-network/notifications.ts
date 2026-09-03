import "server-only";

import { sendIdsNotification, sendServerEmail } from "@/lib/email";
import { sanitizeEmailFailure } from "@/lib/email-diagnostics";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { sendNewMessageEmail } from "./new-message-email";
import { sendDealerBroadcastEmail } from "./broadcast-email";
import {
  deliverClaimedDealerNotification,
  type DealerNotificationClaim,
} from "./notification-delivery";
import {
  sendDealerMemberInvitationEmail,
  type DealerMemberInvitationEmailInput,
} from "./member-invitation-email";
import {
  sendSuggestionStatusEmail,
  type SuggestionStatusEmailInput,
} from "./suggestion-status-email";
import type { NotificationEventType } from "./types";
import { sendBoardDiscussionEmail, sendBoardPollReminderEmail, sendBoardTopicEmail } from "./board-email";

type EventContext = {
  eventKey: string;
  eventType: NotificationEventType;
  applicationId?: string | null;
  memberId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  broadcastId?: string | null;
  invitationId?: string | null;
  topicId?: string | null;
  pollId?: string | null;
};

export async function deliverDealerNotification(
  context: EventContext,
  send: () => Promise<unknown>,
) {
  const client = getSupabaseServiceClient();
  return deliverClaimedDealerNotification({
    claim: async () => {
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
      return data as DealerNotificationClaim;
    },
    prepare: async (claim) => {
      if (
        !context.conversationId &&
        !context.messageId &&
        !context.broadcastId &&
        !context.invitationId &&
        !context.topicId &&
        !context.pollId
      )
        return;
      const { error: contextError } = await client
        .from("dealer_network_notification_events")
        .update({
          conversation_id: context.conversationId ?? null,
          message_id: context.messageId ?? null,
          broadcast_id: context.broadcastId ?? null,
          invitation_id: context.invitationId ?? null,
          topic_id: context.topicId ?? null,
          poll_id: context.pollId ?? null,
        })
        .eq("id", claim.eventId);
      if (contextError) throw new Error("Notification context failed.");
    },
    send,
    finish: async (claim, status, deliveryError) => {
      const { error: finishError } = await client.rpc(
        "dealer_network_finish_notification",
        {
          p_event_id: claim.eventId,
          p_claimed_at: claim.claimedAt,
          p_status: status,
          p_error:
            status === "failed"
              ? sanitizeEmailFailure(deliveryError)
              : null,
        },
      );
      if (finishError) throw finishError;
    },
  });
}

export function notifyBoardTopic(input: { topicId: string; pollId?: string | null; recipientMemberId: string; recipientName: string; recipientEmail: string; topicTitle: string; responseRequested: boolean; origin: string; eventKeyPrefix?: string }, sender = sendServerEmail) {
  return deliverDealerNotification({ eventKey: `${input.eventKeyPrefix ?? `dealer-board-topic:${input.topicId}`}:${input.recipientMemberId}`, eventType: "member_board_topic", memberId: input.recipientMemberId, topicId: input.topicId, pollId: input.pollId }, () => sendBoardTopicEmail(input, sender));
}

export function notifyBoardPollReminder(input: { batchId: string; topicId: string; pollId: string; recipientMemberId: string; recipientName: string; recipientEmail: string; topicTitle: string; pollQuestion: string; origin: string }, sender = sendServerEmail) {
  return deliverDealerNotification({ eventKey: `dealer-board-poll-reminder:${input.pollId}:${input.batchId}:${input.recipientMemberId}`, eventType: "member_board_poll_reminder", memberId: input.recipientMemberId, topicId: input.topicId, pollId: input.pollId }, () => sendBoardPollReminderEmail(input, sender));
}

export function notifyBoardDiscussion(input: { topicId: string; recipientMemberId: string; recipientName: string; recipientEmail: string; topicTitle: string; origin: string }, sender = sendServerEmail) {
  return deliverDealerNotification({ eventKey: `dealer-board-discussion:${input.topicId}:${input.recipientMemberId}`, eventType: "member_board_discussion", memberId: input.recipientMemberId, topicId: input.topicId }, () => sendBoardDiscussionEmail(input, sender));
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

export function notifyDealerBroadcast(
  input: {
    broadcastId: string;
    recipientMemberId: string;
    recipientName: string;
    recipientEmail: string;
    subject: string;
    origin: string;
  },
  sender = sendServerEmail,
) {
  return deliverDealerNotification(
    {
      eventKey:
        `dealer-broadcast:${input.broadcastId}:${input.recipientMemberId}`,
      eventType: "member_broadcast",
      memberId:
        input.recipientMemberId,
      broadcastId:
        input.broadcastId,
    },
    () =>
      sendDealerBroadcastEmail(
        input,
        sender,
      ),
  );
}


export function notifyDealerMemberInvitation(
  input: DealerMemberInvitationEmailInput,
  sender = sendServerEmail,
) {
  return deliverDealerNotification(
    {
      eventKey:
        `dealer-member-invitation:${input.invitationId}`,
      eventType: "member_invitation",
      memberId: input.inviterMemberId,
      invitationId: input.invitationId,
    },
    () =>
      sendDealerMemberInvitationEmail(
        input,
        sender,
      ),
  );
}

export function notifySuggestionStatus(
  input: SuggestionStatusEmailInput,
  sender = sendServerEmail,
) {
  return sendSuggestionStatusEmail(input, sender);
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
