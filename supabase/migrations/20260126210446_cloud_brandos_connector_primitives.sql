-- BrandOS connector primitives (MVP).
--
-- Goals:
-- - Store attribution/tracking on canonical payment primitives (pay-first flow).
-- - Add a first-class BrandOS connector without over-generalizing the webhook system.
-- - Keep secrets server-side (Supabase Vault).

-- 1) Tracking primitives (pay-first attribution)

alter table public.payment_intents
  add column if not exists tracking jsonb not null default '{}'::jsonb;

alter table public.purchase_claims
  add column if not exists tracking jsonb not null default '{}'::jsonb;

-- 2) Automation endpoints: add a small "kind" discriminator to support first-class connectors.

alter table public.automation_endpoints
  add column if not exists kind text not null default 'webhook';

alter table public.automation_endpoints
  add column if not exists brandos_account_id uuid null;

alter table public.automation_endpoints
  drop constraint if exists automation_endpoints_kind_check;

alter table public.automation_endpoints
  add constraint automation_endpoints_kind_check
  check (kind in ('webhook', 'brandos'));

create unique index if not exists uq_automation_endpoints_brandos_per_community
  on public.automation_endpoints(community_id)
  where kind = 'brandos';

-- 3) Hide non-webhook connectors from generic webhook management RPCs.

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
    and e.kind = 'webhook'
  order by e.created_at desc;
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
  if v_row.kind <> 'webhook' then
    raise exception 'endpoint_not_editable' using errcode = '22023';
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
  if v_row.kind <> 'webhook' then
    raise exception 'endpoint_not_rotatable' using errcode = '22023';
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
  if v_row.kind <> 'webhook' then
    raise exception 'endpoint_not_deletable' using errcode = '22023';
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

-- 4) BrandOS connector: owned/admin-only upsert + read + delete.

