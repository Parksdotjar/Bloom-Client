create or replace function public.commerce_set_user_role(
  p_username text,
  p_role text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  mc_uuid text,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  with input_vals as (
    select
      nullif(trim(p_username), '') as username,
      case lower(coalesce(nullif(trim(p_role), ''), ''))
        when 'owner' then 'owner'
        else 'user'
      end as role
  ),
  picked as (
    select p.user_id
    from public.commerce_profiles p
    join input_vals i on lower(p.username) = lower(i.username)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ),
  updated as (
    update public.commerce_profiles p
    set role = i.role,
        updated_at = timezone('utc', now())
    from picked t
    join input_vals i on true
    where p.user_id = t.user_id
    returning p.user_id, p.username, p.display_name, p.mc_uuid, p.role, p.created_at, p.updated_at
  )
  select * from updated;
$$;

revoke all on function public.commerce_set_user_role(text, text) from public;
grant execute on function public.commerce_set_user_role(text, text) to authenticated, anon;
