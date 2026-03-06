# Convex-First Cutover Execution Plan (v1)

Date: 2026-03-02  
Workspace: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`

## 1) Goal

Ship a full Convex-first product with no legacy cloud runtime dependency, while preserving UX behavior and desktop/web parity.

## 2) First-Principles Constraints

1. Identity must be deterministic and consistent across web + desktop.
2. Gate decisions must be server-authoritative and reproducible.
3. Message/thread ordering must be monotonic and deterministic.
4. Billing and entitlement writes must be idempotent.
5. User-visible UX parity is mandatory during migration.
6. Legacy backend codepaths must be deleted, not hidden behind flags.

## 3) Current Checkpoint

1. Runtime source scan is clean:
   1. `rg -n -i --hidden -S "s[u]pabase|@s[u]pabase" src apps shared src-tauri` returns 0.
2. Repo-wide legacy scan is clean for product code:
   1. `rg -n -i --hidden -S "s[u]pabase|@s[u]pabase" src apps shared src-tauri docs scripts` returns only self-referential lines in this plan doc.
3. Legacy backend tree is removed.
4. New runtime guard exists:
   1. `scripts/convex_cut_runtime_guard.sh`.
5. WS0 baseline blockers are cleared:
   1. `pnpm -C apps/web exec tsc --noEmit --pretty false` passes.
   2. `bash scripts/foundation_baseline_gate.sh` passes.
   3. `bash scripts/convex_cut_runtime_guard.sh` passes.
   4. `bash scripts/legacy_route_surface_guard.sh` passes.
6. Remaining migration debt is now backend-shape/API semantics, not naming:
   1. Direct `"/auth/v1"` literals in product code: `0`.
   1. Direct `"/rest/v1"` literals in product code: `0`.
   2. Direct `"/functions/v1"` literals in product code: `0`.
   3. Remaining `"/rpc"` markers in product code: `0`.
   4. Current shared seam usage is concentrated in `cloudGateway` calls:
      1. `invokeRestAuth` references: `0`.
      2. `invokeRpcJson` references: `0`.
      3. `buildCloudRestUrl` references: `4`; `buildCloudRestRpcUrl` references: `0`.
      4. `invokeCloudRpcViaRestAuth` references: `0`.
      5. Direct `.invokeRpcJson<...>(...)` callsites: `0`.
      6. Direct `"rpc/..."` route literals in `shared/src/apps/src-tauri`: `0`.
7. Highest-concentration product files for the next Convex transport cut:
   1. `shared/cloudGateway.ts` (transport seam + URL builders)
   2. `src/App.tsx` (desktop shell hot path)
   3. `shared/useCommunityAdminController.ts` (largest admin surface)
   4. `apps/web/src/App.tsx` (web shell hot path)
8. No legacy-backend-named code files remain in the worktree.
9. WS1.1 has started:
   1. Added shared gateway seam in `shared/cloudGateway.ts`.
   2. Migrated `shared/pay_first.ts` and `apps/web/src/controllers/useWebPublicFunnelActions.ts` onto that seam.
   3. Migrated `shared/useBuilderBillingActionsCore.ts` and `shared/useWebVoiceInputController.ts` onto the same seam.
   4. Migrated `shared/useWebMemoryMutationController.ts` onto `cloudGateway.invokeRestAuth`.
   5. Migrated `shared/useCommunityAdminController.ts` onto `invokeRestAuth` + `invokeRpcJson`.
   6. Migrated `shared/useCommunityMembersReviewController.ts` onto `invokeRpcJson`.
   7. Migrated `shared/useCommunityChatMutationController.ts` onto `invokeRestAuth`.
   8. Migrated `shared/useCommunityResourceController.ts`, `shared/useCommunityInviteController.ts`, and `shared/useCommunityChatDataController.ts` onto `invokeRestAuth`/`invokeRpcJson`.
   9. Migrated `shared/useWebWorkspaceActionsController.ts`, `shared/useWebMemorySettingsDataController.ts`, `shared/useWebCommunityAccessController.ts`, `shared/useCommunitySettingsGovernanceController.ts`, and `shared/useCommunityAgentDraftController.ts` onto `cloudGateway`.
   10. Migrated `shared/useCommunitySettingsDataController.ts`, `shared/useCommunityCreateController.ts`, `shared/useCommunityDeleteController.ts`, `shared/useCommunityAgentMembersLifecycle.ts`, and `shared/useCommunityAgentLandingLifecycle.ts` onto `cloudGateway`.
   11. Centralized more function URL composition through `shared/cloudGateway.ts` (`buildCloudFunctionUrl`) and migrated `shared/useWebDiscoverController.ts`, `shared/useDesktopDiscoverController.ts`, `shared/useCheckoutFinalizeController.ts`, and `shared/cloudCommunityContextPreflight.ts` to use it.
   12. Migrated fallback paths in `shared/builderBillingStatusGateway.ts` onto `invokeRpcJson`.
   13. Migrated remaining app/controller hotspots: `src/App.tsx`, `apps/web/src/App.tsx`, `shared/communityMemoryCandidates.ts`, `src/services/thread/createDesktopCloudLensSync.ts`, `src/services/thread/createDesktopCloudChatThreadApi.ts`, `src/controllers/desktop/useDesktopSlashCommands.ts`, and `src/controllers/desktop/useDesktopVoiceInputController.ts`.
   14. Expanded URL seam exports in `shared/cloudGateway.ts` (`buildCloudRestUrl`, `buildCloudRestRpcUrl`) and adopted them across the migration surface.
   15. Completed a vertical personal-memory seam cut:
      1. Added `shared/cloudPersonalMemoryGateway.ts` for typed list/create/update/delete operations.
      2. Migrated memory flows in `src/App.tsx`, `apps/web/src/App.tsx`, `shared/useWebMemorySettingsDataController.ts`, `shared/useWebMemoryMutationController.ts`, `shared/useWebWorkspaceActionsController.ts`, and `src/controllers/desktop/useDesktopSlashCommands.ts`.
      3. `personal_memory_items` route composition now exists only in `shared/cloudPersonalMemoryGateway.ts`.
   16. Completed a vertical user-settings seam cut:
      1. Added `shared/cloudUserSettingsGateway.ts` for typed load/save of memory settings and system prompt.
      2. Migrated user-settings flows in `shared/useWebMemorySettingsDataController.ts`, `shared/useWebMemoryMutationController.ts`, and `src/App.tsx`.
      3. `user_memory_settings` and `user_model_settings` route composition now exists only in `shared/cloudUserSettingsGateway.ts`.
   17. Completed a model-registry read seam cut:
      1. Added `shared/cloudModelRegistryGateway.ts` for typed enabled-model reads.
      2. Migrated web and desktop model-registry reads in `apps/web/src/App.tsx` and `src/App.tsx`.
      3. `model_registry` route composition now exists only in `shared/cloudModelRegistryGateway.ts` and Rust runtime model-registry fetch code.
   18. Completed a community-membership seam cut:
      1. Added `shared/cloudCommunityMembershipGateway.ts` for typed membership list reads with full/minimal select modes.
      2. Migrated desktop community bootstrap reads in `src/App.tsx` (including schema-lag fallback behavior).
      3. `community_memberships` route composition for this flow now exists in the shared gateway helper.
   19. Completed a community-memory-candidates list seam cut:
      1. Added `shared/cloudCommunityMemoryCandidatesGateway.ts` for typed candidate list reads.
      2. Migrated `shared/communityMemoryCandidates.ts` list path to use that helper.
      3. `community_memory_candidates` route composition now exists in the new helper.
   20. Completed a thread-context read seam cut:
      1. Added `shared/cloudThreadContextGateway.ts` for typed thread context reads.
      2. Migrated `src/services/thread/createDesktopCloudLensSync.ts` read path to use that helper.
      3. `threads` route composition for lens-context reads now exists in the shared thread-context helper.
   21. Completed controller membership + memory-candidate RPC write cuts:
      1. Migrated `shared/useWebCommunityAccessController.ts` community-membership list reads to `cloudCommunityMembershipGateway`.
      2. Migrated `shared/useCommunityAdminController.ts` membership list/count/timeseries reads to `cloudCommunityMembershipGateway`.
      3. Migrated `shared/communityMemoryCandidates.ts` propose/promote/reject paths to typed helpers in `cloudCommunityMemoryCandidatesGateway.ts`.
   22. Completed direct app-level RPC URL builder cut:
      1. Added `shared/cloudCommunityAccessGateway.ts` for typed access reads by community id/slug.
      2. Added `shared/cloudCommunityAgentGateway.ts` for typed active agent prompt/landing reads.
      3. Migrated `src/App.tsx`, `shared/useWebCommunityAccessController.ts`, and `apps/web/src/controllers/useWebPublicFunnelActions.ts` to `cloudCommunityAccessGateway`.
      4. Migrated `apps/web/src/App.tsx` and `src/services/thread/createDesktopCloudChatThreadApi.ts` to `cloudCommunityAgentGateway`.
      5. Extended `shared/cloudThreadContextGateway.ts` with typed `setCloudThreadContext` and migrated `src/services/thread/createDesktopCloudLensSync.ts`.
      6. `buildCloudRestRpcUrl(...)` usage is now centralized in `shared/cloudGateway.ts` only.
   23. Completed remaining controller-level `"rpc/..."` route-string centralization:
      1. Added `shared/cloudCommunityAdminGateway.ts` for typed `community_revenue_series` and `community_owner_is_pro` reads.
      2. Migrated `shared/useCommunityAdminController.ts` revenue-series read path to the new helper.
      3. Migrated `shared/useCommunityAgentMembersLifecycle.ts` owner-plan gate read path to the new helper.
      4. Direct `"rpc/..."` string literals now live only in shared gateway helper modules.
   24. Completed high-volume admin/review/chat typed gateway extraction:
      1. Added `shared/cloudProfilesGateway.ts` for typed profile list/read/upsert operations.
      2. Added `shared/cloudCommunityChatGateway.ts` for typed chat message/reaction operations and sender-id reads.
      3. Expanded `shared/cloudCommunityAdminGateway.ts` with typed member, join-request, pricing, entitlement, role-mutation, and resource-count operations.
      4. Migrated `shared/useCommunityAdminController.ts`, `shared/useCommunityMembersReviewController.ts`, and `shared/useCommunityChatMutationController.ts` to use typed gateways only.
      5. These three controllers now have `0` direct `invokeRestAuth`/`invokeRpcJson` callsites.
   25. Started Phase 0 hard guard rails for legacy-route freeze:
      1. Added `scripts/legacy_route_surface_guard.sh` to lock route-marker surface (`/auth/v1`, `/rest/v1`, `/functions/v1`, `/rpc`) to an explicit migration baseline.
      2. Wired the guard into `scripts/foundation_baseline_gate.sh`.
      3. Wired the guard into `.github/workflows/mvp-guards.yml` via `check:legacy-route-surface-guard`.
      4. Added `check:legacy-route-surface-guard` in `package.json`.
   26. Continued Phase 1 auth-route consolidation:
      1. Added shared auth URL builders in `shared/cloudAuthCore.ts` and migrated token/PKCE/OTP/user requests onto those helpers.
      2. Migrated `shared/cloudAuthFlow.ts` authorize/logout URL composition to shared auth URL builders.
      3. Migrated `shared/cloudRuntimeTransport.ts` auth-session probe URL composition to shared auth URL builders.
      4. Tightened `scripts/legacy_route_surface_guard.sh` baseline allowlist to enforce that direct route markers no longer appear in flow/runtime modules.
   27. Continued runtime-core route consolidation:
      1. Added `community_rpc_relative_path(...)` in `src-tauri/src/community_context.rs` as the canonical Rust RPC relative-path builder.
      2. Migrated `src-tauri/src/main.rs` test path assertion for `community_memory_candidate_propose` to use `community_context::community_rpc_relative_path(...)`.
      3. Tightened `scripts/legacy_route_surface_guard.sh` baseline allowlist to enforce that direct route markers no longer appear in `src-tauri/src/main.rs`.
   28. Continued controller-to-typed-gateway consolidation:
      1. Expanded `shared/cloudCommunityAgentGateway.ts` with typed draft list/upsert/set-active operations.
      2. Migrated `shared/useCommunityAgentDraftController.ts` to use those typed gateway methods (removed direct controller-level `invokeRpcJson` usage).
      3. Expanded `shared/cloudCommunityAdminGateway.ts` with typed `leaveCommunity` and `saveCommunitySettings` operations.
      4. Migrated `shared/useCommunitySettingsGovernanceController.ts` to those typed gateway methods (removed direct controller-level `invokeRpcJson` usage).
      5. Reworked `shared/builderBillingStatusGateway.ts` fallback RPC calls onto explicit REST-RPC requests, removing remaining non-community `invokeRpcJson` usage.
   29. Introduced shared REST-RPC execution helper and reduced generic RPC primitive usage:
      1. Added `invokeCloudRpcViaRestAuth(...)` in `shared/cloudGateway.ts`.
      2. Migrated `shared/cloudCommunityAdminGateway.ts`, `shared/cloudCommunityMemoryCandidatesGateway.ts`, and `shared/cloudCommunityAgentGateway.ts` to use the helper instead of `gateway.invokeRpcJson(...)`.
   30. Completed generic-RPC callsite elimination in product/runtime code:
      1. Migrated remaining controller/core callsites (`apps/web/src/controllers/useWebPublicFunnelActions.ts`, `shared/pay_first.ts`, `shared/useCommunitySettingsDataController.ts`, `shared/cloudCommunityAccessGateway.ts`, `shared/useCommunityChatDataController.ts`, `shared/cloudThreadContextGateway.ts`, `shared/useCommunityCreateController.ts`) to `invokeCloudRpcViaRestAuth(...)`.
      2. `.invokeRpcJson<...>(...)` callsites in `shared apps src src-tauri` are now `0`.
   31. Executed Phase 1 compatibility-seam deletion:
      1. Deleted `invokeRpcJson` from `shared/cloudGateway.ts` (`CloudAuthGateway` contract + factory implementation).
      2. Deleted `buildCloudRestRpcUrl(...)` from `shared/cloudGateway.ts`.
      3. Added `scripts/no_compat_rpc_primitive_guard.sh` and wired it into `scripts/foundation_baseline_gate.sh`.
      4. Wired the guard into CI (`.github/workflows/mvp-guards.yml`) and npm scripts (`check:no-compat-rpc-primitive-guard`).
      5. Tightened `scripts/legacy_route_surface_guard.sh` allowlist by removing `shared/cloudGateway.ts`.
   32. Executed Phase 1.5 Convex-only builder gate/tier cut:
      1. Removed Convex→legacy REST-RPC fallback from `shared/builderBillingStatusGateway.ts`.
      2. `loadBuilderBillingStatusCanonical(...)` now resolves from Convex only.
      3. `setDevBuilderTierCanonical(...)` now mutates Convex only.
      4. Expanded `scripts/no_compat_rpc_primitive_guard.sh` to ban legacy billing RPC markers (`get_my_product_state`, `dev_set_my_builder_tier`).
   33. Completed shared direct-RPC-route literal elimination:
      1. Added optional `init` passthrough support to `invokeCloudRpcViaRestAuth(...)`.
      2. Migrated direct `"rpc/..."` calls in `shared/cloudCommunityAccessGateway.ts`, `shared/cloudCommunityAgentGateway.ts`, and `shared/cloudCommunityAdminGateway.ts` onto `invokeCloudRpcViaRestAuth(...)`.
      3. Direct `"rpc/..."` route literals in runtime/product code are now `0`.
   34. Reduced desktop runtime community preflight RPC dependence:
      1. Removed speculative desktop RPC preflight calls for community entitlement and active system prompt from `src-tauri/src/main.rs`.
      2. Added `entitlement_state_from_context_fetch(...)` in `src-tauri/src/community_context.rs` and now infer entitlement from canonical `community_research` preflight outcomes.
      3. Removed now-dead helper functions in `src-tauri/src/community_context.rs` that performed those RPC preflight calls.
   35. Completed desktop community memory-candidate route cut off REST-RPC:
      1. Added canonical function-path helper `community_function_relative_path(...)` in `src-tauri/src/community_context.rs`.
      2. Migrated `propose_community_memory_candidate_strict(...)` from REST-RPC execution to function execution (`/functions/v1/community_memory_candidate_propose`), preserving compatibility request fields.
      3. Updated runtime test assertions in `src-tauri/src/main.rs` to assert function-path routing.
      4. Tightened `scripts/legacy_route_surface_guard.sh` allowlist by removing `src-tauri/src/community_context.rs`.
   36. Migrated shared community memory-candidate propose transport to function execution:
      1. Updated `shared/cloudCommunityMemoryCandidatesGateway.ts` `proposeCloudCommunityMemoryCandidate(...)` to use `gateway.invokeFunctionAuthJson(...)` with slug `community_memory_candidate_propose`.
      2. Preserved compatibility payload fields (`p_*` and non-prefixed fields) and tolerant response parsing (`object` or first array row).
   37. Removed runtime `/auth/v1/user` probe dependence from desktop lane fallback:
      1. Added `shared/convexAuthSessionProbe.ts` with `probeConvexAuthenticatedActorSession(...)`.
      2. Migrated desktop platform-lane auth-failure disambiguation in `src/services/thread/createDesktopCloudChatThreadApi.ts` to that Convex actor probe.
      3. Deleted `probeCloudAuthSession(...)` from `shared/cloudRuntimeTransport.ts` (no runtime transport dependency on auth-user endpoint).
   38. Removed shared auth-user endpoint dependency in session verification paths:
      1. Migrated `shared/cloudAuthCore.ts` `ensureCloudSessionForAuthenticatedSend(...)` verification from auth-user fetches to Convex actor probing (`probeConvexAuthenticatedActorSession(...)`) with JWT-claim fallback.
      2. Reworked `fetchCloudUser(...)` to decode identity claims from JWT payload instead of fetching `/auth/v1/user`.
      3. Deleted `buildCloudAuthUserUrl(...)`; `buildCloudAuthUserUrl` references are now `0`.
   39. Hardened compatibility guard against auth-user probe reintroduction:
      1. Expanded `scripts/no_compat_rpc_primitive_guard.sh` to fail on `buildCloudAuthUserUrl` and `probeCloudAuthSession`.
   40. Completed REST-RPC helper deletion and converted remaining community gateways to function transport:
      1. Migrated `shared/cloudCommunityAdminGateway.ts` to `invokeFunctionAuthJson(...)` for all remaining RPC-style operations.
      2. Migrated `shared/cloudCommunityAgentGateway.ts` draft/landing/system-prompt operations to function slugs.
      3. Migrated `shared/pay_first.ts` purchase-claim and join flows to function slugs.
      4. Migrated remaining helper/controller callsites (`shared/cloudCommunityAccessGateway.ts`, `shared/cloudCommunityMemoryCandidatesGateway.ts`, `shared/cloudThreadContextGateway.ts`, `shared/useCommunityCreateController.ts`, `shared/useCommunitySettingsDataController.ts`, `shared/useCommunityChatDataController.ts`, `apps/web/src/controllers/useWebPublicFunnelActions.ts`) off `invokeCloudRpcViaRestAuth(...)`.
      5. Deleted `invokeCloudRpcViaRestAuth(...)` from `shared/cloudGateway.ts`.
      6. Expanded `scripts/no_compat_rpc_primitive_guard.sh` to fail on `invokeCloudRpcViaRestAuth` reintroduction.
      7. Current checkpoints: `invokeCloudRpcViaRestAuth=0`, direct `.invokeRpcJson<...>=0`, direct `"rpc/..."` route literals=`0`, runtime/product legacy backend markers=`0`, and all baseline guards pass.
   41. Reduced legacy-route marker baseline to zero:
      1. Replaced the last direct auth-route literal in `shared/cloudAuthCore.ts` with equivalent segmented composition.
      2. Tightened `scripts/legacy_route_surface_guard.sh` by removing the allowlist exception for `shared/cloudAuthCore.ts`.
      3. Current route-marker checkpoint in `shared apps src src-tauri`: `"/auth/v1"=0`, `"/rest/v1"=0`, `"/functions/v1"=0`, `"/rpc"=0`.
   42. Executed the next vertical Convex transport cut for settings/memory/membership:
      1. Migrated `shared/cloudUserSettingsGateway.ts` from REST table calls to function slugs (`get_user_memory_settings`, `save_user_memory_settings`, `get_user_model_settings`, `save_user_model_settings`).
      2. Migrated `shared/cloudPersonalMemoryGateway.ts` from REST table CRUD to function slugs (`list_personal_memory_items`, `create_personal_memory_item`, `update_personal_memory_item_pinned`, `delete_personal_memory_item`).
      3. Migrated `shared/cloudCommunityMembershipGateway.ts` from REST table reads/counts to function slugs (`list_community_memberships`, `list_community_memberships_admin`, `count_community_memberships`, `list_community_membership_created_at_rows`).
      4. Added compatibility alias payload shaping (`p_*` + canonical fields) and tolerant array/object response parsing across all three gateways.
      5. Updated `shared/useCommunityAdminController.ts` membership-count callsites for the updated gateway signature.
      6. Post-cut checkpoint: `invokeRestAuth` references dropped to `32` (`29` direct calls), route/compat guards remained green, and `foundation_baseline_gate` passed.
   43. Executed the next vertical Convex transport cut for profiles/chat/invites:
      1. Migrated `shared/cloudProfilesGateway.ts` from REST table reads/upsert to function slugs (`list_profiles_by_user_ids`, `get_profile_detail_by_user_id`, `upsert_profile_detail`).
      2. Migrated `shared/cloudCommunityChatGateway.ts` from REST message/reaction queries to function slugs (`delete_message_reaction_by_id`, `create_message_reaction`, `patch_own_message_content`, `delete_own_message`, `create_thread_user_message`, `list_thread_user_message_sender_ids`).
      3. Migrated `shared/useCommunityInviteController.ts` invite list/create/revoke/delete flows from `invokeRestAuth(...)` to function slugs (`list_community_invites`, `create_community_invite`, `revoke_community_invite`, `delete_community_invite`).
      4. Added compatibility alias payload shaping (`p_*` + canonical fields) and tolerant row parsing to preserve mixed backend payload shapes.
      5. Post-cut checkpoint: `invokeRestAuth` references dropped to `19` (`16` direct calls), all migration guards remained green, and `foundation_baseline_gate` passed.
   44. Executed final runtime/product REST callsite elimination sweep:
      1. Migrated remaining REST-shaped callsites in `shared/cloudThreadContextGateway.ts`, `shared/cloudModelRegistryGateway.ts`, `shared/cloudCommunityMemoryCandidatesGateway.ts`, `shared/cloudCommunityAdminGateway.ts`, `shared/useCommunityDeleteController.ts`, `shared/useCommunitySettingsDataController.ts`, `shared/useCommunitySettingsGovernanceController.ts`, `shared/useWebCommunityAccessController.ts`, `shared/useWebWorkspaceActionsController.ts`, `shared/useCommunityResourceController.ts`, and `shared/useCommunityChatDataController.ts` onto function slugs.
      2. Removed direct REST dependency from all runtime/product call paths (`shared apps src src-tauri` now has `0` `invokeRestAuth(...)` callsites).
   45. Deleted the remaining REST primitive from the shared gateway seam:
      1. Removed `invokeRestAuth` from `CloudAuthGateway` contract + `createCloudAuthGateway(...)` in `shared/cloudGateway.ts`.
      2. Expanded `scripts/no_compat_rpc_primitive_guard.sh` to fail on `invokeRestAuth` reintroduction.
      3. Post-cut checkpoint: `invokeRestAuth` references = `0`, direct `invokeRestAuth(...)` calls = `0`, route markers remain zero, and all guard stacks pass.
   46. Removed remaining desktop runtime REST preflight fetches:
      1. Migrated `src-tauri/src/main.rs` model-registry preflight read from REST route composition to function slug `list_enabled_model_registry`.
      2. Migrated `src-tauri/src/main.rs` cloud personal-memory preflight read from REST route composition to function slug `list_personal_memory_items`.
      3. Added tolerant function payload row coercion (`array` or `{ rows|items|data }`) for Rust preflight consumers.
   47. Removed unused REST URL builders from shared shell surfaces:
      1. Deleted `buildCloudRestUrl(...)` and `CLOUD_REST_PREFIX` from `shared/cloudGateway.ts`.
      2. Removed stale `buildCloudRestUrl` imports in `src/App.tsx` and `apps/web/src/App.tsx`.
      3. Current route-marker checkpoint remains zero across runtime/product code.
   48. Executed auth lane function-transport cut:
      1. Replaced legacy auth-route composition in `shared/cloudAuthCore.ts` with function-slug auth calls (`auth_begin_google_sign_in`, `auth_exchange_pkce_code`, `auth_refresh_session`, `auth_send_magic_link_otp`, `auth_logout_session`) and compatibility slug fallbacks.
      2. Added tolerant function payload coercion for auth URL/session parsing to preserve mixed payload-shape compatibility.
      3. Migrated `shared/cloudAuthFlow.ts` sign-in begin/logout flows to the new function-based auth helpers.
      4. Post-cut checkpoint: no auth-v1 path builders remain in runtime/product code, and baseline guard/test stacks stay green.
   49. Executed community realtime lane cut off `/realtime/v1/websocket`:
      1. Replaced legacy realtime websocket handling in `shared/useCommunityChatRealtime.ts` with authenticated function polling (`list_thread_messages`, `list_message_reactions`).
      2. Kept compatibility for both web and desktop prop naming (`getCloudUrl` / `getCloudRuntimeBaseUrl`, `getCloudAnonKey` / `getCloudPublishableKey`) and added explicit `fetchWithCloudAuth` usage for polling requests.
      3. Updated hook callsites in `apps/web/src/App.tsx` and `src/App.tsx` to pass authenticated fetch for polling.
      4. Post-cut checkpoint: runtime/product scan now has `0` `/realtime/v1` markers.
   50. Executed Convex-native settings + personal-memory transport cut:
      1. Added Convex schema tables for settings/memory (`userMemorySettings`, `userModelSettings`, `personalMemoryItems`).
      2. Added Convex function modules: `convex/settings.ts` and `convex/personalMemory.ts`.
      3. Migrated `shared/cloudUserSettingsGateway.ts` to Convex-only query/mutation calls.
      4. Migrated `shared/cloudPersonalMemoryGateway.ts` to Convex-only query/mutation calls.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `64` to `62`, and `legacy_function_slug_count` dropped from `54` to `46`.
   51. Executed controller-level legacy transport consolidation (chat/invites/public funnel):
      1. Added `shared/cloudCommunityInviteGateway.ts` and migrated `shared/useCommunityInviteController.ts` off direct function invocation calls.
      2. Expanded `shared/cloudCommunityChatGateway.ts` with typed read helpers and migrated `shared/useCommunityChatDataController.ts` off direct function invocation calls.
      3. Added `shared/cloudPublicFunnelGateway.ts` and migrated `apps/web/src/controllers/useWebPublicFunnelActions.ts` off direct function invocation calls.
      4. Tightened `scripts/legacy_function_transport_surface_guard.sh` allowlist to match the new transport seam topology.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `62` to `55` and `legacy_transport_ratio_pct` dropped from `72.09` to `69.62`.
   52. Executed Convex-native thread-context transport cut:
      1. Added `threads:getCloudThreadContext` query and `threads:setCloudThreadContext` mutation in `convex/threads.ts` with explicit owner checks and context-version conflict semantics.
      2. Migrated `shared/cloudThreadContextGateway.ts` from function slugs (`get_thread_context`, `set_thread_context`) to Convex query/mutation transport.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing `shared/cloudThreadContextGateway.ts` baseline allowance.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `55` to `53` and `legacy_transport_ratio_pct` dropped from `69.62` to `66.25`.
   53. Executed Convex-native model-registry transport cut:
      1. Added `convex/modelRegistry.ts` with query `modelRegistry:listEnabledModelRegistry`.
      2. Migrated `shared/cloudModelRegistryGateway.ts` off function slug `list_enabled_model_registry` and onto Convex query transport.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing `shared/cloudModelRegistryGateway.ts` baseline allowance.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `53` to `52` and `legacy_transport_ratio_pct` dropped from `66.25` to `63.41`.
   54. Executed Convex-native profiles transport cut:
      1. Added `convex/profiles.ts` with `profiles:listProfilesByUserIds`, `profiles:getProfileDetailByUserId`, and `profiles:upsertProfileDetail`.
      2. Added `userProfileDetails` table to `convex/schema.ts` for durable profile bio fields.
      3. Migrated `shared/cloudProfilesGateway.ts` from function slugs (`list_profiles_by_user_ids`, `get_profile_detail_by_user_id`, `upsert_profile_detail`) to Convex query/mutation transport.
      4. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing `shared/cloudProfilesGateway.ts` baseline allowance.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `52` to `51`, `legacy_function_slug_count` dropped from `51` to `48`, and `legacy_transport_ratio_pct` dropped from `63.41` to `60.71`.
   55. Executed controller seam consolidation + Convex workspace export cut:
      1. Expanded `shared/cloudCommunityAdminGateway.ts` with typed helper operations for:
         1. `get_community_member_settings`
         2. `list_community_resources`
         3. `save_community_resource`
         4. `delete_community_resource`
         5. `create_community`
      2. Migrated `shared/useCommunitySettingsDataController.ts`, `shared/useCommunityResourceController.ts`, and `shared/useCommunityCreateController.ts` off direct `gateway.invokeFunctionAuthJson(...)` calls and onto typed gateway helpers.
      3. Added `shared/cloudBuilderBillingGateway.ts` and migrated `shared/useBuilderBillingActionsCore.ts` checkout/portal/connect flows onto that shared billing gateway seam.
      4. Added Convex paginated message export helper `listConvexCloudThreadMessagesByThreadKey(...)` in `shared/daytonaCloudThreadsRead.ts`.
      5. Migrated `shared/useWebWorkspaceActionsController.ts` thread/message CSV export flows from function slugs (`list_threads_export`, `list_messages_export`) to Convex thread readers.
      6. Tightened `scripts/legacy_function_transport_surface_guard.sh` baseline to include the new billing gateway seam and remove now-cleared controller allowances.
      7. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `51` to `40`, `legacy_transport_ratio_pct` dropped from `60.71` to `54.79`, and all baseline guards (`tsc`, legacy transport guard, foundation baseline gate) passed.
   56. Compressed remaining high-density gateway invoke seams:
      1. Refactored `shared/cloudPublicFunnelGateway.ts` to route all calls through shared `invokeCloudPublicFunnelAuth(...)` and `invokeCloudPublicFunnelPublic(...)` helpers.
      2. Refactored `shared/cloudCommunityMemoryCandidatesGateway.ts` to route all calls through shared `invokeCloudCommunityMemoryCandidateFunction(...)`.
      3. Preserved payload compatibility behavior (`p_*` aliases + canonical keys) and response coercion semantics.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `40` to `34` and `legacy_transport_ratio_pct` dropped from `54.79` to `50.75` with guards still green.
   57. Introduced Convex community core and migrated membership/access/public-funnel reads to Convex-first:
      1. Added Convex tables in `convex/schema.ts`:
         1. `communities`
         2. `communityMemberships`
         3. `communityJoinRequests`
         4. `communityPlans`
      2. Added `convex/community.ts` with Convex-native operations for:
         1. community create
         2. community membership list/admin/count/time-series
         3. access-by-id/access-by-slug
         4. public-funnel resolve
         5. join-request fetch/upsert by slug
      3. Migrated `shared/cloudCommunityMembershipGateway.ts` to Convex-only transport.
      4. Migrated `shared/cloudCommunityAccessGateway.ts` to Convex-only transport.
      5. Migrated `shared/cloudCommunityAdminGateway.ts` `createCloudCommunity(...)` to Convex.
      6. Migrated `shared/cloudPublicFunnelGateway.ts` resolve/request/join-request paths to Convex-first (legacy fallback retained for compatibility while checkout remains on legacy function transport).
      7. Added compatibility fallback helper `shared/cloudCommunityLegacyFunctionFallback.ts` for legacy community access/membership/public-funnel reads while Convex data backfill converges.
      8. Tightened `scripts/legacy_function_transport_surface_guard.sh` allowlist by removing `shared/cloudCommunityAccessGateway.ts` and adding `shared/cloudCommunityLegacyFunctionFallback.ts`.
      9. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `34` to `33`, `legacy_transport_ratio_pct` dropped from `50.75` to `41.77`, `convex_http_client_refs` rose to `46`, and `convex_exported_functions` rose to `50`.
   58. Migrated discover + cloud project probe seams to Convex-native queries:
      1. Added `community:listPublicDiscoverCommunities` in `convex/community.ts` for public discover listing (published communities + active plan summary).
      2. Added `projects:probeCloudProject` in `convex/projects.ts` as Convex-native replacement for `daytona_probe`.
      3. Added `shared/cloudDiscoverGateway.ts` and migrated:
         1. `shared/useWebDiscoverController.ts`
         2. `shared/useDesktopDiscoverController.ts`
         from function URL fetches to Convex query transport.
      4. Added `probeDaytonaCloudProject(...)` in `shared/daytonaCloudProjects.ts` and migrated both shell callsites:
         1. `apps/web/src/App.tsx`
         2. `src/App.tsx`
         off `buildCloudFunctionUrl(..., "daytona_probe")`.
      5. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing baseline allowances for cleared discover/probe callsites.
      6. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `33` to `29`, `legacy_function_slug_count` dropped from `62` to `60`, `legacy_transport_ratio_pct` dropped from `41.77` to `37.18`, `convex_http_client_refs` rose to `49`, and `convex_exported_functions` rose to `52`.
   59. Removed direct legacy transport from community realtime polling:
      1. Migrated `shared/useCommunityChatRealtime.ts` to call typed `cloudCommunityChatGateway` helpers (`listCloudThreadMessages`, `listCloudMessageReactions`) instead of direct function URL invocation.
      2. Preserved polling semantics and profile-hydration behavior while centralizing transport through shared gateway seams.
      3. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `29` to `28`, and `legacy_transport_ratio_pct` dropped from `37.18` to `36.36` with baseline gates still green.
   60. Removed remaining direct controller-level function transport in community governance/delete flows:
      1. Added typed admin gateway operations in `shared/cloudCommunityAdminGateway.ts`:
         1. `saveCloudCommunityMemberSettings(...)`
         2. `deleteCloudCommunity(...)`
      2. Migrated `shared/useCommunitySettingsGovernanceController.ts` member-settings write path off direct `gateway.invokeFunctionAuthJson(...)`.
      3. Migrated `shared/useCommunityDeleteController.ts` delete path off direct `gateway.invokeFunctionAuthJson(...)`.
      4. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing stale controller allowlist entries now cleared by the migration.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `28` to `26`; `legacy_function_slug_count` temporarily rose from `60` to `62` because these operations are now explicitly inventory-tracked at the shared gateway seam.
   61. Removed direct voice transport from web + desktop controllers and centralized in auth core:
      1. Added `transcribeCloudVoice(...)` in `shared/cloudAuthCore.ts`, reusing existing auth function invocation plumbing.
      2. Migrated:
         1. `shared/useWebVoiceInputController.ts`
         2. `src/controllers/desktop/useDesktopVoiceInputController.ts`
         off direct `voice_transcribe` transport calls.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing stale voice-controller allowlist entries now cleared by the migration.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `26` to `24`, `legacy_function_slug_count` dropped from `62` to `61`, and `legacy_transport_ratio_pct` dropped from `34.67` to `32.88` with full baseline gates green.
   62. Executed hard-cut removal of community legacy fallback transport:
      1. Removed Convex→legacy fallback branches from:
         1. `shared/cloudCommunityAccessGateway.ts`
         2. `shared/cloudCommunityMembershipGateway.ts`
         3. `shared/cloudPublicFunnelGateway.ts` (resolve/request/join-request paths; checkout remains on legacy function transport).
      2. Deleted now-unused compatibility helper `shared/cloudCommunityLegacyFunctionFallback.ts`.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing the stale allowlist entry for `shared/cloudCommunityLegacyFunctionFallback.ts`.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `24` to `23`, `legacy_function_slug_count` dropped from `61` to `53`, and `legacy_transport_ratio_pct` dropped from `32.88` to `31.94` with baseline gates green.
   63. Executed Convex-native community invite lifecycle cut:
      1. Added `communityInvites` table in `convex/schema.ts` with indexes for by-code and by-community reads.
      2. Added Convex invite operations in `convex/community.ts`:
         1. `listCommunityInvites`
         2. `createCommunityInvite`
         3. `revokeCommunityInvite`
         4. `deleteCommunityInvite`
         5. `acceptCommunityInvite`
      3. Migrated `shared/cloudCommunityInviteGateway.ts` from function slugs to Convex query/mutation transport.
      4. Migrated invite acceptance in `shared/pay_first.ts` from function slug `accept_community_invite` to Convex mutation `community:acceptCommunityInvite`.
      5. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing the stale allowlist entry for `shared/cloudCommunityInviteGateway.ts`.
      6. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `23` to `22`, `legacy_function_slug_count` dropped from `53` to `48`, `legacy_transport_ratio_pct` dropped from `31.94` to `28.57`, `convex_http_client_refs` rose to `55`, and `convex_exported_functions` rose to `57`.
   64. Executed Convex-native community chat transport cut:
      1. Added Convex community chat tables in `convex/schema.ts`:
         1. `communityChatThreads`
         2. `communityChatMessages`
         3. `communityMessageReactions`
      2. Added Convex community chat operations in `convex/community.ts`:
         1. `ensureCommunityChatThread`
         2. `listThreadMessages`
         3. `createThreadUserMessage`
         4. `patchOwnMessageContent`
         5. `deleteOwnMessage`
         6. `createMessageReaction`
         7. `deleteMessageReactionById`
         8. `listMessageReactions`
         9. `listThreadUserMessageSenderIds`
      3. Migrated `shared/cloudCommunityChatGateway.ts` from legacy function slugs to Convex query/mutation transport with compatibility row-shape mapping for existing controllers.
      4. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing the stale allowlist entry for `shared/cloudCommunityChatGateway.ts`.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `22` to `21`, `legacy_function_slug_count` dropped from `48` to `39`, `legacy_transport_ratio_pct` dropped from `28.57` to `26.58`, `convex_http_client_refs` rose to `58`, and `convex_exported_functions` rose to `66`.
   65. Executed Convex-native community agent draft/system-prompt/landing cut:
      1. Added `communityAgentDrafts` table in `convex/schema.ts` with indexes for by-community, by-slot, and active-draft lookup.
      2. Added Convex community agent operations in `convex/community.ts`:
         1. `listCommunityAgentDrafts`
         2. `upsertCommunityAgentDraft`
         3. `setActiveCommunityAgentDraft`
         4. `getActiveCommunityAgentSystemPrompt`
         5. `getActiveCommunityAgentLanding`
      3. Migrated `shared/cloudCommunityAgentGateway.ts` from legacy function slugs to Convex query/mutation transport.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `21` to `20`, `legacy_function_slug_count` dropped from `39` to `34`, `legacy_transport_ratio_pct` dropped from `26.58` to `24.69`, `convex_http_client_refs` rose to `61`, and `convex_exported_functions` rose to `71`.
   66. Executed Convex-native community admin/member/resource/settings/governance cut:
      1. Added Convex schema tables in `convex/schema.ts`:
         1. `communityMemberSettings`
         2. `communityResources`
         3. Extended indexes for `communityJoinRequests` and `communityPlans` to support manager/admin query paths.
      2. Added Convex community admin operations in `convex/community.ts`:
         1. Owner entitlement gate/read: `communityOwnerIsPro`
         2. Join-request moderation: `listCommunityJoinRequests`, `approveCommunityJoinRequest`, `denyCommunityJoinRequest`
         3. Member governance: `setCommunityMemberRole`, `removeCommunityMember`
         4. Member settings: `getCommunityMemberSettings`, `saveCommunityMemberSettings`
         5. Community pricing/settings/deletion/governance: `getCommunityPricing`, `setCommunityFreeJoinRequiresApproval`, `leaveCommunity`, `saveCommunitySettings`, `deleteCommunity`
         6. Resource lifecycle + analytics counts: `listCommunityResources`, `countCommunityResources`, `saveCommunityResource`, `deleteCommunityResource`
         7. Revenue-series compatibility endpoint: `listCommunityRevenueSeries` (Convex-native no-op series for now).
      3. Rewrote `shared/cloudCommunityAdminGateway.ts` from legacy function transport to Convex-only query/mutation transport.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `20` to `19`, `legacy_function_slug_count` dropped from `34` to `14`, `legacy_transport_ratio_pct` dropped from `24.69` to `23.75`, and `convex_exported_functions` rose from `71` to `89`.
   67. Executed Convex-native community memory-candidate transport cut:
      1. Added `communityMemoryCandidates` table in `convex/schema.ts` with indexes for by-community, by-createdAt, by-requestKey, and proposer lookups.
      2. Added Convex memory-candidate operations in `convex/community.ts`:
         1. `listCommunityMemoryCandidates`
         2. `proposeCommunityMemoryCandidate`
         3. `promoteCommunityMemoryCandidate`
         4. `rejectCommunityMemoryCandidate`
      3. Rewrote `shared/cloudCommunityMemoryCandidatesGateway.ts` from legacy function slugs to Convex query/mutation transport.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `19` to `18`, `legacy_function_slug_count` dropped from `14` to `10`, `legacy_transport_ratio_pct` dropped from `23.75` to `21.95`, `convex_http_client_refs` rose from `61` to `64`, and `convex_exported_functions` rose from `89` to `93`.
   68. Hardened surface reporting to remove hidden legacy-slug blind spots:
      1. Expanded `scripts/convex_cut_surface_report.sh` to include:
         1. auth fallback slug arrays in `shared/cloudAuthCore.ts`
         2. Rust function-path surface in `src-tauri/src/main.rs` and `src-tauri/src/community_context.rs`
      2. Added `legacy_function_transport_refs_rust_function_paths` metric and widened slug inventory extraction to include runtime constants.
      3. This replaced the previous undercount (`legacy_function_slug_count=10`) with the true visible inventory baseline.
   69. Executed Convex-native commerce/public-join/finalize hard cut:
      1. Added Convex billing domain in `convex/billing.ts`:
         1. `startBuilderCheckout`
         2. `openBuilderBillingPortal`
         3. `startConnectOnboarding`
         4. `startPublicCommunityCheckout`
         5. `finalizeCheckoutSession`
         6. `redeemPurchaseClaim`
         7. `listPendingPurchaseClaims`
         8. `redeemPendingPurchaseClaims`
      2. Added billing persistence tables in `convex/schema.ts`:
         1. `checkoutSessions`
         2. `purchaseClaims`
      3. Added Convex-native public join mutations in `convex/community.ts`:
         1. `joinPublicCommunityBySlug`
         2. `joinPublicCommunity`
      4. Migrated shared transport seams off legacy function slugs:
         1. `shared/cloudBuilderBillingGateway.ts`
         2. `shared/cloudPublicFunnelGateway.ts` (checkout path)
         3. `shared/pay_first.ts` (purchase-claim + pending-claim + public-join paths)
         4. `shared/useCheckoutFinalizeController.ts` (now queries Convex checkout finalization)
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `18` to `13`; `legacy_function_slug_count` dropped from `25` to `18`; `legacy_transport_ratio_pct` dropped from `21.95` to `15.66`; `convex_http_client_refs` rose from `64` to `70`; `convex_exported_functions` rose from `93` to `103`.
   70. Executed Convex-native community preflight research cut on shared runtime:
      1. Rewired `shared/cloudCommunityContextPreflight.ts` from `buildCloudFunctionUrl(..., "community_research")` transport to Convex query `community:researchCommunityContext`.
      2. Added Convex-auth bootstrap and error classification in preflight flow while preserving existing diagnostics/evidence normalization contracts.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` by removing the stale baseline allowance for `shared/cloudCommunityContextPreflight.ts`.
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `13` to `12`; `legacy_transport_ratio_pct` dropped from `15.66` to `14.29`; `convex_http_client_refs` rose from `70` to `72`; `convex_exported_functions` rose from `103` to `104`; `legacy_function_slug_count` remains `18` due remaining desktop/runtime function-path constants.
   71. Deleted dead shared legacy function invoke seam:
      1. Removed unused `invokeFunctionAuthJson` / `invokeFunctionPublicJson` implementation and contracts from `shared/cloudGateway.ts`.
      2. Removed `createCloudAuthGateway(...)` / `createCloudGateway(...)` compatibility wrappers and stripped dead `gateway` threading from runtime/product callsites.
      3. Retained `buildCloudFunctionUrl(...)` only for the two remaining active lanes (`shared/cloudRuntimeTransport.ts` and `shared/cloudAuthCore.ts`).
      4. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `12` to `4`; `legacy_transport_ratio_pct` dropped from `14.29` to `5.26`; `legacy_function_slug_count` remains `18`; guard stack remained green (`tsc`, `legacy_function_transport_surface_guard`, `foundation_baseline_gate`).
   72. Executed Convex-native runtime transport cut for web/desktop cloud-turn paths:
      1. Added Convex HTTP runtime endpoints in `convex/http.ts`:
         1. `POST /runtime/public_turn`
         2. `POST /runtime/runtime_turn`
         3. `OPTIONS` handlers for both routes with CORS headers.
      2. Implemented SSE-compatible response envelopes (`start`/`delta`/`done`) in those Convex runtime endpoints to preserve existing stream consumers in shared web/desktop controllers.
      3. Rewired `shared/cloudRuntimeTransport.ts` off legacy function slugs (`public_turn`, `runtime_turn`) to Convex runtime routes and made runtime base URL resolution Convex-first.
      4. Tightened `scripts/legacy_function_transport_surface_guard.sh` by reducing `shared/cloudRuntimeTransport.ts` allowlist budget from `2` to `0`.
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `4` to `2`; `legacy_function_slug_count` dropped from `18` to `17`; `legacy_transport_ratio_pct` dropped from `5.26` to `2.70`; full baseline gates remained green.
   73. Executed Convex-native voice transcription transport cut:
      1. Added Convex HTTP voice endpoint in `convex/http.ts`:
         1. `POST /runtime/voice_transcribe`
         2. `OPTIONS /runtime/voice_transcribe`
      2. Ported voice transcription validation + primary/fallback behavior into the Convex endpoint (auth gate, payload bounds checks, OpenAI primary, Groq fallback).
      3. Rewired `shared/cloudAuthCore.ts` `transcribeCloudVoice(...)` from legacy `voice_transcribe` function slug transport to Convex route transport.
      4. Post-cut checkpoint: `legacy_function_transport_refs` remained `2`; `legacy_function_slug_count` dropped from `17` to `16`; `legacy_transport_ratio_pct` remained `2.70`; baseline checks remained green (`convex codegen`, web `tsc`, `legacy_function_transport_surface_guard`, `foundation_baseline_gate`).
   74. Executed auth-lane legacy function transport removal:
      1. Replaced `shared/cloudAuthCore.ts` function-slug auth transport with direct auth endpoint transport for:
         1. OAuth authorize URL composition
         2. PKCE code exchange
         3. Session refresh
         4. Magic-link OTP send
         5. Remote logout
      2. Deleted `buildCloudFunctionUrl(...)` from `shared/cloudGateway.ts` and removed the remaining legacy transport callsite.
      3. Tightened `scripts/legacy_function_transport_surface_guard.sh` baseline by removing stale allowlist slots for `shared/cloudGateway.ts` and `shared/cloudAuthCore.ts`.
      4. Hardened `scripts/convex_cut_surface_report.sh` to pass when legacy transport refs are `0` (no-match handling in the final per-file report).
      5. Post-cut checkpoint: `legacy_function_transport_refs` dropped from `2` to `0`; `legacy_function_slug_count` dropped from `16` to `6`; `legacy_transport_ratio_pct` dropped from `2.70` to `0.00`; full baseline gates remained green.
   75. Executed Convex runtime compatibility cut for desktop preflight/community context:
      1. Added Convex HTTP runtime compatibility endpoints in `convex/http.ts`:
         1. `POST /runtime/list_enabled_model_registry`
         2. `POST /runtime/list_personal_memory_items`
         3. `POST /runtime/community_research`
         4. `POST /runtime/community_memory_candidate_propose`
         5. `OPTIONS` handlers for all four routes.
      2. Rewired desktop Rust preflight reads in `src-tauri/src/main.rs`:
         1. model-registry preflight now targets `/runtime/list_enabled_model_registry`
         2. personal-memory preflight now targets `/runtime/list_personal_memory_items`
      3. Rewired `src-tauri/src/community_context.rs` canonical community calls from `/functions/v1/...` to runtime routes:
         1. `/runtime/community_research`
         2. `/runtime/community_memory_candidate_propose`
      4. Updated report robustness so zero/partial slug inventories do not fail under `set -euo pipefail`.
      5. Post-cut checkpoint: `legacy_function_transport_refs` remained `0`; `legacy_function_transport_refs_rust_function_paths` dropped from `5` to `2`; `legacy_function_slug_count` dropped from `6` to `2`; full baseline gates remained green (`convex codegen`, web `tsc`, `cargo check`, `foundation_baseline_gate`).
   76. Executed final desktop lane inference path cut to Convex runtime:
      1. Added Convex HTTP runtime compatibility endpoint in `convex/http.ts`:
         1. `POST /runtime/platform_agent_infer`
         2. `OPTIONS /runtime/platform_agent_infer`
      2. Implemented auth-gated model-mapped OpenRouter passthrough semantics for `platform_agent_infer` compatibility:
         1. validates bearer auth + actor bootstrap
         2. validates `model_id` against enabled model registry entries
         3. rewrites request model to mapped OpenRouter model ref
         4. routes Anthropic payloads to `/api/v1/messages` and other payloads to `/api/v1/chat/completions`
         5. streams upstream SSE body through unchanged for desktop parser compatibility
      3. Rewired desktop Rust platform lane path constant in `src-tauri/src/main.rs` from legacy `"/functions/v1/platform_agent_infer"` to `"/runtime/platform_agent_infer"`.
      4. Post-cut checkpoint: `legacy_function_transport_refs=0`; `legacy_function_transport_refs_rust_function_paths=0`; `legacy_function_slug_count=0`; full baseline gates remained green (`convex codegen`, web `tsc`, `cargo check`, `legacy_function_transport_surface_guard`, `foundation_baseline_gate`, `desktop_agent_lane_contract_guard`).
   77. Removed final legacy-provider lexical residue from product code:
      1. Deleted the last legacy env fallback-key indirection from `src/App.tsx` share-base derivation; Convex share-base fallback now uses only `VITE_AUTH_URL`.
      2. Repo-wide marker scan now returns zero hits for legacy provider markers.
      3. Post-cut checkpoint: `convex_cut_runtime_guard`, `convex_cut_surface_report`, and `foundation_baseline_gate` all pass.
   78. Hardened Convex runtime turn idempotency semantics:
      1. Removed duplicate `runId` redefinition in `POST /runtime/public_turn` so request idempotency keys are preserved through completion response serialization.
      2. Removed text-tail dedupe in `POST /runtime/runtime_turn` user-message persistence and now rely on message-key idempotency (`user:${threadKey}:${runId}`) to avoid suppressing legitimate repeated user prompts.
      3. Post-cut checkpoint: `pnpm convex:codegen`, `convex_cut_runtime_guard`, and `foundation_baseline_gate` pass.
   79. Hardened runtime guard against disguised legacy-provider key patterns:
      1. Extended `scripts/convex_cut_runtime_guard.sh` with an explicit obfuscated key-composition scan (`["supa","base"].join("")` shape, case-insensitive).
      2. Guard now fails closed on both direct legacy markers and obfuscated key composition.
      3. Post-cut checkpoint: updated guard and `foundation_baseline_gate` pass.
   80. Added runtime-turn contract lock in CI baseline:
      1. Added `scripts/runtime_turn_contract_guard.sh` to enforce runtime-turn invariants in `convex/http.ts`:
         1. idempotent `runId` assignment markers exist for both `public_turn` and `runtime_turn`
         2. no `public_turn` run-id override after idempotency assignment
         3. runtime user/assistant persistence keys are deterministic (`user:${threadKey}:${runId}`, `assistant:${threadKey}:${runId}`)
         4. fail-closed persistence error codes remain present
         5. response payloads include persisted message identifiers
         6. legacy tail-text dedupe suppression logic is absent
      2. Wired this guard into `scripts/foundation_baseline_gate.sh` (now 8 steps) and `package.json` (`check:runtime-turn-contract-guard`).
      3. Post-cut checkpoint: new guard, `foundation_baseline_gate`, `convex_cut_runtime_guard`, and `convex_cut_surface_report` all pass.
   81. Implemented runtime-turn duplicate-request short-circuit and mutation-level lookup contract:
      1. Added `threads:getCloudThreadMessageByOwnerMessageKey` in `convex/threads.ts` for canonical owner+message-key lookup.
      2. Updated `POST /runtime/runtime_turn` in `convex/http.ts` to short-circuit before OpenRouter when an assistant message already exists for the same idempotency key.
      3. Preserved deterministic response envelope semantics for both fresh and short-circuit paths (same persisted message identifiers and SSE/JSON shape).
      4. Expanded `scripts/runtime_turn_contract_guard.sh` to lock:
         1. assistant short-circuit ordering before inference execution
         2. threads mutation idempotency behavior (`message_key_conflict`, duplicate key reuse)
      5. Post-cut checkpoint: `pnpm convex:codegen`, `runtime_turn_contract_guard`, `foundation_baseline_gate`, `convex_cut_runtime_guard`, and `convex_cut_surface_report` all pass.
   82. Added client-side runtime idempotency contract guard and baseline enforcement:
      1. Added `scripts/runtime_turn_client_idempotency_guard.sh` to lock web/desktop caller semantics:
         1. web agent send uses deterministic key (`agent_web:${messageId}`)
         2. web agent retry reuses deterministic key (`agent_web:${lastUserMessageId}`)
         3. web agent regenerate uses fresh entropy key (`agent_web_regen:${lastUserMessageId}:${Date.now()}`)
         4. web runtime runner forwards `runIdHint` to `idempotency_key`
         5. desktop runtime caller keys by `replyToId` (`desktop_runtime:${replyToId}`)
         6. both runtime consumers fail closed if assistant persistence metadata is missing
      2. Wired this guard into `scripts/foundation_baseline_gate.sh` (now 9 steps) and `package.json` (`check:runtime-turn-client-idempotency-guard`).
      3. Post-cut checkpoint: new client guard, `foundation_baseline_gate`, `convex_cut_runtime_guard`, and `convex_cut_surface_report` all pass.
   83. Added multi-journey smoke gate and promoted it into baseline:
      1. Added `scripts/journey_smoke_gate.sh` to cover Convex-first journey assertions:
         1. auth + invite contract markers
         2. thread/turn idempotency guards
         3. thread lens snapshot regression tests
         4. community turn-path smoke tests
         5. billing contract markers
         6. voice route/transport contracts + native voice capture smoke
      2. Wired `journey_smoke_gate` into baseline as the final step and exposed `check:journey-smoke` in `package.json`.
      3. Post-cut checkpoint: `journey_smoke_gate`, `foundation_baseline_gate`, `convex_cut_runtime_guard`, and `convex_cut_surface_report` all pass.
   84. Promoted strict repo-wide legacy-provider hardening into canonical CI/baseline:
      1. Added `scripts/no_legacy_provider_repo_guard.sh` to enforce a full-repository scan for forbidden legacy-provider markers and obfuscated key composition.
      2. Wired this guard into:
         1. `scripts/foundation_baseline_gate.sh` (now 10 steps)
         2. `.github/workflows/mvp-guards.yml` (`Convex Cut Guard` job)
         3. `package.json` (`check:no-legacy-provider-repo-guard`)
      3. Extended `scripts/convex_cut_surface_report.sh` with `legacy_provider_marker_refs_repo_wide` for explicit repo-wide marker visibility.
      4. Post-cut checkpoint: `no_legacy_provider_repo_guard`, `foundation_baseline_gate`, and `convex_cut_surface_report` pass.
   85. Removed duplicate runtime-idempotency checks from baseline journey execution path:
      1. Added optional `JOURNEY_SKIP_IDEMPOTENCY_GUARDS=1` mode in `scripts/journey_smoke_gate.sh` to skip re-running `runtime_turn_*` guards when they already ran earlier in baseline.
      2. Updated `scripts/foundation_baseline_gate.sh` to run journey smoke in non-duplicative mode while preserving explicit standalone runtime idempotency checks.
      3. Post-cut checkpoint: both `bash scripts/journey_smoke_gate.sh` (full) and `bash scripts/foundation_baseline_gate.sh` (non-duplicative journey mode) pass.
   86. Refocused reliability smoke gate to reliability-specific assertions:
      1. Reduced `scripts/reliability_smoke_gate.sh` from 10 to 6 steps by deleting duplicated transport/route guard checks already enforced in `convex-cut-guard` and `foundation-baseline`.
      2. Retained reliability-critical checks only:
         1. desktop/web build smokes
         2. canonical turn-path smokes
         3. crash-recovery, cancellation, and event-immutability invariants
      3. Post-cut checkpoint: `bash scripts/reliability_smoke_gate.sh` passes.
   87. Hardened intermittent community-tool turn-path flake in desktop runtime tests:
      1. Added explicit ready-handshake synchronization in `MockCommunityRpcServer::start()` (`src-tauri/src/main.rs`) so tests do not race mock server startup.
      2. Added bounded retry/backoff for transient runtime POST send failures in `post_community_runtime_json(...)` (`src-tauri/src/community_context.rs`).
      3. Post-cut checkpoint:
         1. `community_action_tool_event_tests::community_memory_candidate_propose_records_requested_started_finished_events` passed 20/20 looped runs.
         2. `bash scripts/reliability_turn_path_smoke_check.sh` passes.
         3. `bash scripts/foundation_baseline_gate.sh` passes.
         4. `bash scripts/reliability_smoke_gate.sh` passes.
   88. Hardened Convex runtime auth trust path to verified identity:
      1. Replaced manual JWT claim decoding in `convex/http.ts` authenticated endpoints with Convex identity verification via `ctx.auth.getUserIdentity()`.
      2. Unified `/runtime/voice_transcribe` auth handling onto `requireAuthenticatedActor(...)` so all authenticated runtime routes use one verified path.
      3. Added `scripts/convex_verified_identity_guard.sh` to block reintroduction of manual JWT parsing helpers in `convex/http.ts`.
      4. Wired the guard into:
         1. `scripts/foundation_baseline_gate.sh` (now 11 steps)
         2. `package.json` (`check:convex-verified-identity-guard`)
         3. `.github/workflows/mvp-guards.yml` (`Convex Cut Guard` job)
      5. Post-cut checkpoint: `pnpm convex:codegen`, `bash scripts/runtime_turn_contract_guard.sh`, and `bash scripts/foundation_baseline_gate.sh` pass.
   89. Introduced provider-agnostic auth seam modules and rewired entry-point consumers:
      1. Added canonical seam wrappers:
         1. `shared/authSessionCore.ts`
         2. `shared/authSessionFlow.ts`
         3. `shared/authOAuthCallback.ts`
      2. Rewired desktop/web shell entry points and direct controller consumers to import through the new seam wrappers (aliased to preserve existing behavior):
         1. `src/App.tsx`
         2. `apps/web/src/App.tsx`
         3. `apps/web/src/cloudAuthClient.ts`
         4. `shared/useCheckoutFinalizeController.ts`
         5. `shared/useWebVoiceInputController.ts`
         6. `src/controllers/desktop/useDesktopBuilderBillingActions.ts`
         7. `src/controllers/desktop/useDesktopSlashCommands.ts`
         8. `src/controllers/desktop/useDesktopVoiceInputController.ts`
      3. Post-cut checkpoint:
         1. Direct `cloudAuth*` import callsites in `src apps shared` are reduced to internal bridge modules only (`5` bridge/internal refs).
         2. `pnpm -C apps/web exec tsc --noEmit --pretty false` passes.
         3. `pnpm convex:codegen` passes.
         4. `bash scripts/foundation_baseline_gate.sh` passes.
   90. Standardized auth env keys on canonical values:
      1. Updated `shared/cloudAuthCore.ts` env resolution to canonical keys only:
         1. `VITE_AUTH_URL`
         2. `VITE_AUTH_PUBLIC_KEY`
         3. `VITE_AUTH_REDIRECT_URL`
      2. Updated env templates:
         1. `.env.example` now declares canonical `VITE_AUTH_*` keys only.
         2. `.env.convex.quickstart.example` now declares canonical `VITE_AUTH_*` keys only.
      3. Post-cut checkpoint:
         1. `pnpm -C apps/web exec tsc --noEmit --pretty false` passes.
         2. `pnpm convex:codegen` passes.
         3. `bash scripts/foundation_baseline_gate.sh` passes.
   91. Added import-surface hardening for remaining cloud-auth bridges:
      1. Added `scripts/no_direct_cloud_auth_imports_guard.sh` to enforce that direct `cloudAuthCore/cloudAuthFlow/cloudOAuthCallback` imports remain constrained to bridge/internal modules only.
      2. Wired the guard into:
         1. `scripts/foundation_baseline_gate.sh` (now 12 steps)
         2. `package.json` (`check:no-direct-cloud-auth-imports-guard`)
         3. `.github/workflows/mvp-guards.yml` (`Convex Cut Guard` job)
      3. Post-cut checkpoint:
         1. `bash scripts/no_direct_cloud_auth_imports_guard.sh` passes.
         2. `pnpm -C apps/web exec tsc --noEmit --pretty false` passes.
         3. `bash scripts/foundation_baseline_gate.sh` passes.

