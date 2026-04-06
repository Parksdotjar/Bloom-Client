drop function if exists public.commerce_list_owned_capes();

create or replace function public.commerce_list_owned_capes()
returns table (
  entitlement_id uuid,
  acquired_at timestamptz,
  source text,
  cape_id uuid,
  slug text,
  name text,
  description text,
  partner_group text,
  texture_url text,
  preview_url text,
  rarity text,
  rarity_label text,
  rarity_color_start text,
  rarity_color_end text,
  rarity_glow text,
  render_pos_x double precision,
  render_pos_y double precision,
  render_pos_z double precision,
  render_rot_x double precision,
  render_rot_y double precision,
  render_rot_z double precision,
  render_depth_z double precision,
  render_brightness double precision,
  sort_order integer,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.acquired_at,
    e.source,
    c.id,
    c.slug,
    c.name,
    c.description,
    c.partner_group,
    c.texture_url,
    c.preview_url,
    c.rarity,
    c.rarity_label,
    c.rarity_color_start,
    c.rarity_color_end,
    c.rarity_glow,
    c.render_pos_x,
    c.render_pos_y,
    c.render_pos_z,
    c.render_rot_x,
    c.render_rot_y,
    c.render_rot_z,
    c.render_depth_z,
    c.render_brightness,
    c.sort_order,
    c.is_active
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = auth.uid()
  order by c.is_featured desc, c.sort_order asc, e.acquired_at desc;
$$;

grant execute on function public.commerce_list_owned_capes() to authenticated;
