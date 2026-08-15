import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { createOneTimeToken } from "./security";
import {
  readAdminApplications,
  readApplicationNotice,
  mapBrand,
} from "./applications-server";
import {
  deliverDealerNotification,
  notifyDealerActivation,
  notifyDealerDecision,
  notifyNewDealerApplication,
  sendDealerActivationEmail,
  sendPinResetEmail,
} from "./notifications";
import { markMemberGeocodeStale, refreshMemberGeocode } from "./geocoding";
import type { BrandStatus, MemberStatus, SuggestionStatus } from "./types";
import {
  readBoundedText,
  safeHttpUrl,
  validateMemberProfile,
  validateUuid,
} from "./validation";

const memberColumns =
  "id,application_id,member_name,company_name,phone,email,address_line_1,address_line_2,city,state,zip_code,country,website_url,role,experience,service_region,introduction,logo_path,status,account_locked,activated_at,suspended_at,archived_at,last_login_at,created_at,updated_at";

export async function readDealerNetworkAdminDashboard() {
  const client = getSupabaseServiceClient();
  const [
    applications,
    { data: memberRows, error: memberError },
    { data: brandRows, error: brandError },
    { data: memberBrands },
    { data: suggestions, error: suggestionError },
    { data: notifications, error: notificationError },
  ] = await Promise.all([
    readAdminApplications(),
    client
      .from("dealer_network_members")
      .select(memberColumns)
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_brands")
      .select(
        "id,name,description,website_url,status,sort_order,created_at,updated_at",
      )
      .order("sort_order")
      .order("name"),
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
      .from("dealer_network_notification_events")
      .select(
        "id,event_key,event_type,application_id,member_id,status,attempt_count,last_error,created_at,sent_at,updated_at",
      )
      .order("created_at", { ascending: false }),
  ]);
  if (memberError || brandError || suggestionError || notificationError)
    throw memberError ?? brandError ?? suggestionError ?? notificationError;
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
    suggestions: suggestions ?? [],
    notifications: notifications ?? [],
    pendingApplicationCount: applications.filter(
      (application) => application.status === "pending",
    ).length,
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
    .select("id,event_key,event_type,application_id,member_id,status")
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
  } else throw new Error("NOTIFICATION_CONTEXT_UNAVAILABLE");
  return { retried: true };
}

export async function saveDealerBrand(input: unknown, brandId?: string) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const name = readBoundedText(body.name, 120);
  const description = readBoundedText(body.description, 1000) || null;
  const websiteUrl = safeHttpUrl(body.websiteUrl);
  const status = body.status as BrandStatus;
  const sortOrder = Number(body.sortOrder);
  if (
    !name ||
    name.length > 120 ||
    (description && description.length > 1000) ||
    !["active", "inactive", "archived"].includes(status) ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100000 ||
    (body.websiteUrl && !websiteUrl)
  )
    throw new Error("INVALID_BRAND");
  const client = getSupabaseServiceClient();
  const values = {
    name,
    description,
    website_url: websiteUrl,
    status,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
  const query = brandId
    ? client.from("dealer_network_brands").update(values).eq("id", brandId)
    : client.from("dealer_network_brands").insert(values);
  const { data, error } = await query
    .select("id,name,description,website_url,status,sort_order")
    .single();
  if (error) throw error;
  return mapBrand(data as Record<string, unknown>);
}

export async function decideMemberBrand(
  relationshipId: string,
  decision: "approve" | "reject",
) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_member_brands")
    .update({
      approval_status: decision === "approve" ? "approved" : "rejected",
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", relationshipId)
    .eq("approval_status", "pending")
    .select("id,member_id,brand_id,relationship_type,approval_status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("PENDING_AFFILIATION_NOT_FOUND");
  return data;
}

export async function setMemberAccountState(memberId: string, input: unknown) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const client = getSupabaseServiceClient();
  const { data: current, error } = await client
    .from("dealer_network_members")
    .select("status,account_locked")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  const values: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let eventType: string;
  let fromValue: string;
  let toValue: string;
  if (typeof body.accountLocked === "boolean") {
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
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_members")
    .select("id,address_line_1,address_line_2,city,state,zip_code")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  return refreshMemberGeocode({
    id: data.id,
    addressLine1: data.address_line_1,
    addressLine2: data.address_line_2,
    city: data.city,
    state: data.state,
    zipCode: data.zip_code,
  });
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
  const { error } = await getSupabaseServiceClient()
    .from("dealer_network_suggestions")
    .update({
      status,
      reviewed_at: status === "reviewed" || status === "resolved" ? now : null,
      resolved_at: status === "resolved" ? now : null,
      updated_at: now,
    })
    .eq("id", suggestionId);
  if (error) throw error;
}

export function requireValidAdminId(value: unknown) {
  const id = validateUuid(value);
  if (!id) throw new Error("INVALID_ID");
  return id;
}
