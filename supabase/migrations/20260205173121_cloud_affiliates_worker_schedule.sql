-- Affiliate payouts worker: schedule via pg_cron + pg_net.
--
-- Post-provision (service_role):
--   -- One-time: set project URL (reused from automations worker):
--   select public.automation_set_project_url('https://<PROJECT_REF>.supabase.co');
--   -- Enable affiliate payouts worker (daily at 2am UTC by default):
--   select public.affiliate_enable_worker();

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'affiliate_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'affiliate_worker_secret',
      'Arx affiliate payouts worker secret',
      null
    );
  end if;
end;
$$;

create or replace function public.affiliate_worker_secret()
returns table(secret text)
language sql
security definer
set search_path = public, vault
set row_security = off
as $$
  select decrypted_secret as secret
  from vault.decrypted_secrets
  where name = 'affiliate_worker_secret'
  limit 1;
$$;

revoke all on function public.affiliate_worker_secret() from public;
grant execute on function public.affiliate_worker_secret() to service_role;

create or replace function public.affiliate_enable_worker(
  p_schedule text default '0 2 * * *',
  p_max_affiliates integer default 25
)
returns void
language plpgsql
security definer
set search_path = public, vault, cron, net
set row_security = off
as $$
declare
  v_max integer := coalesce(p_max_affiliates, 25);
  v_url text;
  v_schedule text := trim(coalesce(p_schedule, ''));
begin
  if v_max < 1 or v_max > 200 then
    raise exception 'invalid max affiliates: %', v_max;
  end if;

  if v_schedule = '' then
    v_schedule := '0 2 * * *';
  end if;

  select decrypted_secret
  into v_url
  from vault.decrypted_secrets
  where name = 'arx_project_url'
  limit 1;

  if trim(coalesce(v_url, '')) = '' then
    raise exception 'arx_project_url is not set; call automation_set_project_url(...) first';
  end if;

  if not exists (select 1 from cron.job where jobname = 'arx_affiliate_worker') then
    perform cron.schedule(
      'arx_affiliate_worker',
      v_schedule,
      format($cron$
      select
        net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'arx_project_url') || '/functions/v1/affiliate_worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-arx-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'affiliate_worker_secret')
          ),
          body := jsonb_build_object('max_affiliates', %s),
          timeout_milliseconds := 20000
        ) as request_id;
      $cron$, v_max)
    );
  end if;
end;
$$;

revoke all on function public.affiliate_enable_worker(text, integer) from public;
grant execute on function public.affiliate_enable_worker(text, integer) to service_role;

do $$
begin
  -- The worker cron job is intentionally not auto-enabled in migrations,
  -- because the `arx_project_url` value is environment-specific.
end;
$$;

