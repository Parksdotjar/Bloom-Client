begin;

create table if not exists public.commerce_custom_cape_reward_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  code_length integer not null,
  charset text not null,
  is_active boolean not null default true,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  last_used_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (code_length between 4 and 64),
  check (charset in ('letters', 'numbers', 'both')),
  check (max_uses >= 1),
  check (used_count >= 0)
);

create unique index if not exists commerce_custom_cape_reward_codes_code_lower_uidx
  on public.commerce_custom_cape_reward_codes (lower(code));

create table if not exists public.commerce_custom_cape_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_code_id uuid not null references public.commerce_custom_cape_reward_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists commerce_custom_cape_reward_redemptions_code_user_uidx
  on public.commerce_custom_cape_reward_redemptions (reward_code_id, user_id);

create index if not exists commerce_custom_cape_reward_redemptions_user_created_idx
  on public.commerce_custom_cape_reward_redemptions (user_id, created_at desc);

create table if not exists public.commerce_custom_cape_free_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_remaining integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  check (credits_remaining >= 0)
);

drop trigger if exists trg_commerce_custom_cape_reward_codes_updated_at on public.commerce_custom_cape_reward_codes;
create trigger trg_commerce_custom_cape_reward_codes_updated_at
before update on public.commerce_custom_cape_reward_codes
for each row execute function public.set_updated_at();

create or replace function public.commerce_owner_generate_custom_cape_reward_code(
  p_code_length integer default 12,
  p_charset text default 'both'
)
returns table (
  id uuid,
  code text,
  code_length integer,
  charset text,
  is_active boolean,
  max_uses integer,
  used_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_len integer := greatest(4, least(coalesce(p_code_length, 12), 64));
  v_charset text := lower(coalesce(nullif(trim(p_charset), ''), 'both'));
  v_pool text;
  v_code text;
  v_try integer := 0;
  v_pick integer;
  v_row public.commerce_custom_cape_reward_codes%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_user_id) then
    raise exception 'owner_role_required';
  end if;

  if v_charset not in ('letters', 'numbers', 'both') then
    v_charset := 'both';
  end if;

  v_pool := case v_charset
    when 'letters' then 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    when 'numbers' then '23456789'
    else 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  end;

  loop
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'code_generation_failed';
    end if;

    v_code := '';
    for v_pick in 1..v_len loop
      v_code := v_code || substr(v_pool, floor(random() * length(v_pool) + 1)::integer, 1);
    end loop;

    begin
      insert into public.commerce_custom_cape_reward_codes (
        code,
        code_length,
        charset,
        is_active,
        max_uses,
        used_count,
        created_by
      ) values (
        v_code,
        v_len,
        v_charset,
        true,
        1,
        0,
        v_user_id
      )
      returning * into v_row;
      exit;
    exception
      when unique_violation then
        -- retry on code collision
        null;
    end;
  end loop;

  return query
  select v_row.id, v_row.code, v_row.code_length, v_row.charset, v_row.is_active, v_row.max_uses, v_row.used_count, v_row.created_at;
end;
$$;

create or replace function public.commerce_owner_list_custom_cape_reward_codes(
  p_limit integer default 100
)
returns table (
  id uuid,
  code text,
  code_length integer,
  charset text,
  is_active boolean,
  max_uses integer,
  used_count integer,
  created_by uuid,
  last_used_by uuid,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.code,
    c.code_length,
    c.charset,
    c.is_active,
    c.max_uses,
    c.used_count,
    c.created_by,
    c.last_used_by,
    c.last_used_at,
    c.created_at,
    c.updated_at
  from public.commerce_custom_cape_reward_codes c
  where public.commerce_is_owner(auth.uid())
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.commerce_redeem_custom_cape_reward_code(
  p_code text
)
returns table (
  code text,
  credits_remaining integer,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_input_code text := upper(trim(coalesce(p_code, '')));
  v_row public.commerce_custom_cape_reward_codes%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_credits integer;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if v_input_code = '' then
    raise exception 'reward_code_required';
  end if;

  select *
  into v_row
  from public.commerce_custom_cape_reward_codes c
  where upper(c.code) = v_input_code
  limit 1
  for update;

  if not found then
    raise exception 'reward_code_not_found';
  end if;

  if not coalesce(v_row.is_active, false) then
    raise exception 'reward_code_inactive';
  end if;

  if coalesce(v_row.used_count, 0) >= coalesce(v_row.max_uses, 1) then
    raise exception 'reward_code_already_used';
  end if;

  insert into public.commerce_custom_cape_reward_redemptions (reward_code_id, user_id, code)
  values (v_row.id, v_user_id, v_row.code);

  update public.commerce_custom_cape_reward_codes c
  set
    used_count = coalesce(c.used_count, 0) + 1,
    is_active = (coalesce(c.used_count, 0) + 1) < coalesce(c.max_uses, 1),
    last_used_by = v_user_id,
    last_used_at = v_now,
    updated_at = v_now
  where c.id = v_row.id
  returning * into v_row;

  insert into public.commerce_custom_cape_free_credits (user_id, credits_remaining, updated_at)
  values (v_user_id, 1, v_now)
  on conflict (user_id) do update
    set credits_remaining = public.commerce_custom_cape_free_credits.credits_remaining + 1,
        updated_at = v_now
  returning credits_remaining into v_credits;

  return query
  select v_row.code, v_credits, v_now;
end;
$$;

create or replace function public.commerce_get_own_custom_cape_free_credits()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.credits_remaining
    from public.commerce_custom_cape_free_credits c
    where c.user_id = auth.uid()
    limit 1
  ), 0);
