-- Fix PL/pgSQL lint ambiguity in join_public_community by avoiding
-- ON CONFLICT(column_list) where RETURN TABLE exposes same column names.

create or replace function public.join_public_community(
  p_community_id uuid,
  p_brandos_aid uuid default null::uuid
) returns table(community_id uuid, community_slug text, community_name text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_requires_approval boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;

  select coalesce(c.free_join_requires_approval, false)
    into v_requires_approval
    from public.communities c
   where c.id = p_community_id
     and c.visibility = 'unlisted'
   limit 1;

  if not found then
    raise exception 'Community is not open for free joins' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.plans p
     where p.community_id = p_community_id
       and p.is_active = true
       and p.billing_period in ('monthly', 'yearly')
       and p.visibility in ('published', 'unlisted')
  ) then
    raise exception 'paid_plan_required' using errcode = '22023';
  end if;

  if v_requires_approval then
    raise exception 'approval_required' using errcode = '22023';
  end if;

  if p_brandos_aid is not null then
    perform set_config('arx.brandos_aid', p_brandos_aid::text, true);
  end if;

  insert into public.community_memberships (community_id, user_id, role)
  values (p_community_id, auth.uid(), 'member')
  on conflict on constraint community_memberships_community_id_user_id_key do nothing;

  update public.entitlements
     set source = 'public_join',
         source_ref = p_community_id::text,
         starts_at = least(entitlements.starts_at, v_now),
         ends_at = null
   where entitlements.user_id = auth.uid()
     and entitlements.community_id = p_community_id
     and entitlements.ends_at is not null
     and entitlements.ends_at <= v_now;

  if not found then
    begin
      insert into public.entitlements (
        user_id,
        community_id,
        source,
        source_ref,
        starts_at,
        ends_at
      ) values (
        auth.uid(),
        p_community_id,
        'public_join',
        p_community_id::text,
        v_now,
        null
      );
    exception
      when unique_violation then
        null;
    end;
  end if;

  return query
  select c.id, c.slug, c.name
    from public.communities c
   where c.id = p_community_id;
end;
$$;

alter function public.join_public_community(uuid, uuid) owner to postgres;
