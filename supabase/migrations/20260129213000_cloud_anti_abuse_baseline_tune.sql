-- Tune the anti-abuse baseline to match current UI behavior (attachments) without changing UX.
--
-- The baseline triggers protect authenticated direct REST writes (PostgREST) from bypassing UI throttles.
-- We keep the existing rate limits, but raise the community chat payload cap so image attachments work.
--
-- Policy:
-- - Enforce size limits on INSERT + UPDATE.
-- - Rate limit only on INSERT (editing shouldn't burn the user's send quota).

create or replace function public.enforce_community_chat_message_limits()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

drop trigger if exists trg_messages_community_chat_limits on public.messages;
create trigger trg_messages_community_chat_limits
before insert or update on public.messages
for each row
execute function public.enforce_community_chat_message_limits();

create or replace function public.enforce_community_resource_create_limits()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

drop trigger if exists trg_community_resources_create_limits on public.community_resources;
create trigger trg_community_resources_create_limits
before insert or update on public.community_resources
for each row
execute function public.enforce_community_resource_create_limits();

