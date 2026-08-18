import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { DealerApplicationInput, DealerBrand } from "./types";
import { requestFingerprint } from "./security";
import { hasExpectedFileSignature } from "./uploads";

export const CERTIFICATION_UPLOAD_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const CERTIFICATION_UPLOAD_LIMIT = 8 * 1024 * 1024;

const applicationColumns =
  "id,applicant_name,company_name,phone,email,address_line_1,address_line_2,city,state,zip_code,country,website_url,role,experience,service_region,introduction,business_type,other_business_type,certification_answer,duplicate_matches,status,review_message,reviewed_at,approved_at,denied_at,created_at,updated_at";

export function mapBrand(row: Record<string, unknown>): DealerBrand {
  return {
    id: String(row.id),
    name: String(row.name),
    models: Array.isArray(row.models)
      ? row.models.map((model) => String(model))
      : [],
    status: row.status as DealerBrand["status"],
    sortOrder: Number(row.sort_order),
  };
}

export function mapApplication(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    applicantName: String(row.applicant_name),
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
    businessType: String(row.business_type),
    otherBusinessType: row.other_business_type as string | null,
    certificationAnswer: row.certification_answer as boolean | null,
    duplicateMatches: Array.isArray(row.duplicate_matches)
      ? row.duplicate_matches
      : [],
    status: String(row.status),
    reviewMessage: row.review_message as string | null,
    reviewedAt: row.reviewed_at as string | null,
    approvedAt: row.approved_at as string | null,
    deniedAt: row.denied_at as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function readActiveDealerBrands() {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_brands")
    .select("id,name,models,status,sort_order")
    .eq("status", "active")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => mapBrand(row as Record<string, unknown>));
}

export async function createDealerApplication(
  value: DealerApplicationInput,
  idempotencyKey: string,
  submittedIpHash: string,
) {
  const activeBrands = await readActiveDealerBrands();
  const activeIds = new Set(activeBrands.map((brand) => brand.id));
  if (
    ![...value.brandsSold, ...value.brandsServiced].every((id) =>
      activeIds.has(id),
    )
  )
    throw new Error("INVALID_BRAND");
  const fingerprintValue = { ...value, consent: true };
  const payload = {
    ...value,
    submittedIpHash,
    requestFingerprint: requestFingerprint(fingerprintValue),
  };
  const { data, error } = await getSupabaseServiceClient().rpc(
    "dealer_network_create_application",
    { p_payload: payload, p_idempotency_key: idempotencyKey },
  );
  if (error) throw error;
  return String(data);
}

export async function attachCertificationFiles(
  applicationId: string,
  files: Array<File | null>,
) {
  const client = getSupabaseServiceClient();
  const warnings: string[] = [];
  const { data: records, error } = await client
    .from("dealer_network_application_certifications")
    .select("id,position,evidence_path")
    .eq("application_id", applicationId)
    .order("position");
  if (error) throw error;
  for (const record of records ?? []) {
    const file = files[Number(record.position)];
    if (!file || record.evidence_path) continue;
    const extension =
      CERTIFICATION_UPLOAD_TYPES[
        file.type as keyof typeof CERTIFICATION_UPLOAD_TYPES
      ];
    if (
      !extension ||
      file.size > CERTIFICATION_UPLOAD_LIMIT ||
      !(await hasExpectedFileSignature(file))
    ) {
      warnings.push(
        `Evidence file ${Number(record.position) + 1} was not accepted.`,
      );
      continue;
    }
    const path = `applications/${applicationId}/certifications/${randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage
      .from("dealer-network-private")
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      warnings.push(
        `Evidence file ${Number(record.position) + 1} could not be uploaded.`,
      );
      continue;
    }
    const { error: updateError } = await client
      .from("dealer_network_application_certifications")
      .update({ evidence_path: path, evidence_mime_type: file.type })
      .eq("id", record.id)
      .eq("application_id", applicationId);
    if (updateError) {
      await client.storage.from("dealer-network-private").remove([path]);
      warnings.push(
        `Evidence file ${Number(record.position) + 1} could not be attached.`,
      );
    }
  }
  return warnings;
}

export async function readApplicationNotice(applicationId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_applications")
    .select(
      "id,applicant_name,company_name,role,phone,email,city,state,zip_code,review_message,created_at",
    )
    .eq("id", applicationId)
    .single();
  if (error) throw error;
  return {
    id: String(data.id),
    applicantName: String(data.applicant_name),
    companyName: String(data.company_name),
    role: String(data.role),
    phone: String(data.phone),
    email: String(data.email),
    city: String(data.city),
    state: String(data.state),
    zipCode: String(data.zip_code),
    reviewMessage: data.review_message as string | null,
    createdAt: String(data.created_at),
  };
}

export async function readAdminApplications() {
  const client = getSupabaseServiceClient();
  const [
    { data: applications, error },
    { data: links },
    { data: certifications },
    { data: notifications },
    { data: members },
  ] = await Promise.all([
    client
      .from("dealer_network_applications")
      .select(applicationColumns)
      .order("created_at", { ascending: false }),
    client
      .from("dealer_network_application_brands")
      .select(
        "application_id,relationship_type,brand:dealer_network_brands(id,name)",
      ),
    client
      .from("dealer_network_application_certifications")
      .select(
        "id,application_id,position,certification_name,brand_or_manufacturer,issuing_organization,date_earned,expiration_date,evidence_path,evidence_mime_type",
      )
      .order("position"),
    client
      .from("dealer_network_notification_events")
      .select(
        "id,application_id,member_id,event_type,status,attempt_count,last_error,created_at,sent_at",
      )
      .order("created_at", { ascending: false }),
    client.from("dealer_network_members").select("id,application_id"),
  ]);
  if (error) throw error;
  const signedEvidence = new Map<string, string>();
  await Promise.all(
    (certifications ?? []).map(async (item) => {
      if (!item.evidence_path) return;
      const { data } = await client.storage
        .from("dealer-network-private")
        .createSignedUrl(item.evidence_path, 15 * 60);
      if (data?.signedUrl) signedEvidence.set(String(item.id), data.signedUrl);
    }),
  );
  return (applications ?? []).map((row) => {
    const application = mapApplication(row as Record<string, unknown>);
    return {
      ...application,
      brandsSold: (links ?? [])
        .filter(
          (link) =>
            link.application_id === application.id &&
            link.relationship_type === "sold",
        )
        .map((link) => link.brand),
      brandsServiced: (links ?? [])
        .filter(
          (link) =>
            link.application_id === application.id &&
            link.relationship_type === "serviced",
        )
        .map((link) => link.brand),
      certifications: (certifications ?? [])
        .filter((item) => item.application_id === application.id)
        .map((item) => ({
          id: item.id,
          certificationName: item.certification_name,
          brandOrManufacturer: item.brand_or_manufacturer,
          issuingOrganization: item.issuing_organization,
          dateEarned: item.date_earned,
          expirationDate: item.expiration_date,
          evidenceUrl: signedEvidence.get(String(item.id)) ?? null,
          evidenceMimeType: item.evidence_mime_type,
        })),
      notifications: (notifications ?? []).filter(
        (item) => item.application_id === application.id,
      ),
      memberId:
        (members ?? []).find(
          (member) => member.application_id === application.id,
        )?.id ?? null,
    };
  });
}
