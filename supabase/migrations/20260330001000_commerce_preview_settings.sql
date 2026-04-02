begin;

create table if not exists public.commerce_preview_settings (
  scope text primary key,
  exposure numeric(8,4) not null default 1.90,
  brightness numeric(8,4) not null default 1.42,
  contrast numeric(8,4) not null default 1.10,
  saturation numeric(8,4) not null default 1.06,
  turn_rate numeric(8,4) not null default 0.45,
  camera_light_intensity numeric(8,4) not null default 1.72,
  global_light_intensity numeric(8,4) not null default 1.22,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.commerce_preview_settings
  add column if not exists scope text,
  add column if not exists exposure numeric(8,4) not null default 1.90,
  add column if not exists brightness numeric(8,4) not null default 1.42,
  add column if not exists contrast numeric(8,4) not null default 1.10,
  add column if not exists saturation numeric(8,4) not null default 1.06,
  add column if not exists turn_rate numeric(8,4) not null default 0.45,
  add column if not exists camera_light_intensity numeric(8,4) not null default 1.72,
  add column if not exists global_light_intensity numeric(8,4) not null default 1.22,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.commerce_preview_settings
set scope = 'global'
where scope is null or btrim(scope) = '';

alter table public.commerce_preview_settings
  alter column scope set default 'global',
  alter column scope set not null,
  alter column exposure set default 1.90,
  alter column brightness set default 1.42,
  alter column contrast set default 1.10,
  alter column saturation set default 1.06,
  alter column turn_rate set default 0.45,
  alter column camera_light_intensity set default 1.72,
  alter column global_light_intensity set default 1.22,
  alter column updated_at set default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commerce_preview_settings_pkey'
      and conrelid = 'public.commerce_preview_settings'::regclass
  ) then
    alter table public.commerce_preview_settings
      add constraint commerce_preview_settings_pkey primary key (scope);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commerce_preview_settings_scope_check'
      and conrelid = 'public.commerce_preview_settings'::regclass
  ) then
    alter table public.commerce_preview_settings
      add constraint commerce_preview_settings_scope_check check (scope = 'global');
  end if;
end $$;

create or replace function public.commerce_preview_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists commerce_preview_settings_touch_updated_at_trg on public.commerce_preview_settings;
create trigger commerce_preview_settings_touch_updated_at_trg
before update on public.commerce_preview_settings
for each row
execute function public.commerce_preview_settings_touch_updated_at();

insert into public.commerce_preview_settings (
  scope,
  exposure,
  brightness,
  contrast,
  saturation,
  turn_rate,
  camera_light_intensity,
  global_light_intensity,
  updated_by
)
values (
  'global',
  1.90,
  1.42,
  1.10,
  1.06,
  0.45,
  1.72,
  1.22,
  null
)
on conflict (scope) do nothing;

alter table public.commerce_preview_settings enable row level security;

drop policy if exists commerce_preview_settings_select_global on public.commerce_preview_settings;
create policy commerce_preview_settings_select_global
on public.commerce_preview_settings
for select
to anon, authenticated
using (scope = 'global');

drop policy if exists commerce_preview_settings_owner_write on public.commerce_preview_settings;
create policy commerce_preview_settings_owner_write
on public.commerce_preview_settings
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

grant select on public.commerce_preview_settings to anon, authenticated;
grant insert, update, delete on public.commerce_preview_settings to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'commerce_preview_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.commerce_preview_settings';
    end if;
  end if;
end $$;

commit;
