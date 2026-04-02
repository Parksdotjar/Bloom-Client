create or replace function public.commerce_cancel_animated_cape_order(
  p_order_id uuid
)
returns table (
  order_id uuid,
  status text,
  refunded_amount bigint,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.commerce_animated_cape_orders;
  v_wallet_balance integer;
  v_new_balance integer;
  v_refund_key text;
  v_existing_ledger public.commerce_wallet_ledger;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  select o.*
  into v_order
  from public.commerce_animated_cape_orders o
  where o.id = p_order_id
    and o.user_id = v_user_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'completed' then
    raise exception 'completed_order_cannot_be_cancelled';
  end if;

  if v_order.status = 'processing' then
    raise exception 'processing_order_cannot_be_cancelled';
  end if;

  if v_order.status = 'refunded' then
    return query
    select
      v_order.id,
      v_order.status,
      v_order.cost_bloom_bucks,
      coalesce((select w.balance_bb::bigint from public.commerce_wallets w where w.user_id = v_user_id), 0);
    return;
  end if;

  v_refund_key := format('animated-cancel:%s', v_order.id::text);

  select l.*
  into v_existing_ledger
  from public.commerce_wallet_ledger l
  where l.idempotency_key = v_refund_key
  limit 1;

  if found then
    return query
    select
      v_order.id,
      'refunded'::text,
      v_order.cost_bloom_bucks,
      coalesce(v_existing_ledger.balance_after, 0)::bigint;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  update public.commerce_wallets w
  set
    balance_bb = w.balance_bb + v_order.cost_bloom_bucks::integer,
    updated_at = timezone('utc', now())
  where w.user_id = v_user_id
  returning w.balance_bb into v_new_balance;

  insert into public.commerce_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    v_user_id,
    'refund',
    v_order.cost_bloom_bucks::integer,
    v_new_balance,
    'purchase_refund',
    v_order.id::text,
    v_refund_key,
    jsonb_build_object(
      'order_id', v_order.id::text,
      'reason', 'cancelled_by_user'
    )
  );

  update public.commerce_animated_cape_orders o
  set
    status = 'refunded',
    refunded_at = timezone('utc', now()),
    processing_error_code = 'cancelled_by_user',
    processing_error_message = 'Cancelled by user.',
    updated_at = timezone('utc', now())
  where o.id = v_order.id
  returning o.* into v_order;

  update public.commerce_media_jobs j
  set
    status = 'failed',
    lease_expires_at = null,
    worker_id = null,
    result = coalesce(j.result, '{}'::jsonb) || jsonb_build_object('cancelled_by_user', true),
    updated_at = timezone('utc', now())
  where j.order_id = v_order.id;

  return query
  select
    v_order.id,
    v_order.status,
    v_order.cost_bloom_bucks,
    v_new_balance::bigint;
end;
$$;

grant execute on function public.commerce_cancel_animated_cape_order(uuid) to authenticated;

