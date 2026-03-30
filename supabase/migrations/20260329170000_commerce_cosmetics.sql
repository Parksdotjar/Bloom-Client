begin;

create extension if not exists pgcrypto;

-- Compatibility reset for commerce tables.
do $$
declare
  v_table text;
  v_kind "char";
  v_backup text;
  v_targets text[] := array[
    'commerce_profiles',
    'commerce_capes',
    'commerce_cape_entitlements',
    'commerce_cape_loadout',
    'commerce_cape_loadout_public',
    'commerce_wallets',
    'commerce_wallet_ledger',
    'commerce_currency_packs',
    'commerce_kofi_events',
    'commerce_pending_currency_purchases',
    'commerce_hats',
    'commerce_hat_entitlements',
    'commerce_hat_loadout'
  ];
begin
  foreach v_table in array v_targets loop
    select c.relkind
    into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table
    limit 1;

    if not found then
      continue;
    end if;

    if v_kind in ('r', 'p') then
      v_backup := v_table || '_legacy_20260330';
      if not exists (
        select 1 from information_schema.tables
        where table_schema='public' and table_name=v_backup
      ) then
        execute format('alter table public.%I rename to %I', v_table, v_backup);
      else
        execute format('drop table public.%I cascade', v_table);
      end if;
    end if;
  end loop;
end $$;

create table public.commerce_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  mc_uuid text unique,
  role text not null default 'user' check (role in ('user','owner')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_capes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  texture_url text not null,
  preview_url text,
  price_bb integer not null check (price_bb >= 0),
  rarity text not null,
  rarity_label text,
  rarity_color_start text,
  rarity_color_end text,
  rarity_glow text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_cape_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cape_id uuid not null references public.commerce_capes(id) on delete cascade,
  source text not null default 'purchase',
  acquired_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, cape_id)
);

