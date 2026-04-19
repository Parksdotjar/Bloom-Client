create table if not exists public.commerce_partner_cashout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_bb integer not null check (requested_bb > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  note text,
  requested_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  processed_note text
);

create index if not exists commerce_partner_cashout_requests_user_idx
  on public.commerce_partner_cashout_requests(user_id, requested_at desc);

alter table public.commerce_partner_cashout_requests enable row level security;

drop policy if exists commerce_partner_cashout_requests_select on public.commerce_partner_cashout_requests;
create policy commerce_partner_cashout_requests_select
  on public.commerce_partner_cashout_requests
  for select
  to authenticated
  using (auth.uid() = user_id or public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_partner_cashout_requests_insert_own on public.commerce_partner_cashout_requests;
create policy commerce_partner_cashout_requests_insert_own
  on public.commerce_partner_cashout_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.commerce_is_partner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = coalesce(p_user_id, auth.uid())
      and p.role = 'partner'
  );
$$;

create or replace function public.commerce_list_own_partner_wallet_ledger(p_limit integer default 25)
returns setof public.commerce_partner_wallet_ledger
language sql
security definer
set search_path = public, auth
as $$
  select l.*
  from public.commerce_partner_wallet_ledger l
  where l.user_id = auth.uid()
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

create or replace function public.commerce_purchase_cape_with_partner_wallet(
  p_cape_slug text,
  p_auto_equip boolean default false
)
returns table (
  cape_id uuid,
  cape_slug text,
  partner_wallet_balance_bb integer,
  equipped_cape_id uuid,
  already_owned boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_cape public.commerce_capes;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.commerce_is_partner(v_user_id) then
    raise exception 'partner_role_required';
  end if;

  select * into v_cape
  from public.commerce_capes
  where slug = lower(btrim(p_cape_slug))
    and is_active = true
  limit 1;
  if not found then
    raise exception 'cape_not_found';
  end if;

  if exists (
    select 1
    from public.commerce_cape_entitlements e
    where e.user_id = v_user_id and e.cape_id = v_cape.id
  ) then
    raise exception 'cape_already_owned';
  end if;

  insert into public.commerce_partner_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select balance_bb into v_balance
  from public.commerce_partner_wallets
  where user_id = v_user_id
  for update;

  if v_balance < v_cape.price_bb then
    raise exception 'insufficient_partner_wallet_balance';
  end if;

  update public.commerce_partner_wallets
  set balance_bb = balance_bb - v_cape.price_bb,
      updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning balance_bb into v_balance;

  insert into public.commerce_partner_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_user_id,
    'partner_wallet_purchase',
    -v_cape.price_bb,
    v_balance,
    'cape',
    v_cape.id::text,
    jsonb_build_object('cape_slug', v_cape.slug)
  );

  insert into public.commerce_cape_entitlements(user_id, cape_id, source, acquired_at, metadata)
  values (
    v_user_id,
    v_cape.id,
    'partner_wallet_purchase',
    timezone('utc', now()),
    jsonb_build_object('cape_slug', v_cape.slug, 'price_bb', v_cape.price_bb)
  );

  if coalesce(p_auto_equip, false) then
    insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
    values (v_user_id, v_cape.id, timezone('utc', now()))
    on conflict (user_id)
    do update set
      equipped_cape_id = excluded.equipped_cape_id,
      updated_at = excluded.updated_at;
  end if;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
    select
      v_cape.id,
      v_cape.slug,
      v_balance,
      (select l.equipped_cape_id from public.commerce_cape_loadout l where l.user_id = v_user_id),
      false;
end;
$$;

