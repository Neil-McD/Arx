-- Remove GPT 5.1 from Arx surfaces.
-- We keep the row for historical threads/messages, but hide it from the model picker
-- and disable it for platform + BYOK routing.

update public.model_registry
set enabled = false,
    platform_enabled = false,
    byok_enabled = false
where id = 'gpt-5.1';

