-- Community harness action RPCs (authenticated-safe wrappers).
--
-- Purpose:
-- - Expose explicit action primitives for the community harness tool surface.
-- - Keep checks server-side (auth + entitlement role + idempotency key reuse).

create or replace function public.community_chat_message_create(
  p_community_id uuid,
  p_channel_id uuid,
  p_message_text text,
  p_request_key text default null
)
returns table(
  message_id uuid,
  thread_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

create or replace function public.community_resource_publish(
  p_community_id uuid,
  p_title text,
  p_content_markdown text,
  p_source_url text default null,
  p_request_key text default null
)
returns table(
  resource_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

create or replace function public.community_artifact_publish(
  p_community_id uuid,
  p_artifact_type text,
  p_artifact_payload jsonb,
  p_request_key text default null
)
returns table(
  artifact_id uuid,
  created_at timestamptz,
  storage_type text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

create or replace function public.community_automation_trigger(
  p_community_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_request_key text default null
)
returns table(
  event_id uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

revoke all on function public.community_chat_message_create(uuid, uuid, text, text) from public;
revoke all on function public.community_chat_message_create(uuid, uuid, text, text) from anon;
grant execute on function public.community_chat_message_create(uuid, uuid, text, text) to authenticated;
grant execute on function public.community_chat_message_create(uuid, uuid, text, text) to service_role;

revoke all on function public.community_resource_publish(uuid, text, text, text, text) from public;
revoke all on function public.community_resource_publish(uuid, text, text, text, text) from anon;
grant execute on function public.community_resource_publish(uuid, text, text, text, text) to authenticated;
grant execute on function public.community_resource_publish(uuid, text, text, text, text) to service_role;

revoke all on function public.community_artifact_publish(uuid, text, jsonb, text) from public;
revoke all on function public.community_artifact_publish(uuid, text, jsonb, text) from anon;
grant execute on function public.community_artifact_publish(uuid, text, jsonb, text) to authenticated;
grant execute on function public.community_artifact_publish(uuid, text, jsonb, text) to service_role;

revoke all on function public.community_automation_trigger(uuid, text, jsonb, text) from public;
revoke all on function public.community_automation_trigger(uuid, text, jsonb, text) from anon;
grant execute on function public.community_automation_trigger(uuid, text, jsonb, text) to authenticated;
grant execute on function public.community_automation_trigger(uuid, text, jsonb, text) to service_role;
