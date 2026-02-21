-- Canonical MVP baseline (Phase B artifact, not active migration chain yet).
-- Generated: 2026-02-12T19:00:00Z
-- Source: linked project final public schema dump via 'supabase db dump --dry-run' script + local pg_dump execution.
-- Scope: public schema only; cutover will archive legacy history and activate this baseline in Phase C.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE SCHEMA IF NOT EXISTS "public";
ALTER SCHEMA "public" OWNER TO "pg_database_owner";
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE OR REPLACE FUNCTION "public"."accept_community_invite"("invite_code" "text") RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
#variable_conflict use_column
declare
  v_invite public.community_invites%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if invite_code is null or btrim(invite_code) = '' then
    raise exception 'Invite code is required' using errcode = '22023';
  end if;

  select *
    into v_invite
    from public.community_invites
   where code = btrim(invite_code)
   limit 1;

  if not found then
    raise exception 'Invalid invite code' using errcode = '22023';
  end if;

  -- Insert invite use first so max_uses/expires/revoked are enforced.
  insert into public.community_invite_uses(invite_id, user_id)
  values (v_invite.id, auth.uid())
  on conflict (invite_id, user_id) do nothing;

  -- Membership is always member; roles are manual-only.
  insert into public.community_memberships(community_id, user_id, role)
  values (v_invite.community_id, auth.uid(), 'member')
  on conflict on constraint community_memberships_community_id_user_id_key do nothing;

  -- Grant entitlement if missing/expired.
  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    v_invite.community_id,
    'invite',
    v_invite.code,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select c.id, c.slug, c.name
    from public.communities c
   where c.id = v_invite.community_id;
