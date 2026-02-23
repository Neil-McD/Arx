-- Restore creator-only builder tier override for local/dev QA.
-- This is intentionally restricted to allowlisted creator emails.

create or replace function public.dev_set_my_builder_tier(p_builder_tier text)
returns text
language plpgsql
security definer
set search_path = 'public'
set row_security = 'off'
as $$
declare
  v_email text;
  v_tier text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select lower(coalesce(u.email, ''))
    into v_email
    from auth.users u
   where u.id = auth.uid()
   limit 1;

  if v_email not in ('neilmcdevittd@gmail.com', 'neilmcdevitt@gmail.com') then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_tier := lower(btrim(coalesce(p_builder_tier, '')));
  if v_tier = 'architect' then
    v_tier := 'pro';
  end if;
  if v_tier not in ('free', 'builder', 'pro') then
    raise exception 'invalid_builder_tier' using errcode = '22023';
  end if;

  insert into public.profiles(user_id, builder_tier, created_at, updated_at)
  values (auth.uid(), v_tier, now(), now())
  on conflict (user_id) do update
    set builder_tier = excluded.builder_tier,
        updated_at = now();

  return v_tier;
end;
$$;

alter function public.dev_set_my_builder_tier(text) owner to postgres;

revoke all on function public.dev_set_my_builder_tier(text) from public;
grant all on function public.dev_set_my_builder_tier(text) to authenticated;
grant all on function public.dev_set_my_builder_tier(text) to service_role;

