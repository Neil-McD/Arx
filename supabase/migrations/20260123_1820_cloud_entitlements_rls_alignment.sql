-- Align access control with entitlements (canonical access) rather than membership-only checks.
--
-- Contract:
-- - Entitlements are canonical access control.
-- - Role + entitlement checks happen per request (RLS).

create or replace function public.has_active_entitlement(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

create or replace function public.has_active_entitlement_role(p_community_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.role = any (p_roles)
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- Keep helper used by community SELECT policies, but align it to entitlements.
create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_active_entitlement(p_community_id);
$$;

-- Community resources: gate by entitlements (role-aware).
drop policy if exists community_resources_select_member on public.community_resources;
create policy community_resources_select_member
on public.community_resources
for select
to authenticated
using (public.has_active_entitlement(community_id));

drop policy if exists community_resources_write_admin on public.community_resources;
create policy community_resources_write_admin
on public.community_resources
for insert
to authenticated
with check (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

drop policy if exists community_resources_update_admin on public.community_resources;
create policy community_resources_update_admin
on public.community_resources
for update
to authenticated
using (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
)
with check (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

drop policy if exists community_resources_delete_admin on public.community_resources;
create policy community_resources_delete_admin
on public.community_resources
for delete
to authenticated
using (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

-- Community chat via threads/messages: gate by entitlements (not memberships).
drop policy if exists threads_select_community_chat on public.threads;
create policy threads_select_community_chat
on public.threads
for select
to authenticated
using (
  engine_id = 'community_chat'
  and community_id is not null
  and public.has_active_entitlement(community_id)
);

drop policy if exists threads_insert_community_chat on public.threads;
create policy threads_insert_community_chat
on public.threads
for insert
to authenticated
with check (
  engine_id = 'community_chat'
  and owner_id = auth.uid()
  and community_id is not null
  and id = community_id
  and public.has_active_entitlement(community_id)
);

drop policy if exists messages_select_community_chat on public.messages;
create policy messages_select_community_chat
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and t.community_id is not null
      and public.has_active_entitlement(t.community_id)
  )
);

drop policy if exists messages_insert_community_chat on public.messages;
create policy messages_insert_community_chat
on public.messages
for insert
to authenticated
with check (
  role = 'user'
  and exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and t.community_id is not null
      and public.has_active_entitlement(t.community_id)
  )
);

drop policy if exists messages_update_community_chat_own on public.messages;
create policy messages_update_community_chat_own
on public.messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and t.community_id is not null
      and public.has_active_entitlement(t.community_id)
  )
)
with check (
  sender_id = auth.uid()
  and role = 'user'
  and exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and t.community_id is not null
      and public.has_active_entitlement(t.community_id)
  )
);

drop policy if exists messages_delete_community_chat_own on public.messages;
create policy messages_delete_community_chat_own
on public.messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.threads t
    where t.id = messages.thread_id
      and t.engine_id = 'community_chat'
      and t.community_id is not null
      and public.has_active_entitlement(t.community_id)
  )
);
