create or replace function public.commerce_users_share_mc_uuid(p_left uuid, p_right uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commerce_profiles a
    join public.commerce_profiles b
      on a.mc_uuid is not null
     and b.mc_uuid is not null
     and a.mc_uuid = b.mc_uuid
    where a.user_id = p_left
      and b.user_id = p_right
  );
$$;

grant execute on function public.commerce_users_share_mc_uuid(uuid, uuid) to authenticated;

drop policy if exists commerce_wallets_select_same_mc_uuid on public.commerce_wallets;
create policy commerce_wallets_select_same_mc_uuid
on public.commerce_wallets
for select
to authenticated
using (public.commerce_users_share_mc_uuid(auth.uid(), user_id));
