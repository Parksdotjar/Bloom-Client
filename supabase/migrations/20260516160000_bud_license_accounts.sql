begin;

create extension if not exists pgcrypto;

alter table public.commerce_profiles
  add column if not exists email text,
  add column if not exists bud_license_status text not null default 'none'
    check (bud_license_status in ('none', 'pending', 'active', 'expired', 'revoked')),
  add column if not exists bud_plan text
    check (bud_plan in ('lifetime', 'monthly'));

create table if not exists public.bud_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  plan text not null check (plan in ('lifetime', 'monthly')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'failed', 'refunded')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  mcsets_session_id text unique,
  mcsets_subscription_id text,
  mcsets_event_id text unique,
  mode text not null default 'live' check (mode in ('test', 'live')),
  raw_payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bud_license_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  purchase_id uuid references public.bud_purchases(id) on delete set null,
  license_key_hash text not null unique,
  product text not null default 'bud' check (product = 'bud'),
  plan text not null check (plan in ('lifetime', 'monthly')),
  activated boolean not null default false,
  activated_at timestamptz,
  device_hint text,
  expires_at timestamptz,
  revoked boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bud_activation_attempts (
  id bigserial primary key,
  username text,
  license_key_hash text,
  ip_address inet,
  device_hint text,
  success boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.bud_purchases enable row level security;
alter table public.bud_license_keys enable row level security;
alter table public.bud_activation_attempts enable row level security;

revoke all on public.bud_purchases from anon, authenticated;
revoke all on public.bud_license_keys from anon, authenticated;
revoke all on public.bud_activation_attempts from anon, authenticated;

grant select on public.bud_purchases to authenticated;
grant select on public.bud_license_keys to authenticated;
grant all on public.bud_purchases to service_role;
grant all on public.bud_license_keys to service_role;
grant all on public.bud_activation_attempts to service_role;

drop policy if exists bud_purchases_select_own on public.bud_purchases;
create policy bud_purchases_select_own on public.bud_purchases
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists bud_license_keys_select_own on public.bud_license_keys;
create policy bud_license_keys_select_own on public.bud_license_keys
  for select to authenticated
  using (auth.uid() = user_id);

create index if not exists bud_purchases_user_status_idx on public.bud_purchases(user_id, status, created_at desc);
create index if not exists bud_license_keys_user_product_idx on public.bud_license_keys(user_id, product, created_at desc);
create index if not exists bud_activation_attempts_lookup_idx on public.bud_activation_attempts(username, license_key_hash, created_at desc);
create index if not exists bud_activation_attempts_ip_idx on public.bud_activation_attempts(ip_address, created_at desc);

commit;
