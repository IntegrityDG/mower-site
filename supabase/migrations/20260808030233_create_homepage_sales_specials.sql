begin;

create table if not exists public.homepage_sales_specials (
  id text primary key check (id = 'homepage'),
  enabled boolean not null default false,
  cartoon_key text not null default 'none' check (cartoon_key in ('none', 'lymow', 'yarbo', 'pandag', 'all')),
  headline text not null check (char_length(btrim(headline)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_sales_specials enable row level security;
revoke all on table public.homepage_sales_specials from public, anon, authenticated;
revoke all on table public.homepage_sales_specials from service_role;
grant select, insert, update on table public.homepage_sales_specials to service_role;

insert into public.homepage_sales_specials (id, enabled, cartoon_key, headline, description)
values ('homepage', false, 'none', 'Promotion headline', 'Promotion details will appear here when this feature is enabled.')
on conflict (id) do nothing;

commit;
