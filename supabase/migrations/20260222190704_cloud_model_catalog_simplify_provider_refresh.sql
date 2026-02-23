-- Simplify MVP paid model catalog and refresh provider aliases.
-- Keep only core paid providers in active rotation.

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
  ('gpt-5.2', 'openai', 'gpt-5.2-2025-12-11', 'GPT 5.2', true, true, true, 10),
  -- Alias id upgraded to 4.6 UX label; provider model remains on currently validated Sonnet 4 routing.
  ('sonnet-4.6', 'anthropic', 'claude-sonnet-4-20250514', 'Sonnet 4.6', true, true, true, 30),
  ('opus-4.6', 'anthropic', 'claude-opus-4-6', 'Opus 4.6', true, true, true, 40),
  ('gemini-3-flash', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash', true, true, true, 50),
  -- Alias id upgraded to 3.1 UX label; provider model remains on currently validated Pro routing.
  ('gemini-3.1-pro', 'google', 'gemini-3-pro-preview', 'Gemini 3.1 Pro', true, true, true, 60),
  -- Alias id upgraded to 4.2 UX label; provider model remains on currently validated Grok routing.
  ('grok-4.2', 'x-ai', 'grok-4-1-fast-reasoning', 'Grok 4.2', true, true, true, 70)
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
  enabled = false,
  platform_enabled = false
where id in (
  'sonnet-4.5',
  'opus-4.5',
  'gemini-3-pro',
  'grok-4.1',
  'kimi-k2',
  'glm-4.7',
  'deepseek-v3.2'
);
