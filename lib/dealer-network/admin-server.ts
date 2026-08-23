import "server-only";

import { sanitizeEmailFailure } from "@/lib/email-diagnostics";
import { sendServerEmail } from "@/lib/email";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { createOneTimeToken } from "./security";
import { normalizeRequestedBrandName } from "./brand-request-validation";
import {
  readAdminApplications,
  readApplicationNotice,
  mapBrand,
} from "./applications-server";
import {
  deliverDealerNotification,
  notifyDealerActivation,
  notifyDealerBroadcast,
  notifyDealerMemberInvitation,
  notifyDealerDecision,
  notifyNewDealerApplication,
  notifyNewDealerMessage,
  notifySuggestionStatus,
  sendDealerActivationEmail,
  sendPinResetEmail,
} from "./notifications";
import {
  markMemberGeocodeStale,
  refreshMemberGeocode,
  refreshStoredMemberGeocode,
} from "./geocoding";
import type {
  BrandStatus,
  MemberStatus,
  ReportStatus,
  SuggestionStatus,
} from "./types";
import {
  MESSAGE_BUCKET,
  MESSAGE_SIGNED_READ_SECONDS,
} from "./messaging-storage";
import { TROUBLESHOOTING_BUCKET } from "./troubleshooting-storage";
import { sendBoardDiscussionEmail, sendBoardPollReminderEmail, sendBoardTopicEmail } from "./board-email";
import {
  readBoundedText,
  validateMemberProfile,
  validateUuid,
} from "./validation";
import { readAdminTroubleshootingEntries } from "./troubleshooting-server";

const memberColumns =
  "id,application_id,member_name,company_name,phone,email,address_line_1,address_line_2,city,state,zip_code,country,website_url,role,experience,service_region,introduction,logo_path,status,account_locked,messaging_enabled,activated_at,suspended_at,archived_at,last_login_at,created_at,updated_at";

