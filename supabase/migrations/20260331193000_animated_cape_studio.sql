begin;

create extension if not exists pgcrypto;

alter table if exists public.commerce_wallet_ledger
  add column if not exists idempotency_key text;

create unique index if not exists commerce_wallet_ledger_idempotency_key_idx
  on public.commerce_wallet_ledger (idempotency_key)
  where idempotency_key is not null;

alter table if exists public.commerce_capes
  add column if not exists cosmetic_type text not null default 'cape';

alter table if exists public.commerce_capes
  add column if not exists visibility text not null default 'private';

alter table if exists public.commerce_capes
  add column if not exists disabled boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'commerce_capes'
      and constraint_name = 'commerce_capes_visibility_check'
  ) then
    alter table public.commerce_capes
      add constraint commerce_capes_visibility_check
      check (visibility in ('private', 'public', 'unlisted'));
  end if;
end $$;

create table if not exists public.commerce_animated_cape_tiers (
  fps integer not null,
  duration_seconds integer not null,
  cost_bb bigint not null check (cost_bb > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fps, duration_seconds),
  check (fps in (12, 15, 24)),
  check (duration_seconds in (3, 4, 5)),
  check (not (fps = 24 and duration_seconds in (4, 5)))
);

insert into public.commerce_animated_cape_tiers (fps, duration_seconds, cost_bb, is_enabled)
values
  (12, 3, 1500, true),
  (12, 4, 1600, true),
  (12, 5, 1800, true),
  (15, 3, 2000, true),
  (15, 4, 2100, true),
  (15, 5, 2200, true),
  (24, 3, 2800, true)
on conflict (fps, duration_seconds) do update
set
  cost_bb = excluded.cost_bb,
  is_enabled = excluded.is_enabled,
  updated_at = timezone('utc', now());

create table if not exists public.commerce_uploaded_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('gif', 'mp4')),
  bucket_id text not null default 'animated-cape-uploads',
  storage_path text not null unique,
  original_file_name text,
  content_type text,
  file_size_bytes bigint,
  source_duration_ms integer,
  source_width integer,
  source_height integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (file_size_bytes is null or file_size_bytes > 0),
  check (source_duration_ms is null or source_duration_ms > 0),
  check (source_width is null or source_width > 0),
  check (source_height is null or source_height > 0)
);

create table if not exists public.commerce_animated_cape_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_media_id uuid not null references public.commerce_uploaded_media(id) on delete restrict,
  source_type text not null check (source_type in ('gif', 'mp4')),
  source_storage_path text not null,
  selected_fps integer not null check (selected_fps in (12, 15, 24)),
  selected_duration_seconds integer not null check (selected_duration_seconds in (3, 4, 5)),
  cost_bloom_bucks bigint not null check (cost_bloom_bucks > 0),
  status text not null check (status in ('upload_pending', 'queued', 'processing', 'completed', 'failed', 'refunded')),
  processing_error_code text,
  processing_error_message text,
  idempotency_key text not null,
  crop_x numeric(12,6),
  crop_y numeric(12,6),
  crop_w numeric(12,6),
  crop_h numeric(12,6),
  manifest_storage_path text,
  thumbnail_storage_path text,
  preview_storage_path text,
  created_cosmetic_id uuid references public.commerce_capes(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  refunded_at timestamptz,
  check (idempotency_key <> ''),
  check (crop_x is null or (crop_x >= 0 and crop_x <= 1)),
  check (crop_y is null or (crop_y >= 0 and crop_y <= 1)),
  check (crop_w is null or (crop_w > 0 and crop_w <= 1)),
  check (crop_h is null or (crop_h > 0 and crop_h <= 1)),
  check (
    crop_x is null or crop_y is null or crop_w is null or crop_h is null
    or (crop_x + crop_w <= 1.000001 and crop_y + crop_h <= 1.000001)
  ),
  check (not (selected_fps = 24 and selected_duration_seconds in (4, 5))),
  unique (user_id, idempotency_key)
);

create table if not exists public.commerce_media_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'animated_cape',
  order_id uuid not null unique references public.commerce_animated_cape_orders(id) on delete cascade,
  status text not null check (status in ('queued', 'claimed', 'processing', 'completed', 'failed')),
  worker_id text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  lease_expires_at timestamptz,
  next_retry_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (attempts >= 0),
  check (max_attempts > 0)
);

create table if not exists public.commerce_cape_animation_assets (
  cosmetic_id uuid primary key references public.commerce_capes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fps integer not null check (fps in (12, 15, 24)),
  duration_seconds integer not null check (duration_seconds in (3, 4, 5)),
  frame_count integer not null check (frame_count > 0),
  frame_width integer not null check (frame_width > 0),
  frame_height integer not null check (frame_height > 0),
  atlas_page_count integer not null check (atlas_page_count > 0),
  manifest_storage_path text not null,
  thumbnail_storage_path text not null,
  preview_storage_path text,
  loop_mode text not null default 'repeat',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (loop_mode in ('repeat', 'once')),
  check (frame_width = frame_height * 2)
);