create table public.commerce_cape_loadout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_cape_id uuid references public.commerce_capes(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_bb integer not null default 0 check (balance_bb >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null,
  amount_bb integer not null,
  balance_after integer,
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_currency_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_usd numeric(10,2) not null,
  base_bb integer not null,
  bonus_bb integer not null default 0,
  total_bb integer not null,
  kofi_url text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_kofi_events (
  id uuid primary key default gen_random_uuid(),
  raw_event_id text unique,
  email text,
  package_slug text,
  raw_payload jsonb not null default '{}'::jsonb,
  matched_user_id uuid references auth.users(id) on delete set null,
  processed_status text not null default 'received',
  processed_note text,
  credited_amount_bb integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_pending_currency_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  package_slug text not null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  matched_kofi_event_id uuid references public.commerce_kofi_events(id) on delete set null
);

create table public.commerce_hats (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  texture_url text not null,
  preview_url text,
  price_bb integer not null default 0,
  rarity text not null default 'common',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_hat_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hat_id uuid not null references public.commerce_hats(id) on delete cascade,
  source text not null default 'purchase',
  acquired_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, hat_id)
);

create table public.commerce_hat_loadout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_hat_id uuid references public.commerce_hats(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.commerce_cape_loadout_public (
  mc_uuid text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  equipped_cape_id uuid references public.commerce_capes(id) on delete set null,
  cape_slug text,
  cape_name text,
  texture_url text,
  preview_url text,
  rarity text,
  rarity_label text,
  rarity_color_start text,
  rarity_color_end text,
  rarity_glow text,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists commerce_profiles_role_idx on public.commerce_profiles(role);
create index if not exists commerce_capes_active_sort_idx on public.commerce_capes(is_active, is_featured desc, sort_order asc);
create index if not exists commerce_cape_entitlements_user_idx on public.commerce_cape_entitlements(user_id, acquired_at desc);
create index if not exists commerce_wallet_ledger_user_created_idx on public.commerce_wallet_ledger(user_id, created_at desc);
create index if not exists commerce_pending_currency_purchases_lookup_idx on public.commerce_pending_currency_purchases(email, package_slug, status, created_at desc);

create or replace function public.commerce_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.commerce_is_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.commerce_profiles p
    where p.user_id = coalesce(p_user_id, auth.uid()) and p.role = 'owner'
  );
$$;

create or replace function public.commerce_refresh_public_loadout_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.commerce_cape_loadout_public where user_id = p_user_id;

  insert into public.commerce_cape_loadout_public (
    mc_uuid, user_id, equipped_cape_id, cape_slug, cape_name, texture_url, preview_url,
    rarity, rarity_label, rarity_color_start, rarity_color_end, rarity_glow, updated_at
  )
  select
    p.mc_uuid,
    p.user_id,
    l.equipped_cape_id,
    c.slug,
    c.name,
    c.texture_url,
    c.preview_url,
    c.rarity,
    coalesce(c.rarity_label, c.rarity),
    c.rarity_color_start,
    c.rarity_color_end,
    c.rarity_glow,
    timezone('utc', now())
  from public.commerce_profiles p
  left join public.commerce_cape_loadout l on l.user_id = p.user_id
  left join public.commerce_capes c on c.id = l.equipped_cape_id
  where p.user_id = p_user_id
    and p.mc_uuid is not null
    and btrim(p.mc_uuid) <> ''
  on conflict (mc_uuid) do update
  set
    user_id = excluded.user_id,
    equipped_cape_id = excluded.equipped_cape_id,
    cape_slug = excluded.cape_slug,
    cape_name = excluded.cape_name,
    texture_url = excluded.texture_url,
    preview_url = excluded.preview_url,
    rarity = excluded.rarity,
    rarity_label = excluded.rarity_label,
    rarity_color_start = excluded.rarity_color_start,
    rarity_color_end = excluded.rarity_color_end,
    rarity_glow = excluded.rarity_glow,
    updated_at = excluded.updated_at;
end;
$$;

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
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_mc_uuid is null or btrim(p_mc_uuid) = '' then raise exception 'mc_uuid_required'; end if;

  insert into public.commerce_profiles (user_id, username, display_name, mc_uuid, role)
  values (v_user_id, nullif(btrim(p_username), ''), nullif(btrim(coalesce(p_display_name, p_username)), ''), btrim(p_mc_uuid), 'user')
  on conflict (user_id) do update
  set username = excluded.username,
      display_name = excluded.display_name,
      mc_uuid = excluded.mc_uuid,
      updated_at = timezone('utc', now())
  returning * into v_profile;

  insert into public.commerce_wallets(user_id, balance_bb) values (v_user_id, 0) on conflict (user_id) do nothing;
  insert into public.commerce_cape_loadout(user_id, equipped_cape_id) values (v_user_id, null) on conflict (user_id) do nothing;
  perform public.commerce_refresh_public_loadout_for_user(v_user_id);
  return v_profile;
end;
$$;

create or replace function public.commerce_grant_owner_role(p_target_user_id uuid)
returns public.commerce_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.commerce_profiles;
begin
  if p_target_user_id is null then raise exception 'target_user_required'; end if;
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  insert into public.commerce_profiles(user_id, role)
  values (p_target_user_id, 'owner')
  on conflict (user_id) do update set role='owner', updated_at=timezone('utc', now())
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.commerce_grant_owner_role_by_identifier(p_identifier text)
returns public.commerce_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input text := btrim(coalesce(p_identifier, ''));
  v_lower text := lower(v_input);
  v_uuid uuid;
  v_user_ids uuid[];
  v_count integer := 0;
  v_session_user text := session_user;
begin
  if v_input = '' then
    raise exception 'identifier_required';
  end if;

  if v_session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin')
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  if v_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := v_input::uuid;
    return public.commerce_grant_owner_role(v_uuid);
  end if;

  select array_agg(p.user_id), count(*)
  into v_user_ids, v_count
  from public.commerce_profiles p
  where lower(coalesce(p.username, '')) = v_lower
     or lower(coalesce(p.display_name, '')) = v_lower;

  if v_count = 0 then
    select array_agg(u.id), count(*)
    into v_user_ids, v_count
    from auth.users u
    where lower(coalesce(u.email, '')) = v_lower;
  end if;

  if v_count = 0 then
    raise exception 'identifier_not_found';
  end if;

  if v_count > 1 then
    raise exception 'ambiguous_identifier';
  end if;

  return public.commerce_grant_owner_role(v_user_ids[1]);
end;
$$;

create or replace function public.create_cape_listing(
  p_texture_url text,
  p_name text,
  p_price_bb integer,
  p_rarity text,
  p_slug text,
  p_description text default null,
  p_preview_url text default null,
  p_rarity_label text default null,
  p_rarity_color_start text default null,
  p_rarity_color_end text default null,
  p_rarity_glow text default null,
  p_sort_order integer default 0,
  p_is_active boolean default true,
  p_is_featured boolean default false
)
returns public.commerce_capes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cape public.commerce_capes;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and not public.commerce_is_owner(auth.uid()) then raise exception 'owner_role_required'; end if;
  if p_texture_url is null or btrim(p_texture_url) = '' then raise exception 'texture_url_required'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'name_required'; end if;
  if p_slug is null or btrim(p_slug) = '' then raise exception 'slug_required'; end if;

  insert into public.commerce_capes(
    slug,name,description,texture_url,preview_url,price_bb,rarity,rarity_label,
    rarity_color_start,rarity_color_end,rarity_glow,sort_order,is_active,is_featured,created_by
  )
  values (
    lower(btrim(p_slug)), btrim(p_name), p_description, btrim(p_texture_url), nullif(btrim(p_preview_url), ''),
    greatest(0, coalesce(p_price_bb, 0)), lower(coalesce(nullif(btrim(p_rarity),''), 'common')), nullif(btrim(p_rarity_label), ''),
    nullif(btrim(p_rarity_color_start), ''), nullif(btrim(p_rarity_color_end), ''), nullif(btrim(p_rarity_glow), ''),
    coalesce(p_sort_order,0), coalesce(p_is_active,true), coalesce(p_is_featured,false), auth.uid()
  ) returning * into v_cape;

  return v_cape;
end;
$$;

create or replace function public.purchase_cape(p_cape_slug text, p_auto_equip boolean default false)
returns table (cape_id uuid, cape_slug text, new_balance_bb integer, equipped_cape_id uuid, already_owned boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cape public.commerce_capes;
  v_balance integer;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_cape from public.commerce_capes where slug = lower(btrim(p_cape_slug)) and is_active = true limit 1;
  if not found then raise exception 'cape_not_found'; end if;

  if exists (select 1 from public.commerce_cape_entitlements e where e.user_id = v_user_id and e.cape_id = v_cape.id) then
    raise exception 'cape_already_owned';
  end if;

  insert into public.commerce_wallets(user_id, balance_bb) values (v_user_id, 0) on conflict (user_id) do nothing;
  select balance_bb into v_balance from public.commerce_wallets where user_id = v_user_id for update;
  if v_balance < v_cape.price_bb then raise exception 'insufficient_balance'; end if;

  update public.commerce_wallets
  set balance_bb = balance_bb - v_cape.price_bb, updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning balance_bb into v_balance;

  insert into public.commerce_cape_entitlements(user_id, cape_id, source, acquired_at, metadata)
  values (v_user_id, v_cape.id, 'purchase', timezone('utc', now()), jsonb_build_object('cape_slug', v_cape.slug, 'price_bb', v_cape.price_bb));

  insert into public.commerce_wallet_ledger(user_id, entry_type, amount_bb, balance_after, reference_type, reference_id, metadata)
  values (v_user_id, 'cosmetic_purchase', -v_cape.price_bb, v_balance, 'cape', v_cape.id::text, jsonb_build_object('cape_slug', v_cape.slug));

  if coalesce(p_auto_equip, false) then
    insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
    values (v_user_id, v_cape.id, timezone('utc', now()))
    on conflict (user_id) do update set equipped_cape_id = excluded.equipped_cape_id, updated_at = excluded.updated_at;
  end if;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select v_cape.id, v_cape.slug, v_balance,
         (select l.equipped_cape_id from public.commerce_cape_loadout l where l.user_id = v_user_id),
         false;
end;
$$;

create or replace function public.set_cape_loadout(p_cape_slug text default null)
returns table (user_id uuid, equipped_cape_id uuid, equipped_cape_slug text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if p_cape_slug is null or btrim(p_cape_slug) = '' then
    v_target := null;
  else
    select id into v_target from public.commerce_capes where slug = lower(btrim(p_cape_slug)) limit 1;
    if not found then raise exception 'cape_not_found'; end if;
    if not exists (select 1 from public.commerce_cape_entitlements e where e.user_id = v_user_id and e.cape_id = v_target) then
      raise exception 'cannot_equip_unowned_cape';
    end if;
  end if;

  insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
  values (v_user_id, v_target, timezone('utc', now()))
  on conflict (user_id) do update set equipped_cape_id = excluded.equipped_cape_id, updated_at = excluded.updated_at;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select l.user_id, l.equipped_cape_id, c.slug, l.updated_at
  from public.commerce_cape_loadout l
  left join public.commerce_capes c on c.id = l.equipped_cape_id
  where l.user_id = v_user_id;
end;
$$;

create or replace function public.commerce_create_pending_currency_purchase(
  p_email text,
  p_package_slug text,
  p_ttl_seconds integer default 1800
)
returns public.commerce_pending_currency_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_slug text := lower(btrim(coalesce(p_package_slug, '')));
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 1800), 86400));
  v_pending public.commerce_pending_currency_purchases;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_email = '' then raise exception 'email_required'; end if;
  if v_slug = '' then raise exception 'package_required'; end if;
  if not exists (select 1 from public.commerce_currency_packs p where p.slug = v_slug and p.is_active = true) then
    raise exception 'unknown_package';
  end if;

  update public.commerce_pending_currency_purchases
  set status = 'replaced', updated_at = timezone('utc', now())
  where user_id = v_user_id and package_slug = v_slug and status = 'pending';

  insert into public.commerce_pending_currency_purchases(user_id, email, package_slug, status, expires_at)
  values (v_user_id, v_email, v_slug, 'pending', timezone('utc', now()) + make_interval(secs => v_ttl))
  returning * into v_pending;

  return v_pending;
end;
$$;

create or replace function public.commerce_process_kofi_event(
  p_raw_event_id text,
  p_email text,
  p_package_slug text,
  p_payload jsonb default '{}'::jsonb
)
returns table (processed_status text, matched_user_id uuid, credited_amount_bb integer, balance_bb integer, kofi_event_id uuid, note text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_raw_event_id, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_slug text := lower(btrim(coalesce(p_package_slug, '')));
  v_event public.commerce_kofi_events;
  v_pack public.commerce_currency_packs;
  v_pending public.commerce_pending_currency_purchases;
  v_balance integer;
begin
  if v_raw = '' then raise exception 'raw_event_id_required'; end if;

  select * into v_event from public.commerce_kofi_events where raw_event_id = v_raw limit 1;
  if found then
    return query select v_event.processed_status, v_event.matched_user_id, coalesce(v_event.credited_amount_bb,0), null::integer, v_event.id, coalesce(v_event.processed_note,'duplicate_event');
    return;
  end if;

  insert into public.commerce_kofi_events(raw_event_id, email, package_slug, raw_payload, processed_status)
  values (v_raw, nullif(v_email,''), nullif(v_slug,''), coalesce(p_payload, '{}'::jsonb), 'received')
  returning * into v_event;

  select * into v_pack from public.commerce_currency_packs where slug = v_slug and is_active = true limit 1;
  if not found then
    update public.commerce_kofi_events set processed_status='manual_review', processed_note='unknown_or_inactive_package', processed_at=timezone('utc', now()) where id=v_event.id returning * into v_event;
    return query select v_event.processed_status, null::uuid, 0, null::integer, v_event.id, v_event.processed_note;
    return;
  end if;

  select * into v_pending
  from public.commerce_pending_currency_purchases
  where lower(email) = v_email and package_slug = v_slug and status='pending' and expires_at > timezone('utc', now())
  order by created_at desc
  limit 1
  for update;

  if not found then
    update public.commerce_kofi_events set processed_status='manual_review', processed_note='no_matching_pending_purchase', processed_at=timezone('utc', now()) where id=v_event.id returning * into v_event;
    return query select v_event.processed_status, null::uuid, 0, null::integer, v_event.id, v_event.processed_note;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb) values (v_pending.user_id, 0) on conflict (user_id) do nothing;
  select balance_bb into v_balance from public.commerce_wallets where user_id = v_pending.user_id for update;
  v_balance := v_balance + v_pack.total_bb;

  update public.commerce_wallets set balance_bb = v_balance, updated_at = timezone('utc', now()) where user_id = v_pending.user_id;

  insert into public.commerce_wallet_ledger(user_id, entry_type, amount_bb, balance_after, reference_type, reference_id, metadata)
  values (v_pending.user_id, 'kofi_credit', v_pack.total_bb, v_balance, 'kofi_event', v_event.id::text, jsonb_build_object('email', v_email, 'package_slug', v_slug, 'raw_event_id', v_raw));

  update public.commerce_pending_currency_purchases
  set status='matched', matched_kofi_event_id = v_event.id, updated_at = timezone('utc', now())
  where id = v_pending.id;

  update public.commerce_kofi_events
  set matched_user_id = v_pending.user_id, processed_status='credited', credited_amount_bb=v_pack.total_bb, processed_note=null, processed_at=timezone('utc', now())
  where id = v_event.id
  returning * into v_event;

  return query select v_event.processed_status, v_pending.user_id, v_pack.total_bb, v_balance, v_event.id, 'credited';
end;
$$;

create or replace function public.commerce_list_owned_capes()
returns table (
  entitlement_id uuid,
  acquired_at timestamptz,
  source text,
  cape_id uuid,
  slug text,
  name text,
  description text,
  texture_url text,
  preview_url text,
  rarity text,
  rarity_label text,
  rarity_color_start text,
  rarity_color_end text,
  rarity_glow text,
  sort_order integer,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.acquired_at, e.source, c.id, c.slug, c.name, c.description, c.texture_url, c.preview_url,
         c.rarity, c.rarity_label, c.rarity_color_start, c.rarity_color_end, c.rarity_glow, c.sort_order, c.is_active
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = auth.uid()
  order by c.is_featured desc, c.sort_order asc, e.acquired_at desc;
$$;

create or replace function public.commerce_list_wallet_ledger(p_limit integer default 25)
returns setof public.commerce_wallet_ledger
language sql
stable
security definer
set search_path = public
as $$
  select l.* from public.commerce_wallet_ledger l
  where l.user_id = auth.uid()
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

alter table public.commerce_profiles enable row level security;
alter table public.commerce_capes enable row level security;
alter table public.commerce_cape_entitlements enable row level security;
alter table public.commerce_cape_loadout enable row level security;
alter table public.commerce_cape_loadout_public enable row level security;
alter table public.commerce_wallets enable row level security;
alter table public.commerce_wallet_ledger enable row level security;
alter table public.commerce_currency_packs enable row level security;
alter table public.commerce_kofi_events enable row level security;
alter table public.commerce_pending_currency_purchases enable row level security;
alter table public.commerce_hats enable row level security;
alter table public.commerce_hat_entitlements enable row level security;
alter table public.commerce_hat_loadout enable row level security;

create policy commerce_profiles_select_own on public.commerce_profiles for select to authenticated using (auth.uid() = user_id);
create policy commerce_profiles_insert_own on public.commerce_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy commerce_profiles_update_own on public.commerce_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy commerce_profiles_owner_all on public.commerce_profiles for all to authenticated using (public.commerce_is_owner(auth.uid())) with check (public.commerce_is_owner(auth.uid()));

create policy commerce_capes_select_active_public on public.commerce_capes for select to anon, authenticated using (is_active = true);
create policy commerce_capes_owner_write on public.commerce_capes for all to authenticated using (public.commerce_is_owner(auth.uid())) with check (public.commerce_is_owner(auth.uid()));

create policy commerce_cape_entitlements_select_own on public.commerce_cape_entitlements for select to authenticated using (auth.uid() = user_id);
create policy commerce_cape_loadout_select_own on public.commerce_cape_loadout for select to authenticated using (auth.uid() = user_id);
create policy commerce_cape_loadout_insert_own on public.commerce_cape_loadout for insert to authenticated with check (auth.uid() = user_id);
create policy commerce_cape_loadout_update_own on public.commerce_cape_loadout for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy commerce_cape_loadout_public_select on public.commerce_cape_loadout_public for select to anon, authenticated using (true);

create policy commerce_wallets_select_own on public.commerce_wallets for select to authenticated using (auth.uid() = user_id);
create policy commerce_wallet_ledger_select_own on public.commerce_wallet_ledger for select to authenticated using (auth.uid() = user_id);
create policy commerce_currency_packs_select_active_public on public.commerce_currency_packs for select to anon, authenticated using (is_active = true);

create policy commerce_pending_currency_purchases_select_own on public.commerce_pending_currency_purchases for select to authenticated using (auth.uid() = user_id);
create policy commerce_pending_currency_purchases_insert_own on public.commerce_pending_currency_purchases for insert to authenticated with check (auth.uid() = user_id);
create policy commerce_pending_currency_purchases_update_own on public.commerce_pending_currency_purchases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy commerce_hats_select_active_public on public.commerce_hats for select to anon, authenticated using (is_active = true);
create policy commerce_hat_entitlements_select_own on public.commerce_hat_entitlements for select to authenticated using (auth.uid() = user_id);
create policy commerce_hat_loadout_select_own on public.commerce_hat_loadout for select to authenticated using (auth.uid() = user_id);
create policy commerce_hat_loadout_insert_own on public.commerce_hat_loadout for insert to authenticated with check (auth.uid() = user_id);
create policy commerce_hat_loadout_update_own on public.commerce_hat_loadout for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.commerce_cape_loadout_public to anon, authenticated;
grant select on public.commerce_capes to anon, authenticated;
grant select on public.commerce_currency_packs to anon, authenticated;

grant execute on function public.commerce_is_owner(uuid) to anon, authenticated;
grant execute on function public.commerce_sync_identity(text, text, text) to authenticated;
grant execute on function public.commerce_grant_owner_role(uuid) to authenticated;
grant execute on function public.commerce_grant_owner_role_by_identifier(text) to authenticated;
grant execute on function public.create_cape_listing(text, text, integer, text, text, text, text, text, text, text, text, integer, boolean, boolean) to authenticated;
grant execute on function public.purchase_cape(text, boolean) to authenticated;
grant execute on function public.set_cape_loadout(text) to authenticated;
grant execute on function public.commerce_create_pending_currency_purchase(text, text, integer) to authenticated;
grant execute on function public.commerce_list_owned_capes() to authenticated;
grant execute on function public.commerce_list_wallet_ledger(integer) to authenticated;
grant execute on function public.commerce_process_kofi_event(text, text, text, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='commerce_cape_loadout') then
      execute 'alter publication supabase_realtime add table public.commerce_cape_loadout';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='commerce_wallets') then
      execute 'alter publication supabase_realtime add table public.commerce_wallets';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='commerce_cape_loadout_public') then
      execute 'alter publication supabase_realtime add table public.commerce_cape_loadout_public';
    end if;
  end if;
end $$;

insert into public.commerce_currency_packs (
  slug, name, price_usd, base_bb, bonus_bb, total_bb, kofi_url, is_active, sort_order
)
values
  ('usd-20', '$20 => 2000 + 1000 BB', 20, 2000, 1000, 3000, 'https://ko-fi.com/s/76c89cef1c', true, 10),
  ('usd-15', '$15 => 1500 + 500 BB', 15, 1500, 500, 2000, 'https://ko-fi.com/s/bff246840d', true, 20),
  ('usd-10', '$10 => 1000 + 200 BB', 10, 1000, 200, 1200, 'https://ko-fi.com/s/54c170c0c8', true, 30),
  ('usd-5', '$5 => 500 BB', 5, 500, 0, 500, 'https://ko-fi.com/s/5d9fc7810d', true, 40)
on conflict (slug) do update
set
  name = excluded.name,
  price_usd = excluded.price_usd,
  base_bb = excluded.base_bb,
  bonus_bb = excluded.bonus_bb,
  total_bb = excluded.total_bb,
  kofi_url = excluded.kofi_url,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

commit;
