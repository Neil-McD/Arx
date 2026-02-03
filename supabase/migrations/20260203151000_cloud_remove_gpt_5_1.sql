-- Remove GPT-5.1 from the model registry entirely.
delete from public.model_registry
where id = 'gpt-5.1';
