begin;

alter table public.commerce_profiles drop constraint if exists commerce_profiles_role_check;
alter table public.commerce_profiles
  add constraint commerce_profiles_role_check
  check (role in ('user', 'partner', 'owner'));

alter table public.commerce_profiles drop constraint if exists commerce_profiles_bud_plan_check;
alter table public.commerce_profiles
  add constraint commerce_profiles_bud_plan_check
  check (bud_plan is null or bud_plan in ('lifetime', 'monthly', 'free'));

alter table public.bud_purchases drop constraint if exists bud_purchases_plan_check;
alter table public.bud_purchases
  add constraint bud_purchases_plan_check
  check (plan in ('lifetime', 'monthly', 'free'));

alter table public.bud_license_keys drop constraint if exists bud_license_keys_plan_check;
alter table public.bud_license_keys
  add constraint bud_license_keys_plan_check
  check (plan in ('lifetime', 'monthly', 'free'));

update public.commerce_profiles
set role = 'user',
    updated_at = timezone('utc', now())
where role = 'owner'
  and lower(coalesce(email, '')) <> 'urlocalparks@gmail.com'
  and lower(coalesce(username, '')) <> 'parks';

insert into public.commerce_profiles (user_id, username, display_name, email, role, bud_license_status, bud_plan)
select u.id, 'parks', 'parks', 'urlocalparks@gmail.com', 'owner', 'active', 'free'
from auth.users u
where lower(u.email) = 'urlocalparks@gmail.com'
on conflict (user_id) do update
set username = 'parks',
    display_name = coalesce(public.commerce_profiles.display_name, 'parks'),
    email = 'urlocalparks@gmail.com',
    role = 'owner',
    bud_license_status = 'active',
    bud_plan = 'free',
    updated_at = timezone('utc', now());

create unique index if not exists commerce_profiles_single_owner_idx
  on public.commerce_profiles ((role))
  where role = 'owner';

create or replace function public.commerce_enforce_single_parks_owner()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner' then
    if lower(coalesce(new.email, '')) <> 'urlocalparks@gmail.com'
       or lower(coalesce(new.username, '')) <> 'parks' then
      raise exception 'parks_is_the_only_owner';
    end if;

    if exists (
      select 1
      from public.commerce_profiles p
      where p.role = 'owner'
        and p.user_id <> new.user_id
    ) then
      raise exception 'only_one_owner_allowed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists commerce_profiles_single_owner_guard on public.commerce_profiles;
create trigger commerce_profiles_single_owner_guard
before insert or update of role, username, email
on public.commerce_profiles
for each row
execute function public.commerce_enforce_single_parks_owner();

commit;