create or replace function public.commerce_partner_gift_cape_from_wallet(
  p_cape_slug text,
  p_target_identifier text,
  p_note text default null
)
returns table (
  gifted_to_user_id uuid,
  gifted_to_username text,
  cape_id uuid,
  cape_slug text,
  partner_wallet_balance_bb integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_input text := btrim(coalesce(p_target_identifier, ''));
  v_target_user_id uuid;
  v_target_username text;
  v_cape public.commerce_capes;
  v_balance integer;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.commerce_is_partner(v_user_id) then
    raise exception 'partner_role_required';
  end if;
  if v_target_input = '' then
    raise exception 'target_required';
  end if;

  begin
    v_target_user_id := v_target_input::uuid;
  exception when others then
    v_target_user_id := null;
  end;

  if v_target_user_id is null then
    select count(*), min(p.user_id)
      into v_count, v_target_user_id
    from public.commerce_profiles p
    where lower(coalesce(p.username, '')) = lower(v_target_input)
       or lower(coalesce(p.display_name, '')) = lower(v_target_input)
       or lower(coalesce(p.mc_uuid, '')) = lower(v_target_input);

    if coalesce(v_count, 0) = 0 then
      raise exception 'target_not_found';
    end if;
    if v_count > 1 then
      raise exception 'ambiguous_target_identifier';
    end if;
  end if;

  if v_target_user_id = v_user_id then
    raise exception 'cannot_gift_to_self';
  end if;

  select * into v_cape
  from public.commerce_capes
  where slug = lower(btrim(p_cape_slug))
    and is_active = true
  limit 1;
  if not found then
    raise exception 'cape_not_found';
  end if;

  if exists (
    select 1
    from public.commerce_cape_entitlements e
    where e.user_id = v_target_user_id and e.cape_id = v_cape.id
  ) then
    raise exception 'target_already_owns_cape';
  end if;

  insert into public.commerce_partner_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select balance_bb into v_balance
  from public.commerce_partner_wallets
  where user_id = v_user_id
  for update;

  if v_balance < v_cape.price_bb then
    raise exception 'insufficient_partner_wallet_balance';
  end if;

  update public.commerce_partner_wallets
  set balance_bb = balance_bb - v_cape.price_bb,
      updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning balance_bb into v_balance;

  insert into public.commerce_partner_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_user_id,
    'partner_wallet_gift',
    -v_cape.price_bb,
    v_balance,
    'cape_gift',
    v_cape.id::text,
    jsonb_build_object(
      'cape_slug', v_cape.slug,
      'gift_to_user_id', v_target_user_id,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  insert into public.commerce_cape_entitlements(user_id, cape_id, source, acquired_at, metadata)
  values (
    v_target_user_id,
    v_cape.id,
    'partner_gift',
    timezone('utc', now()),
    jsonb_build_object('cape_slug', v_cape.slug, 'gifted_by_user_id', v_user_id)
  );

  select p.username into v_target_username
  from public.commerce_profiles p
  where p.user_id = v_target_user_id;

  return query
    select
      v_target_user_id,
      v_target_username,
      v_cape.id,
      v_cape.slug,
      v_balance;
end;
$$;

create or replace function public.commerce_partner_request_cashout(
  p_amount_bb integer,
  p_note text default null
)
returns public.commerce_partner_cashout_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet_balance integer;
  v_row public.commerce_partner_cashout_requests;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.commerce_is_partner(v_user_id) then
    raise exception 'partner_role_required';
  end if;
  if coalesce(p_amount_bb, 0) < 900 then
    raise exception 'cashout_minimum_900_bb';
  end if;

  insert into public.commerce_partner_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select balance_bb into v_wallet_balance
  from public.commerce_partner_wallets
  where user_id = v_user_id;

  if coalesce(v_wallet_balance, 0) < p_amount_bb then
    raise exception 'insufficient_partner_wallet_balance';
  end if;

  insert into public.commerce_partner_cashout_requests(user_id, requested_bb, note)
  values (v_user_id, p_amount_bb, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.commerce_owner_list_partner_cashout_requests()
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  requested_bb integer,
  status text,
  note text,
  requested_at timestamptz,
  processed_at timestamptz,
  processed_by uuid,
  processed_note text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    r.id,
    r.user_id,
    p.username,
    p.display_name,
    r.requested_bb,
    r.status,
    r.note,
    r.requested_at,
    r.processed_at,
    r.processed_by,
    r.processed_note
  from public.commerce_partner_cashout_requests r
  left join public.commerce_profiles p on p.user_id = r.user_id
  order by r.requested_at desc;
$$;

create or replace function public.commerce_owner_process_partner_cashout(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns public.commerce_partner_cashout_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(coalesce(nullif(trim(p_action), ''), ''));
  v_request public.commerce_partner_cashout_requests;
  v_wallet_balance integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and not public.commerce_is_owner(v_user_id) then
    raise exception 'owner_role_required';
  end if;
  if v_action not in ('approve', 'paid', 'reject') then
    raise exception 'invalid_action';
  end if;

  select * into v_request
  from public.commerce_partner_cashout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'cashout_request_not_found';
  end if;
  if v_request.status <> 'pending' and v_action <> 'paid' then
    raise exception 'cashout_request_not_pending';
  end if;

  if v_action = 'paid' then
    insert into public.commerce_partner_wallets(user_id, balance_bb)
    values (v_request.user_id, 0)
    on conflict (user_id) do nothing;

    select balance_bb into v_wallet_balance
    from public.commerce_partner_wallets
    where user_id = v_request.user_id
    for update;

    if v_wallet_balance < v_request.requested_bb then
      raise exception 'insufficient_partner_wallet_balance';
    end if;

    update public.commerce_partner_wallets
    set balance_bb = balance_bb - v_request.requested_bb,
        updated_at = timezone('utc', now())
    where user_id = v_request.user_id
    returning balance_bb into v_wallet_balance;

    insert into public.commerce_partner_wallet_ledger(
      user_id,
      entry_type,
      amount_bb,
      balance_after,
      reference_type,
      reference_id,
      metadata
    )
    values (
      v_request.user_id,
      'partner_cashout_paid',
      -v_request.requested_bb,
      v_wallet_balance,
      'cashout_request',
      v_request.id::text,
      jsonb_build_object('processed_by', v_user_id)
    );
  end if;

  update public.commerce_partner_cashout_requests
  set status = case
      when v_action = 'approve' then 'approved'
      when v_action = 'reject' then 'rejected'
      else 'paid'
    end,
    processed_at = timezone('utc', now()),
    processed_by = v_user_id,
    processed_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.commerce_is_partner(uuid) from public;
grant execute on function public.commerce_is_partner(uuid) to authenticated, anon;

revoke all on function public.commerce_list_own_partner_wallet_ledger(integer) from public;
grant execute on function public.commerce_list_own_partner_wallet_ledger(integer) to authenticated, anon;

revoke all on function public.commerce_purchase_cape_with_partner_wallet(text, boolean) from public;
grant execute on function public.commerce_purchase_cape_with_partner_wallet(text, boolean) to authenticated, anon;

revoke all on function public.commerce_partner_gift_cape_from_wallet(text, text, text) from public;
grant execute on function public.commerce_partner_gift_cape_from_wallet(text, text, text) to authenticated, anon;

revoke all on function public.commerce_partner_request_cashout(integer, text) from public;
grant execute on function public.commerce_partner_request_cashout(integer, text) to authenticated, anon;

revoke all on function public.commerce_owner_list_partner_cashout_requests() from public;
grant execute on function public.commerce_owner_list_partner_cashout_requests() to authenticated, anon;

revoke all on function public.commerce_owner_process_partner_cashout(uuid, text, text) from public;
grant execute on function public.commerce_owner_process_partner_cashout(uuid, text, text) to authenticated, anon;
