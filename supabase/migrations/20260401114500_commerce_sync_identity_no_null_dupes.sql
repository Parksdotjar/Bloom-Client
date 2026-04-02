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
  v_existing_owner public.commerce_profiles;
  v_normalized_mc_uuid text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_mc_uuid is null or btrim(p_mc_uuid) = '' then
    raise exception 'mc_uuid_required';
  end if;

  v_normalized_mc_uuid := btrim(p_mc_uuid);

  select *
  into v_existing_owner
  from public.commerce_profiles p
  where p.mc_uuid = v_normalized_mc_uuid
  order by case when p.role = 'owner' then 0 else 1 end, p.updated_at desc
  limit 1;

  -- If this mc_uuid is already claimed by another user and we don't have a profile row yet,
  -- don't create a null-mc_uuid duplicate row; just return the existing owner profile.
  if v_existing_owner.user_id is not null and v_existing_owner.user_id <> v_user_id then
    select *
    into v_profile
    from public.commerce_profiles
    where user_id = v_user_id;

    if v_profile.user_id is null then
      return v_existing_owner;
    end if;
  end if;

  insert into public.commerce_profiles (user_id, username, display_name, mc_uuid, role)
  values (
    v_user_id,
    nullif(btrim(p_username), ''),
    nullif(btrim(coalesce(p_display_name, p_username)), ''),
    null,
    'user'
  )
  on conflict (user_id) do update
  set username = excluded.username,
      display_name = excluded.display_name,
      updated_at = timezone('utc', now())
  returning * into v_profile;

  begin
    update public.commerce_profiles p
    set mc_uuid = v_normalized_mc_uuid,
        updated_at = timezone('utc', now())
    where p.user_id = v_user_id
      and not exists (
        select 1
        from public.commerce_profiles other
        where other.mc_uuid = v_normalized_mc_uuid
          and other.user_id <> v_user_id
      );
  exception
    when unique_violation then
      null;
  end;

  select *
  into v_profile
  from public.commerce_profiles
  where user_id = v_user_id;

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
