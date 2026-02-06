-- Affiliate payouts worker: DB helpers for maturation + payout reservation/finalization.

create or replace function public.affiliate_mature_ledger(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer;
begin
  update public.affiliate_ledger_entries
  set status = 'available'
  where status = 'pending'
    and matures_at is not null
    and matures_at <= p_now;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.affiliate_mature_ledger(timestamptz) from public;
grant execute on function public.affiliate_mature_ledger(timestamptz) to service_role;

create or replace function public.affiliate_release_stale_payouts(p_before timestamptz default (now() - interval '2 hours'))
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.affiliate_payouts
    set status = 'failed',
        failure_reason = coalesce(failure_reason, 'stale_processing'),
        updated_at = now()
    where status = 'processing'
      and created_at < p_before
    returning id
  )
  update public.affiliate_ledger_entries e
  set status = 'available',
      payout_id = null
  where e.status = 'in_payout'
    and e.payout_id in (select id from stale);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.affiliate_release_stale_payouts(timestamptz) from public;
grant execute on function public.affiliate_release_stale_payouts(timestamptz) to service_role;

create or replace function public.affiliate_list_payout_candidates(p_limit integer default 25)
returns table(referrer_user_id uuid, currency text, net_available_cents bigint)
language sql
security definer
set search_path = public
set row_security = off
as $$
  with cfg as (
    select min_payout_cents
    from public.affiliate_program_config
    where id = 1
  )
  select
    e.referrer_user_id,
    e.currency,
    sum(e.amount_cents)::bigint as net_available_cents
  from public.affiliate_ledger_entries e
  cross join cfg
  where e.status = 'available'
  group by e.referrer_user_id, e.currency, cfg.min_payout_cents
  having sum(e.amount_cents) >= greatest(1, cfg.min_payout_cents)::bigint
  order by sum(e.amount_cents) desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

revoke all on function public.affiliate_list_payout_candidates(integer) from public;
grant execute on function public.affiliate_list_payout_candidates(integer) to service_role;

create or replace function public.affiliate_reserve_payout(p_referrer_user_id uuid, p_currency text)
returns table(payout_id uuid, amount_cents bigint)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid := p_referrer_user_id;
  v_currency text := lower(btrim(coalesce(p_currency, '')));
  v_amount bigint := 0;
  v_min integer := 0;
  v_payout_id uuid;
begin
  if v_user_id is null then
    raise exception 'referrer_user_id is required' using errcode = '22023';
  end if;
  if v_currency = '' then
    raise exception 'currency is required' using errcode = '22023';
  end if;

  select min_payout_cents
    into v_min
    from public.affiliate_program_config
   where id = 1;
  v_min := coalesce(v_min, 0);

  -- Lock all available rows for this referrer/currency to prevent double reservation.
  perform 1
    from public.affiliate_ledger_entries e
   where e.referrer_user_id = v_user_id
     and e.currency = v_currency
     and e.status = 'available'
   for update;

  select coalesce(sum(e.amount_cents), 0)::bigint
    into v_amount
    from public.affiliate_ledger_entries e
   where e.referrer_user_id = v_user_id
     and e.currency = v_currency
     and e.status = 'available';

  if v_amount <= 0 then
    return;
  end if;

  if v_amount < greatest(1, v_min)::bigint then
    return;
  end if;

  insert into public.affiliate_payouts(referrer_user_id, amount_cents, currency, status)
  values (v_user_id, v_amount, v_currency, 'processing')
  returning id into v_payout_id;

  update public.affiliate_ledger_entries
  set status = 'in_payout',
      payout_id = v_payout_id
  where referrer_user_id = v_user_id
    and currency = v_currency
    and status = 'available';

  payout_id := v_payout_id;
  amount_cents := v_amount;
  return next;
end;
$$;

revoke all on function public.affiliate_reserve_payout(uuid, text) from public;
grant execute on function public.affiliate_reserve_payout(uuid, text) to service_role;

create or replace function public.affiliate_finalize_payout(
  p_payout_id uuid,
  p_paid boolean,
  p_stripe_transfer_id text default null,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_payout_id uuid := p_payout_id;
  v_paid boolean := coalesce(p_paid, false);
  v_transfer_id text := nullif(btrim(coalesce(p_stripe_transfer_id, '')), '');
  v_failure text := nullif(btrim(coalesce(p_failure_reason, '')), '');
begin
  if v_payout_id is null then
    raise exception 'payout_id is required' using errcode = '22023';
  end if;

  if v_paid then
    update public.affiliate_payouts
    set status = 'paid',
        stripe_transfer_id = coalesce(stripe_transfer_id, v_transfer_id),
        paid_at = coalesce(paid_at, now()),
        failure_reason = null,
        updated_at = now()
    where id = v_payout_id
      and status = 'processing';

    update public.affiliate_ledger_entries
    set status = 'paid',
        stripe_transfer_id = coalesce(stripe_transfer_id, v_transfer_id)
    where payout_id = v_payout_id
      and status = 'in_payout';
  else
    update public.affiliate_payouts
    set status = 'failed',
        failure_reason = coalesce(v_failure, failure_reason, 'failed'),
        updated_at = now()
    where id = v_payout_id
      and status = 'processing';

    update public.affiliate_ledger_entries
    set status = 'available',
        payout_id = null
    where payout_id = v_payout_id
      and status = 'in_payout';
  end if;
end;
$$;

revoke all on function public.affiliate_finalize_payout(uuid, boolean, text, text) from public;
grant execute on function public.affiliate_finalize_payout(uuid, boolean, text, text) to service_role;

