alter table public.commerce_profiles drop constraint if exists commerce_profiles_role_check;
alter table public.commerce_profiles drop constraint if exists commerce_profiles_role_check1;
alter table public.commerce_profiles
  add constraint commerce_profiles_role_check
  check (role in ('user', 'partner', 'owner'));

create or replace function public.commerce_set_user_role(
  p_username text,
  p_role text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  v_role := case lower(coalesce(nullif(trim(p_role), ''), ''))
    when 'owner' then 'owner'
    when 'partner' then 'partner'
    else 'user'
  end;

  return query
    with picked as (
      select p.user_id
      from public.commerce_profiles p
      where lower(p.username) = lower(nullif(trim(p_username), ''))
      order by p.updated_at desc nulls last, p.created_at desc nulls last
      limit 1
    ),
    updated as (
      update public.commerce_profiles p
      set role = v_role,
          updated_at = timezone('utc', now())
      from picked t
      where p.user_id = t.user_id
      returning p.user_id, p.username, p.display_name, p.mc_uuid, p.role, p.created_at, p.updated_at
    )
    select * from updated;
end;
$$;

create or replace function public.commerce_set_user_role_by_id(
  p_user_id uuid,
  p_role text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  v_role := case lower(coalesce(nullif(trim(p_role), ''), ''))
    when 'owner' then 'owner'
    when 'partner' then 'partner'
    else 'user'
  end;

  return query
    update public.commerce_profiles p
    set role = v_role,
        updated_at = timezone('utc', now())
    where p.user_id = p_user_id
    returning p.user_id, p.username, p.display_name, p.mc_uuid, p.role, p.created_at, p.updated_at;
end;
$$;

revoke all on function public.commerce_set_user_role(text, text) from public;
grant execute on function public.commerce_set_user_role(text, text) to authenticated, anon;

revoke all on function public.commerce_set_user_role_by_id(uuid, text) from public;
grant execute on function public.commerce_set_user_role_by_id(uuid, text) to authenticated, anon;
