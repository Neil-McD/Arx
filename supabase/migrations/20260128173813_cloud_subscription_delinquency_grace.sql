-- Subscription delinquency + grace period tracking (community subscriptions).
--
-- Policy:
-- - When Stripe reports non-payment (e.g. invoice.payment_failed), start a grace window.
-- - Access is revoked automatically when grace ends by setting entitlements.ends_at.
--
-- These fields store the delinquency window for observability and admin UX.

alter table public.provider_subscriptions
  add column if not exists delinquent_at timestamptz,
  add column if not exists grace_ends_at timestamptz;
