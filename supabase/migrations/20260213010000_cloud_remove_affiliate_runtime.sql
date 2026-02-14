-- Remove deferred affiliate runtime (MVP scope reduction).

-- Best-effort unschedule of affiliate worker job if pg_cron is available.
do $$
begin
  begin
    perform cron.unschedule('arx_affiliate_worker');
  exception
    when undefined_function then null;
    when undefined_table then null;
  end;
end
$$;

-- Drop affiliate worker/scheduler helper functions.
drop function if exists public.affiliate_worker_secret();
drop function if exists public.affiliate_enable_worker(text, integer);

-- Drop affiliate payout worker RPCs.
drop function if exists public.affiliate_mature_ledger(timestamptz);
drop function if exists public.affiliate_release_stale_payouts(timestamptz);
drop function if exists public.affiliate_list_payout_candidates(integer);
drop function if exists public.affiliate_reserve_payout(uuid, text);
drop function if exists public.affiliate_finalize_payout(uuid, boolean, text, text);

-- Drop affiliate user-facing/helper RPCs.
drop function if exists public.get_affiliate_dashboard();
drop function if exists public.get_or_create_affiliate_code();
drop function if exists public.lock_affiliate_referral(text, text);
drop function if exists public.random_affiliate_code(integer);

-- Drop affiliate tables (deferred system, no MVP dependency).
drop table if exists public.affiliate_ledger_entries cascade;
drop table if exists public.affiliate_payouts cascade;
drop table if exists public.affiliate_referrals cascade;
drop table if exists public.affiliate_codes cascade;
drop table if exists public.affiliate_program_config cascade;

-- Best-effort secret cleanup.
do $$
begin
  begin
    delete from vault.secrets where name = 'affiliate_worker_secret';
  exception
    when undefined_table then null;
    when undefined_schema then null;
    when insufficient_privilege then null;
  end;
end
$$;
