import "server-only";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";

import {
  notifyDealerBroadcast,
} from "./notifications";

import {
  readBoundedText,
  validateUuid,
} from "./validation";


type BroadcastRow = {
  id: string;
  subject: string;
  body: string;
  recipient_count: number;
  created_at: string;
  sent_at: string;
};

type RecipientRow = {
  broadcast_id: string;
  member_id: string;
  read_at: string | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  member_name: string;
  email: string;
};

type NotificationRow = {
  broadcast_id: string | null;
  status: string;
};


function inputRecord(
  input: unknown,
): Record<string, unknown> {
  return input &&
    typeof input === "object" &&
    !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}


export async function createDealerBroadcast(
  input: unknown,
  origin: string,
) {
  const body = inputRecord(input);

  const subject =
    readBoundedText(
      body.subject,
      180,
    );

  const message =
    readBoundedText(
      body.body,
      5000,
    );

  if (
    !subject ||
    subject.length > 180 ||
    !message ||
    message.length > 5000
  ) {
    throw new Error(
      "INVALID_BROADCAST",
    );
  }

  const client =
    getSupabaseServiceClient();

  const {
    data,
    error,
  } = await client.rpc(
    "dealer_network_create_broadcast",
    {
      p_subject: subject,
      p_body: message,
    },
  );

  if (error || !data) {
    throw (
      error ??
      new Error(
        "BROADCAST_CREATE_FAILED",
      )
    );
  }

  const result = data as {
    broadcastId: string;
    recipientCount: number;
  };

  const {
    data: recipientRows,
    error: recipientError,
  } = await client
    .from(
      "dealer_network_broadcast_recipients",
    )
    .select("member_id")
    .eq(
      "broadcast_id",
      result.broadcastId,
    );

  if (recipientError) {
    throw recipientError;
  }

  const recipientIds = (
    recipientRows ?? []
  ).map((row) =>
    String(row.member_id),
  );

  let members: MemberRow[] = [];

  if (recipientIds.length) {
    const {
      data: memberRows,
      error: memberError,
    } = await client
      .from(
        "dealer_network_members",
      )
      .select(
        "id,member_name,email",
      )
      .in("id", recipientIds);

    if (memberError) {
      throw memberError;
    }

    members =
      (memberRows ??
        []) as MemberRow[];
  }

  let emailSentCount = 0;
  let emailSkippedCount = 0;
  let emailFailedCount = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;

      if (index >= members.length) {
        return;
      }

      const member =
        members[index];

      try {
        const outcome =
          await notifyDealerBroadcast({
            broadcastId:
              result.broadcastId,
            recipientMemberId:
              member.id,
            recipientName:
              member.member_name,
            recipientEmail:
              member.email,
            subject,
            origin,
          });

        if (outcome === "sent") {
          emailSentCount++;
        } else {
          emailSkippedCount++;
        }
      } catch (error) {
        emailFailedCount++;

        console.warn(
          "Dealer broadcast email failed",
          {
            broadcastId:
              result.broadcastId,
            memberId:
              member.id,
            error:
              error instanceof Error
                ? error.message
                : "unknown",
          },
        );
      }
    }
  }

  const workerCount =
    Math.min(
      5,
      members.length,
    );

  await Promise.all(
    Array.from(
      {
        length: workerCount,
      },
      () => worker(),
    ),
  );

  return {
    broadcastId:
      result.broadcastId,

    recipientCount:
      result.recipientCount,

    emailSentCount,

    emailSkippedCount,

    emailFailedCount,
  };
}


