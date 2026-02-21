-- Harden community_memory_candidate_propose with strict evidence provenance validation.
-- Every evidence item must resolve to a concrete in-community source row.

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
  v_item jsonb;
  v_item_source_type text;
  v_item_source_id_text text;
  v_item_source_uuid uuid;
  v_item_key text;
  v_seen_source_keys text[] := array[]::text[];
  v_canonical_items jsonb := '[]'::jsonb;
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

  v_has_evidence := coalesce(
    jsonb_typeof(v_evidence -> 'items') = 'array'
    and jsonb_array_length(v_evidence -> 'items') > 0,
    false
  );

  if not v_has_evidence then
    raise exception 'evidence.items must contain at least one item' using errcode = '22023';
  end if;

  if not public.has_active_entitlement(p_community_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_evidence -> 'items')
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'evidence.items[] entries must be objects' using errcode = '22023';
    end if;

    v_item_source_type := lower(btrim(coalesce(v_item ->> 'source_type', '')));
    if v_item_source_type not in ('chat', 'resource', 'memory') then
      raise exception 'evidence.items[].source_type must be chat|resource|memory' using errcode = '22023';
    end if;

    v_item_source_id_text := nullif(
      btrim(
        coalesce(
          v_item ->> 'internal_source_id',
          v_item ->> 'source_id',
          ''
        )
      ),
      ''
    );
    if v_item_source_id_text is null then
      raise exception 'evidence.items[].source_id is required' using errcode = '22023';
    end if;

    begin
      v_item_source_uuid := v_item_source_id_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'evidence.items[].source_id must be a valid uuid' using errcode = '22023';
    end;

    if v_item_source_type = 'chat' then
      if not exists (
        select 1
          from public.messages m
          join public.threads t on t.id = m.thread_id
         where m.id = v_item_source_uuid
           and t.community_id = p_community_id
           and t.engine_id = 'community_chat'
      ) then
        raise exception 'evidence.items[] contains chat source outside active community' using errcode = '22023';
      end if;
    elsif v_item_source_type = 'resource' then
      if not exists (
        select 1
          from public.community_resources r
         where r.id = v_item_source_uuid
           and r.community_id = p_community_id
      ) then
        raise exception 'evidence.items[] contains resource source outside active community' using errcode = '22023';
      end if;
    else
      if not exists (
        select 1
          from public.community_memory_items m
         where m.id = v_item_source_uuid
           and m.community_id = p_community_id
      ) then
        raise exception 'evidence.items[] contains memory source outside active community' using errcode = '22023';
      end if;
    end if;

    v_item_key := v_item_source_type || ':' || v_item_source_uuid::text;
    if v_item_key = any(v_seen_source_keys) then
      continue;
    end if;
    v_seen_source_keys := array_append(v_seen_source_keys, v_item_key);

    v_item := jsonb_set(v_item - 'internal_source_id', '{source_type}', to_jsonb(v_item_source_type), true);
    v_item := jsonb_set(v_item, '{source_id}', to_jsonb(v_item_source_uuid::text), true);
    v_canonical_items := v_canonical_items || jsonb_build_array(v_item);
  end loop;

  if jsonb_array_length(v_canonical_items) = 0 then
    raise exception 'evidence.items must contain at least one unique item' using errcode = '22023';
  end if;
  v_evidence := jsonb_set(v_evidence, '{items}', v_canonical_items, false);

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
$$;;
