-- Add OpenRouter as a first-class provider in model_registry and wire paid OpenRouter aliases.

alter table public.model_registry
drop constraint if exists model_registry_provider_check;

alter table public.model_registry
add constraint model_registry_provider_check
check (provider in ('openai','anthropic','google','x-ai','openrouter'));

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
  ('kimi-k2', 'openrouter', 'moonshotai/kimi-k2', 'Kimi K2', true, true, true, 80),
  ('glm-4.7', 'openrouter', 'z-ai/glm-4.7', 'GLM 4.7', true, true, true, 81),
  ('gpt-oss-20b', 'openrouter', 'openai/gpt-oss-20b', 'GPT OSS 20B', true, true, true, 82),
  ('deepseek-v3.2', 'openrouter', 'deepseek/deepseek-v3.2', 'DeepSeek V3.2', true, true, true, 83)
on conflict (id) do update set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  platform_enabled = excluded.platform_enabled,
  byok_enabled = excluded.byok_enabled,
  sort_order = excluded.sort_order;;
