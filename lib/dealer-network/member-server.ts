import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase";
import {
  filterDirectoryRows,
  toDirectoryResult,
  type PrivateDirectoryRow,
} from "./directory";
import {
  geocodeUsLocation,
  markMemberGeocodeStale,
  refreshMemberGeocode,
} from "./geocoding";
import { verifyPin } from "./security";
import type {
  BrandRelationshipType,
  DirectoryFilters,
  MemberBrand,
  MemberProfile,
} from "./types";
import { hasExpectedFileSignature } from "./uploads";
import {
  validateMemberProfile,
  validateSuggestion,
  validateUuid,
} from "./validation";

const profileColumns =
  "id,member_name,company_name,phone,normalized_phone,email,normalized_email,address_line_1,address_line_2,city,state,zip_code,website_url,role,experience,service_region,introduction,logo_path,status,account_locked,created_at,updated_at";
export const MEMBER_LOGO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const MEMBER_LOGO_LIMIT = 5 * 1024 * 1024;

async function signedLogo(path: string | null) {
  if (!path) return null;
  const { data } = await getSupabaseServiceClient()
    .storage.from("dealer-network-private")
    .createSignedUrl(path, 15 * 60);
  return data?.signedUrl ?? null;
}

const mapBrand = (row: Record<string, unknown>): MemberBrand => {
  const brand = row.brand as { id?: string; name?: string } | null;
  return {
    id: String(row.id),
    brandId: String(brand?.id ?? row.brand_id),
    brandName: String(brand?.name ?? "Unknown brand"),
    relationshipType: row.relationship_type as BrandRelationshipType,
    approvalStatus: row.approval_status as MemberBrand["approvalStatus"],
    requestedAt: String(row.requested_at),
  };
};

export async function readMemberProfile(
  memberId: string,
): Promise<MemberProfile> {
  const client = getSupabaseServiceClient();
  const [{ data, error }, { data: brands, error: brandError }] =
    await Promise.all([
      client
        .from("dealer_network_members")
        .select(profileColumns)
        .eq("id", memberId)
        .single(),
      client
        .from("dealer_network_member_brands")
        .select(
          "id,brand_id,relationship_type,approval_status,requested_at,brand:dealer_network_brands(id,name)",
        )
        .eq("member_id", memberId)
        .in("approval_status", ["pending", "approved"])
        .order("requested_at"),
    ]);
  if (error || brandError) throw error ?? brandError;
  return {
    id: String(data.id),
    memberName: String(data.member_name),
    companyName: String(data.company_name),
    phone: String(data.phone),
    email: String(data.email),
    addressLine1: String(data.address_line_1),
    addressLine2: data.address_line_2 as string | null,
    city: String(data.city),
    state: String(data.state),
    zipCode: String(data.zip_code),
    websiteUrl: data.website_url as string | null,
    role: data.role as MemberProfile["role"],
    experience: String(data.experience),
    serviceRegion: String(data.service_region),
    introduction: String(data.introduction),
    logoUrl: await signedLogo(data.logo_path as string | null),
    brands: (brands ?? []).map((row) =>
      mapBrand(row as Record<string, unknown>),
    ),
  };
}

export async function updateMemberProfile(memberId: string, input: unknown) {
  const parsed = validateMemberProfile(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const client = getSupabaseServiceClient();
  const { data: current, error: currentError } = await client
    .from("dealer_network_members")
    .select(profileColumns)
    .eq("id", memberId)
    .single();
  if (currentError) throw currentError;
  const identityChanged =
    value.normalizedPhone !== current.normalized_phone ||
    value.normalizedEmail !== current.normalized_email;
  if (identityChanged) {
    if (!/^\d{6}$/.test(value.currentPin))
      return {
        ok: false as const,
        errors: {
          currentPin: "Enter your current PIN to change phone or email.",
        },
      };
    const { data: security, error } = await client.rpc(
      "dealer_network_member_security",
      { p_member_id: memberId },
    );
    if (error || !security)
      throw error ?? new Error("Credential record unavailable.");
    const credential = security as {
      pinHash: string | null;
      pinSalt: string | null;
    };
    if (
      !credential.pinHash ||
      !credential.pinSalt ||
      !(await verifyPin(
        value.currentPin,
        credential.pinHash,
        credential.pinSalt,
      ))
    )
      return {
        ok: false as const,
        errors: { currentPin: "Current PIN is invalid." },
      };
  }
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
  if (error) {
    if (error.code === "23505")
      return {
        ok: false as const,
        errors: { phone: "That phone number is already assigned to a member." },
      };
    throw error;
  }
  if (identityChanged) {
    await client.rpc("dealer_network_mark_email_verified", {
      p_member_id: memberId,
    });
    await client.rpc("dealer_network_revoke_member_sessions", {
      p_member_id: memberId,
    });
  }
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
  return {
    ok: true as const,
    value: await readMemberProfile(memberId),
    reauthenticate: identityChanged,
  };
}

export async function addMemberBrand(memberId: string, input: unknown) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const brandId = validateUuid(body.brandId);
  const relationshipType =
    body.relationshipType === "sold" || body.relationshipType === "serviced"
      ? body.relationshipType
      : null;
  if (!brandId || !relationshipType) throw new Error("INVALID_BRAND_REQUEST");
  const client = getSupabaseServiceClient();
  const { data: brand } = await client
    .from("dealer_network_brands")
    .select("id")
    .eq("id", brandId)
    .eq("status", "active")
    .maybeSingle();
  if (!brand) throw new Error("INVALID_BRAND_REQUEST");
  const { data, error } = await client
    .from("dealer_network_member_brands")
    .insert({
      member_id: memberId,
      brand_id: brandId,
      relationship_type: relationshipType,
      approval_status: "pending",
    })
    .select(
      "id,brand_id,relationship_type,approval_status,requested_at,brand:dealer_network_brands(id,name)",
    )
    .single();
  if (error) throw error;
  return mapBrand(data as Record<string, unknown>);
}

