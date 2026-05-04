begin;

create table if not exists public.commerce_custom_cape_free_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.commerce_custom_cape_free_credits enable row level security;

drop policy if exists commerce_custom_cape_free_credits_owner_read on public.commerce_custom_cape_free_credits;
create policy commerce_custom_cape_free_credits_owner_read
on public.commerce_custom_cape_free_credits
for select
using (auth.uid() = user_id or public.commerce_is_owner(auth.uid()));

create or replace function public.commerce_get_own_custom_cape_free_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_credits integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  select coalesce(c.credits_remaining, 0)
  into v_credits
  from public.commerce_custom_cape_free_credits c
  where c.user_id = v_user_id
  limit 1;

  return coalesce(v_credits, 0);
end;
$$;

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

revoke all on function public.commerce_get_own_custom_cape_free_credits() from public;
revoke all on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) from public;

grant execute on function public.commerce_get_own_custom_cape_free_credits() to authenticated, anon;
grant execute on function public.commerce_set_user_wallet_balance_by_id(uuid, bigint) to authenticated, anon;

commit;