create table if not exists public.commerce_cape_animation_atlas_pages (
  id uuid primary key default gen_random_uuid(),
  cosmetic_id uuid not null references public.commerce_capes(id) on delete cascade,
  page_index integer not null,
  storage_path text not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cosmetic_id, page_index),
  check (page_index >= 0),
  check (width > 0 and height > 0)
);

create index if not exists commerce_uploaded_media_user_created_idx
  on public.commerce_uploaded_media(user_id, created_at desc);

create index if not exists commerce_uploaded_media_storage_idx
  on public.commerce_uploaded_media(storage_path);

create index if not exists commerce_animated_orders_user_status_created_idx
  on public.commerce_animated_cape_orders(user_id, status, created_at desc);

create index if not exists commerce_animated_orders_status_updated_idx
  on public.commerce_animated_cape_orders(status, updated_at desc);

create index if not exists commerce_animated_orders_created_cosmetic_idx
  on public.commerce_animated_cape_orders(created_cosmetic_id);

create index if not exists commerce_media_jobs_status_retry_idx
  on public.commerce_media_jobs(status, next_retry_at, lease_expires_at);

create index if not exists commerce_media_jobs_order_idx
  on public.commerce_media_jobs(order_id);

create index if not exists commerce_cape_animation_assets_owner_idx
  on public.commerce_cape_animation_assets(owner_user_id, created_at desc);

create index if not exists commerce_cape_animation_pages_cosmetic_idx
  on public.commerce_cape_animation_atlas_pages(cosmetic_id, page_index);

create or replace function public.commerce_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists commerce_uploaded_media_touch_updated_at_trg on public.commerce_uploaded_media;
create trigger commerce_uploaded_media_touch_updated_at_trg
before update on public.commerce_uploaded_media
for each row
execute function public.commerce_touch_updated_at();

drop trigger if exists commerce_animated_orders_touch_updated_at_trg on public.commerce_animated_cape_orders;
create trigger commerce_animated_orders_touch_updated_at_trg
before update on public.commerce_animated_cape_orders
for each row
execute function public.commerce_touch_updated_at();

drop trigger if exists commerce_media_jobs_touch_updated_at_trg on public.commerce_media_jobs;
create trigger commerce_media_jobs_touch_updated_at_trg
before update on public.commerce_media_jobs
for each row
execute function public.commerce_touch_updated_at();

drop trigger if exists commerce_cape_animation_assets_touch_updated_at_trg on public.commerce_cape_animation_assets;
create trigger commerce_cape_animation_assets_touch_updated_at_trg
before update on public.commerce_cape_animation_assets
for each row
execute function public.commerce_touch_updated_at();

drop trigger if exists commerce_animated_cape_tiers_touch_updated_at_trg on public.commerce_animated_cape_tiers;
create trigger commerce_animated_cape_tiers_touch_updated_at_trg
before update on public.commerce_animated_cape_tiers
for each row
execute function public.commerce_touch_updated_at();

create or replace function public.commerce_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role';
$$;

create or replace function public.commerce_require_service_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.commerce_is_service_role() and not public.commerce_is_owner(auth.uid()) then
    raise exception 'service_role_required';
  end if;
end;
$$;