end;
$$;
ALTER FUNCTION "public"."accept_community_invite"("invite_code" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."approve_community_join_request"("p_request_id" "uuid") RETURNS TABLE("community_id" "uuid", "user_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
  v_request public.community_join_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_request
  from public.community_join_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_request.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.community_join_requests
     set status = 'approved',
         decided_at = v_now,
         decided_by = auth.uid(),
         denied_until = null,
         updated_at = v_now
   where id = v_request.id
   returning * into v_request;

  insert into public.community_memberships(community_id, user_id, role)
  values (v_request.community_id, v_request.user_id, 'member')
  on conflict on constraint community_memberships_community_id_user_id_key do nothing;

  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    v_request.user_id,
    v_request.community_id,
    'request_access',
    v_request.id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select v_request.community_id, v_request.user_id, v_request.status;
end;
$$;
ALTER FUNCTION "public"."approve_community_join_request"("p_request_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."clear_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_row public.user_provider_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if not found then
    return;
  end if;

  delete from public.user_provider_keys
   where id = v_row.id;

  if v_row.vault_secret_id is not null then
    delete from vault.secrets
     where id = v_row.vault_secret_id;
  end if;
end $$;
ALTER FUNCTION "public"."clear_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."communities_before_delete_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  delete from public.threads t
  where t.id = old.id
    and t.engine_id = 'community_chat';

  return old;
end;
$$;
ALTER FUNCTION "public"."communities_before_delete_cleanup"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_artifact_publish"("p_community_id" "uuid", "p_artifact_type" "text", "p_artifact_payload" "jsonb", "p_request_key" "text" DEFAULT NULL::"text") RETURNS TABLE("artifact_id" "uuid", "created_at" timestamp with time zone, "storage_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_artifact_type text := lower(nullif(btrim(coalesce(p_artifact_type, '')), ''));
  v_payload jsonb := coalesce(p_artifact_payload, '{}'::jsonb);
  v_request_key text := nullif(btrim(coalesce(p_request_key, '')), '');
  v_file_key text := case when v_request_key is null then null else format('tool_request:%s', v_request_key) end;
  v_title text;
  v_body_md text;
  v_artifact_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if v_artifact_type is null then
    raise exception 'artifact_type is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception 'artifact_payload must be an object' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_file_key is not null then
    select r.id, r.created_at
      into v_artifact_id, v_created_at
      from public.community_resources r
     where r.community_id = p_community_id
       and r.file_key = v_file_key
     limit 1;

    if v_artifact_id is not null then
      return query select v_artifact_id, v_created_at, 'community_resources'::text;
      return;
    end if;
  end if;

  v_title := coalesce(
    nullif(btrim(v_payload ->> 'title'), ''),
    format('%s artifact', v_artifact_type)
  );
  v_body_md := format('```json\n%s\n```', jsonb_pretty(v_payload));

  insert into public.community_resources(
    community_id,
    type,
    title,
    body_md,
    url,
    file_key,
    pinned
  )
  values (
    p_community_id,
    format('artifact:%s', v_artifact_type),
    v_title,
    v_body_md,
    null,
    v_file_key,
    false
  )
  returning id, community_resources.created_at into v_artifact_id, v_created_at;

  return query select v_artifact_id, v_created_at, 'community_resources'::text;
end;
$$;
ALTER FUNCTION "public"."community_artifact_publish"("p_community_id" "uuid", "p_artifact_type" "text", "p_artifact_payload" "jsonb", "p_request_key" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_automation_trigger"("p_community_id" "uuid", "p_event_type" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_request_key" "text" DEFAULT NULL::"text") RETURNS TABLE("event_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_event_type, '')), '') is null then
    raise exception 'event_type is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'payload must be an object' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select ae.event_id
    from public.automation_enqueue_event(
      p_community_id,
      btrim(p_event_type),
      coalesce(p_payload, '{}'::jsonb),
      nullif(btrim(coalesce(p_request_key, '')), '')
    ) ae;
end;
$$;
ALTER FUNCTION "public"."community_automation_trigger"("p_community_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_request_key" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_chat_message_create"("p_community_id" "uuid", "p_channel_id" "uuid", "p_message_text" "text", "p_request_key" "text" DEFAULT NULL::"text") RETURNS TABLE("message_id" "uuid", "thread_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_thread_id uuid;
  v_message text := nullif(btrim(coalesce(p_message_text, '')), '');
  v_request_key text := nullif(btrim(coalesce(p_request_key, '')), '');
  v_message_id uuid;
  v_created_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if p_channel_id is null then
    raise exception 'channel_id is required' using errcode = '22023';
  end if;
  if v_message is null then
    raise exception 'message_text is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select ect.thread_id
    into v_thread_id
    from public.ensure_community_chat_thread(p_community_id) ect
   limit 1;

  if v_thread_id is null then
    raise exception 'community_chat_thread_unavailable' using errcode = '22023';
  end if;

  if p_channel_id is distinct from v_thread_id then
    raise exception 'invalid_channel_id' using errcode = '22023';
  end if;

  if v_request_key is not null then
    select m.id, m.created_at
      into v_message_id, v_created_at
      from public.messages m
     where m.thread_id = v_thread_id
       and m.role = 'user'
       and m.sender_id = v_user_id
       and m.content_json -> 'meta' ->> 'request_key' = v_request_key
     order by m.created_at desc
     limit 1;

    if v_message_id is not null then
      return query select v_message_id, v_thread_id, v_created_at;
      return;
    end if;
  end if;

  insert into public.messages(
    thread_id,
    seq,
    role,
    content_json,
    sender_id
  )
  values (
    v_thread_id,
    0,
    'user',
    jsonb_build_object(
      'text',
      v_message,
      'meta',
      jsonb_build_object(
        'source', 'community_chat_message_create',
        'request_key', v_request_key
      )
    ),
    v_user_id
  )
  returning id, messages.created_at into v_message_id, v_created_at;

  return query select v_message_id, v_thread_id, v_created_at;
end;
$$;
ALTER FUNCTION "public"."community_chat_message_create"("p_community_id" "uuid", "p_channel_id" "uuid", "p_message_text" "text", "p_request_key" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_entitled_member_count"("p_community_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_count bigint;
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

  select count(*)
    into v_count
    from public.entitlements e
   where e.community_id = p_community_id
     and e.starts_at <= now()
     and (e.ends_at is null or e.ends_at > now());

  return coalesce(v_count, 0);
end;
$$;
ALTER FUNCTION "public"."community_entitled_member_count"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_owner_is_pro"("p_community_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.communities c
    join public.profiles p on p.user_id = c.owner_id
    where c.id = p_community_id
      and lower(coalesce(p.builder_tier, '')) = 'pro'
  );
$$;
ALTER FUNCTION "public"."community_owner_is_pro"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_resource_publish"("p_community_id" "uuid", "p_title" "text", "p_content_markdown" "text", "p_source_url" "text" DEFAULT NULL::"text", "p_request_key" "text" DEFAULT NULL::"text") RETURNS TABLE("resource_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_content text := nullif(btrim(coalesce(p_content_markdown, '')), '');
  v_source_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_request_key text := nullif(btrim(coalesce(p_request_key, '')), '');
  v_file_key text := case when v_request_key is null then null else format('tool_request:%s', v_request_key) end;
  v_resource_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if v_title is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if v_content is null then
    raise exception 'content_markdown is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_file_key is not null then
    select r.id, r.created_at
      into v_resource_id, v_created_at
      from public.community_resources r
     where r.community_id = p_community_id
       and r.file_key = v_file_key
     limit 1;

    if v_resource_id is not null then
      return query select v_resource_id, v_created_at;
      return;
    end if;
  end if;

  insert into public.community_resources(
    community_id,
    type,
    title,
    body_md,
    url,
    file_key,
    pinned
  )
  values (
    p_community_id,
    'note',
    v_title,
    v_content,
    v_source_url,
    v_file_key,
    false
  )
  returning id, community_resources.created_at into v_resource_id, v_created_at;

  return query select v_resource_id, v_created_at;
end;
$$;
ALTER FUNCTION "public"."community_resource_publish"("p_community_id" "uuid", "p_title" "text", "p_content_markdown" "text", "p_source_url" "text", "p_request_key" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_resources_block_sensitive_content"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_combined text;
begin
  if tg_op = 'UPDATE'
    and new.title is not distinct from old.title
    and new.body_md is not distinct from old.body_md
    and new.url is not distinct from old.url
  then
    return new;
  end if;

  v_combined := coalesce(new.title, '') || E'\n' || coalesce(new.body_md, '') || E'\n' || coalesce(new.url, '');

  if v_combined ~* '-----BEGIN[[:space:]][A-Z ]*PRIVATE KEY-----'
    or v_combined ~* 'sk-ant-[A-Za-z0-9_-]{10,}'
    or v_combined ~* 'sk-[A-Za-z0-9]{20,}'
    or v_combined ~* 'AKIA[0-9A-Z]{16}'
    or v_combined ~* '(api[_-]?key|access[_-]?token|auth[_-]?token)[[:space:]]*[:=][[:space:]]*[A-Za-z0-9._\/-]{16,}'
    or v_combined ~* 'bearer[[:space:]]+[A-Za-z0-9._=\-]{16,}'
    or v_combined ~* 'password[[:space:]]*[:=][[:space:]]*[^[:space:]]{6,}'
    or v_combined ~* '(postgres|mysql|mongodb(\+srv)?|redis)://[^[:space:]]+'
    or v_combined ~* 'gh[pousr]_[A-Za-z0-9_]{20,}'
    or v_combined ~* 'github_pat_[A-Za-z0-9_]{20,}'
    or v_combined ~* 'xox[baprs]-[A-Za-z0-9-]{10,}'
  then
    raise exception 'sensitive_content_blocked' using errcode = '22023';
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."community_resources_block_sensitive_content"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."community_revenue_series"("p_community_id" "uuid", "p_range" "text") RETURNS TABLE("bucket_start" timestamp with time zone, "gross_base_units" numeric, "platform_fee_base_units" numeric, "net_base_units" numeric, "currency" "text", "currency_decimals" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_bucket text;
  v_step interval;
  v_since timestamptz;
  v_series_start timestamptz;
  v_series_end timestamptz;
  v_currency text;
  v_decimals smallint;
  v_currency_count integer;
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

  case coalesce(p_range, '30d')
    when '7d' then
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '6 days';
    when '30d' then
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '29 days';
    when '90d' then
      v_bucket := 'week';
      v_step := interval '1 week';
      v_since := date_trunc('day', v_now) - interval '89 days';
    when '1y' then
      v_bucket := 'month';
      v_step := interval '1 month';
      v_since := date_trunc('month', v_now) - interval '11 months';
    when 'all' then
      v_bucket := 'month';
      v_step := interval '1 month';
      v_since := null;
    else
      v_bucket := 'day';
      v_step := interval '1 day';
      v_since := date_trunc('day', v_now) - interval '29 days';
  end case;

  -- Determine currency for the series (MVP: require single currency per community).
  select count(distinct le.currency)
    into v_currency_count
    from public.payment_ledger_entries le
   where le.community_id = p_community_id;

  if coalesce(v_currency_count, 0) > 1 then
    raise exception 'multi_currency_not_supported' using errcode = '22023';
  end if;

  if coalesce(v_currency_count, 0) = 1 then
    select le.currency, le.currency_decimals
      into v_currency, v_decimals
      from public.payment_ledger_entries le
     where le.community_id = p_community_id
     order by le.occurred_at asc
     limit 1;
  else
    -- No ledger entries yet: infer currency from active plans, else default to USD.
    select p.currency, p.currency_decimals
      into v_currency, v_decimals
      from public.plans p
     where p.community_id = p_community_id
       and p.is_active = true
       and p.billing_period in ('monthly','yearly')
     order by p.updated_at desc
     limit 1;

    if v_currency is null or v_decimals is null then
      v_currency := 'usd';
      v_decimals := 2;
    end if;
  end if;

  v_series_start := date_trunc(
    v_bucket,
    coalesce(
      v_since,
      (select min(le.occurred_at)
         from public.payment_ledger_entries le
        where le.community_id = p_community_id
      ),
      (select c.created_at from public.communities c where c.id = p_community_id)
    )
  );
  if v_series_start is null then
    v_series_start := date_trunc(v_bucket, v_now);
  end if;

  v_series_end := date_trunc(v_bucket, v_now);

  return query
  with buckets as (
    select generate_series(v_series_start, v_series_end, v_step) as bucket_start
  ),
  revenue as (
    select
      date_trunc(v_bucket, le.occurred_at) as bucket_start,
      sum(le.amount_base_units) as gross_base_units,
      sum(
        coalesce(
          le.platform_fee_amount_base_units,
          (le.amount_base_units * le.platform_fee_bps) / 10000
        )
      ) as platform_fee_base_units,
      sum(
        le.amount_base_units
        - coalesce(
          le.platform_fee_amount_base_units,
          (le.amount_base_units * le.platform_fee_bps) / 10000
        )
      ) as net_base_units
    from public.payment_ledger_entries le
    where le.community_id = p_community_id
      and (v_since is null or le.occurred_at >= v_since)
    group by 1
  )
  select
    b.bucket_start,
    coalesce(rv.gross_base_units, 0)::numeric as gross_base_units,
    coalesce(rv.platform_fee_base_units, 0)::numeric as platform_fee_base_units,
    coalesce(rv.net_base_units, 0)::numeric as net_base_units,
    v_currency,
    v_decimals
  from buckets b
  left join revenue rv using (bucket_start)
  order by b.bucket_start asc;
end;
$$;
ALTER FUNCTION "public"."community_revenue_series"("p_community_id" "uuid", "p_range" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."consume_platform_inference_standard"("p_user_id" "uuid", "p_units" integer DEFAULT 1) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_now timestamptz := now();
  v_period date := date_trunc('month', v_now)::date;
  v_tier text;
  v_cap integer;
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_units is null or p_units <= 0 then
    raise exception 'units_required' using errcode = '22023';
  end if;

  select p.builder_tier
    into v_tier
    from public.profiles p
   where p.user_id = p_user_id
   limit 1;

  v_cap := public.platform_inference_standard_cap_for_builder_tier(coalesce(v_tier, ''));

  if v_cap <= 0 then
    raise exception 'platform_inference_not_allowed' using errcode = '42501';
  end if;

  insert into public.user_platform_inference_usage(user_id, period_start, standard_used, updated_at)
  values (p_user_id, v_period, 0, v_now)
  on conflict (user_id, period_start) do nothing;

  select u.standard_used
    into v_used
    from public.user_platform_inference_usage u
   where u.user_id = p_user_id
     and u.period_start = v_period
   for update;

  if v_used is null then
    v_used := 0;
  end if;

  if (v_used + p_units) > v_cap then
    raise exception 'platform_inference_quota_exceeded' using errcode = '42501';
  end if;

  update public.user_platform_inference_usage
     set standard_used = v_used + p_units,
         updated_at = v_now
   where user_id = p_user_id
     and period_start = v_period
   returning standard_used into v_used;

  return greatest(0, v_cap - v_used);
end;
$$;
ALTER FUNCTION "public"."consume_platform_inference_standard"("p_user_id" "uuid", "p_units" integer) OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."communities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "avatar_url" "text",
    "visibility" "text" DEFAULT 'published'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "banner_url" "text",
    "free_join_requires_approval" boolean DEFAULT false NOT NULL,
    CONSTRAINT "communities_visibility_check" CHECK (("visibility" = ANY (ARRAY['published'::"text", 'unlisted'::"text"])))
);
ALTER TABLE "public"."communities" OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_community"("p_name" "text", "p_slug" "text", "p_visibility" "text" DEFAULT 'published'::"text", "p_description" "text" DEFAULT NULL::"text", "p_avatar_url" "text" DEFAULT NULL::"text", "p_banner_url" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."communities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $_$
declare
  v_user_id uuid;
  v_community public.communities%rowtype;
  v_slug text;
  v_name text;
  v_visibility text;
  v_description text;
  v_avatar_url text;
  v_banner_url text;
  v_builder_tier text;
  v_max integer;
  v_existing_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.builder_tier
    into v_builder_tier
    from public.profiles p
   where p.user_id = v_user_id;

  v_max := public.max_communities_for_builder_tier(coalesce(v_builder_tier, 'free'));
  if v_max <= 0 then
    raise exception 'Builder plan required to create communities' using errcode = '42501';
  end if;

  select count(1)
    into v_existing_count
    from public.communities c
   where c.owner_id = v_user_id;

  if v_existing_count >= v_max then
    raise exception 'Community limit reached for your plan' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'slug is required' using errcode = '22023';
  end if;

  if length(v_slug) < 3 or length(v_slug) > 32 or v_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  v_visibility := lower(btrim(coalesce(p_visibility, 'published')));
  if v_visibility not in ('published', 'unlisted') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  v_avatar_url := nullif(btrim(coalesce(p_avatar_url, '')), '');
  v_banner_url := nullif(btrim(coalesce(p_banner_url, '')), '');

  insert into public.communities(
    slug,
    name,
    owner_id,
    visibility,
    description,
    avatar_url,
    banner_url
  ) values (
    v_slug,
    v_name,
    v_user_id,
    v_visibility,
    v_description,
    v_avatar_url,
    v_banner_url
  )
  returning * into v_community;

  perform public.ensure_community_bootstrap(v_community.id);

  return query
  select *
    from public.communities c
   where c.id = v_community.id;
end;
$_$;
ALTER FUNCTION "public"."create_community"("p_name" "text", "p_slug" "text", "p_visibility" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."decide_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_decision" "text", "p_reasons" "jsonb" DEFAULT '[]'::"jsonb") RETURNS TABLE("decision_id" "uuid", "resource_id" "uuid", "decision" "text", "state" "text", "safety_status" "text", "safety_reasons" "jsonb", "signal_score" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_resource public.community_resources%rowtype;
  v_decision text;
  v_state text;
  v_safety_status text;
  v_reasons jsonb := coalesce(p_reasons, '[]'::jsonb);
  v_decision_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_community_id is null or p_resource_id is null then
    raise exception 'resource_required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into v_resource
  from public.community_resources
  where id = p_resource_id
    and community_id = p_community_id;

  if not found then
    raise exception 'resource_not_found' using errcode = '22023';
  end if;

  v_decision := lower(btrim(coalesce(p_decision, '')));
  if v_decision not in ('publish', 'review_queue', 'reject', 'withdraw') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if jsonb_typeof(v_reasons) is distinct from 'array' then
    v_reasons := '[]'::jsonb;
  end if;

  if v_decision = 'publish' and v_resource.safety_status = 'blocked' then
    raise exception 'blocked_resource_cannot_publish' using errcode = '22023';
  end if;

  v_state := case v_decision
    when 'publish' then 'published'
    when 'review_queue' then 'pending_review'
    when 'reject' then 'rejected'
    else 'withdrawn'
  end;

  v_safety_status := case v_decision
    when 'publish' then 'pass'
    when 'review_queue' then case when v_resource.safety_status = 'blocked' then 'review' else v_resource.safety_status end
    else v_resource.safety_status
  end;

  if v_decision = 'publish' then
    v_reasons := '[]'::jsonb;
  elsif jsonb_array_length(v_reasons) = 0 then
    v_reasons := coalesce(v_resource.safety_reasons, '[]'::jsonb);
  end if;

  update public.community_resources
     set state = v_state,
         safety_status = v_safety_status,
         safety_reasons = v_reasons,
         moderated_by = v_actor_id,
         moderated_at = now(),
         published_at = case when v_decision = 'publish' then coalesce(published_at, now()) else published_at end,
         withdrawn_at = case when v_decision = 'withdraw' then now() else null end
   where id = p_resource_id
     and community_id = p_community_id;

  insert into public.community_resource_decisions (
    id,
    resource_id,
    community_id,
    decision,
    safety_status,
    reasons,
    signal_score,
    source_kind,
    source_refs,
    actor_user_id,
    actor_kind
  )
  values (
    v_decision_id,
    v_resource.id,
    v_resource.community_id,
    v_decision,
    v_safety_status,
    v_reasons,
    v_resource.signal_score,
    coalesce(v_resource.source_kind, 'manual'),
    coalesce(v_resource.source_refs, '[]'::jsonb),
    v_actor_id,
    'moderator'
  );

  return query
  select
    v_decision_id,
    v_resource.id,
    v_decision,
    v_state,
    v_safety_status,
    v_reasons,
    v_resource.signal_score;
end;
$$;
ALTER FUNCTION "public"."decide_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_decision" "text", "p_reasons" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."deny_community_join_request"("p_request_id" "uuid") RETURNS TABLE("community_id" "uuid", "user_id" "uuid", "status" "text", "denied_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_now timestamptz := now();
  v_request public.community_join_requests%rowtype;
  v_denied_until timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_request
  from public.community_join_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_request.community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.community_join_requests
     set status = 'denied',
         decided_at = v_now,
         decided_by = auth.uid(),
         denied_until = v_denied_until,
         updated_at = v_now
   where id = v_request.id
   returning * into v_request;

  return query
  select v_request.community_id, v_request.user_id, v_request.status, v_request.denied_until;
end;
$$;
ALTER FUNCTION "public"."deny_community_join_request"("p_request_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."dev_set_my_builder_tier"("p_builder_tier" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_email text;
  v_tier text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select lower(coalesce(u.email, ''))
    into v_email
    from auth.users u
   where u.id = auth.uid()
   limit 1;

  if v_email not in ('neilmcdevittd@gmail.com', 'neilmcdevitt@gmail.com') then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_tier := lower(btrim(coalesce(p_builder_tier, '')));
  if v_tier = 'architect' then
    v_tier := 'pro';
  end if;
  if v_tier not in ('free', 'builder', 'pro') then
    raise exception 'invalid_builder_tier' using errcode = '22023';
  end if;

  update public.profiles
     set builder_tier = v_tier,
         updated_at = now()
   where user_id = auth.uid();

  return v_tier;
end;
$$;
ALTER FUNCTION "public"."dev_set_my_builder_tier"("p_builder_tier" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."edge_rate_limit_allow"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'rate_limit_key_required' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'rate_limit_window_required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'rate_limit_limit_required' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.edge_rate_limits(key, window_start, window_seconds, count, updated_at)
  values (btrim(p_key), v_window_start, p_window_seconds, 1, v_now)
  on conflict (key) do update set
    window_start = excluded.window_start,
    window_seconds = excluded.window_seconds,
    count = case
      when edge_rate_limits.window_start = excluded.window_start then edge_rate_limits.count + 1
      else 1
    end,
    updated_at = v_now
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
ALTER FUNCTION "public"."edge_rate_limit_allow"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."enforce_ai_history_quota"("p_thread_id" "uuid", "p_delta_bytes" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_thread public.threads%rowtype;
  v_user_id uuid;
  v_tier text;
  v_cap bigint;
  v_current bigint;
begin
  if p_thread_id is null then
    return;
  end if;

  if p_delta_bytes is null or p_delta_bytes = 0 then
    return;
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    return;
  end if;

  if v_thread.engine_id = 'community_chat' then
    return;
  end if;

  v_user_id := v_thread.owner_id;
  if v_user_id is null then
    return;
  end if;

  select p.builder_tier
    into v_tier
    from public.profiles p
   where p.user_id = v_user_id;

  v_cap := public.max_ai_history_bytes_for_builder_tier(coalesce(v_tier, 'free'));

  insert into public.user_ai_history_usage(user_id, bytes_used)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select u.bytes_used
    into v_current
    from public.user_ai_history_usage u
   where u.user_id = v_user_id
   for update;

  if v_current is null then
    v_current := 0;
  end if;

  if p_delta_bytes > 0 and (v_current + p_delta_bytes) > v_cap then
    raise exception 'Cloud history limit reached. Upgrade to increase storage.' using errcode = '42501';
  end if;

  update public.user_ai_history_usage
     set bytes_used = greatest(0, v_current + p_delta_bytes)
   where user_id = v_user_id;
end;
$$;
ALTER FUNCTION "public"."enforce_ai_history_quota"("p_thread_id" "uuid", "p_delta_bytes" bigint) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."enforce_community_chat_message_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_engine_id text;
  v_community_id uuid;
  v_key text;
  v_attachment_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    -- service_role / internal automation
    return new;
  end if;

  -- Only enforce for community chat messages (the public social surface).
  select t.engine_id, t.community_id into v_engine_id, v_community_id
  from public.threads t
  where t.id = new.thread_id;

  if v_engine_id is distinct from 'community_chat' then
    return new;
  end if;

  if v_community_id is null then
    raise exception 'community_chat_requires_community_id' using errcode = '22023';
  end if;

  -- Size guardrail: allow attachments, but keep payload bounded for realtime/preview performance.
  -- Web chat images are capped client-side (~600k chars per image). This cap supports up to 8 attachments.
  if octet_length(new.content_json::text) > 6000000 then
    raise exception 'message_too_large' using errcode = '22023';
  end if;

  -- Attachment count guardrail (UI allows up to 8 attachments per message).
  if jsonb_typeof(new.content_json) = 'object' and (new.content_json ? 'attachments') then
    if jsonb_typeof(new.content_json->'attachments') = 'array' then
      v_attachment_count := jsonb_array_length(new.content_json->'attachments');
    end if;
  end if;
  if v_attachment_count > 8 then
    raise exception 'too_many_attachments' using errcode = '22023';
  end if;

  -- Per-user per-community message limit (sliding-window via edge_rate_limits primitive).
  if tg_op = 'INSERT' then
    v_key := format('auth:community_chat:msg:%s:%s', v_community_id::text, v_user_id::text);
    if not public.edge_rate_limit_allow(v_key, 60, 30) then
      raise exception 'rate_limited' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."enforce_community_chat_message_limits"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."enforce_community_invite_use"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  invite_row public.community_invites%rowtype;
  usage_count integer;
begin
  select * into invite_row
  from public.community_invites
  where id = new.invite_id
  for update;

  if not found then
    raise exception 'invite not found';
  end if;

  if invite_row.revoked_at is not null then
    raise exception 'invite revoked';
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    raise exception 'invite expired';
  end if;

  if invite_row.max_uses is not null then
    select count(*) into usage_count
    from public.community_invite_uses
    where invite_id = new.invite_id;

    if usage_count >= invite_row.max_uses then
      raise exception 'invite max uses reached';
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."enforce_community_invite_use"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."enforce_community_resource_create_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_key text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return new;
  end if;

  -- Size guardrails: avoid huge markdown blobs in the MVP DB.
  if new.title is not null and length(new.title) > 200 then
    raise exception 'resource_title_too_long' using errcode = '22023';
  end if;
  if new.body_md is not null and octet_length(new.body_md) > 200000 then
    raise exception 'resource_body_too_large' using errcode = '22023';
  end if;
  if new.url is not null and length(new.url) > 2000 then
    raise exception 'resource_url_too_long' using errcode = '22023';
  end if;

  -- Per-user per-community creation limit.
  if tg_op = 'INSERT' then
    v_key := format('auth:community_resource:create:%s:%s', new.community_id::text, v_user_id::text);
    if not public.edge_rate_limit_allow(v_key, 60, 10) then
      raise exception 'rate_limited' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."enforce_community_resource_create_limits"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."ensure_community_bootstrap"("p_community_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_owner_id uuid;
  v_existing_thread public.threads%rowtype;
begin
  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select c.owner_id
    into v_owner_id
    from public.communities c
   where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  -- Owner membership (projection).
  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, v_owner_id, 'owner')
  on conflict (community_id, user_id) do update
    set role = 'owner';

  -- Owner entitlement (canonical access).
  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    v_owner_id,
    p_community_id,
    'manual_grant',
    'community_bootstrap',
    now(),
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null;

  -- Community chat thread (threads.id == community_id).
  select * into v_existing_thread
  from public.threads t
  where t.id = p_community_id
  limit 1;

  if found then
    if v_existing_thread.engine_id <> 'community_chat'
      or v_existing_thread.community_id is distinct from p_community_id
    then
      raise exception 'community_chat_thread_collision' using errcode = '23514';
    end if;
  else
    insert into public.threads(
      id,
      owner_id,
      title,
      engine_id,
      model_id,
      community_id
    ) values (
      p_community_id,
      v_owner_id,
      'Community chat',
      'community_chat',
      null,
      p_community_id
    )
    on conflict (id) do nothing;
  end if;
end;
$$;
ALTER FUNCTION "public"."ensure_community_bootstrap"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."ensure_community_chat_thread"("p_community_id" "uuid") RETURNS TABLE("thread_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_owner_id uuid;
  v_existing_thread public.threads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  select c.owner_id
    into v_owner_id
    from public.communities c
   where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  select *
    into v_existing_thread
    from public.threads t
   where t.id = p_community_id
   limit 1;

  if found then
    if v_existing_thread.engine_id <> 'community_chat'
      or v_existing_thread.community_id is distinct from p_community_id
    then
      raise exception 'community_chat_thread_collision' using errcode = '23514';
    end if;

    return query select p_community_id;
    return;
  end if;

  insert into public.threads(
    id,
    owner_id,
    title,
    engine_id,
    model_id,
    community_id
  ) values (
    p_community_id,
    v_owner_id,
    'Community chat',
    'community_chat',
    null,
    p_community_id
  )
  on conflict (id) do nothing;

  return query select p_community_id;
end;
$$;
ALTER FUNCTION "public"."ensure_community_chat_thread"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_active_community_agent_landing"("p_community_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_landing jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    return null;
  end if;

  select d.landing_json
    into v_landing
    from public.community_agent_drafts d
   where d.community_id = p_community_id
     and d.is_active = true
   limit 1;

  return v_landing;
end;
$$;
ALTER FUNCTION "public"."get_active_community_agent_landing"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_active_community_agent_system_prompt"("p_user_id" "uuid", "p_community_id" "uuid") RETURNS TABLE("draft_id" "uuid", "system_prompt" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if p_user_id is null or p_community_id is null then
    return;
  end if;

  if not public.user_has_active_entitlement(p_user_id, p_community_id) then
    return;
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    return;
  end if;

  return query
  select d.id, d.system_prompt
    from public.community_agent_drafts d
   where d.community_id = p_community_id
     and d.is_active = true
   limit 1;
end;
$$;
ALTER FUNCTION "public"."get_active_community_agent_system_prompt"("p_user_id" "uuid", "p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_community_pricing"("p_community_id" "uuid") RETURNS TABLE("billing_period" "text", "plan_id" "uuid", "amount_base_units" numeric, "currency" "text", "currency_decimals" smallint, "visibility" "text", "stripe_price_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
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
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    p.billing_period,
    p.id as plan_id,
    p.amount_base_units,
    p.currency,
    p.currency_decimals,
    p.visibility,
    p.stripe_price_id
  from public.plans p
  where p.community_id = p_community_id
    and p.is_active = true
    and p.billing_period in ('monthly','yearly')
  order by case p.billing_period when 'monthly' then 0 else 1 end, p.updated_at desc;
end;
$$;
ALTER FUNCTION "public"."get_community_pricing"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_capabilities"() RETURNS TABLE("user_id" "uuid", "auth_state" "text", "builder_tier" "text", "builder_plan_code" "text", "is_builder_paid" boolean, "can_create_community" boolean, "can_use_voice_dictation" boolean, "can_use_platform_inference" boolean, "max_communities" integer, "platform_fee_bps" integer, "ai_history_bytes_cap" bigint, "platform_inference_standard_cap" integer, "has_payouts" boolean, "subscription_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
  select * from public.get_user_capabilities(v_user_id);
end;
$$;
ALTER FUNCTION "public"."get_my_capabilities"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_community_access"("p_community_id" "uuid") RETURNS TABLE("community_id" "uuid", "user_id" "uuid", "is_owner" boolean, "is_entitled" boolean, "entitlement_role" "text", "entitlement_ends_at" timestamp with time zone, "effective_role" "text", "can_view" boolean, "can_post_message" boolean, "can_create_resource" boolean, "can_manage_resources" boolean, "can_invite" boolean, "can_manage_members" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_is_owner boolean;
  v_is_entitled boolean;
  v_ent public.entitlements%rowtype;
  v_membership_role text;
  v_entitlement_role text;
  v_effective_role text;
  v_is_admin boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = p_community_id
  ) then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  v_is_owner := exists (
    select 1
    from public.communities c
    where c.id = p_community_id
      and c.owner_id = v_user_id
  );

  v_is_entitled := public.has_active_entitlement(p_community_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  select *
    into v_ent
    from public.entitlements e
   where e.user_id = v_user_id
     and e.community_id = p_community_id
   order by e.starts_at desc
   limit 1;

  select m.role
    into v_membership_role
    from public.community_memberships m
   where m.community_id = p_community_id
     and m.user_id = v_user_id
   limit 1;

  v_entitlement_role := null;
  if v_is_owner then
    v_entitlement_role := 'owner';
  elsif v_is_entitled then
    v_entitlement_role := coalesce(v_membership_role, 'member');
  end if;

  v_effective_role := v_entitlement_role;

  return query
  select
    p_community_id,
    v_user_id,
    v_is_owner,
    v_is_entitled,
    v_entitlement_role,
    v_ent.ends_at,
    v_effective_role,
    v_is_entitled,
    v_is_entitled,
    (
      v_is_owner
      or public.has_active_entitlement_role(p_community_id, array['owner','admin','mod'])
    ),
    (
      v_is_owner
      or public.has_active_entitlement_role(p_community_id, array['owner','admin','mod'])
    ),
    v_is_owner,
    (v_is_owner or v_is_admin);
end;
$$;
ALTER FUNCTION "public"."get_my_community_access"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_community_access_by_slug"("p_community_slug" "text") RETURNS TABLE("community_id" "uuid", "user_id" "uuid", "is_owner" boolean, "is_entitled" boolean, "entitlement_role" "text", "entitlement_ends_at" timestamp with time zone, "effective_role" "text", "can_view" boolean, "can_post_message" boolean, "can_create_resource" boolean, "can_manage_resources" boolean, "can_invite" boolean, "can_manage_members" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_slug text;
  v_community_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select c.id into v_community_id
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if v_community_id is null then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  return query
  select * from public.get_my_community_access(v_community_id);
end;
$$;
ALTER FUNCTION "public"."get_my_community_access_by_slug"("p_community_slug" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_join_request_by_slug"("p_community_slug" "text") RETURNS TABLE("community_id" "uuid", "status" "text", "denied_until" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_slug text;
  v_community_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select c.id into v_community_id
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if v_community_id is null then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  return query
  select r.community_id, r.status, r.denied_until, r.updated_at
  from public.community_join_requests r
  where r.community_id = v_community_id
    and r.user_id = v_user_id
  limit 1;
end;
$$;
ALTER FUNCTION "public"."get_my_join_request_by_slug"("p_community_slug" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_join_requests_by_slugs"("p_community_slugs" "text"[]) RETURNS TABLE("community_slug" "text", "community_id" "uuid", "status" "text", "denied_until" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
  with normalized_slugs as (
    select distinct lower(btrim(input_slug.value)) as slug
    from unnest(coalesce(p_community_slugs, array[]::text[])) as input_slug(value)
    where lower(btrim(input_slug.value)) <> ''
  )
  select
    c.slug as community_slug,
    r.community_id,
    r.status,
    r.denied_until,
    r.updated_at
  from normalized_slugs ns
  join public.communities c
    on c.slug = ns.slug
  join public.community_join_requests r
    on r.community_id = c.id
   and r.user_id = v_user_id;
end;
$$;
ALTER FUNCTION "public"."get_my_join_requests_by_slugs"("p_community_slugs" "text"[]) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_my_product_state"() RETURNS TABLE("user_id" "uuid", "auth_state" "text", "builder_tier" "text", "builder_plan_code" "text", "builder_plan_price_usd" integer, "is_builder_paid" boolean, "can_create_community" boolean, "can_use_voice_dictation" boolean, "can_use_platform_inference" boolean, "max_communities" integer, "platform_fee_bps" integer, "has_payouts" boolean, "subscription_status" "text", "current_period_end" timestamp with time zone, "cancel_at_period_end" boolean, "ai_history_bytes_used" bigint, "ai_history_bytes_cap" bigint, "platform_inference_standard_used" integer, "platform_inference_standard_cap" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
  select
    caps.user_id,
    caps.auth_state,
    caps.builder_tier,
    caps.builder_plan_code,
    case
      when caps.builder_tier = 'pro' then 100
      when caps.builder_tier = 'builder' then 20
      else 0
    end as builder_plan_price_usd,
    caps.is_builder_paid,
    caps.can_create_community,
    caps.can_use_voice_dictation,
    caps.can_use_platform_inference,
    caps.max_communities,
    caps.platform_fee_bps,
    caps.has_payouts,
    caps.subscription_status,
    bs.current_period_end,
    bs.cancel_at_period_end,
    coalesce(ahu.bytes_used, 0)::bigint as ai_history_bytes_used,
    caps.ai_history_bytes_cap,
    coalesce(piu.standard_used, 0) as platform_inference_standard_used,
    caps.platform_inference_standard_cap
  from public.get_user_capabilities(v_user_id) caps
  left join lateral (
    select b.current_period_end, b.cancel_at_period_end
    from public.builder_subscriptions b
    where b.user_id = v_user_id
      and b.provider = 'stripe'
    order by b.updated_at desc
    limit 1
  ) bs on true
  left join public.user_ai_history_usage ahu
    on ahu.user_id = v_user_id
  left join public.user_platform_inference_usage piu
    on piu.user_id = v_user_id
   and piu.period_start = date_trunc('month', now())::date;
end;
$$;
ALTER FUNCTION "public"."get_my_product_state"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") RETURNS TABLE("community_id" "uuid", "slug" "text", "name" "text", "description" "text", "avatar_url" "text", "banner_url" "text", "visibility" "text", "free_join_requires_approval" boolean, "join_mode" "text", "active_plans" "jsonb", "updated_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
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
     and c.visibility in ('published', 'unlisted')
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
       and p.visibility in ('published', 'unlisted')
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
     and p.visibility in ('published', 'unlisted');

  if v_has_paid_plans then
    v_join_mode := 'checkout';
  elsif v_community.visibility = 'unlisted' then
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
ALTER FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_user_capabilities"("p_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "auth_state" "text", "builder_tier" "text", "builder_plan_code" "text", "is_builder_paid" boolean, "can_create_community" boolean, "can_use_voice_dictation" boolean, "can_use_platform_inference" boolean, "max_communities" integer, "platform_fee_bps" integer, "ai_history_bytes_cap" bigint, "platform_inference_standard_cap" integer, "has_payouts" boolean, "subscription_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_tier text := 'free';
begin
  v_user_id := p_user_id;
  if v_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  select lower(coalesce(p.builder_tier, 'free'))
    into v_tier
    from public.profiles p
   where p.user_id = v_user_id
   limit 1;

  if not found or v_tier is null then
    v_tier := 'free';
  end if;

  if v_tier not in ('free', 'builder', 'pro') then
    v_tier := 'free';
  end if;

  return query
  select
    v_user_id as user_id,
    'linked_identity'::text as auth_state,
    v_tier as builder_tier,
    case
      when v_tier = 'pro' then 'pro_100'
      when v_tier = 'builder' then 'builder_20'
      else 'free'
    end as builder_plan_code,
    (v_tier in ('builder', 'pro')) as is_builder_paid,
    (v_tier in ('builder', 'pro')) as can_create_community,
    (v_tier in ('builder', 'pro')) as can_use_voice_dictation,
    (v_tier in ('builder', 'pro')) as can_use_platform_inference,
    public.max_communities_for_builder_tier(v_tier) as max_communities,
    case
      when v_tier = 'pro' then 300
      when v_tier = 'builder' then 1000
      else 1000
    end as platform_fee_bps,
    public.max_ai_history_bytes_for_builder_tier(v_tier) as ai_history_bytes_cap,
    public.platform_inference_standard_cap_for_builder_tier(v_tier) as platform_inference_standard_cap,
    (ba.stripe_connected_account_id is not null) as has_payouts,
    bs.status as subscription_status
  from (select 1) as anchor
  left join public.builder_accounts ba on ba.user_id = v_user_id
  left join lateral (
    select b.status
    from public.builder_subscriptions b
    where b.user_id = v_user_id
      and b.provider = 'stripe'
    order by b.updated_at desc
    limit 1
  ) bs on true;
end;
$$;
ALTER FUNCTION "public"."get_user_capabilities"("p_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  insert into public.profiles(user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."has_active_entitlement"("p_community_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;
ALTER FUNCTION "public"."has_active_entitlement"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."has_active_entitlement_role"("p_community_id" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select
    public.has_active_entitlement(p_community_id)
    and (
      (
        'owner' = any (p_roles)
        and exists (
          select 1
          from public.communities c
          where c.id = p_community_id
            and c.owner_id = auth.uid()
        )
      )
      or exists (
        select 1
        from public.community_memberships m
        where m.community_id = p_community_id
          and m.user_id = auth.uid()
          and m.role = any (p_roles)
      )
    );
$$;
ALTER FUNCTION "public"."has_active_entitlement_role"("p_community_id" "uuid", "p_roles" "text"[]) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and lower(coalesce(p.builder_tier, '')) in ('builder', 'pro')
  );
$$;
ALTER FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."hash_purchase_claim_token"("token" "text") RETURNS "bytea"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select extensions.digest(token, 'sha256');
$$;
ALTER FUNCTION "public"."hash_purchase_claim_token"("token" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_community_member"("p_community_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_active_entitlement(p_community_id);
$$;
ALTER FUNCTION "public"."is_community_member"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_community_owner"("p_community_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1
    from public.communities c
    where c.id = p_community_id
      and c.owner_id = auth.uid()
  );
$$;
ALTER FUNCTION "public"."is_community_owner"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."join_public_community"("p_community_id" "uuid", "p_brandos_aid" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_now timestamptz := now();
  v_requires_approval boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select coalesce(c.free_join_requires_approval, false) into v_requires_approval
  from public.communities c
  where c.id = p_community_id
    and c.visibility = 'unlisted'
  limit 1;

  if not found then
    raise exception 'Community is not open for free joins' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.plans p
    where p.community_id = p_community_id
      and p.is_active = true
      and p.billing_period in ('monthly','yearly')
      and p.visibility in ('published','unlisted')
  ) then
    raise exception 'paid_plan_required' using errcode = '22023';
  end if;

  if v_requires_approval then
    raise exception 'approval_required' using errcode = '22023';
  end if;

  if p_brandos_aid is not null then
    perform set_config('arx.brandos_aid', p_brandos_aid::text, true);
  end if;

  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    auth.uid(),
    p_community_id,
    'public_join',
    p_community_id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  where entitlements.ends_at is not null
    and entitlements.ends_at <= v_now;

  return query
  select c.id, c.slug, c.name
    from public.communities c
   where c.id = p_community_id;
end;
$$;
ALTER FUNCTION "public"."join_public_community"("p_community_id" "uuid", "p_brandos_aid" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."join_public_community_by_slug"("p_community_slug" "text", "p_brandos_aid" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_slug text;
  v_community_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select c.id into v_community_id
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if v_community_id is null then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  return query
  select * from public.join_public_community(v_community_id, p_brandos_aid);
end;
$$;
ALTER FUNCTION "public"."join_public_community_by_slug"("p_community_slug" "text", "p_brandos_aid" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."leave_community"("p_community_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_owner_id uuid;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select c.owner_id into v_owner_id
  from public.communities c
  where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  if v_owner_id = v_user_id then
    raise exception 'cannot_leave_owner' using errcode = '22023';
  end if;

  -- Revoke canonical access immediately.
  update public.entitlements
    set ends_at = v_now,
        source = 'self_leave',
        source_ref = 'leave_community:' || v_user_id::text
  where user_id = v_user_id
    and community_id = p_community_id;

  -- Remove from roster projection.
  delete from public.community_memberships
  where community_id = p_community_id
    and user_id = v_user_id;

  -- Clean up per-member settings (optional).
  delete from public.community_member_settings
  where community_id = p_community_id
    and user_id = v_user_id;
end;
$$;
ALTER FUNCTION "public"."leave_community"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."list_community_agent_drafts"("p_community_id" "uuid") RETURNS TABLE("id" "uuid", "community_id" "uuid", "slot" integer, "name" "text", "landing_json" "jsonb", "system_prompt" "text", "is_active" boolean, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  return query
  select d.id, d.community_id, d.slot, d.name, d.landing_json, d.system_prompt, d.is_active, d.updated_at
    from public.community_agent_drafts d
   where d.community_id = p_community_id
   order by d.slot asc;
end;
$$;
ALTER FUNCTION "public"."list_community_agent_drafts"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."list_community_join_requests"("p_community_id" "uuid") RETURNS TABLE("id" "uuid", "community_id" "uuid", "user_id" "uuid", "status" "text", "message" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "decided_at" timestamp with time zone, "decided_by" "uuid", "denied_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    r.id,
    r.community_id,
    r.user_id,
    r.status,
    r.message,
    r.created_at,
    r.updated_at,
    r.decided_at,
    r.decided_by,
    r.denied_until
  from public.community_join_requests r
  where r.community_id = p_community_id
    and r.status = 'pending'
  order by r.created_at asc;
end;
$$;
ALTER FUNCTION "public"."list_community_join_requests"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") RETURNS TABLE("id" "uuid", "community_id" "uuid", "user_id" "uuid", "role" "text", "created_at" timestamp with time zone, "is_entitled" boolean, "entitlement_ends_at" timestamp with time zone, "access_status" "text", "subscription_plan_id" "uuid", "subscription_billing_period" "text", "subscription_amount_base_units" numeric, "subscription_currency" "text", "subscription_currency_decimals" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
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

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  return query
  select
    m.id,
    m.community_id,
    m.user_id,
    m.role,
    m.created_at,
    public.user_has_active_entitlement(m.user_id, m.community_id) as is_entitled,
    e.ends_at as entitlement_ends_at,
    case
      when public.user_has_active_entitlement(m.user_id, m.community_id) then 'active'
      else 'declined'
    end as access_status,
    ps_summary.plan_id as subscription_plan_id,
    ps_summary.billing_period as subscription_billing_period,
    ps_summary.amount_base_units as subscription_amount_base_units,
    ps_summary.currency as subscription_currency,
    ps_summary.currency_decimals as subscription_currency_decimals
  from public.community_memberships m
  left join public.entitlements e
    on e.user_id = m.user_id
   and e.community_id = m.community_id
  left join lateral (
    select
      ps.plan_id,
      p.billing_period,
      p.amount_base_units,
      p.currency,
      p.currency_decimals
    from public.provider_subscriptions ps
    join public.plans p
      on p.id = ps.plan_id
    where ps.community_id = m.community_id
      and ps.user_id = m.user_id
    order by ps.updated_at desc
    limit 1
  ) as ps_summary on true
  where m.community_id = p_community_id
  order by m.created_at asc;
end;
$$;
ALTER FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."list_pending_purchase_claims"() RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_email text;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  v_email := lower(btrim(coalesce(v_email, '')));

  return query
  select out.community_id, out.community_slug, out.community_name, out.expires_at
  from (
    select distinct on (pi.community_id)
      c.id as community_id,
      c.slug as community_slug,
      c.name as community_name,
      pc.expires_at,
      pc.created_at
    from public.purchase_claims pc
    join public.payment_intents pi on pi.id = pc.payment_intent_id
    join public.communities c on c.id = pi.community_id
    where pc.status = 'issued'
      and pc.expires_at > v_now
      and pi.status = 'succeeded'
      and (
        (pi.user_id is not null and pi.user_id = v_user_id)
        or (
          pi.user_id is null
          and pc.issued_to_email is not null
          and lower(btrim(pc.issued_to_email)) = v_email
        )
      )
    order by pi.community_id, pc.created_at desc
  ) out
  order by out.created_at desc;
end;
$$;
ALTER FUNCTION "public"."list_pending_purchase_claims"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."max_ai_history_bytes_for_builder_tier"("p_tier" "text") RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 26843545600 -- 25 GiB
    when lower(coalesce(p_tier, '')) = 'builder' then 5368709120 -- 5 GiB
    else 262144000 -- 250 MiB
  end;
$$;
ALTER FUNCTION "public"."max_ai_history_bytes_for_builder_tier"("p_tier" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."max_communities_for_builder_tier"("p_tier" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 3
    when lower(coalesce(p_tier, '')) = 'builder' then 1
    else 0
  end;
$$;
ALTER FUNCTION "public"."max_communities_for_builder_tier"("p_tier" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_ai_history_after_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_old bigint;
begin
  v_old := octet_length(coalesce(old.content_json::text, ''));
  perform public.enforce_ai_history_quota(old.thread_id, -v_old);
  return old;
end;
$$;
ALTER FUNCTION "public"."messages_ai_history_after_delete"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_ai_history_before_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_bytes bigint;
begin
  v_bytes := octet_length(coalesce(new.content_json::text, ''));
  perform public.enforce_ai_history_quota(new.thread_id, v_bytes);
  return new;
end;
$$;
ALTER FUNCTION "public"."messages_ai_history_before_insert"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_ai_history_before_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_old bigint;
  v_new bigint;
begin
  if new.content_json is not distinct from old.content_json then
    return new;
  end if;

  v_old := octet_length(coalesce(old.content_json::text, ''));
  v_new := octet_length(coalesce(new.content_json::text, ''));
  perform public.enforce_ai_history_quota(new.thread_id, v_new - v_old);
  return new;
end;
$$;
ALTER FUNCTION "public"."messages_ai_history_before_update"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_assign_seq"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if new.seq is null or new.seq = 0 or auth.uid() is not null then
    new.seq := public.next_thread_seq(new.thread_id);
  else
    update public.threads
      set last_seq = greatest(last_seq, new.seq),
          updated_at = now()
    where id = new.thread_id;
  end if;

  if new.role = 'user' then
    if auth.uid() is not null then
      new.sender_id := auth.uid();
    elsif new.sender_id is null then
      raise exception 'sender_id_required';
    end if;
  end if;

  return new;
end $$;
ALTER FUNCTION "public"."messages_assign_seq"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_restrict_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if current_user in ('service_role', 'postgres') then
    if new.content_json is distinct from old.content_json then
      new.edited_at := now();
    end if;
    return new;
  end if;

  if new.thread_id <> old.thread_id
    or new.seq <> old.seq
    or new.role <> old.role
    or new.sender_id is distinct from old.sender_id
    or new.reply_to_id is distinct from old.reply_to_id
    or new.engine_id is distinct from old.engine_id
    or new.model_id is distinct from old.model_id
    or new.run_id is distinct from old.run_id
    or new.created_at <> old.created_at
  then
    raise exception 'immutable_message_fields';
  end if;

  if new.content_json is distinct from old.content_json then
    new.edited_at := now();
  end if;

  return new;
end $$;
ALTER FUNCTION "public"."messages_restrict_update"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."messages_validate_reply"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_reply_thread_id uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;

  select m.thread_id into v_reply_thread_id
  from public.messages m
  where m.id = new.reply_to_id;

  if v_reply_thread_id is null then
    raise exception 'reply_to_not_found';
  end if;

  if v_reply_thread_id <> new.thread_id then
    raise exception 'reply_to_thread_mismatch';
  end if;

  return new;
end $$;
ALTER FUNCTION "public"."messages_validate_reply"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."next_thread_seq"("_thread_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_seq bigint;
begin
  update public.threads
    set last_seq = last_seq + 1,
        updated_at = now()
  where id = _thread_id
  returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'thread_not_found';
  end if;

  return v_seq;
end $$;
ALTER FUNCTION "public"."next_thread_seq"("_thread_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."personal_memory_items_dedupe"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_exists boolean;
begin
  if new.user_id is null or new.content is null then
    return new;
  end if;

  select true into v_exists
  from public.personal_memory_items p
  where p.user_id = new.user_id
    and p.scope = new.scope
    and (p.scope_id is not distinct from new.scope_id)
    and similarity(lower(p.content), lower(new.content)) >= 0.65
  limit 1;

  if coalesce(v_exists, false) then
    -- Skip insert (treat as no-op) to avoid accumulating duplicates.
    return null;
  end if;

  return new;
end $$;
ALTER FUNCTION "public"."personal_memory_items_dedupe"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."platform_inference_standard_cap_for_builder_tier"("p_tier" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 2000
    when lower(coalesce(p_tier, '')) = 'builder' then 300
    else 0
  end;
$$;
ALTER FUNCTION "public"."platform_inference_standard_cap_for_builder_tier"("p_tier" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."propose_community_memory_resource"("p_community_id" "uuid", "p_title" "text", "p_body_md" "text" DEFAULT NULL::"text", "p_url" "text" DEFAULT NULL::"text", "p_type" "text" DEFAULT 'post'::"text", "p_pinned" boolean DEFAULT false, "p_source_kind" "text" DEFAULT 'manual'::"text", "p_source_refs" "jsonb" DEFAULT '[]'::"jsonb", "p_resource_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("decision_id" "uuid", "resource_id" "uuid", "decision" "text", "state" "text", "safety_status" "text", "safety_reasons" "jsonb", "signal_score" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_can_moderate boolean := false;
  v_existing_submitted_by uuid := null;
  v_title text;
  v_body_md text;
  v_url text;
  v_type text;
  v_source_kind text;
  v_source_refs jsonb;
  v_combined text;
  v_fingerprint text;
  v_reasons jsonb := '[]'::jsonb;
  v_safety_status text := 'pass';
  v_state text := 'pending_review';
  v_decision text := 'review_queue';
  v_score smallint := 0;
  v_durability smallint := 0;
  v_reusability smallint := 0;
  v_relevance smallint := 0;
  v_novelty smallint := 0;
  v_body_len integer := 0;
  v_duplicate boolean := false;
  v_decision_id uuid := gen_random_uuid();
  v_target_resource_id uuid := null;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_community_id is null then
    raise exception 'community_id_required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_moderate := public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']);

  v_title := nullif(left(btrim(coalesce(p_title, '')), 200), '');
  v_body_md := nullif(btrim(coalesce(p_body_md, '')), '');
  v_url := nullif(left(btrim(coalesce(p_url, '')), 2000), '');
  v_type := lower(btrim(coalesce(p_type, 'post')));
  v_source_kind := lower(btrim(coalesce(p_source_kind, 'manual')));
  v_source_refs := coalesce(p_source_refs, '[]'::jsonb);

  if v_source_kind = '' then
    v_source_kind := 'manual';
  end if;

  if jsonb_typeof(v_source_refs) is distinct from 'array' then
    v_source_refs := '[]'::jsonb;
  end if;

  if v_title is null then
    raise exception 'title_required' using errcode = '22023';
  end if;

  if v_body_md is null and v_url is null then
    raise exception 'resource_content_required' using errcode = '22023';
  end if;

  if v_type not in ('post', 'embed', 'link', 'file') then
    v_type := 'post';
  end if;

  if p_resource_id is not null then
    select cr.submitted_by
      into v_existing_submitted_by
    from public.community_resources cr
    where cr.id = p_resource_id
      and cr.community_id = p_community_id;

    if not found then
      raise exception 'resource_not_found' using errcode = '22023';
    end if;

    if (not v_can_moderate) and v_existing_submitted_by is distinct from v_actor_id then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  v_combined := coalesce(v_title, '') || E'\n' || coalesce(v_body_md, '') || E'\n' || coalesce(v_url, '');

  -- Deterministic high-risk detectors.
  if v_combined ~* '-----BEGIN[[:space:]][A-Z ]*PRIVATE KEY-----' then
    v_reasons := v_reasons || jsonb_build_array('private_key');
  end if;
  if v_combined ~* 'sk-ant-[A-Za-z0-9_-]{10,}' then
    v_reasons := v_reasons || jsonb_build_array('anthropic_key');
  end if;
  if v_combined ~* 'sk-[A-Za-z0-9]{20,}' then
    v_reasons := v_reasons || jsonb_build_array('openai_like_key');
  end if;
  if v_combined ~* 'AKIA[0-9A-Z]{16}' then
    v_reasons := v_reasons || jsonb_build_array('aws_access_key');
  end if;
  if v_combined ~* '(api[_-]?key|access[_-]?token|auth[_-]?token)[[:space:]]*[:=][[:space:]]*[A-Za-z0-9._\/-]{16,}' then
    v_reasons := v_reasons || jsonb_build_array('credential_assignment');
  end if;
  if v_combined ~* 'bearer[[:space:]]+[A-Za-z0-9._=\-]{16,}' then
    v_reasons := v_reasons || jsonb_build_array('bearer_token');
  end if;
  if v_combined ~* 'password[[:space:]]*[:=][[:space:]]*[^[:space:]]{6,}' then
    v_reasons := v_reasons || jsonb_build_array('password_assignment');
  end if;
  if v_combined ~* '(postgres|mysql|mongodb(\+srv)?|redis)://[^[:space:]]+' then
    v_reasons := v_reasons || jsonb_build_array('connection_string');
  end if;

  -- Deduplicate reasons while preserving array shape.
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
    into v_reasons
  from jsonb_array_elements_text(v_reasons) t(x);

  if jsonb_array_length(v_reasons) > 0 then
    v_safety_status := 'blocked';
    v_state := 'rejected';
    v_decision := 'reject';
  else
    -- Signal scoring: durability + reusability + relevance + novelty (0..8).
    v_body_len := coalesce(char_length(v_body_md), 0);

    if v_combined ~* '(\?|\b(today|yesterday|tomorrow|tonight|this morning|this afternoon|currently|right now|soon|later)\b)' then
      v_durability := 0;
    elsif v_body_len >= 40 then
      v_durability := 2;
    else
      v_durability := 1;
    end if;

    if v_body_len >= 120 then
      v_reusability := 2;
    elsif v_body_len >= 50 then
      v_reusability := 1;
    else
      v_reusability := 0;
    end if;

    if char_length(v_title) >= 10 and (v_body_len >= 24 or v_url is not null) then
      v_relevance := 2;
    elsif v_body_len >= 24 or v_url is not null then
      v_relevance := 1;
    else
      v_relevance := 0;
    end if;

    v_fingerprint := encode(
      extensions.digest(
        lower(coalesce(v_title, '')) || E'\n' || lower(coalesce(v_body_md, '')) || E'\n' || lower(coalesce(v_url, '')),
        'sha256'
      ),
      'hex'
    );

    select exists (
      select 1
      from public.community_resources cr
      where cr.community_id = p_community_id
        and cr.dedupe_fingerprint = v_fingerprint
        and cr.state in ('published', 'pending_review')
        and (p_resource_id is null or cr.id <> p_resource_id)
    )
      into v_duplicate;

    if v_duplicate then
      v_novelty := 0;
      v_reasons := v_reasons || jsonb_build_array('duplicate_candidate');
    else
      v_novelty := 2;
    end if;

    v_score := (v_durability + v_reusability + v_relevance + v_novelty)::smallint;

    if v_can_moderate then
      if v_score >= 7 then
        v_safety_status := 'pass';
        v_state := 'published';
        v_decision := 'publish';
      elsif v_score >= 4 then
        v_safety_status := 'review';
        v_state := 'pending_review';
        v_decision := 'review_queue';
      else
        v_safety_status := 'pass';
        v_state := 'rejected';
        v_decision := 'reject';
        v_reasons := v_reasons || jsonb_build_array('low_signal');
      end if;
    else
      if v_score >= 4 then
        v_safety_status := 'review';
        v_state := 'pending_review';
        v_decision := 'review_queue';
      else
        v_safety_status := 'pass';
        v_state := 'rejected';
        v_decision := 'reject';
        v_reasons := v_reasons || jsonb_build_array('low_signal');
      end if;
    end if;

    select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
      into v_reasons
    from jsonb_array_elements_text(v_reasons) t(x);
  end if;

  if v_decision in ('publish', 'review_queue') then
    if p_resource_id is not null then
      update public.community_resources
         set type = v_type,
             title = v_title,
             body_md = v_body_md,
             url = v_url,
             pinned = coalesce(p_pinned, false),
             state = v_state,
             safety_status = v_safety_status,
             safety_reasons = v_reasons,
             signal_score = v_score,
             dedupe_fingerprint = v_fingerprint,
             submitted_by = coalesce(submitted_by, v_actor_id),
             source_kind = v_source_kind,
             source_refs = v_source_refs,
             moderated_by = case when v_state = 'published' and v_can_moderate then v_actor_id else null end,
             moderated_at = case when v_state = 'published' and v_can_moderate then now() else null end,
             published_at = case when v_state = 'published' then coalesce(published_at, now()) else null end,
             withdrawn_at = null
       where id = p_resource_id
         and community_id = p_community_id
       returning id into v_target_resource_id;

      if v_target_resource_id is null then
        raise exception 'resource_not_found' using errcode = '22023';
      end if;
    else
      insert into public.community_resources (
        community_id,
        type,
        title,
        body_md,
        url,
        file_key,
        pinned,
        state,
        safety_status,
        safety_reasons,
        signal_score,
        dedupe_fingerprint,
        submitted_by,
        source_kind,
        source_refs,
        moderated_by,
        moderated_at,
        published_at,
        withdrawn_at
      )
      values (
        p_community_id,
        v_type,
        v_title,
        v_body_md,
        v_url,
        null,
        coalesce(p_pinned, false),
        v_state,
        v_safety_status,
        v_reasons,
        v_score,
        v_fingerprint,
        v_actor_id,
        v_source_kind,
        v_source_refs,
        case when v_state = 'published' and v_can_moderate then v_actor_id else null end,
        case when v_state = 'published' and v_can_moderate then now() else null end,
        case when v_state = 'published' then now() else null end,
        null
      )
      returning id into v_target_resource_id;
    end if;
  end if;

  insert into public.community_resource_decisions (
    id,
    resource_id,
    community_id,
    decision,
    safety_status,
    reasons,
    signal_score,
    source_kind,
    source_refs,
    actor_user_id,
    actor_kind
  )
  values (
    v_decision_id,
    v_target_resource_id,
    p_community_id,
    v_decision,
    v_safety_status,
    v_reasons,
    v_score,
    v_source_kind,
    v_source_refs,
    v_actor_id,
    case when v_can_moderate then 'moderator' else 'author' end
  );

  return query
  select
    v_decision_id,
    v_target_resource_id,
    v_decision,
    v_state,
    v_safety_status,
    v_reasons,
    v_score;
end;
$$;
ALTER FUNCTION "public"."propose_community_memory_resource"("p_community_id" "uuid", "p_title" "text", "p_body_md" "text", "p_url" "text", "p_type" "text", "p_pinned" boolean, "p_source_kind" "text", "p_source_refs" "jsonb", "p_resource_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."read_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_reveal" boolean DEFAULT false) RETURNS TABLE("has_key" boolean, "updated_at" timestamp with time zone, "api_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_row public.user_provider_keys%rowtype;
  v_secret text := null;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if not found then
    return query select false, null::timestamptz, null::text;
    return;
  end if;

  if p_reveal then
    if v_row.vault_secret_id is not null then
      select ds.decrypted_secret
        into v_secret
        from vault.decrypted_secrets ds
       where ds.id = v_row.vault_secret_id
       limit 1;
    else
      v_secret := v_row.api_key;
    end if;
  end if;

  return query
  select
    true,
    v_row.updated_at,
    nullif(v_secret, '');
end $$;
ALTER FUNCTION "public"."read_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_reveal" boolean) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."redeem_pending_purchase_claims"() RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text", "ends_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_email text;
  v_claim public.purchase_claims%rowtype;
  v_intent public.payment_intents%rowtype;
  v_receipt public.payment_receipts%rowtype;
  v_plan public.plans%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_return_ends_at timestamptz;
  v_source text;
  v_source_ref text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  v_email := lower(btrim(coalesce(v_email, '')));

  for v_claim in
    select pc.*
    from (
      select distinct on (pc.payment_intent_id) pc.id
      from public.purchase_claims pc
      join public.payment_intents pi on pi.id = pc.payment_intent_id
      where pc.status = 'issued'
        and pc.expires_at > v_now
        and pi.status = 'succeeded'
        and (
          (pi.user_id is not null and pi.user_id = v_user_id)
          or (
            pi.user_id is null
            and pc.issued_to_email is not null
            and lower(btrim(pc.issued_to_email)) = v_email
          )
        )
      order by pc.payment_intent_id, pc.created_at desc
    ) pick
    join public.purchase_claims pc on pc.id = pick.id
    order by pc.created_at desc
    for update of pc skip locked
  loop
    select * into v_intent
    from public.payment_intents
    where id = v_claim.payment_intent_id
    for update;

    if not found then
      continue;
    end if;

    if v_intent.status <> 'succeeded' then
      continue;
    end if;

    -- If already bound, enforce same user.
    if v_intent.user_id is not null and v_intent.user_id <> v_user_id then
      continue;
    end if;

    select * into v_plan
    from public.plans
    where id = v_intent.plan_id;

    if not found then
      continue;
    end if;

    -- Latest receipt for this intent.
    select * into v_receipt
    from public.payment_receipts
    where payment_intent_id = v_intent.id
    order by created_at desc
    limit 1;

    v_source := coalesce(v_receipt.provider, v_intent.provider);
    v_source_ref := coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id, v_intent.provider_session_id);

    v_effective_ends_at := null;

    if v_plan.billing_period <> 'one_time' then
      if v_receipt.provider_subscription_id is not null then
        select * into v_sub
        from public.provider_subscriptions
        where provider = v_receipt.provider
          and provider_subscription_id = v_receipt.provider_subscription_id
        for update;
      else
        select * into v_sub
        from public.provider_subscriptions
        where payment_intent_id = v_intent.id
        order by updated_at desc
        limit 1
        for update;
      end if;

      -- If the subscription mapping isn't ready yet, skip this claim (user can retry later).
      if not found or v_sub.current_period_end is null then
        continue;
      end if;

      v_effective_ends_at := v_sub.current_period_end;
      v_source := v_sub.provider;
      v_source_ref := v_sub.provider_subscription_id;

      if v_sub.user_id is null then
        update public.provider_subscriptions
          set user_id = v_user_id,
              updated_at = v_now
        where id = v_sub.id;
      end if;
    end if;

    if v_intent.user_id is null then
      update public.payment_intents
        set user_id = v_user_id,
            updated_at = v_now
      where id = v_intent.id;
    end if;

    insert into public.community_memberships(community_id, user_id, role)
    values (v_intent.community_id, v_user_id, 'member')
    on conflict on constraint community_memberships_community_id_user_id_key do nothing;

    insert into public.entitlements(
      user_id,
      community_id,
      source,
      source_ref,
      starts_at,
      ends_at
    ) values (
      v_user_id,
      v_intent.community_id,
      v_source,
      v_source_ref,
      v_now,
      v_effective_ends_at
    )
    on conflict (user_id, community_id)
    do update set
      ends_at = case
        when entitlements.ends_at is null then null
        when excluded.ends_at is null then null
        else greatest(entitlements.ends_at, excluded.ends_at)
      end,
      starts_at = least(entitlements.starts_at, excluded.starts_at),
      source = case
        when entitlements.ends_at is null then entitlements.source
        else excluded.source
      end,
      source_ref = case
        when entitlements.ends_at is null then entitlements.source_ref
        else excluded.source_ref
      end
    returning ends_at into v_return_ends_at;

    -- Revoke any other issued tokens for the same intent.
    update public.purchase_claims
      set status = 'revoked'
    where payment_intent_id = v_claim.payment_intent_id
      and status = 'issued'
      and id <> v_claim.id;

    update public.purchase_claims
      set status = 'redeemed',
          redeemed_by_user_id = v_user_id,
          redeemed_at = v_now
    where id = v_claim.id;

    return query
    select c.id, c.slug, c.name, v_return_ends_at
    from public.communities c
    where c.id = v_intent.community_id;
  end loop;
end;
$$;
ALTER FUNCTION "public"."redeem_pending_purchase_claims"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."redeem_purchase_claim"("p_token" "text") RETURNS TABLE("community_id" "uuid", "community_slug" "text", "community_name" "text", "ends_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $_$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_hash bytea;
  v_claim public.purchase_claims%rowtype;
  v_intent public.payment_intents%rowtype;
  v_receipt public.payment_receipts%rowtype;
  v_plan public.plans%rowtype;
  v_sub public.provider_subscriptions%rowtype;
  v_now timestamptz := now();
  v_effective_ends_at timestamptz;
  v_return_ends_at timestamptz;
  v_source text;
  v_source_ref text;
  v_brandos_aid text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'token is required' using errcode = '22023';
  end if;

  v_hash := public.hash_purchase_claim_token(btrim(p_token));

  select * into v_claim
  from public.purchase_claims
  where token_hash = v_hash
  for update;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_claim.status <> 'issued' then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_claim.expires_at <= v_now then
    update public.purchase_claims
      set status = 'expired'
    where id = v_claim.id;
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  select * into v_intent
  from public.payment_intents
  where id = v_claim.payment_intent_id
  for update;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  if v_intent.status <> 'succeeded' then
    raise exception 'payment_not_confirmed' using errcode = '22023';
  end if;

  -- If already bound, enforce same user.
  if v_intent.user_id is not null and v_intent.user_id <> v_user_id then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  select * into v_plan
  from public.plans
  where id = v_intent.plan_id;

  if not found then
    raise exception 'invalid_or_expired' using errcode = '22023';
  end if;

  -- Latest receipt for this intent (may be missing in rare cases; subscription fallback covers this).
  select * into v_receipt
  from public.payment_receipts
  where payment_intent_id = v_intent.id
  order by created_at desc
  limit 1;

  v_source := coalesce(v_receipt.provider, v_intent.provider);
  v_source_ref := coalesce(v_receipt.provider_subscription_id, v_receipt.provider_session_id, v_intent.provider_session_id);

  v_effective_ends_at := null;

  if v_plan.billing_period <> 'one_time' then
    -- Subscription claims must have a provider subscription mapping to avoid minting unlimited access.
    if v_receipt.provider_subscription_id is not null then
      select * into v_sub
      from public.provider_subscriptions
      where provider = v_receipt.provider
        and provider_subscription_id = v_receipt.provider_subscription_id
      for update;
    else
      select * into v_sub
      from public.provider_subscriptions
      where payment_intent_id = v_intent.id
      order by updated_at desc
      limit 1
      for update;
    end if;

    if not found or v_sub.current_period_end is null then
      raise exception 'subscription_not_ready' using errcode = '22023';
    end if;

    v_effective_ends_at := v_sub.current_period_end;
    v_source := v_sub.provider;
    v_source_ref := v_sub.provider_subscription_id;

    if v_sub.user_id is null then
      update public.provider_subscriptions
        set user_id = v_user_id,
            updated_at = v_now
      where id = v_sub.id;
    end if;
  end if;

  if v_intent.user_id is null then
    update public.payment_intents
      set user_id = v_user_id,
          updated_at = v_now
    where id = v_intent.id;
  end if;

  -- Carry BrandOS token (if present) into membership-triggered automation.
  v_brandos_aid := nullif(coalesce(v_claim.tracking->>'brandos_aid', v_intent.tracking->>'brandos_aid'), '');
  if v_brandos_aid is not null and v_brandos_aid ~ '^[0-9a-fA-F-]{36}$' then
    perform set_config('arx.brandos_aid', v_brandos_aid, true);
  end if;

  -- Membership is always member; roles are manual-only.
  insert into public.community_memberships(community_id, user_id, role)
  values (v_intent.community_id, v_user_id, 'member')
  on conflict on constraint community_memberships_community_id_user_id_key do nothing;

  -- Canonical access: merge entitlements monotonically (never shorten).
  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    v_user_id,
    v_intent.community_id,
    v_source,
    v_source_ref,
    v_now,
    v_effective_ends_at
  )
  on conflict (user_id, community_id)
  do update set
    ends_at = case
      when entitlements.ends_at is null then null
      when excluded.ends_at is null then null
      else greatest(entitlements.ends_at, excluded.ends_at)
    end,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    source = case
      when entitlements.ends_at is null then entitlements.source
      else excluded.source
    end,
    source_ref = case
      when entitlements.ends_at is null then entitlements.source_ref
      else excluded.source_ref
    end
  returning ends_at into v_return_ends_at;

  -- Mark other issued tokens for the same intent as revoked (single-use at the intent level).
  update public.purchase_claims
    set status = 'revoked'
  where payment_intent_id = v_claim.payment_intent_id
    and status = 'issued'
    and id <> v_claim.id;

  update public.purchase_claims
    set status = 'redeemed',
        redeemed_by_user_id = v_user_id,
        redeemed_at = v_now
  where id = v_claim.id;

  return query
  select c.id, c.slug, c.name, v_return_ends_at
  from public.communities c
  where c.id = v_intent.community_id;
end;
$_$;
ALTER FUNCTION "public"."redeem_purchase_claim"("p_token" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."remove_member"("p_community_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_actor_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_owner_id uuid;
  v_now timestamptz := now();
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null or p_user_id is null then
    raise exception 'community_id and user_id are required' using errcode = '22023';
  end if;

  select c.owner_id into v_owner_id
  from public.communities c
  where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  if p_user_id = v_owner_id then
    raise exception 'cannot_remove_owner' using errcode = '22023';
  end if;

  v_is_owner := (v_owner_id = v_actor_id) or public.is_community_owner(p_community_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Admins cannot remove admins.
  if not v_is_owner then
    if (
      public.user_has_active_entitlement(p_user_id, p_community_id)
      and exists (
        select 1
        from public.community_memberships m
        where m.community_id = p_community_id
          and m.user_id = p_user_id
          and m.role = 'admin'
      )
    ) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- Revoke canonical access (non-destructive; allows rejoin if public/invited).
  update public.entitlements
    set ends_at = v_now,
        source = 'manual_revoke',
        source_ref = 'remove_member:' || v_actor_id::text
  where user_id = p_user_id
    and community_id = p_community_id;

  -- Remove from roster projection.
  delete from public.community_memberships
  where community_id = p_community_id
    and user_id = p_user_id;
end;
$$;
ALTER FUNCTION "public"."remove_member"("p_community_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."request_community_access_by_slug"("p_community_slug" "text", "p_message" "text" DEFAULT NULL::"text") RETURNS TABLE("community_id" "uuid", "status" "text", "denied_until" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_slug text;
  v_community public.communities%rowtype;
  v_now timestamptz := now();
  v_existing public.community_join_requests%rowtype;
  v_has_paid_plan boolean;
  v_message text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select * into v_community
  from public.communities c
  where c.slug = v_slug
  limit 1;

  if not found then
    raise exception 'Community not found' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.plans p
    where p.community_id = v_community.id
      and p.is_active = true
      and p.billing_period in ('monthly','yearly')
      and p.visibility in ('published','unlisted')
  ) into v_has_paid_plan;

  if v_has_paid_plan then
    raise exception 'paid_communities_do_not_use_request_access' using errcode = '22023';
  end if;

  if v_community.visibility = 'published' then
    -- Published communities remain request-access style for free entry.
    null;
  elsif v_community.visibility = 'unlisted' then
    if not coalesce(v_community.free_join_requires_approval, false) then
      raise exception 'request_access_not_required' using errcode = '22023';
    end if;
  else
    raise exception 'request_access_not_supported' using errcode = '22023';
  end if;

  if public.has_active_entitlement(v_community.id) then
    return query
    select v_community.id, 'approved'::text, null::timestamptz, v_now;
    return;
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

  select * into v_existing
  from public.community_join_requests r
  where r.community_id = v_community.id
    and r.user_id = v_user_id
  for update;

  if found then
    if v_existing.status = 'pending' then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    if v_existing.status = 'approved' then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    if v_existing.status = 'denied' and v_existing.denied_until is not null and v_existing.denied_until > v_now then
      return query
      select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
      return;
    end if;

    update public.community_join_requests
       set status = 'pending',
           message = v_message,
           decided_at = null,
           decided_by = null,
           denied_until = null,
           updated_at = v_now
     where id = v_existing.id
     returning * into v_existing;
  else
    insert into public.community_join_requests(
      community_id,
      user_id,
      status,
      message,
      created_at,
      updated_at
    ) values (
      v_community.id,
      v_user_id,
      'pending',
      v_message,
      v_now,
      v_now
    )
    returning * into v_existing;
  end if;

  return query
  select v_existing.community_id, v_existing.status, v_existing.denied_until, v_existing.updated_at;
end;
$$;
ALTER FUNCTION "public"."request_community_access_by_slug"("p_community_slug" "text", "p_message" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."save_community_settings"("p_community_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text" DEFAULT NULL::"text", "p_avatar_url" "text" DEFAULT NULL::"text", "p_banner_url" "text" DEFAULT NULL::"text", "p_visibility" "text" DEFAULT 'published'::"text", "p_monthly_amount_base_units" numeric DEFAULT NULL::numeric, "p_yearly_amount_base_units" numeric DEFAULT NULL::numeric, "p_currency" "text" DEFAULT 'usd'::"text", "p_currency_decimals" smallint DEFAULT 2) RETURNS TABLE("community_id" "uuid", "name" "text", "slug" "text", "description" "text", "avatar_url" "text", "banner_url" "text", "visibility" "text", "updated_at" timestamp with time zone, "monthly_plan_id" "uuid", "yearly_plan_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $_$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_visibility text;
  v_plan_visibility text;
  v_slug text;
  v_monthly_id uuid;
  v_yearly_id uuid;
  v_existing public.plans%rowtype;
  v_currency text;
  v_decimals smallint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'slug is required' using errcode = '22023';
  end if;
  if length(v_slug) < 3 or length(v_slug) > 32 or v_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  v_visibility := lower(btrim(coalesce(p_visibility, 'published')));
  if v_visibility not in ('published', 'unlisted') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  -- Plan visibility mirrors community visibility in the canonical model.
  v_plan_visibility := v_visibility;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_currency := lower(btrim(coalesce(p_currency, 'usd')));
  v_decimals := coalesce(p_currency_decimals, 2);

  update public.communities
     set name = btrim(p_name),
         slug = v_slug,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         banner_url = nullif(btrim(coalesce(p_banner_url, '')), ''),
         visibility = v_visibility,
         updated_at = v_now
   where id = p_community_id;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  if p_monthly_amount_base_units is null then
    update public.plans p
       set is_active = false,
           updated_at = v_now
     where p.community_id = p_community_id
       and p.billing_period = 'monthly'
       and p.is_active = true;
  else
    if p_monthly_amount_base_units <= 0 then
      raise exception 'monthly_amount_must_be_positive' using errcode = '22023';
    end if;

    select * into v_existing
      from public.plans p
     where p.community_id = p_community_id
       and p.billing_period = 'monthly'
       and p.is_active = true
     order by p.updated_at desc
     limit 1;

    if found then
      if v_existing.amount_base_units = p_monthly_amount_base_units
        and v_existing.currency = v_currency
        and v_existing.currency_decimals = v_decimals
      then
        update public.plans
           set visibility = v_plan_visibility,
               updated_at = v_now
         where id = v_existing.id
         returning id into v_monthly_id;
      else
        update public.plans
           set is_active = false,
               updated_at = v_now
         where id = v_existing.id;

        insert into public.plans(
          community_id,
          name,
          description,
          amount_base_units,
          currency,
          currency_decimals,
          billing_period,
          visibility,
          is_active,
          stripe_price_id,
          created_by,
          updated_at
        ) values (
          p_community_id,
          'Membership',
          null,
          p_monthly_amount_base_units,
          v_currency,
          v_decimals,
          'monthly',
          v_plan_visibility,
          true,
          null,
          v_user_id,
          v_now
        )
        returning id into v_monthly_id;
      end if;
    else
      insert into public.plans(
        community_id,
        name,
        description,
        amount_base_units,
        currency,
        currency_decimals,
        billing_period,
        visibility,
        is_active,
        stripe_price_id,
        created_by,
        updated_at
      ) values (
        p_community_id,
        'Membership',
        null,
        p_monthly_amount_base_units,
        v_currency,
        v_decimals,
        'monthly',
        v_plan_visibility,
        true,
        null,
        v_user_id,
        v_now
      )
      returning id into v_monthly_id;
    end if;
  end if;

  if p_yearly_amount_base_units is null then
    update public.plans p
       set is_active = false,
           updated_at = v_now
     where p.community_id = p_community_id
       and p.billing_period = 'yearly'
       and p.is_active = true;
  else
    if p_yearly_amount_base_units <= 0 then
      raise exception 'yearly_amount_must_be_positive' using errcode = '22023';
    end if;

    select * into v_existing
      from public.plans p
     where p.community_id = p_community_id
       and p.billing_period = 'yearly'
       and p.is_active = true
     order by p.updated_at desc
     limit 1;

    if found then
      if v_existing.amount_base_units = p_yearly_amount_base_units
        and v_existing.currency = v_currency
        and v_existing.currency_decimals = v_decimals
      then
        update public.plans
           set visibility = v_plan_visibility,
               updated_at = v_now
         where id = v_existing.id
         returning id into v_yearly_id;
      else
        update public.plans
           set is_active = false,
               updated_at = v_now
         where id = v_existing.id;

        insert into public.plans(
          community_id,
          name,
          description,
          amount_base_units,
          currency,
          currency_decimals,
          billing_period,
          visibility,
          is_active,
          stripe_price_id,
          created_by,
          updated_at
        ) values (
          p_community_id,
          'Membership',
          null,
          p_yearly_amount_base_units,
          v_currency,
          v_decimals,
          'yearly',
          v_plan_visibility,
          true,
          null,
          v_user_id,
          v_now
        )
        returning id into v_yearly_id;
      end if;
    else
      insert into public.plans(
        community_id,
        name,
        description,
        amount_base_units,
        currency,
        currency_decimals,
        billing_period,
        visibility,
        is_active,
        stripe_price_id,
        created_by,
        updated_at
      ) values (
        p_community_id,
        'Membership',
        null,
        p_yearly_amount_base_units,
        v_currency,
        v_decimals,
        'yearly',
        v_plan_visibility,
        true,
        null,
        v_user_id,
        v_now
      )
      returning id into v_yearly_id;
    end if;
  end if;

  return query
  select
    c.id,
    c.name,
    c.slug,
    c.description,
    c.avatar_url,
    c.banner_url,
    c.visibility,
    c.updated_at,
    v_monthly_id,
    v_yearly_id
  from public.communities c
  where c.id = p_community_id;
end;
$_$;
ALTER FUNCTION "public"."save_community_settings"("p_community_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text", "p_visibility" "text", "p_monthly_amount_base_units" numeric, "p_yearly_amount_base_units" numeric, "p_currency" "text", "p_currency_decimals" smallint) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."search_community_chat_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 8) RETURNS TABLE("thread_id" "uuid", "message_id" "uuid", "sender_id" "uuid", "sender_display" "text", "created_at" timestamp with time zone, "snippet" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      greatest(0, least(coalesce(p_limit, 8), 20)) as lim
  ),
  qry as (
    select
      case
        when q is not null and char_length(q) >= 3 then plainto_tsquery('english', q)
        else null
      end as tsq,
      lim
    from params
  ),
  authz as (
    select
      ((auth.uid() is null) or auth.uid() = p_user_id) as caller_ok,
      (
        exists (
          select 1
          from public.community_memberships cm
          where cm.community_id = p_community_id
            and cm.user_id = p_user_id
        )
        or coalesce(public.user_has_active_entitlement(p_user_id, p_community_id), false)
      ) as entitled
  ),
  base as (
    select
      m.thread_id,
      m.id as message_id,
      m.sender_id,
      coalesce(nullif(trim(pr.display_name), ''), 'member') as sender_display,
      m.created_at,
      left(coalesce(m.content_json->>'text', m.content_json->>'content', ''), 320) as snippet,
      to_tsvector('english', coalesce(m.content_json->>'text', m.content_json->>'content', '')) as document
    from public.messages m
    join public.threads t on t.id = m.thread_id
    left join public.profiles pr on pr.user_id = m.sender_id
    where t.community_id = p_community_id
      and t.engine_id = 'community_chat'
      and m.role in ('user', 'assistant')
      and coalesce(m.content_json->>'text', m.content_json->>'content', '') <> ''
  )
  select
    b.thread_id,
    b.message_id,
    b.sender_id,
    b.sender_display,
    b.created_at,
    b.snippet
  from base b
  cross join authz a
  cross join qry q
  where a.caller_ok
    and a.entitled
    and (q.tsq is null or b.document @@ q.tsq)
  order by
    case
      when q.tsq is null then 0
      else ts_rank_cd(b.document, q.tsq)
    end desc,
    b.created_at desc
  limit (select lim from qry);
$$;
ALTER FUNCTION "public"."search_community_chat_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."search_community_resource_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 6) RETURNS TABLE("resource_id" "uuid", "resource_type" "text", "title" "text", "created_at" timestamp with time zone, "pinned" boolean, "snippet" "text", "url" "text", "file_key" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      greatest(0, least(coalesce(p_limit, 6), 20)) as lim
  ),
  qry as (
    select
      case
        when q is not null and char_length(q) >= 3 then plainto_tsquery('english', q)
        else null
      end as tsq,
      lim
    from params
  ),
  authz as (
    select
      ((auth.uid() is null) or auth.uid() = p_user_id) as caller_ok,
      (
        exists (
          select 1
          from public.community_memberships cm
          where cm.community_id = p_community_id
            and cm.user_id = p_user_id
        )
        or coalesce(public.user_has_active_entitlement(p_user_id, p_community_id), false)
      ) as entitled
  ),
  base as (
    select
      cr.id as resource_id,
      cr.type as resource_type,
      cr.title,
      cr.created_at,
      cr.pinned,
      left(
        coalesce(nullif(cr.body_md, ''), nullif(cr.url, ''), cr.title, ''),
        320
      ) as snippet,
      cr.url,
      cr.file_key,
      to_tsvector('english', coalesce(cr.title, '') || ' ' || coalesce(cr.body_md, '') || ' ' || coalesce(cr.url, '')) as document
    from public.community_resources cr
    where cr.community_id = p_community_id
      and cr.state = 'published'
      and cr.safety_status = 'pass'
  )
  select
    b.resource_id,
    b.resource_type,
    b.title,
    b.created_at,
    b.pinned,
    b.snippet,
    b.url,
    b.file_key
  from base b
  cross join authz a
  cross join qry q
  where a.caller_ok
    and a.entitled
    and (q.tsq is null or b.document @@ q.tsq)
  order by
    case
      when q.tsq is null then case when b.pinned then 1 else 0 end
      else ts_rank_cd(b.document, q.tsq)
    end desc,
    b.created_at desc
  limit (select lim from qry);
$$;
ALTER FUNCTION "public"."search_community_resource_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."search_user_message_snippets"("p_user_id" "uuid", "p_query" "text", "p_exclude_thread_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 8) RETURNS TABLE("thread_id" "uuid", "message_id" "uuid", "created_at" timestamp with time zone, "snippet" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select
    m.thread_id,
    m.id as message_id,
    m.created_at,
    left(
      coalesce(m.content_json->>'text', m.content_json->>'content', ''),
      280
    ) as snippet
  from public.messages m
  join public.threads t on t.id = m.thread_id
  where t.owner_id = p_user_id
    and t.engine_id <> 'community_chat'
    and m.role = 'user'
    and (p_exclude_thread_id is null or m.thread_id <> p_exclude_thread_id)
    and to_tsvector('english', coalesce(m.content_json->>'text', m.content_json->>'content', '')) @@ plainto_tsquery('english', p_query)
  order by m.created_at desc
  limit greatest(0, least(p_limit, 20));
$$;
ALTER FUNCTION "public"."search_user_message_snippets"("p_user_id" "uuid", "p_query" "text", "p_exclude_thread_id" "uuid", "p_limit" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_active_community_agent_draft"("p_community_id" "uuid", "p_slot" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_slot integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  v_slot := coalesce(p_slot, 0);
  if v_slot < 1 or v_slot > 3 then
    raise exception 'slot must be between 1 and 3' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.community_agent_drafts d
    where d.community_id = p_community_id
      and d.slot = v_slot
  ) then
    raise exception 'draft_not_found' using errcode = '22023';
  end if;

  update public.community_agent_drafts
     set is_active = (slot = v_slot),
         updated_at = now()
   where community_id = p_community_id;
end;
$$;
ALTER FUNCTION "public"."set_active_community_agent_draft"("p_community_id" "uuid", "p_slot" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_community_free_join_requires_approval"("p_community_id" "uuid", "p_requires_approval" boolean) RETURNS TABLE("community_id" "uuid", "free_join_requires_approval" boolean, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_requires boolean := coalesce(p_requires_approval, false);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  update public.communities
     set free_join_requires_approval = v_requires,
         updated_at = v_now
   where id = p_community_id;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  return query
  select c.id, c.free_join_requires_approval, c.updated_at
  from public.communities c
  where c.id = p_community_id;
end;
$$;
ALTER FUNCTION "public"."set_community_free_join_requires_approval"("p_community_id" "uuid", "p_requires_approval" boolean) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_community_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS TABLE("community_id" "uuid", "user_id" "uuid", "role" "text", "ends_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
#variable_conflict use_column
declare
  v_actor_id uuid;
  v_owner_id uuid;
  v_is_owner boolean;
  v_is_admin boolean;
  v_target_is_admin boolean;
  v_role text;
  v_now timestamptz := now();
  v_ent public.entitlements%rowtype;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null or p_user_id is null then
    raise exception 'community_id and user_id are required' using errcode = '22023';
  end if;

  select c.owner_id into v_owner_id
  from public.communities c
  where c.id = p_community_id;

  if v_owner_id is null then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  v_is_owner := (v_owner_id = v_actor_id);
  v_is_admin := public.has_active_entitlement_role(p_community_id, array['admin']);

  if not (v_is_owner or v_is_admin) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  -- Never mutate the community owner (ownership transfers are out of MVP scope).
  if p_user_id = v_owner_id then
    raise exception 'cannot_change_owner' using errcode = '22023';
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));
  if v_role not in ('member', 'mod', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Admin restrictions: cannot grant admin or modify existing admins.
  v_target_is_admin := (
    public.user_has_active_entitlement(p_user_id, p_community_id)
    and exists (
      select 1
      from public.community_memberships m
      where m.community_id = p_community_id
        and m.user_id = p_user_id
        and m.role = 'admin'
    )
  );

  if (not v_is_owner) then
    if v_role = 'admin' then
      raise exception 'forbidden' using errcode = '28000';
    end if;
    if v_target_is_admin then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- Canonical role (membership).
  insert into public.community_memberships(community_id, user_id, role)
  values (p_community_id, p_user_id, v_role)
  on conflict on constraint community_memberships_community_id_user_id_key do update
    set role = excluded.role;

  -- Canonical entitlement (time-bounded access).
  insert into public.entitlements(
    user_id,
    community_id,
    source,
    source_ref,
    starts_at,
    ends_at
  ) values (
    p_user_id,
    p_community_id,
    'manual_grant',
    'set_member_role:' || v_actor_id::text,
    v_now,
    null
  )
  on conflict (user_id, community_id)
  do update set
    source = excluded.source,
    source_ref = excluded.source_ref,
    starts_at = least(entitlements.starts_at, excluded.starts_at),
    ends_at = null
  returning * into v_ent;

  return query
  select
    p_community_id,
    p_user_id,
    v_role,
    v_ent.ends_at;
end;
$$;
ALTER FUNCTION "public"."set_member_role"("p_community_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_thread_community_lens"("p_thread_id" "uuid", "p_community_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("thread_id" "uuid", "community_id" "uuid", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_thread public.threads%rowtype;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;
  if v_thread.engine_id = 'community_chat' then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if v_thread.owner_id <> v_user_id then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if p_community_id is not null and not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if v_thread.community_id is not distinct from p_community_id then
    return query select v_thread.id, v_thread.community_id, v_thread.updated_at;
    return;
  end if;

  update public.threads
     set community_id = p_community_id,
         context_version = context_version + 1,
         updated_at = v_now
   where id = p_thread_id;

  return query select p_thread_id, p_community_id, v_now;
end;
$$;
ALTER FUNCTION "public"."set_thread_community_lens"("p_thread_id" "uuid", "p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_thread_context"("p_thread_id" "uuid", "p_expected_context_version" bigint, "p_thread_lane" "text" DEFAULT NULL::"text", "p_project_id" "text" DEFAULT NULL::"text", "p_community_id" "uuid" DEFAULT NULL::"uuid", "p_update_thread_lane" boolean DEFAULT false, "p_update_project_id" boolean DEFAULT false, "p_update_community_id" boolean DEFAULT false) RETURNS TABLE("thread_id" "uuid", "thread_lane" "text", "project_id" "text", "community_id" "uuid", "context_version" bigint, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid;
  v_thread public.threads%rowtype;
  v_next_thread_lane text;
  v_next_project_id text;
  v_next_community_id uuid;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;
  if p_expected_context_version is null then
    raise exception 'expected_context_version is required' using errcode = '22023';
  end if;

  select *
    into v_thread
    from public.threads t
   where t.id = p_thread_id
   limit 1;

  if not found then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;
  if v_thread.owner_id <> v_user_id then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  if v_thread.engine_id = 'community_chat' then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_next_thread_lane := v_thread.thread_lane;
  if p_update_thread_lane then
    if p_thread_lane is null or btrim(p_thread_lane) = '' then
      raise exception 'thread_lane is required when update_thread_lane is true' using errcode = '22023';
    end if;
    v_next_thread_lane := lower(btrim(p_thread_lane));
    if v_next_thread_lane not in ('chat', 'agent') then
      raise exception 'thread_lane must be chat or agent' using errcode = '22023';
    end if;
  end if;

  v_next_project_id := v_thread.project_id;
  if p_update_project_id then
    v_next_project_id := nullif(btrim(coalesce(p_project_id, '')), '');
  end if;

  v_next_community_id := v_thread.community_id;
  if p_update_community_id then
    v_next_community_id := p_community_id;
    if v_next_community_id is not null and not public.has_active_entitlement(v_next_community_id) then
      raise exception 'forbidden' using errcode = '28000';
    end if;
  end if;

  -- No-op patch returns current state without version bump.
  if v_next_thread_lane is not distinct from v_thread.thread_lane
     and v_next_project_id is not distinct from v_thread.project_id
     and v_next_community_id is not distinct from v_thread.community_id then
    return query
      select
        v_thread.id,
        v_thread.thread_lane,
        v_thread.project_id,
        v_thread.community_id,
        v_thread.context_version,
        v_thread.updated_at;
    return;
  end if;

  return query
  with updated as (
    update public.threads t
       set thread_lane = v_next_thread_lane,
           project_id = v_next_project_id,
           community_id = v_next_community_id,
           context_version = t.context_version + 1,
           updated_at = v_now
     where t.id = p_thread_id
       and t.context_version = p_expected_context_version
    returning t.id, t.thread_lane, t.project_id, t.community_id, t.context_version, t.updated_at
  )
  select
    updated.id,
    updated.thread_lane,
    updated.project_id,
    updated.community_id,
    updated.context_version,
    updated.updated_at
  from updated;

  if not found then
    raise exception 'thread_context_version_conflict' using errcode = '40001';
  end if;
end;
$$;
ALTER FUNCTION "public"."set_thread_context"("p_thread_id" "uuid", "p_expected_context_version" bigint, "p_thread_lane" "text", "p_project_id" "text", "p_community_id" "uuid", "p_update_thread_lane" boolean, "p_update_project_id" boolean, "p_update_community_id" boolean) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."threads_restrict_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if current_user in ('service_role', 'postgres') then
    return new;
  end if;

  if new.owner_id <> old.owner_id
    or new.engine_id <> old.engine_id
    or new.community_id is distinct from old.community_id
    or new.created_at <> old.created_at
  then
    raise exception 'immutable_thread_fields';
  end if;

  new.last_seq := old.last_seq;
  new.updated_at := now();
  return new;
end $$;
ALTER FUNCTION "public"."threads_restrict_update"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."upsert_community_agent_draft"("p_community_id" "uuid", "p_slot" integer, "p_name" "text", "p_landing_json" "jsonb", "p_system_prompt" "text") RETURNS TABLE("id" "uuid", "slot" integer, "is_active" boolean, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_slot integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(p_community_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  if not public.community_owner_is_pro(p_community_id) then
    raise exception 'pro_plan_required' using errcode = '42501';
  end if;

  v_slot := coalesce(p_slot, 0);
  if v_slot < 1 or v_slot > 3 then
    raise exception 'slot must be between 1 and 3' using errcode = '22023';
  end if;

  insert into public.community_agent_drafts(
    community_id,
    slot,
    name,
    landing_json,
    system_prompt,
    updated_at
  ) values (
    p_community_id,
    v_slot,
    nullif(btrim(coalesce(p_name, '')), ''),
    coalesce(p_landing_json, '{}'::jsonb),
    coalesce(p_system_prompt, ''),
    now()
  )
  on conflict on constraint community_agent_drafts_community_id_slot_key
  do update set
    name = excluded.name,
    landing_json = excluded.landing_json,
    system_prompt = excluded.system_prompt,
    updated_at = now()
  returning community_agent_drafts.id,
            community_agent_drafts.slot,
            community_agent_drafts.is_active,
            community_agent_drafts.updated_at
  into id, slot, is_active, updated_at;

  return next;
end;
$$;
ALTER FUNCTION "public"."upsert_community_agent_draft"("p_community_id" "uuid", "p_slot" integer, "p_name" "text", "p_landing_json" "jsonb", "p_system_prompt" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."upsert_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_api_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_key text := btrim(coalesce(p_api_key, ''));
  v_row public.user_provider_keys%rowtype;
  v_secret_name text;
  v_secret_id uuid;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  if v_key = '' then
    raise exception 'key_required' using errcode = '22023';
  end if;

  v_secret_name := format('user_provider_keys:%s:%s', v_user_id::text, v_provider);

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if found and v_row.vault_secret_id is not null then
    perform vault.update_secret(v_row.vault_secret_id, v_key, v_secret_name, 'User provider key', null);
    update public.user_provider_keys
      set vault_secret_id = v_row.vault_secret_id,
          api_key = null,
          updated_at = now()
    where id = v_row.id;
    return;
  end if;

  v_secret_id := vault.create_secret(v_key, v_secret_name, 'User provider key', null);

  insert into public.user_provider_keys(user_id, provider, api_key, vault_secret_id)
  values (v_user_id, v_provider, null, v_secret_id)
  on conflict (user_id, provider) do update
    set api_key = null,
        vault_secret_id = excluded.vault_secret_id,
        updated_at = now();
end $$;
ALTER FUNCTION "public"."upsert_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_api_key" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."user_has_active_entitlement"("p_user_id" "uuid", "p_community_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = p_user_id
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;
ALTER FUNCTION "public"."user_has_active_entitlement"("p_user_id" "uuid", "p_community_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."withdraw_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("decision_id" "uuid", "resource_id" "uuid", "decision" "text", "state" "text", "safety_status" "text", "safety_reasons" "jsonb", "signal_score" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_can_moderate boolean := false;
  v_resource public.community_resources%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 240), '');
  v_reasons jsonb;
  v_decision_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_community_id is null or p_resource_id is null then
    raise exception 'resource_required' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_moderate := public.has_active_entitlement_role(p_community_id, array['owner','admin','mod']);

  select *
    into v_resource
  from public.community_resources
  where id = p_resource_id
    and community_id = p_community_id;

  if not found then
    raise exception 'resource_not_found' using errcode = '22023';
  end if;

  if (not v_can_moderate) and v_resource.submitted_by is distinct from v_actor_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_reasons := coalesce(v_resource.safety_reasons, '[]'::jsonb);
  if v_reason is not null then
    v_reasons := v_reasons || jsonb_build_array(v_reason);
    select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
      into v_reasons
    from jsonb_array_elements_text(v_reasons) t(x);
  end if;

  update public.community_resources
     set state = 'withdrawn',
         safety_reasons = v_reasons,
         withdrawn_at = now(),
         moderated_by = case when v_can_moderate then v_actor_id else moderated_by end,
         moderated_at = case when v_can_moderate then now() else moderated_at end
   where id = p_resource_id
     and community_id = p_community_id;

  insert into public.community_resource_decisions (
    id,
    resource_id,
    community_id,
    decision,
    safety_status,
    reasons,
    signal_score,
    source_kind,
    source_refs,
    actor_user_id,
    actor_kind
  )
  values (
    v_decision_id,
    v_resource.id,
    v_resource.community_id,
    'withdraw',
    v_resource.safety_status,
    v_reasons,
    v_resource.signal_score,
    coalesce(v_resource.source_kind, 'manual'),
    coalesce(v_resource.source_refs, '[]'::jsonb),
    v_actor_id,
    case when v_can_moderate then 'moderator' else 'author' end
  );

  return query
  select
    v_decision_id,
    v_resource.id,
    'withdraw'::text,
    'withdrawn'::text,
    v_resource.safety_status,
    v_reasons,
    v_resource.signal_score;
end;
$$;
ALTER FUNCTION "public"."withdraw_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_reason" "text") OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."builder_accounts" (
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_connected_account_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."builder_accounts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."builder_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_subscription_id" "text" NOT NULL,
    "provider_customer_id" "text",
    "user_id" "uuid",
    "builder_tier" "text" NOT NULL,
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean,
    "raw_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "builder_subscriptions_builder_tier_check" CHECK (("builder_tier" = ANY (ARRAY['builder'::"text", 'pro'::"text"])))
);
ALTER TABLE "public"."builder_subscriptions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_agent_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "slot" integer NOT NULL,
    "name" "text",
    "landing_json" "jsonb" NOT NULL,
    "system_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_agent_drafts_slot_check" CHECK ((("slot" >= 1) AND ("slot" <= 3)))
);
ALTER TABLE "public"."community_agent_drafts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_invite_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."community_invite_uses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "max_uses" integer,
    "expires_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."community_invites" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "denied_until" timestamp with time zone,
    CONSTRAINT "community_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);
ALTER TABLE "public"."community_join_requests" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_member_settings" (
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "muted" boolean DEFAULT false NOT NULL,
    "muted_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."community_member_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_memberships_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'mod'::"text", 'admin'::"text", 'owner'::"text"])))
);
ALTER TABLE "public"."community_memberships" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_resource_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid",
    "community_id" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "safety_status" "text" NOT NULL,
    "reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "signal_score" smallint,
    "source_kind" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "actor_user_id" "uuid",
    "actor_kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_resource_decisions_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['system'::"text", 'moderator'::"text", 'author'::"text"]))),
    CONSTRAINT "community_resource_decisions_decision_check" CHECK (("decision" = ANY (ARRAY['publish'::"text", 'review_queue'::"text", 'reject'::"text", 'local_only'::"text", 'withdraw'::"text"]))),
    CONSTRAINT "community_resource_decisions_safety_status_check" CHECK (("safety_status" = ANY (ARRAY['pass'::"text", 'review'::"text", 'blocked'::"text"])))
);
ALTER TABLE "public"."community_resource_decisions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."community_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body_md" "text",
    "url" "text",
    "file_key" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "state" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "safety_status" "text" DEFAULT 'review'::"text" NOT NULL,
    "safety_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "signal_score" smallint,
    "dedupe_fingerprint" "text",
    "submitted_by" "uuid",
    "moderated_by" "uuid",
    "moderated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "withdrawn_at" timestamp with time zone,
    "source_kind" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "community_resources_safety_status_check" CHECK (("safety_status" = ANY (ARRAY['pass'::"text", 'review'::"text", 'blocked'::"text"]))),
    CONSTRAINT "community_resources_state_check" CHECK (("state" = ANY (ARRAY['pending_review'::"text", 'published'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);
ALTER TABLE "public"."community_resources" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."edge_rate_limits" (
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "window_seconds" integer NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edge_rate_limits_count_check" CHECK (("count" >= 0)),
    CONSTRAINT "edge_rate_limits_window_seconds_check" CHECK (("window_seconds" > 0))
);
ALTER TABLE "public"."edge_rate_limits" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "source_ref" "text",
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone
);
ALTER TABLE "public"."entitlements" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."message_reactions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "role" "text" NOT NULL,
    "content_json" "jsonb" NOT NULL,
    "engine_id" "text",
    "model_id" "text",
    "run_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"(),
    "reply_to_id" "uuid",
    "edited_at" timestamp with time zone,
    CONSTRAINT "messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_seq_positive" CHECK (("seq" > 0)),
    CONSTRAINT "messages_user_sender_required" CHECK ((("role" <> 'user'::"text") OR ("sender_id" IS NOT NULL)))
);
ALTER TABLE "public"."messages" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."model_registry" (
    "id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_model" "text",
    "display_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "platform_enabled" boolean DEFAULT true NOT NULL,
    "byok_enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "model_registry_provider_check" CHECK (("provider" = ANY (ARRAY['openai'::"text", 'anthropic'::"text", 'google'::"text", 'x-ai'::"text"])))
);
ALTER TABLE "public"."model_registry" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payment_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "amount_base_units" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "currency_decimals" smallint NOT NULL,
    "provider_session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "tracking" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "payment_intents_amount_base_units_check" CHECK (("amount_base_units" > (0)::numeric)),
    CONSTRAINT "payment_intents_currency_check" CHECK ((("length"("currency") >= 3) AND ("length"("currency") <= 16))),
    CONSTRAINT "payment_intents_currency_decimals_check" CHECK ((("currency_decimals" >= 0) AND ("currency_decimals" <= 36))),
    CONSTRAINT "payment_intents_platform_fee_bps_check" CHECK ((("platform_fee_bps" >= 0) AND ("platform_fee_bps" <= 10000))),
    CONSTRAINT "payment_intents_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'pending'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."payment_intents" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payment_ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "payment_intent_id" "uuid",
    "provider" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "provider_ref" "text" NOT NULL,
    "provider_subscription_id" "text",
    "provider_customer_id" "text",
    "amount_base_units" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "currency_decimals" smallint NOT NULL,
    "platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "platform_fee_amount_base_units" numeric,
    "occurred_at" timestamp with time zone NOT NULL,
    "raw_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_ledger_entries_amount_base_units_check" CHECK (("amount_base_units" <> (0)::numeric)),
    CONSTRAINT "payment_ledger_entries_currency_check" CHECK ((("length"("currency") >= 3) AND ("length"("currency") <= 16))),
    CONSTRAINT "payment_ledger_entries_currency_decimals_check" CHECK ((("currency_decimals" >= 0) AND ("currency_decimals" <= 36))),
    CONSTRAINT "payment_ledger_entries_kind_check" CHECK (("kind" = ANY (ARRAY['checkout_session'::"text", 'invoice_payment'::"text", 'refund'::"text", 'dispute'::"text"]))),
    CONSTRAINT "payment_ledger_entries_platform_fee_bps_check" CHECK ((("platform_fee_bps" >= 0) AND ("platform_fee_bps" <= 10000)))
);
ALTER TABLE "public"."payment_ledger_entries" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payment_provider_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "event_type" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "raw_json" "jsonb" NOT NULL
);
ALTER TABLE "public"."payment_provider_events" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."payment_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_intent_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_session_id" "text" NOT NULL,
    "provider_payment_intent_id" "text",
    "provider_subscription_id" "text",
    "provider_customer_id" "text",
    "checkout_email" "text",
    "amount_base_units" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "currency_decimals" smallint NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "raw_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "platform_fee_amount_base_units" numeric,
    CONSTRAINT "payment_receipts_amount_base_units_check" CHECK (("amount_base_units" > (0)::numeric)),
    CONSTRAINT "payment_receipts_currency_check" CHECK ((("length"("currency") >= 3) AND ("length"("currency") <= 16))),
    CONSTRAINT "payment_receipts_currency_decimals_check" CHECK ((("currency_decimals" >= 0) AND ("currency_decimals" <= 36))),
    CONSTRAINT "payment_receipts_platform_fee_bps_check" CHECK ((("platform_fee_bps" >= 0) AND ("platform_fee_bps" <= 10000))),
    CONSTRAINT "payment_receipts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."payment_receipts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."personal_memory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "scope_id" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_memory_items_scope_check" CHECK (("scope" = ANY (ARRAY['global'::"text", 'workspace'::"text"])))
);
ALTER TABLE "public"."personal_memory_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "amount_base_units" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "currency_decimals" smallint NOT NULL,
    "billing_period" "text" NOT NULL,
    "visibility" "text" DEFAULT 'published'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "stripe_price_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_amount_base_units_check" CHECK (("amount_base_units" > (0)::numeric)),
    CONSTRAINT "plans_billing_period_check" CHECK (("billing_period" = ANY (ARRAY['one_time'::"text", 'monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "plans_currency_check" CHECK ((("length"("currency") >= 3) AND ("length"("currency") <= 16))),
    CONSTRAINT "plans_currency_decimals_check" CHECK ((("currency_decimals" >= 0) AND ("currency_decimals" <= 36))),
    CONSTRAINT "plans_visibility_check" CHECK (("visibility" = ANY (ARRAY['published'::"text", 'unlisted'::"text"])))
);
ALTER TABLE "public"."plans" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "builder_tier" "text" DEFAULT 'free'::"text" NOT NULL,
    CONSTRAINT "profiles_builder_tier_check" CHECK (("builder_tier" = ANY (ARRAY['free'::"text", 'builder'::"text", 'pro'::"text"])))
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."provider_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_subscription_id" "text" NOT NULL,
    "provider_customer_id" "text",
    "payment_intent_id" "uuid",
    "community_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean,
    "raw_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "delinquent_at" timestamp with time zone,
    "grace_ends_at" timestamp with time zone,
    CONSTRAINT "provider_subscriptions_platform_fee_bps_check" CHECK ((("platform_fee_bps" >= 0) AND ("platform_fee_bps" <= 10000)))
);
ALTER TABLE "public"."provider_subscriptions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."purchase_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_intent_id" "uuid" NOT NULL,
    "token_hash" "bytea" NOT NULL,
    "token_prefix" "text" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "issued_to_email" "text",
    "redeemed_by_user_id" "uuid",
    "redeemed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tracking" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "purchase_claims_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'redeemed'::"text", 'expired'::"text", 'revoked'::"text"])))
);
ALTER TABLE "public"."purchase_claims" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text",
    "engine_id" "text" DEFAULT 'arx_harness'::"text" NOT NULL,
    "model_id" "text",
    "community_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seq" bigint DEFAULT 0 NOT NULL,
    "thread_lane" "text" DEFAULT 'chat'::"text" NOT NULL,
    "project_id" "text",
    "context_version" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "threads_community_chat_id_matches" CHECK ((("engine_id" <> 'community_chat'::"text") OR (("community_id" IS NOT NULL) AND ("id" = "community_id")))),
    CONSTRAINT "threads_thread_lane_valid" CHECK (("thread_lane" = ANY (ARRAY['chat'::"text", 'agent'::"text"])))
);
ALTER TABLE "public"."threads" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_ai_history_usage" (
    "user_id" "uuid" NOT NULL,
    "bytes_used" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."user_ai_history_usage" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_memory_settings" (
    "user_id" "uuid" NOT NULL,
    "memory_mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "remember_intent_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_memory_settings_memory_mode_check" CHECK (("memory_mode" = ANY (ARRAY['off'::"text", 'suggest'::"text", 'auto'::"text"])))
);
ALTER TABLE "public"."user_memory_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_model_settings" (
    "user_id" "uuid" NOT NULL,
    "system_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."user_model_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_platform_inference_usage" (
    "user_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "standard_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_platform_inference_usage_standard_used_check" CHECK (("standard_used" >= 0))
);
ALTER TABLE "public"."user_platform_inference_usage" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_provider_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "api_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vault_secret_id" "uuid"
);
ALTER TABLE "public"."user_provider_keys" OWNER TO "postgres";
ALTER TABLE ONLY "public"."builder_accounts"
    ADD CONSTRAINT "builder_accounts_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."builder_subscriptions"
    ADD CONSTRAINT "builder_subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."builder_subscriptions"
    ADD CONSTRAINT "builder_subscriptions_provider_provider_subscription_id_key" UNIQUE ("provider", "provider_subscription_id");
ALTER TABLE ONLY "public"."communities"
    ADD CONSTRAINT "communities_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."communities"
    ADD CONSTRAINT "communities_slug_key" UNIQUE ("slug");
ALTER TABLE ONLY "public"."community_agent_drafts"
    ADD CONSTRAINT "community_agent_drafts_community_id_slot_key" UNIQUE ("community_id", "slot");
ALTER TABLE ONLY "public"."community_agent_drafts"
    ADD CONSTRAINT "community_agent_drafts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_invite_uses"
    ADD CONSTRAINT "community_invite_uses_invite_id_user_id_key" UNIQUE ("invite_id", "user_id");
ALTER TABLE ONLY "public"."community_invite_uses"
    ADD CONSTRAINT "community_invite_uses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_invites"
    ADD CONSTRAINT "community_invites_code_key" UNIQUE ("code");
ALTER TABLE ONLY "public"."community_invites"
    ADD CONSTRAINT "community_invites_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_join_requests"
    ADD CONSTRAINT "community_join_requests_community_id_user_id_key" UNIQUE ("community_id", "user_id");
ALTER TABLE ONLY "public"."community_join_requests"
    ADD CONSTRAINT "community_join_requests_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_member_settings"
    ADD CONSTRAINT "community_member_settings_pkey" PRIMARY KEY ("community_id", "user_id");
ALTER TABLE ONLY "public"."community_memberships"
    ADD CONSTRAINT "community_memberships_community_id_user_id_key" UNIQUE ("community_id", "user_id");
ALTER TABLE ONLY "public"."community_memberships"
    ADD CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_resource_decisions"
    ADD CONSTRAINT "community_resource_decisions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."community_resources"
    ADD CONSTRAINT "community_resources_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."edge_rate_limits"
    ADD CONSTRAINT "edge_rate_limits_pkey" PRIMARY KEY ("key");
ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");
ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."model_registry"
    ADD CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_ledger_entries"
    ADD CONSTRAINT "payment_ledger_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_provider_provider_event_id_key" UNIQUE ("provider", "provider_event_id");
ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."personal_memory_items"
    ADD CONSTRAINT "personal_memory_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."provider_subscriptions"
    ADD CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."provider_subscriptions"
    ADD CONSTRAINT "provider_subscriptions_provider_provider_subscription_id_key" UNIQUE ("provider", "provider_subscription_id");
ALTER TABLE ONLY "public"."purchase_claims"
    ADD CONSTRAINT "purchase_claims_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."purchase_claims"
    ADD CONSTRAINT "purchase_claims_token_hash_key" UNIQUE ("token_hash");
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_ai_history_usage"
    ADD CONSTRAINT "user_ai_history_usage_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."user_memory_settings"
    ADD CONSTRAINT "user_memory_settings_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."user_model_settings"
    ADD CONSTRAINT "user_model_settings_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."user_platform_inference_usage"
    ADD CONSTRAINT "user_platform_inference_usage_pkey" PRIMARY KEY ("user_id", "period_start");
ALTER TABLE ONLY "public"."user_provider_keys"
    ADD CONSTRAINT "user_provider_keys_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_provider_keys"
    ADD CONSTRAINT "user_provider_keys_user_id_provider_key" UNIQUE ("user_id", "provider");
CREATE INDEX "community_invite_uses_invite_id_idx" ON "public"."community_invite_uses" USING "btree" ("invite_id");
CREATE INDEX "community_invite_uses_used_at_idx" ON "public"."community_invite_uses" USING "btree" ("used_at");
CREATE INDEX "community_invites_code_idx" ON "public"."community_invites" USING "btree" ("code");
CREATE INDEX "community_invites_community_id_idx" ON "public"."community_invites" USING "btree" ("community_id");
CREATE INDEX "community_memberships_community_id_idx" ON "public"."community_memberships" USING "btree" ("community_id");
CREATE INDEX "community_memberships_user_id_idx" ON "public"."community_memberships" USING "btree" ("user_id");
CREATE INDEX "community_resources_community_id_idx" ON "public"."community_resources" USING "btree" ("community_id");
CREATE INDEX "entitlements_community_id_idx" ON "public"."entitlements" USING "btree" ("community_id");
CREATE INDEX "entitlements_user_id_idx" ON "public"."entitlements" USING "btree" ("user_id");
CREATE INDEX "idx_builder_subscriptions_user" ON "public"."builder_subscriptions" USING "btree" ("user_id", "updated_at" DESC);
CREATE INDEX "idx_communities_owner_id" ON "public"."communities" USING "btree" ("owner_id");
CREATE INDEX "idx_community_join_requests_community_status_created" ON "public"."community_join_requests" USING "btree" ("community_id", "status", "created_at");
CREATE INDEX "idx_community_join_requests_decided_by" ON "public"."community_join_requests" USING "btree" ("decided_by");
CREATE INDEX "idx_community_join_requests_user" ON "public"."community_join_requests" USING "btree" ("user_id", "updated_at" DESC);
CREATE INDEX "idx_community_member_settings_community_id" ON "public"."community_member_settings" USING "btree" ("community_id");
CREATE INDEX "idx_community_member_settings_user_id" ON "public"."community_member_settings" USING "btree" ("user_id");
CREATE INDEX "idx_community_resource_decisions_community_created" ON "public"."community_resource_decisions" USING "btree" ("community_id", "created_at" DESC);
CREATE INDEX "idx_community_resource_decisions_resource_created" ON "public"."community_resource_decisions" USING "btree" ("resource_id", "created_at" DESC);
CREATE INDEX "idx_community_resources_fingerprint" ON "public"."community_resources" USING "btree" ("community_id", "dedupe_fingerprint");
CREATE INDEX "idx_community_resources_published_safe" ON "public"."community_resources" USING "btree" ("community_id", "created_at" DESC) WHERE (("state" = 'published'::"text") AND ("safety_status" = 'pass'::"text"));
CREATE INDEX "idx_community_resources_state_created" ON "public"."community_resources" USING "btree" ("community_id", "state", "created_at" DESC);
CREATE INDEX "idx_community_resources_state_pinned_created" ON "public"."community_resources" USING "btree" ("community_id", "state", "pinned" DESC, "created_at" DESC);
CREATE INDEX "idx_community_resources_submitted_by_created" ON "public"."community_resources" USING "btree" ("community_id", "submitted_by", "created_at" DESC);
CREATE INDEX "idx_community_resources_text_fts" ON "public"."community_resources" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("body_md", ''::"text")) || ' '::"text") || COALESCE("url", ''::"text"))));
CREATE INDEX "idx_edge_rate_limits_updated_at" ON "public"."edge_rate_limits" USING "btree" ("updated_at" DESC);
CREATE INDEX "idx_message_reactions_message_id" ON "public"."message_reactions" USING "btree" ("message_id");
CREATE INDEX "idx_message_reactions_user_id" ON "public"."message_reactions" USING "btree" ("user_id");
CREATE INDEX "idx_messages_reply_to_id" ON "public"."messages" USING "btree" ("reply_to_id");
CREATE INDEX "idx_messages_role_thread_created" ON "public"."messages" USING "btree" ("role", "thread_id", "created_at" DESC);
CREATE INDEX "idx_messages_text_fts_agent_retrieval" ON "public"."messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", COALESCE(("content_json" ->> 'text'::"text"), ("content_json" ->> 'content'::"text"), ''::"text"))) WHERE ("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"]));
CREATE INDEX "idx_messages_thread_created_at" ON "public"."messages" USING "btree" ("thread_id", "created_at" DESC);
CREATE INDEX "idx_messages_thread_sender_id" ON "public"."messages" USING "btree" ("thread_id", "sender_id");
CREATE UNIQUE INDEX "idx_messages_thread_seq_unique" ON "public"."messages" USING "btree" ("thread_id", "seq");
CREATE INDEX "idx_messages_user_text_fts" ON "public"."messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", COALESCE(("content_json" ->> 'text'::"text"), ("content_json" ->> 'content'::"text"), ''::"text"))) WHERE ("role" = 'user'::"text");
CREATE INDEX "idx_payment_intents_community_created_at" ON "public"."payment_intents" USING "btree" ("community_id", "created_at" DESC);
CREATE INDEX "idx_payment_intents_plan_id" ON "public"."payment_intents" USING "btree" ("plan_id");
CREATE INDEX "idx_payment_intents_user_created_at" ON "public"."payment_intents" USING "btree" ("user_id", "created_at" DESC);
CREATE INDEX "idx_payment_ledger_entries_community_occurred_at" ON "public"."payment_ledger_entries" USING "btree" ("community_id", "occurred_at" DESC);
CREATE INDEX "idx_payment_ledger_entries_intent_occurred_at" ON "public"."payment_ledger_entries" USING "btree" ("payment_intent_id", "occurred_at" DESC);
CREATE INDEX "idx_payment_ledger_entries_user_occurred_at" ON "public"."payment_ledger_entries" USING "btree" ("user_id", "occurred_at" DESC);
CREATE INDEX "idx_payment_provider_events_received_at" ON "public"."payment_provider_events" USING "btree" ("received_at" DESC);
CREATE INDEX "idx_payment_receipts_intent_created_at" ON "public"."payment_receipts" USING "btree" ("payment_intent_id", "created_at" DESC);
CREATE INDEX "idx_personal_memory_items_user_pinned_updated" ON "public"."personal_memory_items" USING "btree" ("user_id", "pinned" DESC, "updated_at" DESC);
CREATE INDEX "idx_personal_memory_items_user_scope_updated" ON "public"."personal_memory_items" USING "btree" ("user_id", "scope", "scope_id", "updated_at" DESC);
CREATE INDEX "idx_plans_community_id" ON "public"."plans" USING "btree" ("community_id");
CREATE INDEX "idx_plans_visibility_active" ON "public"."plans" USING "btree" ("visibility", "is_active");
CREATE INDEX "idx_provider_subscriptions_community" ON "public"."provider_subscriptions" USING "btree" ("community_id", "updated_at" DESC);
CREATE INDEX "idx_provider_subscriptions_payment_intent_id" ON "public"."provider_subscriptions" USING "btree" ("payment_intent_id");
CREATE INDEX "idx_provider_subscriptions_plan_id" ON "public"."provider_subscriptions" USING "btree" ("plan_id");
CREATE INDEX "idx_provider_subscriptions_user" ON "public"."provider_subscriptions" USING "btree" ("user_id", "updated_at" DESC);
CREATE INDEX "idx_purchase_claims_payment_intent_id" ON "public"."purchase_claims" USING "btree" ("payment_intent_id");
CREATE INDEX "idx_purchase_claims_status_expires" ON "public"."purchase_claims" USING "btree" ("status", "expires_at");
CREATE INDEX "idx_threads_community_engine_id" ON "public"."threads" USING "btree" ("community_id", "engine_id", "id");
CREATE INDEX "idx_threads_community_id" ON "public"."threads" USING "btree" ("community_id");
CREATE INDEX "idx_threads_owner_created_at" ON "public"."threads" USING "btree" ("owner_id", "created_at" DESC);
CREATE INDEX "idx_threads_owner_updated_at" ON "public"."threads" USING "btree" ("owner_id", "updated_at" DESC);
CREATE INDEX "idx_user_platform_inference_usage_updated_at" ON "public"."user_platform_inference_usage" USING "btree" ("updated_at" DESC);
CREATE UNIQUE INDEX "uq_community_agent_drafts_one_active" ON "public"."community_agent_drafts" USING "btree" ("community_id") WHERE "is_active";
CREATE UNIQUE INDEX "uq_entitlements_one_per_user_community" ON "public"."entitlements" USING "btree" ("user_id", "community_id");
CREATE UNIQUE INDEX "uq_messages_assistant_reply_per_user_message" ON "public"."messages" USING "btree" ("thread_id", "reply_to_id") WHERE (("role" = 'assistant'::"text") AND ("reply_to_id" IS NOT NULL));
CREATE UNIQUE INDEX "uq_payment_intents_provider_session" ON "public"."payment_intents" USING "btree" ("provider", "provider_session_id") WHERE ("provider_session_id" IS NOT NULL);
CREATE UNIQUE INDEX "uq_payment_ledger_entries_provider_ref" ON "public"."payment_ledger_entries" USING "btree" ("provider", "kind", "provider_ref");
CREATE UNIQUE INDEX "uq_payment_receipts_provider_session" ON "public"."payment_receipts" USING "btree" ("provider", "provider_session_id");
CREATE UNIQUE INDEX "uq_payment_receipts_provider_subscription" ON "public"."payment_receipts" USING "btree" ("provider", "provider_subscription_id") WHERE ("provider_subscription_id" IS NOT NULL);
CREATE UNIQUE INDEX "uq_plans_one_active_per_community_period" ON "public"."plans" USING "btree" ("community_id", "billing_period") WHERE ("is_active" = true);
CREATE UNIQUE INDEX "uq_plans_stripe_price_id" ON "public"."plans" USING "btree" ("stripe_price_id") WHERE ("stripe_price_id" IS NOT NULL);
CREATE INDEX "user_provider_keys_user_id_idx" ON "public"."user_provider_keys" USING "btree" ("user_id");
CREATE OR REPLACE TRIGGER "builder_accounts_set_updated_at" BEFORE UPDATE ON "public"."builder_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "builder_subscriptions_set_updated_at" BEFORE UPDATE ON "public"."builder_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "community_agent_drafts_set_updated_at" BEFORE UPDATE ON "public"."community_agent_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "model_registry_set_updated_at" BEFORE UPDATE ON "public"."model_registry" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_communities_00_delete_cleanup" BEFORE DELETE ON "public"."communities" FOR EACH ROW EXECUTE FUNCTION "public"."communities_before_delete_cleanup"();
CREATE OR REPLACE TRIGGER "trg_community_member_settings_set_updated_at" BEFORE UPDATE ON "public"."community_member_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_community_resources_block_sensitive_content" BEFORE INSERT OR UPDATE ON "public"."community_resources" FOR EACH ROW EXECUTE FUNCTION "public"."community_resources_block_sensitive_content"();
CREATE OR REPLACE TRIGGER "trg_community_resources_create_limits" BEFORE INSERT OR UPDATE ON "public"."community_resources" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_community_resource_create_limits"();
CREATE OR REPLACE TRIGGER "trg_messages_00_ai_history_quota_insert" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_ai_history_before_insert"();
CREATE OR REPLACE TRIGGER "trg_messages_00_ai_history_quota_update" BEFORE UPDATE OF "content_json" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_ai_history_before_update"();
CREATE OR REPLACE TRIGGER "trg_messages_99_ai_history_quota_delete" AFTER DELETE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_ai_history_after_delete"();
CREATE OR REPLACE TRIGGER "trg_messages_assign_seq" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_assign_seq"();
CREATE OR REPLACE TRIGGER "trg_messages_community_chat_limits" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_community_chat_message_limits"();
CREATE OR REPLACE TRIGGER "trg_messages_restrict_update" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_restrict_update"();
CREATE OR REPLACE TRIGGER "trg_messages_validate_reply" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_validate_reply"();
CREATE OR REPLACE TRIGGER "trg_personal_memory_items_dedupe" BEFORE INSERT ON "public"."personal_memory_items" FOR EACH ROW EXECUTE FUNCTION "public"."personal_memory_items_dedupe"();
CREATE OR REPLACE TRIGGER "trg_threads_restrict_update" BEFORE UPDATE ON "public"."threads" FOR EACH ROW EXECUTE FUNCTION "public"."threads_restrict_update"();
CREATE OR REPLACE TRIGGER "trg_user_provider_keys_set_updated_at" BEFORE UPDATE ON "public"."user_provider_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "user_ai_history_usage_set_updated_at" BEFORE UPDATE ON "public"."user_ai_history_usage" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "user_memory_settings_set_updated_at" BEFORE UPDATE ON "public"."user_memory_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "user_model_settings_set_updated_at" BEFORE UPDATE ON "public"."user_model_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "public"."builder_accounts"
    ADD CONSTRAINT "builder_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."builder_subscriptions"
    ADD CONSTRAINT "builder_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communities"
    ADD CONSTRAINT "communities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_agent_drafts"
    ADD CONSTRAINT "community_agent_drafts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_invite_uses"
    ADD CONSTRAINT "community_invite_uses_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "public"."community_invites"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_invites"
    ADD CONSTRAINT "community_invites_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_join_requests"
    ADD CONSTRAINT "community_join_requests_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_join_requests"
    ADD CONSTRAINT "community_join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."community_join_requests"
    ADD CONSTRAINT "community_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_member_settings"
    ADD CONSTRAINT "community_member_settings_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_member_settings"
    ADD CONSTRAINT "community_member_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_memberships"
    ADD CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_memberships"
    ADD CONSTRAINT "community_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_resource_decisions"
    ADD CONSTRAINT "community_resource_decisions_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."community_resource_decisions"
    ADD CONSTRAINT "community_resource_decisions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."community_resources"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."community_resources"
    ADD CONSTRAINT "community_resources_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "entitlements_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_intents"
    ADD CONSTRAINT "payment_intents_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."payment_ledger_entries"
    ADD CONSTRAINT "payment_ledger_entries_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_ledger_entries"
    ADD CONSTRAINT "payment_ledger_entries_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payment_ledger_entries"
    ADD CONSTRAINT "payment_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."personal_memory_items"
    ADD CONSTRAINT "personal_memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."provider_subscriptions"
    ADD CONSTRAINT "provider_subscriptions_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."provider_subscriptions"
    ADD CONSTRAINT "provider_subscriptions_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."provider_subscriptions"
    ADD CONSTRAINT "provider_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."purchase_claims"
    ADD CONSTRAINT "purchase_claims_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_ai_history_usage"
    ADD CONSTRAINT "user_ai_history_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_memory_settings"
    ADD CONSTRAINT "user_memory_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_model_settings"
    ADD CONSTRAINT "user_model_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_platform_inference_usage"
    ADD CONSTRAINT "user_platform_inference_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_provider_keys"
    ADD CONSTRAINT "user_provider_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."builder_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "builder_accounts_select_own" ON "public"."builder_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "builder_accounts_service_role_all" ON "public"."builder_accounts" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."builder_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "builder_subscriptions_service_role_all" ON "public"."builder_subscriptions" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."communities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communities_delete_owner" ON "public"."communities" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));
CREATE POLICY "communities_select_member" ON "public"."communities" FOR SELECT TO "authenticated" USING ("public"."is_community_member"("id"));
CREATE POLICY "communities_select_owner" ON "public"."communities" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));
CREATE POLICY "communities_select_public" ON "public"."communities" FOR SELECT TO "authenticated" USING (("visibility" = 'published'::"text"));
CREATE POLICY "communities_update_owner" ON "public"."communities" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
ALTER TABLE "public"."community_agent_drafts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_agent_drafts_no_delete" ON "public"."community_agent_drafts" FOR DELETE TO "authenticated" USING (false);
CREATE POLICY "community_agent_drafts_no_insert" ON "public"."community_agent_drafts" FOR INSERT TO "authenticated" WITH CHECK (false);
CREATE POLICY "community_agent_drafts_no_select" ON "public"."community_agent_drafts" FOR SELECT TO "authenticated" USING (false);
CREATE POLICY "community_agent_drafts_no_update" ON "public"."community_agent_drafts" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);
ALTER TABLE "public"."community_invite_uses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_invite_uses_select_owner" ON "public"."community_invite_uses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."community_invites" "i"
     JOIN "public"."communities" "c" ON (("c"."id" = "i"."community_id")))
  WHERE (("i"."id" = "community_invite_uses"."invite_id") AND ("c"."owner_id" = "auth"."uid"())))));
ALTER TABLE "public"."community_invites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_invites_delete_owner" ON "public"."community_invites" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_invites"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "community_invites_insert_owner" ON "public"."community_invites" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_invites"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "community_invites_select_owner" ON "public"."community_invites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_invites"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "community_invites_update_owner" ON "public"."community_invites" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_invites"."community_id") AND ("c"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_invites"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
ALTER TABLE "public"."community_join_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_join_requests_service_role_all" ON "public"."community_join_requests" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."community_member_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_member_settings_delete_self" ON "public"."community_member_settings" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("public"."has_active_entitlement"("community_id") OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_member_settings"."community_id") AND ("c"."owner_id" = "auth"."uid"())))))));
CREATE POLICY "community_member_settings_insert_self" ON "public"."community_member_settings" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("public"."has_active_entitlement"("community_id") OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_member_settings"."community_id") AND ("c"."owner_id" = "auth"."uid"())))))));
CREATE POLICY "community_member_settings_select_self" ON "public"."community_member_settings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("public"."has_active_entitlement"("community_id") OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_member_settings"."community_id") AND ("c"."owner_id" = "auth"."uid"())))))));
CREATE POLICY "community_member_settings_update_self" ON "public"."community_member_settings" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("public"."has_active_entitlement"("community_id") OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_member_settings"."community_id") AND ("c"."owner_id" = "auth"."uid"()))))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("public"."has_active_entitlement"("community_id") OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "community_member_settings"."community_id") AND ("c"."owner_id" = "auth"."uid"())))))));
ALTER TABLE "public"."community_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."community_resource_decisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_resource_decisions_select_member" ON "public"."community_resource_decisions" FOR SELECT TO "authenticated" USING ("public"."has_active_entitlement"("community_id"));
ALTER TABLE "public"."community_resources" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_resources_delete_admin" ON "public"."community_resources" FOR DELETE TO "authenticated" USING (false);
CREATE POLICY "community_resources_select_author_self" ON "public"."community_resources" FOR SELECT TO "authenticated" USING (("public"."has_active_entitlement"("community_id") AND ("submitted_by" = "auth"."uid"())));
CREATE POLICY "community_resources_select_member" ON "public"."community_resources" FOR SELECT TO "authenticated" USING (("public"."has_active_entitlement"("community_id") AND ("state" = 'published'::"text") AND ("safety_status" = 'pass'::"text")));
CREATE POLICY "community_resources_select_mod_all" ON "public"."community_resources" FOR SELECT TO "authenticated" USING ("public"."has_active_entitlement_role"("community_id", ARRAY['owner'::"text", 'admin'::"text", 'mod'::"text"]));
CREATE POLICY "community_resources_update_admin" ON "public"."community_resources" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "community_resources_write_admin" ON "public"."community_resources" FOR INSERT TO "authenticated" WITH CHECK (false);
ALTER TABLE "public"."edge_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."entitlements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlements_delete_owner" ON "public"."entitlements" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "entitlements"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "entitlements_select_self_or_owner" ON "public"."entitlements" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "entitlements"."community_id") AND ("c"."owner_id" = "auth"."uid"()))))));
CREATE POLICY "entitlements_update_owner" ON "public"."entitlements" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "entitlements"."community_id") AND ("c"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "entitlements"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "entitlements_write_owner" ON "public"."entitlements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "entitlements"."community_id") AND ("c"."owner_id" = "auth"."uid"())))));
CREATE POLICY "memberships_delete_owner" ON "public"."community_memberships" FOR DELETE TO "authenticated" USING ("public"."is_community_owner"("community_id"));
CREATE POLICY "memberships_insert_owner" ON "public"."community_memberships" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_community_owner"("community_id"));
CREATE POLICY "memberships_select_entitled" ON "public"."community_memberships" FOR SELECT TO "authenticated" USING (("public"."has_active_entitlement"("community_id") AND "public"."user_has_active_entitlement"("user_id", "community_id")));
CREATE POLICY "memberships_update_owner" ON "public"."community_memberships" FOR UPDATE TO "authenticated" USING ("public"."is_community_owner"("community_id")) WITH CHECK ("public"."is_community_owner"("community_id"));
ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_reactions_delete_own" ON "public"."message_reactions" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."threads" "t" ON (("t"."id" = "m"."thread_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ((("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id")) OR (("t"."engine_id" <> 'community_chat'::"text") AND ("t"."owner_id" = "auth"."uid"()))))))));
CREATE POLICY "message_reactions_insert_own" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."threads" "t" ON (("t"."id" = "m"."thread_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ((("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id")) OR (("t"."engine_id" <> 'community_chat'::"text") AND ("t"."owner_id" = "auth"."uid"()))))))));
CREATE POLICY "message_reactions_select_visible_message" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."threads" "t" ON (("t"."id" = "m"."thread_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ((("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id")) OR (("t"."engine_id" <> 'community_chat'::"text") AND ("t"."owner_id" = "auth"."uid"())))))));
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_delete_community_chat_own" ON "public"."messages" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id"))))));
CREATE POLICY "messages_insert_community_chat" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("role" = 'user'::"text") AND ("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id"))))));
CREATE POLICY "messages_insert_own" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."owner_id" = "auth"."uid"()) AND ("t"."engine_id" <> 'community_chat'::"text")))));
CREATE POLICY "messages_select_community_chat" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id")))));
CREATE POLICY "messages_select_own" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."owner_id" = "auth"."uid"()) AND ("t"."engine_id" <> 'community_chat'::"text")))));
CREATE POLICY "messages_update_community_chat_own" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id")))))) WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("role" = 'user'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."engine_id" = 'community_chat'::"text") AND ("t"."community_id" IS NOT NULL) AND "public"."has_active_entitlement"("t"."community_id"))))));
ALTER TABLE "public"."model_registry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_registry_select_enabled" ON "public"."model_registry" FOR SELECT TO "authenticated" USING (("enabled" = true));
ALTER TABLE "public"."payment_intents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_intents_select_self" ON "public"."payment_intents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
ALTER TABLE "public"."payment_ledger_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_ledger_entries_select_self" ON "public"."payment_ledger_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));
ALTER TABLE "public"."payment_provider_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_provider_events_service_role_all" ON "public"."payment_provider_events" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."payment_receipts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_receipts_select_self" ON "public"."payment_receipts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."payment_intents" "pi"
  WHERE (("pi"."id" = "payment_receipts"."payment_intent_id") AND ("pi"."user_id" = "auth"."uid"())))));
