-- Fix automation_events idempotency unique index.
--
-- Several RPCs/triggers insert into automation_events using:
--   ON CONFLICT (idempotency_key) DO NOTHING
--
-- Postgres can only infer a conflict target from a UNIQUE constraint/index that
-- matches the column list. The previous index was a partial unique index
-- (WHERE idempotency_key IS NOT NULL), which does *not* match the default
-- conflict target and causes:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- A plain unique index on idempotency_key still allows multiple NULL values in
-- Postgres, so it preserves the original intent while making ON CONFLICT work.

drop index if exists public.uq_automation_events_idempotency_key;

create unique index if not exists uq_automation_events_idempotency_unique_key
  on public.automation_events(idempotency_key);
