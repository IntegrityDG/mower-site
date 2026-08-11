import { randomUUID } from "node:crypto";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { classifySupabaseServerCredential, getSupabaseServiceClient, getSupabaseUrl } from "@/lib/supabase";
import { IDS_ACTION_IMAGE_TYPES, IDS_ACTION_MAX_IMAGE_BYTES } from "@/lib/ids-action/validation";
import { inspectSignedUploadToken, isValidSignedUploadToken } from "@/lib/ids-action/signed-upload-token";

type UploadMetadata = { name?: string; type?: string; size?: number };

export function storageTusEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (!/^https?:$/.test(url.protocol) || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("Invalid Supabase URL configuration.");
  }
  if (!url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as UploadMetadata | null;
  const extension = body?.type ? IDS_ACTION_IMAGE_TYPES[body.type as keyof typeof IDS_ACTION_IMAGE_TYPES] : undefined;
  if (!extension) return Response.json({ error: "Upload a JPEG, PNG, or WebP image. HEIC/HEIF is not supported; convert it first." }, { status: 400 });
  if (!body?.size || body.size > IDS_ACTION_MAX_IMAGE_BYTES) return Response.json({ error: "Photo must be 50 MB or smaller." }, { status: 400 });
  const { id } = await params;
  const client = getSupabaseServiceClient();
  const { data: entry } = await client.from("ids_action_entries").select("id").eq("id", id).maybeSingle();
  if (!entry) return Response.json({ error: "Entry not found." }, { status: 404 });
  const path = `entries/${id}/${randomUUID()}.${extension}`;
  const { data, error } = await client.storage.from("ids-action-media").createSignedUploadUrl(path);
  if (error) return Response.json({ error: "Upload could not be prepared." }, { status: 500 });
  const tokenDiagnostics = inspectSignedUploadToken(data?.token, data?.signedUrl);
  const safeDiagnostics = { ...tokenDiagnostics, credentialType: classifySupabaseServerCredential() };
  if (!isValidSignedUploadToken(tokenDiagnostics)) {
    console.warn("IDS signed upload token validation failed", safeDiagnostics);
    return Response.json({ error: "Upload authorization could not be prepared: invalid signed upload token." }, { status: 500 });
  }
  console.info("IDS signed upload token validated", safeDiagnostics);
  let tusEndpoint: string;
  try {
    tusEndpoint = storageTusEndpoint(getSupabaseUrl());
  } catch {
    return Response.json({ error: "Upload service is not configured correctly." }, { status: 500 });
  }
  return Response.json({ path, token: data.token, publicUrl: client.storage.from("ids-action-media").getPublicUrl(path).data.publicUrl, tusEndpoint });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { path } = await request.json().catch(() => ({ path: "" })) as { path?: string };
  const { id } = await params;
  if (!path?.startsWith(`entries/${id}/`)) return Response.json({ error: "Invalid storage path." }, { status: 400 });
  const { error } = await getSupabaseServiceClient().storage.from("ids-action-media").remove([path]);
  return error ? Response.json({ error: "Unused upload could not be removed." }, { status: 500 }) : new Response(null, { status: 204 });
}
