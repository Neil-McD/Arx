-- Include pay-first attribution in identity.email_captured events.
--
-- For Stripe-confirmed email, we can safely attach `brandos_aid` captured at checkout_start
-- (stored on payment_intents.tracking) so BrandOS identify can be deterministic.

create or replace function public.enqueue_automation_email_captured_from_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_community_id uuid;
  v_user_id uuid;
  v_brandos_aid text;
  v_occurred_at timestamptz;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;

  v_email := lower(btrim(coalesce(new.checkout_email, '')));
  if v_email = '' then
    return new;
  end if;

  select i.community_id, i.user_id, nullif(i.tracking->>'brandos_aid', '')
    into v_community_id, v_user_id, v_brandos_aid
    from public.payment_intents i
   where i.id = new.payment_intent_id
   limit 1;

  if v_community_id is null then
    return new;
  end if;

  v_occurred_at := coalesce(new.paid_at, new.created_at, now());

  insert into public.automation_events(
    community_id,
    event_type,
    payload,
    occurred_at,
    status,
    next_attempt_at,
    idempotency_key
  ) values (
    v_community_id,
    'identity.email_captured',
    jsonb_build_object(
      'email', v_email,
      'user_id', v_user_id,
      'payment_intent_id', new.payment_intent_id,
      'receipt_id', new.id,
      'source', 'payment_receipt',
      'brandos_aid', v_brandos_aid
    ),
    v_occurred_at,
    'pending',
    now(),
    format('identity.email_captured:%s:%s:%s', v_community_id::text, v_email, coalesce(v_brandos_aid, ''))
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