create or replace function public.get_brandos_connector(p_community_id uuid)
returns table(
  endpoint_id uuid,
  base_url text,
  brandos_account_id uuid,
  is_enabled boolean,
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
    e.id as endpoint_id,
    case
      when right(e.url, 13) = '/api/identify' then left(e.url, greatest(length(e.url) - 13, 0))
      else e.url
    end as base_url,
    e.brandos_account_id,
    e.is_enabled,
    e.updated_at
  from public.automation_endpoints e
  where e.community_id = p_community_id
    and e.kind = 'brandos'
  limit 1;
end;
$$;

create or replace function public.upsert_brandos_connector(
  p_community_id uuid,
  p_base_url text,
  p_brandos_account_id uuid,
  p_identify_secret text,
  p_is_enabled boolean default true
)
returns table(
  endpoint_id uuid,
  base_url text,
  brandos_account_id uuid,
  is_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault, extensions
set row_security = off
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_base_url text := nullif(btrim(coalesce(p_base_url, '')), '');
  v_secret text := nullif(btrim(coalesce(p_identify_secret, '')), '');
  v_url text;
  v_secret_id uuid;
  v_secret_name text;
  v_existing public.automation_endpoints%rowtype;
  v_endpoint public.automation_endpoints%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if p_brandos_account_id is null then
    raise exception 'brandos_account_id is required' using errcode = '22023';
  end if;
  if v_base_url is null then
    raise exception 'base_url is required' using errcode = '22023';
  end if;
  if v_secret is null then
    raise exception 'identify_secret is required' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if left(v_base_url, 8) <> 'https://' and left(v_base_url, 7) <> 'http://' then
    raise exception 'url_must_be_http_or_https' using errcode = '22023';
  end if;

  v_base_url := regexp_replace(v_base_url, '/+$', '');
  v_url := case
    when right(v_base_url, 13) = '/api/identify' then v_base_url
    else v_base_url || '/api/identify'
  end;

  v_secret_name := format('brandos:%s', p_community_id::text);

  select *
    into v_existing
    from public.automation_endpoints e
   where e.community_id = p_community_id
     and e.kind = 'brandos'
   limit 1;

  if found and v_existing.vault_secret_id is not null then
    perform vault.update_secret(v_existing.vault_secret_id, v_secret, v_secret_name, 'BrandOS identify secret', null);
    v_secret_id := v_existing.vault_secret_id;
  else
    v_secret_id := vault.create_secret(v_secret, v_secret_name, 'BrandOS identify secret', null);
  end if;

  if found then
    update public.automation_endpoints
       set name = 'BrandOS',
           url = v_url,
           kind = 'brandos',
           brandos_account_id = p_brandos_account_id,
           is_enabled = coalesce(p_is_enabled, true),
           event_types = array['identity.email_captured'],
           include_email = true,
           vault_secret_id = v_secret_id,
           updated_at = v_now
     where id = v_existing.id
     returning * into v_endpoint;
  else
    insert into public.automation_endpoints(
      community_id,
      name,
      url,
      kind,
      brandos_account_id,
      is_enabled,
      event_types,
      include_email,
      vault_secret_id,
      created_by,
      created_at,
      updated_at
    ) values (
      p_community_id,
      'BrandOS',
      v_url,
      'brandos',
      p_brandos_account_id,
      coalesce(p_is_enabled, true),
      array['identity.email_captured'],
      true,
      v_secret_id,
      v_user_id,
      v_now,
      v_now
    )
    returning * into v_endpoint;
  end if;

  return query
  select
    v_endpoint.id,
    case
      when right(v_endpoint.url, 13) = '/api/identify' then left(v_endpoint.url, greatest(length(v_endpoint.url) - 13, 0))
      else v_endpoint.url
    end,
    v_endpoint.brandos_account_id,
    v_endpoint.is_enabled,
    v_endpoint.updated_at;
end;
$$;

create or replace function public.delete_brandos_connector(p_community_id uuid)
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
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.automation_endpoints e
   where e.community_id = p_community_id
     and e.kind = 'brandos'
   limit 1;

  if not found then
    return;
  end if;

  delete from public.automation_endpoints
   where id = v_row.id;

  if v_row.vault_secret_id is not null then
    delete from vault.secrets
     where id = v_row.vault_secret_id;
  end if;
end;
$$;

-- 5) Worker-facing endpoint list: include endpoint kind + BrandOS account id.

drop function if exists public.automation_list_delivery_endpoints(uuid, text);

create or replace function public.automation_list_delivery_endpoints(
  p_community_id uuid,
  p_event_type text
)
returns table(
  endpoint_id uuid,
  kind text,
  url text,
  include_email boolean,
  secret text,
  brandos_account_id uuid
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select
    ep.id as endpoint_id,
    ep.kind,
    ep.url,
    ep.include_email,
    ds.decrypted_secret as secret,
    ep.brandos_account_id
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

revoke all on function public.automation_list_delivery_endpoints(uuid, text) from public;
grant execute on function public.automation_list_delivery_endpoints(uuid, text) to service_role;

-- 6) Restrict test helper to webhook endpoints only.

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
set search_path = public, vault
set row_security = off
as $$
declare
  v_row public.automation_endpoints%rowtype;
  v_secret text;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
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
  if v_row.kind <> 'webhook' then
    raise exception 'endpoint_not_testable' using errcode = '22023';
  end if;
  if not public.has_active_entitlement_role(v_row.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_row.vault_secret_id is not null then
    select ds.decrypted_secret
      into v_secret
      from vault.decrypted_secrets ds
     where ds.id = v_row.vault_secret_id
     limit 1;
  end if;

  return query
  select
    v_row.community_id,
    v_row.id,
    v_row.url,
    v_row.include_email,
    nullif(v_secret, '');
end;
$$;

revoke all on function public.get_brandos_connector(uuid) from public;
revoke all on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) from public;
revoke all on function public.delete_brandos_connector(uuid) from public;

grant execute on function public.get_brandos_connector(uuid) to authenticated;
grant execute on function public.upsert_brandos_connector(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.delete_brandos_connector(uuid) to authenticated;
