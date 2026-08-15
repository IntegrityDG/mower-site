begin;

create schema if not exists dealer_network_private;
revoke all on schema dealer_network_private from public, anon, authenticated;
grant usage on schema dealer_network_private to service_role;

create table public.dealer_network_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  website_url text check (website_url is null or char_length(website_url) <= 2000),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dealer_network_brands_name_uidx on public.dealer_network_brands (lower(name));
create index dealer_network_brands_listing_idx on public.dealer_network_brands (status, sort_order, name);
insert into public.dealer_network_brands(name,description,status,sort_order) values
  ('Lymow','Robotic mower equipment supported by IDS.','active',10),
  ('Yarbo','Modular autonomous property-care equipment supported by IDS.','active',20),
  ('Pandag','Commercial autonomous mowing equipment supported by IDS.','active',30)
on conflict do nothing;

create table public.dealer_network_applications (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  applicant_name text not null check (char_length(applicant_name) between 2 and 160),
  company_name text not null check (char_length(company_name) between 2 and 180),
  normalized_company_name text not null check (char_length(normalized_company_name) between 2 and 180),
  phone text not null check (char_length(phone) between 10 and 30),
  normalized_phone text not null check (normalized_phone ~ '^1[2-9][0-9]{9}$'),
  email text not null check (char_length(email) between 3 and 254),
  normalized_email text not null check (normalized_email = lower(normalized_email)),
  address_line_1 text not null check (char_length(address_line_1) between 2 and 180),
  address_line_2 text check (address_line_2 is null or char_length(address_line_2) <= 180),
  city text not null check (char_length(city) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip_code text not null check (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  country text not null default 'United States' check (country = 'United States'),
  website_url text check (website_url is null or char_length(website_url) <= 2000),
  role text not null check (role in ('dealer','repair_tech','both')),
  experience text not null check (char_length(experience) between 1 and 1000),
  service_region text not null check (char_length(service_region) between 1 and 500),
  introduction text not null check (char_length(introduction) between 1 and 3000),
  business_type text not null check (business_type in ('robotic_mower_dealer','robotic_mower_repair','general_repair_shop','small_engine_repair_shop','other')),
  other_business_type text check (other_business_type is null or char_length(other_business_type) <= 160),
  certification_answer boolean,
  consent_at timestamptz not null,
  duplicate_matches jsonb not null default '[]'::jsonb check (jsonb_typeof(duplicate_matches) = 'array'),
  status text not null default 'pending' check (status in ('pending','more_information_requested','approved','denied')),
  review_message text check (review_message is null or char_length(review_message) <= 3000),
  reviewed_at timestamptz,
  approved_at timestamptz,
  denied_at timestamptz,
  submitted_ip_hash text check (submitted_ip_hash is null or char_length(submitted_ip_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (business_type <> 'other' or nullif(btrim(other_business_type), '') is not null),
  check (business_type not in ('general_repair_shop','small_engine_repair_shop') or certification_answer is not null),
  check ((status = 'approved') = (approved_at is not null)),
  check ((status = 'denied') = (denied_at is not null))
);
create index dealer_network_applications_status_idx on public.dealer_network_applications (status, created_at desc);
create index dealer_network_applications_phone_idx on public.dealer_network_applications (normalized_phone);
create index dealer_network_applications_email_idx on public.dealer_network_applications (normalized_email);
create index dealer_network_applications_company_idx on public.dealer_network_applications (normalized_company_name);

create table public.dealer_network_application_brands (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.dealer_network_applications(id) on delete restrict,
  brand_id uuid not null references public.dealer_network_brands(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('sold','serviced')),
  created_at timestamptz not null default now(),
  unique (application_id, brand_id, relationship_type)
);
create index dealer_network_application_brands_brand_idx on public.dealer_network_application_brands (brand_id, relationship_type);

create table public.dealer_network_application_certifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.dealer_network_applications(id) on delete restrict,
  position smallint not null check (position between 0 and 20),
  certification_name text not null check (char_length(certification_name) between 1 and 200),
  brand_or_manufacturer text not null check (char_length(brand_or_manufacturer) between 1 and 160),
  issuing_organization text not null check (char_length(issuing_organization) between 1 and 200),
  date_earned date,
  expiration_date date,
  evidence_path text check (evidence_path is null or evidence_path ~ '^applications/[0-9a-f-]+/certifications/[0-9a-f-]+\.(pdf|jpg|png|webp)$'),
  evidence_mime_type text check (evidence_mime_type is null or evidence_mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  unique (application_id, position),
  check (expiration_date is null or date_earned is null or expiration_date >= date_earned),
  check ((evidence_path is null) = (evidence_mime_type is null))
);

create table public.dealer_network_members (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.dealer_network_applications(id) on delete restrict,
  member_name text not null check (char_length(member_name) between 2 and 160),
  company_name text not null check (char_length(company_name) between 2 and 180),
  normalized_company_name text not null check (char_length(normalized_company_name) between 2 and 180),
  phone text not null check (char_length(phone) between 10 and 30),
  normalized_phone text not null unique check (normalized_phone ~ '^1[2-9][0-9]{9}$'),
  email text not null check (char_length(email) between 3 and 254),
  normalized_email text not null check (normalized_email = lower(normalized_email)),
  address_line_1 text not null check (char_length(address_line_1) between 2 and 180),
  address_line_2 text check (address_line_2 is null or char_length(address_line_2) <= 180),
  city text not null check (char_length(city) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip_code text not null check (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  country text not null default 'United States' check (country = 'United States'),
  website_url text check (website_url is null or char_length(website_url) <= 2000),
  role text not null check (role in ('dealer','repair_tech','both')),
  experience text not null check (char_length(experience) between 1 and 1000),
  service_region text not null check (char_length(service_region) between 1 and 500),
  introduction text not null check (char_length(introduction) between 1 and 3000),
  logo_path text check (logo_path is null or logo_path ~ '^members/[0-9a-f-]+/logo/[0-9a-f-]+\.(jpg|png|webp)$'),
  status text not null default 'pending_activation' check (status in ('pending_activation','active','suspended','archived')),
  account_locked boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active') = (activated_at is not null) or status in ('suspended','archived'))
);
create index dealer_network_members_status_idx on public.dealer_network_members (status, account_locked, created_at desc);
create index dealer_network_members_email_idx on public.dealer_network_members (normalized_email);
create index dealer_network_members_company_idx on public.dealer_network_members (normalized_company_name);
create index dealer_network_members_zip_idx on public.dealer_network_members (zip_code);

create table public.dealer_network_member_brands (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  brand_id uuid not null references public.dealer_network_brands(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('sold','serviced')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','removed')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((approval_status = 'removed') = (removed_at is not null)),
  check (approval_status not in ('approved','rejected') or decided_at is not null)
);
create unique index dealer_network_member_brands_current_uidx on public.dealer_network_member_brands (member_id, brand_id, relationship_type) where approval_status in ('pending','approved');
create index dealer_network_member_brands_search_idx on public.dealer_network_member_brands (brand_id, relationship_type, approval_status, member_id);
create index dealer_network_member_brands_member_idx on public.dealer_network_member_brands (member_id, approval_status);

create table public.dealer_network_suggestions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  company_name_snapshot text not null check (char_length(company_name_snapshot) between 1 and 180),
  category text not null check (category in ('new_brand','database_correction','member_information','search_improvement','portal_improvement','inaccurate_information','other')),
  subject text not null check (char_length(subject) between 2 and 180),
  message text not null check (char_length(message) between 5 and 3000),
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  admin_response text check (admin_response is null or char_length(admin_response) <= 3000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index dealer_network_suggestions_status_idx on public.dealer_network_suggestions (status, created_at desc);
create index dealer_network_suggestions_member_idx on public.dealer_network_suggestions (member_id, created_at desc);

create table public.dealer_network_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 1 and 300),
  event_type text not null check (event_type in ('ids_new_application','applicant_activation','applicant_denied','applicant_more_information','member_pin_reset')),
  application_id uuid references public.dealer_network_applications(id) on delete restrict,
  member_id uuid references public.dealer_network_members(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claimed_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 100),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null))
);
create index dealer_network_notifications_status_idx on public.dealer_network_notification_events (status, updated_at);
create index dealer_network_notifications_application_idx on public.dealer_network_notification_events (application_id, created_at);
create index dealer_network_notifications_member_idx on public.dealer_network_notification_events (member_id, created_at);

create table public.dealer_network_status_events (
  id bigint generated always as identity primary key,
  application_id uuid references public.dealer_network_applications(id) on delete restrict,
  member_id uuid references public.dealer_network_members(id) on delete restrict,
  event_type text not null check (char_length(event_type) between 1 and 80),
  from_value text,
  to_value text,
  actor_type text not null check (actor_type in ('admin','member','system')),
  created_at timestamptz not null default now(),
  check (application_id is not null or member_id is not null)
);
create index dealer_network_status_events_application_idx on public.dealer_network_status_events (application_id, created_at desc);
create index dealer_network_status_events_member_idx on public.dealer_network_status_events (member_id, created_at desc);

create table dealer_network_private.credentials (
  member_id uuid primary key references public.dealer_network_members(id) on delete restrict,
  pin_hash text,
  pin_salt text,
  email_verified_at timestamptz,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 100),
  last_failed_at timestamptz,
  auth_locked_until timestamptz,
  pin_changed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((pin_hash is null) = (pin_salt is null))
);

create table dealer_network_private.sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index dealer_network_sessions_member_idx on dealer_network_private.sessions (member_id, expires_at desc);
create index dealer_network_sessions_expiry_idx on dealer_network_private.sessions (expires_at) where revoked_at is null;

create table dealer_network_private.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index dealer_network_activation_member_idx on dealer_network_private.activation_tokens (member_id, expires_at desc);

create table dealer_network_private.pin_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index dealer_network_reset_member_idx on dealer_network_private.pin_reset_tokens (member_id, expires_at desc);

create table dealer_network_private.member_locations (
  member_id uuid primary key references public.dealer_network_members(id) on delete restrict,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  geocode_status text not null default 'pending' check (geocode_status in ('pending','succeeded','failed','stale')),
  provider text check (provider is null or char_length(provider) <= 80),
  last_error text check (last_error is null or char_length(last_error) <= 100),
  attempted_at timestamptz,
  geocoded_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (geocode_status <> 'succeeded' or latitude is not null)
);

create table dealer_network_private.rate_limits (
  scope text not null check (char_length(scope) between 1 and 80),
  key_hash text not null check (char_length(key_hash) = 64),
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 1 check (hit_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'dealer_network_brands','dealer_network_applications','dealer_network_application_brands',
    'dealer_network_application_certifications','dealer_network_members','dealer_network_member_brands',
    'dealer_network_suggestions','dealer_network_notification_events','dealer_network_status_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update on table public.%I to service_role', table_name);
  end loop;
end $$;
grant usage, select on sequence public.dealer_network_application_brands_id_seq, public.dealer_network_status_events_id_seq to service_role;

alter table dealer_network_private.credentials enable row level security;
alter table dealer_network_private.credentials force row level security;
alter table dealer_network_private.sessions enable row level security;
alter table dealer_network_private.sessions force row level security;
alter table dealer_network_private.activation_tokens enable row level security;
alter table dealer_network_private.activation_tokens force row level security;
alter table dealer_network_private.pin_reset_tokens enable row level security;
alter table dealer_network_private.pin_reset_tokens force row level security;
alter table dealer_network_private.member_locations enable row level security;
alter table dealer_network_private.member_locations force row level security;
alter table dealer_network_private.rate_limits enable row level security;
alter table dealer_network_private.rate_limits force row level security;
revoke all on all tables in schema dealer_network_private from public, anon, authenticated, service_role;
grant select, insert, update on all tables in schema dealer_network_private to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dealer-network-private','dealer-network-private',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No storage.objects policies are created. Uploads and signed reads are performed only by authenticated server routes using the service role.

create function public.dealer_network_consume_rate_limit(p_scope text, p_key_hash text, p_max_hits integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare current_row dealer_network_private.rate_limits;
begin
  if p_max_hits < 1 or p_window_seconds < 1 then raise exception 'invalid_rate_limit'; end if;
  insert into dealer_network_private.rate_limits(scope,key_hash) values(p_scope,p_key_hash)
  on conflict(scope,key_hash) do update set
    hit_count=case when dealer_network_private.rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then 1 else dealer_network_private.rate_limits.hit_count+1 end,
    window_started_at=case when dealer_network_private.rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then now() else dealer_network_private.rate_limits.window_started_at end,
    updated_at=now()
  returning * into current_row;
  return current_row.hit_count <= p_max_hits;
end $$;

create function public.dealer_network_create_application(p_payload jsonb, p_idempotency_key uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare application_id uuid; existing public.dealer_network_applications; duplicate_data jsonb; certification jsonb; certification_position integer := 0;
begin
  select * into existing from public.dealer_network_applications where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> p_payload->>'requestFingerprint' then raise exception 'idempotency_conflict'; end if;
    return existing.id;
  end if;
  select coalesce(jsonb_agg(candidate), '[]'::jsonb) into duplicate_data from (
    select jsonb_build_object('recordType','application','id',a.id,'companyName',a.company_name,'reason',
      concat_ws(', ',case when a.normalized_phone=p_payload->>'normalizedPhone' then 'phone' end,case when a.normalized_email=p_payload->>'normalizedEmail' then 'email' end,case when a.normalized_company_name=p_payload->>'normalizedCompanyName' then 'company' end)) candidate
    from public.dealer_network_applications a where a.normalized_phone=p_payload->>'normalizedPhone' or a.normalized_email=p_payload->>'normalizedEmail' or a.normalized_company_name=p_payload->>'normalizedCompanyName'
    union all
    select jsonb_build_object('recordType','member','id',m.id,'companyName',m.company_name,'reason',
      concat_ws(', ',case when m.normalized_phone=p_payload->>'normalizedPhone' then 'phone' end,case when m.normalized_email=p_payload->>'normalizedEmail' then 'email' end,case when m.normalized_company_name=p_payload->>'normalizedCompanyName' then 'company' end)) candidate
    from public.dealer_network_members m where m.normalized_phone=p_payload->>'normalizedPhone' or m.normalized_email=p_payload->>'normalizedEmail' or m.normalized_company_name=p_payload->>'normalizedCompanyName'
  ) matches;
  begin
    insert into public.dealer_network_applications(
      idempotency_key,request_fingerprint,applicant_name,company_name,normalized_company_name,phone,normalized_phone,email,normalized_email,
      address_line_1,address_line_2,city,state,zip_code,website_url,role,experience,service_region,introduction,business_type,other_business_type,
      certification_answer,consent_at,duplicate_matches,submitted_ip_hash
    ) values (
      p_idempotency_key,p_payload->>'requestFingerprint',p_payload->>'applicantName',p_payload->>'companyName',p_payload->>'normalizedCompanyName',p_payload->>'phone',p_payload->>'normalizedPhone',p_payload->>'email',p_payload->>'normalizedEmail',
      p_payload->>'addressLine1',nullif(p_payload->>'addressLine2',''),p_payload->>'city',p_payload->>'state',p_payload->>'zipCode',nullif(p_payload->>'websiteUrl',''),p_payload->>'role',p_payload->>'experience',p_payload->>'serviceRegion',p_payload->>'introduction',p_payload->>'businessType',nullif(p_payload->>'otherBusinessType',''),
      case when p_payload ? 'certificationAnswer' then (p_payload->>'certificationAnswer')::boolean else null end,now(),duplicate_data,nullif(p_payload->>'submittedIpHash','')
    ) returning id into application_id;
  exception when unique_violation then
    select * into existing from public.dealer_network_applications where idempotency_key=p_idempotency_key;
    if not found or existing.request_fingerprint <> p_payload->>'requestFingerprint' then raise exception 'idempotency_conflict'; end if;
    return existing.id;
  end;
  insert into public.dealer_network_application_brands(application_id,brand_id,relationship_type)
    select application_id,b.id,'sold' from public.dealer_network_brands b join jsonb_array_elements_text(coalesce(p_payload->'brandsSold','[]'::jsonb)) as selected(brand_id) on selected.brand_id::uuid=b.id where b.status='active';
  insert into public.dealer_network_application_brands(application_id,brand_id,relationship_type)
    select application_id,b.id,'serviced' from public.dealer_network_brands b join jsonb_array_elements_text(coalesce(p_payload->'brandsServiced','[]'::jsonb)) as selected(brand_id) on selected.brand_id::uuid=b.id where b.status='active';
  for certification in select value from jsonb_array_elements(coalesce(p_payload->'certifications','[]'::jsonb)) loop
    insert into public.dealer_network_application_certifications(application_id,position,certification_name,brand_or_manufacturer,issuing_organization,date_earned,expiration_date)
    values(application_id,certification_position,certification->>'certificationName',certification->>'brandOrManufacturer',certification->>'issuingOrganization',nullif(certification->>'dateEarned','')::date,nullif(certification->>'expirationDate','')::date);
    certification_position := certification_position + 1;
  end loop;
  insert into public.dealer_network_status_events(application_id,event_type,to_value,actor_type) values(application_id,'application_submitted','pending','system');
  return application_id;
end $$;

create function public.dealer_network_transition_application(p_application_id uuid, p_action text, p_message text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_status text; new_status text;
begin
  select status into old_status from public.dealer_network_applications where id=p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if p_action='more_information' then
    if old_status<>'pending' then raise exception 'invalid_transition'; end if;
    new_status:='more_information_requested';
  elsif p_action='deny' then
    if old_status not in ('pending','more_information_requested') then raise exception 'invalid_transition'; end if;
    new_status:='denied';
  else raise exception 'invalid_action'; end if;
  if nullif(btrim(p_message),'') is null then raise exception 'message_required'; end if;
  update public.dealer_network_applications set status=new_status,review_message=left(btrim(p_message),3000),reviewed_at=now(),
    denied_at=case when new_status='denied' then now() else null end,approved_at=null,updated_at=now() where id=p_application_id;
  insert into public.dealer_network_status_events(application_id,event_type,from_value,to_value,actor_type)
    values(p_application_id,'application_status',old_status,new_status,'admin');
  return case when old_status=new_status then 'unchanged' else 'changed' end;
end $$;

create function public.dealer_network_approve_application(p_application_id uuid, p_token_hash text, p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare application public.dealer_network_applications; member public.dealer_network_members;
begin
  select * into application from public.dealer_network_applications where id=p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  select * into member from public.dealer_network_members where application_id=p_application_id;
  if found then return jsonb_build_object('memberId',member.id,'changed',false); end if;
  if application.status not in ('pending','more_information_requested') then raise exception 'invalid_transition'; end if;
  if exists(select 1 from public.dealer_network_members where normalized_phone=application.normalized_phone) then raise exception 'phone_conflict'; end if;
  insert into public.dealer_network_members(application_id,member_name,company_name,normalized_company_name,phone,normalized_phone,email,normalized_email,address_line_1,address_line_2,city,state,zip_code,website_url,role,experience,service_region,introduction)
  values(application.id,application.applicant_name,application.company_name,application.normalized_company_name,application.phone,application.normalized_phone,application.email,application.normalized_email,application.address_line_1,application.address_line_2,application.city,application.state,application.zip_code,application.website_url,application.role,application.experience,application.service_region,application.introduction)
  returning * into member;
  insert into dealer_network_private.credentials(member_id) values(member.id);
  insert into dealer_network_private.activation_tokens(member_id,token_hash,expires_at) values(member.id,p_token_hash,p_expires_at);
  insert into dealer_network_private.member_locations(member_id,geocode_status) values(member.id,'pending');
  insert into public.dealer_network_member_brands(member_id,brand_id,relationship_type,approval_status,decided_at)
    select member.id,brand_id,relationship_type,'approved',now() from public.dealer_network_application_brands where application_id=application.id;
  update public.dealer_network_applications set status='approved',review_message=null,reviewed_at=now(),approved_at=now(),denied_at=null,updated_at=now() where id=application.id;
  insert into public.dealer_network_status_events(application_id,member_id,event_type,from_value,to_value,actor_type)
    values(application.id,member.id,'application_status',application.status,'approved','admin');
  return jsonb_build_object('memberId',member.id,'changed',true);
end $$;

create function public.dealer_network_replace_activation_token(p_member_id uuid, p_token_hash text, p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
begin
  if not exists(select 1 from public.dealer_network_members where id=p_member_id and status='pending_activation') then raise exception 'member_not_pending'; end if;
  update dealer_network_private.activation_tokens set revoked_at=now() where member_id=p_member_id and used_at is null and revoked_at is null;
  insert into dealer_network_private.activation_tokens(member_id,token_hash,expires_at) values(p_member_id,p_token_hash,p_expires_at);
end $$;

create function public.dealer_network_activate_member(p_token_hash text, p_pin_hash text, p_pin_salt text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare token dealer_network_private.activation_tokens; member_status text;
begin
  select * into token from dealer_network_private.activation_tokens where token_hash=p_token_hash for update;
  if not found or token.used_at is not null or token.revoked_at is not null or token.expires_at<=now() then raise exception 'invalid_token'; end if;
  select status into member_status from public.dealer_network_members where id=token.member_id for update;
  if member_status <> 'pending_activation' then raise exception 'invalid_member_state'; end if;
  update dealer_network_private.credentials set pin_hash=p_pin_hash,pin_salt=p_pin_salt,email_verified_at=now(),failed_attempts=0,last_failed_at=null,auth_locked_until=null,pin_changed_at=now(),updated_at=now() where member_id=token.member_id;
  update dealer_network_private.activation_tokens set used_at=now() where id=token.id;
  update public.dealer_network_members set status='active',activated_at=now(),updated_at=now() where id=token.member_id;
  insert into public.dealer_network_status_events(member_id,event_type,from_value,to_value,actor_type) values(token.member_id,'member_status','pending_activation','active','member');
  return token.member_id;
end $$;

create function public.dealer_network_auth_lookup(p_normalized_phone text)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
  select jsonb_build_object('memberId',m.id,'status',m.status,'accountLocked',m.account_locked,'pinHash',c.pin_hash,'pinSalt',c.pin_salt,'failedAttempts',c.failed_attempts,'authLockedUntil',c.auth_locked_until,'email',m.email,'normalizedEmail',m.normalized_email,'emailVerifiedAt',c.email_verified_at)
  from public.dealer_network_members m join dealer_network_private.credentials c on c.member_id=m.id where m.normalized_phone=p_normalized_phone
$$;

create function public.dealer_network_record_login_failure(p_member_id uuid)
returns timestamptz language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare failures integer; lock_until timestamptz;
begin
  update dealer_network_private.credentials set
    failed_attempts=case when last_failed_at is null or last_failed_at<now()-interval '15 minutes' then 1 else failed_attempts+1 end,
    last_failed_at=now(),updated_at=now()
  where member_id=p_member_id returning failed_attempts into failures;
  if failures>=5 then
    lock_until:=now()+interval '15 minutes';
    update dealer_network_private.credentials set auth_locked_until=lock_until where member_id=p_member_id;
  end if;
  return lock_until;
end $$;

create function public.dealer_network_clear_login_failures(p_member_id uuid)
returns void language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  update dealer_network_private.credentials set failed_attempts=0,last_failed_at=null,auth_locked_until=null,updated_at=now() where member_id=p_member_id
$$;

create function public.dealer_network_create_session(p_member_id uuid, p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare session_id uuid;
begin
  if not exists(select 1 from public.dealer_network_members where id=p_member_id and status in ('active','suspended')) then raise exception 'member_not_eligible'; end if;
  insert into dealer_network_private.sessions(member_id,token_hash,expires_at) values(p_member_id,p_token_hash,p_expires_at) returning id into session_id;
  update public.dealer_network_members set last_login_at=now(),updated_at=now() where id=p_member_id;
  return session_id;
end $$;

create function public.dealer_network_read_session(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare result jsonb; session_id uuid;
begin
  select s.id,jsonb_build_object('memberId',m.id,'memberName',m.member_name,'companyName',m.company_name,'status',m.status,'accountLocked',m.account_locked,'expiresAt',s.expires_at)
  into session_id,result from dealer_network_private.sessions s join public.dealer_network_members m on m.id=s.member_id
  where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>now();
  if session_id is not null then update dealer_network_private.sessions set last_seen_at=now() where id=session_id; end if;
  return result;
end $$;

create function public.dealer_network_revoke_session(p_token_hash text)
returns void language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  update dealer_network_private.sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=p_token_hash
$$;

create function public.dealer_network_revoke_member_sessions(p_member_id uuid)
returns void language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  update dealer_network_private.sessions set revoked_at=coalesce(revoked_at,now()) where member_id=p_member_id and revoked_at is null
$$;

create function public.dealer_network_pin_reset_target(p_normalized_phone text, p_normalized_email text)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
  select jsonb_build_object('memberId',m.id,'memberName',m.member_name,'email',m.email)
  from public.dealer_network_members m join dealer_network_private.credentials c on c.member_id=m.id
  where m.normalized_phone=p_normalized_phone and m.normalized_email=p_normalized_email and m.status in ('active','suspended') and c.email_verified_at is not null
$$;

create function public.dealer_network_set_pin_reset_token(p_member_id uuid, p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security invoker set search_path=pg_catalog,dealer_network_private as $$
declare token_id uuid;
begin
  update dealer_network_private.pin_reset_tokens set revoked_at=now() where member_id=p_member_id and used_at is null and revoked_at is null;
  insert into dealer_network_private.pin_reset_tokens(member_id,token_hash,expires_at) values(p_member_id,p_token_hash,p_expires_at) returning id into token_id;
  return token_id;
end $$;

create function public.dealer_network_reset_pin(p_token_hash text, p_pin_hash text, p_pin_salt text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,dealer_network_private as $$
declare token dealer_network_private.pin_reset_tokens;
begin
  select * into token from dealer_network_private.pin_reset_tokens where token_hash=p_token_hash for update;
  if not found or token.used_at is not null or token.revoked_at is not null or token.expires_at<=now() then raise exception 'invalid_token'; end if;
  update dealer_network_private.credentials set pin_hash=p_pin_hash,pin_salt=p_pin_salt,failed_attempts=0,last_failed_at=null,auth_locked_until=null,pin_changed_at=now(),updated_at=now() where member_id=token.member_id;
  update dealer_network_private.pin_reset_tokens set used_at=now() where id=token.id;
  update dealer_network_private.sessions set revoked_at=coalesce(revoked_at,now()) where member_id=token.member_id and revoked_at is null;
  return token.member_id;
end $$;

create function public.dealer_network_member_security(p_member_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  select jsonb_build_object('pinHash',pin_hash,'pinSalt',pin_salt,'emailVerifiedAt',email_verified_at,'failedAttempts',failed_attempts,'authLockedUntil',auth_locked_until) from dealer_network_private.credentials where member_id=p_member_id
$$;

create function public.dealer_network_mark_email_verified(p_member_id uuid)
returns void language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  update dealer_network_private.credentials set email_verified_at=now(),updated_at=now() where member_id=p_member_id
$$;

create function public.dealer_network_set_location(p_member_id uuid, p_status text, p_latitude double precision, p_longitude double precision, p_provider text, p_error text)
returns void language plpgsql security invoker set search_path=pg_catalog,dealer_network_private as $$
begin
  if p_status not in ('pending','succeeded','failed','stale') then raise exception 'invalid_location_status'; end if;
  insert into dealer_network_private.member_locations(member_id,latitude,longitude,geocode_status,provider,last_error,attempted_at,geocoded_at,updated_at)
  values(p_member_id,p_latitude,p_longitude,p_status,p_provider,left(p_error,100),now(),case when p_status='succeeded' then now() else null end,now())
  on conflict(member_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,geocode_status=excluded.geocode_status,provider=excluded.provider,last_error=excluded.last_error,attempted_at=excluded.attempted_at,geocoded_at=excluded.geocoded_at,updated_at=now();
end $$;

create function public.dealer_network_directory_rows()
returns jsonb language sql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'memberName',m.member_name,'companyName',m.company_name,'phone',m.phone,'email',m.email,'city',m.city,'state',m.state,'zipCode',m.zip_code,
    'websiteUrl',m.website_url,'role',m.role,'experience',m.experience,'serviceRegion',m.service_region,'introduction',m.introduction,'logoPath',m.logo_path,
    'latitude',l.latitude,'longitude',l.longitude,'geocodeStatus',l.geocode_status,
    'brands',coalesce((select jsonb_agg(jsonb_build_object('id',mb.id,'brandId',b.id,'brandName',b.name,'relationshipType',mb.relationship_type) order by b.sort_order,b.name) from public.dealer_network_member_brands mb join public.dealer_network_brands b on b.id=mb.brand_id where mb.member_id=m.id and mb.approval_status='approved'),'[]'::jsonb)
  ) order by m.company_name,m.member_name),'[]'::jsonb)
  from public.dealer_network_members m left join dealer_network_private.member_locations l on l.member_id=m.id
  where m.status='active' and m.account_locked=false
$$;

create function public.dealer_network_claim_notification(p_event_key text, p_event_type text, p_application_id uuid, p_member_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare event public.dealer_network_notification_events;
begin
  insert into public.dealer_network_notification_events(event_key,event_type,application_id,member_id)
  values(p_event_key,p_event_type,p_application_id,p_member_id) on conflict(event_key) do nothing returning * into event;
  if found then return jsonb_build_object('claimed',true,'eventId',event.id,'claimedAt',event.claimed_at); end if;
  select * into event from public.dealer_network_notification_events where event_key=p_event_key for update;
  if event.event_type<>p_event_type or event.application_id is distinct from p_application_id or event.member_id is distinct from p_member_id then raise exception 'notification_conflict'; end if;
  if event.status='failed' or (event.status='pending' and event.claimed_at<=now()-interval '10 minutes') then
    update public.dealer_network_notification_events set status='pending',attempt_count=attempt_count+1,claimed_at=now(),last_error=null,updated_at=now() where id=event.id returning * into event;
    return jsonb_build_object('claimed',true,'eventId',event.id,'claimedAt',event.claimed_at);
  end if;
  return jsonb_build_object('claimed',false,'eventId',event.id,'claimedAt',event.claimed_at);
end $$;

create function public.dealer_network_finish_notification(p_event_id uuid, p_claimed_at timestamptz, p_status text, p_error text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_status not in ('sent','failed') then raise exception 'invalid_notification_status'; end if;
  update public.dealer_network_notification_events set status=p_status,sent_at=case when p_status='sent' then now() else null end,last_error=case when p_status='failed' then left(coalesce(p_error,'SEND_FAILED'),100) else null end,updated_at=now()
  where id=p_event_id and status='pending' and claimed_at=p_claimed_at;
  if not found then raise exception 'stale_notification_claim'; end if;
end $$;

create function public.dealer_network_admin_security(p_member_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,dealer_network_private as $$
  select jsonb_build_object('emailVerifiedAt',c.email_verified_at,'failedAttempts',c.failed_attempts,'temporaryLockUntil',c.auth_locked_until,'activeSessionCount',(select count(*) from dealer_network_private.sessions s where s.member_id=c.member_id and s.revoked_at is null and s.expires_at>now()),'geocodeStatus',l.geocode_status,'geocodedAt',l.geocoded_at,'geocodeError',l.last_error)
  from dealer_network_private.credentials c left join dealer_network_private.member_locations l on l.member_id=c.member_id where c.member_id=p_member_id
$$;

revoke all on function public.dealer_network_consume_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.dealer_network_create_application(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_transition_application(uuid,text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_approve_application(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dealer_network_replace_activation_token(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dealer_network_activate_member(text,text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_auth_lookup(text) from public,anon,authenticated;
revoke all on function public.dealer_network_record_login_failure(uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_clear_login_failures(uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_create_session(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dealer_network_read_session(text) from public,anon,authenticated;
revoke all on function public.dealer_network_revoke_session(text) from public,anon,authenticated;
revoke all on function public.dealer_network_revoke_member_sessions(uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_pin_reset_target(text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_set_pin_reset_token(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dealer_network_reset_pin(text,text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_member_security(uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_mark_email_verified(uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_set_location(uuid,text,double precision,double precision,text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_directory_rows() from public,anon,authenticated;
revoke all on function public.dealer_network_claim_notification(text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_finish_notification(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.dealer_network_admin_security(uuid) from public,anon,authenticated;

grant execute on function public.dealer_network_consume_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.dealer_network_create_application(jsonb,uuid) to service_role;
grant execute on function public.dealer_network_transition_application(uuid,text,text) to service_role;
grant execute on function public.dealer_network_approve_application(uuid,text,timestamptz) to service_role;
grant execute on function public.dealer_network_replace_activation_token(uuid,text,timestamptz) to service_role;
grant execute on function public.dealer_network_activate_member(text,text,text) to service_role;
grant execute on function public.dealer_network_auth_lookup(text) to service_role;
grant execute on function public.dealer_network_record_login_failure(uuid) to service_role;
grant execute on function public.dealer_network_clear_login_failures(uuid) to service_role;
grant execute on function public.dealer_network_create_session(uuid,text,timestamptz) to service_role;
grant execute on function public.dealer_network_read_session(text) to service_role;
grant execute on function public.dealer_network_revoke_session(text) to service_role;
grant execute on function public.dealer_network_revoke_member_sessions(uuid) to service_role;
grant execute on function public.dealer_network_pin_reset_target(text,text) to service_role;
grant execute on function public.dealer_network_set_pin_reset_token(uuid,text,timestamptz) to service_role;
grant execute on function public.dealer_network_reset_pin(text,text,text) to service_role;
grant execute on function public.dealer_network_member_security(uuid) to service_role;
grant execute on function public.dealer_network_mark_email_verified(uuid) to service_role;
grant execute on function public.dealer_network_set_location(uuid,text,double precision,double precision,text,text) to service_role;
grant execute on function public.dealer_network_directory_rows() to service_role;
grant execute on function public.dealer_network_claim_notification(text,text,uuid,uuid) to service_role;
grant execute on function public.dealer_network_finish_notification(uuid,timestamptz,text,text) to service_role;
grant execute on function public.dealer_network_admin_security(uuid) to service_role;

commit;
