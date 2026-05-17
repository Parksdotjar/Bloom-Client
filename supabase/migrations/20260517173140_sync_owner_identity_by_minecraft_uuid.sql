begin;

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
  v_mc_uuid text := replace(lower(btrim(coalesce(p_mc_uuid, ''))), '-', '');
  v_is_owner_identity boolean := false;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_mc_uuid = '' then raise exception 'mc_uuid_required'; end if;

  v_is_owner_identity := v_mc_uuid in (
    'e2701115aa1147d3a9e2e89334623026',
    '2790c9887660460491068944f4ea2dcb'
  );

  if v_is_owner_identity then
    delete from public.commerce_profiles
    where user_id <> v_user_id
      and replace(lower(coalesce(mc_uuid, '')), '-', '') = v_mc_uuid;
  end if;

  insert into public.commerce_profiles (user_id, username, display_name, mc_uuid, role)
  values (
    v_user_id,
    nullif(btrim(p_username), ''),
    nullif(btrim(coalesce(p_display_name, p_username)), ''),
    btrim(p_mc_uuid),
    case when v_is_owner_identity then 'owner' else 'user' end
  )
  on conflict (user_id) do update
  set username = excluded.username,
      display_name = excluded.display_name,
      mc_uuid = excluded.mc_uuid,
      role = case
        when v_is_owner_identity then 'owner'
        else public.commerce_profiles.role
      end,
      updated_at = timezone('utc', now())
  returning * into v_profile;

  insert into public.commerce_wallets(user_id, balance_bb) values (v_user_id, 0) on conflict (user_id) do nothing;
  insert into public.commerce_cape_loadout(user_id, equipped_cape_id) values (v_user_id, null) on conflict (user_id) do nothing;
  perform public.commerce_refresh_public_loadout_for_user(v_user_id);
  return v_profile;
end;
$$;

commit;
