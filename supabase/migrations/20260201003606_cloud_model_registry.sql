-- Cloud-canonical model registry.
-- Purpose:
-- - Single source of truth for the model picker across Web + Desktop.
-- - Server-side allowlist + provider routing for platform inference (and eventually BYOK).
--
-- Notes:
-- - provider_model is nullable during migration/transition so existing deployments can
--   continue using legacy env-based mapping until populated.
-- - Editing model rows is intended to be done via Supabase Dashboard (service_role).

create table if not exists public.model_registry (
  id text primary key,
  provider text not null,
  provider_model text,
  display_name text not null,
  enabled boolean not null default true,
  platform_enabled boolean not null default true,
  byok_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_registry_provider_check check (provider in ('openai','anthropic','google','x-ai'))
);

drop trigger if exists model_registry_set_updated_at on public.model_registry;
create trigger model_registry_set_updated_at
before update on public.model_registry
for each row
execute function public.set_updated_at();

alter table public.model_registry enable row level security;

-- Read-only for users: only enabled models should be visible via client queries.
drop policy if exists model_registry_select_enabled on public.model_registry;
create policy model_registry_select_enabled
on public.model_registry
for select
to authenticated
using (enabled = true);

-- Seed the currently shipped picker models (provider_model intentionally left null
-- so existing env mapping can remain authoritative until you populate provider_model).
insert into public.model_registry (id, provider, provider_model, display_name, enabled, platform_enabled, byok_enabled, sort_order)
values
  ('gpt-5.2', 'openai', null, 'GPT 5.2', true, true, true, 10),
  ('gpt-5.1', 'openai', null, 'GPT 5.1', true, true, true, 20),
  ('sonnet-4.5', 'anthropic', null, 'Sonnet 4.5', true, true, true, 30),
  ('opus-4.5', 'anthropic', null, 'Opus 4.5', true, true, true, 40),
  ('gemini-3-flash', 'google', null, 'Gemini 3 Flash', true, true, true, 50),
  ('gemini-3-pro', 'google', null, 'Gemini 3 Pro', true, true, true, 60),
  ('grok-4.1', 'x-ai', null, 'Grok 4.1', true, true, true, 70)
on conflict (id) do update set
  provider = excluded.provider,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  platform_enabled = excluded.platform_enabled,
  byok_enabled = excluded.byok_enabled,
  sort_order = excluded.sort_order;