create or replace function public.commerce_resolve_animated_cape_price(
  p_fps integer,
  p_duration_seconds integer
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cost bigint;
begin
  select t.cost_bb
  into v_cost
  from public.commerce_animated_cape_tiers t
  where t.fps = p_fps
    and t.duration_seconds = p_duration_seconds
    and t.is_enabled = true
  limit 1;

  if v_cost is null then
    raise exception 'invalid_fps_duration_tier';
  end if;

  return v_cost;
end;
$$;

create or replace function public.commerce_create_animated_cape_order(
  p_upload_media_id uuid,
  p_selected_fps integer,
  p_selected_duration_seconds integer,
  p_idempotency_key text,
  p_crop_x numeric default null,
  p_crop_y numeric default null,
  p_crop_w numeric default null,
  p_crop_h numeric default null
)
returns table (
  order_id uuid,
  status text,
  cost_bloom_bucks bigint,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_upload public.commerce_uploaded_media;
  v_existing public.commerce_animated_cape_orders;
  v_cost bigint;
  v_wallet_balance integer;
  v_new_balance integer;
  v_order public.commerce_animated_cape_orders;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_upload_media_id is null then
    raise exception 'upload_media_required';
  end if;
  if v_key = '' then
    raise exception 'idempotency_key_required';
  end if;

  select *
  into v_existing
  from public.commerce_animated_cape_orders o
  where o.user_id = v_user_id
    and o.idempotency_key = v_key
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.status,
      v_existing.cost_bloom_bucks,
      coalesce((select w.balance_bb::bigint from public.commerce_wallets w where w.user_id = v_user_id), 0);
    return;
  end if;

  select *
  into v_upload
  from public.commerce_uploaded_media u
  where u.id = p_upload_media_id
    and u.user_id = v_user_id
  for update;

  if not found then
    raise exception 'upload_not_found';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'animated-cape-uploads'
      and so.name = v_upload.storage_path
  ) then
    raise exception 'source_media_missing';
  end if;

  if v_upload.source_duration_ms is not null
    and v_upload.source_duration_ms < (p_selected_duration_seconds * 1000)
  then
    raise exception 'source_duration_too_short';
  end if;

  v_cost := public.commerce_resolve_animated_cape_price(p_selected_fps, p_selected_duration_seconds);

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_balance < v_cost then
    raise exception 'insufficient_balance';
  end if;

  update public.commerce_wallets
  set
    balance_bb = balance_bb - v_cost::integer,
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
    idempotency_key,
    metadata
  )
  values (
    v_user_id,
    'debit',
    -(v_cost::integer),
    v_new_balance,
    'animated_cape_order',
    p_upload_media_id::text,
    format('animated-order:%s:%s', v_user_id::text, v_key),
    jsonb_build_object(
      'selected_fps', p_selected_fps,
      'selected_duration_seconds', p_selected_duration_seconds,
      'upload_media_id', p_upload_media_id::text
    )
  );

  insert into public.commerce_animated_cape_orders(
    user_id,
    upload_media_id,
    source_type,
    source_storage_path,
    selected_fps,
    selected_duration_seconds,
    cost_bloom_bucks,
    status,
    idempotency_key,
    crop_x,
    crop_y,
    crop_w,
    crop_h
  )
  values (
    v_user_id,
    v_upload.id,
    v_upload.media_type,
    v_upload.storage_path,
    p_selected_fps,
    p_selected_duration_seconds,
    v_cost,
    'queued',
    v_key,
    p_crop_x,
    p_crop_y,
    p_crop_w,
    p_crop_h
  )
  returning * into v_order;

  insert into public.commerce_media_jobs(
    job_type,
    order_id,
    status,
    payload
  )
  values (
    'animated_cape',
    v_order.id,
    'queued',
    jsonb_build_object(
      'order_id', v_order.id::text,
      'upload_media_id', v_upload.id::text,
      'source_storage_path', v_upload.storage_path
    )
  );

  return query
  select
    v_order.id,
    v_order.status,
    v_order.cost_bloom_bucks,
    v_new_balance::bigint;
end;
$$;

create or replace function public.commerce_register_uploaded_media(
  p_media_type text,
  p_storage_path text,
  p_original_file_name text default null,
  p_content_type text default null,
  p_file_size_bytes bigint default null,
  p_source_duration_ms integer default null,
  p_source_width integer default null,
  p_source_height integer default null
)
returns public.commerce_uploaded_media
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_media_type text := lower(btrim(coalesce(p_media_type, '')));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
  v_row public.commerce_uploaded_media;
  v_expected_prefix text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if v_media_type not in ('gif', 'mp4') then
    raise exception 'invalid_media_type';
  end if;
  if v_storage_path = '' then
    raise exception 'storage_path_required';
  end if;

  v_expected_prefix := format('animated-capes/%s/', v_user_id::text);
  if left(v_storage_path, length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'storage_path_scope_invalid';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'animated-cape-uploads'
      and so.name = v_storage_path
  ) then
    raise exception 'storage_object_not_found';
  end if;

  insert into public.commerce_uploaded_media(
    user_id,
    media_type,
    bucket_id,
    storage_path,
    original_file_name,
    content_type,
    file_size_bytes,
    source_duration_ms,
    source_width,
    source_height
  )
  values (
    v_user_id,
    v_media_type,
    'animated-cape-uploads',
    v_storage_path,
    nullif(btrim(p_original_file_name), ''),
    nullif(btrim(p_content_type), ''),
    p_file_size_bytes,
    p_source_duration_ms,
    p_source_width,
    p_source_height
  )
  on conflict (storage_path) do update
  set
    original_file_name = coalesce(excluded.original_file_name, public.commerce_uploaded_media.original_file_name),
    content_type = coalesce(excluded.content_type, public.commerce_uploaded_media.content_type),
    file_size_bytes = coalesce(excluded.file_size_bytes, public.commerce_uploaded_media.file_size_bytes),
    source_duration_ms = coalesce(excluded.source_duration_ms, public.commerce_uploaded_media.source_duration_ms),
    source_width = coalesce(excluded.source_width, public.commerce_uploaded_media.source_width),
    source_height = coalesce(excluded.source_height, public.commerce_uploaded_media.source_height),
    updated_at = timezone('utc', now())
  returning * into v_row;

  if v_row.user_id <> v_user_id then
    raise exception 'storage_path_owned_by_another_user';
  end if;

  return v_row;
