begin;

-- Currency pack mapping column: Tebex package -> MCsets price.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'commerce_currency_packs'
      and column_name = 'tebex_package_id'
  ) then
    execute 'alter table public.commerce_currency_packs rename column tebex_package_id to mcsets_price_id';
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'commerce_currency_packs'
      and column_name = 'mcsets_price_id'
  ) then
    execute 'alter table public.commerce_currency_packs add column mcsets_price_id text';
  end if;
end $$;

drop index if exists public.commerce_currency_packs_tebex_package_id_idx;
create unique index if not exists commerce_currency_packs_mcsets_price_id_idx
  on public.commerce_currency_packs (mcsets_price_id)
  where mcsets_price_id is not null and btrim(mcsets_price_id) <> '';

-- Event ledger table: rename Tebex table when present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'commerce_tebex_events'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'commerce_mcsets_events'
  ) then
    execute 'alter table public.commerce_tebex_events rename to commerce_mcsets_events';
  end if;
end $$;

create table if not exists public.commerce_mcsets_events (
  id uuid primary key default gen_random_uuid(),
  mcsets_event_id text not null unique,
  mcsets_session_id text,
  email text,
  package_slug text,
  mcsets_price_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  matched_user_id uuid references auth.users(id) on delete set null,
  processed_status text not null default 'received',
  processed_note text,
  credited_amount_bb integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.commerce_mcsets_events enable row level security;

-- Rename legacy columns when table came from Tebex migration.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commerce_mcsets_events' and column_name = 'tebex_webhook_id'
  ) then
    execute 'alter table public.commerce_mcsets_events rename column tebex_webhook_id to mcsets_event_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commerce_mcsets_events' and column_name = 'tebex_transaction_id'
  ) then
    execute 'alter table public.commerce_mcsets_events rename column tebex_transaction_id to mcsets_session_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commerce_mcsets_events' and column_name = 'tebex_package_id'
  ) then
    execute 'alter table public.commerce_mcsets_events rename column tebex_package_id to mcsets_price_id';
  end if;
end $$;

drop function if exists public.commerce_process_tebex_payment_event(text, text, text, text, text, uuid, jsonb);

drop function if exists public.commerce_process_mcsets_payment_event(text, text, text, text, text, uuid, jsonb);
create or replace function public.commerce_process_mcsets_payment_event(
  p_mcsets_event_id text,
  p_mcsets_session_id text default null,
  p_email text default null,
  p_package_slug text default null,
  p_mcsets_price_id text default null,
  p_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns table (
  processed_status text,
  matched_user_id uuid,
  credited_amount_bb integer,
  balance_bb integer,
  mcsets_event_row_id uuid,
  note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text := btrim(coalesce(p_mcsets_event_id, ''));
  v_session_id text := nullif(btrim(coalesce(p_mcsets_session_id, '')), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_slug text := lower(btrim(coalesce(p_package_slug, '')));
  v_mcsets_price_id text := nullif(btrim(coalesce(p_mcsets_price_id, '')), '');
  v_target_user_id uuid := p_user_id;
  v_existing public.commerce_mcsets_events;
  v_event public.commerce_mcsets_events;
  v_pack public.commerce_currency_packs;
  v_balance integer;
  v_email_user_ids uuid[];
  v_email_user_count integer := 0;
begin
  if v_event_id = '' then
    raise exception 'mcsets_event_id_required';
  end if;

  select * into v_existing
  from public.commerce_mcsets_events
  where mcsets_event_id = v_event_id
  limit 1;
  if found then
    return query
    select
      v_existing.processed_status,
      v_existing.matched_user_id,
      coalesce(v_existing.credited_amount_bb, 0),
      null::integer,
      v_existing.id,
      coalesce(v_existing.processed_note, 'duplicate_event');
    return;
  end if;

  insert into public.commerce_mcsets_events (
    mcsets_event_id,
    mcsets_session_id,
    email,
    package_slug,
    mcsets_price_id,
    raw_payload,
    processed_status
  )
  values (
    v_event_id,
    v_session_id,
    nullif(v_email, ''),
    nullif(v_slug, ''),
    v_mcsets_price_id,
    coalesce(p_payload, '{}'::jsonb),
    'received'
  )
  returning * into v_event;

  if v_slug <> '' then
    select * into v_pack
    from public.commerce_currency_packs
    where slug = v_slug and is_active = true
    limit 1;
  end if;

  if not found and v_mcsets_price_id is not null then
    select * into v_pack
    from public.commerce_currency_packs
    where mcsets_price_id = v_mcsets_price_id and is_active = true
    limit 1;
  end if;

  if not found then
    update public.commerce_mcsets_events
    set processed_status = 'manual_review',
        processed_note = 'unknown_or_inactive_package',
        processed_at = timezone('utc', now())
    where id = v_event.id
    returning * into v_event;

    return query
    select v_event.processed_status, null::uuid, 0, null::integer, v_event.id, v_event.processed_note;
    return;
  end if;

  if v_target_user_id is null and v_email <> '' then
    select array_agg(u.id), count(*)
    into v_email_user_ids, v_email_user_count
    from auth.users u
    where lower(coalesce(u.email, '')) = v_email;

    if v_email_user_count = 1 then
      v_target_user_id := v_email_user_ids[1];
    end if;
  end if;

  if v_target_user_id is null then
    update public.commerce_mcsets_events
    set processed_status = 'manual_review',
        processed_note = 'no_matching_user',
        processed_at = timezone('utc', now())
    where id = v_event.id
    returning * into v_event;

    return query
    select v_event.processed_status, null::uuid, 0, null::integer, v_event.id, v_event.processed_note;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_target_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb into v_balance
  from public.commerce_wallets w
  where w.user_id = v_target_user_id
  for update;

  v_balance := v_balance + v_pack.total_bb;

  update public.commerce_wallets
  set balance_bb = v_balance,
      updated_at = timezone('utc', now())
  where user_id = v_target_user_id;

  insert into public.commerce_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_target_user_id,
    'mcsets_credit',
    v_pack.total_bb,
    v_balance,
    'mcsets_event',
    v_event.id::text,
    jsonb_build_object(
      'email', nullif(v_email, ''),
      'package_slug', v_pack.slug,
      'mcsets_event_id', v_event_id,
      'mcsets_session_id', v_session_id,
      'mcsets_price_id', coalesce(v_mcsets_price_id, nullif(v_pack.mcsets_price_id, ''))
    )
  );

  update public.commerce_mcsets_events
  set matched_user_id = v_target_user_id,
      package_slug = v_pack.slug,
      mcsets_price_id = coalesce(v_mcsets_price_id, nullif(v_pack.mcsets_price_id, '')),
      processed_status = 'credited',
      credited_amount_bb = v_pack.total_bb,
      processed_note = null,
      processed_at = timezone('utc', now())
  where id = v_event.id
  returning * into v_event;

  return query
  select
    v_event.processed_status,
    v_target_user_id,
    v_pack.total_bb,
    v_balance,
    v_event.id,
    'credited';
end;
$$;

grant execute on function public.commerce_process_mcsets_payment_event(text, text, text, text, text, uuid, jsonb) to service_role;

commit;
