begin;

create or replace function public.commerce_set_user_wallet_balance_by_id(
  p_user_id uuid,
  p_balance_bb bigint
)
returns table (
  user_id uuid,
  balance_bb bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_wallet public.commerce_wallets%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;

  if not exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = p_user_id
  ) then
    raise exception 'profile_not_found';
  end if;

  insert into public.commerce_wallets (user_id, balance_bb)
  values (p_user_id, greatest(0, coalesce(p_balance_bb, 0)))
  on conflict (user_id)
  do update
    set balance_bb = excluded.balance_bb,
        updated_at = timezone('utc', now())
  returning commerce_wallets.*
  into v_wallet;

  user_id := v_wallet.user_id;
  balance_bb := v_wallet.balance_bb;
  updated_at := v_wallet.updated_at;
  return next;
end;
$$;

revoke all on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) from public;
grant execute on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) to authenticated, anon;

commit;
