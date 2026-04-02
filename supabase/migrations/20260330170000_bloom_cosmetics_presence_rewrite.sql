begin;

create extension if not exists pgcrypto;

create table if not exists public.bloom_cosmetic_presence_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  minecraft_uuid text not null,
  launcher_session_id text not null,
  online_status text not null default 'online',
  current_server_id text,
  connected_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (launcher_session_id)
);

create index if not exists bloom_cosmetic_presence_sessions_user_idx
  on public.bloom_cosmetic_presence_sessions(user_id, last_seen_at desc);

create index if not exists bloom_cosmetic_presence_sessions_mc_uuid_idx
  on public.bloom_cosmetic_presence_sessions(minecraft_uuid, last_seen_at desc);

create table if not exists public.bloom_cosmetic_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  minecraft_uuid text not null,
  event_type text not null,
  cosmetic_type text not null default 'cape',
  cosmetic_asset_id uuid,
  asset_version bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists bloom_cosmetic_events_user_created_idx
  on public.bloom_cosmetic_events(user_id, created_at desc);

create index if not exists bloom_cosmetic_events_mc_uuid_created_idx
  on public.bloom_cosmetic_events(minecraft_uuid, created_at desc);

create or replace view public.bloom_current_equipped_capes as
select
  p.user_id,
  p.mc_uuid as minecraft_uuid,
  l.equipped_cape_id as cosmetic_asset_id,
  c.slug,
  c.name,
  c.texture_url,
  c.preview_url,
  c.rarity,
  c.rarity_label,
  c.updated_at as asset_updated_at,
  l.updated_at as equipped_updated_at
from public.commerce_profiles p
left join public.commerce_cape_loadout l on l.user_id = p.user_id
left join public.commerce_capes c on c.id = l.equipped_cape_id
where p.mc_uuid is not null and btrim(p.mc_uuid) <> '';

alter table public.bloom_cosmetic_presence_sessions enable row level security;
alter table public.bloom_cosmetic_events enable row level security;

drop policy if exists bloom_presence_select_own on public.bloom_cosmetic_presence_sessions;
create policy bloom_presence_select_own
on public.bloom_cosmetic_presence_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists bloom_presence_insert_own on public.bloom_cosmetic_presence_sessions;
create policy bloom_presence_insert_own
on public.bloom_cosmetic_presence_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists bloom_presence_update_own on public.bloom_cosmetic_presence_sessions;
create policy bloom_presence_update_own
on public.bloom_cosmetic_presence_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists bloom_events_select_own on public.bloom_cosmetic_events;
create policy bloom_events_select_own
on public.bloom_cosmetic_events
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.bloom_current_equipped_capes to anon, authenticated;
grant select, insert, update on public.bloom_cosmetic_presence_sessions to authenticated;
grant select on public.bloom_cosmetic_events to authenticated;

commit;
