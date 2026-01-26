-- Community automations (MVP): outbound webhooks + delivery log.
--
-- First principles:
-- - Cloud-canonical: automations are configured per community in Supabase.
-- - Server-side enforcement: only owner/admin can manage automations (via SECURITY DEFINER RPCs).
-- - Safe secrets: webhook signing secrets live in Supabase Vault (referenced by vault_secret_id).

-- 1) Tables

create table if not exists public.automation_endpoints (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  url text not null,
  is_enabled boolean not null default true,
  -- Null means "all events". When non-null, the event is delivered if event_type = any(event_types).
  event_types text[] null,
  -- Per-endpoint PII policy (MVP): allow email to be included for specific endpoints.
  include_email boolean not null default false,
  -- HMAC signing secret stored in Vault; never exposed via table queries.
  vault_secret_id uuid null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_endpoints_community_id
  on public.automation_endpoints(community_id);

drop trigger if exists automation_endpoints_set_updated_at on public.automation_endpoints;
create trigger automation_endpoints_set_updated_at
before update on public.automation_endpoints
for each row execute function public.set_updated_at();

alter table public.automation_endpoints enable row level security;

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','delivering','delivered','dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  idempotency_key text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_events_due
  on public.automation_events(next_attempt_at)
  where status = 'pending';

create index if not exists idx_automation_events_community_id
  on public.automation_events(community_id);

create unique index if not exists uq_automation_events_idempotency_key
  on public.automation_events(idempotency_key)
  where idempotency_key is not null;

alter table public.automation_events enable row level security;

create table if not exists public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.automation_events(id) on delete cascade,
  endpoint_id uuid not null references public.automation_endpoints(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  status text not null check (status in ('success','fail')),
  response_code integer null,
  duration_ms integer null,
  error text null
);

create index if not exists idx_automation_deliveries_event_id
  on public.automation_deliveries(event_id);

create index if not exists idx_automation_deliveries_endpoint_id
  on public.automation_deliveries(endpoint_id);

alter table public.automation_deliveries enable row level security;

-- 2) Membership lifecycle → automation events (MVP)

create or replace function public.enqueue_automation_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

  return new;
end;
$$;

drop trigger if exists automation_member_joined on public.community_memberships;
create trigger automation_member_joined
after insert on public.community_memberships
for each row execute function public.enqueue_automation_member_joined();

create or replace function public.enqueue_automation_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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
    old.community_id,
    'community.member_left',
    jsonb_build_object(
      'membership_id', old.id,
      'user_id', old.user_id,
      'role', old.role
    ),
    now(),
    'pending',
    now(),
    format('community.member_left:%s', old.id::text)
  )
  on conflict (idempotency_key) do nothing;

  return old;
end;
$$;

drop trigger if exists automation_member_left on public.community_memberships;
create trigger automation_member_left
after delete on public.community_memberships
for each row execute function public.enqueue_automation_member_left();

-- 3) RPCs: owner/admin management (client-facing)

create or replace function public.list_automation_endpoints(p_community_id uuid)
returns table(
  id uuid,
  name text,
  url text,
  is_enabled boolean,
  event_types text[],
  include_email boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
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

  return query
  select
    e.id,
    e.name,
    e.url,
    e.is_enabled,
    e.event_types,
    e.include_email,
    e.created_at,
    e.updated_at
  from public.automation_endpoints e
  where e.community_id = p_community_id
  order by e.created_at desc;
end;
$$;

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
    when p_event_types is null then null
    when array_length(p_event_types, 1) is null then null
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
    vault_secret_id,
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
    null,
    v_user_id,
    v_now,
    v_now
  )
  returning * into v_endpoint;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  v_secret_name := format('automation_endpoints:%s:%s', p_community_id::text, v_endpoint.id::text);
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
           when array_length(p_event_types, 1) is null then null
           else p_event_types
         end,
         include_email = coalesce(p_include_email, include_email),
         updated_at = v_now
   where id = p_endpoint_id;

  return query select p_endpoint_id, v_now;
end;
$$;

