-- Platform fee model (percent-only, no fixed per-transaction component).
--
-- Arx charges creators a platform fee (bps) on member purchases. The fee is
-- computed server-side at checkout start and snapshotted onto payment intents /
-- subscriptions / receipts so it stays provider-agnostic (Stripe now, other rails later).

-- Creator tier (builder subscription) is a platform concern; stored on profiles for MVP.
alter table public.profiles
  add column if not exists builder_tier text not null default 'free'
    check (builder_tier in ('free', 'builder', 'pro'));

-- Snapshot the platform fee at purchase time.
alter table public.payment_intents
  add column if not exists platform_fee_bps integer not null default 0
    check (platform_fee_bps between 0 and 10000);

alter table public.provider_subscriptions
  add column if not exists platform_fee_bps integer not null default 0
    check (platform_fee_bps between 0 and 10000);

alter table public.payment_receipts
  add column if not exists platform_fee_bps integer not null default 0
    check (platform_fee_bps between 0 and 10000);

alter table public.payment_receipts
  add column if not exists platform_fee_amount_base_units numeric;

