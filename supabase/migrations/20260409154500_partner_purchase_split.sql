create or replace function public.purchase_cape(p_cape_slug text, p_auto_equip boolean default false)
returns table (cape_id uuid, cape_slug text, new_balance_bb integer, equipped_cape_id uuid, already_owned boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cape public.commerce_capes;
  v_balance integer;
  v_partner_user_id uuid;
  v_partner_share integer := 0;
  v_partner_balance integer;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_cape
  from public.commerce_capes
  where slug = lower(btrim(p_cape_slug)) and is_active = true
  limit 1;

  if not found then raise exception 'cape_not_found'; end if;

  if exists (
    select 1
    from public.commerce_cape_entitlements e
    where e.user_id = v_user_id and e.cape_id = v_cape.id
  ) then
    raise exception 'cape_already_owned';
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select balance_bb into v_balance
  from public.commerce_wallets
  where user_id = v_user_id
  for update;

  if v_balance < v_cape.price_bb then
    raise exception 'insufficient_balance';
  end if;

  update public.commerce_wallets
  set balance_bb = balance_bb - v_cape.price_bb,
      updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning balance_bb into v_balance;

  insert into public.commerce_cape_entitlements(user_id, cape_id, source, acquired_at, metadata)
  values (
    v_user_id,
    v_cape.id,
    'purchase',
    timezone('utc', now()),
    jsonb_build_object('cape_slug', v_cape.slug, 'price_bb', v_cape.price_bb)
  );

  insert into public.commerce_wallet_ledger(user_id, entry_type, amount_bb, balance_after, reference_type, reference_id, metadata)
  values (
    v_user_id,
    'cosmetic_purchase',
    -v_cape.price_bb,
    v_balance,
    'cape',
    v_cape.id::text,
    jsonb_build_object('cape_slug', v_cape.slug)
  );

  select m.partner_user_id
    into v_partner_user_id
  from public.commerce_partner_cape_mappings m
  where m.cape_id = v_cape.id
    and m.is_active = true
  limit 1;

  if v_partner_user_id is not null then
    v_partner_share := floor(v_cape.price_bb * 0.15)::integer;
    if v_partner_share > 0 then
      insert into public.commerce_partner_wallets(user_id, balance_bb)
      values (v_partner_user_id, 0)
      on conflict (user_id) do nothing;

      update public.commerce_partner_wallets
      set balance_bb = balance_bb + v_partner_share,
          updated_at = timezone('utc', now())
      where user_id = v_partner_user_id
      returning balance_bb into v_partner_balance;

      insert into public.commerce_partner_wallet_ledger(
        user_id,
        entry_type,
        amount_bb,
        balance_after,
        reference_type,
        reference_id,
        metadata
      )
      values (
        v_partner_user_id,
        'partner_cape_sale_credit',
        v_partner_share,
        v_partner_balance,
        'cape_purchase',
        v_cape.id::text,
        jsonb_build_object(
          'buyer_user_id', v_user_id,
          'cape_id', v_cape.id,
          'cape_slug', v_cape.slug,
          'purchase_price_bb', v_cape.price_bb,
          'share_percent', 15
        )
      );
    end if;
  end if;

  if coalesce(p_auto_equip, false) then
    insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
    values (v_user_id, v_cape.id, timezone('utc', now()))
    on conflict (user_id)
    do update set
      equipped_cape_id = excluded.equipped_cape_id,
      updated_at = excluded.updated_at;
  end if;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select
    v_cape.id,
    v_cape.slug,
    v_balance,
    (select l.equipped_cape_id from public.commerce_cape_loadout l where l.user_id = v_user_id),
    false;
end;
$$;
