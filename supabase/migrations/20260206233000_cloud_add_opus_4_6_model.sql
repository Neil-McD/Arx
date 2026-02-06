-- Add Anthropic Claude Opus 4.6 to the cloud model catalog.
-- Keep existing Opus 4.5 rows for backward compatibility with older threads.

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
values (
  'opus-4.6',
  'anthropic',
  'claude-opus-4-6',
  'Opus 4.6',
  true,
  true,
  true,
  41
)
on conflict (id) do update set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  platform_enabled = excluded.platform_enabled,
  byok_enabled = excluded.byok_enabled,
  sort_order = excluded.sort_order;
