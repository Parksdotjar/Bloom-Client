begin;

create extension if not exists pgcrypto;

create table if not exists public.commerce_rarity_presets (
  id uuid primary key default gen_random_uuid(),
  rarity text not null unique,
  rarity_label text,
  color_start text,
  color_end text,
  glow text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists commerce_rarity_presets_sort_idx
  on public.commerce_rarity_presets (is_active, sort_order, rarity);

create or replace function public.commerce_rarity_presets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists commerce_rarity_presets_touch_updated_at_trg on public.commerce_rarity_presets;
create trigger commerce_rarity_presets_touch_updated_at_trg
before update on public.commerce_rarity_presets
for each row
execute function public.commerce_rarity_presets_touch_updated_at();

alter table public.commerce_rarity_presets enable row level security;

drop policy if exists commerce_rarity_presets_select_active on public.commerce_rarity_presets;
create policy commerce_rarity_presets_select_active
on public.commerce_rarity_presets
for select
to anon, authenticated
using (is_active = true);

drop policy if exists commerce_rarity_presets_owner_write on public.commerce_rarity_presets;
create policy commerce_rarity_presets_owner_write
on public.commerce_rarity_presets
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

grant select on public.commerce_rarity_presets to anon, authenticated;
grant insert, update, delete on public.commerce_rarity_presets to authenticated;

insert into public.commerce_rarity_presets (
  rarity, rarity_label, color_start, color_end, glow, sort_order, is_active
)
values
  ('partner', 'Partner', '#000000', '#000000', 'rgba(0, 0, 0, 0.45)', 1, true),
  ('mythic', 'Mythic', '#ff4fd8', '#5a0f4b', 'rgba(255, 79, 216, 0.45)', 2, true),
  ('legendary', 'Legendary', '#f0a31f', '#6e3c00', 'rgba(240, 163, 31, 0.45)', 3, true),
  ('epic', 'Epic', '#a979ff', '#3a1f68', 'rgba(169, 121, 255, 0.45)', 4, true),
  ('rare', 'Rare', '#4aa0ff', '#173e70', 'rgba(74, 160, 255, 0.40)', 5, true),
  ('uncommon', 'Uncommon', '#6fdc7a', '#1e4f28', 'rgba(111, 220, 122, 0.40)', 6, true),
  ('common', 'Common', '#c7ced8', '#3b4450', 'rgba(199, 206, 216, 0.30)', 7, true)
on conflict (rarity) do update
set
  rarity_label = excluded.rarity_label,
  color_start = excluded.color_start,
  color_end = excluded.color_end,
  glow = excluded.glow,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_rarity_presets'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_rarity_presets';
    end if;
  end if;
end $$;

commit;
