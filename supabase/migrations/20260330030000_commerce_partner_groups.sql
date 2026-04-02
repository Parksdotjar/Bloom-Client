begin;

create table if not exists public.commerce_partner_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists commerce_partner_groups_sort_idx
  on public.commerce_partner_groups (is_active, sort_order, name);

create or replace function public.commerce_partner_groups_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists commerce_partner_groups_touch_updated_at_trg on public.commerce_partner_groups;
create trigger commerce_partner_groups_touch_updated_at_trg
before update on public.commerce_partner_groups
for each row
execute function public.commerce_partner_groups_touch_updated_at();

alter table public.commerce_partner_groups enable row level security;

drop policy if exists commerce_partner_groups_select_active on public.commerce_partner_groups;
create policy commerce_partner_groups_select_active
on public.commerce_partner_groups
for select
to anon, authenticated
using (is_active = true);

drop policy if exists commerce_partner_groups_owner_write on public.commerce_partner_groups;
create policy commerce_partner_groups_owner_write
on public.commerce_partner_groups
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

grant select on public.commerce_partner_groups to anon, authenticated;
grant insert, update, delete on public.commerce_partner_groups to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_partner_groups'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_partner_groups';
    end if;
  end if;
end $$;

commit;
