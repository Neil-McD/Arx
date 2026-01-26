-- Automations worker: schedule deliveries via pg_cron + pg_net.
--
-- - Creates a vault-backed worker secret.
-- - Exposes the secret to Edge Functions via a service_role-only RPC.
-- - Schedules periodic invocations of `automations_worker` with the secret header.
--
-- NOTE: `arx_project_url` is environment-specific. Update it if you run this schema
-- on a different Supabase project.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'arx_project_url') then
    perform vault.create_secret(
      'https://pbjgkggfcpxewhsmgveu.supabase.co',
      'arx_project_url',
      'Arx project URL (used for scheduled Edge Function calls)',
      null
    );
  end if;

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

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'arx_automations_worker') then
    perform cron.schedule(
      'arx_automations_worker',
      '* * * * *',
      $cron$
      select
        net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'arx_project_url') || '/functions/v1/automations_worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-arx-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'automations_worker_secret')
          ),
          body := jsonb_build_object('batch_size', 25),
          timeout_milliseconds := 10000
        ) as request_id;
      $cron$
    );
  end if;
end;
$$;

