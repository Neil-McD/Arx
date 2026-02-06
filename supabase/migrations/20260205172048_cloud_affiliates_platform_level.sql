-- Platform-level affiliates (Skool-style).
--
-- Goal:
-- - Creator-level referral program (not community-level).
-- - Pay recurring commission on referred creator platform subscription invoices.
-- - Eligibility: builder/pro tier + owns at least one community + has Stripe Connect Express connected account.
-- - Ledger-first: credits are held (gestation) then become available; refunds create debits that net against future payouts.

create table if not exists public.affiliate_program_config (
  id integer primary key default 1 check (id = 1),
  commission_rate_bps integer not null default 4000 check (commission_rate_bps >= 0 and commission_rate_bps <= 10000),
  hold_days integer not null default 14 check (hold_days >= 0 and hold_days <= 90),
  min_payout_cents integer not null default 0 check (min_payout_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.affiliate_program_config (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists affiliate_program_config_set_updated_at on public.affiliate_program_config;
create trigger affiliate_program_config_set_updated_at
before update on public.affiliate_program_config
for each row
execute function public.set_updated_at();

alter table public.affiliate_program_config enable row level security;

drop policy if exists affiliate_program_config_select_all on public.affiliate_program_config;
create policy affiliate_program_config_select_all
on public.affiliate_program_config
for select
to authenticated
using (true);

drop policy if exists affiliate_program_config_service_role_all on public.affiliate_program_config;
create policy affiliate_program_config_service_role_all
on public.affiliate_program_config
for all
to service_role
using (true)
with check (true);

create table if not exists public.affiliate_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists affiliate_codes_set_updated_at on public.affiliate_codes;
create trigger affiliate_codes_set_updated_at
before update on public.affiliate_codes
for each row
execute function public.set_updated_at();

alter table public.affiliate_codes enable row level security;

drop policy if exists affiliate_codes_select_own on public.affiliate_codes;
create policy affiliate_codes_select_own
on public.affiliate_codes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists affiliate_codes_service_role_all on public.affiliate_codes;
create policy affiliate_codes_service_role_all
on public.affiliate_codes
for all
to service_role
using (true)
with check (true);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text,
  source text not null default 'link',
  attributed_at timestamptz not null default now(),
  locked_at timestamptz not null default now(),
  locked_reason text,
  created_at timestamptz not null default now(),
  unique (referred_user_id),
  check (referred_user_id <> referrer_user_id)
);

create index if not exists idx_affiliate_referrals_referrer on public.affiliate_referrals(referrer_user_id, created_at desc);

alter table public.affiliate_referrals enable row level security;

drop policy if exists affiliate_referrals_select_referrer_or_referred on public.affiliate_referrals;
create policy affiliate_referrals_select_referrer_or_referred
on public.affiliate_referrals
for select
to authenticated
using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

drop policy if exists affiliate_referrals_service_role_all on public.affiliate_referrals;
create policy affiliate_referrals_service_role_all
on public.affiliate_referrals
for all
to service_role
using (true)
with check (true);

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null,
  status text not null check (status in ('processing','paid','failed')),
  stripe_transfer_id text unique,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_affiliate_payouts_referrer_created on public.affiliate_payouts(referrer_user_id, created_at desc);

drop trigger if exists affiliate_payouts_set_updated_at on public.affiliate_payouts;
create trigger affiliate_payouts_set_updated_at
before update on public.affiliate_payouts
for each row
execute function public.set_updated_at();

alter table public.affiliate_payouts enable row level security;

drop policy if exists affiliate_payouts_select_own on public.affiliate_payouts;
create policy affiliate_payouts_select_own
on public.affiliate_payouts
for select
to authenticated
using (referrer_user_id = auth.uid());

drop policy if exists affiliate_payouts_service_role_all on public.affiliate_payouts;
create policy affiliate_payouts_service_role_all
on public.affiliate_payouts
for all
to service_role
using (true)
with check (true);

create table if not exists public.affiliate_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  kind text not null check (kind in ('credit','debit')),
  status text not null check (status in ('pending','available','in_payout','paid','void')),
  provider_ref text not null,
  stripe_invoice_id text,
  stripe_credit_note_id text,
  amount_cents bigint not null,
  currency text not null,
  commission_base_cents bigint,
  commission_rate_bps integer not null,
  occurred_at timestamptz not null,
  matures_at timestamptz,
  payout_id uuid references public.affiliate_payouts(id) on delete set null,
  stripe_transfer_id text,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, kind, provider_ref, referrer_user_id),
  check (
    (kind = 'credit' and amount_cents > 0)
    or (kind = 'debit' and amount_cents < 0)
  )
);

create index if not exists idx_affiliate_ledger_referrer_status on public.affiliate_ledger_entries(referrer_user_id, status, matures_at);
create index if not exists idx_affiliate_ledger_referred on public.affiliate_ledger_entries(referred_user_id, created_at desc);

alter table public.affiliate_ledger_entries enable row level security;

drop policy if exists affiliate_ledger_entries_select_own on public.affiliate_ledger_entries;
create policy affiliate_ledger_entries_select_own
on public.affiliate_ledger_entries
for select
to authenticated
using (referrer_user_id = auth.uid());

drop policy if exists affiliate_ledger_entries_service_role_all on public.affiliate_ledger_entries;
create policy affiliate_ledger_entries_service_role_all
on public.affiliate_ledger_entries
for all
to service_role
using (true)
with check (true);

