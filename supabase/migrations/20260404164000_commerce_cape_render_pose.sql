alter table public.commerce_capes
  add column if not exists render_pos_x double precision,
  add column if not exists render_pos_y double precision,
  add column if not exists render_pos_z double precision,
  add column if not exists render_rot_x double precision,
  add column if not exists render_rot_y double precision,
  add column if not exists render_rot_z double precision,
  add column if not exists render_depth_z double precision,
  add column if not exists render_brightness double precision;
