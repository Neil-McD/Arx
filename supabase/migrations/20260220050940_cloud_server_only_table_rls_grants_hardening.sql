-- Hardening: enforce server-only posture for sensitive community/inference/provider tables.
--
-- Goals:
-- - Enable RLS on all target tables.
-- - Reset policies to explicit service_role-only access.
-- - Remove broad table grants from public/anon/authenticated.

alter table public.community_context_items enable row level security;
alter table public.community_context_state enable row level security;
alter table public.edge_rate_limits enable row level security;
alter table public.user_platform_inference_usage enable row level security;
alter table public.user_provider_keys enable row level security;

do $$
declare
  v_table text;
  v_policy text;
begin
  for v_table in
    select unnest(array[
      'community_context_items',
      'community_context_state',
      'edge_rate_limits',
      'user_platform_inference_usage',
      'user_provider_keys'
    ])
  loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    end loop;
  end loop;
end
$$;

create policy community_context_items_service_role_all
on public.community_context_items
for all
to service_role
using (true)
with check (true);

create policy community_context_state_service_role_all
on public.community_context_state
for all
to service_role
using (true)
with check (true);

create policy edge_rate_limits_service_role_all
on public.edge_rate_limits
for all
to service_role
using (true)
with check (true);

create policy user_platform_inference_usage_service_role_all
on public.user_platform_inference_usage
for all
to service_role
using (true)
with check (true);

create policy user_provider_keys_service_role_all
on public.user_provider_keys
for all
to service_role
using (true)
with check (true);

revoke all on table public.community_context_items from public;
revoke all on table public.community_context_items from anon;
revoke all on table public.community_context_items from authenticated;
grant all on table public.community_context_items to service_role;

revoke all on table public.community_context_state from public;
revoke all on table public.community_context_state from anon;
revoke all on table public.community_context_state from authenticated;
grant all on table public.community_context_state to service_role;

revoke all on table public.edge_rate_limits from public;
revoke all on table public.edge_rate_limits from anon;
revoke all on table public.edge_rate_limits from authenticated;
grant all on table public.edge_rate_limits to service_role;

revoke all on table public.user_platform_inference_usage from public;
revoke all on table public.user_platform_inference_usage from anon;
revoke all on table public.user_platform_inference_usage from authenticated;
grant all on table public.user_platform_inference_usage to service_role;

revoke all on table public.user_provider_keys from public;
revoke all on table public.user_provider_keys from anon;
revoke all on table public.user_provider_keys from authenticated;
grant all on table public.user_provider_keys to service_role;;
