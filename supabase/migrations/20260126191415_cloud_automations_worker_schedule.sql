-- Automations worker: schedule deliveries via pg_cron + pg_net.
--
-- - Creates a vault-backed worker secret.
-- - Exposes the secret to Edge Functions via a service_role-only RPC.
-- - Provides service_role-only helpers to configure the project URL and enable the cron job.
--
-- NOTE: `arx_project_url` is environment-specific and must be configured per environment.
--
-- Post-provision (service_role):
--   select public.automation_set_project_url('https://<PROJECT_REF>.supabase.co');
--   select public.automation_enable_worker();

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'automations_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'automations_worker_secret',
      'Arx automations worker secret',
      null
    );
  end if;
end;
$$;

create or replace function public.automation_worker_secret()
returns table(secret text)
language sql
security definer
set search_path = public, vault
set row_security = off
as $$
  select decrypted_secret as secret
  from vault.decrypted_secrets
  where name = 'automations_worker_secret'
  limit 1;
$$;

revoke all on function public.automation_worker_secret() from public;
grant execute on function public.automation_worker_secret() to service_role;

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

  if v_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then
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

create or replace function public.automation_enable_worker(p_schedule text default '* * * * *', p_batch_size integer default 25)
returns void
language plpgsql
security definer
set search_path = public, vault, cron, net
set row_security = off
as $$
declare
  v_batch integer := coalesce(p_batch_size, 25);
  v_url text;
  v_schedule text := trim(coalesce(p_schedule, ''));
begin
  if v_batch < 1 or v_batch > 500 then
    raise exception 'invalid batch size: %', v_batch;
  end if;

  if v_schedule = '' then
    v_schedule := '* * * * *';
  end if;

  select decrypted_secret
  into v_url
  from vault.decrypted_secrets
  where name = 'arx_project_url'
  limit 1;

  if trim(coalesce(v_url, '')) = '' then
    raise exception 'arx_project_url is not set; call automation_set_project_url(...) first';
  end if;

  if not exists (select 1 from cron.job where jobname = 'arx_automations_worker') then
    perform cron.schedule(
      'arx_automations_worker',
      v_schedule,
      format($cron$
      select
        net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'arx_project_url') || '/functions/v1/automations_worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-arx-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'automations_worker_secret')
          ),
          body := jsonb_build_object('batch_size', %s),
          timeout_milliseconds := 10000
        ) as request_id;
      $cron$, v_batch)
    );
  end if;
end;
$$;

revoke all on function public.automation_enable_worker(text, integer) from public;
grant execute on function public.automation_enable_worker(text, integer) to service_role;

do $$
begin
  -- The worker cron job is intentionally not auto-enabled in migrations,
  -- because the `arx_project_url` value is environment-specific.
end;
$$;
