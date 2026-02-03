-- Fix automation_set_project_url validation so standard Supabase project URLs are accepted.
--
-- This is a corrective follow-up to the initial automations scheduling migration.

create or replace function public.automation_set_project_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public, vault
set row_security = off
as $$
declare
  v_url text := trim(coalesce(p_url, ''));
  v_existing record;
begin
  if v_url = '' then
    raise exception 'project url is required';
  end if;

  if v_url !~ E'^https://[a-z0-9-]+\\.supabase\\.co$' then
    raise exception 'invalid project url: %', v_url;
  end if;

  select id as vault_secret_id
  into v_existing
  from vault.secrets
  where name = 'arx_project_url'
  limit 1;

  if v_existing.vault_secret_id is null then
    perform vault.create_secret(
      v_url,
      'arx_project_url',
      'Arx project URL (used for scheduled Edge Function calls)',
      null
    );
  else
    perform vault.update_secret(
      v_existing.vault_secret_id,
      v_url,
      'arx_project_url',
      'Arx project URL (used for scheduled Edge Function calls)',
      null
    );
  end if;
end;
$$;

revoke all on function public.automation_set_project_url(text) from public;
grant execute on function public.automation_set_project_url(text) to service_role;
