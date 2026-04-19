begin;

create table if not exists public.commerce_partner_application_forms (
  audience text primary key check (audience in ('individual', 'server')),
  title text not null default '',
  description text null,
  questions jsonb not null default '[]'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.commerce_partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('individual', 'server')),
  applicant_name text null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'approved', 'rejected')),
  owner_note text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists commerce_partner_applications_created_at_idx
  on public.commerce_partner_applications (created_at desc);

alter table public.commerce_partner_application_forms enable row level security;
alter table public.commerce_partner_applications enable row level security;

drop policy if exists commerce_partner_application_forms_select_auth on public.commerce_partner_application_forms;
create policy commerce_partner_application_forms_select_auth
  on public.commerce_partner_application_forms
  for select
  to authenticated
  using (true);

drop policy if exists commerce_partner_applications_select_own on public.commerce_partner_applications;
create policy commerce_partner_applications_select_own
  on public.commerce_partner_applications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists commerce_partner_applications_insert_own on public.commerce_partner_applications;
create policy commerce_partner_applications_insert_own
  on public.commerce_partner_applications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.commerce_get_partner_application_forms()
returns table (
  audience text,
  title text,
  description text,
  questions jsonb,
  updated_by uuid,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select f.audience, f.title, f.description, f.questions, f.updated_by, f.updated_at
  from public.commerce_partner_application_forms f
  order by case when f.audience = 'individual' then 0 else 1 end;
$$;

create or replace function public.commerce_owner_upsert_partner_application_form(
  p_audience text,
  p_title text,
  p_description text,
  p_questions jsonb
)
returns table (
  audience text,
  title text,
  description text,
  questions jsonb,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_audience text := lower(coalesce(trim(p_audience), ''));
  v_title text := coalesce(trim(p_title), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_questions jsonb := coalesce(p_questions, '[]'::jsonb);
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if v_audience not in ('individual', 'server') then
    raise exception 'invalid_audience';
  end if;
  if jsonb_typeof(v_questions) <> 'array' then
    raise exception 'questions_must_be_array';
  end if;

  insert into public.commerce_partner_application_forms (audience, title, description, questions, updated_by, updated_at)
  values (v_audience, v_title, v_description, v_questions, v_owner_id, timezone('utc', now()))
  on conflict (audience) do update
    set title = excluded.title,
        description = excluded.description,
        questions = excluded.questions,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return query
  select f.audience, f.title, f.description, f.questions, f.updated_by, f.updated_at
  from public.commerce_partner_application_forms f
  where f.audience = v_audience
  limit 1;
end;
$$;

create or replace function public.commerce_submit_partner_application(
  p_audience text,
  p_applicant_name text,
  p_answers jsonb
)
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  audience text,
  applicant_name text,
  answers jsonb,
  status text,
  owner_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_audience text := lower(coalesce(trim(p_audience), ''));
  v_applicant_name text := nullif(trim(coalesce(p_applicant_name, '')), '');
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if v_audience not in ('individual', 'server') then
    raise exception 'invalid_audience';
  end if;
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'answers_must_be_object';
  end if;

  insert into public.commerce_partner_applications (user_id, audience, applicant_name, answers, status, created_at, updated_at)
  values (v_user_id, v_audience, v_applicant_name, v_answers, 'pending', timezone('utc', now()), timezone('utc', now()))
  returning commerce_partner_applications.id into v_id;

  return query
  select
    a.id,
    a.user_id,
    p.username,
    p.display_name,
    a.audience,
    a.applicant_name,
    a.answers,
    a.status,
    a.owner_note,
    a.created_at,
    a.updated_at
  from public.commerce_partner_applications a
  left join public.commerce_profiles p on p.user_id = a.user_id
  where a.id = v_id
  limit 1;
end;
$$;

create or replace function public.commerce_owner_list_partner_applications()
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  audience text,
  applicant_name text,
  answers jsonb,
  status text,
  owner_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;

  return query
  select
    a.id,
    a.user_id,
    p.username,
    p.display_name,
    a.audience,
    a.applicant_name,
    a.answers,
    a.status,
    a.owner_note,
    a.created_at,
    a.updated_at
  from public.commerce_partner_applications a
  left join public.commerce_profiles p on p.user_id = a.user_id
  order by a.created_at desc;
end;
$$;

grant execute on function public.commerce_get_partner_application_forms() to authenticated;
grant execute on function public.commerce_owner_upsert_partner_application_form(text, text, text, jsonb) to authenticated;
grant execute on function public.commerce_submit_partner_application(text, text, jsonb) to authenticated;
grant execute on function public.commerce_owner_list_partner_applications() to authenticated;

insert into public.commerce_partner_application_forms (audience, title, description, questions, updated_at)
values
(
  'individual',
  'Creator Partner Application',
  'Apply as an individual creator for the Bloom partner program.',
  '[
    {"id":"platforms","label":"Main platforms","type":"short_text","required":true,"placeholder":"YouTube, TikTok, Discord..."},
    {"id":"about_you","label":"Tell us about yourself","type":"long_text","required":true,"placeholder":"What do you make and why do you want to partner?"},
    {"id":"audience_size","label":"Audience size","type":"number","required":true,"placeholder":"Approximate followers/member count"},
    {"id":"portfolio","label":"Portfolio / primary link","type":"link","required":true,"placeholder":"https://..."}
  ]'::jsonb,
  timezone('utc', now())
)
on conflict (audience) do nothing;

insert into public.commerce_partner_application_forms (audience, title, description, questions, updated_at)
values
(
  'server',
  'Server Partner Application',
  'Apply as a Minecraft server for Bloom partner benefits.',
  '[
    {"id":"server_name","label":"Server name","type":"short_text","required":true,"placeholder":"Your server brand"},
    {"id":"server_version","label":"Minecraft version(s)","type":"short_text","required":true,"placeholder":"1.21.x, 1.20.x..."},
    {"id":"player_count","label":"Average concurrent players","type":"number","required":true,"placeholder":"Approximate online count"},
    {"id":"server_link","label":"Server website / Discord invite","type":"link","required":true,"placeholder":"https://..."},
    {"id":"about_server","label":"About your server","type":"long_text","required":true,"placeholder":"Unique gameplay, community, goals"}
  ]'::jsonb,
  timezone('utc', now())
)
on conflict (audience) do nothing;

commit;
