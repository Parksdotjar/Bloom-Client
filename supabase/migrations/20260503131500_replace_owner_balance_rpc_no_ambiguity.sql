begin;

drop function if exists public.commerce_set_user_wallet_balance_by_id(uuid, bigint);

create or replace function public.commerce_set_user_wallet_balance_by_id(
  p_user_id uuid,
  p_balance_bb bigint
)
returns table (
  user_id uuid,
  balance_bb bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with owner_guard as (
    select 1
    where coalesce(auth.jwt()->>'role', '') = 'service_role'
       or public.commerce_is_owner(auth.uid())
  ),
  target_profile as (
    select cp.user_id as target_user_id
    from public.commerce_profiles cp
    where cp.user_id = p_user_id
    limit 1
  ),
  upserted_wallet as (
    insert into public.commerce_wallets as cw (user_id, balance_bb)
    select
      tp.target_user_id,
      greatest(0, coalesce(p_balance_bb, 0))
    from target_profile tp
    where exists (select 1 from owner_guard)
    on conflict on constraint commerce_wallets_pkey
    do update
      set balance_bb = excluded.balance_bb,
          updated_at = timezone('utc', now())
    returning
      cw.user_id as wallet_user_id,
      cw.balance_bb as wallet_balance_bb,
      cw.updated_at as wallet_updated_at
  )
  select
    uw.wallet_user_id as user_id,
    uw.wallet_balance_bb as balance_bb,
    uw.wallet_updated_at as updated_at
  from upserted_wallet uw;
$$;

revoke all on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) from public;
grant execute on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) to authenticated, anon;

commit;
