-- Member-level settings + self-service leave.
-- Keeps community-level settings separate from per-member preferences.

-- Per-member settings (notifications, mute, etc.)
create table if not exists public.community_member_settings (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default false,
  muted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists idx_community_member_settings_user_id
  on public.community_member_settings(user_id);

create index if not exists idx_community_member_settings_community_id
  on public.community_member_settings(community_id);

alter table public.community_member_settings enable row level security;

drop trigger if exists trg_community_member_settings_set_updated_at on public.community_member_settings;
create trigger trg_community_member_settings_set_updated_at
before update on public.community_member_settings
for each row execute function public.set_updated_at();

drop policy if exists community_member_settings_select_self on public.community_member_settings;
create policy community_member_settings_select_self
on public.community_member_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists community_member_settings_insert_self on public.community_member_settings;
create policy community_member_settings_insert_self
on public.community_member_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists community_member_settings_update_self on public.community_member_settings;
create policy community_member_settings_update_self
on public.community_member_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists community_member_settings_delete_self on public.community_member_settings;
create policy community_member_settings_delete_self
on public.community_member_settings
for delete
to authenticated
using (user_id = auth.uid());

-- Member-initiated leave: revoke canonical access + remove roster projection.
create or replace function public.leave_community(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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

