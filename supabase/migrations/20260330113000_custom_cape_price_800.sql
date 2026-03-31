begin;

alter table if exists public.commerce_custom_cape_exports
  alter column cost_bb set default 800;

create or replace function public.commerce_finalize_custom_cape_export(
  p_design_id uuid,
  p_final_asset_path text,
  p_final_asset_url text,
  p_idempotency_key text
)
returns table (
  design_id uuid,
  charged_bb integer,
  new_balance_bb integer,
  final_asset_url text,
  generated_cape_id uuid,
  exported_at timestamptz,
  transaction_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_design public.commerce_custom_cape_designs;
  v_export public.commerce_custom_cape_exports;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_final_path text := btrim(coalesce(p_final_asset_path, ''));
  v_final_url text := btrim(coalesce(p_final_asset_url, ''));
  v_wallet_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
  v_generated_cape_id uuid;
  v_slug text;
  v_display_name text;
  v_exported_at timestamptz := timezone('utc', now());
  v_cost_bb integer := 800;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_design_id is null then
    raise exception 'design_id_required';
  end if;
  if v_key = '' then
    raise exception 'idempotency_key_required';
  end if;
  if v_final_path = '' or v_final_url = '' then
    raise exception 'final_asset_required';
  end if;

  select * into v_export
  from public.commerce_custom_cape_exports
  where user_id = v_user_id
    and idempotency_key = v_key
  limit 1;

  if found then
    select d.* into v_design
    from public.commerce_custom_cape_designs d
    where d.id = v_export.design_id
      and d.user_id = v_user_id
    limit 1;

    return query
    select
      v_export.design_id,
      0,
      coalesce((select w.balance_bb from public.commerce_wallets w where w.user_id = v_user_id), 0),
      coalesce(v_design.final_asset_url, v_export.final_texture_url, v_final_url),
      v_design.generated_cape_id,
      coalesce(v_export.exported_at, v_export.created_at),
      v_export.transaction_status;
    return;
  end if;

  select * into v_design
  from public.commerce_custom_cape_designs
  where id = p_design_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'design_not_found';
  end if;

  if coalesce(v_design.source_image_path, '') = '' then
    raise exception 'draft_source_missing';
  end if;

  if v_design.purchased then
    insert into public.commerce_custom_cape_exports(
      design_id,
      user_id,
      cost_bb,
      idempotency_key,
      transaction_status,
      wallet_ledger_id,
      final_texture_url,
      exported_at
    )
    values (
      v_design.id,
      v_user_id,
      0,
      v_key,
      'already_purchased',
      null,
      coalesce(v_design.final_asset_url, v_final_url),
      timezone('utc', now())
    )
    returning * into v_export;

    return query
    select
      v_design.id,
      0,
      coalesce((select w.balance_bb from public.commerce_wallets w where w.user_id = v_user_id), 0),
      coalesce(v_design.final_asset_url, v_final_url),
      v_design.generated_cape_id,
      v_export.exported_at,
      v_export.transaction_status;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_balance < v_cost_bb then
    raise exception 'insufficient_balance';
  end if;

  update public.commerce_wallets
  set
    balance_bb = balance_bb - v_cost_bb,
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
    metadata
  )
  values (
    v_user_id,
    'custom_cape_export',
    -v_cost_bb,
    v_new_balance,
    'custom_cape_design',
    v_design.id::text,
    jsonb_build_object(
      'idempotency_key', v_key,
      'design_id', v_design.id::text,
      'final_asset_path', v_final_path
    )
  )
  returning id into v_ledger_id;

  v_generated_cape_id := v_design.generated_cape_id;
  if v_generated_cape_id is null then
    v_slug := lower(format(
      'custom-%s-%s',
      replace(v_user_id::text, '-', ''),
      substring(replace(v_design.id::text, '-', '') from 1 for 8)
    ));
    select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Custom Cape')
    into v_display_name
    from public.commerce_profiles p
    where p.user_id = v_user_id
    limit 1;

    insert into public.commerce_capes(
      slug,
      name,
      description,
      texture_url,
      preview_url,
      price_bb,
      rarity,
      rarity_label,
      rarity_color_start,
      rarity_color_end,
      rarity_glow,
      sort_order,
      is_active,
      is_featured,
      created_by
    )
    values (
      v_slug,
      coalesce(v_display_name, 'Custom Cape'),
      'User generated custom cape',
      v_final_url,
      null,
      0,
      'custom',
      'Custom',
      '#8f58ff',
      '#2f1f53',
      'rgba(143, 88, 255, 0.35)',
      9999,
      false,
      false,
      v_user_id
    )
    returning id into v_generated_cape_id;

    insert into public.commerce_cape_entitlements(user_id, cape_id, source, metadata)
    values (
      v_user_id,
      v_generated_cape_id,
      'custom_export',
      jsonb_build_object('design_id', v_design.id::text)
    )
    on conflict (user_id, cape_id) do nothing;
  else
    update public.commerce_capes c
    set
      texture_url = v_final_url,
      updated_at = timezone('utc', now())
    where c.id = v_generated_cape_id;
  end if;

  insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
  values (v_user_id, v_generated_cape_id, timezone('utc', now()))
  on conflict (user_id) do update
  set
    equipped_cape_id = excluded.equipped_cape_id,
    updated_at = excluded.updated_at;

  update public.commerce_custom_cape_designs d
  set
    purchased = true,
    preview_watermarked = false,
    final_asset_path = v_final_path,
    final_asset_url = v_final_url,
    generated_cape_id = v_generated_cape_id,
    updated_at = timezone('utc', now())
  where d.id = v_design.id
  returning * into v_design;

  insert into public.commerce_custom_cape_exports(
    design_id,
    user_id,
    cost_bb,
    idempotency_key,
    transaction_status,
    wallet_ledger_id,
    final_texture_url,
    exported_at
  )
  values (
    v_design.id,
    v_user_id,
    v_cost_bb,
    v_key,
    'completed',
    v_ledger_id,
    v_final_url,
    v_exported_at
  )
  returning * into v_export;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select
    v_design.id,
    v_cost_bb,
    v_new_balance,
    v_design.final_asset_url,
    v_generated_cape_id,
    v_export.exported_at,
    v_export.transaction_status;
end;
$$;

commit;
