begin;

create or replace function public.commerce_owner_get_partner_wallet_balance(
  p_user_id uuid
)
returns table (
  user_id uuid,
  balance_bb integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if p_user_id is null then
    raise exception 'target_user_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  return query
    select
      p_user_id,
      coalesce(w.balance_bb, 0) as balance_bb,
      coalesce(w.updated_at, timezone('utc', now())) as updated_at
    from (select 1) one
    left join public.commerce_partner_wallets w on w.user_id = p_user_id;
end;
$$;

create or replace function public.commerce_owner_grant_partner_wallet_bb(
  p_user_id uuid,
  p_amount_bb integer,
  p_reason text default null
)
returns table (
  user_id uuid,
  balance_bb integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid := auth.uid();
  v_amount integer := greatest(0, coalesce(p_amount_bb, 0));
  v_balance integer := 0;
  v_updated_at timestamptz := timezone('utc', now());
  v_target_role text;
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if p_user_id is null then
    raise exception 'target_user_required';
  end if;
  if v_amount <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  select coalesce(p.role, 'user')
    into v_target_role
  from public.commerce_profiles p
  where p.user_id = p_user_id
  limit 1;

  if coalesce(v_target_role, 'user') <> 'partner' then
    raise exception 'target_user_is_not_partner';
  end if;

  insert into public.commerce_partner_wallets(user_id, balance_bb)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.commerce_partner_wallets w
  set balance_bb = w.balance_bb + v_amount,
      updated_at = timezone('utc', now())
  where w.user_id = p_user_id
  returning w.balance_bb, w.updated_at
  into v_balance, v_updated_at;

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
    p_user_id,
    'owner_manual_grant',
    v_amount,
    v_balance,
    'owner_utility',
    v_owner_id::text,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''), 'granted_by', v_owner_id)
  );

  user_id := p_user_id;
  balance_bb := v_balance;
  updated_at := v_updated_at;
  return next;
end;
$$;

create or replace function public.commerce_owner_revoke_cape_from_user(
  p_user_id uuid,
  p_cape_id uuid,
  p_reason text default null
)
returns table (
  user_id uuid,
  cape_id uuid,
  cape_slug text,
  removed boolean,
  equipped_cape_cleared boolean,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid := auth.uid();
  v_now timestamptz := timezone('utc', now());
  v_slug text;
  v_removed boolean := false;
  v_equipped_cleared boolean := false;
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if p_user_id is null then
    raise exception 'target_user_required';
  end if;
  if p_cape_id is null then
    raise exception 'cape_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  select c.slug
    into v_slug
  from public.commerce_capes c
  where c.id = p_cape_id
  limit 1;

  if v_slug is null then
    raise exception 'cape_not_found';
  end if;

  delete from public.commerce_cape_entitlements e
  where e.user_id = p_user_id
    and e.cape_id = p_cape_id;

  v_removed := found;

  if exists (
    select 1
    from public.commerce_cape_loadout l
    where l.user_id = p_user_id
      and l.equipped_cape_id = p_cape_id
  ) then
    update public.commerce_cape_loadout l
    set equipped_cape_id = null,
        updated_at = v_now
    where l.user_id = p_user_id;
    v_equipped_cleared := true;
  end if;

  if v_removed then
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
      p_user_id,
      'owner_cape_revoked',
      0,
      null,
      'cape',
      p_cape_id::text,
      jsonb_build_object('cape_slug', v_slug, 'reason', nullif(btrim(coalesce(p_reason, '')), ''), 'revoked_by', v_owner_id)
    );
  end if;

  perform public.commerce_refresh_public_loadout_for_user(p_user_id);

  user_id := p_user_id;
  cape_id := p_cape_id;
  cape_slug := v_slug;
  removed := v_removed;
  equipped_cape_cleared := v_equipped_cleared;
  revoked_at := v_now;
  return next;
end;
$$;

grant execute on function public.commerce_owner_get_partner_wallet_balance(uuid) to authenticated;
grant execute on function public.commerce_owner_grant_partner_wallet_bb(uuid, integer, text) to authenticated;
grant execute on function public.commerce_owner_revoke_cape_from_user(uuid, uuid, text) to authenticated;

commit;