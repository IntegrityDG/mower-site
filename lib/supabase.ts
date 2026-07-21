import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicCatalogClient: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

function supabaseUrl() {
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

const serverClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export function getSupabaseCatalogClient() {
  publicCatalogClient ??= createClient(
    supabaseUrl(),
    supabaseAnonKey(),
    serverClientOptions
  );

  return publicCatalogClient;
}

export function getSupabaseServiceClient() {
  serviceRoleClient ??= createClient(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    serverClientOptions
  );

  return serviceRoleClient;
}
