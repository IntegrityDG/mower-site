create table public.checkout_payment_method_settings (
  payment_method text primary key
    check (payment_method in ('card', 'ach_debit', 'hearth_financing')),
  enabled boolean not null,
  updated_at timestamptz not null default now()
);

alter table public.checkout_payment_method_settings enable row level security;

revoke all on table public.checkout_payment_method_settings from anon, authenticated;
grant select, update on table public.checkout_payment_method_settings to service_role;

insert into public.checkout_payment_method_settings (payment_method, enabled)
values
  ('card', true),
  ('ach_debit', false),
  ('hearth_financing', true);

comment on table public.checkout_payment_method_settings is
  'Private server-managed switches for new customer checkout and financing choices.';
