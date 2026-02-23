-- Phase E cleanup guardrails:
-- enforce project-scoped invariants for Daytona rows/runs.

alter table public.daytona_sandboxes
  drop constraint if exists daytona_sandboxes_daytona_project_required;

alter table public.daytona_sandboxes
  add constraint daytona_sandboxes_daytona_project_required
  check (provider <> 'daytona' or project_id is not null)
  not valid;

alter table public.daytona_sandboxes
  validate constraint daytona_sandboxes_daytona_project_required;

alter table public.runtime_runs
  drop constraint if exists runtime_runs_daytona_project_required;

alter table public.runtime_runs
  add constraint runtime_runs_daytona_project_required
  check (lane <> 'daytona' or project_id is not null)
  not valid;

alter table public.runtime_runs
  validate constraint runtime_runs_daytona_project_required;
