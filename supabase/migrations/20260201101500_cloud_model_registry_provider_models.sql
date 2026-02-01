-- Populate provider_model for the default model picker catalog.
-- This lets Web + Desktop route directly from model_registry without env-based mapping.

update public.model_registry
set provider_model = 'gpt-5.2-2025-12-11'
where id = 'gpt-5.2'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'gpt-5.1-2025-11-13'
where id = 'gpt-5.1'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'claude-sonnet-4-20250514'
where id = 'sonnet-4.5'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'claude-opus-4-1-20250805'
where id = 'opus-4.5'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'gemini-3-flash-preview'
where id = 'gemini-3-flash'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'gemini-3-pro-preview'
where id = 'gemini-3-pro'
  and (provider_model is null or provider_model = '');

update public.model_registry
set provider_model = 'grok-4-1-fast-reasoning'
where id = 'grok-4.1'
  and (provider_model is null or provider_model = '');