end;
$$;

create or replace function public.commerce_claim_media_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table(
  job_id uuid,
  order_id uuid,
  attempts integer,
  max_attempts integer,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id text := btrim(coalesce(p_worker_id, ''));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
  v_job public.commerce_media_jobs;
begin
  perform public.commerce_require_service_role();

  if v_worker_id = '' then
    raise exception 'worker_id_required';
  end if;

  with candidate as (
    select j.id
    from public.commerce_media_jobs j
    where j.status = 'queued'
      and j.attempts < j.max_attempts
      and j.next_retry_at <= timezone('utc', now())
      and (j.lease_expires_at is null or j.lease_expires_at <= timezone('utc', now()))
    order by j.created_at asc
    for update skip locked
    limit 1
  )
  update public.commerce_media_jobs j
  set
    status = 'claimed',
    worker_id = v_worker_id,
    attempts = j.attempts + 1,
    lease_expires_at = timezone('utc', now()) + make_interval(secs => v_lease_seconds),
    updated_at = timezone('utc', now())
  from candidate c
  where j.id = c.id
  returning j.* into v_job;

  if not found then
    return;
  end if;

  update public.commerce_animated_cape_orders o
  set
    status = 'processing',
    processing_error_code = null,
    processing_error_message = null,
    updated_at = timezone('utc', now())
  where o.id = v_job.order_id
    and o.status in ('queued', 'upload_pending', 'processing');

  return query
  select
    v_job.id,
    v_job.order_id,
    v_job.attempts,
    v_job.max_attempts,
    v_job.payload;
end;
$$;

create or replace function public.commerce_mark_animated_order_failed(
  p_order_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false
)
returns table (
  order_id uuid,
  status text,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_animated_cape_orders;
  v_job public.commerce_media_jobs;
  v_delay_seconds integer;
begin
  perform public.commerce_require_service_role();

  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  select *
  into v_order
  from public.commerce_animated_cape_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  select *
  into v_job
  from public.commerce_media_jobs j
  where j.order_id = p_order_id
  for update;

  if not found then
    raise exception 'job_not_found';
  end if;

  if v_order.status in ('completed', 'refunded') then
    return query select v_order.id, v_order.status, v_job.attempts, v_job.max_attempts;
    return;
  end if;

  if coalesce(p_retryable, false) and v_job.attempts < v_job.max_attempts then
    v_delay_seconds := least(3600, greatest(30, (2 ^ greatest(v_job.attempts - 1, 0)) * 30));

    update public.commerce_media_jobs
    set
      status = 'queued',
      lease_expires_at = null,
      worker_id = null,
      next_retry_at = timezone('utc', now()) + make_interval(secs => v_delay_seconds),
      result = jsonb_build_object(
        'error_code', nullif(btrim(coalesce(p_error_code, '')), ''),
        'error_message', nullif(btrim(coalesce(p_error_message, '')), ''),
        'retry_scheduled_in_seconds', v_delay_seconds
      ),
      updated_at = timezone('utc', now())
    where id = v_job.id
    returning * into v_job;

    update public.commerce_animated_cape_orders
    set
      status = 'queued',
      processing_error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
      processing_error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
      updated_at = timezone('utc', now())
    where id = v_order.id
    returning * into v_order;
  else
    update public.commerce_media_jobs
    set
      status = 'failed',
      lease_expires_at = null,
      worker_id = null,
      result = jsonb_build_object(
        'error_code', nullif(btrim(coalesce(p_error_code, '')), ''),
        'error_message', nullif(btrim(coalesce(p_error_message, '')), '')
      ),
      updated_at = timezone('utc', now())
    where id = v_job.id
    returning * into v_job;

    update public.commerce_animated_cape_orders
    set
      status = 'failed',
      processing_error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
      processing_error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
      updated_at = timezone('utc', now())
    where id = v_order.id
    returning * into v_order;
  end if;

  return query select v_order.id, v_order.status, v_job.attempts, v_job.max_attempts;
end;
$$;

create or replace function public.commerce_complete_animated_cape_order(
  p_order_id uuid,
  p_worker_id text,
  p_manifest_storage_path text,
  p_thumbnail_storage_path text,
  p_preview_storage_path text default null,
  p_manifest jsonb default '{}'::jsonb,
  p_frame_width integer default null,
  p_frame_height integer default null,
  p_frame_count integer default null,
  p_atlas_page_count integer default null,
  p_atlas_pages jsonb default '[]'::jsonb,
  p_thumbnail_url text default null,
  p_preview_url text default null,
  p_slug text default null,
  p_name text default null
)
returns table (
  order_id uuid,
  cosmetic_id uuid,
  user_id uuid,
  status text,
  manifest_storage_path text,
  thumbnail_storage_path text,
  preview_storage_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_animated_cape_orders;
  v_job public.commerce_media_jobs;
  v_cosmetic_id uuid;
  v_slug_base text;
  v_slug text;
  v_slug_suffix integer := 0;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_manifest_path text := nullif(btrim(coalesce(p_manifest_storage_path, '')), '');
  v_thumb_path text := nullif(btrim(coalesce(p_thumbnail_storage_path, '')), '');
  v_preview_path text := nullif(btrim(coalesce(p_preview_storage_path, '')), '');
  v_thumb_url text := nullif(btrim(coalesce(p_thumbnail_url, '')), '');
  v_preview_url text := nullif(btrim(coalesce(p_preview_url, '')), '');
  v_frame_width integer := greatest(1, coalesce(p_frame_width, 256));
  v_frame_height integer := greatest(1, coalesce(p_frame_height, 128));
  v_frame_count integer := greatest(1, coalesce(p_frame_count, 1));
  v_atlas_page_count integer := greatest(1, coalesce(p_atlas_page_count, 1));
begin
  perform public.commerce_require_service_role();

  if p_order_id is null then
    raise exception 'order_id_required';
  end if;
  if v_manifest_path is null then
    raise exception 'manifest_storage_path_required';
  end if;
  if v_thumb_path is null then
    raise exception 'thumbnail_storage_path_required';
  end if;
  if v_frame_width <> v_frame_height * 2 then
    raise exception 'frame_ratio_invalid';
  end if;

  select *
  into v_order
  from public.commerce_animated_cape_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  select *
  into v_job
  from public.commerce_media_jobs j
  where j.order_id = p_order_id
  for update;

  if not found then
    raise exception 'job_not_found';
  end if;

  if v_order.status = 'refunded' then
    raise exception 'order_refunded_cannot_complete';
  end if;

  if v_order.status = 'completed' and v_order.created_cosmetic_id is not null then
    return query
    select
      v_order.id,
      v_order.created_cosmetic_id,
      v_order.user_id,
      v_order.status,
      v_order.manifest_storage_path,
      v_order.thumbnail_storage_path,
      v_order.preview_storage_path;
    return;
  end if;

  v_cosmetic_id := v_order.created_cosmetic_id;
  if v_cosmetic_id is null then
    v_slug_base := lower(regexp_replace(coalesce(nullif(btrim(p_slug), ''), ''), '[^a-z0-9-]+', '-', 'g'));
    v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
    if v_slug_base = '' then
      v_slug_base := format('animated-%s-%s', replace(v_order.user_id::text, '-', ''), substring(replace(v_order.id::text, '-', '') from 1 for 8));
    end if;

    v_slug := v_slug_base;
    while exists (select 1 from public.commerce_capes c where c.slug = v_slug) loop
      v_slug_suffix := v_slug_suffix + 1;
      v_slug := format('%s-%s', v_slug_base, v_slug_suffix);
    end loop;

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
      created_by,
      cosmetic_type,
      visibility,
      disabled
    )
    values (
      v_slug,
      coalesce(v_name, 'Animated Cape'),
      format('User generated animated cape (%sfps / %ss)', v_order.selected_fps, v_order.selected_duration_seconds),
      coalesce(v_thumb_url, v_thumb_path),
      coalesce(v_preview_url, v_thumb_url, v_preview_path, v_thumb_path),
      0,
      'custom',
      'Custom',
      '#8f58ff',
      '#2f1f53',
      'rgba(143, 88, 255, 0.35)',
      9999,
      false,
      false,
      v_order.user_id,
      'cape',
      'private',
      false
    )
    returning id into v_cosmetic_id;
  else
    update public.commerce_capes c
    set
      name = coalesce(v_name, c.name),
      texture_url = coalesce(v_thumb_url, v_thumb_path, c.texture_url),
      preview_url = coalesce(v_preview_url, v_thumb_url, v_preview_path, c.preview_url),
      cosmetic_type = 'cape',
      disabled = false,
      updated_at = timezone('utc', now())
    where c.id = v_cosmetic_id;
  end if;

  insert into public.commerce_cape_animation_assets(
    cosmetic_id,
    owner_user_id,
    fps,
    duration_seconds,
    frame_count,
    frame_width,
    frame_height,
    atlas_page_count,
    manifest_storage_path,
    thumbnail_storage_path,
    preview_storage_path,
    loop_mode
  )
  values (
    v_cosmetic_id,
    v_order.user_id,
    v_order.selected_fps,
    v_order.selected_duration_seconds,
    v_frame_count,
    v_frame_width,
    v_frame_height,
    v_atlas_page_count,
    v_manifest_path,
    v_thumb_path,
    v_preview_path,
    coalesce(nullif(p_manifest->>'loopMode', ''), 'repeat')
  )
  on conflict (cosmetic_id) do update
  set
    owner_user_id = excluded.owner_user_id,
    fps = excluded.fps,
    duration_seconds = excluded.duration_seconds,
    frame_count = excluded.frame_count,
    frame_width = excluded.frame_width,
    frame_height = excluded.frame_height,
    atlas_page_count = excluded.atlas_page_count,
    manifest_storage_path = excluded.manifest_storage_path,
    thumbnail_storage_path = excluded.thumbnail_storage_path,
    preview_storage_path = excluded.preview_storage_path,
    loop_mode = excluded.loop_mode,
    updated_at = timezone('utc', now());

  delete from public.commerce_cape_animation_atlas_pages
  where cosmetic_id = v_cosmetic_id;

  insert into public.commerce_cape_animation_atlas_pages(
    cosmetic_id,
    page_index,
    storage_path,
    width,
    height
  )
  select
    v_cosmetic_id,
    coalesce((entry->>'page_index')::integer, row_number() over () - 1),
    nullif(btrim(coalesce(entry->>'storage_path', '')), ''),
    greatest(1, coalesce((entry->>'width')::integer, 4096)),
    greatest(1, coalesce((entry->>'height')::integer, 2048))
  from jsonb_array_elements(coalesce(p_atlas_pages, '[]'::jsonb)) entry
  where nullif(btrim(coalesce(entry->>'storage_path', '')), '') is not null;

  insert into public.commerce_cape_entitlements(
    user_id,
    cape_id,
    source,
    acquired_at,
    metadata
  )
  values (
    v_order.user_id,
    v_cosmetic_id,
    'animated_cape_order',
    timezone('utc', now()),
    jsonb_build_object(
      'order_id', v_order.id::text,
      'selected_fps', v_order.selected_fps,
      'selected_duration_seconds', v_order.selected_duration_seconds
    )
  )
  on conflict (user_id, cape_id) do update
  set
    source = excluded.source,
    metadata = excluded.metadata;

  insert into public.commerce_cape_loadout(user_id, equipped_cape_id, updated_at)
  values (v_order.user_id, v_cosmetic_id, timezone('utc', now()))
  on conflict (user_id) do update
  set
    equipped_cape_id = excluded.equipped_cape_id,
    updated_at = excluded.updated_at;

  update public.commerce_animated_cape_orders
  set
    status = 'completed',
    processing_error_code = null,
    processing_error_message = null,
    manifest_storage_path = v_manifest_path,
    thumbnail_storage_path = v_thumb_path,
    preview_storage_path = v_preview_path,
    created_cosmetic_id = v_cosmetic_id,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_order.id
  returning * into v_order;

  update public.commerce_media_jobs
  set
    status = 'completed',
    worker_id = nullif(btrim(coalesce(p_worker_id, '')), ''),
    lease_expires_at = null,
    result = jsonb_build_object(
      'manifest_storage_path', v_manifest_path,
      'thumbnail_storage_path', v_thumb_path,
      'preview_storage_path', v_preview_path,
      'cosmetic_id', v_cosmetic_id::text
    ),
    updated_at = timezone('utc', now())
  where id = v_job.id
  returning * into v_job;

  perform public.commerce_refresh_public_loadout_for_user(v_order.user_id);

  return query
  select
    v_order.id,
    v_cosmetic_id,
    v_order.user_id,
    v_order.status,
    v_manifest_path,
    v_thumb_path,
    v_preview_path;
end;
$$;

create or replace function public.commerce_refund_animated_cape_order(
  p_order_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns table (
  order_id uuid,
  status text,
  refunded_amount bigint,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_animated_cape_orders;
  v_job public.commerce_media_jobs;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_refund_key text;
  v_wallet_balance integer;
  v_new_balance integer;
  v_existing_ledger public.commerce_wallet_ledger;
begin
  perform public.commerce_require_service_role();

  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  select *
  into v_order
  from public.commerce_animated_cape_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'completed' then
    raise exception 'completed_orders_cannot_be_refunded';
  end if;

  v_refund_key := coalesce(v_key, format('animated-refund:%s', v_order.id::text));

  select *
  into v_existing_ledger
  from public.commerce_wallet_ledger l
  where l.idempotency_key = v_refund_key
  limit 1;

  if found then
    return query
    select
      v_order.id,
      coalesce(v_order.status, 'refunded'),
      greatest(0, v_order.cost_bloom_bucks),
      coalesce(v_existing_ledger.balance_after, 0)::bigint;
    return;
  end if;

  insert into public.commerce_wallets(user_id, balance_bb)
  values (v_order.user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance_bb
  into v_wallet_balance
  from public.commerce_wallets w
  where w.user_id = v_order.user_id
  for update;

  update public.commerce_wallets
  set
    balance_bb = balance_bb + v_order.cost_bloom_bucks::integer,
    updated_at = timezone('utc', now())
  where user_id = v_order.user_id
  returning balance_bb into v_new_balance;

  insert into public.commerce_wallet_ledger(
    user_id,
    entry_type,
    amount_bb,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    v_order.user_id,
    'refund',
    v_order.cost_bloom_bucks::integer,
    v_new_balance,
    'purchase_refund',
    v_order.id::text,
    v_refund_key,
    jsonb_build_object(
      'order_id', v_order.id::text,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  update public.commerce_animated_cape_orders
  set
    status = 'refunded',
    refunded_at = timezone('utc', now()),
    processing_error_code = coalesce(processing_error_code, 'refunded'),
    processing_error_message = coalesce(processing_error_message, nullif(btrim(coalesce(p_reason, '')), '')),
    updated_at = timezone('utc', now())
  where id = v_order.id
  returning * into v_order;

  update public.commerce_media_jobs
  set
    status = 'failed',
    lease_expires_at = null,
    worker_id = null,
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object('refunded', true),
    updated_at = timezone('utc', now())
  where order_id = v_order.id
  returning * into v_job;

  return query
  select
    v_order.id,
    v_order.status,
    v_order.cost_bloom_bucks,
    v_new_balance::bigint;
end;
$$;

create or replace view public.v_commerce_animated_cape_orders as
select
  o.id,
  o.user_id,
  o.upload_media_id,
  o.source_type,
  o.source_storage_path,
  o.selected_fps,
  o.selected_duration_seconds,
  o.cost_bloom_bucks,
  o.status,
  o.processing_error_code,
  o.processing_error_message,
  o.idempotency_key,
  o.crop_x,
  o.crop_y,
  o.crop_w,
  o.crop_h,
  o.manifest_storage_path,
  o.thumbnail_storage_path,
  o.preview_storage_path,
  o.created_cosmetic_id,
  o.created_at,
  o.updated_at,
  o.completed_at,
  o.refunded_at,
  c.slug as cosmetic_slug,
  c.name as cosmetic_name,
  c.texture_url as cosmetic_texture_url,
  c.preview_url as cosmetic_preview_url,
  c.visibility as cosmetic_visibility,
  c.disabled as cosmetic_disabled,
  a.fps as asset_fps,
  a.duration_seconds as asset_duration_seconds,
  a.frame_count as asset_frame_count,
  a.frame_width as asset_frame_width,
  a.frame_height as asset_frame_height,
  a.atlas_page_count as asset_atlas_page_count,
  a.manifest_storage_path as asset_manifest_storage_path,
  a.thumbnail_storage_path as asset_thumbnail_storage_path,
  a.preview_storage_path as asset_preview_storage_path,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'page_index', p.page_index,
        'storage_path', p.storage_path,
        'width', p.width,
        'height', p.height
      )
      order by p.page_index
    )
    from public.commerce_cape_animation_atlas_pages p
    where p.cosmetic_id = c.id
  ), '[]'::jsonb) as atlas_pages
from public.commerce_animated_cape_orders o
left join public.commerce_capes c on c.id = o.created_cosmetic_id
left join public.commerce_cape_animation_assets a on a.cosmetic_id = c.id;

create or replace view public.v_commerce_equipped_cape_runtime as
select
  lp.mc_uuid,
  lp.user_id,
  lp.equipped_cape_id as cosmetic_id,
  lp.cape_slug,
  lp.cape_name,
  lp.texture_url,
  lp.preview_url,
  lp.updated_at,
  a.fps,
  a.duration_seconds,
  a.frame_count,
  a.frame_width,
  a.frame_height,
  a.atlas_page_count,
  a.manifest_storage_path,
  a.thumbnail_storage_path,
  a.preview_storage_path,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'page_index', p.page_index,
        'storage_path', p.storage_path,
        'width', p.width,
        'height', p.height
      )
      order by p.page_index
    )
    from public.commerce_cape_animation_atlas_pages p
    where p.cosmetic_id = lp.equipped_cape_id
  ), '[]'::jsonb) as atlas_pages
