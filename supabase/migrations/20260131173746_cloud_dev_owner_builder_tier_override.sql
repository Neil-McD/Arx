-- Dev-only override: allow the Arx owner account to change their builder tier.
--
-- This exists purely to test gated UX in dev without going through billing flows.
-- Server-side enforcement ensures only the Arx owner can execute it.

create or replace function public.dev_set_my_builder_tier(p_builder_tier text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_tier text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- NOTE: hardcoded to the Arx owner email. Adjust if your owner account changes.
  select lower(coalesce(u.email, ''))
    into v_email
    from auth.users u
   where u.id = auth.uid()
   limit 1;

  if v_email <> 'neilmcdevittd@gmail.com' then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_tier := lower(btrim(coalesce(p_builder_tier, '')));
  if v_tier not in ('free', 'builder', 'pro') then
    raise exception 'invalid_builder_tier' using errcode = '22023';
  end if;

  update public.profiles
     set builder_tier = v_tier,
         updated_at = now()
   where user_id = auth.uid();

  return v_tier;
end;
$$;

revoke all on function public.dev_set_my_builder_tier(text) from public;
revoke all on function public.dev_set_my_builder_tier(text) from anon;
revoke all on function public.dev_set_my_builder_tier(text) from authenticated;
revoke all on function public.dev_set_my_builder_tier(text) from service_role;
grant execute on function public.dev_set_my_builder_tier(text) to authenticated;
grant execute on function public.dev_set_my_builder_tier(text) to service_role;