export async function readAdminBroadcasts() {
  const client =
    getSupabaseServiceClient();

  const {
    data,
    error,
  } = await client
    .from(
      "dealer_network_broadcasts",
    )
    .select(
      "id,subject,body,recipient_count,created_at,sent_at",
    )
    .order(
      "sent_at",
      {
        ascending: false,
      },
    )
    .order(
      "id",
      {
        ascending: false,
      },
    )
    .limit(100);

  if (error) {
    throw error;
  }

  const broadcasts =
    (data ??
      []) as BroadcastRow[];

  if (!broadcasts.length) {
    return [];
  }

  const broadcastIds =
    broadcasts.map(
      (broadcast) =>
        broadcast.id,
    );

  const [
    recipientResult,
    notificationResult,
  ] = await Promise.all([
    client
      .from(
        "dealer_network_broadcast_recipients",
      )
      .select(
        "broadcast_id,member_id,read_at,created_at",
      )
      .in(
        "broadcast_id",
        broadcastIds,
      ),

    client
      .from(
        "dealer_network_notification_events",
      )
      .select(
        "broadcast_id,status",
      )
      .eq(
        "event_type",
        "member_broadcast",
      )
      .in(
        "broadcast_id",
        broadcastIds,
      ),
  ]);

  if (recipientResult.error) {
    throw recipientResult.error;
  }

  if (notificationResult.error) {
    throw notificationResult.error;
  }

  const recipients =
    (recipientResult.data ??
      []) as RecipientRow[];

  const notifications =
    (notificationResult.data ??
      []) as NotificationRow[];

  return broadcasts.map(
    (broadcast) => {
      const memberRows =
        recipients.filter(
          (recipient) =>
            recipient.broadcast_id ===
            broadcast.id,
        );

      const eventRows =
        notifications.filter(
          (event) =>
            event.broadcast_id ===
            broadcast.id,
        );

      const readCount =
        memberRows.filter(
          (recipient) =>
            recipient.read_at !== null,
        ).length;

      return {
        id: broadcast.id,
        subject:
          broadcast.subject,
        body:
          broadcast.body,

        recipientCount:
          broadcast.recipient_count,

        currentRecipientCount:
          memberRows.length,

        readCount,

        unreadCount:
          memberRows.length -
          readCount,

        emailSentCount:
          eventRows.filter(
            (event) =>
              event.status ===
              "sent",
          ).length,

        emailFailedCount:
          eventRows.filter(
            (event) =>
              event.status ===
              "failed",
          ).length,

        emailPendingCount:
          eventRows.filter(
            (event) =>
              event.status ===
              "pending",
          ).length,

        sentAt:
          broadcast.sent_at,

        createdAt:
          broadcast.created_at,
      };
    },
  );
}


export async function readMemberBroadcasts(
  memberId: string,
) {
  const client =
    getSupabaseServiceClient();

  const {
    data: recipientRows,
    error,
  } = await client
    .from(
      "dealer_network_broadcast_recipients",
    )
    .select(
      "broadcast_id,member_id,read_at,created_at",
    )
    .eq(
      "member_id",
      memberId,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(100);

  if (error) {
    throw error;
  }

  const recipients =
    (recipientRows ??
      []) as RecipientRow[];

  if (!recipients.length) {
    return {
      broadcasts: [],
      unreadTotal: 0,
    };
  }

  const broadcastIds =
    recipients.map(
      (recipient) =>
        recipient.broadcast_id,
    );

  const {
    data: broadcastRows,
    error: broadcastError,
  } = await client
    .from(
      "dealer_network_broadcasts",
    )
    .select(
      "id,subject,body,recipient_count,created_at,sent_at",
    )
    .in(
      "id",
      broadcastIds,
    );

  if (broadcastError) {
    throw broadcastError;
  }

  const broadcastById =
    new Map(
      (
        (broadcastRows ??
          []) as BroadcastRow[]
      ).map(
        (broadcast) => [
          broadcast.id,
          broadcast,
        ],
      ),
    );

  const broadcasts =
    recipients.flatMap(
      (recipient) => {
        const broadcast =
          broadcastById.get(
            recipient.broadcast_id,
          );

        if (!broadcast) {
          return [];
        }

        return [{
          id: broadcast.id,
          subject:
            broadcast.subject,
          body:
            broadcast.body,
          sentAt:
            broadcast.sent_at,
          readAt:
            recipient.read_at,
          isRead:
            recipient.read_at !== null,
        }];
      },
    );

  return {
    broadcasts,

    unreadTotal:
      broadcasts.filter(
        (broadcast) =>
          !broadcast.isRead,
      ).length,
  };
}


export async function markMemberBroadcastRead(
  memberId: string,
  broadcastId: string,
) {
  if (
    !validateUuid(
      broadcastId,
    )
  ) {
    throw new Error(
      "BROADCAST_UNAVAILABLE",
    );
  }

  const {
    data,
    error,
  } =
    await getSupabaseServiceClient()
      .rpc(
        "dealer_network_mark_broadcast_read",
        {
          p_broadcast_id:
            broadcastId,
          p_member_id:
            memberId,
        },
      );

  if (
    error ||
    data !== true
  ) {
    throw new Error(
      "BROADCAST_UNAVAILABLE",
    );
  }

  return true;
}
