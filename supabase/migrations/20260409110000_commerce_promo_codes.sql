create table if not exists public.commerce_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  is_active boolean not null default true,
  hidden_in_shop boolean not null default true,
  max_redemptions integer,
  per_user_limit integer not null default 1,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (per_user_limit >= 1),
  check (max_redemptions is null or max_redemptions >= 1)
);

create unique index if not exists commerce_promo_codes_code_lower_uidx
  on public.commerce_promo_codes (lower(code));

create table if not exists public.commerce_promo_code_capes (
  promo_code_id uuid not null references public.commerce_promo_codes(id) on delete cascade,
  cape_id uuid not null references public.commerce_capes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (promo_code_id, cape_id)
);

create table if not exists public.commerce_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.commerce_promo_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  granted_cape_ids uuid[] not null default '{}'::uuid[],
  already_owned_cape_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists commerce_promo_redemptions_code_idx
  on public.commerce_promo_redemptions(promo_code_id, created_at desc);

create index if not exists commerce_promo_redemptions_user_idx
  on public.commerce_promo_redemptions(user_id, created_at desc);

drop trigger if exists trg_commerce_promo_codes_updated_at on public.commerce_promo_codes;
create trigger trg_commerce_promo_codes_updated_at
before update on public.commerce_promo_codes
for each row execute function public.set_updated_at();

create or replace function public.commerce_redeem_promo_code(p_code text)
returns table (
  code text,
  granted_cape_slugs text[],
  already_owned_cape_slugs text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_input_code text := lower(trim(coalesce(p_code, '')));
  v_promo public.commerce_promo_codes%rowtype;
  v_total_redeemed integer;
  v_user_redeemed integer;
  v_cape_ids uuid[] := '{}'::uuid[];
  v_granted_ids uuid[] := '{}'::uuid[];
  v_already_ids uuid[] := '{}'::uuid[];
  v_granted_slugs text[] := '{}'::text[];
  v_already_slugs text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if v_input_code = '' then
    raise exception 'promo_code_required';
  end if;

  select *
  into v_promo
  from public.commerce_promo_codes p
  where lower(p.code) = v_input_code
  limit 1;

  if not found then
    raise exception 'promo_code_not_found';
  end if;

  if not coalesce(v_promo.is_active, false) then
    raise exception 'promo_code_inactive';
  end if;

  if v_promo.expires_at is not null and v_promo.expires_at <= timezone('utc', now()) then
    raise exception 'promo_code_expired';
  end if;

  select count(*)::integer
  into v_total_redeemed
  from public.commerce_promo_redemptions r
  where r.promo_code_id = v_promo.id;

  if v_promo.max_redemptions is not null and v_total_redeemed >= v_promo.max_redemptions then
    raise exception 'promo_code_max_reached';
  end if;

  select count(*)::integer
  into v_user_redeemed
  from public.commerce_promo_redemptions r
  where r.promo_code_id = v_promo.id
    and r.user_id = v_user_id;

  if v_user_redeemed >= coalesce(v_promo.per_user_limit, 1) then
    raise exception 'promo_code_user_limit_reached';
  end if;

  select coalesce(array_agg(pc.cape_id), '{}'::uuid[])
  into v_cape_ids
  from public.commerce_promo_code_capes pc
  join public.commerce_capes c on c.id = pc.cape_id
  where pc.promo_code_id = v_promo.id
    and c.is_active = true;

  if coalesce(array_length(v_cape_ids, 1), 0) = 0 then
    raise exception 'promo_code_no_rewards';
  end if;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_already_ids
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = v_user_id
    and c.id = any(v_cape_ids);

  insert into public.commerce_cape_entitlements (user_id, cape_id, source, acquired_at, metadata)
  select
    v_user_id,
    c.id,
    'promo_code',
    timezone('utc', now()),
    jsonb_build_object('promo_code', v_promo.code)
  from public.commerce_capes c
  where c.id = any(v_cape_ids)
    and not (c.id = any(v_already_ids))
  on conflict (user_id, cape_id) do nothing;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_granted_ids
  from public.commerce_capes c
  where c.id = any(v_cape_ids)
    and not (c.id = any(v_already_ids));

  select coalesce(array_agg(c.slug order by c.slug), '{}'::text[])
  into v_granted_slugs
  from public.commerce_capes c
  where c.id = any(v_granted_ids);

  select coalesce(array_agg(c.slug order by c.slug), '{}'::text[])
  into v_already_slugs
  from public.commerce_capes c
  where c.id = any(v_already_ids);

  insert into public.commerce_promo_redemptions (
    promo_code_id,
    user_id,
    code,
    granted_cape_ids,
    already_owned_cape_ids
  ) values (
    v_promo.id,
    v_user_id,
    v_promo.code,
    coalesce(v_granted_ids, '{}'::uuid[]),
    coalesce(v_already_ids, '{}'::uuid[])
  );

  return query
  select v_promo.code, coalesce(v_granted_slugs, '{}'::text[]), coalesce(v_already_slugs, '{}'::text[]);
end;
$$;

alter table public.commerce_promo_codes enable row level security;
alter table public.commerce_promo_code_capes enable row level security;
alter table public.commerce_promo_redemptions enable row level security;

drop policy if exists commerce_promo_codes_owner_all on public.commerce_promo_codes;
create policy commerce_promo_codes_owner_all
on public.commerce_promo_codes
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_promo_code_capes_owner_all on public.commerce_promo_code_capes;
create policy commerce_promo_code_capes_owner_all
on public.commerce_promo_code_capes
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

drop policy if exists commerce_promo_redemptions_owner_read on public.commerce_promo_redemptions;
create policy commerce_promo_redemptions_owner_read
on public.commerce_promo_redemptions
for select
to authenticated
using (public.commerce_is_owner(auth.uid()));

grant select, insert, update, delete on public.commerce_promo_codes to authenticated;
grant select, insert, update, delete on public.commerce_promo_code_capes to authenticated;
grant select on public.commerce_promo_redemptions to authenticated;

grant execute on function public.commerce_redeem_promo_code(text) to authenticated;
