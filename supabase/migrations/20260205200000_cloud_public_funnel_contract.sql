-- Canonical public funnel contract.
--
-- Goals:
-- - Keep one canonical community URL (/c/<slug>) as the entry point.
-- - Provide a single server-side resolver for join mode + active offering options.
-- - Add a secure lead-capture primitive for external funnels (BYO pages) to feed automations.

create table if not exists public.community_funnel_leads (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  email text not null,
  full_name text,
  source text not null default 'public_funnel',
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  capture_count integer not null default 1 check (capture_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, email)
);

create index if not exists idx_community_funnel_leads_community_last_seen
  on public.community_funnel_leads(community_id, last_seen_at desc);

create index if not exists idx_community_funnel_leads_source
  on public.community_funnel_leads(source, last_seen_at desc);

drop trigger if exists community_funnel_leads_set_updated_at on public.community_funnel_leads;
create trigger community_funnel_leads_set_updated_at
before update on public.community_funnel_leads
for each row execute function public.set_updated_at();

alter table public.community_funnel_leads enable row level security;

drop policy if exists community_funnel_leads_admin_select on public.community_funnel_leads;
create policy community_funnel_leads_admin_select
on public.community_funnel_leads
for select
to authenticated
using (public.has_active_entitlement_role(community_id, array['owner','admin']));

drop function if exists public.get_public_community_funnel_by_slug(text);
create or replace function public.get_public_community_funnel_by_slug(p_community_slug text)
returns table (
  community_id uuid,
  slug text,
  name text,
  description text,
  avatar_url text,
  banner_url text,
  visibility text,
  free_join_requires_approval boolean,
  join_mode text,
  active_plans jsonb,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slug text;
  v_community public.communities%rowtype;
  v_has_paid_plans boolean := false;
  v_active_plans jsonb := '[]'::jsonb;
  v_join_mode text := 'request_access';
begin
  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select *
    into v_community
    from public.communities c
   where c.slug = v_slug
     and c.visibility in ('public', 'private', 'unlisted')
   limit 1;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.plans p
     where p.community_id = v_community.id
       and p.is_active = true
       and p.billing_period in ('monthly', 'yearly')
       and p.visibility in ('public', 'unlisted')
  )
    into v_has_paid_plans;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'description', p.description,
               'amount_base_units', p.amount_base_units,
               'currency', p.currency,
               'currency_decimals', p.currency_decimals,
               'billing_period', p.billing_period
             )
             order by case when p.billing_period = 'monthly' then 0 else 1 end
           ),
           '[]'::jsonb
         )
    into v_active_plans
    from public.plans p
   where p.community_id = v_community.id
     and p.is_active = true
     and p.billing_period in ('monthly', 'yearly')
     and p.visibility in ('public', 'unlisted');

  if v_has_paid_plans then
    v_join_mode := 'checkout';
  elsif v_community.visibility = 'private' then
    v_join_mode := 'request_access';
  elsif v_community.visibility in ('public', 'unlisted') then
    if coalesce(v_community.free_join_requires_approval, false) then
      v_join_mode := 'request_access';
    else
      v_join_mode := 'join_free';
    end if;
  else
    v_join_mode := 'request_access';
  end if;

  return query
  select
    v_community.id,
    v_community.slug,
    v_community.name,
    v_community.description,
    v_community.avatar_url,
    v_community.banner_url,
    v_community.visibility,
    coalesce(v_community.free_join_requires_approval, false),
    v_join_mode,
    v_active_plans,
    v_community.updated_at,
    v_community.created_at;
end;
$$;

revoke all on function public.get_public_community_funnel_by_slug(text) from public;
revoke all on function public.get_public_community_funnel_by_slug(text) from anon;
revoke all on function public.get_public_community_funnel_by_slug(text) from authenticated;
revoke all on function public.get_public_community_funnel_by_slug(text) from service_role;
grant execute on function public.get_public_community_funnel_by_slug(text) to anon;
grant execute on function public.get_public_community_funnel_by_slug(text) to authenticated;
grant execute on function public.get_public_community_funnel_by_slug(text) to service_role;

