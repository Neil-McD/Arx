-- Scope idempotency keys to thread-level runtime runs.
-- Prevent cross-thread dedupe collisions for the same user.

alter table public.runtime_runs
  drop constraint if exists runtime_runs_user_id_idempotency_key_key;

alter table public.runtime_runs
  drop constraint if exists runtime_runs_user_thread_idempotency_key_key;

alter table public.runtime_runs
  add constraint runtime_runs_user_thread_idempotency_key_key
  unique (user_id, thread_id, idempotency_key);
