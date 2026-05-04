begin;

alter table public.commerce_capes
  alter column render_pos_x set default 0,
  alter column render_pos_y set default 16.2,
  alter column render_pos_z set default 0,
  alter column render_rot_x set default 0,
  alter column render_rot_y set default -174,
  alter column render_rot_z set default 0,
  alter column render_depth_z set default -4,
  alter column render_brightness set default 6;

update public.commerce_capes
set
  render_pos_x = coalesce(render_pos_x, 0),
  render_pos_y = coalesce(render_pos_y, 16.2),
  render_pos_z = coalesce(render_pos_z, 0),
  render_rot_x = coalesce(render_rot_x, 0),
  render_rot_y = coalesce(render_rot_y, -174),
  render_rot_z = coalesce(render_rot_z, 0),
  render_depth_z = coalesce(render_depth_z, -4),
  render_brightness = coalesce(render_brightness, 6);

create table if not exists public.commerce_cape_render_pose_defaults (
  scope text primary key default 'global',
  render_pos_x double precision not null default 0,
  render_pos_y double precision not null default 16.2,
  render_pos_z double precision not null default 0,
  render_rot_x double precision not null default 0,
  render_rot_y double precision not null default -174,
  render_rot_z double precision not null default 0,
  render_depth_z double precision not null default -4,
  render_brightness double precision not null default 6,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commerce_cape_render_pose_defaults_scope_chk check (scope = 'global')
);

insert into public.commerce_cape_render_pose_defaults (
  scope,
  render_pos_x,
  render_pos_y,
  render_pos_z,
  render_rot_x,
  render_rot_y,
  render_rot_z,
  render_depth_z,
  render_brightness
)
values ('global', 0, 16.2, 0, 0, -174, 0, -4, 6)
on conflict (scope) do update
set
  render_pos_x = excluded.render_pos_x,
  render_pos_y = excluded.render_pos_y,
  render_pos_z = excluded.render_pos_z,
  render_rot_x = excluded.render_rot_x,
  render_rot_y = excluded.render_rot_y,
  render_rot_z = excluded.render_rot_z,
  render_depth_z = excluded.render_depth_z,
  render_brightness = excluded.render_brightness,
  updated_at = timezone('utc', now());

create or replace function public.commerce_owner_set_default_cape_render_pose(
  p_render_pos_x double precision,
  p_render_pos_y double precision,
  p_render_pos_z double precision,
  p_render_rot_x double precision,
  p_render_rot_y double precision,
  p_render_rot_z double precision,
  p_render_depth_z double precision,
  p_render_brightness double precision
)
returns public.commerce_cape_render_pose_defaults
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pose public.commerce_cape_render_pose_defaults;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and not public.commerce_is_owner(auth.uid()) then
    raise exception 'owner_role_required';
  end if;

  insert into public.commerce_cape_render_pose_defaults (
    scope,
    render_pos_x,
    render_pos_y,
    render_pos_z,
    render_rot_x,
    render_rot_y,
    render_rot_z,
    render_depth_z,
    render_brightness,
    updated_by,
    updated_at
  )
  values (
    'global',
    coalesce(p_render_pos_x, 0),
    coalesce(p_render_pos_y, 16.2),
    coalesce(p_render_pos_z, 0),
    coalesce(p_render_rot_x, 0),
    coalesce(p_render_rot_y, -174),
    coalesce(p_render_rot_z, 0),
    coalesce(p_render_depth_z, -4),
    coalesce(p_render_brightness, 6),
    auth.uid(),
    timezone('utc', now())
  )
  on conflict (scope) do update
  set
    render_pos_x = excluded.render_pos_x,
    render_pos_y = excluded.render_pos_y,
    render_pos_z = excluded.render_pos_z,
    render_rot_x = excluded.render_rot_x,
    render_rot_y = excluded.render_rot_y,
    render_rot_z = excluded.render_rot_z,
    render_depth_z = excluded.render_depth_z,
    render_brightness = excluded.render_brightness,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_pose;

  execute format('alter table public.commerce_capes alter column render_pos_x set default %L', v_pose.render_pos_x);
  execute format('alter table public.commerce_capes alter column render_pos_y set default %L', v_pose.render_pos_y);
  execute format('alter table public.commerce_capes alter column render_pos_z set default %L', v_pose.render_pos_z);
  execute format('alter table public.commerce_capes alter column render_rot_x set default %L', v_pose.render_rot_x);
  execute format('alter table public.commerce_capes alter column render_rot_y set default %L', v_pose.render_rot_y);
  execute format('alter table public.commerce_capes alter column render_rot_z set default %L', v_pose.render_rot_z);
  execute format('alter table public.commerce_capes alter column render_depth_z set default %L', v_pose.render_depth_z);
  execute format('alter table public.commerce_capes alter column render_brightness set default %L', v_pose.render_brightness);

  return v_pose;
end;
$$;

alter table public.commerce_cape_render_pose_defaults enable row level security;

drop policy if exists commerce_cape_render_pose_defaults_owner_all
on public.commerce_cape_render_pose_defaults;
create policy commerce_cape_render_pose_defaults_owner_all
on public.commerce_cape_render_pose_defaults
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

revoke all on public.commerce_cape_render_pose_defaults from public;
grant select on public.commerce_cape_render_pose_defaults to authenticated;

revoke all on function public.commerce_owner_set_default_cape_render_pose(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) from public;
grant execute on function public.commerce_owner_set_default_cape_render_pose(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) to authenticated, anon;

commit;
