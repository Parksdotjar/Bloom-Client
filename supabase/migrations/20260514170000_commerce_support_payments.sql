begin;

create table if not exists public.commerce_support_payments (
  id uuid primary key default gen_random_uuid(),
  mcsets_session_id text not null unique,
  mcsets_event_id text unique,
  option_slug text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  customer_email text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'failed')),
  mode text not null default 'live' check (mode in ('test', 'live')),
  raw_payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.commerce_support_payments enable row level security;

revoke all on public.commerce_support_payments from anon, authenticated;
grant all on public.commerce_support_payments to service_role;

create index if not exists commerce_support_payments_status_created_idx
  on public.commerce_support_payments (status, created_at desc);

commit;
