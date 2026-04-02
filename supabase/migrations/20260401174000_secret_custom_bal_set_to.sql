create or replace function public.commerce_secret_custom_bal_set_to(
  p_balance_bb integer
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
  v_user_id uuid := auth.uid();
  v_prev_balance integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_balance_bb is null or p_balance_bb < 0 then
    raise exception 'invalid_balance';
  end if;

  insert into public.commerce_wallets(user_id, balance_bb, updated_at)
  values (v_user_id, 0, v_now)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_prev_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  update public.commerce_wallets
  set balance_bb = p_balance_bb,
      updated_at = v_now
  where user_id = v_user_id;

  insert into public.commerce_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    metadata
  ) values (
    v_user_id,
    case
      when p_balance_bb >= v_prev_balance then 'credit'
      else 'debit'
    end,
    abs(p_balance_bb - v_prev_balance),
    p_balance_bb,
    'secret_custom_bal_set_to',
    v_user_id::text,
    jsonb_build_object(
      'previous_balance', v_prev_balance,
      'new_balance', p_balance_bb
    )
  );

  return query
  select w.user_id, w.balance_bb, w.updated_at
  from public.commerce_wallets w
  where w.user_id = v_user_id;
end;
$$;

grant execute on function public.commerce_secret_custom_bal_set_to(integer) to authenticated;

