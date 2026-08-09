-- Allow Admin-managed Aftermarket items to opt into IDS checkout through the
-- existing show_in_builder flag. Manufacturer links continue to use the
-- external action fields and are never treated as builder actions.
alter table public.catalog_options
  drop constraint if exists catalog_options_aftermarket_builder_check;

alter table public.catalog_options
  add constraint catalog_options_aftermarket_builder_check
  check (
    accessory_tab <> 'aftermarket'
    or accessory_action_type <> 'builder'
  );

-- This is an internal parent for Aftermarket catalog_options. It must be
-- active for server-side checkout eligibility while remaining absent from the
-- explicit public equipment-card allowlist.
update public.catalog_products
set public_status = 'active',
    updated_at = now()
where slug = 'ids-aftermarket';

do $$
begin
  if not exists (
    select 1
    from public.catalog_products
    where slug = 'ids-aftermarket'
      and public_status = 'active'
  ) then
    raise exception 'Required active Aftermarket parent product is missing: ids-aftermarket';
  end if;
end
$$;
