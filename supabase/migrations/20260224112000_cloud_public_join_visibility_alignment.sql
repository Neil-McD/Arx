-- Align public landing/join behavior with canonical visibility model.
-- Published communities must support free join when no paid plans and no approval gate.

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
     and c.visibility in ('published', 'public', 'unlisted')
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
       and p.visibility in ('published', 'public', 'unlisted')
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

create or replace function public.get_public_community_funnel_by_slug(
  p_community_slug text
) returns table(
  community_id uuid,
  slug text,
  name text,
  description text,
  avatar_url text,
  banner_url text,
  visibility text,
  free_join_requires_approval boolean,
  join_mode text,
  active_plans jsonb,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_slug text;
  v_community public.communities%rowtype;
  v_has_paid_plans boolean := false;
  v_active_plans jsonb := '[]'::jsonb;
  v_join_mode text := 'request_access';
begin
  v_slug := lower(btrim(coalesce(p_community_slug, '')));
  if v_slug = '' then
    raise exception 'community_slug is required' using errcode = '22023';
  end if;

  select *
    into v_community
    from public.communities c
   where c.slug = v_slug
     and c.visibility in ('published', 'public', 'unlisted')
   limit 1;

  if not found then
    raise exception 'community_not_found' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.plans p
     where p.community_id = v_community.id
       and p.is_active = true
       and p.billing_period in ('monthly', 'yearly')
       and p.visibility in ('published', 'public', 'unlisted')
  )
    into v_has_paid_plans;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'description', p.description,
               'amount_base_units', p.amount_base_units,
               'currency', p.currency,
               'currency_decimals', p.currency_decimals,
               'billing_period', p.billing_period
             )
             order by case when p.billing_period = 'monthly' then 0 else 1 end
           ),
           '[]'::jsonb
         )
    into v_active_plans
    from public.plans p
   where p.community_id = v_community.id
     and p.is_active = true
     and p.billing_period in ('monthly', 'yearly')
     and p.visibility in ('published', 'public', 'unlisted');

  if v_has_paid_plans then
    v_join_mode := 'checkout';
  elsif coalesce(v_community.free_join_requires_approval, false) then
    v_join_mode := 'request_access';
  else
    v_join_mode := 'join_free';
  end if;

  return query
  select
    v_community.id,
    v_community.slug,
    v_community.name,
    v_community.description,
    v_community.avatar_url,
    v_community.banner_url,
    v_community.visibility,
    coalesce(v_community.free_join_requires_approval, false),
    v_join_mode,
    v_active_plans,
    v_community.updated_at,
    v_community.created_at;
end;
$$;

alter function public.get_public_community_funnel_by_slug(text) owner to postgres;