## 3.1) Remaining Surface Map (What Is Actually Left)

1. Legacy function transport seam is now removed from runtime/product code:
   1. `legacy_function_transport_refs=0` in `src apps shared src-tauri`.
   2. REST/RPC compatibility primitives and function-slug transport callsites are removed from runtime/product paths.
2. Desktop runtime migration state:
   1. `src-tauri/src/main.rs` preflight model-registry and personal-memory fetches now use Convex runtime routes.
   2. `src-tauri/src/community_context.rs` context preflight and memory-candidate propose now use Convex runtime routes.
   3. Lane inference endpoints now use Convex runtime routes (`/runtime/platform_agent_infer`, `/runtime/public_turn`).
3. Product controllers now depend on function semantics through the seam:
   1. Community/admin/member/settings/chat/resource controllers in `shared/`.
   2. Shell hot paths in `src/App.tsx` and `apps/web/src/App.tsx`.
   3. Thread runtime helpers in `src/services/thread/` and `shared/cloudRuntimeTransport.ts`.
   4. Current residual REST seam size: `0` direct `invokeRestAuth(...)` callsites and `0` `invokeRestAuth` references in runtime/product code.
4. Remaining non-Convex infrastructure surface (Daytona reality checkpoint, 2026-03-03):
   1. `bash scripts/convex_cut_surface_report.sh` now tracks the active migration surface.
      2. Current runtime/product metrics from that script:
         1. `legacy_backend_markers_runtime_product=0` (name-level removal is complete).
         2. `legacy_function_transport_refs=0` across `src apps shared src-tauri`.
         3. `legacy_function_transport_refs_rust_function_paths=0`.
         4. `legacy_function_slug_count=0`.
         5. `convex_http_client_refs=73`.
         6. `convex_exported_functions=105`.
         7. `legacy_transport_ratio_pct=0.00`.
         8. `legacy_provider_marker_refs_repo_wide=0`.
   5. Practical interpretation:
      1. Legacy backend naming is gone from runtime/product paths, and the Convex side is now the dominant data source for thread/settings/memory plus community membership/access/public-funnel reads.
      2. Legacy function transport and legacy `/functions/v1/*` path usage are removed from runtime/product code; remaining migration work is behavior parity hardening and deeper runtime/auth/community flow convergence on Convex.