export async function removeMemberBrand(
  memberId: string,
  relationshipId: string,
) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_member_brands")
    .update({
      approval_status: "removed",
      removed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", relationshipId)
    .eq("member_id", memberId)
    .in("approval_status", ["pending", "approved"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("BRAND_RELATIONSHIP_NOT_FOUND");
}

export async function uploadMemberLogo(memberId: string, file: File) {
  const extension =
    MEMBER_LOGO_TYPES[file.type as keyof typeof MEMBER_LOGO_TYPES];
  if (
    !extension ||
    file.size > MEMBER_LOGO_LIMIT ||
    !(await hasExpectedFileSignature(file))
  )
    throw new Error("INVALID_LOGO");
  const client = getSupabaseServiceClient();
  const { data: member, error } = await client
    .from("dealer_network_members")
    .select("logo_path")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  const path = `members/${memberId}/logo/${randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage
    .from("dealer-network-private")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;
  const { error: updateError } = await client
    .from("dealer_network_members")
    .update({ logo_path: path, updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (updateError) {
    await client.storage.from("dealer-network-private").remove([path]);
    throw updateError;
  }
  if (member.logo_path)
    await client.storage
      .from("dealer-network-private")
      .remove([member.logo_path]);
  return signedLogo(path);
}

export async function removeMemberLogo(memberId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("dealer_network_members")
    .select("logo_path")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  const { error: updateError } = await client
    .from("dealer_network_members")
    .update({ logo_path: null, updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (updateError) throw updateError;
  if (data.logo_path)
    await client.storage
      .from("dealer-network-private")
      .remove([data.logo_path]);
}

export async function searchDealerDirectory(
  memberId: string,
  filters: DirectoryFilters,
) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("dealer_network_directory_rows");
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as PrivateDirectoryRow[];
  let origin: { latitude: number; longitude: number } | null = null;
  if (
    filters.near === "coordinates" &&
    typeof filters.latitude === "number" &&
    typeof filters.longitude === "number"
  )
    origin = { latitude: filters.latitude, longitude: filters.longitude };
  if (filters.near === "business") {
    const current = rows.find((row) => row.id === memberId);
    if (
      current?.latitude !== null &&
      current?.latitude !== undefined &&
      current.longitude !== null
    )
      origin = { latitude: current.latitude, longitude: current.longitude };
  }
  if (filters.near === "zip" && filters.nearZip)
    origin = await geocodeUsLocation(`${filters.nearZip}, United States`).catch(
      () => null,
    );
  if (filters.near && !origin) throw new Error("LOCATION_UNAVAILABLE");
  const matches = filterDirectoryRows(rows, filters, origin).slice(0, 100);
  return Promise.all(
    matches.map(async ({ row, distance }) =>
      toDirectoryResult(row, distance, await signedLogo(row.logoPath)),
    ),
  );
}

export async function readOwnSuggestions(memberId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_suggestions")
    .select(
      "id,category,subject,message,status,created_at,reviewed_at,resolved_at",
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSuggestion(memberId: string, input: unknown) {
  const parsed = validateSuggestion(input);
  if (!parsed.ok) return parsed;
  const client = getSupabaseServiceClient();
  const { data: member, error: memberError } = await client
    .from("dealer_network_members")
    .select("company_name")
    .eq("id", memberId)
    .single();
  if (memberError) throw memberError;
  const { data, error } = await client
    .from("dealer_network_suggestions")
    .insert({
      member_id: memberId,
      company_name_snapshot: member.company_name,
      ...parsed.value,
    })
    .select(
      "id,category,subject,message,status,created_at,reviewed_at,resolved_at",
    )
    .single();
  if (error) throw error;
  return { ok: true as const, value: data };
}
