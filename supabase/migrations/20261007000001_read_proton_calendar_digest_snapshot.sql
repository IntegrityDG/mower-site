begin;

-- Retry and terminal-state decisions must not require a fresh Proton fetch.
-- This RPC exposes the existing immutable snapshot only to the server role;
-- the separate claim RPC remains the sole atomic lease/sending gate.
create function public.read_proton_calendar_digest(p_date date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'date', delivery.briefing_date,
    'from', delivery.sender,
    'to', delivery.recipient,
    'subject', delivery.subject,
    'text', delivery.body_text,
    'eventCount', delivery.event_count
  )
  from calendar_delivery_private.digest_deliveries as delivery
  where delivery.briefing_date = p_date
$$;

revoke all on function public.read_proton_calendar_digest(date) from public, anon, authenticated;
grant execute on function public.read_proton_calendar_digest(date) to service_role;

commit;
