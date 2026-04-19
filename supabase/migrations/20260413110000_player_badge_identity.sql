begin;

alter table public.commerce_profiles
  add column if not exists bloom_badge_key text;

create or replace function public.bloom_normalize_badge_key(p_badge_key text)
returns text
language plpgsql
immutable
as $$
declare
  v_value text := lower(coalesce(nullif(trim(p_badge_key), ''), ''));
begin
  if v_value in ('', 'auto', 'default') then
    return null;
  end if;

  if v_value in (
    'none',
    'bloom',
    'partner',
    'owner',
    'manager',
    'partner-red',
    'partner-red-glow',
    'staff-gold',
    'staff-gold-glow',
    'owner-pink',
    'owner-pink-glow'
  ) then
    return v_value;
  end if;

  return null;
end;
$$;

create or replace function public.bloom_effective_badge_key(
  p_role text,
  p_custom_badge_key text
)
returns text
language plpgsql
immutable
as $$
declare
  v_custom text := public.bloom_normalize_badge_key(p_custom_badge_key);
  v_role text := lower(coalesce(nullif(trim(p_role), ''), 'user'));
begin
  if v_custom is not null then
    return v_custom;
  end if;

  if v_role = 'owner' then
    return 'owner';
  end if;

  if v_role = 'partner' then
    return 'partner';
  end if;

  return 'bloom';
end;
$$;

create table if not exists public.bloom_player_identity_public (
  mc_uuid text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null,
  custom_badge_key text,
  badge_key text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists bloom_player_identity_public_user_idx
  on public.bloom_player_identity_public(user_id);

create or replace function public.sync_bloom_player_identity_public(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile record;
begin
  select
    p.user_id,
    lower(coalesce(nullif(trim(p.mc_uuid), ''), '')) as mc_uuid,
    lower(coalesce(nullif(trim(p.role), ''), 'user')) as role,
    public.bloom_normalize_badge_key(p.bloom_badge_key) as custom_badge_key,
    public.bloom_effective_badge_key(p.role, p.bloom_badge_key) as badge_key,
    p.updated_at
  into v_profile
  from public.commerce_profiles p
  where p.user_id = p_user_id;

  if not found or coalesce(v_profile.mc_uuid, '') = '' then
    delete from public.bloom_player_identity_public where user_id = p_user_id;
    return;
  end if;

  insert into public.bloom_player_identity_public (
    mc_uuid,
    user_id,
    role,
    custom_badge_key,
    badge_key,
    updated_at
  )
  values (
    v_profile.mc_uuid,
    v_profile.user_id,
    v_profile.role,
    v_profile.custom_badge_key,
    v_profile.badge_key,
    coalesce(v_profile.updated_at, timezone('utc', now()))
  )
  on conflict (mc_uuid)
  do update set
    user_id = excluded.user_id,
    role = excluded.role,
    custom_badge_key = excluded.custom_badge_key,
    badge_key = excluded.badge_key,
    updated_at = timezone('utc', now());

  delete from public.bloom_player_identity_public
  where user_id = p_user_id
    and mc_uuid <> v_profile.mc_uuid;
end;
$$;

create or replace function public.sync_bloom_player_identity_public_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.bloom_player_identity_public where user_id = old.user_id;
    return old;
  end if;

  perform public.sync_bloom_player_identity_public(new.user_id);
  return new;
end;
$$;

drop trigger if exists commerce_profiles_sync_bloom_player_identity_public
  on public.commerce_profiles;

create trigger commerce_profiles_sync_bloom_player_identity_public
after insert or update of mc_uuid, role, bloom_badge_key, updated_at or delete
on public.commerce_profiles
for each row
execute function public.sync_bloom_player_identity_public_trigger();

insert into public.bloom_player_identity_public (
  mc_uuid,
  user_id,
  role,
  custom_badge_key,
  badge_key,
  updated_at
)
select
  lower(trim(p.mc_uuid)) as mc_uuid,
  p.user_id,
  lower(coalesce(nullif(trim(p.role), ''), 'user')) as role,
  public.bloom_normalize_badge_key(p.bloom_badge_key) as custom_badge_key,
  public.bloom_effective_badge_key(p.role, p.bloom_badge_key) as badge_key,
  p.updated_at
from public.commerce_profiles p
where coalesce(nullif(trim(p.mc_uuid), ''), '') <> ''
on conflict (mc_uuid)
do update set
  user_id = excluded.user_id,
  role = excluded.role,
  custom_badge_key = excluded.custom_badge_key,
  badge_key = excluded.badge_key,
  updated_at = excluded.updated_at;

grant select on public.bloom_player_identity_public to anon, authenticated;

create or replace function public.commerce_owner_get_member_badge(
  p_user_id uuid
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  custom_badge_key text,
  effective_badge_key text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  return query
    select
      p.user_id,
      p.username,
      p.display_name,
      p.mc_uuid,
      p.role,
      public.bloom_normalize_badge_key(p.bloom_badge_key) as custom_badge_key,
      public.bloom_effective_badge_key(p.role, p.bloom_badge_key) as effective_badge_key,
      p.updated_at
    from public.commerce_profiles p
    where p.user_id = p_user_id
    limit 1;
end;
$$;

create or replace function public.commerce_owner_set_member_badge(
  p_user_id uuid,
  p_badge_key text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  custom_badge_key text,
  effective_badge_key text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_custom_badge_key text := public.bloom_normalize_badge_key(p_badge_key);
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  return query
    with updated as (
      update public.commerce_profiles p
      set bloom_badge_key = v_custom_badge_key,
          updated_at = timezone('utc', now())
      where p.user_id = p_user_id
      returning p.user_id, p.username, p.display_name, p.mc_uuid, p.role, p.bloom_badge_key, p.updated_at
    )
    select
      u.user_id,
      u.username,
      u.display_name,
      u.mc_uuid,
      u.role,
      public.bloom_normalize_badge_key(u.bloom_badge_key) as custom_badge_key,
      public.bloom_effective_badge_key(u.role, u.bloom_badge_key) as effective_badge_key,
      u.updated_at
    from updated u;
end;
$$;

revoke all on function public.commerce_owner_get_member_badge(uuid) from public;
revoke all on function public.commerce_owner_set_member_badge(uuid, text) from public;

grant execute on function public.commerce_owner_get_member_badge(uuid) to authenticated, anon;
grant execute on function public.commerce_owner_set_member_badge(uuid, text) to authenticated, anon;

commit;