from public.commerce_cape_loadout_public lp
left join public.commerce_cape_animation_assets a on a.cosmetic_id = lp.equipped_cape_id;

alter table public.commerce_animated_cape_tiers enable row level security;
alter table public.commerce_uploaded_media enable row level security;
alter table public.commerce_animated_cape_orders enable row level security;
alter table public.commerce_media_jobs enable row level security;
alter table public.commerce_cape_animation_assets enable row level security;
alter table public.commerce_cape_animation_atlas_pages enable row level security;

drop policy if exists commerce_animated_cape_tiers_select_active on public.commerce_animated_cape_tiers;
create policy commerce_animated_cape_tiers_select_active
on public.commerce_animated_cape_tiers
for select
to anon, authenticated
using (is_enabled = true);

drop policy if exists commerce_animated_cape_tiers_owner_write on public.commerce_animated_cape_tiers;
create policy commerce_animated_cape_tiers_owner_write
on public.commerce_animated_cape_tiers
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_uploaded_media_select_own on public.commerce_uploaded_media;
create policy commerce_uploaded_media_select_own
on public.commerce_uploaded_media
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists commerce_uploaded_media_insert_own on public.commerce_uploaded_media;
create policy commerce_uploaded_media_insert_own
on public.commerce_uploaded_media
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists commerce_uploaded_media_update_own on public.commerce_uploaded_media;
create policy commerce_uploaded_media_update_own
on public.commerce_uploaded_media
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists commerce_uploaded_media_delete_own on public.commerce_uploaded_media;
create policy commerce_uploaded_media_delete_own
on public.commerce_uploaded_media
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists commerce_animated_orders_select_own on public.commerce_animated_cape_orders;
create policy commerce_animated_orders_select_own
on public.commerce_animated_cape_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists commerce_media_jobs_owner_read on public.commerce_media_jobs;
create policy commerce_media_jobs_owner_read
on public.commerce_media_jobs
for select
to authenticated
using (public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_cape_animation_assets_select_own_or_equipped on public.commerce_cape_animation_assets;
create policy commerce_cape_animation_assets_select_own_or_equipped
on public.commerce_cape_animation_assets
for select
to anon, authenticated
using (
  auth.uid() = owner_user_id
  or exists (
    select 1
    from public.commerce_cape_loadout_public lp
    where lp.equipped_cape_id = commerce_cape_animation_assets.cosmetic_id
  )
);

drop policy if exists commerce_cape_animation_pages_select_own_or_equipped on public.commerce_cape_animation_atlas_pages;
create policy commerce_cape_animation_pages_select_own_or_equipped
on public.commerce_cape_animation_atlas_pages
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.commerce_cape_animation_assets a
    where a.cosmetic_id = commerce_cape_animation_atlas_pages.cosmetic_id
      and (
        a.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.commerce_cape_loadout_public lp
          where lp.equipped_cape_id = commerce_cape_animation_atlas_pages.cosmetic_id
        )
      )
  )
);

