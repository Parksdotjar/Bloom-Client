begin;

drop function if exists public.commerce_process_stripe_event(text, text, text, text, uuid, jsonb);
drop function if exists public.commerce_process_kofi_event(text, text, text, jsonb);
drop function if exists public.commerce_create_pending_currency_purchase(text, text, integer);

drop table if exists public.commerce_stripe_events;
drop table if exists public.commerce_pending_currency_purchases;
drop table if exists public.commerce_kofi_events;

drop index if exists public.commerce_currency_packs_stripe_payment_link_id_idx;
drop index if exists public.commerce_currency_packs_stripe_price_id_idx;

alter table if exists public.commerce_currency_packs
  drop column if exists stripe_payment_link_id,
  drop column if exists stripe_payment_link_url,
  drop column if exists stripe_price_id,
  drop column if exists kofi_url;

commit;
