-- Prevent users from self-upgrading builder tiers.
-- `builder_tier` is a billing-derived attribute and must be server-controlled.

-- Authenticated users may insert their own profile (rare; usually created by trigger),
-- but must not be able to set a paid tier.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid() and builder_tier = 'free');

-- Authenticated users may update their own display fields, but may not change builder_tier.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and builder_tier = (
    select p.builder_tier
    from public.profiles p
    where p.user_id = auth.uid()
  )
);

