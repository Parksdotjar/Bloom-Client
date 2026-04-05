begin;

create table if not exists public.player_equipped_cosmetics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cape_id uuid null,
  revision_id uuid null,
  updated_at timestamptz not null default now()
);

alter table public.player_equipped_cosmetics
  add column if not exists cape_id uuid null;

alter table public.player_equipped_cosmetics
  add column if not exists revision_id uuid null;

alter table public.player_equipped_cosmetics
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_equipped_cosmetics'
      and column_name = 'cape_cosmetic_id'
  ) then
    execute '
      update public.player_equipped_cosmetics
      set cape_id = cape_cosmetic_id
      where cape_id is null
        and cape_cosmetic_id is not null
    ';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'commerce_custom_capes'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'player_equipped_cosmetics_cape_id_fkey'
  ) then
    alter table public.player_equipped_cosmetics
      add constraint player_equipped_cosmetics_cape_id_fkey
      foreign key (cape_id) references public.commerce_custom_capes(id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'commerce_custom_cape_revisions'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'player_equipped_cosmetics_revision_id_fkey'
  ) then
    alter table public.player_equipped_cosmetics
      add constraint player_equipped_cosmetics_revision_id_fkey
      foreign key (revision_id) references public.commerce_custom_cape_revisions(id) on delete set null;
  end if;
end $$;

create index if not exists player_equipped_cosmetics_cape_idx
  on public.player_equipped_cosmetics(cape_id, updated_at desc);

alter table public.player_equipped_cosmetics enable row level security;

drop policy if exists player_equipped_cosmetics_owner_rw on public.player_equipped_cosmetics;
create policy player_equipped_cosmetics_owner_rw
on public.player_equipped_cosmetics
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
