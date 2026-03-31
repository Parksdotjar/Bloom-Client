begin;

create or replace function public.set_cape_loadout(p_cape_slug text default null)
returns table (user_id uuid, equipped_cape_id uuid, equipped_cape_slug text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_target uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_cape_slug is null or btrim(p_cape_slug) = '' then
    v_target := null;
  else
    select c.id
      into v_target
    from public.commerce_capes c
    where c.slug = lower(btrim(p_cape_slug))
    limit 1;

    if not found then
      raise exception 'cape_not_found';
    end if;

    if not exists (
      select 1
      from public.commerce_cape_entitlements e
      where e.user_id = v_user_id
        and e.cape_id = v_target
    ) then
      raise exception 'cannot_equip_unowned_cape';
    end if;
  end if;

  update public.commerce_cape_loadout l
  set
    equipped_cape_id = v_target,
    updated_at = timezone('utc', now())
  where l.user_id = v_user_id;

  if not found then
    begin
      insert into public.commerce_cape_loadout (user_id, equipped_cape_id, updated_at)
      values (v_user_id, v_target, timezone('utc', now()));
    exception
      when unique_violation then
        update public.commerce_cape_loadout l
        set
          equipped_cape_id = v_target,
          updated_at = timezone('utc', now())
        where l.user_id = v_user_id;
    end;
  end if;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select l.user_id, l.equipped_cape_id, c.slug, l.updated_at
  from public.commerce_cape_loadout l
  left join public.commerce_capes c on c.id = l.equipped_cape_id
  where l.user_id = v_user_id;
end;
$$;

grant execute on function public.set_cape_loadout(text) to authenticated;

commit;
