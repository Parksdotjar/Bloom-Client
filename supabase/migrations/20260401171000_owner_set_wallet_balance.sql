create or replace function public.commerce_owner_set_wallet_balance(
  p_balance_bb integer,
  p_mc_uuid text default null
)
returns table(
  user_id uuid,
  balance_bb integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_user_id uuid;
  v_prev_balance integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;

  if not public.commerce_is_owner(v_actor) then
    raise exception 'owner_role_required';
  end if;

  if p_balance_bb is null or p_balance_bb < 0 then
    raise exception 'invalid_balance';
  end if;

  if p_mc_uuid is not null and btrim(p_mc_uuid) <> '' then
    select p.user_id
    into v_target_user_id
    from public.commerce_profiles p
    where lower(coalesce(p.mc_uuid, '')) = lower(btrim(p_mc_uuid))
    order by case when p.role = 'owner' then 0 else 1 end, p.updated_at desc
    limit 1;
  end if;

  if v_target_user_id is null then
    v_target_user_id := v_actor;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb, updated_at)
  values (v_target_user_id, 0, v_now)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_prev_balance
  from public.commerce_wallets w
  where w.user_id = v_target_user_id
  for update;

  update public.commerce_wallets
  set balance_bb = p_balance_bb,
      updated_at = v_now
  where user_id = v_target_user_id;

  insert into public.commerce_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    metadata
  ) values (
    v_target_user_id,
    case
      when p_balance_bb >= v_prev_balance then 'credit'
      else 'debit'
    end,
    abs(p_balance_bb - v_prev_balance),
    p_balance_bb,
    'owner_set_balance',
    v_target_user_id::text,
    jsonb_build_object(
      'actor_user_id', v_actor,
      'mc_uuid', p_mc_uuid,
      'previous_balance', v_prev_balance,
      'new_balance', p_balance_bb
    )
  );

  return query
  select w.user_id, w.balance_bb, w.updated_at
  from public.commerce_wallets w
  where w.user_id = v_target_user_id;
end;
$$;

grant execute on function public.commerce_owner_set_wallet_balance(integer, text) to authenticated;

