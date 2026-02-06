-- Resolve remaining PL/pgSQL variable/column ambiguity in entitlements upserts.
-- We explicitly prefer table columns when names collide with OUT params.

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

    if position('#variable_conflict use_column' in lower(v_def)) = 0 then
      v_new := replace(
        v_def,
        E'AS $function$\ndeclare',
        E'AS $function$\n#variable_conflict use_column\ndeclare'
      );
    else
      v_new := v_def;
    end if;

    execute v_new;
  end loop;
end
$$;
