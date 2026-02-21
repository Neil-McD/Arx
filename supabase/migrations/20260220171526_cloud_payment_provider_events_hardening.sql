-- Hardening: payment_provider_events should be server-only and append-only evidence.
--
-- Goals:
-- - Enforce least-privilege grants (service_role only).
-- - Keep RLS/service_role policy explicit.
-- - Block UPDATE/DELETE except explicit migration mode, with one-way processed_at stamp.

alter table public.payment_provider_events enable row level security;

do $$
declare
  v_policy text;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_provider_events'
  loop
    execute format('drop policy if exists %I on public.payment_provider_events', v_policy);
  end loop;
end
$$;

create policy payment_provider_events_service_role_all
on public.payment_provider_events
for all
to service_role
using (true)
with check (true);

revoke all on table public.payment_provider_events from public;
revoke all on table public.payment_provider_events from anon;
revoke all on table public.payment_provider_events from authenticated;
grant all on table public.payment_provider_events to service_role;

create or replace function public.payment_provider_events_restrict_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.migration_mode', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'payment_provider_events_delete_forbidden';
  end if;

  if new.id <> old.id
    or new.provider <> old.provider
    or new.provider_event_id <> old.provider_event_id
    or new.event_type is distinct from old.event_type
    or new.received_at <> old.received_at
    or new.raw_json is distinct from old.raw_json
  then
    raise exception 'payment_provider_events_immutable';
  end if;

  -- Allow only a one-way processing stamp (null -> timestamptz).
  if old.processed_at is null then
    if new.processed_at is null then
      return new;
    end if;
    return new;
  end if;

  if new.processed_at is distinct from old.processed_at then
    raise exception 'payment_provider_events_processed_at_immutable';
  end if;

  return new;
end $$;

drop trigger if exists trg_payment_provider_events_restrict_update on public.payment_provider_events;
create trigger trg_payment_provider_events_restrict_update
before update on public.payment_provider_events
for each row execute function public.payment_provider_events_restrict_mutation();

drop trigger if exists trg_payment_provider_events_restrict_delete on public.payment_provider_events;
create trigger trg_payment_provider_events_restrict_delete
before delete on public.payment_provider_events
for each row execute function public.payment_provider_events_restrict_mutation();;
