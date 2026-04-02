begin;

update public.commerce_currency_packs
set
  name = '$15 => 1500 + 500 BB',
  base_bb = 1500,
  bonus_bb = 500,
  total_bb = 2000,
  updated_at = timezone('utc', now())
where slug = 'usd-15';

commit;
