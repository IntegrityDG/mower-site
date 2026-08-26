alter table public.featured_businesses
  add column business_city text check (business_city is null or char_length(business_city) <= 120),
  add column business_state text check (business_state is null or business_state ~ '^[A-Z]{2}$'),
  add column business_county text check (business_county is null or char_length(business_county) <= 120),
  add column postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  add column phone_area_code text check (phone_area_code is null or phone_area_code ~ '^[2-9][0-9]{2}$'),
  add column listing_started_at timestamptz,
  add column listing_expires_at timestamptz,
  add column listing_grace_until timestamptz,
  add column listing_expired_at timestamptz,
  add column last_renewed_at timestamptz,
  add column renewal_count integer not null default 0 check (renewal_count >= 0),
  add constraint featured_business_listing_dates check (listing_expires_at is null or (listing_started_at is not null and listing_expires_at > listing_started_at)),
  add constraint featured_business_listing_grace check (listing_grace_until is null or (listing_expires_at is not null and listing_grace_until > listing_expires_at));

update public.featured_businesses
set listing_started_at = now(),
    listing_expires_at = now() + interval '6 months',
    listing_grace_until = now() + interval '6 months' + interval '30 days'
where is_public and not is_archived;

create function public.initialize_featured_business_listing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_public and not new.is_archived and new.listing_expires_at is null then
    new.listing_started_at = now();
    new.listing_expires_at = now() + interval '6 months';
    new.listing_grace_until = new.listing_expires_at + interval '30 days';
    new.listing_expired_at = null;
  end if;
  return new;
end;
$$;
create trigger initialize_featured_business_listing_before_write
before insert or update of is_public, is_archived on public.featured_businesses
for each row execute function public.initialize_featured_business_listing();
revoke all on function public.initialize_featured_business_listing() from public, anon, authenticated;

create index featured_businesses_state_idx on public.featured_businesses (business_state) where is_public and not is_archived;
create index featured_businesses_county_idx on public.featured_businesses (business_state, business_county) where is_public and not is_archived;
create index featured_businesses_area_code_idx on public.featured_businesses (phone_area_code) where is_public and not is_archived;
create index featured_businesses_expiration_idx on public.featured_businesses (listing_expires_at) where listing_expires_at is not null;
create index featured_businesses_grace_idx on public.featured_businesses (listing_grace_until) where listing_grace_until is not null;

drop policy "Eligible featured businesses are publicly readable" on public.featured_businesses;
create policy "Active featured businesses are publicly readable"
on public.featured_businesses for select to anon, authenticated
using (is_public and not is_archived and listing_expires_at > now());