create or replace function public.rotate_automation_endpoint_secret(p_endpoint_id uuid)
returns table(
  endpoint_id uuid,
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
  v_row public.automation_endpoints%rowtype;
  v_secret text;
  v_secret_name text;
  v_secret_id uuid;
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

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  v_secret_name := format('automation_endpoints:%s:%s', v_row.community_id::text, v_row.id::text);

  if v_row.vault_secret_id is not null then
    perform vault.update_secret(v_row.vault_secret_id, v_secret, v_secret_name, 'Automation webhook signing secret', null);
    v_secret_id := v_row.vault_secret_id;
  else
    v_secret_id := vault.create_secret(v_secret, v_secret_name, 'Automation webhook signing secret', null);
  end if;

  update public.automation_endpoints
     set vault_secret_id = v_secret_id,
         updated_at = v_now
   where id = v_row.id;

  return query select v_row.id, v_now, v_secret;
end;
$$;

create or replace function public.delete_automation_endpoint(p_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_row public.automation_endpoints%rowtype;
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
    return;
  end if;
  if not public.has_active_entitlement_role(v_row.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.automation_endpoints
   where id = v_row.id;

  if v_row.vault_secret_id is not null then
    delete from vault.secrets
     where id = v_row.vault_secret_id;
  end if;
end;
$$;

create or replace function public.list_automation_deliveries(
  p_community_id uuid,
  p_limit integer default 50
)
returns table(
  attempted_at timestamptz,
  event_type text,
  endpoint_name text,
  status text,
  response_code integer,
  duration_ms integer,
  error text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
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

  return query
  select
    d.attempted_at,
    e.event_type,
    ep.name as endpoint_name,
    d.status,
    d.response_code,
    d.duration_ms,
    d.error
  from public.automation_deliveries d
  join public.automation_events e on e.id = d.event_id
  join public.automation_endpoints ep on ep.id = d.endpoint_id
  where e.community_id = p_community_id
  order by d.attempted_at desc
  limit v_limit;
end;
$$;

-- 4) RPCs: worker-only delivery primitives (service_role)

create or replace function public.automation_dequeue_events(p_batch_size integer default 25)
returns table(
  event_id uuid,
  community_id uuid,
  event_type text,
  payload jsonb,
  occurred_at timestamptz,
  attempt_count integer
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  with picked as (
    select e.id
    from public.automation_events e
    where e.status = 'pending'
      and e.next_attempt_at <= now()
    order by e.next_attempt_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 25), 100))
  ),
  bumped as (
    update public.automation_events e
       set status = 'delivering',
           attempt_count = e.attempt_count + 1
      from picked p
     where e.id = p.id
     returning e.id, e.community_id, e.event_type, e.payload, e.occurred_at, e.attempt_count
  )
  select
    b.id as event_id,
    b.community_id,
    b.event_type,
    b.payload,
    b.occurred_at,
    b.attempt_count
  from bumped b;
$$;

create or replace function public.automation_enqueue_event(
  p_community_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  event_id uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_id uuid;
begin
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_event_type, '')), '') is null then
    raise exception 'event_type is required' using errcode = '22023';
  end if;

  if v_key is null then
    insert into public.automation_events(community_id, event_type, payload, occurred_at, status, next_attempt_at)
    values (p_community_id, btrim(p_event_type), coalesce(p_payload, '{}'::jsonb), now(), 'pending', now())
    returning id into v_id;
    return query select v_id;
    return;
  end if;

  insert into public.automation_events(community_id, event_type, payload, occurred_at, status, next_attempt_at, idempotency_key)
  values (p_community_id, btrim(p_event_type), coalesce(p_payload, '{}'::jsonb), now(), 'pending', now(), v_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id
    from public.automation_events e
    where e.idempotency_key = v_key
    limit 1;
  end if;

  return query select v_id;
end;
$$;

create or replace function public.automation_get_endpoint_for_manage(
  p_user_id uuid,
  p_endpoint_id uuid
)
returns table(
  community_id uuid,
  endpoint_id uuid,
  url text,
  include_email boolean,
  signing_secret text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_endpoint public.automation_endpoints%rowtype;
  v_secret text;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;
  if p_endpoint_id is null then
    raise exception 'endpoint_id_required' using errcode = '22023';
  end if;

  select *
    into v_endpoint
    from public.automation_endpoints e
   where e.id = p_endpoint_id
   limit 1;

  if not found then
    raise exception 'endpoint_not_found' using errcode = '22023';
  end if;

  -- Require an active entitlement for the community.
  if not exists (
    select 1
    from public.entitlements e
    where e.community_id = v_endpoint.community_id
      and e.user_id = p_user_id
      and e.starts_at <= v_now
      and (e.ends_at is null or e.ends_at > v_now)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Require owner/admin role.
  if not (
    exists (
      select 1
      from public.communities c
      where c.id = v_endpoint.community_id
        and c.owner_id = p_user_id
    )
    or exists (
      select 1
      from public.community_memberships m
      where m.community_id = v_endpoint.community_id
        and m.user_id = p_user_id
        and m.role in ('owner','admin')
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_endpoint.vault_secret_id is not null then
    select ds.decrypted_secret
      into v_secret
      from vault.decrypted_secrets ds
     where ds.id = v_endpoint.vault_secret_id
     limit 1;
  end if;

  return query
  select
    v_endpoint.community_id,
    v_endpoint.id,
    v_endpoint.url,
    v_endpoint.include_email,
    nullif(v_secret, '');
end;
$$;

create or replace function public.automation_list_delivery_endpoints(
  p_community_id uuid,
  p_event_type text
)
returns table(
  endpoint_id uuid,
  url text,
  include_email boolean,
  signing_secret text
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select
    ep.id as endpoint_id,
    ep.url,
    ep.include_email,
    ds.decrypted_secret as signing_secret
  from public.automation_endpoints ep
  join vault.decrypted_secrets ds on ds.id = ep.vault_secret_id
  where ep.community_id = p_community_id
    and ep.is_enabled = true
    and ep.vault_secret_id is not null
    and (
      ep.event_types is null
      or p_event_type = any(ep.event_types)
    )
  order by ep.created_at asc;
$$;

create or replace function public.automation_record_delivery(
  p_event_id uuid,
  p_endpoint_id uuid,
  p_status text,
  p_response_code integer default null,
  p_duration_ms integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.automation_deliveries(
    event_id,
    endpoint_id,
    status,
    response_code,
    duration_ms,
    error
  ) values (
    p_event_id,
    p_endpoint_id,
    p_status,
    p_response_code,
    p_duration_ms,
    nullif(btrim(coalesce(p_error, '')), '')
  );
end;
$$;

create or replace function public.automation_finalize_event(
  p_event_id uuid,
  p_success boolean,
  p_error text default null
)
returns table(
  status text,
  next_attempt_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_row public.automation_events%rowtype;
  v_max_attempts integer := 5;
  v_backoff_seconds integer;
  v_next timestamptz;
  v_status text;
begin
  if p_event_id is null then
    raise exception 'event_id is required' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.automation_events e
   where e.id = p_event_id
   limit 1;

  if not found then
    return;
  end if;

  if p_success then
    v_status := 'delivered';
    v_next := null;
    update public.automation_events
       set status = v_status,
           next_attempt_at = v_next,
           last_error = null
     where id = v_row.id;
    return query select v_status, v_next, v_row.attempt_count;
    return;
  end if;

  if v_row.attempt_count >= v_max_attempts then
    v_status := 'dead';
    v_next := null;
  else
    v_status := 'pending';
    -- Exponential backoff: 30s, 60s, 120s, 240s...
    v_backoff_seconds := (30 * (2 ^ greatest(v_row.attempt_count - 1, 0)))::integer;
    v_next := v_now + make_interval(secs => v_backoff_seconds);
  end if;

  update public.automation_events
     set status = v_status,
         next_attempt_at = v_next,
         last_error = nullif(btrim(coalesce(p_error, '')), '')
   where id = v_row.id;

  return query select v_status, v_next, v_row.attempt_count;
end;
$$;

-- Restrict worker RPCs to service_role only.
revoke all on function public.automation_dequeue_events(integer) from public;
revoke all on function public.automation_enqueue_event(uuid, text, jsonb, text) from public;
revoke all on function public.automation_get_endpoint_for_manage(uuid, uuid) from public;
revoke all on function public.automation_list_delivery_endpoints(uuid, text) from public;
revoke all on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) from public;
revoke all on function public.automation_finalize_event(uuid, boolean, text) from public;

grant execute on function public.automation_dequeue_events(integer) to service_role;
grant execute on function public.automation_enqueue_event(uuid, text, jsonb, text) to service_role;
grant execute on function public.automation_get_endpoint_for_manage(uuid, uuid) to service_role;
grant execute on function public.automation_list_delivery_endpoints(uuid, text) to service_role;
grant execute on function public.automation_record_delivery(uuid, uuid, text, integer, integer, text) to service_role;
grant execute on function public.automation_finalize_event(uuid, boolean, text) to service_role;
