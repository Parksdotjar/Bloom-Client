insert into public.commerce_currency_packs (
  slug,
  name,
  price_usd,
  base_bb,
  bonus_bb,
  total_bb,
  is_active,
  sort_order
)
values
  ('usd-20', '$20 => 2000 + 1000 BB', 20, 2000, 1000, 3000, true, 10),
  ('usd-15', '$15 => 1500 + 500 BB', 15, 1500, 500, 2000, true, 20),
  ('usd-10', '$10 => 1000 + 200 BB', 10, 1000, 200, 1200, true, 30),
  ('usd-5', '$5 => 500 BB', 5, 500, 0, 500, true, 40)
on conflict (slug) do update
set
  name = excluded.name,
  price_usd = excluded.price_usd,
  base_bb = excluded.base_bb,
  bonus_bb = excluded.bonus_bb,
  total_bb = excluded.total_bb,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());