$$;

create or replace function public.commerce_finalize_custom_cape_export(
  p_design_id uuid,
  p_final_asset_path text,
  p_final_asset_url text,
  p_idempotency_key text
)
returns table (
  design_id uuid,
  charged_bb integer,
  new_balance_bb integer,
  final_asset_url text,
  generated_cape_id uuid,
  exported_at timestamptz,
  transaction_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_design public.commerce_custom_cape_designs;
  v_export public.commerce_custom_cape_exports;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_final_path text := btrim(coalesce(p_final_asset_path, ''));
  v_final_url text := btrim(coalesce(p_final_asset_url, ''));
  v_wallet_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
  v_generated_cape_id uuid;
  v_slug text;
  v_display_name text;
  v_exported_at timestamptz := timezone('utc', now());
  v_cost_bb integer := 800;
  v_charged_bb integer := 0;
  v_free_credits integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_design_id is null then
    raise exception 'design_id_required';
  end if;
  if v_key = '' then
    raise exception 'idempotency_key_required';
  end if;
  if v_final_path = '' or v_final_url = '' then
    raise exception 'final_asset_required';
  end if;

  select * into v_export
  from public.commerce_custom_cape_exports
  where user_id = v_user_id
    and idempotency_key = v_key
  limit 1;

  if found then
    select d.* into v_design
    from public.commerce_custom_cape_designs d
    where d.id = v_export.design_id
      and d.user_id = v_user_id
    limit 1;

    return query
    select
      v_export.design_id,
      0,
      coalesce((select w.balance_bb from public.commerce_wallets w where w.user_id = v_user_id), 0),
      coalesce(v_design.final_asset_url, v_export.final_texture_url, v_final_url),
      v_design.generated_cape_id,
      coalesce(v_export.exported_at, v_export.created_at),
      v_export.transaction_status;
    return;
  end if;

  select * into v_design
  from public.commerce_custom_cape_designs
  where id = p_design_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'design_not_found';
  end if;

  if coalesce(v_design.source_image_path, '') = '' then
    raise exception 'draft_source_missing';
  end if;

  if v_design.purchased then
    insert into public.commerce_custom_cape_exports(
      design_id,
      user_id,
      cost_bb,
      idempotency_key,
      transaction_status,
      wallet_ledger_id,
      final_texture_url,
      exported_at
    )
    values (
      v_design.id,
      v_user_id,
      0,
      v_key,
      'already_purchased',
      null,
      coalesce(v_design.final_asset_url, v_final_url),
      timezone('utc', now())
    )
    returning * into v_export;

    return query
    select
      v_design.id,
      0,
      coalesce((select w.balance_bb from public.commerce_wallets w where w.user_id = v_user_id), 0),
      coalesce(v_design.final_asset_url, v_final_url),
      v_design.generated_cape_id,
      v_export.exported_at,
      v_export.transaction_status;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  select coalesce(c.credits_remaining, 0)
  into v_free_credits
  from public.commerce_custom_cape_free_credits c
  where c.user_id = v_user_id
  for update;

  if coalesce(v_free_credits, 0) > 0 then
    update public.commerce_custom_cape_free_credits c
    set
      credits_remaining = greatest(0, c.credits_remaining - 1),
      updated_at = timezone('utc', now())
    where c.user_id = v_user_id
    returning credits_remaining into v_free_credits;

    v_new_balance := v_wallet_balance;
    v_charged_bb := 0;
  else
    if v_wallet_balance < v_cost_bb then
      raise exception 'insufficient_balance';
    end if;

    update public.commerce_wallets
    set
      balance_bb = balance_bb - v_cost_bb,
      updated_at = timezone('utc', now())
    where user_id = v_user_id
    returning balance_bb into v_new_balance;

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
      v_user_id,
      'custom_cape_export',
      -v_cost_bb,
      v_new_balance,
      'custom_cape_design',
      v_design.id::text,
      jsonb_build_object(
        'idempotency_key', v_key,
        'design_id', v_design.id::text,
        'final_asset_path', v_final_path
      )
    )
    returning id into v_ledger_id;

    v_charged_bb := v_cost_bb;
  end if;

  v_generated_cape_id := v_design.generated_cape_id;
  if v_generated_cape_id is null then
    v_slug := lower(format(
      'custom-%s-%s',
      replace(v_user_id::text, '-', ''),
      substring(replace(v_design.id::text, '-', '') from 1 for 8)
    ));
    select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Custom Cape')
    into v_display_name
    from public.commerce_profiles p
    where p.user_id = v_user_id
    limit 1;

    insert into public.commerce_capes(
      slug,
      name,
      description,
      texture_url,
      preview_url,
      price_bb,
      rarity,
      rarity_label,
      rarity_color_start,
      rarity_color_end,
      rarity_glow,
      sort_order,
      is_active,
      is_featured,
      created_by
    )
    values (
      v_slug,
      coalesce(v_display_name, 'Custom Cape'),
      'User generated custom cape',
      v_final_url,
      null,
      0,
      'custom',
      'Custom',
      '#8f58ff',
      '#2f1f53',
      'rgba(143, 88, 255, 0.35)',
      9999,
      false,
      false,
      v_user_id
    )
    returning id into v_generated_cape_id;

    insert into public.commerce_cape_entitlements(user_id, cape_id, source, metadata)
    values (
      v_user_id,
      v_generated_cape_id,
      'custom_export',
      jsonb_build_object('design_id', v_design.id::text)
    )
    on conflict (user_id, cape_id) do nothing;
  else
    update public.commerce_capes c
    set
      texture_url = v_final_url,
      updated_at = timezone('utc', now())
    where c.id = v_generated_cape_id;
  end if;

  insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
  values (v_user_id, v_generated_cape_id, timezone('utc', now()))
  on conflict (user_id) do update
  set
    equipped_cape_id = excluded.equipped_cape_id,
    updated_at = excluded.updated_at;

  update public.commerce_custom_cape_designs d
  set
    purchased = true,
    preview_watermarked = false,
    final_asset_path = v_final_path,
    final_asset_url = v_final_url,
    generated_cape_id = v_generated_cape_id,
    updated_at = timezone('utc', now())
  where d.id = v_design.id
  returning * into v_design;

  insert into public.commerce_custom_cape_exports(
    design_id,
    user_id,
    cost_bb,
    idempotency_key,
    transaction_status,
    wallet_ledger_id,
    final_texture_url,
    exported_at
  )
  values (
    v_design.id,
    v_user_id,
    v_charged_bb,
    v_key,
    'completed',
    v_ledger_id,
    v_final_url,
    v_exported_at
  )
  returning * into v_export;

  perform public.commerce_refresh_public_loadout_for_user(v_user_id);

  return query
  select
    v_design.id,
    v_charged_bb,
    v_new_balance,
    v_design.final_asset_url,
    v_generated_cape_id,
    v_export.exported_at,
    v_export.transaction_status;
