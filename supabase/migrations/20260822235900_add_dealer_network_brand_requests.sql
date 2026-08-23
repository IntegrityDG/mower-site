-- Existing active brands are immediate member affiliations. New catalog names
-- use a separate, private IDS review queue.
update public.dealer_network_member_brands mb
set
  approval_status = 'approved',
  decided_at = coalesce(mb.decided_at, now()),
  updated_at = now()
from public.dealer_network_brands b
where b.id = mb.brand_id
  and b.status = 'active'
  and mb.approval_status = 'pending';

create table public.dealer_network_brand_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.dealer_network_members(id) on delete set null,
  member_name_snapshot text not null
    check (char_length(btrim(member_name_snapshot)) between 1 and 180),
  company_name_snapshot text not null
    check (char_length(btrim(company_name_snapshot)) between 1 and 180),
  requested_name text not null
    check (char_length(btrim(requested_name)) between 2 and 120),
  normalized_name text not null
    check (char_length(normalized_name) between 2 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'pending') = (resolved_at is null))
);

create unique index dealer_network_brand_requests_pending_name_uidx
  on public.dealer_network_brand_requests(normalized_name)
  where status = 'pending';
create index dealer_network_brand_requests_status_idx
  on public.dealer_network_brand_requests(status, created_at desc);
create index dealer_network_brand_requests_member_idx
  on public.dealer_network_brand_requests(member_id, created_at desc);

alter table public.dealer_network_brand_requests enable row level security;
alter table public.dealer_network_brand_requests force row level security;
revoke all on table public.dealer_network_brand_requests
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.dealer_network_brand_requests
  to service_role;
