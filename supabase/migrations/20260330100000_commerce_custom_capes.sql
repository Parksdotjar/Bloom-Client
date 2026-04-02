begin;

create extension if not exists pgcrypto;

create table if not exists public.commerce_custom_cape_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_image_path text,
  source_image_url text,
  crop_x numeric(12,6) not null default 0,
  crop_y numeric(12,6) not null default 0,
  crop_width numeric(12,6) not null default 1,
  crop_height numeric(12,6) not null default 0.5,
  export_width integer not null default 2048,
  export_height integer not null default 1024,
  preview_watermarked boolean not null default true,
  purchased boolean not null default false,
  final_asset_path text,
  final_asset_url text,
  generated_cape_id uuid references public.commerce_capes(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (crop_width > 0 and crop_height > 0),
  check (crop_x >= 0 and crop_y >= 0),
  check (crop_x + crop_width <= 1.000001 and crop_y + crop_height <= 1.000001),
  check (export_width >= 64 and export_width <= 4096 and mod(export_width, 64) = 0),
  check (export_height = export_width / 2)
);

create table if not exists public.commerce_custom_cape_exports (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.commerce_custom_cape_designs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cost_bb integer not null default 500,
  idempotency_key text not null,
  transaction_status text not null default 'completed',
  wallet_ledger_id uuid references public.commerce_wallet_ledger(id) on delete set null,
  final_texture_url text,
  exported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (cost_bb >= 0)
);

create unique index if not exists commerce_custom_cape_exports_user_idempotency_idx
  on public.commerce_custom_cape_exports(user_id, idempotency_key);

create index if not exists commerce_custom_cape_designs_user_updated_idx
  on public.commerce_custom_cape_designs(user_id, updated_at desc);

create index if not exists commerce_custom_cape_exports_design_idx
  on public.commerce_custom_cape_exports(design_id, created_at desc);

create or replace function public.commerce_custom_cape_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists commerce_custom_cape_designs_touch_updated_at_trg on public.commerce_custom_cape_designs;
create trigger commerce_custom_cape_designs_touch_updated_at_trg
before update on public.commerce_custom_cape_designs
for each row
execute function public.commerce_custom_cape_touch_updated_at();

drop trigger if exists commerce_custom_cape_exports_touch_updated_at_trg on public.commerce_custom_cape_exports;
create trigger commerce_custom_cape_exports_touch_updated_at_trg
before update on public.commerce_custom_cape_exports
for each row
execute function public.commerce_custom_cape_touch_updated_at();

create or replace function public.commerce_get_latest_custom_cape_design()
returns public.commerce_custom_cape_designs
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.commerce_custom_cape_designs d
  where d.user_id = auth.uid()
  order by d.updated_at desc, d.created_at desc
  limit 1;
$$;

