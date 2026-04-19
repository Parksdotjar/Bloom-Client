begin;

alter table public.commerce_currency_packs
  add column if not exists stripe_payment_link_url text,
  add column if not exists stripe_payment_link_id text;

create unique index if not exists commerce_currency_packs_stripe_payment_link_id_idx
on public.commerce_currency_packs (stripe_payment_link_id)
where stripe_payment_link_id is not null and btrim(stripe_payment_link_id) <> '';

commit;