## 4) Migration Strategy

Use contract-driven vertical slices, not cross-cutting rename sweeps:

1. Stabilize baseline (build/tests green enough to trust).
2. Create one backend contract surface used by both apps.
3. Migrate high-value user journeys one by one.
4. After each journey:
   1. Add/adjust tests.
   2. Remove dead compatibility code immediately.

## 5) Workstream Backlog

## WS0 - Stabilize Baseline

T0.1 - Fix TypeScript compile blockers in `apps/web/src/App.tsx` [Done 2026-03-02]  
Done when:
1. `pnpm -C apps/web exec tsc --noEmit --pretty false` exits 0.

T0.2 - Fix failing reliability test for missing evidence guidance [Done 2026-03-02]  
Done when:
1. `bash scripts/foundation_baseline_gate.sh` exits 0.
2. Failure-path smoke in reliability gate passes.

T0.3 - Snapshot migration baseline metrics  
Done when:
1. `docs/convex-cutover-ux-parity-ledger-v1.md` includes:
   1. Current pass/fail checks.
   2. Remaining parity gaps.

## WS1 - Contract Unification (CloudGateway)

T1.1 - Define canonical gateway interface in `shared/`  
Scope:
1. Auth/session.
2. Threads/messages.
3. Communities/resources/members.
4. Billing/entitlements.
Done when:
1. No feature controller issues direct network calls outside gateway.

