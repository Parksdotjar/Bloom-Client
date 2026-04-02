create or replace function public.commerce_sync_identity(
  p_mc_uuid text,
  p_username text default null,
  p_display_name text default null
)
returns public.commerce_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.commerce_profiles;
  v_match public.commerce_profiles;
  v_normalized_mc_uuid text := nullif(btrim(coalesce(p_mc_uuid, '')), '');
  v_normalized_username text := nullif(btrim(coalesce(p_username, '')), '');
  v_normalized_display text := nullif(btrim(coalesce(p_display_name, p_username, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_normalized_mc_uuid is null then
    raise exception 'mc_uuid_required';
  end if;

  -- 1) If this auth user already has a profile row, keep it and hard-bind mc_uuid.
  update public.commerce_profiles p
  set
    username = coalesce(v_normalized_username, p.username),
    display_name = coalesce(v_normalized_display, p.display_name),
    mc_uuid = v_normalized_mc_uuid,
    updated_at = timezone('utc', now())
  where p.user_id = v_user_id
  returning * into v_profile;

  if found then
    insert into public.commerce_wallets(user_id, balance_bb)
    values (v_user_id, 0)
    on conflict (user_id) do nothing;

    insert into public.commerce_cape_loadout(user_id, equipped_cape_id)
    values (v_user_id, null)
    on conflict (user_id) do nothing;

    perform public.commerce_refresh_public_loadout_for_user(v_user_id);
    return v_profile;
  end if;

  -- 2) Reuse existing identity by mc_uuid first, then username/display fallback.
  select p.*
  into v_match
  from public.commerce_profiles p
  where p.mc_uuid = v_normalized_mc_uuid
     or (v_normalized_username is not null and lower(coalesce(p.username, '')) = lower(v_normalized_username))
     or (v_normalized_display is not null and lower(coalesce(p.display_name, '')) = lower(v_normalized_display))
  order by
    case
      when p.mc_uuid = v_normalized_mc_uuid then 0
      when v_normalized_username is not null and lower(coalesce(p.username, '')) = lower(v_normalized_username) then 1
      else 2
    end,
    p.updated_at desc
  limit 1
  for update;

  if found then
    -- Rebind that profile row to current auth user (preserve role/history row).
    update public.commerce_profiles p
    set
      user_id = v_user_id,
      username = coalesce(v_normalized_username, p.username),
      display_name = coalesce(v_normalized_display, p.display_name),
      mc_uuid = v_normalized_mc_uuid,
      updated_at = timezone('utc', now())
    where p.user_id = v_match.user_id
    returning * into v_profile;
  else
    -- 3) First-time identity: create exactly one row for this auth user.
    insert into public.commerce_profiles (user_id, username, display_name, mc_uuid, role)
    values (
      v_user_id,
      v_normalized_username,
      v_normalized_display,
      v_normalized_mc_uuid,
      'user'
    )
    on conflict (user_id) do update
    set
      username = excluded.username,
      display_name = excluded.display_name,
      mc_uuid = excluded.mc_uuid,
      updated_at = timezone('utc', now())
    returning * into v_profile;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.commerce_cape_loadout(user_id, equipped_cape_id)
  values (v_user_id, null)
  on conflict (user_id) do nothing;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);
  return v_profile;
end;
$$;

grant execute on function public.commerce_sync_identity(text, text, text) to authenticated;