export async function readDealerNetworkAdminDashboard() {
  const client = getSupabaseServiceClient();
  const [
    applications,
    { data: memberRows, error: memberError },
    { data: brandRows, error: brandError },
    { data: brandRequests, error: brandRequestError },
    { data: memberBrands },
    { data: suggestions, error: suggestionError },
    { data: suggestionTopics, error: suggestionTopicError },
    { data: notifications, error: notificationError },
    { data: reports, error: reportError },
    troubleshooting,
  ] = await Promise.all([
    readAdminApplications(),
    client
      .from("dealer_network_members")
      .select(memberColumns)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_brands")
      .select(
        "id,name,models,status,sort_order,created_at,updated_at",
      )
      .order("sort_order")
      .order("name"),
    client
      .from("dealer_network_brand_requests")
      .select("id,member_id,member_name_snapshot,company_name_snapshot,requested_name,normalized_name,status,created_at,resolved_at")
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_member_brands")
      .select(
        "id,member_id,relationship_type,approval_status,requested_at,decided_at,removed_at,brand:dealer_network_brands(id,name,status)",
      )
      .neq("approval_status", "removed")
      .order("requested_at", { ascending: false }),
    client
      .from("dealer_network_suggestions")
      .select(
        "id,member_id,company_name_snapshot,category,subject,message,status,admin_response,created_at,reviewed_at,resolved_at,member:dealer_network_members(member_name,email)",
      )
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_board_topics")
      .select("id,source_suggestion_id")
      .not("source_suggestion_id", "is", null),
    client
      .from("dealer_network_notification_events")
      .select(
        "id,event_key,event_type,application_id,member_id,status,attempt_count,last_error,created_at,sent_at,updated_at",
      )
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_reports")
      .select(
        "id,reporter_member_id,reported_member_id,conversation_id,reason,status,admin_note,created_at,reviewed_at,resolved_at,reporter:dealer_network_members!dealer_network_reports_reporter_member_id_fkey(member_name,company_name),reported:dealer_network_members!dealer_network_reports_reported_member_id_fkey(member_name,company_name)",
      )
      .order("created_at", { ascending: false }),
    readAdminTroubleshootingEntries(),
  ]);
  if (memberError || brandError || brandRequestError || suggestionError || suggestionTopicError || notificationError || reportError)
    throw memberError ?? brandError ?? brandRequestError ?? suggestionError ?? suggestionTopicError ?? notificationError ?? reportError;
  const members = await Promise.all(
    (memberRows ?? []).map(async (row) => {
      const { data: security } = await client.rpc(
        "dealer_network_admin_security",
        { p_member_id: row.id },
      );
      return {
        id: String(row.id),
        applicationId: String(row.application_id),
        memberName: String(row.member_name),
        companyName: String(row.company_name),
        phone: String(row.phone),
        email: String(row.email),
        addressLine1: String(row.address_line_1),
        addressLine2: row.address_line_2 as string | null,
        city: String(row.city),
        state: String(row.state),
        zipCode: String(row.zip_code),
        country: String(row.country),
        websiteUrl: row.website_url as string | null,
        role: String(row.role),
        experience: String(row.experience),
        serviceRegion: String(row.service_region),
        introduction: String(row.introduction),
        status: row.status as MemberStatus,
        accountLocked: Boolean(row.account_locked),
        messagingEnabled: Boolean(row.messaging_enabled),
        activatedAt: row.activated_at,
        suspendedAt: row.suspended_at,
        archivedAt: row.archived_at,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        brands: (memberBrands ?? []).filter(
          (brand) => brand.member_id === row.id,
        ),
        security,
      };
    }),
  );
  return {
    applications,
    members,
    brands: (brandRows ?? []).map((row) =>
      mapBrand(row as Record<string, unknown>),
    ),
    brandRequests: (brandRequests ?? []).map((request) => ({
      id: String(request.id),
      memberId: request.member_id ? String(request.member_id) : null,
      memberName: String(request.member_name_snapshot),
      companyName: String(request.company_name_snapshot),
      requestedName: String(request.requested_name),
      normalizedName: String(request.normalized_name),
      status: String(request.status),
      createdAt: String(request.created_at),
      resolvedAt: request.resolved_at ? String(request.resolved_at) : null,
    })),
    suggestions: (suggestions ?? []).map((suggestion) => ({
      ...suggestion,
      board_topic_id: (suggestionTopics ?? []).find((topic) => topic.source_suggestion_id === suggestion.id)?.id ?? null,
    })),
    notifications: notifications ?? [],
    reports: (reports ?? []).map((row) => {
      const reporter = row.reporter as unknown as { member_name?: string; company_name?: string } | null;
      const reported = row.reported as unknown as { member_name?: string; company_name?: string } | null;
      return {
        id: String(row.id),
        reporterMemberId: String(row.reporter_member_id),
        reporterName: reporter?.member_name ?? "Unknown member",
        reporterCompany: reporter?.company_name ?? null,
        reportedMemberId: String(row.reported_member_id),
        reportedName: reported?.member_name ?? "Unknown member",
        reportedCompany: reported?.company_name ?? null,
        conversationId: String(row.conversation_id),
        reason: String(row.reason),
        status: row.status as ReportStatus,
        adminNote: row.admin_note as string | null,
        createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at as string | null,
        resolvedAt: row.resolved_at as string | null,
      };
    }),
    troubleshooting,
    pendingApplicationCount: applications.filter(
      (application) => application.status === "pending",
    ).length,
    geocodingConfigured: Boolean(
      process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim(),
    ),
  };
}

export async function approveDealerApplication(
  applicationId: string,
  origin: string,
) {
  const token = createOneTimeToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc(
    "dealer_network_approve_application",
    {
      p_application_id: applicationId,
      p_token_hash: token.tokenHash,
      p_expires_at: expiresAt,
    },
  );
  if (error) throw error;
  const outcome = data as { memberId: string; changed: boolean };
  if (outcome.changed) {
    await refreshStoredMemberGeocode(outcome.memberId).catch(() =>
      console.error("Dealer member geocoding failed after approval", {
        applicationId,
        memberId: outcome.memberId,
      }),
    );
    const application = await readApplicationNotice(applicationId);
    await notifyDealerActivation(
      application,
      outcome.memberId,
      token.token,
      origin,
    ).catch(() =>
      console.error("Dealer activation notification failed", { applicationId }),
    );
  }
  return outcome;
}