drop policy if exists commerce_capes_select_equipped_public on public.commerce_capes;
create policy commerce_capes_select_equipped_public
on public.commerce_capes
for select
to anon, authenticated
using (
  auth.uid() = created_by
  or exists (
    select 1
    from public.commerce_cape_loadout_public lp
    where lp.equipped_cape_id = commerce_capes.id
  )
);

grant select on public.commerce_animated_cape_tiers to anon, authenticated;
grant select, insert, update, delete on public.commerce_uploaded_media to authenticated;
grant select on public.commerce_animated_cape_orders to authenticated;
grant select on public.commerce_media_jobs to authenticated;
grant select on public.commerce_cape_animation_assets to anon, authenticated;
grant select on public.commerce_cape_animation_atlas_pages to anon, authenticated;
grant select on public.v_commerce_animated_cape_orders to authenticated;
grant select on public.v_commerce_equipped_cape_runtime to anon, authenticated;

grant execute on function public.commerce_resolve_animated_cape_price(integer, integer) to authenticated;
grant execute on function public.commerce_register_uploaded_media(text, text, text, text, bigint, integer, integer, integer) to authenticated;
grant execute on function public.commerce_create_animated_cape_order(uuid, integer, integer, text, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.commerce_claim_media_job(text, integer) to service_role;
grant execute on function public.commerce_mark_animated_order_failed(uuid, text, text, boolean) to service_role;
grant execute on function public.commerce_complete_animated_cape_order(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  text,
  text,
  text,
  text
) to service_role;
grant execute on function public.commerce_refund_animated_cape_order(uuid, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'animated-cape-uploads',
  'animated-cape-uploads',
  false,
  157286400,
  array['image/gif', 'video/mp4']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'animated-cape-processed',
  'animated-cape-processed',
  true,
  104857600,
  array['image/png', 'image/webp', 'application/json']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists animated_cape_uploads_select_own on storage.objects;
create policy animated_cape_uploads_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'animated-cape-uploads'
  and (storage.foldername(name))[1] = 'animated-capes'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists animated_cape_uploads_insert_own on storage.objects;
create policy animated_cape_uploads_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'animated-cape-uploads'
  and (storage.foldername(name))[1] = 'animated-capes'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists animated_cape_uploads_update_own on storage.objects;
create policy animated_cape_uploads_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'animated-cape-uploads'
  and (storage.foldername(name))[1] = 'animated-capes'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'animated-cape-uploads'
  and (storage.foldername(name))[1] = 'animated-capes'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists animated_cape_uploads_delete_own on storage.objects;
create policy animated_cape_uploads_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'animated-cape-uploads'
  and (storage.foldername(name))[1] = 'animated-capes'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists animated_cape_processed_public_read on storage.objects;
create policy animated_cape_processed_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'animated-cape-processed');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_uploaded_media'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_uploaded_media';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_animated_cape_orders'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_animated_cape_orders';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_media_jobs'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_media_jobs';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_cape_animation_assets'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_cape_animation_assets';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_cape_animation_atlas_pages'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_cape_animation_atlas_pages';
    end if;
  end if;
end $$;

commit;
