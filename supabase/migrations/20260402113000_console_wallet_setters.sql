set check_function_bodies = off;

create or replace function public.commerce_set_own_wallet_balance(
  p_balance_bb bigint
)
returns table (
  user_id uuid,
  balance_bb bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  with current_user as (
    select auth.uid() as uid
  ),
  guard as (
    select uid
    from current_user
    where uid is not null
  ),
  upserted as (
    insert into public.commerce_wallets (user_id, balance_bb)
    select g.uid, greatest(0, coalesce(p_balance_bb, 0))
    from guard g
    on conflict (user_id)
    do update
      set balance_bb = excluded.balance_bb,
          updated_at = timezone('utc', now())
    returning commerce_wallets.user_id, commerce_wallets.balance_bb, commerce_wallets.updated_at
  )
  select u.user_id, u.balance_bb, u.updated_at
  from upserted u;
$$;

create or replace function public.commerce_set_user_wallet_balance(
  p_username text,
  p_balance_bb bigint
)
returns table (
  user_id uuid,
  balance_bb bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  with picked_profile as (
    select p.user_id
    from public.commerce_profiles p
    where lower(p.username) = lower(coalesce(nullif(trim(p_username), ''), ''))
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ),
  upserted as (
    insert into public.commerce_wallets (user_id, balance_bb)
    select pp.user_id, greatest(0, coalesce(p_balance_bb, 0))
    from picked_profile pp
    on conflict (user_id)
    do update
      set balance_bb = excluded.balance_bb,
          updated_at = timezone('utc', now())
    returning commerce_wallets.user_id, commerce_wallets.balance_bb, commerce_wallets.updated_at
  )
  select u.user_id, u.balance_bb, u.updated_at
  from upserted u;
$$;

revoke all on function public.commerce_set_own_wallet_balance(bigint) from public;
revoke all on function public.commerce_set_user_wallet_balance(text, bigint) from public;

grant execute on function public.commerce_set_own_wallet_balance(bigint) to authenticated, anon;
grant execute on function public.commerce_set_user_wallet_balance(text, bigint) to authenticated, anon;
