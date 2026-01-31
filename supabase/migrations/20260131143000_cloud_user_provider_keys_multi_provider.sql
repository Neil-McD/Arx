-- Expand BYO provider keys beyond OpenRouter.
--
-- Intent:
-- - Support cross-device sync for per-provider keys (desktop + future web).
-- - Keep storage in Vault (no plaintext in public tables).
-- - Keep RPCs server-only (service_role execute only).

create or replace function public.upsert_user_provider_key_secret(
  p_user_id uuid,
  p_provider text,
  p_api_key text
) returns void
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_key text := btrim(coalesce(p_api_key, ''));
  v_row public.user_provider_keys%rowtype;
  v_secret_name text;
  v_secret_id uuid;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  if v_key = '' then
    raise exception 'key_required' using errcode = '22023';
  end if;

  v_secret_name := format('user_provider_keys:%s:%s', v_user_id::text, v_provider);

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if found and v_row.vault_secret_id is not null then
    perform vault.update_secret(v_row.vault_secret_id, v_key, v_secret_name, 'User provider key', null);
    update public.user_provider_keys
      set vault_secret_id = v_row.vault_secret_id,
          api_key = null,
          updated_at = now()
    where id = v_row.id;
    return;
  end if;

  v_secret_id := vault.create_secret(v_key, v_secret_name, 'User provider key', null);

  insert into public.user_provider_keys(user_id, provider, api_key, vault_secret_id)
  values (v_user_id, v_provider, null, v_secret_id)
  on conflict (user_id, provider) do update
    set api_key = null,
        vault_secret_id = excluded.vault_secret_id,
        updated_at = now();
end $$;

create or replace function public.clear_user_provider_key_secret(
  p_user_id uuid,
  p_provider text
) returns void
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_row public.user_provider_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if not found then
    return;
  end if;

  delete from public.user_provider_keys
   where id = v_row.id;

  if v_row.vault_secret_id is not null then
    delete from vault.secrets
     where id = v_row.vault_secret_id;
  end if;
end $$;

create or replace function public.read_user_provider_key_secret(
  p_user_id uuid,
  p_provider text,
  p_reveal boolean default false
) returns table(
  has_key boolean,
  updated_at timestamptz,
  api_key text
)
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_user_id uuid := p_user_id;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_row public.user_provider_keys%rowtype;
  v_secret text := null;
begin
  if v_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_provider = 'xai' then
    v_provider := 'x-ai';
  end if;

  if v_provider not in ('openrouter', 'openai', 'anthropic', 'google', 'x-ai') then
    raise exception 'unsupported_provider' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.user_provider_keys
   where user_id = v_user_id
     and provider = v_provider
   limit 1;

  if not found then
    return query select false, null::timestamptz, null::text;
    return;
  end if;

  if p_reveal then
    if v_row.vault_secret_id is not null then
      select ds.decrypted_secret
        into v_secret
        from vault.decrypted_secrets ds
       where ds.id = v_row.vault_secret_id
       limit 1;
    else
      v_secret := v_row.api_key;
    end if;
  end if;

  return query
  select
    true,
    v_row.updated_at,
    nullif(v_secret, '');
end $$;

revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from public;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from anon;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from authenticated;
revoke all on function public.upsert_user_provider_key_secret(uuid, text, text) from service_role;
grant execute on function public.upsert_user_provider_key_secret(uuid, text, text) to service_role;

revoke all on function public.clear_user_provider_key_secret(uuid, text) from public;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from anon;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from authenticated;
revoke all on function public.clear_user_provider_key_secret(uuid, text) from service_role;
grant execute on function public.clear_user_provider_key_secret(uuid, text) to service_role;

revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from public;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from anon;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from authenticated;
revoke all on function public.read_user_provider_key_secret(uuid, text, boolean) from service_role;
grant execute on function public.read_user_provider_key_secret(uuid, text, boolean) to service_role;

