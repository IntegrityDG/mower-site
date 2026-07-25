begin;

-- Keep customer quote requests private.
-- Browser submissions must use the server-only Next.js API route.

alter table public.quote_requests
  enable row level security;

-- Preserve the approved FORCE RLS configuration.
alter table public.quote_requests
  no force row level security;

-- Remove direct access from browser-facing Supabase roles.
revoke all privileges
  on table public.quote_requests
  from anon, authenticated;

revoke all privileges
  on sequence public.quote_requests_id_seq
  from anon, authenticated;

-- Give the server-only service role only what the verified route requires.
revoke all privileges
  on table public.quote_requests
  from service_role;

grant insert
  on table public.quote_requests
  to service_role;

revoke all privileges
  on sequence public.quote_requests_id_seq
  from service_role;

grant usage
  on sequence public.quote_requests_id_seq
  to service_role;

-- No anon or authenticated RLS policies are intentionally created.
-- service_role remains server-only and has BYPASSRLS.

commit;
