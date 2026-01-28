-- Backfill payment ledger entries from existing confirmed checkout receipts.
--
-- This makes revenue analytics consistent across historical one-time purchases
-- and new ledger-based subscription renewals/refunds.

insert into public.payment_ledger_entries(
  community_id,
  user_id,
  payment_intent_id,
  provider,
  kind,
  provider_ref,
  provider_subscription_id,
  provider_customer_id,
  amount_base_units,
  currency,
  currency_decimals,
  platform_fee_bps,
  platform_fee_amount_base_units,
  occurred_at,
  raw_json
)
select
  i.community_id,
  i.user_id,
  r.payment_intent_id,
  r.provider,
  'checkout_session'::text as kind,
  r.provider_session_id as provider_ref,
  r.provider_subscription_id,
  r.provider_customer_id,
  r.amount_base_units,
  r.currency,
  r.currency_decimals,
  coalesce(r.platform_fee_bps, 0) as platform_fee_bps,
  r.platform_fee_amount_base_units,
  coalesce(r.paid_at, r.created_at) as occurred_at,
  r.raw_json
from public.payment_receipts r
join public.payment_intents i on i.id = r.payment_intent_id
where r.status = 'confirmed'
  and r.paid_at is not null
on conflict (provider, kind, provider_ref) do nothing;

