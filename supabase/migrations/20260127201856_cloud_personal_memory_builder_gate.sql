-- Gate personal memory behind paid builder tiers.
--
-- Contract intent: personal memory is an explicit, paid feature (Starter/Pro).

create or replace function public.has_personal_memory_access(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and lower(coalesce(p.builder_tier, '')) in ('builder', 'pro')
  );
$$;

revoke all on function public.has_personal_memory_access(uuid) from public;
grant execute on function public.has_personal_memory_access(uuid) to authenticated;
grant execute on function public.has_personal_memory_access(uuid) to service_role;

-- Personal memory items: only available to Starter/Pro.
drop policy if exists personal_memory_items_select_own on public.personal_memory_items;
create policy personal_memory_items_select_own
on public.personal_memory_items
for select
to authenticated
using (user_id = auth.uid() and public.has_personal_memory_access(auth.uid()));

drop policy if exists personal_memory_items_insert_own on public.personal_memory_items;
create policy personal_memory_items_insert_own
on public.personal_memory_items
for insert
to authenticated
with check (user_id = auth.uid() and public.has_personal_memory_access(auth.uid()));

drop policy if exists personal_memory_items_update_own on public.personal_memory_items;
create policy personal_memory_items_update_own
on public.personal_memory_items
for update
to authenticated
using (user_id = auth.uid() and public.has_personal_memory_access(auth.uid()))
with check (user_id = auth.uid() and public.has_personal_memory_access(auth.uid()));

drop policy if exists personal_memory_items_delete_own on public.personal_memory_items;
create policy personal_memory_items_delete_own
on public.personal_memory_items
for delete
to authenticated
using (user_id = auth.uid() and public.has_personal_memory_access(auth.uid()));

