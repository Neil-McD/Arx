-- Minimal anti-abuse baseline for authenticated direct writes.
--
-- Contract: web write paths should have basic abuse controls (rate limits + size limits).
-- We enforce these server-side so REST inserts can't bypass UI throttles.

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

  -- Size guardrail: keep payloads small enough for realtime + previews.
  if octet_length(new.content_json::text) > 50000 then
    raise exception 'message_too_large' using errcode = '22023';
  end if;

  -- Per-user per-community message limit (sliding-window via edge_rate_limits primitive).
  v_key := format('auth:community_chat:msg:%s:%s', v_community_id::text, v_user_id::text);
  if not public.edge_rate_limit_allow(v_key, 60, 30) then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_community_chat_limits on public.messages;
create trigger trg_messages_community_chat_limits
before insert on public.messages
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

  -- Size guardrail: avoid huge markdown blobs in the MVP DB.
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
  v_key := format('auth:community_resource:create:%s:%s', new.community_id::text, v_user_id::text);
  if not public.edge_rate_limit_allow(v_key, 60, 10) then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_resources_create_limits on public.community_resources;
create trigger trg_community_resources_create_limits
before insert on public.community_resources
for each row
execute function public.enforce_community_resource_create_limits();

