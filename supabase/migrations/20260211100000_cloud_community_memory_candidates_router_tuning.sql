-- Tune memory candidate routing to reduce false rejects and add explicit admin reject RPC.

create or replace function public.route_community_memory_candidate(
  p_memory_text text
)
returns table(
  router_state text,
  signal_score integer,
  router_reason text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_memory_text, ''));
  v_lower text;
  v_word_count integer := 0;
begin
  if v_text = '' then
    return query select 'rejected'::text, 0::integer, 'empty_candidate'::text;
    return;
  end if;

  v_lower := lower(v_text);
  v_word_count := coalesce(array_length(regexp_split_to_array(v_text, '\\s+'), 1), 0);

  -- Hard reject only when content strongly resembles pasted credential material.
  if v_text ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
     or v_lower ~ '(^|[^a-z0-9])(sk-[a-z0-9]{20,}|ghp_[a-z0-9]{30,}|xox[baprs]-[a-z0-9-]{20,})([^a-z0-9]|$)'
     or v_text ~ '[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}'
  then
    return query select 'rejected'::text, 5::integer, 'sensitive_token_pattern'::text;
    return;
  end if;

  -- Route suspicious-but-ambiguous content to review instead of rejecting.
  if v_lower ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
     or v_lower ~* '(^|[^a-z])(api[_-]?key|access[_-]?token|password|secret|token)([^a-z]|$)'
  then
    return query select 'needs_review'::text, 36::integer, 'sensitive_review'::text;
    return;
  end if;

  if char_length(v_text) < 80 or v_word_count < 12 then
    return query select 'needs_review'::text, 45::integer, 'low_signal'::text;
    return;
  end if;

  if char_length(v_text) >= 240 and v_word_count >= 28 then
    return query select 'auto_promoted'::text, 88::integer, 'high_signal_auto_promote'::text;
    return;
  end if;

  return query select 'needs_review'::text, 68::integer, 'requires_admin_review'::text;
end;
$$;
create or replace function public.community_memory_candidate_reject(
  p_candidate_id uuid,
  p_reason text default null
)
returns table(
  candidate_id uuid,
  rejected_at timestamptz,
  router_state text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_candidate public.community_memory_candidates%rowtype;
  v_rejected_at timestamptz;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_candidate_id is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  select *
    into v_candidate
    from public.community_memory_candidates c
   where c.id = p_candidate_id
   limit 1;

  if v_candidate.id is null then
    raise exception 'candidate_not_found' using errcode = '22023';
  end if;

  if not public.has_active_entitlement_role(v_candidate.community_id, array['owner','admin','mod']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_candidate.promoted_memory_id is not null then
    raise exception 'candidate_already_promoted' using errcode = '22023';
  end if;

  if v_candidate.router_state = 'rejected' then
    return query select v_candidate.id, coalesce(v_candidate.reviewed_at, now()), 'rejected'::text;
    return;
  end if;

  update public.community_memory_candidates
     set router_state = 'rejected',
         reviewed_by = v_user_id,
         reviewed_at = now(),
         router_reason = coalesce(v_reason, router_reason, 'admin_rejected'),
         updated_at = now()
   where id = v_candidate.id
   returning reviewed_at into v_rejected_at;

  return query select v_candidate.id, coalesce(v_rejected_at, now()), 'rejected'::text;
end;
$$;
revoke all on function public.community_memory_candidate_reject(uuid, text) from public;
revoke all on function public.community_memory_candidate_reject(uuid, text) from anon;
revoke all on function public.community_memory_candidate_reject(uuid, text) from authenticated;
revoke all on function public.community_memory_candidate_reject(uuid, text) from service_role;
grant execute on function public.community_memory_candidate_reject(uuid, text) to authenticated;
grant execute on function public.community_memory_candidate_reject(uuid, text) to service_role;
