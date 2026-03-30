-- Grant OWNER role to a user (run as service role SQL editor or an existing owner).
select public.commerce_grant_owner_role('00000000-0000-0000-0000-000000000000'::uuid);

-- Grant OWNER role by one identifier (uuid OR username/display_name OR email).
select public.commerce_grant_owner_role_by_identifier('00000000-0000-0000-0000-000000000000');
select public.commerce_grant_owner_role_by_identifier('Parks');
select public.commerce_grant_owner_role_by_identifier('owner@example.com');

-- Grant OWNER role by auth email lookup (service-role SQL editor).
select public.commerce_grant_owner_role((
  select u.id
  from auth.users u
  where lower(u.email) = lower('owner@example.com')
  limit 1
));

-- Preferred owner-only cape creation path (RPC).
select public.create_cape_listing(
  p_texture_url => 'https://cdn.example.com/capes/nebula.png',
  p_name => 'Nebula',
  p_price_bb => 1800,
  p_rarity => 'epic',
  p_slug => 'cape-nebula',
  p_description => 'Deep-space glow cape.',
  p_preview_url => 'https://cdn.example.com/capes/previews/nebula.png',
  p_rarity_label => 'Epic',
  p_rarity_color_start => '#7B4DFF',
  p_rarity_color_end => '#C08BFF',
  p_rarity_glow => 'rgba(138,92,255,0.38)',
  p_sort_order => 140,
  p_is_active => true,
  p_is_featured => true
);

-- Manual owner insert template (works only for owner/service-role due RLS).
insert into public.commerce_capes (
  slug,
  name,
  description,
  texture_url,
  preview_url,
  price_bb,
  rarity,
  rarity_label,
  rarity_color_start,
  rarity_color_end,
  rarity_glow,
  sort_order,
  is_active,
  is_featured,
  created_by
)
values (
  'cape-template-slug',
  'Cape Template Name',
  'Cape template description',
  'https://cdn.example.com/capes/template.png',
  'https://cdn.example.com/capes/previews/template.png',
  1000,
  'rare',
  'Rare',
  '#4EA3FF',
  '#8AD6FF',
  'rgba(78,163,255,0.35)',
  999,
  true,
  false,
  auth.uid()
);

-- Example cape inserts (3-5 requested):
select public.create_cape_listing(
  p_texture_url => 'https://cdn.example.com/capes/aurora-strike.png',
  p_name => 'Aurora Strike',
  p_price_bb => 1200,
  p_rarity => 'rare',
  p_slug => 'cape-aurora-strike',
  p_description => 'Cool aurora sweep with cyan highlights.',
  p_preview_url => 'https://cdn.example.com/capes/previews/aurora-strike.png',
  p_rarity_label => 'Rare',
  p_rarity_color_start => '#3FA7FF',
  p_rarity_color_end => '#79E3FF',
  p_rarity_glow => 'rgba(63,167,255,0.34)',
  p_sort_order => 100,
  p_is_active => true,
  p_is_featured => true
);

select public.create_cape_listing(
  p_texture_url => 'https://cdn.example.com/capes/onyx-veil.png',
  p_name => 'Onyx Veil',
  p_price_bb => 900,
  p_rarity => 'common',
  p_slug => 'cape-onyx-veil',
  p_description => 'Stealth matte-black cloak.',
  p_preview_url => 'https://cdn.example.com/capes/previews/onyx-veil.png',
  p_rarity_label => 'Common',
  p_rarity_color_start => '#5D6675',
  p_rarity_color_end => '#8D97A8',
  p_rarity_glow => 'rgba(102,110,124,0.28)',
  p_sort_order => 110,
  p_is_active => true,
  p_is_featured => false
);

select public.create_cape_listing(
  p_texture_url => 'https://cdn.example.com/capes/rose-pulse.png',
  p_name => 'Rose Pulse',
  p_price_bb => 2200,
  p_rarity => 'legendary',
  p_slug => 'cape-rose-pulse',
  p_description => 'High-energy rose pulse streaks.',
  p_preview_url => 'https://cdn.example.com/capes/previews/rose-pulse.png',
  p_rarity_label => 'Legendary',
  p_rarity_color_start => '#FF4E8C',
  p_rarity_color_end => '#FFC1D8',
  p_rarity_glow => 'rgba(255,78,140,0.46)',
  p_sort_order => 120,
  p_is_active => true,
  p_is_featured => true
);

select public.create_cape_listing(
  p_texture_url => 'https://cdn.example.com/capes/void-prism.png',
  p_name => 'Void Prism',
  p_price_bb => 1600,
  p_rarity => 'epic',
  p_slug => 'cape-void-prism',
  p_description => 'Shifting violet prism edge.',
  p_preview_url => 'https://cdn.example.com/capes/previews/void-prism.png',
  p_rarity_label => 'Epic',
  p_rarity_color_start => '#7A5BFF',
  p_rarity_color_end => '#BFA9FF',
  p_rarity_glow => 'rgba(122,91,255,0.40)',
  p_sort_order => 130,
  p_is_active => true,
  p_is_featured => false
);
