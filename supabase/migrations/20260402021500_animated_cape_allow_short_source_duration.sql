create or replace function public.commerce_create_animated_cape_order(
  p_upload_media_id uuid,
  p_selected_fps integer,
  p_selected_duration_seconds integer,
  p_idempotency_key text,
  p_crop_x numeric default null,
  p_crop_y numeric default null,
  p_crop_w numeric default null,
  p_crop_h numeric default null
)
returns table (
  order_id uuid,
  status text,
  cost_bloom_bucks bigint,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_upload public.commerce_uploaded_media;
  v_existing public.commerce_animated_cape_orders;
  v_cost bigint;
  v_wallet_balance integer;
  v_new_balance integer;
  v_order public.commerce_animated_cape_orders;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_upload_media_id is null then
    raise exception 'upload_media_required';
  end if;
  if v_key = '' then
    raise exception 'idempotency_key_required';
  end if;

  select *
  into v_existing
  from public.commerce_animated_cape_orders o
  where o.user_id = v_user_id
    and o.idempotency_key = v_key
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.status,
      v_existing.cost_bloom_bucks,
      coalesce((select w.balance_bb::bigint from public.commerce_wallets w where w.user_id = v_user_id), 0);
    return;
  end if;

  select *
  into v_upload
  from public.commerce_uploaded_media u
  where u.id = p_upload_media_id
    and u.user_id = v_user_id
  for update;

  if not found then
    raise exception 'upload_not_found';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'animated-cape-uploads'
      and so.name = v_upload.storage_path
  ) then
    raise exception 'source_media_missing';
  end if;

  -- Do not reject short sources. Worker will process available source duration only.
  v_cost := public.commerce_resolve_animated_cape_price(p_selected_fps, p_selected_duration_seconds);

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_balance < v_cost then
    raise exception 'insufficient_balance';
  end if;

  update public.commerce_wallets
  set
    balance_bb = balance_bb - v_cost::integer,
    updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning balance_bb into v_new_balance;

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
    'debit',
    -(v_cost::integer),
    v_new_balance,
    'animated_cape_order',
    p_upload_media_id::text,
    format('animated-order:%s:%s', v_user_id::text, v_key),
    jsonb_build_object(
      'selected_fps', p_selected_fps,
      'selected_duration_seconds', p_selected_duration_seconds,
      'upload_media_id', p_upload_media_id::text
    )
  );

  insert into public.commerce_animated_cape_orders(
    user_id,
    upload_media_id,
    source_type,
    source_storage_path,
    selected_fps,
    selected_duration_seconds,
    cost_bloom_bucks,
    status,
    idempotency_key,
    crop_x,
    crop_y,
    crop_w,
    crop_h
  )
  values (
    v_user_id,
    v_upload.id,
    v_upload.media_type,
    v_upload.storage_path,
    p_selected_fps,
    p_selected_duration_seconds,
    v_cost,
    'queued',
    v_key,
    p_crop_x,
    p_crop_y,
    p_crop_w,
    p_crop_h
  )
  returning * into v_order;

  insert into public.commerce_media_jobs(
    job_type,
    order_id,
    status,
    payload
  )
  values (
    'animated_cape',
    v_order.id,
    'queued',
    jsonb_build_object(
      'order_id', v_order.id::text,
      'upload_media_id', v_upload.id::text,
      'source_storage_path', v_upload.storage_path
    )
  );

  return query
  select
    v_order.id,
    v_order.status,
    v_order.cost_bloom_bucks,
    v_new_balance::bigint;
end;
$$;
