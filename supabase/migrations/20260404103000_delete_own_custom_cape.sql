begin;

create or replace function public.commerce_delete_own_custom_cape(p_cape_id uuid)
returns table (
  deleted_cape_id uuid,
  removed_entitlement boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entitlement_id uuid;
  v_created_by uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select e.id, c.created_by
  into v_entitlement_id, v_created_by
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = v_user_id
    and e.cape_id = p_cape_id
    and e.source = 'custom_export'
  for update;

  if v_entitlement_id is null then
    raise exception 'custom_cape_not_owned';
  end if;

  delete from public.commerce_cape_entitlements
  where id = v_entitlement_id;

  update public.commerce_cape_loadout
  set equipped_cape_id = null,
      updated_at = timezone('utc', now())
  where user_id = v_user_id
    and equipped_cape_id = p_cape_id;

  if v_created_by = v_user_id then
    update public.commerce_capes
    set is_active = false,
        updated_at = timezone('utc', now())
    where id = p_cape_id;
  end if;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select p_cape_id, true;
end;
$$;

grant execute on function public.commerce_delete_own_custom_cape(uuid) to authenticated;

commit;

