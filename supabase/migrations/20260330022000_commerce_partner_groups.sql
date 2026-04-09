begin;

alter table public.commerce_capes
  add column if not exists partner_group text;

create index if not exists commerce_capes_partner_group_idx
  on public.commerce_capes ((lower(partner_group)))
  where partner_group is not null and btrim(partner_group) <> '';

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
  sort_order integer,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.acquired_at, e.source, c.id, c.slug, c.name, c.description, c.partner_group, c.texture_url, c.preview_url,
         c.rarity, c.rarity_label, c.rarity_color_start, c.rarity_color_end, c.rarity_glow, c.sort_order, c.is_active
  from public.commerce_cape_entitlements e
  join public.commerce_capes c on c.id = e.cape_id
  where e.user_id = auth.uid()
  order by c.is_featured desc, c.sort_order asc, e.acquired_at desc;
$$;

grant execute on function public.commerce_list_owned_capes() to authenticated;

commit;
