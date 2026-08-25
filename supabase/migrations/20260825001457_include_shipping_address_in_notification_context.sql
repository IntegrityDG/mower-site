begin;

create or replace function public.checkout_notification_context(p_order_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,checkout_private as $$
  select jsonb_build_object(
    'orderId',o.id,'publicReference',o.public_reference,'orderStatus',o.order_status,'paymentStatus',o.payment_status,
    'customerName',o.customer_name,'customerEmail',o.customer_email,'customerPhone',o.customer_phone,
    'shippingAddress',o.shipping_address,
    'subtotalCents',o.subtotal_cents,'discountCents',o.discount_cents,'taxCents',o.tax_cents,
    'shippingCents',o.shipping_cents,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,
    'paymentMethod',o.payment_method_choice,'paidAt',o.paid_at,'snapshot',o.pricing_snapshot,
    'referral',case when r.id is null then null else jsonb_build_object('referrerName',r.referrer_name,'referrerEmail',r.referrer_email) end
  ) from checkout_private.orders o left join checkout_private.referrals r on r.order_id=o.id where o.id=p_order_id
$$;

revoke all on function public.checkout_notification_context(uuid) from public,anon,authenticated;
grant execute on function public.checkout_notification_context(uuid) to service_role;

commit;
