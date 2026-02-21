CREATE OR REPLACE FUNCTION "public"."community_search"(
  "p_user_id" "uuid",
  "p_community_id" "uuid",
  "p_query" "text" DEFAULT NULL::"text",
  "p_limit" integer DEFAULT 8
) RETURNS TABLE(
  "source_kind" "text",
  "source_id" "uuid",
  "created_at" timestamp with time zone,
  "title" "text",
  "snippet" "text",
  "thread_id" "uuid",
  "sender_id" "uuid",
  "sender_display" "text",
  "resource_type" "text",
  "url" "text",
  "file_key" "text",
  "provenance" "jsonb"
)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  with params as (
    select greatest(1, least(coalesce(p_limit, 8), 20)) as lim
  ),
  chat_hits as (
    select
      'chat'::text as source_kind,
      c.message_id as source_id,
      c.created_at,
      null::text as title,
      c.snippet,
      c.thread_id,
      c.sender_id,
      c.sender_display,
      null::text as resource_type,
      null::text as url,
      null::text as file_key,
      jsonb_build_object(
        'kind', 'chat',
        'message_id', c.message_id,
        'thread_id', c.thread_id,
        'sender_id', c.sender_id,
        'sender_display', c.sender_display,
        'created_at', c.created_at
      ) as provenance
    from public.search_community_chat_snippets(
      p_user_id,
      p_community_id,
      p_query,
      (select lim from params)
    ) c
  ),
  resource_hits as (
    select
      case
        when coalesce(r.resource_type, 'post') = 'post' then 'memory'::text
        else 'resource'::text
      end as source_kind,
      r.resource_id as source_id,
      r.created_at,
      nullif(btrim(coalesce(r.title, '')), '') as title,
      r.snippet,
      null::uuid as thread_id,
      null::uuid as sender_id,
      null::text as sender_display,
      r.resource_type,
      r.url,
      r.file_key,
      jsonb_build_object(
        'kind', case when coalesce(r.resource_type, 'post') = 'post' then 'memory' else 'resource' end,
        'resource_id', r.resource_id,
        'resource_type', r.resource_type,
        'url', r.url,
        'file_key', r.file_key,
        'created_at', r.created_at
      ) as provenance
    from public.search_community_resource_snippets(
      p_user_id,
      p_community_id,
      p_query,
      (select lim from params)
    ) r
  ),
  combined as (
    select * from chat_hits
    union all
    select * from resource_hits
  )
  select
    c.source_kind,
    c.source_id,
    c.created_at,
    c.title,
    c.snippet,
    c.thread_id,
    c.sender_id,
    c.sender_display,
    c.resource_type,
    c.url,
    c.file_key,
    c.provenance
  from combined c
  where coalesce(btrim(c.snippet), '') <> ''
  order by c.created_at desc nulls last
  limit (select lim from params);
$$;


ALTER FUNCTION "public"."community_search"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) OWNER TO "postgres";


REVOKE ALL ON FUNCTION "public"."community_search"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_search"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_search"("p_user_id" "uuid", "p_community_id" "uuid", "p_query" "text", "p_limit" integer) TO "service_role";;
