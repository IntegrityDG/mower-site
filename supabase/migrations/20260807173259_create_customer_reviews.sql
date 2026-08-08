create type public.review_status as enum ('pending', 'approved', 'rejected', 'hidden');
create type public.review_product as enum ('Lymow One Plus','Yarbo','Yarbo Pro','Pandag G1','Equipment Demonstration','Installation or Deployment','Repair or Technical Support','Other');

create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 100),
  last_initial text generated always as (upper(left(last_name, 1)) || '.') stored,
  state text not null check (char_length(state) between 2 and 40),
  email text not null check (char_length(email) <= 254),
  product public.review_product not null,
  other_description text check (char_length(other_description) <= 120),
  ease_rating smallint not null check (ease_rating between 1 and 5),
  speed_rating smallint not null check (speed_rating between 1 and 5),
  price_rating smallint not null check (price_rating between 1 and 5),
  support_rating smallint check (support_rating between 1 and 5),
  overall_rating numeric generated always as (
    case when support_rating is null then (ease_rating + speed_rating + price_rating)::numeric / 3
    else (ease_rating + speed_rating + price_rating + support_rating)::numeric / 4 end
  ) stored,
  written_review text not null check (char_length(written_review) between 1 and 1000),
  publishing_consent boolean not null check (publishing_consent),
  contact_consent boolean not null default false,
  status public.review_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  moderated_at timestamptz,
  ids_response text check (char_length(ids_response) <= 2000),
  ids_response_at timestamptz,
  submission_fingerprint text,
  constraint other_description_required check (product <> 'Other' or nullif(btrim(other_description), '') is not null),
  constraint approved_has_publication check (status not in ('approved','hidden') or published_at is not null)
);

create index customer_reviews_public_idx on public.customer_reviews (published_at desc) where status = 'approved';
create index customer_reviews_public_product_idx on public.customer_reviews (product, published_at desc) where status = 'approved';
create index customer_reviews_public_state_idx on public.customer_reviews (state, published_at desc) where status = 'approved';
create index customer_reviews_public_overall_idx on public.customer_reviews (overall_rating, published_at desc) where status = 'approved';
create index customer_reviews_public_ease_idx on public.customer_reviews (ease_rating, published_at desc) where status = 'approved';
create index customer_reviews_public_speed_idx on public.customer_reviews (speed_rating, published_at desc) where status = 'approved';
create index customer_reviews_public_price_idx on public.customer_reviews (price_rating, published_at desc) where status = 'approved';
create index customer_reviews_public_support_idx on public.customer_reviews (support_rating, published_at desc) where status = 'approved' and support_rating is not null;
create index customer_reviews_admin_idx on public.customer_reviews (status, submitted_at desc);
create index customer_reviews_fingerprint_idx on public.customer_reviews (submission_fingerprint, submitted_at desc);
alter table public.customer_reviews enable row level security;

create table public.customer_review_rate_events (
  fingerprint text not null,
  submitted_at timestamptz not null default now()
);
create index customer_review_rate_events_lookup_idx
  on public.customer_review_rate_events (fingerprint, submitted_at desc);
alter table public.customer_review_rate_events enable row level security;

create function public.review_consume_submission_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  delete from public.customer_review_rate_events
    where fingerprint = p_fingerprint
      and submitted_at < now() - interval '1 hour';
  if (select count(*) from public.customer_review_rate_events where fingerprint = p_fingerprint) >= 3 then
    return false;
  end if;
  insert into public.customer_review_rate_events (fingerprint) values (p_fingerprint);
  return true;
end;
$$;

-- Raw rows are server-only. No anon/authenticated policy exists, so private fields
-- cannot be queried through the Data API. Public routes use an explicit server projection.
revoke all on table public.customer_reviews from public, anon, authenticated;
grant select, insert, update on table public.customer_reviews to service_role;
revoke all on table public.customer_review_rate_events from public, anon, authenticated;
grant select, insert, delete on table public.customer_review_rate_events to service_role;
revoke all on function public.review_consume_submission_rate_limit(text) from public, anon, authenticated;
grant execute on function public.review_consume_submission_rate_limit(text) to service_role;
