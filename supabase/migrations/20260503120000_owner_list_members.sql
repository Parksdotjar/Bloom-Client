begin;

create or replace function public.commerce_owner_list_members()
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  balance_bb integer,
  profile_updated_at timestamptz,
  wallet_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.display_name,
    p.mc_uuid,
    p.role,
    coalesce(w.balance_bb, 0) as balance_bb,
    p.updated_at as profile_updated_at,
    w.updated_at as wallet_updated_at
  from public.commerce_profiles p
  left join public.commerce_wallets w on w.user_id = p.user_id
  order by
    case when p.role = 'owner' then 0 when p.role = 'partner' then 1 else 2 end,
    lower(coalesce(p.username, p.display_name, p.user_id::text));
end;
$$;

revoke all on function public.commerce_owner_list_members() from public;
grant execute on function public.commerce_owner_list_members() to authenticated, anon;

commit;
