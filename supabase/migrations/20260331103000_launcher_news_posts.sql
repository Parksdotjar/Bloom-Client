create table if not exists public.launcher_news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  post_type text not null check (post_type in ('announcement', 'devlog', 'changelog')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  content_json jsonb not null default '[]'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null
);

create index if not exists launcher_news_posts_status_published_idx on public.launcher_news_posts(status, published_at desc nulls last);
create index if not exists launcher_news_posts_updated_idx on public.launcher_news_posts(updated_at desc);

create or replace function public.launcher_news_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists launcher_news_posts_set_updated_at on public.launcher_news_posts;
create trigger launcher_news_posts_set_updated_at
before update on public.launcher_news_posts
for each row
execute function public.launcher_news_posts_set_updated_at();

alter table public.launcher_news_posts enable row level security;

drop policy if exists launcher_news_posts_public_read_published on public.launcher_news_posts;
create policy launcher_news_posts_public_read_published
on public.launcher_news_posts
for select
using (status = 'published');

drop policy if exists launcher_news_posts_owner_read_all on public.launcher_news_posts;
create policy launcher_news_posts_owner_read_all
on public.launcher_news_posts
for select
using (
  exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = auth.uid()
      and p.role = 'owner'
  )
);

drop policy if exists launcher_news_posts_owner_insert on public.launcher_news_posts;
create policy launcher_news_posts_owner_insert
on public.launcher_news_posts
for insert
with check (
  exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = auth.uid()
      and p.role = 'owner'
  )
);

drop policy if exists launcher_news_posts_owner_update on public.launcher_news_posts;
create policy launcher_news_posts_owner_update
on public.launcher_news_posts
for update
using (
  exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = auth.uid()
      and p.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = auth.uid()
      and p.role = 'owner'
  )
);

drop policy if exists launcher_news_posts_owner_delete on public.launcher_news_posts;
create policy launcher_news_posts_owner_delete
on public.launcher_news_posts
for delete
using (
  exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = auth.uid()
      and p.role = 'owner'
  )
);

alter publication supabase_realtime add table public.launcher_news_posts;
