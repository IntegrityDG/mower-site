begin;

alter table public.homepage_sales_specials
  drop constraint if exists homepage_sales_specials_id_check;

alter table public.homepage_sales_specials
  add constraint homepage_sales_specials_id_check
  check (id in ('homepage', 'homepage-secondary'));

insert into public.homepage_sales_specials (id, enabled, cartoon_key, headline, description)
values (
  'homepage-secondary',
  false,
  'none',
  'Promotion headline',
  'Promotion details will appear here when this feature is enabled.'
)
on conflict (id) do nothing;

commit;