export async function transitionDealerApplication(
  applicationId: string,
  action: "deny" | "more_information",
  message: string,
) {
  const client = getSupabaseServiceClient();
  const { error } = await client.rpc("dealer_network_transition_application", {
    p_application_id: applicationId,
    p_action: action,
    p_message: message,
  });
  if (error) throw error;
  const application = await readApplicationNotice(applicationId);
  await notifyDealerDecision(
    application,
    action === "deny" ? "denied" : "more_information",
  ).catch(() =>
    console.error("Dealer application decision notification failed", {
      applicationId,
    }),
  );
}

export async function retryDealerNotification(eventId: string, origin: string) {
  const client = getSupabaseServiceClient();
  const { data: event, error } = await client
    .from("dealer_network_notification_events")
    .select("id,event_key,event_type,application_id,member_id,conversation_id,message_id,broadcast_id,invitation_id,status,topic_id,poll_id")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  if (event.status !== "failed") return { retried: false };
  if (event.event_type === "ids_new_application" && event.application_id)
    await notifyNewDealerApplication(
      await readApplicationNotice(event.application_id),
    );
  else if (
    event.event_type === "applicant_activation" &&
    event.application_id &&
    event.member_id
  ) {
    const application = await readApplicationNotice(event.application_id);
    await deliverDealerNotification(
      {
        eventKey: event.event_key,
        eventType: "applicant_activation",
        applicationId: event.application_id,
        memberId: event.member_id,
      },
      async () => {
        const token = createOneTimeToken();
        const { error: tokenError } = await client.rpc(
          "dealer_network_replace_activation_token",
          {
            p_member_id: event.member_id,
            p_token_hash: token.tokenHash,
            p_expires_at: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        );
        if (tokenError) throw tokenError;
        return sendDealerActivationEmail(application, token.token, origin);
      },
    );
  } else if (
    (event.event_type === "applicant_denied" ||
      event.event_type === "applicant_more_information") &&
    event.application_id
  ) {
    await notifyDealerDecision(
      await readApplicationNotice(event.application_id),
      event.event_type === "applicant_denied" ? "denied" : "more_information",
    );
  } else if (event.event_type === "member_pin_reset" && event.member_id) {
    const { data: member, error: memberError } = await client
      .from("dealer_network_members")
      .select("member_name,email")
      .eq("id", event.member_id)
      .single();
    if (memberError) throw memberError;
    await deliverDealerNotification(
      {
        eventKey: event.event_key,
        eventType: "member_pin_reset",
        memberId: event.member_id,
      },
      async () => {
        const token = createOneTimeToken();
        const { error: tokenError } = await client.rpc(
          "dealer_network_set_pin_reset_token",
          {
            p_member_id: event.member_id,
            p_token_hash: token.tokenHash,
            p_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        );
        if (tokenError) throw tokenError;
        return sendPinResetEmail({
          memberName: member.member_name,
          email: member.email,
          token: token.token,
          origin,
        });
      },
    );
  } else if (
    event.event_type === "member_new_message" &&
    event.member_id &&
    event.conversation_id &&
    event.message_id
  ) {
    const [recipientResult, messageResult] = await Promise.all([
      client
        .from("dealer_network_members")
        .select("member_name,email")
        .eq("id", event.member_id)
        .single(),
      client
        .from("dealer_network_messages")
        .select("sender_member_id")
        .eq("id", event.message_id)
        .eq("conversation_id", event.conversation_id)
        .single(),
    ]);
    const recipient = recipientResult.data;
    const message = messageResult.data;
    if (!recipient || !message) throw new Error("NOTIFICATION_CONTEXT_UNAVAILABLE");
    const { data: sender } = await client
      .from("dealer_network_members")
      .select("member_name")
      .eq("id", message.sender_member_id)
      .single();
    if (!sender) throw new Error("NOTIFICATION_CONTEXT_UNAVAILABLE");
    await notifyNewDealerMessage({
      messageId: event.message_id,
      conversationId: event.conversation_id,
      recipientMemberId: event.member_id,
      recipientName: recipient.member_name,
      recipientEmail: recipient.email,
      senderName: sender.member_name,
      origin,
    });
  } else if (
    event.event_type === "member_broadcast" &&
    event.member_id &&
    event.broadcast_id
  ) {
    const [
      memberResult,
      broadcastResult,
    ] = await Promise.all([
      client
        .from("dealer_network_members")
        .select("member_name,email")
        .eq("id", event.member_id)
        .single(),

      client
        .from("dealer_network_broadcasts")
        .select("subject")
        .eq("id", event.broadcast_id)
        .single(),
    ]);

    const member =
      memberResult.data;

    const broadcast =
      broadcastResult.data;

    if (
      !member ||
      !broadcast
    ) {
      throw new Error(
        "NOTIFICATION_CONTEXT_UNAVAILABLE",
      );
    }

    await notifyDealerBroadcast({
      broadcastId:
        event.broadcast_id,

      recipientMemberId:
        event.member_id,

      recipientName:
        member.member_name,

      recipientEmail:
        member.email,

      subject:
        broadcast.subject,

      origin,
    });
  } else if (
    event.event_type === "member_invitation" &&
    event.member_id &&
    event.invitation_id
  ) {
    const [
      inviterResult,
      invitationResult,
    ] = await Promise.all([
      client
        .from("dealer_network_members")
        .select("member_name,company_name")
        .eq("id", event.member_id)
        .single(),

      client
        .from("dealer_network_member_invitations")
        .select(
          "id,inviter_member_id,invitee_name,invitee_email,personal_message",
        )
        .eq("id", event.invitation_id)
        .eq(
          "inviter_member_id",
          event.member_id,
        )
        .single(),
    ]);

    const inviter =
      inviterResult.data;

    const invitation =
      invitationResult.data;

    if (
      !inviter ||
      !invitation
    ) {
      throw new Error(
        "NOTIFICATION_CONTEXT_UNAVAILABLE",
      );
    }

    await notifyDealerMemberInvitation({
      invitationId:
        invitation.id,

      inviterMemberId:
        event.member_id,

      inviterName:
        inviter.member_name,

      inviterCompanyName:
        inviter.company_name,

      inviteeName:
        invitation.invitee_name,

      inviteeEmail:
        invitation.invitee_email,

      personalMessage:
        invitation.personal_message,

      origin,
    });
  } else if (
    (event.event_type === "member_board_topic" || event.event_type === "member_board_poll_reminder" || event.event_type === "member_board_discussion") &&
    event.member_id && event.topic_id
  ) {
    const [memberResult, topicResult, pollResult] = await Promise.all([
      client.from("dealer_network_members").select("member_name,email").eq("id", event.member_id).single(),
      client.from("dealer_network_board_topics").select("title").eq("id", event.topic_id).single(),
      event.poll_id ? client.from("dealer_network_polls").select("question").eq("id", event.poll_id).eq("topic_id", event.topic_id).single() : Promise.resolve({ data: null, error: null }),
    ]);
    if (!memberResult.data || !topicResult.data || pollResult.error) throw new Error("NOTIFICATION_CONTEXT_UNAVAILABLE");
    await deliverDealerNotification({ eventKey: event.event_key, eventType: event.event_type, memberId: event.member_id, topicId: event.topic_id, pollId: event.poll_id }, () => {
      const shared = { recipientName: memberResult.data.member_name, recipientEmail: memberResult.data.email, topicTitle: topicResult.data.title, origin };
      if (event.event_type === "member_board_poll_reminder") { if (!pollResult.data) throw new Error("NOTIFICATION_CONTEXT_UNAVAILABLE"); return sendBoardPollReminderEmail({ ...shared, pollQuestion: pollResult.data.question }, sendServerEmail); }
      if (event.event_type === "member_board_discussion") return sendBoardDiscussionEmail(shared, sendServerEmail);
      return sendBoardTopicEmail({ ...shared, responseRequested: Boolean(pollResult.data) }, sendServerEmail);
    });
  } else {
    throw new Error(
      "NOTIFICATION_CONTEXT_UNAVAILABLE",
    );
  }
  return { retried: true };
}

export async function saveDealerBrand(input: unknown, brandId?: string) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const name = readBoundedText(body.name, 120);

  const rawModels =
    Array.isArray(body.models)
      ? body.models
      : [];

  const modelsAreValid =
    rawModels.length <= 50 &&
    rawModels.every(
      (value) =>
        typeof value === "string" &&
        value.trim().length <= 30,
    );

  const models = [
    ...new Map(
      rawModels
        .map((value) =>
          readBoundedText(value, 30),
        )
        .filter(Boolean)
        .map((model) => [
          model.toLowerCase(),
          model,
        ]),
    ).values(),
  ];

  const status = body.status as BrandStatus;
  const sortOrder = Number(body.sortOrder);

  if (
    !name ||
    name.length > 120 ||
    !modelsAreValid ||
    !["active", "inactive", "archived"].includes(
      status,
    ) ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100000
  ) {
    throw new Error("INVALID_BRAND");
  }

  const client = getSupabaseServiceClient();

  const values = {
    name,
    models,
    status,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  const query = brandId
    ? client
        .from("dealer_network_brands")
        .update(values)
        .eq("id", brandId)
    : client
        .from("dealer_network_brands")
        .insert(values);

  const { data, error } = await query
    .select(
      "id,name,models,status,sort_order",
    )
    .single();

  if (error) throw error;

  return mapBrand(
    data as Record<string, unknown>,
  );
}

export async function setMemberAccountState(memberId: string, input: unknown) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const client = getSupabaseServiceClient();
  const { data: current, error } = await client
    .from("dealer_network_members")
    .select("status,account_locked,messaging_enabled")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  const values: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let eventType: string;
  let fromValue: string;
  let toValue: string;
  if (typeof body.messagingEnabled === "boolean") {
    values.messaging_enabled = body.messagingEnabled;
    eventType = "messaging_enabled";
    fromValue = String(current.messaging_enabled);
    toValue = String(body.messagingEnabled);
  } else if (typeof body.accountLocked === "boolean") {
    values.account_locked = body.accountLocked;
    eventType = "account_locked";
    fromValue = String(current.account_locked);
    toValue = String(body.accountLocked);
  } else if (
    ["active", "suspended", "archived"].includes(String(body.status))
  ) {
    const status = body.status as MemberStatus;
    const allowedTransitions: Record<MemberStatus, MemberStatus[]> = {
      pending_activation: ["archived"],
      active: ["suspended", "archived"],
      suspended: ["active", "archived"],
      archived: [],
    };
    if (!allowedTransitions[current.status as MemberStatus].includes(status))
      throw new Error("INVALID_MEMBER_STATE");
    values.status = status;
    if (status === "suspended") {
      values.account_locked = true;
      values.suspended_at = new Date().toISOString();
      values.archived_at = null;
    }
    if (status === "active") {
      values.suspended_at = null;
      values.archived_at = null;
    }
    if (status === "archived") {
      values.account_locked = true;
      values.archived_at = new Date().toISOString();
    }
    eventType = "member_status";
    fromValue = current.status;
    toValue = status;
  } else throw new Error("INVALID_MEMBER_STATE");
  const { error: updateError } = await client
    .from("dealer_network_members")
    .update(values)
    .eq("id", memberId);
  if (updateError) throw updateError;
  await client
    .from("dealer_network_status_events")
    .insert({
      member_id: memberId,
      event_type: eventType,
      from_value: fromValue,
      to_value: toValue,
      actor_type: "admin",
    });
}

async function removeDealerNetworkStorageObjects(
  bucket: string,
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = [
    ...new Set(paths.filter((path): path is string => Boolean(path))),
  ];

  if (!uniquePaths.length) return null;

  const { error } = await getSupabaseServiceClient()
    .storage.from(bucket)
    .remove(uniquePaths);

  return error ? `${bucket}: ${error.message}` : null;
}

export async function deleteDealerMember(memberId: string) {
  const client = getSupabaseServiceClient();

  const { data: member, error: memberError } = await client
    .from("dealer_network_members")
    .select("id,application_id,logo_path")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) throw new Error("MEMBER_NOT_FOUND");

  const applicationId = member.application_id as string | null;

  const [
    certificationsResult,
    messageUploadsResult,
    troubleshootingUploadsResult,
  ] = await Promise.all([
    applicationId
      ? client
          .from("dealer_network_application_certifications")
          .select("evidence_path")
          .eq("application_id", applicationId)
      : Promise.resolve({
          data: [] as Array<{ evidence_path: string | null }>,
          error: null,
        }),
    client
      .from("dealer_network_message_uploads")
      .select("storage_path")
      .eq("owner_member_id", memberId),
    client
      .from("dealer_network_troubleshooting_uploads")
      .select("storage_path")
      .eq("owner_member_id", memberId),
  ]);

  const preflightError =
    certificationsResult.error ??
    messageUploadsResult.error ??
    troubleshootingUploadsResult.error;

  if (preflightError) throw preflightError;

  const certificationPaths = (certificationsResult.data ?? []).map(
    (row) => row.evidence_path,
  );

  const messageUploadPaths = (messageUploadsResult.data ?? []).map(
    (row) => row.storage_path,
  );

  const troubleshootingUploadPaths = (
    troubleshootingUploadsResult.data ?? []
  ).map((row) => row.storage_path);

  const { data, error } = await client.rpc("dealer_network_delete_member", {
    p_member_id: memberId,
  });

  if (error) throw error;

  const cleanupResults = await Promise.all([
    removeDealerNetworkStorageObjects("dealer-network-private", [
      member.logo_path,
      ...certificationPaths,
    ]),
    removeDealerNetworkStorageObjects(MESSAGE_BUCKET, messageUploadPaths),
    removeDealerNetworkStorageObjects(
      TROUBLESHOOTING_BUCKET,
      troubleshootingUploadPaths,
    ),
  ]);

  const cleanupErrors = cleanupResults.filter(
    (value): value is string => Boolean(value),
  );

  if (cleanupErrors.length) {
    console.error("Dealer member storage cleanup incomplete", {
      memberId,
      cleanupErrors,
    });
  }

  return {
    deletion: data,
    storageCleanupWarning: cleanupErrors.length > 0,
  };
}
export async function updateDealerReport(reportId: string, input: unknown) {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const status = body.status as ReportStatus;
  const adminNote = readBoundedText(body.adminNote, 3000) || null;
  if (!(["new", "reviewed", "resolved"] as const).includes(status))
    throw new Error("INVALID_REPORT_STATUS");
  const client = getSupabaseServiceClient();
  const { data: current, error: currentError } = await client
    .from("dealer_network_reports")
    .select("status,reviewed_at")
    .eq("id", reportId)
    .maybeSingle();
  if (currentError || !current) throw currentError ?? new Error("REPORT_NOT_FOUND");
  const transitions: Record<ReportStatus, ReportStatus[]> = {
    new: ["new", "reviewed", "resolved"],
    reviewed: ["reviewed", "resolved"],
    resolved: ["resolved"],
  };
  if (!transitions[current.status as ReportStatus].includes(status))
    throw new Error("INVALID_REPORT_STATUS");
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("dealer_network_reports")
    .update({
      status,
      admin_note: adminNote,
      reviewed_at:
        status === "new" ? null : (current.reviewed_at ?? now),
      resolved_at: status === "resolved" ? now : null,
      updated_at: now,
    })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw error ?? new Error("REPORT_NOT_FOUND");
}

