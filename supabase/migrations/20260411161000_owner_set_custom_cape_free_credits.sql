begin;

create or replace function public.commerce_owner_get_custom_cape_free_credits(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target_id uuid := p_user_id;
  v_credits integer := 0;
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if v_target_id is null then
    raise exception 'target_user_required';
  end if;

  select coalesce(c.credits_remaining, 0)
  into v_credits
  from public.commerce_custom_cape_free_credits c
  where c.user_id = v_target_id
  limit 1;

  return coalesce(v_credits, 0);
end;
$$;

create or replace function public.commerce_owner_set_custom_cape_free_credits(
  p_user_id uuid,
  p_credits integer
)
returns table (
  user_id uuid,
  credits_remaining integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target_id uuid := p_user_id;
  v_credits integer := greatest(0, coalesce(p_credits, 0));
  v_now timestamptz := timezone('utc', now());
  v_row public.commerce_custom_cape_free_credits%rowtype;
begin
  if v_owner_id is null then
    raise exception 'auth_required';
  end if;
  if not public.commerce_is_owner(v_owner_id) then
    raise exception 'owner_role_required';
  end if;
  if v_target_id is null then
    raise exception 'target_user_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_target_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.commerce_custom_cape_free_credits (user_id, credits_remaining, updated_at)
  values (v_target_id, v_credits, v_now)
  on conflict (user_id) do update
    set credits_remaining = excluded.credits_remaining,
        updated_at = excluded.updated_at;

  select c.*
  into v_row
  from public.commerce_custom_cape_free_credits c
  where c.user_id = v_target_id
  limit 1;

  user_id := v_row.user_id;
  credits_remaining := v_row.credits_remaining;
  updated_at := v_row.updated_at;
  return next;
end;
$$;

grant execute on function public.commerce_owner_get_custom_cape_free_credits(uuid) to authenticated;
grant execute on function public.commerce_owner_set_custom_cape_free_credits(uuid, integer) to authenticated;

commit;
