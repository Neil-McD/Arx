-- Phase F: remove legacy thread-scoped sandbox identity.
-- Daytona sandbox identity is now strictly user_id + project_id + provider.

drop index if exists public.idx_daytona_sandboxes_thread;

alter table public.daytona_sandboxes
  drop column if exists thread_id;