create or replace function public.commerce_create_or_update_custom_cape_draft(
  p_design_id uuid default null,
  p_source_image_path text default null,
  p_source_image_url text default null,
  p_crop_x numeric default null,
  p_crop_y numeric default null,
  p_crop_width numeric default null,
  p_crop_height numeric default null,
  p_export_width integer default 2048
)
returns public.commerce_custom_cape_designs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_design public.commerce_custom_cape_designs;
  v_crop_x numeric(12,6) := greatest(0, least(coalesce(p_crop_x, 0), 1));
  v_crop_y numeric(12,6) := greatest(0, least(coalesce(p_crop_y, 0), 1));
  v_crop_w numeric(12,6) := greatest(0.01, least(coalesce(p_crop_width, 1), 1));
  v_crop_h numeric(12,6) := greatest(0.01, least(coalesce(p_crop_height, 0.5), 1));
  v_export_w integer := greatest(64, least(coalesce(p_export_width, 2048), 4096));
  v_export_h integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_export_w := (v_export_w / 64) * 64;
  v_export_h := v_export_w / 2;

  if (v_crop_x + v_crop_w) > 1 then
    v_crop_x := greatest(0, 1 - v_crop_w);
  end if;
  if (v_crop_y + v_crop_h) > 1 then
    v_crop_y := greatest(0, 1 - v_crop_h);
  end if;

  if p_design_id is null then
    insert into public.commerce_custom_cape_designs(
      user_id,
      source_image_path,
      source_image_url,
      crop_x,
      crop_y,
      crop_width,
      crop_height,
      export_width,
      export_height,
      preview_watermarked
    )
    values (
      v_user_id,
      nullif(btrim(p_source_image_path), ''),
      nullif(btrim(p_source_image_url), ''),
      v_crop_x,
      v_crop_y,
      v_crop_w,
      v_crop_h,
      v_export_w,
      v_export_h,
      true
    )
    returning * into v_design;
  else
    update public.commerce_custom_cape_designs d
    set
      source_image_path = coalesce(nullif(btrim(p_source_image_path), ''), d.source_image_path),
      source_image_url = coalesce(nullif(btrim(p_source_image_url), ''), d.source_image_url),
      crop_x = v_crop_x,
      crop_y = v_crop_y,
      crop_width = v_crop_w,
      crop_height = v_crop_h,
      export_width = v_export_w,
      export_height = v_export_h,
      preview_watermarked = case when d.purchased then false else true end
    where d.id = p_design_id
      and d.user_id = v_user_id
    returning * into v_design;

    if not found then
      raise exception 'design_not_found';
    end if;
  end if;

  return v_design;
end;
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

  if v_wallet_balance < 500 then
    raise exception 'insufficient_balance';
  end if;

  update public.commerce_wallets
  set
    balance_bb = balance_bb - 500,
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
    -500,
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
    500,
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
    500,
    v_new_balance,
    v_design.final_asset_url,
    v_generated_cape_id,
    v_export.exported_at,
    v_export.transaction_status;
end;
$$;

alter table public.commerce_custom_cape_designs enable row level security;
alter table public.commerce_custom_cape_exports enable row level security;

drop policy if exists commerce_custom_cape_designs_select_own on public.commerce_custom_cape_designs;
create policy commerce_custom_cape_designs_select_own
on public.commerce_custom_cape_designs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists commerce_custom_cape_designs_insert_own on public.commerce_custom_cape_designs;
create policy commerce_custom_cape_designs_insert_own
on public.commerce_custom_cape_designs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists commerce_custom_cape_designs_update_own on public.commerce_custom_cape_designs;
create policy commerce_custom_cape_designs_update_own
on public.commerce_custom_cape_designs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists commerce_custom_cape_designs_delete_own on public.commerce_custom_cape_designs;
create policy commerce_custom_cape_designs_delete_own
on public.commerce_custom_cape_designs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists commerce_custom_cape_exports_select_own on public.commerce_custom_cape_exports;
create policy commerce_custom_cape_exports_select_own
on public.commerce_custom_cape_exports
for select
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.commerce_custom_cape_designs to authenticated;
grant select on public.commerce_custom_cape_exports to authenticated;
grant execute on function public.commerce_get_latest_custom_cape_design() to authenticated;
grant execute on function public.commerce_create_or_update_custom_cape_draft(uuid, text, text, numeric, numeric, numeric, numeric, integer) to authenticated;
grant execute on function public.commerce_finalize_custom_cape_export(uuid, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-capes',
  'custom-capes',
  true,
  31457280,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists custom_capes_objects_select_own on storage.objects;
create policy custom_capes_objects_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'custom-capes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists custom_capes_objects_insert_own on storage.objects;
create policy custom_capes_objects_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'custom-capes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists custom_capes_objects_update_own on storage.objects;
create policy custom_capes_objects_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'custom-capes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'custom-capes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists custom_capes_objects_delete_own on storage.objects;
create policy custom_capes_objects_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'custom-capes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_custom_cape_designs'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_custom_cape_designs';
    end if;
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_custom_cape_exports'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_custom_cape_exports';
    end if;
  end if;
end $$;

commit;
