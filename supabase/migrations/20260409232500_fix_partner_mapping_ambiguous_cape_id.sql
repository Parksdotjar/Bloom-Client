create or replace function public.commerce_owner_set_partner_cape_mapping(
  p_cape_id uuid,
  p_partner_user_id uuid,
  p_is_active boolean default true
)
returns table (
  out_cape_id uuid,
  out_partner_user_id uuid,
  out_is_active boolean,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_partner_role text;
  v_profit_enabled boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  select coalesce(c.partner_for_profits, false)
    into v_profit_enabled
  from public.commerce_capes c
  where c.id = p_cape_id;

  if coalesce(v_profit_enabled, false) = false then
    raise exception 'cape_partner_for_profits_not_enabled';
  end if;

  select coalesce(p.role, 'user')
    into v_partner_role
  from public.commerce_profiles p
  where p.user_id = p_partner_user_id;

  if v_partner_role <> 'partner' then
    raise exception 'target_user_is_not_partner';
  end if;

  insert into public.commerce_partner_cape_mappings (cape_id, partner_user_id, is_active, updated_at)
  values (p_cape_id, p_partner_user_id, coalesce(p_is_active, true), timezone('utc', now()))
  on conflict on constraint commerce_partner_cape_mappings_pkey
  do update set
    partner_user_id = excluded.partner_user_id,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

  return query
    select
      m.cape_id as out_cape_id,
      m.partner_user_id as out_partner_user_id,
      m.is_active as out_is_active,
      m.updated_at as out_updated_at
    from public.commerce_partner_cape_mappings m
    where m.cape_id = p_cape_id;
end;
$$;

revoke all on function public.commerce_owner_set_partner_cape_mapping(uuid, uuid, boolean) from public;
grant execute on function public.commerce_owner_set_partner_cape_mapping(uuid, uuid, boolean) to authenticated, anon;