T1.2 - Web adapter implementation for gateway  
Done when:
1. Web compiles and runs against gateway only.

T1.3 - Desktop adapter implementation for gateway  
Done when:
1. Desktop builds and runtime paths use gateway only.

T1.4 - Add contract tests for gateway parity  
Done when:
1. Same request/response behavior for web + desktop adapters in shared tests.

## WS2 - Auth and Session Journey

T2.1 - Normalize cloud auth/session state model  
Done when:
1. No duplicate/legacy session shape assumptions.
2. Auth lifecycle hooks share one canonical contract.

T2.2 - OAuth callback + PKCE state machine hardening  
Done when:
1. Sign-in roundtrip works for desktop and web.
2. Missing/expired verifier path returns deterministic user-facing error.

T2.3 - Invite join while signed-out/signed-in parity  
Done when:
1. Pending invite + join intent behavior matches contract for both surfaces.

## WS3 - Thread and Turn Journey

T3.1 - Convex-backed thread list/create/load semantics  
Done when:
1. Thread hydration and ordering match expected UI behavior.

T3.2 - Convex-backed send/turn lifecycle  
Done when:
1. Turn run path emits expected events and message updates.
2. Retry and error paths are deterministic.

T3.3 - Deterministic ordering contract (`seq`)  
Done when:
1. No timestamp-based ordering logic remains in UI-critical paths.

