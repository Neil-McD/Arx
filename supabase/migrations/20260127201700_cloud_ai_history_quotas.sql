-- Cloud AI history storage quotas (BYOK plans).
--
-- Goals:
-- - "AI chats" are private threads (threads.engine_id <> 'community_chat').
-- - Allow unlimited AI chats by count, but cap total stored cloud history bytes per user.
-- - Enforce server-side (covers web, desktop, and service-role edge writes).
--
-- Caps (GiB):
-- - free   => 250 MiB
-- - builder=> 5 GiB
-- - pro    => 25 GiB

create table if not exists public.user_ai_history_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bytes_used bigint not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_ai_history_usage_set_updated_at on public.user_ai_history_usage;
create trigger user_ai_history_usage_set_updated_at
before update on public.user_ai_history_usage
for each row
execute function public.set_updated_at();

alter table public.user_ai_history_usage enable row level security;

drop policy if exists user_ai_history_usage_select_own on public.user_ai_history_usage;
create policy user_ai_history_usage_select_own
on public.user_ai_history_usage
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_ai_history_usage_service_role_all on public.user_ai_history_usage;
create policy user_ai_history_usage_service_role_all
on public.user_ai_history_usage
for all
to service_role
using (true)
with check (true);

create or replace function public.max_ai_history_bytes_for_builder_tier(p_tier text)
returns bigint
language sql
stable
as $$
  select case
    when lower(coalesce(p_tier, '')) = 'pro' then 26843545600 -- 25 GiB
    when lower(coalesce(p_tier, '')) = 'builder' then 5368709120 -- 5 GiB
    else 262144000 -- 250 MiB
  end;
$$;

create or replace function public.enforce_ai_history_quota(p_thread_id uuid, p_delta_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

create or replace function public.messages_ai_history_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_bytes bigint;
begin
  v_bytes := octet_length(coalesce(new.content_json::text, ''));
  perform public.enforce_ai_history_quota(new.thread_id, v_bytes);
  return new;
end;
$$;

create or replace function public.messages_ai_history_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

create or replace function public.messages_ai_history_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old bigint;
begin
  v_old := octet_length(coalesce(old.content_json::text, ''));
  perform public.enforce_ai_history_quota(old.thread_id, -v_old);
  return old;
end;
$$;

drop trigger if exists trg_messages_00_ai_history_quota_insert on public.messages;
create trigger trg_messages_00_ai_history_quota_insert
before insert on public.messages
for each row
execute function public.messages_ai_history_before_insert();

drop trigger if exists trg_messages_00_ai_history_quota_update on public.messages;
create trigger trg_messages_00_ai_history_quota_update
before update of content_json on public.messages
for each row
execute function public.messages_ai_history_before_update();

drop trigger if exists trg_messages_99_ai_history_quota_delete on public.messages;
create trigger trg_messages_99_ai_history_quota_delete
after delete on public.messages
for each row
execute function public.messages_ai_history_after_delete();

-- Backfill current usage from existing data (best-effort).
insert into public.user_ai_history_usage(user_id, bytes_used)
select
  t.owner_id,
  coalesce(sum(octet_length(coalesce(m.content_json::text, '')))::bigint, 0) as bytes_used
from public.messages m
join public.threads t on t.id = m.thread_id
where t.engine_id <> 'community_chat'
group by t.owner_id
on conflict (user_id)
do update set
  bytes_used = excluded.bytes_used,
  updated_at = now();

