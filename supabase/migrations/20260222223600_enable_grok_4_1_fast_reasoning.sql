-- Promote Grok 4.1 as the canonical xAI paid model for MVP.
-- Keep Grok 4.2 id as a compatibility alias so existing user selections do not break.

insert into public.model_registry (
  id,
  provider,
  provider_model,
  display_name,
  enabled,
  platform_enabled,
  byok_enabled,
  sort_order
)
values
  ('grok-4.1', 'x-ai', 'grok-4-1-fast-reasoning', 'Grok 4.1 Fast Reasoning', true, true, true, 70)
on conflict (id) do update
set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  platform_enabled = excluded.platform_enabled,
  byok_enabled = excluded.byok_enabled,
  sort_order = excluded.sort_order;

update public.model_registry
set
  provider = 'x-ai',
  provider_model = 'grok-4-1-fast-reasoning',
  enabled = true,
  platform_enabled = true,
  byok_enabled = true
where id = 'grok-4.2';
