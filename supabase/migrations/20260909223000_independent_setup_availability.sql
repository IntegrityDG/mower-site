begin;

-- Installation and Setup are independent Master Admin controls. A setup-only
-- job must not depend on Installation availability, while a combined public
-- request must satisfy both controls.
create or replace function public.ids_service_guard_new_availability() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_schema='public' and tg_table_name='installations' then
    if new.installation_selected then
      perform public.ids_service_require_availability('professional_installation');
    end if;
    if new.setup_selected then
      perform public.ids_service_require_availability('professional_setup');
    end if;
  elsif tg_table_schema='public' and tg_table_name='remote_support_subscriptions' then
    perform public.ids_service_require_availability('new_remote_support_subscriptions');
  elsif tg_table_schema='public' and tg_table_name='service_cases' then
    if new.kind='included_support' then
      perform public.ids_service_require_availability('existing_subscriber_assistance');
    elsif new.kind='remote_service' then
      perform public.ids_service_require_availability('paid_remote_service');
    elsif new.kind='onsite_service' then
      perform public.ids_service_require_availability('onsite_service');
    end if;
  elsif tg_table_schema='checkout_private' and tg_table_name='orders'
    and not (old.pricing_snapshot ? 'optionalServices') and new.pricing_snapshot ? 'optionalServices' then
    if coalesce((new.pricing_snapshot->'optionalServices'->>'install')::boolean,false) then
      perform public.ids_service_require_availability('professional_installation');
    end if;
    if coalesce((new.pricing_snapshot->'optionalServices'->>'setup')::boolean,false) then
      perform public.ids_service_require_availability('professional_setup');
    end if;
    if coalesce((new.pricing_snapshot->'optionalServices'->>'remoteSupport')::boolean,false) then
      perform public.ids_service_require_availability('new_remote_support_subscriptions');
    end if;
  end if;
  return new;
end; $$;

revoke all on function public.ids_service_guard_new_availability() from public,anon,authenticated;
grant execute on function public.ids_service_guard_new_availability() to service_role;

commit;