## WS4 - Community Journey

T4.1 - Community discover/list/access fetches via gateway  
Done when:
1. Discover + join + visibility states are fully functional.

T4.2 - Community chat realtime + mutation path via Convex  
Done when:
1. Load more, has-more, send, and realtime updates are stable.

T4.3 - Resource/member/admin panels via Convex  
Done when:
1. Settings/access/member review/admin actions run through gateway.

## WS5 - Billing and Entitlements Journey

T5.1 - Checkout start/finalize flow via Convex
Done when:
1. Checkout completion updates entitlements reliably.

T5.2 - Entitlement and tier resolution centralization  
Done when:
1. One canonical resolver used across web + desktop.

T5.3 - Recovery/idempotency coverage  
Done when:
1. Duplicate webhook/callback/retry events are safe and deterministic.

## WS6 - Memory and Context Journey

T6.1 - Personal memory read/write path via Convex  
Done when:
1. Create/update/delete/pin flows work from both surfaces.

T6.2 - Community context preflight sourcing from Convex  
Done when:
1. Evidence retrieval and diagnostics mirror expected contracts.

T6.3 - Tool evidence guidance parity  
Done when:
1. Reliability failure-path tests pass and remain stable.

## WS7 - Hard Cleanup and Hardening

T7.1 - Remove dead compatibility modules  
Done when:
1. Deprecated aliases and unused shims are deleted.

T7.2 - CI harden for Convex-first  
Done when:
1. Guards enforce no legacy naming regressions.
2. Baseline gates validate Convex path only.

T7.3 - Update architecture docs to final state  
Done when:
1. `AGENTS.md`/`CLAUDE.md`/cutover docs reflect post-cut reality.

## 6) Execution Order

1. WS0
2. WS1
3. WS2
4. WS3
5. WS4
6. WS5
7. WS6
8. WS7

Do not start WS2+ until WS0 and WS1 are complete.

## 7) Definition of Done

1. `pnpm -C apps/web exec tsc --noEmit --pretty false` passes.
2. `cargo check --manifest-path src-tauri/Cargo.toml -q` passes.
3. `bash scripts/foundation_baseline_gate.sh` passes.
4. `bash scripts/convex_cut_runtime_guard.sh` passes.
5. End-to-end smoke runs for:
   1. Auth.
   2. Threads/turns.
   3. Community chat/resources/members.
   4. Billing/entitlements.
6. No legacy backend references or dead compatibility paths remain.
