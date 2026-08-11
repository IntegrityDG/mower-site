import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicCatalogClient: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

export function getSupabaseUrl() {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error(
      "Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable."
    );
  }

  return value;
}

function supabaseAnonKey() {
  const value =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error(
      "Missing SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable."
    );
  }

  return value;
}

function supabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }

  return value;
}

export type SupabaseServerCredentialType =
  | "legacy-jwt-service-role"
  | "modern-sb-secret"
  | "unknown";

export function classifySupabaseServerCredential(): SupabaseServerCredentialType {
  const value = supabaseServiceRoleKey();
  if (value.startsWith("sb_secret_")) return "modern-sb-secret";
  if (value.split(".").length === 3) return "legacy-jwt-service-role";
  return "unknown";
}

const serverClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export function getSupabaseCatalogClient() {
  publicCatalogClient ??= createClient(
    getSupabaseUrl(),
    supabaseAnonKey(),
    serverClientOptions
  );

  return publicCatalogClient;
}

export function getSupabaseServiceClient() {
  serviceRoleClient ??= createClient(
    getSupabaseUrl(),
    supabaseServiceRoleKey(),
    serverClientOptions
  );

  return serviceRoleClient;
}
