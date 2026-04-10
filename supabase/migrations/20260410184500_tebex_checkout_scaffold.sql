begin;

alter table public.commerce_currency_packs
  add column if not exists tebex_package_id text;

create unique index if not exists commerce_currency_packs_tebex_package_id_idx
on public.commerce_currency_packs (tebex_package_id)
where tebex_package_id is not null and btrim(tebex_package_id) <> '';

commit;
