begin;

-- PostgREST exposes public RPCs, but scheduling_private and checkout_private
-- intentionally remain outside the Data API schema list. These read models keep
-- private tables behind the service-role server boundary without exposing either
-- private schema or granting browser roles access to their tables.
create function public.scheduling_read_demo_portal(p_token_hash text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  portal jsonb;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash';
  end if;

  select pg_catalog.jsonb_build_object(
    'customerName',request_row.customer_name,
    'propertyAddress',request_row.property_address,
    'requestedStartAt',request_row.requested_start_at,
    'equipmentInterest',request_row.equipment_interest,
    'status',request_row.status,
    'paymentStatus',request_row.payment_status,
    'amountPaidCents',coalesce(payment.paid_cents,0),
    'amountRefundedCents',coalesce(payment.refunded_cents,0),
    'demoFormat',request_row.demo_format,
    'guestArrivalAt',case
      when request_row.demo_format='party' and party.request_id is not null
        then request_row.requested_start_at+pg_catalog.make_interval(mins=>party.guest_arrival_offset_minutes)
      else null
    end,
    'guestListLocked',coalesce(party.guest_list_locked,false),
    'guests',case when request_row.demo_format='party' then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',guest.id,
        'fullName',guest.full_name,
        'email',guest.email,
        'phone',guest.phone,
        'qualificationStatus',guest.qualification_status
      ) order by guest.registered_at,guest.id)
      from scheduling_private.demo_party_guests guest
      where guest.request_id=request_row.id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'benefits',pg_catalog.jsonb_build_object(
      'qualifyingGuests',case when request_row.demo_format='party' then least(5,(
        select count(*)
        from scheduling_private.demo_party_guests guest
        where guest.request_id=request_row.id and guest.qualification_status='qualifying'
      )) else 0 end,
      'feeRefundCents',case when request_row.demo_format='party' then coalesce((
        select ledger.earned_cents
        from scheduling_private.demo_party_benefit_ledger ledger
        where ledger.request_id=request_row.id and ledger.benefit_type='demo_fee_refund'
        order by ledger.updated_at desc,ledger.id
        limit 1
      ),0) else 0 end,
      'baseMachineDiscountCents',case when request_row.demo_format='party' then coalesce((
        select ledger.earned_cents
        from scheduling_private.demo_party_benefit_ledger ledger
        where ledger.request_id=request_row.id and ledger.benefit_type='base_machine_discount'
        order by ledger.updated_at desc,ledger.id
        limit 1
      ),0) else 0 end
    ),
    'benefitCheckoutUrl',redemption.checkout_url
  ) into portal
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request_row on request_row.id=token.request_id
  left join scheduling_private.demo_payments payment on payment.request_id=request_row.id
  left join scheduling_private.demo_parties party on party.request_id=request_row.id
  left join lateral (
    select benefit.checkout_url
    from scheduling_private.demo_party_benefit_redemptions benefit
    where benefit.request_id=request_row.id
      and benefit.state='reserved'
      and benefit.checkout_url is not null
      and benefit.checkout_expires_at>pg_catalog.now()
    order by benefit.updated_at desc,benefit.id
    limit 1
  ) redemption on true
  where token.token_hash=p_token_hash
    and token.purpose='host_manage'
    and token.revoked_at is null;

  return portal;
end
$$;