ALTER TABLE "public"."personal_memory_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal_memory_items_delete_own" ON "public"."personal_memory_items" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."has_personal_memory_access"("auth"."uid"())));
CREATE POLICY "personal_memory_items_insert_own" ON "public"."personal_memory_items" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_personal_memory_access"("auth"."uid"())));
CREATE POLICY "personal_memory_items_select_own" ON "public"."personal_memory_items" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."has_personal_memory_access"("auth"."uid"())));
CREATE POLICY "personal_memory_items_update_own" ON "public"."personal_memory_items" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."has_personal_memory_access"("auth"."uid"()))) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_personal_memory_access"("auth"."uid"())));
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_delete_owner" ON "public"."plans" FOR DELETE TO "authenticated" USING ("public"."is_community_owner"("community_id"));
CREATE POLICY "plans_select_owner" ON "public"."plans" FOR SELECT TO "authenticated" USING ("public"."is_community_owner"("community_id"));
CREATE POLICY "plans_select_public" ON "public"."plans" FOR SELECT TO "authenticated" USING ((("visibility" = 'published'::"text") AND ("is_active" = true)));
CREATE POLICY "plans_update_owner" ON "public"."plans" FOR UPDATE TO "authenticated" USING ("public"."is_community_owner"("community_id")) WITH CHECK ("public"."is_community_owner"("community_id"));
CREATE POLICY "plans_write_owner" ON "public"."plans" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_community_owner"("community_id"));
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("builder_tier" = 'free'::"text")));
CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "profiles_service_role_all" ON "public"."profiles" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("builder_tier" = ( SELECT "p"."builder_tier"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"())))));
ALTER TABLE "public"."provider_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_subscriptions_select_self" ON "public"."provider_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
ALTER TABLE "public"."purchase_claims" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_claims_service_role_all" ON "public"."purchase_claims" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads_delete_own" ON "public"."threads" FOR DELETE TO "authenticated" USING ((("owner_id" = "auth"."uid"()) AND ("engine_id" <> 'community_chat'::"text")));
CREATE POLICY "threads_insert_own" ON "public"."threads" FOR INSERT TO "authenticated" WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("engine_id" <> 'community_chat'::"text")));
CREATE POLICY "threads_select_community_chat" ON "public"."threads" FOR SELECT TO "authenticated" USING ((("engine_id" = 'community_chat'::"text") AND ("community_id" IS NOT NULL) AND "public"."has_active_entitlement"("community_id")));
CREATE POLICY "threads_select_own" ON "public"."threads" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) AND ("engine_id" <> 'community_chat'::"text")));
CREATE POLICY "threads_update_own" ON "public"."threads" FOR UPDATE TO "authenticated" USING ((("owner_id" = "auth"."uid"()) AND ("engine_id" <> 'community_chat'::"text"))) WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("engine_id" <> 'community_chat'::"text")));
ALTER TABLE "public"."user_ai_history_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_ai_history_usage_select_own" ON "public"."user_ai_history_usage" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "user_ai_history_usage_service_role_all" ON "public"."user_ai_history_usage" TO "service_role" USING (true) WITH CHECK (true);
ALTER TABLE "public"."user_memory_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_memory_settings_delete_own" ON "public"."user_memory_settings" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "user_memory_settings_insert_own" ON "public"."user_memory_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
CREATE POLICY "user_memory_settings_select_own" ON "public"."user_memory_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "user_memory_settings_update_own" ON "public"."user_memory_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
ALTER TABLE "public"."user_model_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_model_settings_delete_own" ON "public"."user_model_settings" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "user_model_settings_insert_own" ON "public"."user_model_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
CREATE POLICY "user_model_settings_select_own" ON "public"."user_model_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "user_model_settings_update_own" ON "public"."user_model_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
ALTER TABLE "public"."user_platform_inference_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_provider_keys" ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
REVOKE ALL ON FUNCTION "public"."accept_community_invite"("invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_community_invite"("invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_community_invite"("invite_code" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."approve_community_join_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_community_join_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_community_join_request"("p_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."clear_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."communities_before_delete_cleanup"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."community_artifact_publish"("p_community_id" "uuid", "p_artifact_type" "text", "p_artifact_payload" "jsonb", "p_request_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_artifact_publish"("p_community_id" "uuid", "p_artifact_type" "text", "p_artifact_payload" "jsonb", "p_request_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_artifact_publish"("p_community_id" "uuid", "p_artifact_type" "text", "p_artifact_payload" "jsonb", "p_request_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_automation_trigger"("p_community_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_request_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_automation_trigger"("p_community_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_request_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_automation_trigger"("p_community_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_request_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_chat_message_create"("p_community_id" "uuid", "p_channel_id" "uuid", "p_message_text" "text", "p_request_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_chat_message_create"("p_community_id" "uuid", "p_channel_id" "uuid", "p_message_text" "text", "p_request_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_chat_message_create"("p_community_id" "uuid", "p_channel_id" "uuid", "p_message_text" "text", "p_request_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_entitled_member_count"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_entitled_member_count"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_entitled_member_count"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_owner_is_pro"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_owner_is_pro"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_owner_is_pro"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_resource_publish"("p_community_id" "uuid", "p_title" "text", "p_content_markdown" "text", "p_source_url" "text", "p_request_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_resource_publish"("p_community_id" "uuid", "p_title" "text", "p_content_markdown" "text", "p_source_url" "text", "p_request_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_resource_publish"("p_community_id" "uuid", "p_title" "text", "p_content_markdown" "text", "p_source_url" "text", "p_request_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."community_resources_block_sensitive_content"() TO "anon";
GRANT ALL ON FUNCTION "public"."community_resources_block_sensitive_content"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_resources_block_sensitive_content"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."community_revenue_series"("p_community_id" "uuid", "p_range" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_revenue_series"("p_community_id" "uuid", "p_range" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_revenue_series"("p_community_id" "uuid", "p_range" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."consume_platform_inference_standard"("p_user_id" "uuid", "p_units" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_platform_inference_standard"("p_user_id" "uuid", "p_units" integer) TO "service_role";
GRANT ALL ON TABLE "public"."communities" TO "anon";
GRANT ALL ON TABLE "public"."communities" TO "authenticated";
GRANT ALL ON TABLE "public"."communities" TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_community"("p_name" "text", "p_slug" "text", "p_visibility" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_community"("p_name" "text", "p_slug" "text", "p_visibility" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_community"("p_name" "text", "p_slug" "text", "p_visibility" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."decide_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_decision" "text", "p_reasons" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_decision" "text", "p_reasons" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_decision" "text", "p_reasons" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."deny_community_join_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deny_community_join_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deny_community_join_request"("p_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."dev_set_my_builder_tier"("p_builder_tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dev_set_my_builder_tier"("p_builder_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dev_set_my_builder_tier"("p_builder_tier" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."edge_rate_limit_allow"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edge_rate_limit_allow"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_ai_history_quota"("p_thread_id" "uuid", "p_delta_bytes" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_ai_history_quota"("p_thread_id" "uuid", "p_delta_bytes" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_ai_history_quota"("p_thread_id" "uuid", "p_delta_bytes" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_community_chat_message_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_community_chat_message_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_community_chat_message_limits"() TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_community_invite_use"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_community_invite_use"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_community_invite_use"() TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_community_resource_create_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_community_resource_create_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_community_resource_create_limits"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."ensure_community_bootstrap"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_community_bootstrap"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."ensure_community_chat_thread"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_community_chat_thread"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_community_chat_thread"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_active_community_agent_landing"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_community_agent_landing"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_community_agent_landing"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_active_community_agent_system_prompt"("p_user_id" "uuid", "p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_community_agent_system_prompt"("p_user_id" "uuid", "p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_community_agent_system_prompt"("p_user_id" "uuid", "p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_community_pricing"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_community_pricing"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_community_pricing"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_capabilities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_capabilities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_capabilities"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_community_access"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_community_access"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_community_access"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_community_access_by_slug"("p_community_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_community_access_by_slug"("p_community_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_community_access_by_slug"("p_community_slug" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_join_request_by_slug"("p_community_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_join_request_by_slug"("p_community_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_join_request_by_slug"("p_community_slug" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_join_requests_by_slugs"("p_community_slugs" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_join_requests_by_slugs"("p_community_slugs" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_join_requests_by_slugs"("p_community_slugs" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_product_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_product_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_product_state"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_community_funnel_by_slug"("p_community_slug" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_capabilities"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_capabilities"("p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."has_active_entitlement"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_active_entitlement"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_entitlement"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."has_active_entitlement_role"("p_community_id" "uuid", "p_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_active_entitlement_role"("p_community_id" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_entitlement_role"("p_community_id" "uuid", "p_roles" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_personal_memory_access"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."hash_purchase_claim_token"("token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hash_purchase_claim_token"("token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hash_purchase_claim_token"("token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_community_member"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_community_member"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_community_member"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_community_owner"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_community_owner"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_community_owner"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."join_public_community"("p_community_id" "uuid", "p_brandos_aid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_public_community"("p_community_id" "uuid", "p_brandos_aid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."join_public_community"("p_community_id" "uuid", "p_brandos_aid" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."join_public_community_by_slug"("p_community_slug" "text", "p_brandos_aid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_public_community_by_slug"("p_community_slug" "text", "p_brandos_aid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_public_community_by_slug"("p_community_slug" "text", "p_brandos_aid" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."leave_community"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_community"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_community"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."list_community_agent_drafts"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_community_agent_drafts"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_community_agent_drafts"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."list_community_join_requests"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_community_join_requests"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_community_join_requests"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_community_members_admin"("p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."list_pending_purchase_claims"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_pending_purchase_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_pending_purchase_claims"() TO "service_role";
GRANT ALL ON FUNCTION "public"."max_ai_history_bytes_for_builder_tier"("p_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."max_ai_history_bytes_for_builder_tier"("p_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max_ai_history_bytes_for_builder_tier"("p_tier" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."max_communities_for_builder_tier"("p_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."max_communities_for_builder_tier"("p_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max_communities_for_builder_tier"("p_tier" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."messages_ai_history_after_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_ai_history_after_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_ai_history_after_delete"() TO "service_role";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_insert"() TO "service_role";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_ai_history_before_update"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."messages_assign_seq"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messages_restrict_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_restrict_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_restrict_update"() TO "service_role";
GRANT ALL ON FUNCTION "public"."messages_validate_reply"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_validate_reply"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_validate_reply"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."next_thread_seq"("_thread_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."personal_memory_items_dedupe"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."platform_inference_standard_cap_for_builder_tier"("p_tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."platform_inference_standard_cap_for_builder_tier"("p_tier" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."propose_community_memory_resource"("p_community_id" "uuid", "p_title" "text", "p_body_md" "text", "p_url" "text", "p_type" "text", "p_pinned" boolean, "p_source_kind" "text", "p_source_refs" "jsonb", "p_resource_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."propose_community_memory_resource"("p_community_id" "uuid", "p_title" "text", "p_body_md" "text", "p_url" "text", "p_type" "text", "p_pinned" boolean, "p_source_kind" "text", "p_source_refs" "jsonb", "p_resource_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."propose_community_memory_resource"("p_community_id" "uuid", "p_title" "text", "p_body_md" "text", "p_url" "text", "p_type" "text", "p_pinned" boolean, "p_source_kind" "text", "p_source_refs" "jsonb", "p_resource_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."read_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_reveal" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_reveal" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."redeem_pending_purchase_claims"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_pending_purchase_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_pending_purchase_claims"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."redeem_purchase_claim"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_purchase_claim"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_purchase_claim"("p_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."remove_member"("p_community_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_member"("p_community_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_member"("p_community_id" "uuid", "p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."request_community_access_by_slug"("p_community_slug" "text", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_community_access_by_slug"("p_community_slug" "text", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_community_access_by_slug"("p_community_slug" "text", "p_message" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_community_settings"("p_community_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text", "p_visibility" "text", "p_monthly_amount_base_units" numeric, "p_yearly_amount_base_units" numeric, "p_currency" "text", "p_currency_decimals" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_community_settings"("p_community_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text", "p_visibility" "text", "p_monthly_amount_base_units" numeric, "p_yearly_amount_base_units" numeric, "p_currency" "text", "p_currency_decimals" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_community_settings"("p_community_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text", "p_avatar_url" "text", "p_banner_url" "text", "p_visibility" "text", "p_monthly_amount_base_units" numeric, "p_yearly_amount_base_units" numeric, "p_currency" "text", "p_currency_decimals" smallint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."search_community_chat_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_community_chat_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_community_chat_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."search_community_resource_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_community_resource_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_community_resource_snippets"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."search_user_message_snippets"("p_user_id" "uuid", "p_query" "text", "p_exclude_thread_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_user_message_snippets"("p_user_id" "uuid", "p_query" "text", "p_exclude_thread_id" "uuid", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_active_community_agent_draft"("p_community_id" "uuid", "p_slot" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_community_agent_draft"("p_community_id" "uuid", "p_slot" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_community_agent_draft"("p_community_id" "uuid", "p_slot" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_community_free_join_requires_approval"("p_community_id" "uuid", "p_requires_approval" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_community_free_join_requires_approval"("p_community_id" "uuid", "p_requires_approval" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_community_free_join_requires_approval"("p_community_id" "uuid", "p_requires_approval" boolean) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."set_member_role"("p_community_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_member_role"("p_community_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_role"("p_community_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_thread_community_lens"("p_thread_id" "uuid", "p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_thread_community_lens"("p_thread_id" "uuid", "p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_thread_community_lens"("p_thread_id" "uuid", "p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_thread_context"("p_thread_id" "uuid", "p_expected_context_version" bigint, "p_thread_lane" "text", "p_project_id" "text", "p_community_id" "uuid", "p_update_thread_lane" boolean, "p_update_project_id" boolean, "p_update_community_id" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_thread_context"("p_thread_id" "uuid", "p_expected_context_version" bigint, "p_thread_lane" "text", "p_project_id" "text", "p_community_id" "uuid", "p_update_thread_lane" boolean, "p_update_project_id" boolean, "p_update_community_id" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_thread_context"("p_thread_id" "uuid", "p_expected_context_version" bigint, "p_thread_lane" "text", "p_project_id" "text", "p_community_id" "uuid", "p_update_thread_lane" boolean, "p_update_project_id" boolean, "p_update_community_id" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."threads_restrict_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."threads_restrict_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."threads_restrict_update"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_community_agent_draft"("p_community_id" "uuid", "p_slot" integer, "p_name" "text", "p_landing_json" "jsonb", "p_system_prompt" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_community_agent_draft"("p_community_id" "uuid", "p_slot" integer, "p_name" "text", "p_landing_json" "jsonb", "p_system_prompt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_community_agent_draft"("p_community_id" "uuid", "p_slot" integer, "p_name" "text", "p_landing_json" "jsonb", "p_system_prompt" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_api_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_user_provider_key_secret"("p_user_id" "uuid", "p_provider" "text", "p_api_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."user_has_active_entitlement"("p_user_id" "uuid", "p_community_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_active_entitlement"("p_user_id" "uuid", "p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_active_entitlement"("p_user_id" "uuid", "p_community_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."withdraw_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_community_memory_resource"("p_community_id" "uuid", "p_resource_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON TABLE "public"."builder_accounts" TO "anon";
GRANT ALL ON TABLE "public"."builder_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."builder_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."builder_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."builder_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."builder_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."community_agent_drafts" TO "service_role";
GRANT ALL ON TABLE "public"."community_invite_uses" TO "anon";
GRANT ALL ON TABLE "public"."community_invite_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."community_invite_uses" TO "service_role";
GRANT ALL ON TABLE "public"."community_invites" TO "anon";
GRANT ALL ON TABLE "public"."community_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."community_invites" TO "service_role";
GRANT ALL ON TABLE "public"."community_join_requests" TO "service_role";
GRANT ALL ON TABLE "public"."community_member_settings" TO "anon";
GRANT ALL ON TABLE "public"."community_member_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."community_member_settings" TO "service_role";
GRANT ALL ON TABLE "public"."community_memberships" TO "anon";
GRANT ALL ON TABLE "public"."community_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."community_memberships" TO "service_role";
GRANT ALL ON TABLE "public"."community_resource_decisions" TO "anon";
GRANT ALL ON TABLE "public"."community_resource_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."community_resource_decisions" TO "service_role";
GRANT ALL ON TABLE "public"."community_resources" TO "anon";
GRANT ALL ON TABLE "public"."community_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."community_resources" TO "service_role";
GRANT ALL ON TABLE "public"."edge_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."edge_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_rate_limits" TO "service_role";
GRANT ALL ON TABLE "public"."entitlements" TO "anon";
GRANT ALL ON TABLE "public"."entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."entitlements" TO "service_role";
GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";
GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT ALL ON TABLE "public"."model_registry" TO "anon";
GRANT ALL ON TABLE "public"."model_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."model_registry" TO "service_role";
GRANT ALL ON TABLE "public"."payment_intents" TO "anon";
GRANT ALL ON TABLE "public"."payment_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_intents" TO "service_role";
GRANT ALL ON TABLE "public"."payment_ledger_entries" TO "anon";
GRANT ALL ON TABLE "public"."payment_ledger_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_ledger_entries" TO "service_role";
GRANT ALL ON TABLE "public"."payment_provider_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_provider_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_provider_events" TO "service_role";
GRANT ALL ON TABLE "public"."payment_receipts" TO "anon";
GRANT ALL ON TABLE "public"."payment_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_receipts" TO "service_role";
GRANT ALL ON TABLE "public"."personal_memory_items" TO "anon";
GRANT ALL ON TABLE "public"."personal_memory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_memory_items" TO "service_role";
GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."provider_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."provider_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."purchase_claims" TO "anon";
GRANT ALL ON TABLE "public"."purchase_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_claims" TO "service_role";
GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";
GRANT ALL ON TABLE "public"."user_ai_history_usage" TO "anon";
GRANT ALL ON TABLE "public"."user_ai_history_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."user_ai_history_usage" TO "service_role";
GRANT ALL ON TABLE "public"."user_memory_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_memory_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_memory_settings" TO "service_role";
GRANT ALL ON TABLE "public"."user_model_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_model_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_model_settings" TO "service_role";
GRANT ALL ON TABLE "public"."user_platform_inference_usage" TO "anon";
GRANT ALL ON TABLE "public"."user_platform_inference_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."user_platform_inference_usage" TO "service_role";
GRANT ALL ON TABLE "public"."user_provider_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_provider_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_provider_keys" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
RESET ALL;
