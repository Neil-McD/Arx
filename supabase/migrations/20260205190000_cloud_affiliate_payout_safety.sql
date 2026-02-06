-- Affiliate safety hardening:
-- 1) Do not auto-release stale processing payouts back to available to avoid duplicate payouts
--    when transfer outcome is uncertain.
-- 2) Make referral locking race-safe by returning the canonical stored referral row.

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
        failure_reason = coalesce(failure_reason, 'stale_processing_review_required'),
        updated_at = now()
    where status = 'processing'
      and created_at < p_before
    returning id
  )
  select count(*)::integer
    into v_count
    from stale;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.affiliate_release_stale_payouts(timestamptz) from public;
grant execute on function public.affiliate_release_stale_payouts(timestamptz) to service_role;

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

  select r.referrer_user_id, r.referral_code
    into referrer_user_id, referral_code
    from public.affiliate_referrals r
   where r.referred_user_id = v_user_id;

  if referrer_user_id is null then
    raise exception 'Failed to lock referral' using errcode = 'P0001';
  end if;

  return next;
end;
$$;

revoke all on function public.lock_affiliate_referral(text, text) from public;
grant execute on function public.lock_affiliate_referral(text, text) to authenticated;
grant execute on function public.lock_affiliate_referral(text, text) to service_role;
