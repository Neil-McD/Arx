-- Harden canonical role fields to prevent silent drift.
--
-- These constraints keep the access-control surface stable and provider-agnostic.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'entitlements_role_check'
  ) then
    alter table public.entitlements
      add constraint entitlements_role_check
      check (role in ('member','mod','admin','owner'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'entitlements_status_check'
  ) then
    -- MVP: entitlements are represented as a single active row, with time-bounds in starts_at/ends_at.
    alter table public.entitlements
      add constraint entitlements_status_check
      check (status = 'active');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_memberships_role_check'
  ) then
    alter table public.community_memberships
      add constraint community_memberships_role_check
      check (role in ('member','mod','admin','owner'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_invites_role_check'
  ) then
    alter table public.community_invites
      add constraint community_invites_role_check
      check (role in ('member','mod','admin','owner'));
  end if;
end $$;