drop function if exists public.list_community_funnel_leads(uuid, integer);
create or replace function public.list_community_funnel_leads(
  p_community_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  community_id uuid,
  email text,
  full_name text,
  source text,
  metadata jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  capture_count integer,
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
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
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
    l.id,
    l.community_id,
    l.email,
    l.full_name,
    l.source,
    l.metadata,
    l.first_seen_at,
    l.last_seen_at,
    l.capture_count,
    l.created_at,
    l.updated_at
  from public.community_funnel_leads l
  where l.community_id = p_community_id
  order by l.last_seen_at desc
  limit v_limit;
end;
$$;

revoke all on function public.list_community_funnel_leads(uuid, integer) from public;
revoke all on function public.list_community_funnel_leads(uuid, integer) from anon;
revoke all on function public.list_community_funnel_leads(uuid, integer) from authenticated;
revoke all on function public.list_community_funnel_leads(uuid, integer) from service_role;
grant execute on function public.list_community_funnel_leads(uuid, integer) to authenticated;
grant execute on function public.list_community_funnel_leads(uuid, integer) to service_role;

drop function if exists public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb);
create or replace function public.capture_community_funnel_lead_by_slug(
  p_community_slug text,
  p_email text,
  p_full_name text default null,
  p_source text default 'public_funnel',
  p_brandos_aid uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  community_id uuid,
  community_slug text,
  email text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  capture_count integer
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_slug text;
  v_email text;
  v_full_name text;
  v_source text;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_community public.communities%rowtype;
  v_row public.community_funnel_leads%rowtype;
begin
  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;
  if v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_full_name is not null and length(v_full_name) > 200 then
    v_full_name := left(v_full_name, 200);
  end if;

  v_source := lower(btrim(coalesce(p_source, 'public_funnel')));
  if v_source = '' then
    v_source := 'public_funnel';
  end if;
  if length(v_source) > 64 then
    v_source := left(v_source, 64);
  end if;

  if jsonb_typeof(v_metadata) is distinct from 'object' then
    v_metadata := jsonb_build_object('value', v_metadata);
  end if;

  select *
    into v_community
    from public.communities c
   where c.slug = v_slug
     and c.visibility in ('public', 'private', 'unlisted')
   limit 1;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  insert into public.community_funnel_leads(
    community_id,
    email,
    full_name,
    source,
    metadata,
    first_seen_at,
    last_seen_at,
    capture_count,
    created_at,
    updated_at
  ) values (
    v_community.id,
    v_email,
    v_full_name,
    v_source,
    v_metadata,
    v_now,
    v_now,
    1,
    v_now,
    v_now
  )
  on conflict (community_id, email)
  do update set
    full_name = coalesce(excluded.full_name, public.community_funnel_leads.full_name),
    source = excluded.source,
    metadata = coalesce(public.community_funnel_leads.metadata, '{}'::jsonb) || excluded.metadata,
    last_seen_at = v_now,
    capture_count = public.community_funnel_leads.capture_count + 1,
    updated_at = v_now
  returning * into v_row;

  insert into public.automation_events(
    community_id,
    event_type,
    payload,
    occurred_at,
    status,
    next_attempt_at,
    idempotency_key
  ) values (
    v_community.id,
    'identity.email_captured',
    jsonb_strip_nulls(
      jsonb_build_object(
        'email', v_email,
        'full_name', v_full_name,
        'source', v_source,
        'brandos_aid', p_brandos_aid,
        'lead_id', v_row.id,
        'capture_count', v_row.capture_count,
        'metadata', v_metadata
      )
    ),
    v_now,
    'pending',
    now(),
    format(
      'identity.email_captured:funnel:%s:%s:%s',
      v_community.id::text,
      v_email,
      coalesce(p_brandos_aid::text, '')
    )
  )
  on conflict (idempotency_key) do nothing;

  return query
  select
    v_row.community_id,
    v_community.slug,
    v_row.email,
    v_row.first_seen_at,
    v_row.last_seen_at,
    v_row.capture_count;
end;
$$;

revoke all on function public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb) from public;
revoke all on function public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb) from anon;
revoke all on function public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb) from authenticated;
revoke all on function public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb) from service_role;
grant execute on function public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb) to service_role;