export async function readReportedConversation(reportId: string) {
  const client = getSupabaseServiceClient();
  const { data: report, error } = await client
    .from("dealer_network_reports")
    .select("id,conversation_id,reporter_member_id,reported_member_id,reported_through_message_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !report) throw new Error("REPORT_NOT_FOUND");
  if (!report.reported_through_message_id)
    return {
      reportId: report.id,
      conversationId: report.conversation_id,
      messages: [],
    };
  const { data: marker, error: markerError } = await client
    .from("dealer_network_messages")
    .select("created_at")
    .eq("id", report.reported_through_message_id)
    .eq("conversation_id", report.conversation_id)
    .single();
  if (markerError) throw markerError;
  const { data: messages, error: messageError } = await client
    .from("dealer_network_messages")
    .select("id,sender_member_id,body,created_at,dealer_network_message_attachments(id,width,height,position)")
    .eq("conversation_id", report.conversation_id)
    .lte("created_at", marker.created_at)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (messageError) throw messageError;
  return {
    reportId: report.id,
    conversationId: report.conversation_id,
    messages: [...(messages ?? [])]
      .filter(
        (message) =>
          message.created_at < marker.created_at ||
          (message.created_at === marker.created_at &&
            message.id <= report.reported_through_message_id),
      )
      .reverse()
      .map((message) => ({
      id: message.id,
      senderMemberId: message.sender_member_id,
      body: message.body,
      createdAt: message.created_at,
      attachments: ((message.dealer_network_message_attachments ?? []) as Array<{ id: string; width: number; height: number; position: number }>).map((attachment) => ({
        ...attachment,
        url: `/api/admin/dealer-network/reports/${report.id}/attachments/${attachment.id}`,
      })),
    })),
  };
}

export async function signedReportedAttachment(reportId: string, attachmentId: string) {
  const client = getSupabaseServiceClient();
  const { data: report } = await client
    .from("dealer_network_reports")
    .select("conversation_id,reported_through_message_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report?.reported_through_message_id) throw new Error("REPORT_NOT_FOUND");
  const { data: attachment } = await client
    .from("dealer_network_message_attachments")
    .select("storage_path,message_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) throw new Error("ATTACHMENT_NOT_FOUND");
  const [{ data: message }, { data: marker }] = await Promise.all([
    client
      .from("dealer_network_messages")
      .select("conversation_id,created_at")
      .eq("id", attachment.message_id)
      .eq("conversation_id", report.conversation_id)
      .maybeSingle(),
    client
      .from("dealer_network_messages")
      .select("created_at")
      .eq("id", report.reported_through_message_id)
      .eq("conversation_id", report.conversation_id)
      .maybeSingle(),
  ]);
  if (
    !message ||
    !marker ||
    message.created_at > marker.created_at ||
    (message.created_at === marker.created_at &&
      attachment.message_id > report.reported_through_message_id)
  )
    throw new Error("ATTACHMENT_NOT_FOUND");
  const { data, error } = await client.storage
    .from(MESSAGE_BUCKET)
    .createSignedUrl(attachment.storage_path, MESSAGE_SIGNED_READ_SECONDS);
  if (error || !data?.signedUrl) throw new Error("ATTACHMENT_NOT_FOUND");
  return data.signedUrl;
}

export async function adminUpdateMemberProfile(
  memberId: string,
  input: unknown,
) {
  const parsed = validateMemberProfile(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const client = getSupabaseServiceClient();
  const { data: current, error: currentError } = await client
    .from("dealer_network_members")
    .select("address_line_1,address_line_2,city,state,zip_code")
    .eq("id", memberId)
    .single();
  if (currentError) throw currentError;
  const { error } = await client
    .from("dealer_network_members")
    .update({
      member_name: value.memberName,
      company_name: value.companyName,
      normalized_company_name: value.normalizedCompanyName,
      phone: value.phone,
      normalized_phone: value.normalizedPhone,
      email: value.email,
      normalized_email: value.normalizedEmail,
      address_line_1: value.addressLine1,
      address_line_2: value.addressLine2,
      city: value.city,
      state: value.state,
      zip_code: value.zipCode,
      website_url: value.websiteUrl,
      role: value.role,
      experience: value.experience,
      service_region: value.serviceRegion,
      introduction: value.introduction,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId);
  if (error) throw error;
  const addressChanged =
    [
      value.addressLine1,
      value.addressLine2,
      value.city,
      value.state,
      value.zipCode,
    ].join("|") !==
    [
      current.address_line_1,
      current.address_line_2,
      current.city,
      current.state,
      current.zip_code,
    ].join("|");
  if (addressChanged) {
    await markMemberGeocodeStale(memberId);
    await refreshMemberGeocode({
      id: memberId,
      addressLine1: value.addressLine1,
      addressLine2: value.addressLine2,
      city: value.city,
      state: value.state,
      zipCode: value.zipCode,
    });
  }
  return { ok: true as const };
}

export async function retryMemberGeocode(memberId: string) {
  return refreshStoredMemberGeocode(memberId);
}

export async function resolveDealerBrandRequest(
  requestId: string,
  action: "add" | "dismiss",
) {
  if (!validateUuid(requestId)) throw new Error("BRAND_REQUEST_NOT_FOUND");
  const client = getSupabaseServiceClient();
  const { data: request, error } = await client
    .from("dealer_network_brand_requests")
    .select("id,requested_name,normalized_name,status")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  if (!request) throw new Error("BRAND_REQUEST_NOT_FOUND");
  let brand = null;
  if (action === "add") {
    const { data: existing, error: existingError } = await client
      .from("dealer_network_brands")
      .select("id,name,models,status,sort_order")
      .order("sort_order");
    if (existingError) throw existingError;
    const existingBrand = (existing ?? []).find(
      (item) =>
        normalizeRequestedBrandName(item.name)?.normalizedName ===
        request.normalized_name,
    );
    brand = existingBrand
      ? mapBrand(existingBrand as Record<string, unknown>)
      : await saveDealerBrand({
          name: request.requested_name,
          models: [],
          status: "active",
          sortOrder: 100,
        });
  }
  const resolvedAt = new Date().toISOString();
  const { data: resolved, error: updateError } = await client
    .from("dealer_network_brand_requests")
    .update({
      status: action === "add" ? "resolved" : "dismissed",
      resolved_at: resolvedAt,
      updated_at: resolvedAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id,status,resolved_at")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!resolved) throw new Error("BRAND_REQUEST_NOT_FOUND");
  return { request: resolved, brand };
}

export async function updateSuggestionStatus(
  suggestionId: string,
  input: unknown,
) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const status = body.status as SuggestionStatus;
  if (!["new", "reviewed", "resolved"].includes(status))
    throw new Error("INVALID_SUGGESTION_STATUS");
  const now = new Date().toISOString();
  const client = getSupabaseServiceClient();
  const { data: suggestion, error } = await client
    .from("dealer_network_suggestions")
    .update({
      status,
      reviewed_at: status === "reviewed" || status === "resolved" ? now : null,
      resolved_at: status === "resolved" ? now : null,
      updated_at: now,
    })
    .eq("id", suggestionId)
    .neq("status", status)
    .select("member_id")
    .maybeSingle();
  if (error) throw error;
  if (!suggestion || status === "new") return;
  const { data: member, error: memberError } = await client
    .from("dealer_network_members")
    .select("member_name,email")
    .eq("id", suggestion.member_id)
    .maybeSingle();
  if (memberError || !member) {
    console.warn("Suggestion status email recipient lookup failed", {
      suggestionId,
      status,
    });
    return;
  }
  await notifySuggestionStatus({
    memberName: String(member.member_name),
    memberEmail: String(member.email),
    status,
  }).catch((error) =>
    console.warn("Suggestion status email failed after status update", {
      suggestionId,
      status,
      error: sanitizeEmailFailure(error),
    }),
  );
}

export function requireValidAdminId(value: unknown) {
  const id = validateUuid(value);
  if (!id) throw new Error("INVALID_ID");
  return id;
}