create or replace function public.random_affiliate_code(p_len integer default 12)
returns text
language plpgsql
as $$
declare
  v_len integer := greatest(6, least(coalesce(p_len, 12), 64));
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := '';
  v_idx integer;
begin
  for i in 1..v_len loop
    v_idx := (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)) + 1;
    v_out := v_out || substr(v_alphabet, v_idx, 1);
  end loop;
  return v_out;
end;
$$;

-- Returns (and creates if missing) a stable affiliate referral code for the signed-in user.
drop function if exists public.get_or_create_affiliate_code();
create or replace function public.get_or_create_affiliate_code()
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_code text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select c.code
    into v_code
    from public.affiliate_codes c
   where c.user_id = v_user_id;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := public.random_affiliate_code(12);
    begin
      insert into public.affiliate_codes(user_id, code)
      values (v_user_id, v_code);
      exit;
    exception when unique_violation then
      -- retry on rare collision
    end;
  end loop;

  return v_code;
end;
$$;

revoke all on function public.get_or_create_affiliate_code() from public;
grant execute on function public.get_or_create_affiliate_code() to authenticated;
grant execute on function public.get_or_create_affiliate_code() to service_role;

-- Locks a referral for the signed-in user. Once a referral exists for a user, it is immutable in MVP.
drop function if exists public.lock_affiliate_referral(text, text);
create or replace function public.lock_affiliate_referral(p_referral_code text, p_source text default 'link')
returns table(referrer_user_id uuid, referral_code text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_code text;
  v_referrer_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_code := upper(btrim(coalesce(p_referral_code, '')));
  if v_code = '' then
    raise exception 'referral_code is required' using errcode = '22023';
  end if;

  select r.referrer_user_id, r.referral_code
    into referrer_user_id, referral_code
    from public.affiliate_referrals r
   where r.referred_user_id = v_user_id;

  if referrer_user_id is not null then
    return next;
    return;
  end if;

  select c.user_id
    into v_referrer_id
    from public.affiliate_codes c
   where c.code = v_code;

  if v_referrer_id is null then
    raise exception 'Invalid referral code' using errcode = '22023';
  end if;

  if v_referrer_id = v_user_id then
    raise exception 'Self-referrals are not allowed' using errcode = '22023';
  end if;

  insert into public.affiliate_referrals(
    referred_user_id,
    referrer_user_id,
    referral_code,
    source,
    attributed_at,
    locked_at,
    locked_reason
  ) values (
    v_user_id,
    v_referrer_id,
    v_code,
    coalesce(nullif(btrim(p_source), ''), 'link'),
    now(),
    now(),
    'user_lock'
  )
  on conflict (referred_user_id) do nothing;

  referrer_user_id := v_referrer_id;
  referral_code := v_code;
  return next;
end;
$$;

revoke all on function public.lock_affiliate_referral(text, text) from public;
grant execute on function public.lock_affiliate_referral(text, text) to authenticated;
grant execute on function public.lock_affiliate_referral(text, text) to service_role;

-- Read-only affiliate dashboard data for the signed-in user (creator-scoped, not community-scoped).
drop function if exists public.get_affiliate_dashboard();
create or replace function public.get_affiliate_dashboard()
returns table(
  user_id uuid,
  referral_code text,
  eligible boolean,
  builder_tier text,
  has_community boolean,
  has_payouts boolean,
  commission_rate_bps integer,
  hold_days integer,
  min_payout_cents integer,
  pending_balance_cents bigint,
  available_balance_cents bigint,
  in_payout_balance_cents bigint,
  paid_total_cents bigint,
  next_matures_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_tier text;
  v_has_community boolean;
  v_has_payouts boolean;
  v_cfg public.affiliate_program_config%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
    into v_cfg
    from public.affiliate_program_config c
   where c.id = 1;

  select p.builder_tier
    into v_tier
    from public.profiles p
   where p.user_id = v_user_id;

  v_has_community := exists (
    select 1
    from public.communities c
    where c.owner_id = v_user_id
  );

  v_has_payouts := exists (
    select 1
    from public.builder_accounts ba
    where ba.user_id = v_user_id
      and ba.stripe_connected_account_id is not null
  );

  user_id := v_user_id;
  referral_code := public.get_or_create_affiliate_code();
  builder_tier := coalesce(v_tier, 'free');
  has_community := v_has_community;
  has_payouts := v_has_payouts;
  commission_rate_bps := v_cfg.commission_rate_bps;
  hold_days := v_cfg.hold_days;
  min_payout_cents := v_cfg.min_payout_cents;

  eligible :=
    lower(coalesce(builder_tier, '')) in ('builder','pro')
    and has_community
    and has_payouts;

  select
    coalesce(sum(case when e.status = 'pending' then e.amount_cents else 0 end), 0),
    coalesce(sum(case when e.status = 'available' then e.amount_cents else 0 end), 0),
    coalesce(sum(case when e.status = 'in_payout' then e.amount_cents else 0 end), 0),
    coalesce(sum(case when e.status = 'paid' then e.amount_cents else 0 end), 0),
    min(case when e.status = 'pending' then e.matures_at else null end)
  into pending_balance_cents, available_balance_cents, in_payout_balance_cents, paid_total_cents, next_matures_at
  from public.affiliate_ledger_entries e
  where e.referrer_user_id = v_user_id;

  return next;
end;
$$;

revoke all on function public.get_affiliate_dashboard() from public;
grant execute on function public.get_affiliate_dashboard() to authenticated;
grant execute on function public.get_affiliate_dashboard() to service_role;

