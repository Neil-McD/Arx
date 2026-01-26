-- Automations: add first-class `identity.email_captured` (PII) event.
--
-- Goals:
-- - Avoid "include email when available" ambiguity by emitting a dedicated event.
-- - Avoid accidental PII leakage by ensuring old "all events" endpoints don't receive email by default.

-- 1) Backfill: endpoints created with NULL event_types previously meant "all events".
-- Now that PII events exist, default them to membership lifecycle only.
update public.automation_endpoints
   set event_types = array['community.member_joined','community.member_left']
 where event_types is null;

-- 2) Safer defaults for endpoint creation/update: empty selection => membership lifecycle only.

create or replace function public.create_automation_endpoint(
  p_community_id uuid,
  p_name text,
  p_url text,
  p_event_types text[] default null,
  p_include_email boolean default false,
  p_is_enabled boolean default true
)
returns table(
  id uuid,
  name text,
  url text,
  is_enabled boolean,
  event_types text[],
  include_email boolean,
  created_at timestamptz,
  updated_at timestamptz,
  signing_secret text
)
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_event_types text[] := case
    when p_event_types is null then array['community.member_joined','community.member_left']
    when array_length(p_event_types, 1) is null then array['community.member_joined','community.member_left']
    else p_event_types
  end;
  v_secret text;
  v_secret_name text;
  v_secret_id uuid;
  v_endpoint public.automation_endpoints%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if v_url is null then
    raise exception 'url is required' using errcode = '22023';
  end if;
  if left(v_url, 8) <> 'https://' and left(v_url, 7) <> 'http://' then
    raise exception 'url_must_be_http_or_https' using errcode = '22023';
  end if;

  insert into public.automation_endpoints(
    community_id,
    name,
    url,
    is_enabled,
    event_types,
    include_email,
    created_by,
    created_at,
    updated_at
  ) values (
    p_community_id,
    v_name,
    v_url,
    coalesce(p_is_enabled, true),
    v_event_types,
    coalesce(p_include_email, false),
    v_user_id,
    v_now,
    v_now
  )
  returning * into v_endpoint;

  v_secret := encode(gen_random_bytes(24), 'hex');
  v_secret_name := format('automation:%s:%s', v_endpoint.community_id::text, v_endpoint.id::text);
  v_secret_id := vault.create_secret(v_secret, v_secret_name, 'Automation webhook signing secret', null);

  update public.automation_endpoints
     set vault_secret_id = v_secret_id,
         updated_at = v_now
   where id = v_endpoint.id;

  return query
  select
    v_endpoint.id,
    v_endpoint.name,
    v_endpoint.url,
    v_endpoint.is_enabled,
    v_endpoint.event_types,
    v_endpoint.include_email,
    v_endpoint.created_at,
    v_now,
    v_secret;
end;
$$;

create or replace function public.update_automation_endpoint(
  p_endpoint_id uuid,
  p_name text default null,
  p_url text default null,
  p_is_enabled boolean default null,
  p_event_types text[] default null,
  p_include_email boolean default null
)
returns table(
  id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_row public.automation_endpoints%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_event_types text[] := case
    when p_event_types is null then null
    when array_length(p_event_types, 1) is null then array['community.member_joined','community.member_left']
    else p_event_types
  end;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_endpoint_id is null then
    raise exception 'endpoint_id is required' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.automation_endpoints e
   where e.id = p_endpoint_id
   limit 1;

  if not found then
    raise exception 'endpoint_not_found' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(v_row.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_url is not null and left(v_url, 8) <> 'https://' and left(v_url, 7) <> 'http://' then
    raise exception 'url_must_be_http_or_https' using errcode = '22023';
  end if;

  update public.automation_endpoints
     set name = coalesce(v_name, name),
         url = coalesce(v_url, url),
         is_enabled = coalesce(p_is_enabled, is_enabled),
         event_types = case
           when p_event_types is null then event_types
           when array_length(p_event_types, 1) is null then v_event_types
           else v_event_types
         end,
         include_email = coalesce(p_include_email, include_email),
         updated_at = v_now
   where id = p_endpoint_id;

  return query select p_endpoint_id, v_now;
end;
$$;

-- 3) Emit identity.email_captured when a member joins (auth email).
create or replace function public.enqueue_automation_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_email text;
begin
  insert into public.automation_events(
    community_id,
    event_type,
    payload,
    occurred_at,
    status,
    next_attempt_at,
    idempotency_key
  ) values (
    new.community_id,
    'community.member_joined',
    jsonb_build_object(
      'membership_id', new.id,
      'user_id', new.user_id,
      'role', new.role
    ),
    new.created_at,
    'pending',
    now(),
    format('community.member_joined:%s', new.id::text)
  )
  on conflict (idempotency_key) do nothing;

  select lower(btrim(coalesce(u.email, ''))) into v_email
    from auth.users u
   where u.id = new.user_id;

  if v_email is not null and v_email <> '' then
    insert into public.automation_events(
      community_id,
      event_type,
      payload,
      occurred_at,
      status,
      next_attempt_at,
      idempotency_key
    ) values (
      new.community_id,
      'identity.email_captured',
      jsonb_build_object(
        'email', v_email,
        'user_id', new.user_id,
        'membership_id', new.id,
        'source', 'membership'
      ),
      new.created_at,
      'pending',
      now(),
      format('identity.email_captured:%s:%s', new.community_id::text, v_email)
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

-- 4) Emit identity.email_captured when a payment receipt is confirmed (Stripe-confirmed email).
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

  select i.community_id, i.user_id
    into v_community_id, v_user_id
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
      'source', 'payment_receipt'
    ),
    v_occurred_at,
    'pending',
    now(),
    format('identity.email_captured:%s:%s', v_community_id::text, v_email)
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists automation_email_captured_receipt_insert on public.payment_receipts;
create trigger automation_email_captured_receipt_insert
after insert on public.payment_receipts
for each row execute function public.enqueue_automation_email_captured_from_receipt();

drop trigger if exists automation_email_captured_receipt_update on public.payment_receipts;
create trigger automation_email_captured_receipt_update
after update of status, checkout_email on public.payment_receipts
for each row execute function public.enqueue_automation_email_captured_from_receipt();

