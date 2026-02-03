-- Lock paid plans to the "member" role.
--
-- Roles are canonical on `community_memberships.role` and should not be granted via payment plans
-- (prevents "buy admin/mod" escalation paths and keeps the monetization layer rail-agnostic).

update public.plans
set role = 'member'
where role is distinct from 'member';

alter table public.plans
  drop constraint if exists plans_role_check;

alter table public.plans
  alter column role set default 'member';

alter table public.plans
  add constraint plans_role_check check (role = 'member');

