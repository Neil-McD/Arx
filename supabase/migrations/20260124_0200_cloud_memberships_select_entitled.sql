-- Membership roster visibility should follow entitlements (canonical access).
-- Members need to see the member list UI, but only for communities they can access.

drop policy if exists memberships_select_self_or_owner on public.community_memberships;
create policy memberships_select_entitled
on public.community_memberships
for select
to authenticated
using (public.has_active_entitlement(community_id));

