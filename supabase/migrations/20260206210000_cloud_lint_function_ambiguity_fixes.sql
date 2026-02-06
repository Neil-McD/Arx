-- Fix SQL lint errors caused by PL/pgSQL variable/column ambiguity in RPCs.
-- No behavioral changes intended; this is a parser-stability hardening pass.

do $$
declare
  v_target regprocedure;
  v_def text;
  v_new text;
begin
  foreach v_target in array array[
    'public.join_public_community(uuid,uuid)'::regprocedure,
    'public.accept_community_invite(text)'::regprocedure,
    'public.approve_community_join_request(uuid)'::regprocedure,
    'public.redeem_purchase_claim(text)'::regprocedure,
    'public.redeem_pending_purchase_claims()'::regprocedure,
    'public.set_member_role(uuid,uuid,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_target) into v_def;
    v_new := replace(
      v_def,
      'on conflict (community_id, user_id)',
      'on conflict on constraint community_memberships_community_id_user_id_key'
    );

    if v_new = v_def then
      raise exception 'expected community_memberships conflict clause not found in %', v_target::text;
    end if;

    execute v_new;
  end loop;
end
$$;

do $$
declare
  v_target regprocedure := 'public.capture_community_funnel_lead_by_slug(text,text,text,text,uuid,jsonb)'::regprocedure;
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;
  v_new := replace(
    v_def,
    'on conflict (community_id, email)',
    'on conflict on constraint community_funnel_leads_community_id_email_key'
  );

  if v_new = v_def then
    raise exception 'expected funnel lead conflict clause not found in %', v_target::text;
  end if;

  execute v_new;
end
$$;

do $$
declare
  v_target regprocedure;
  v_def text;
  v_new text;
begin
  foreach v_target in array array[
    'public.get_community_funnel_config(uuid)'::regprocedure,
    'public.save_community_funnel_config(uuid,boolean,jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(v_target) into v_def;
    v_new := replace(
      v_def,
      'on conflict (community_id)',
      'on conflict on constraint community_funnel_configs_pkey'
    );

    if v_new = v_def then
      raise exception 'expected funnel config conflict clause not found in %', v_target::text;
    end if;

    execute v_new;
  end loop;
end
$$;

do $$
declare
  v_target regprocedure := 'public.create_automation_endpoint(uuid,text,text,text[],boolean,boolean)'::regprocedure;
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;
  v_new := replace(
    v_def,
    'where id = v_endpoint.id',
    'where automation_endpoints.id = v_endpoint.id'
  );

  if v_new = v_def then
    raise exception 'expected automation endpoint where-clause not found in %', v_target::text;
  end if;

  execute v_new;
end
$$;

do $$
declare
  v_target regprocedure := 'public.update_automation_endpoint(uuid,text,text,boolean,text[],boolean)'::regprocedure;
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;
  v_new := replace(
    v_def,
    'where id = p_endpoint_id',
    'where automation_endpoints.id = p_endpoint_id'
  );

  if v_new = v_def then
    raise exception 'expected automation endpoint update where-clause not found in %', v_target::text;
  end if;

  execute v_new;
end
$$;

-- random_affiliate_code uses gen_random_bytes(), which resolves from extensions.
alter function public.random_affiliate_code(integer)
  set search_path = public, extensions, pg_temp;
