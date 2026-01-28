-- Canonical payment ledger entries for analytics and audits.
--
-- Keep payment_receipts focused on checkout-session evidence for claim redemption.
-- Use this ledger for revenue analytics (including renewals and reversals).

create table if not exists public.payment_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  provider text not null,
  kind text not null check (kind in ('checkout_session','invoice_payment','refund','dispute')),
  provider_ref text not null,
  provider_subscription_id text,
  provider_customer_id text,
  amount_base_units numeric not null check (amount_base_units <> 0),
  currency text not null check (length(currency) between 3 and 16),
  currency_decimals smallint not null check (currency_decimals between 0 and 36),
  platform_fee_bps integer not null default 0 check (platform_fee_bps between 0 and 10000),
  platform_fee_amount_base_units numeric,
  occurred_at timestamptz not null,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_ledger_entries_community_occurred_at
  on public.payment_ledger_entries(community_id, occurred_at desc);
create index if not exists idx_payment_ledger_entries_user_occurred_at
  on public.payment_ledger_entries(user_id, occurred_at desc);
create index if not exists idx_payment_ledger_entries_intent_occurred_at
  on public.payment_ledger_entries(payment_intent_id, occurred_at desc);
create unique index if not exists uq_payment_ledger_entries_provider_ref
  on public.payment_ledger_entries(provider, kind, provider_ref);

alter table public.payment_ledger_entries enable row level security;

drop policy if exists payment_ledger_entries_select_self on public.payment_ledger_entries;
create policy payment_ledger_entries_select_self
on public.payment_ledger_entries
for select
using (auth.uid() = user_id);

