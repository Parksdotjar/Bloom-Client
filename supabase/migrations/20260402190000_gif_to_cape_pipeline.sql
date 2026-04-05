begin;

create table if not exists public.commerce_cape_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'animated',
  frame_width int not null,
  frame_height int not null,
  fps int not null,
  frame_count int not null default 0,
  status text not null default 'draft',
  current_revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_cape_project_frames (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.commerce_cape_projects(id) on delete cascade,
  frame_index int not null,
  storage_path text not null,
  width int not null,
  height int not null,
  is_blank boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, frame_index)
);

create table if not exists public.commerce_custom_capes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.commerce_cape_projects(id) on delete set null,
  name text not null,
  is_animated boolean not null default true,
  frame_width int not null,
  frame_height int not null,
  fps int not null,
  frame_count int not null,
  manifest_path text not null,
  preview_image_path text null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_custom_cape_revisions (
  id uuid primary key default gen_random_uuid(),
  cape_id uuid not null references public.commerce_custom_capes(id) on delete cascade,
  revision int not null,
  manifest_path text not null,
  frame_count int not null,
  fps int not null,
  created_at timestamptz not null default now(),
  unique (cape_id, revision)
);

create table if not exists public.player_equipped_cosmetics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cape_id uuid references public.commerce_custom_capes(id) on delete set null,
  revision_id uuid references public.commerce_custom_cape_revisions(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists commerce_cape_projects_user_idx on public.commerce_cape_projects(user_id, updated_at desc);
create index if not exists commerce_cape_project_frames_project_idx on public.commerce_cape_project_frames(project_id, frame_index);
create index if not exists commerce_custom_capes_user_idx on public.commerce_custom_capes(user_id, updated_at desc);
create index if not exists commerce_custom_cape_revisions_cape_idx on public.commerce_custom_cape_revisions(cape_id, revision desc);
create index if not exists player_equipped_cosmetics_cape_idx on public.player_equipped_cosmetics(cape_id, updated_at desc);

alter table public.commerce_cape_projects enable row level security;
alter table public.commerce_cape_project_frames enable row level security;
alter table public.commerce_custom_capes enable row level security;
alter table public.commerce_custom_cape_revisions enable row level security;
alter table public.player_equipped_cosmetics enable row level security;

drop policy if exists commerce_cape_projects_owner_all on public.commerce_cape_projects;
create policy commerce_cape_projects_owner_all on public.commerce_cape_projects
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists commerce_cape_project_frames_owner_all on public.commerce_cape_project_frames;
create policy commerce_cape_project_frames_owner_all on public.commerce_cape_project_frames
for all
using (
  exists (
    select 1
    from public.commerce_cape_projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.commerce_cape_projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists commerce_custom_capes_owner_read on public.commerce_custom_capes;
create policy commerce_custom_capes_owner_read on public.commerce_custom_capes
for select using (auth.uid() = user_id);

drop policy if exists commerce_custom_capes_owner_write on public.commerce_custom_capes;
create policy commerce_custom_capes_owner_write on public.commerce_custom_capes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists commerce_custom_cape_revisions_owner_read on public.commerce_custom_cape_revisions;
create policy commerce_custom_cape_revisions_owner_read on public.commerce_custom_cape_revisions
for select
using (
  exists (
    select 1
    from public.commerce_custom_capes c
    where c.id = cape_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists commerce_custom_cape_revisions_owner_write on public.commerce_custom_cape_revisions;
create policy commerce_custom_cape_revisions_owner_write on public.commerce_custom_cape_revisions
for all
using (
  exists (
    select 1
    from public.commerce_custom_capes c
    where c.id = cape_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.commerce_custom_capes c
    where c.id = cape_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists player_equipped_cosmetics_owner_rw on public.player_equipped_cosmetics;
create policy player_equipped_cosmetics_owner_rw on public.player_equipped_cosmetics
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
