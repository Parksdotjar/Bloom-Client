begin;

create or replace function public.commerce_is_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commerce_profiles p
    where p.user_id = coalesce(p_user_id, auth.uid())
      and (
        p.role = 'owner'
        or replace(lower(coalesce(p.mc_uuid, '')), '-', '') in (
          'e2701115aa1147d3a9e2e89334623026',
          '2790c9887660460491068944f4ea2dcb'
        )
      )
  );
$$;

create or replace function public.commerce_enforce_single_parks_owner()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner' then
    if not (
      (
        lower(coalesce(new.email, '')) = 'urlocalparks@gmail.com'
        and lower(coalesce(new.username, '')) = 'parks'
      )
      or new.user_id = '951a26df-2baa-445e-8dd6-30d4878eade2'::uuid
      or new.user_id = 'edfee06f-d5af-457c-b0f7-36cb0f621fc6'::uuid
      or replace(lower(coalesce(new.mc_uuid, '')), '-', '') in (
        'e2701115aa1147d3a9e2e89334623026',
        '2790c9887660460491068944f4ea2dcb'
      )
    ) then
      raise exception 'owner_not_allowed';
    end if;
  end if;

  return new;
end;
$$;

update public.commerce_profiles
set role = 'owner',
    updated_at = timezone('utc', now())
where replace(lower(coalesce(mc_uuid, '')), '-', '') in (
  'e2701115aa1147d3a9e2e89334623026',
  '2790c9887660460491068944f4ea2dcb'
);

commit;
