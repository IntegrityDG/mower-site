import "server-only";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";

import {
  normalizeEmail,
} from "./validation";

import {
  notifyDealerMemberInvitation,
} from "./notifications";


export class MemberInvitationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}


function boundedText(
  value: unknown,
  maximum: number,
) {
  return typeof value === "string"
    ? value.trim().slice(0, maximum + 1)
    : "";
}


function invitationDatabaseError(
  message: string,
): MemberInvitationError {
  if (message.includes("already_member")) {
    return new MemberInvitationError(
      409,
      "That email address already belongs to a Dealer & Tech Network member.",
    );
  }

  if (
    message.includes(
      "invitation_recipient_cooldown",
    )
  ) {
    return new MemberInvitationError(
      429,
      "That email address has already been invited within the last 7 days.",
    );
  }

  if (
    message.includes(
      "invitation_daily_limit",
    )
  ) {
    return new MemberInvitationError(
      429,
      "You have reached the limit of 10 invitations in a 24-hour period.",
    );
  }

  if (
    message.includes(
      "inviter_unavailable",
    )
  ) {
    return new MemberInvitationError(
      403,
      "Your account cannot send invitations at this time.",
    );
  }

  return new MemberInvitationError(
    500,
    "The invitation could not be created.",
  );
}


export async function createMemberInvitation(
  memberId: string,
  input: unknown,
  origin: string,
) {
  const body =
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};

  const inviteeName =
    boundedText(
      body.inviteeName,
      160,
    );

  const inviteeEmail =
    normalizeEmail(
      body.inviteeEmail,
    );

  const rawPersonalMessage =
    boundedText(
      body.personalMessage,
      500,
    );

  const personalMessage =
    rawPersonalMessage || null;


  if (
    !inviteeName ||
    inviteeName.length > 160
  ) {
    throw new MemberInvitationError(
      400,
      "Enter the name of the person you want to invite.",
    );
  }


  if (!inviteeEmail) {
    throw new MemberInvitationError(
      400,
      "Enter a valid email address.",
    );
  }


  if (
    rawPersonalMessage.length > 500
  ) {
    throw new MemberInvitationError(
      400,
      "Personal messages are limited to 500 characters.",
    );
  }


  const client =
    getSupabaseServiceClient();


  const {
    data: inviter,
    error: inviterError,
  } = await client
    .from("dealer_network_members")
    .select(
      "id,member_name,company_name,email,status,account_locked,deleted_at",
    )
    .eq("id", memberId)
    .maybeSingle();


  if (
    inviterError ||
    !inviter ||
    inviter.status !== "active" ||
    inviter.account_locked ||
    inviter.deleted_at
  ) {
    throw new MemberInvitationError(
      403,
      "Your account cannot send invitations at this time.",
    );
  }


  if (
    String(inviter.email)
      .trim()
      .toLowerCase() === inviteeEmail
  ) {
    throw new MemberInvitationError(
      400,
      "You cannot invite your own email address.",
    );
  }


  const {
    data: invitationId,
    error: createError,
  } = await client.rpc(
    "dealer_network_create_member_invitation",
    {
      p_inviter_member_id:
        memberId,

      p_invitee_name:
        inviteeName,

      p_invitee_email:
        inviteeEmail,

      p_personal_message:
        personalMessage,
    },
  );


  if (
    createError ||
    !invitationId
  ) {
    throw invitationDatabaseError(
      createError?.message ??
        "invitation_creation_failed",
    );
  }


  let emailStatus:
    | "sent"
    | "skipped"
    | "failed" =
    "failed";


  try {
    emailStatus =
      await notifyDealerMemberInvitation(
        {
          invitationId:
            String(invitationId),

          inviterMemberId:
            memberId,

          inviterName:
            String(
              inviter.member_name,
            ),

          inviterCompanyName:
            inviter.company_name
              ? String(
                  inviter.company_name,
                )
              : null,

          inviteeName,
          inviteeEmail,
          personalMessage,
          origin,
        },
      );
  } catch (error) {
    console.error(
      "Dealer member invitation email failed:",
      error,
    );

    emailStatus = "failed";
  }


  return {
    invitationId:
      String(invitationId),

    emailStatus,
  };
}


export async function readMemberInvitations(
  memberId: string,
) {
  const client =
    getSupabaseServiceClient();


  const {
    data: invitations,
    error,
  } = await client
    .from(
      "dealer_network_member_invitations",
    )
    .select(
      "id,invitee_name,invitee_email,personal_message,created_at",
    )
    .eq(
      "inviter_member_id",
      memberId,
    )
    .order(
      "created_at",
      { ascending: false },
    )
    .limit(100);


  if (error) {
    throw new Error(
      "Invitation history is unavailable.",
    );
  }


  const rows =
    invitations ?? [];


  if (!rows.length) {
    return {
      invitations: [],
    };
  }


  const invitationIds =
    rows.map(
      (row) => row.id,
    );


  const {
    data: notificationRows,
    error: notificationError,
  } = await client
    .from(
      "dealer_network_notification_events",
    )
    .select(
      "invitation_id,status,created_at",
    )
    .eq(
      "event_type",
      "member_invitation",
    )
    .in(
      "invitation_id",
      invitationIds,
    )
    .order(
      "created_at",
      { ascending: false },
    );


  if (notificationError) {
    throw new Error(
      "Invitation notification history is unavailable.",
    );
  }


  const statusByInvitation =
    new Map<
      string,
      "sent" | "failed" | "pending"
    >();


  for (
    const notification
    of notificationRows ?? []
  ) {
    const id =
      notification.invitation_id
        ? String(
            notification.invitation_id,
          )
        : null;

    if (
      !id ||
      statusByInvitation.has(id)
    ) {
      continue;
    }

    statusByInvitation.set(
      id,
      notification.status === "sent"
        ? "sent"
        : notification.status ===
            "failed"
          ? "failed"
          : "pending",
    );
  }


  return {
    invitations:
      rows.map(
        (row) => ({
          id:
            String(row.id),

          inviteeName:
            String(
              row.invitee_name,
            ),

          inviteeEmail:
            String(
              row.invitee_email,
            ),

          personalMessage:
            row.personal_message
              ? String(
                  row.personal_message,
                )
              : null,

          createdAt:
            String(
              row.created_at,
            ),

          emailStatus:
            statusByInvitation.get(
              String(row.id),
            ) ?? "pending",
        }),
      ),
  };
}