end;
$$;

alter table public.commerce_custom_cape_reward_codes enable row level security;
alter table public.commerce_custom_cape_reward_redemptions enable row level security;
alter table public.commerce_custom_cape_free_credits enable row level security;

drop policy if exists commerce_custom_cape_reward_codes_owner_all on public.commerce_custom_cape_reward_codes;
create policy commerce_custom_cape_reward_codes_owner_all
on public.commerce_custom_cape_reward_codes
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_custom_cape_reward_redemptions_owner_read on public.commerce_custom_cape_reward_redemptions;
create policy commerce_custom_cape_reward_redemptions_owner_read
on public.commerce_custom_cape_reward_redemptions
for select
to authenticated
using (public.commerce_is_owner(auth.uid()) or auth.uid() = user_id);

drop policy if exists commerce_custom_cape_free_credits_select_own on public.commerce_custom_cape_free_credits;
create policy commerce_custom_cape_free_credits_select_own
on public.commerce_custom_cape_free_credits
for select
to authenticated
using (auth.uid() = user_id or public.commerce_is_owner(auth.uid()));

grant select, insert, update, delete on public.commerce_custom_cape_reward_codes to authenticated;
grant select on public.commerce_custom_cape_reward_redemptions to authenticated;
grant select on public.commerce_custom_cape_free_credits to authenticated;

grant execute on function public.commerce_owner_generate_custom_cape_reward_code(integer, text) to authenticated;
grant execute on function public.commerce_owner_list_custom_cape_reward_codes(integer) to authenticated;
grant execute on function public.commerce_redeem_custom_cape_reward_code(text) to authenticated;
grant execute on function public.commerce_get_own_custom_cape_free_credits() to authenticated;

grant execute on function public.commerce_finalize_custom_cape_export(uuid, text, text, text) to authenticated;

commit;