create function public.scheduling_read_demo_payment(p_lookup_kind text,p_stripe_id text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  payment jsonb;
begin
  if p_lookup_kind is null or p_lookup_kind not in ('checkout_session','payment_intent') then
    raise exception 'invalid_payment_lookup_kind';
  end if;
  if p_stripe_id is null or char_length(p_stripe_id) not between 1 and 255 then
    raise exception 'invalid_stripe_id';
  end if;

  select pg_catalog.jsonb_build_object(
    'appointmentId',payment_row.request_id,
    'stripeCheckoutSessionId',payment_row.stripe_checkout_session_id,
    'stripePaymentIntentId',payment_row.stripe_payment_intent_id,
    'amountCents',payment_row.amount_cents,
    'currency',payment_row.currency
  ) into payment
  from scheduling_private.demo_payments payment_row
  where (p_lookup_kind='checkout_session' and payment_row.stripe_checkout_session_id=p_stripe_id)
     or (p_lookup_kind='payment_intent' and payment_row.stripe_payment_intent_id=p_stripe_id);

  return payment;
end
$$;

create function public.scheduling_read_admin_demo_party(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  appointment jsonb;
begin
  if p_request_id is null then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'requested_start_at',request_row.requested_start_at,
    'status',request_row.status,
    'payment_status',request_row.payment_status
  ) into appointment
  from public.demo_requests request_row
  where request_row.id=p_request_id;

  if appointment is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'appointment',appointment,
    'party',(
      select pg_catalog.jsonb_build_object(
        'property_relationship',party.property_relationship,
        'property_type',party.property_type,
        'mowable_acreage',party.mowable_acreage,
        'actively_considering_purchase',party.actively_considering_purchase,
        'purchase_timeframe',party.purchase_timeframe,
        'equipment_budget',party.equipment_budget,
        'property_authorization_certified',party.property_authorization_certified,
        'guest_arrival_offset_minutes',party.guest_arrival_offset_minutes,
        'guest_list_locked',party.guest_list_locked,
        'food_support_status',party.food_support_status,
        'food_notes',party.food_notes,
        'food_budget_cents',party.food_budget_cents
      )
      from scheduling_private.demo_parties party
      where party.request_id=p_request_id
    ),
    'payment',(
      select pg_catalog.jsonb_build_object(
        'status',payment.status,
        'stripe_checkout_session_id',payment.stripe_checkout_session_id,
        'stripe_payment_intent_id',payment.stripe_payment_intent_id,
        'paid_cents',payment.paid_cents,
        'refunded_cents',payment.refunded_cents
      )
      from scheduling_private.demo_payments payment
      where payment.request_id=p_request_id
    ),
    'guests',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',guest.id,
        'full_name',guest.full_name,
        'email',guest.email,
        'phone',guest.phone,
        'referral_identifier',guest.referral_identifier,
        'registered_at',guest.registered_at,
        'checked_in_at',guest.checked_in_at,
        'checked_out_at',guest.checked_out_at,
        'qualification_status',guest.qualification_status,
        'follow_up_consent',guest.follow_up_consent
      ) order by guest.registered_at,guest.id)
      from scheduling_private.demo_party_guests guest
      where guest.request_id=p_request_id
    ),'[]'::jsonb),
    'benefits',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'benefit_type',ledger.benefit_type,
        'earned_cents',ledger.earned_cents,
        'consumed_cents',ledger.consumed_cents
      ) order by ledger.created_at,ledger.id)
      from scheduling_private.demo_party_benefit_ledger ledger
      where ledger.request_id=p_request_id
    ),'[]'::jsonb),
    'redemptions',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',redemption.id,
        'benefit_type',redemption.benefit_type,
        'amount_cents',redemption.amount_cents,
        'order_id',redemption.order_id,
        'checkout_attempt_id',redemption.checkout_attempt_id,
        'stripe_checkout_session_id',redemption.stripe_checkout_session_id,
        'state',redemption.state
      ) order by redemption.created_at desc,redemption.id desc)
      from scheduling_private.demo_party_benefit_redemptions redemption
      where redemption.request_id=p_request_id
    ),'[]'::jsonb),
    'referrals',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',referral.id,
        'demo_party_guest_id',referral.demo_party_guest_id,
        'status',referral.status,
        'purchase_date',referral.purchase_date,
        'return_period_ends_at',referral.return_period_ends_at,
        'base_reward_cents',referral.base_reward_cents,
        'product_name_snapshot',referral.product_name_snapshot
      ) order by referral.purchase_date desc,referral.id desc)
      from checkout_private.referrals referral
      where referral.demo_party_request_id=p_request_id
    ),'[]'::jsonb),
    'auditEvents',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_type',event.event_type,
        'actor_type',event.actor_type,
        'created_at',event.created_at
      ) order by event.created_at desc,event.id desc)
      from (
        select audit.id,audit.event_type,audit.actor_type,audit.created_at
        from scheduling_private.appointment_audit_events audit
        where audit.request_id=p_request_id
        order by audit.created_at desc,audit.id desc
        limit 100
      ) event
    ),'[]'::jsonb)
  );
end
$$;

create function public.scheduling_read_demo_referral_order(p_order_reference text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  snapshot jsonb;
begin
  if p_order_reference is null or char_length(btrim(p_order_reference)) not between 1 and 80 then
    raise exception 'invalid_order_reference';
  end if;

  select pg_catalog.jsonb_build_object(
    'product',order_row.pricing_snapshot->'product'
  ) into snapshot
  from checkout_private.orders order_row
  where order_row.public_reference=btrim(p_order_reference);

  return snapshot;
end
$$;

-- New functions receive EXECUTE for PUBLIC by default, so revoke first and
-- grant only the server-held service role used by trusted application code.
revoke all on function public.scheduling_read_demo_portal(text) from public,anon,authenticated;
revoke all on function public.scheduling_read_demo_payment(text,text) from public,anon,authenticated;
revoke all on function public.scheduling_read_admin_demo_party(uuid) from public,anon,authenticated;
revoke all on function public.scheduling_read_demo_referral_order(text) from public,anon,authenticated;

grant execute on function public.scheduling_read_demo_portal(text) to service_role;
grant execute on function public.scheduling_read_demo_payment(text,text) to service_role;
grant execute on function public.scheduling_read_admin_demo_party(uuid) to service_role;
grant execute on function public.scheduling_read_demo_referral_order(text) to service_role;

commit;
