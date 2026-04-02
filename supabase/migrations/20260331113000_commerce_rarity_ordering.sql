begin;

create or replace function public.commerce_rarity_rank(p_rarity text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(btrim(p_rarity), ''))
    when 'partner' then 1
    when 'mythic' then 2
    when 'legendary' then 3
    when 'epic' then 4
    when 'rare' then 5
    when 'uncommon' then 6
    when 'common' then 7
    else 999
  end;
$$;

create or replace view public.v_commerce_shop_capes_ordered as
select
  c.id,
  c.slug,
  c.name,
  c.description,
  c.partner_group,
  c.texture_url,
  c.preview_url,
  c.price_bb,
  c.rarity,
  c.rarity_label,
  c.rarity_color_start,
  c.rarity_color_end,
  c.rarity_glow,
  c.sort_order,
  c.is_active,
  c.is_featured,
  c.created_at,
  c.updated_at,
  public.commerce_rarity_rank(c.rarity) as rarity_rank
from public.commerce_capes c;

grant select on public.v_commerce_shop_capes_ordered to anon, authenticated;

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
    c.sort_order,
    c.is_active
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = auth.uid()
  order by
    public.commerce_rarity_rank(c.rarity) asc,
    c.is_featured desc,
    c.sort_order asc,
    e.acquired_at desc;
$$;

grant execute on function public.commerce_list_owned_capes() to authenticated;

commit;
