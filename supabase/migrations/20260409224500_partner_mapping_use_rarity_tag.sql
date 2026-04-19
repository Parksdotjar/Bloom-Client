create or replace function public.commerce_owner_list_partner_cape_mappings()
returns table (
  cape_id uuid,
  cape_slug text,
  cape_name text,
  partner_group text,
  partner_user_id uuid,
  partner_username text,
  partner_display_name text,
  is_active boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    c.id as cape_id,
    c.slug as cape_slug,
    c.name as cape_name,
    c.partner_group,
    m.partner_user_id,
    p.username as partner_username,
    p.display_name as partner_display_name,
    coalesce(m.is_active, false) as is_active,
    m.updated_at
  from public.commerce_capes c
  left join public.commerce_partner_cape_mappings m on m.cape_id = c.id
  left join public.commerce_profiles p on p.user_id = m.partner_user_id
  where lower(coalesce(c.rarity, '')) = 'partner'
  order by c.sort_order asc, c.name asc;
$$;

create or replace function public.commerce_owner_set_partner_cape_mapping(
  p_cape_id uuid,
  p_partner_user_id uuid,
  p_is_active boolean default true
)
returns table (
  cape_id uuid,
  partner_user_id uuid,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_partner_role text;
  v_is_partner_cape boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  select lower(coalesce(c.rarity, '')) = 'partner'
    into v_is_partner_cape
  from public.commerce_capes c
  where c.id = p_cape_id;

  if coalesce(v_is_partner_cape, false) = false then
    raise exception 'cape_must_be_partner_tagged';
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
  on conflict (cape_id)
  do update set
    partner_user_id = excluded.partner_user_id,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

  return query
    select m.cape_id, m.partner_user_id, m.is_active, m.updated_at
    from public.commerce_partner_cape_mappings m
    where m.cape_id = p_cape_id;
end;
$$;

revoke all on function public.commerce_owner_list_partner_cape_mappings() from public;
grant execute on function public.commerce_owner_list_partner_cape_mappings() to authenticated, anon;

revoke all on function public.commerce_owner_set_partner_cape_mapping(uuid, uuid, boolean) from public;
grant execute on function public.commerce_owner_set_partner_cape_mapping(uuid, uuid, boolean) to authenticated, anon;

-- Clean up duplicate "partner" tagging source.
-- Partner rarity is now the single source for owner mapping.
update public.commerce_capes
set partner_group = null
where lower(coalesce(rarity, '')) = 'partner'
  and lower(coalesce(partner_group, '')) = 'partner';