create or replace function public.set_featured_business(p_business_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(73190421);
  if not exists (
    select 1 from public.featured_businesses
    where id = p_business_id
      and is_public
      and not is_archived
      and listing_expires_at > now()
  ) then
    raise exception 'Featured business must be active, public, and not archived';
  end if;
  update public.featured_businesses set is_featured = false, updated_at = now() where is_featured and id <> p_business_id;
  update public.featured_businesses set is_featured = true, updated_at = now() where id = p_business_id;
end;
$$;
revoke all on function public.set_featured_business(uuid) from public, anon, authenticated;
grant execute on function public.set_featured_business(uuid) to service_role;

create table public.featured_business_service_areas (
  id uuid primary key default gen_random_uuid(),
  featured_business_id uuid not null references public.featured_businesses(id) on delete cascade,
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  county_name text check (county_name is null or char_length(county_name) between 1 and 120),
  statewide boolean not null default false,
  created_at timestamptz not null default now(),
  constraint featured_business_service_area_scope check ((statewide and county_name is null) or (not statewide and county_name is not null)),
  unique nulls not distinct (featured_business_id, state_code, county_name)
);
create unique index featured_business_service_areas_statewide_idx on public.featured_business_service_areas (featured_business_id, state_code) where statewide;
create index featured_business_service_areas_business_idx on public.featured_business_service_areas (featured_business_id);
create index featured_business_service_areas_location_idx on public.featured_business_service_areas (state_code, county_name, statewide);
alter table public.featured_business_service_areas enable row level security;
revoke all on table public.featured_business_service_areas from public, anon, authenticated;
grant select on table public.featured_business_service_areas to anon, authenticated;
grant select, insert, update, delete on table public.featured_business_service_areas to service_role;
create policy "Active public business service areas are readable" on public.featured_business_service_areas for select to anon, authenticated
  using (exists (select 1 from public.featured_businesses business where business.id = featured_business_id and business.is_public and not business.is_archived and business.listing_expires_at > now()));

create table public.featured_business_listing_contacts (
  featured_business_id uuid primary key references public.featured_businesses(id) on delete cascade,
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  reminder_30_sent_at timestamptz, reminder_7_sent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.featured_business_listing_contacts enable row level security;
alter table public.featured_business_listing_contacts force row level security;
revoke all on table public.featured_business_listing_contacts from public,anon,authenticated;
grant select,insert,update,delete on table public.featured_business_listing_contacts to service_role;
insert into public.featured_business_listing_contacts(featured_business_id)
select id from public.featured_businesses where is_public and not is_archived on conflict do nothing;

create table public.featured_business_image_cleanup_queue (
  id uuid primary key default gen_random_uuid(), image_path text not null unique check (char_length(image_path) <= 500),
  created_at timestamptz not null default now(), last_attempted_at timestamptz
);
alter table public.featured_business_image_cleanup_queue enable row level security;
alter table public.featured_business_image_cleanup_queue force row level security;
revoke all on table public.featured_business_image_cleanup_queue from public,anon,authenticated;
grant select,insert,update,delete on table public.featured_business_image_cleanup_queue to service_role;

create type public.featured_business_request_status as enum ('pending', 'needs_info', 'approved', 'denied');
create table public.featured_business_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  business_name text not null check (char_length(business_name) between 1 and 160),
  description text not null check (char_length(description) between 1 and 3000),
  business_city text check (business_city is null or char_length(business_city) <= 120),
  business_state text not null check (business_state ~ '^[A-Z]{2}$'),
  business_county text not null check (char_length(business_county) between 1 and 120),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  operating_region text check (operating_region is null or char_length(operating_region) <= 200),
  phone text check (phone is null or char_length(phone) <= 80),
  phone_area_code text check (phone_area_code is null or phone_area_code ~ '^[2-9][0-9]{2}$'),
  address text check (address is null or char_length(address) <= 500),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  facebook_url text check (facebook_url is null or facebook_url ~ '^https?://'),
  special_offer text check (special_offer is null or char_length(special_offer) <= 1000),
  additional_notes text check (additional_notes is null or char_length(additional_notes) <= 2000),
  logo_path text not null check (logo_path ~ '^requests/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'),
  logo_original_filename text check (logo_original_filename is null or char_length(logo_original_filename) <= 255),
  logo_content_type text not null check (logo_content_type in ('image/jpeg','image/png','image/webp')),
  status public.featured_business_request_status not null default 'pending',
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  more_info_message text check (more_info_message is null or char_length(more_info_message) <= 3000),
  more_info_requested_at timestamptz,
  approved_business_id uuid references public.featured_businesses(id) on delete cascade,
  approved_at timestamptz,
  denied_at timestamptz,
  consent_confirmed boolean not null check (consent_confirmed),
  submission_fingerprint text check (submission_fingerprint is null or submission_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint featured_business_request_approval_consistency check ((status = 'approved') = (approved_business_id is not null and approved_at is not null)),
  constraint featured_business_request_denial_consistency check ((status = 'denied') = (denied_at is not null))
);
create unique index featured_business_requests_approved_business_idx on public.featured_business_requests (approved_business_id) where approved_business_id is not null;
create index featured_business_requests_queue_idx on public.featured_business_requests (status, created_at desc);
alter table public.featured_business_requests enable row level security;
alter table public.featured_business_requests force row level security;
revoke all on table public.featured_business_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.featured_business_requests to service_role;

create table public.featured_business_request_service_areas (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.featured_business_requests(id) on delete cascade,
  state_code text not null check (state_code ~ '^[A-Z]{2}$'), county_name text check (county_name is null or char_length(county_name) between 1 and 120),
  statewide boolean not null default false, created_at timestamptz not null default now(),
  constraint featured_business_request_service_area_scope check ((statewide and county_name is null) or (not statewide and county_name is not null)),
  unique nulls not distinct (request_id, state_code, county_name)
);
create unique index featured_business_request_service_areas_statewide_idx on public.featured_business_request_service_areas (request_id, state_code) where statewide;
create index featured_business_request_service_areas_request_idx on public.featured_business_request_service_areas (request_id);
alter table public.featured_business_request_service_areas enable row level security;
alter table public.featured_business_request_service_areas force row level security;
revoke all on table public.featured_business_request_service_areas from public, anon, authenticated;
grant select, insert, update, delete on table public.featured_business_request_service_areas to service_role;

create table public.featured_business_request_rate_events (fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'), submitted_at timestamptz not null default now());
create index featured_business_request_rate_events_lookup_idx on public.featured_business_request_rate_events (fingerprint, submitted_at desc);
alter table public.featured_business_request_rate_events enable row level security;
alter table public.featured_business_request_rate_events force row level security;
revoke all on table public.featured_business_request_rate_events from public, anon, authenticated;
grant select, insert, delete on table public.featured_business_request_rate_events to service_role;

create function public.featured_business_request_consume_rate_limit(p_fingerprint text) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  delete from public.featured_business_request_rate_events where submitted_at < now() - interval '24 hours';
  if (select count(*) from public.featured_business_request_rate_events where fingerprint = p_fingerprint) >= 3 then return false; end if;
  insert into public.featured_business_request_rate_events(fingerprint) values (p_fingerprint); return true;
end; $$;
revoke all on function public.featured_business_request_consume_rate_limit(text) from public, anon, authenticated;
grant execute on function public.featured_business_request_consume_rate_limit(text) to service_role;

create function public.approve_featured_business_request(p_request_id uuid, p_business_id uuid, p_image_path text, p_image_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_row public.featured_business_requests%rowtype;
begin
  select * into request_row from public.featured_business_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if request_row.approved_business_id is not null then return request_row.approved_business_id; end if;
  if request_row.status = 'denied' then raise exception 'Denied requests cannot be approved'; end if;
  if request_row.logo_path is null then raise exception 'Request logo is required'; end if;
  insert into public.featured_businesses(id,business_name,description,operating_region,image_url,image_path,image_alt,website_url,facebook_url,phone,address,referral_code,special_offer,is_public,is_featured,is_archived,sort_order,business_city,business_state,business_county,postal_code,phone_area_code,listing_started_at,listing_expires_at,listing_grace_until,renewal_count)
  values(p_business_id,request_row.business_name,request_row.description,request_row.operating_region,p_image_url,p_image_path,request_row.business_name || ' logo',request_row.website_url,request_row.facebook_url,request_row.phone,request_row.address,null,request_row.special_offer,true,false,false,100,request_row.business_city,request_row.business_state,request_row.business_county,request_row.postal_code,request_row.phone_area_code,now(),now()+interval '6 months',now()+interval '6 months'+interval '30 days',0);
  insert into public.featured_business_listing_contacts(featured_business_id,contact_name,contact_email)
  values(p_business_id,request_row.contact_name,request_row.contact_email);
  insert into public.featured_business_service_areas(featured_business_id,state_code,county_name,statewide)
    select p_business_id,state_code,county_name,statewide from public.featured_business_request_service_areas where request_id=p_request_id;
  update public.featured_business_requests set status='approved',approved_business_id=p_business_id,approved_at=now(),updated_at=now() where id=p_request_id;
  return p_business_id;
end; $$;
revoke all on function public.approve_featured_business_request(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.approve_featured_business_request(uuid,uuid,text,text) to service_role;

create function public.renew_featured_business_listing(p_business_id uuid) returns timestamptz language plpgsql security definer set search_path='' as $$
declare business_row public.featured_businesses%rowtype; new_expiration timestamptz;
begin
  select * into business_row from public.featured_businesses where id=p_business_id for update;
  if not found then raise exception 'Business not found'; end if;
  if business_row.is_archived then raise exception 'Archived businesses must be unarchived before renewal'; end if;
  if business_row.listing_grace_until is not null and business_row.listing_grace_until <= now() then raise exception 'Listing grace period has ended'; end if;
  if business_row.listing_expires_at is not null and business_row.listing_expires_at > now() then new_expiration=business_row.listing_expires_at+interval '6 months'; else new_expiration=now()+interval '6 months'; end if;
  update public.featured_businesses set listing_started_at=coalesce(listing_started_at,now()),listing_expires_at=new_expiration,listing_grace_until=new_expiration+interval '30 days',listing_expired_at=null,last_renewed_at=now(),renewal_count=renewal_count+1,is_public=case when business_row.listing_expires_at is null or business_row.listing_expires_at<=now() then true else is_public end,is_featured=case when business_row.listing_expires_at is null or business_row.listing_expires_at<=now() then false else is_featured end,updated_at=now() where id=p_business_id;
  update public.featured_business_listing_contacts set reminder_30_sent_at=null,reminder_7_sent_at=null,updated_at=now() where featured_business_id=p_business_id;
  return new_expiration;
end; $$;
revoke all on function public.renew_featured_business_listing(uuid) from public,anon,authenticated;
grant execute on function public.renew_featured_business_listing(uuid) to service_role;

create function public.purge_expired_featured_business(p_business_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare business_row public.featured_businesses%rowtype;
begin
  select * into business_row from public.featured_businesses where id=p_business_id for update;
  if not found then return false; end if;
  if business_row.listing_grace_until is null or business_row.listing_grace_until>now() then return false; end if;
  if business_row.image_path is not null then insert into public.featured_business_image_cleanup_queue(image_path) values(business_row.image_path) on conflict(image_path) do nothing; end if;
  delete from public.featured_businesses where id=p_business_id; return true;
end; $$;
revoke all on function public.purge_expired_featured_business(uuid) from public,anon,authenticated;
grant execute on function public.purge_expired_featured_business(uuid) to service_role;

create function public.delete_featured_business_with_cleanup(p_business_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare business_row public.featured_businesses%rowtype;
begin
  select * into business_row from public.featured_businesses where id=p_business_id for update;
  if not found then return false; end if;
  if business_row.image_path is not null then insert into public.featured_business_image_cleanup_queue(image_path) values(business_row.image_path) on conflict(image_path) do nothing; end if;
  delete from public.featured_businesses where id=p_business_id; return true;
end; $$;
revoke all on function public.delete_featured_business_with_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.delete_featured_business_with_cleanup(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('featured-business-request-images','featured-business-request-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No storage.objects policies are created: only the server-held service role can access pending logos.
