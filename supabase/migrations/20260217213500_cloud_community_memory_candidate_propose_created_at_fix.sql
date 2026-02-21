-- Fix ambiguous created_at reference in community_memory_candidate_propose.
-- This preserves existing behavior and signature while making INSERT .. RETURNING deterministic.

create or replace function public.community_memory_candidate_propose(
  p_community_id uuid,
  p_title text default null,
  p_memory_text text default null,
  p_evidence jsonb default null,
  p_request_key text default null
)
returns table(
  candidate_id uuid,
  router_state text,
  signal_score integer,
  router_reason text,
  promoted_memory_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_memory_text text := nullif(btrim(coalesce(p_memory_text, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_evidence jsonb := coalesce(p_evidence, '{}'::jsonb);
  v_request_key text := nullif(btrim(coalesce(p_request_key, '')), '');
  v_has_evidence boolean := false;
  v_router_state text;
  v_signal_score integer;
  v_router_reason text;
  v_candidate_id uuid;
  v_created_at timestamptz;
  v_promoted_memory_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_community_id is null then
    raise exception 'community_id is required' using errcode = '22023';
  end if;
  if v_memory_text is null then
    raise exception 'memory_text is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_evidence) is distinct from 'object' then
    raise exception 'evidence must be an object' using errcode = '22023';
  end if;

  v_has_evidence :=
    jsonb_typeof(v_evidence -> 'items') = 'array'
    and jsonb_array_length(v_evidence -> 'items') > 0;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_request_key is not null then
    select c.id, c.router_state, c.signal_score, c.router_reason, c.promoted_memory_id, c.created_at
      into v_candidate_id, v_router_state, v_signal_score, v_router_reason, v_promoted_memory_id, v_created_at
      from public.community_memory_candidates c
     where c.community_id = p_community_id
       and c.proposer_user_id = v_user_id
       and c.request_key = v_request_key
     order by c.created_at desc
     limit 1;

    if v_candidate_id is not null then
      return query
      select v_candidate_id, v_router_state, v_signal_score, v_router_reason, v_promoted_memory_id, v_created_at;
      return;
    end if;
  end if;

  select d.router_state, d.signal_score, d.router_reason
    into v_router_state, v_signal_score, v_router_reason
    from public.route_community_memory_candidate(v_memory_text) d
   limit 1;

  if v_router_state = 'auto_promoted' and not v_has_evidence then
    v_router_state := 'needs_review';
    v_signal_score := least(coalesce(v_signal_score, 68), 68);
    v_router_reason := 'requires_review_missing_evidence';
  end if;

  insert into public.community_memory_candidates(
    community_id,
    proposer_user_id,
    title,
    memory_text,
    evidence_json,
    request_key,
    router_state,
    signal_score,
    router_reason
  )
  values (
    p_community_id,
    v_user_id,
    v_title,
    v_memory_text,
    v_evidence,
    v_request_key,
    v_router_state,
    coalesce(v_signal_score, 0),
    v_router_reason
  )
  returning public.community_memory_candidates.id, public.community_memory_candidates.created_at
    into v_candidate_id, v_created_at;

  if v_router_state = 'auto_promoted' then
    insert into public.community_memory_items(
      community_id,
      title,
      content_md,
      pinned,
      source,
      source_candidate_id,
      router_signal_score,
      metadata_json,
      created_by
    )
    values (
      p_community_id,
      public.derive_community_memory_title(v_title, v_memory_text),
      v_memory_text,
      false,
      'candidate_auto',
      v_candidate_id,
      v_signal_score,
      jsonb_build_object(
        'router_reason', v_router_reason,
        'evidence', v_evidence,
        'source', 'community_memory_candidate_propose'
      ),
      v_user_id
    )
    returning id into v_promoted_memory_id;

    update public.community_memory_candidates
       set promoted_memory_id = v_promoted_memory_id,
           reviewed_by = v_user_id,
           reviewed_at = now(),
           updated_at = now()
     where id = v_candidate_id;
  end if;

  return query
  select v_candidate_id, v_router_state, coalesce(v_signal_score, 0), v_router_reason, v_promoted_memory_id, v_created_at;
end;
$$;
