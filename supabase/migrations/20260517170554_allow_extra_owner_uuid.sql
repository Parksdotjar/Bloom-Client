begin;

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
where user_id = 'edfee06f-d5af-457c-b0f7-36cb0f621fc6'::uuid;

commit;
