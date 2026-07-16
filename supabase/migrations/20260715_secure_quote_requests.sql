-- Keep customer quote requests private.
-- The Next.js API route writes with SUPABASE_SERVICE_ROLE_KEY on the server.

alter table public.quote_requests enable row level security;

revoke all privileges on table public.quote_requests from anon, authenticated;
revoke all privileges on sequence public.quote_requests_id_seq from anon, authenticated;

grant all privileges on table public.quote_requests to service_role;
grant usage, select on sequence public.quote_requests_id_seq to service_role;

-- Intentionally no anon/authenticated policies.
-- Website visitors submit through /api/quote-request; only the server-side
-- service role can read or write quote_requests directly.
