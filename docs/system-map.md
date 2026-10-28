# Polynet system map

Every part of Polynet in one place: what it does, where its code lives, how it is
reached, what it stores, which contract governs it, and whether it stays.
Start here before changing anything, and update this map in the same PR when a
row changes.

Status: written October 27, 2026 from `main` at `d63eb4a63`. Code paths are
`convex/<module>.ts` unless shown otherwise.

**Status column:** **Keep** (core), **Going** (removal planned; Neil decided
Oct 27), **Dead** (no first-party caller; the gate's
`no_orphan_modules_proof` fails on any new dead module and
`no_uncalled_functions_proof` on any new uncalled function). **Hand-run** modules
and functions have no code caller on purpose and are named, with a reason, in
those proofs' exceptions.

## The shape

```text
Members and founders
  ├─ a community's own site  <slug>.polynet.page   → Cloudflare edge (infra/community-edge) ─┐
  ├─ Polynet Studio          polynet.ai (apps/web)  → Vercel functions (api/) ─────────────────┤
  └─ their own AI agent      Claude, Codex, …       → official Polynet MCP (/runtime/mcp) ─────┤
                                                                                              ▼
                                      Convex backend (convex/): data, rules, agent runtime, crons
                                                                                              │
                                      Stripe · WorkOS · OpenAI · Resend · Cloudflare API ◀────┘
```

Entry files: `http` (the HTTP router), `crons`, `schema`, `auth.config`.

Three ways in, one backend. Every door reaches the same domain owners with the
same authorization ([core-contract.md](core-contract.md), invariant 3).

## Areas

### 1. Identity and sign-in — Keep

- **Does:** one Polynet identity everywhere; sessions; profiles.
- **Code:** `auth`, `authIdentity`, `authActor`, `authSessions`, `authSessionLifecycleCore`,
  `authSessionMaintenanceCore`, `httpAuth`, `httpAuthBridge`, `workosEmailVerification`,
  `profiles`, `profileCore`, `profileRelationshipCore`, `userProfileProjection`,
  `account`, `accountSetupCore`, `secretCrypto` (encryption for stored secrets), `legalAcceptances`; Vercel `api/auth/*`
  (HttpOnly `__Host-` cookies, return-path checks).
- **Reached by:** Studio sign-in (WorkOS AuthKit, Google), `/runtime/auth_*`,
  `/runtime/auth_bridge_session_*`, `/user_management/`.
- **Tables:** `users`, `authSessions`, `userProfileDetails`, `legalAcceptances`.
- **Contracts:** [auth-runtime-setup-workos-authkit.md](auth-runtime-setup-workos-authkit.md),
  [auth-session-target-architecture-v1.md](auth-session-target-architecture-v1.md),
  [auth-money-access-matrix.md](auth-money-access-matrix.md).
- **Hand-run:** `anonymousUserCleanup` (data deletion).

### 2. Communities, membership and joining — Keep

- **Does:** create, configure, archive and restore communities; join (open,
  approval, paid); roles; blocks; Discover.
- **Code:** `communityCore`, `communityLifecycle`, `communityMembershipLifecycle`,
  `communityJoinRequestCore`, `communityAdmin`, `communityPublic`, `communityDirectory`,
  `communityColdArchive`, `communityCapabilityContext`, `communityPresenceCore`,
  `communityAccessAudit`, `communityAccessQueries`, `communityMembershipContextCore`,
  `communityNotificationAccess`, `communityRecipientCore`, `communitySemanticMembers`,
  `memberEntryDestination`, `platformHomeCommunity`.
- **Reached by:** Studio; site join links go to Polynet's `/c/<slug>` join page.
- **Tables:** `communities`, `communityMemberships`, `communityJoinRequests`,
  `communityBlocks`, `communityMemberSettings`, `communityPresence`,
  `communityOnboardingConfigs`, `communityArchiveBillingJobs`.
- **Contracts:** [community-join-request-canonicalization.md](community-join-request-canonicalization.md),
  [community-member-arrival-v1.md](community-member-arrival-v1.md),
  [destructive-lifecycle-quarantine-contract-v1.md](destructive-lifecycle-quarantine-contract-v1.md),
  [url-routing-contract-v1.md](url-routing-contract-v1.md).
- **Deleted Oct 28 (POL-23):** the funnel editor, drafts and publishing, the AI
  funnel builder (the `community_funnel_builder` invocation surface; the value
  stays in stored receipts and evidence only), draft previews, the external
  website link, and the hero-media editor. The join page is plain (it never
  rendered custom content or intro media on the default page). `communityFunnel`
  keeps only four stand-ins for the cached production web
  (`getCommunityFunnelConfig`, `getCommunityFunnelDraftPreview`,
  `setCommunityExternalFunnelUrl`, `setCommunityExternalFunnelActive`); delete
  them after the next production release. `communityFunnels` (validated by
  `communityFunnelValidators`) has no live reader; it holds 6 unpublished drafts
  and 4 unused intro-video links, dropped with Neil's OK.
- **Hand-run:** `communityMaintenance` (purges orphaned user artifacts).
- **Retiring tables:** `communityOnboardingSessions` (no writers),
  `communityOnboardingConfigs`. Deleted Oct 27: `communityFeatured`,
  `communityLaunchSetup`, `communityReadKernel`, `communityOnboarding`.

### 3. Chat — Keep

- **Does:** channels, posts, replies, reactions, mentions, attachments, typing,
  read cursors. One canonical interaction substrate.
- **Code:** `communityInteractions`, `communityChannels`, `communityChannelCore`,
  `communityChannelAccess`, `communityChannelParticipants`, `communityMention*`,
  `communityAttachmentUploads`, `communityAttachmentDownloads`,
  `communityLegacyAttachmentUploads`, `communityInteractionAttachmentBridge`,
  `communityInteractionLegacyAttachments`, `communityInteractionEvidence`,
  `communityInteractionEvidenceCore`, `communityChannelValidators`,
  `communityComposerReplay`, `communityTypingPresenceCore`, `communityReadCursorCore`,
  `communityActivity`, `communityText`, `httpCommunityAttachments`, `communityAttention`;
  legacy bridge `communityChat`, `communityInteractionLegacyBridge`.
- **Tables:** `communityChannels`, `communityChannelParticipants`,
  `communityInteractionRoots`, `communityInteractionReplies`,
  `communityInteractionAttachments`, `communityInteractionEmbeds`,
  `communityInteractionContentBlocks`, `communityInteractionMentions`,
  `communityInteractionReactions`, `communityInteractionModerationEvents`,
  `communityMentionBroadcasts`, `communityTypingPresence`, `communityReadCursors`,
  `communityActivityEvents`.
- **Contracts:** [community-interaction-substrate-contract-v1.md](community-interaction-substrate-contract-v1.md),
  [community-interaction-migration-residue-map.md](community-interaction-migration-residue-map.md),
  [community-private-channels-v1.md](community-private-channels-v1.md).
- **Going:** legacy chat (`communityChatThreads`, `communityChatMessages`,
  `communityMessageReactions`, `communityInteractionLegacyChatLinks`,
  `communityFeaturedMessages`). Studio no longer calls its write path (the newest
  staging row is from late June 2026); the legacy bridge still reads it. Prove
  production matches, then retire.
- **Hand-run:** `communityInteractionBackfill` (needed to finish the legacy chat
  retirement); `communityChannelAudit`, `communityChannelBackfill` (General channel
  migration: delete after two clean production audits, residue map R-009).

### 4. Direct messages — Keep (Studio only)

- **Code:** `directMessages`, `directMessageReadCore`, `directMessageEmails`.
- **Tables:** `dmConversations`, `dmParticipants`, `dmMessages`, `dmBlocks`,
  `dmRateCounters`, `dmTypingPresence`.

### 5. Courses and resources — Keep

- **Does:** courses, lessons, files and source material a community learns from.
- **Code:** `communityResources` (10k lines, a known hot spot),
  `communityResourceContent`, `communityResourceEvidence*`,
  `communityResourceMemoryProjection`, `communitySourceUrlPolicy`,
  `communityBuilderKnowledgeSetup`; Vercel `api/source-url-fetch.js`.
- **Tables:** `communityResourceModules`, `communityResources`,
  `communityResourceContents`, `communitySourceUnits`, `communitySourceUnitContents`,
  `communitySourceCrawlJobs`, `communityResourceBuilderChangesets`.

### 6. Events — Keep

- **Code:** `communityEvents`, `eventReminders` (cron: 24-hour reminder emails).
- **Tables:** `communityEvents`.

### 7. Community memory and cognition — Keep (protected)

- **Does:** turns activity into cited, accepted community memory; member facts.
- **Code:** `communityCompiler*`, `communityIntelligenceDirectory`,
  `communityEvidence*`, `communityCognitionLifecycle`, `communityCognitionCleanupCore`,
  `communityMemoryWorkKey`, `communityMemoryMetabolizer`, `communityWikiArchitect`,
  `memberOntology`,
  `memberOntologyCore`; cron "community
  memory sweep" (`communityAgentHeartbeat`, every 6 hours).
- **Tables:** `communitySourceTraces`, `communityEvidenceCitations`,
  `communityEvidenceRetrievalLogs`, `communityIntelligenceNodes`,
  `communityIntelligenceEdges`, `communityIntelligenceMutations`,
  `communityIntelligenceChangeRequests`, `communityIntelligenceRetrievalLogs`,
  `communityOutcomeObservations`,
  `communityCompilerDigests`, `communityMemoryMetabolizerRuns`, `memberFacts`,
  `memberProfileSpines`.
- **Contracts:** [community-agent-cognition-contract-v1.md](community-agent-cognition-contract-v1.md),
  [community-lineage-ontology-contract-v0.md](community-lineage-ontology-contract-v0.md),
  [community-evidence-integrity-contract-v1.md](community-evidence-integrity-contract-v1.md),
  [member-ontology-contract-v1.md](member-ontology-contract-v1.md).
- **Going:** `personalMemoryItems` and `userMemorySettings` tables (personal-agent
  era; the `personalMemory` module was deleted Oct 27);
  `communityAiFeed*` tables and `communityAiFeedRetirement` (feature retired).
- **Hand-run:** `communityCognitionCleanup` (drains a deleted community's cognition
  data).
- **Retiring tables:** `communityArchiveDocuments` (no writers). Deleted Oct 27:
  `communityAiFeedEvidence`, `communityMemoryHealth`.

### 8. Community agent runtime — Keep (protected)

- **Does:** the one community agent: Agent-page conversations, @mention replies,
  site conversations; tools, streaming, model calls, receipts.
- **Code:** `runtimeAgentLoop`, `runtimeTurn*`, `runtimeContextIntegrity`,
  `runtimeHarnessShaping`, `runtimeHarnessComposition`, `polynetCanonicalExecutor`,
  `communityRepositorySearch`, `threads`, `communityAgent`, `communityAgentRuntime`,
  `communityAgentFilesystem`,
  `communityAgentContext`, `communityAgentChannelAccess`, `communityAgentConcierge*`,
  `communityAgentServeWorker`, `communityAppAgentTurn`, `httpRuntimeRoutes`,
  `httpStreaming`, `fundedInferenceGateway`, `founderInference*`,
  `openAiNativeToolCompletion`, `httpInferenceConfig`, `httpMemberAgentAttachments`, `httpRuntimeSupport`,
  `httpRuntimeTurnState`, `runtimeCancellation`, `runtimeHarnessTelemetry`,
  `runtimeToolCallEvents`; web research:
  `webResearchTools`, `webSearchTypes`, `openAiWebSearchTransport`,
  `fallbackHtmlSearchTransport`.
- **Who pays:** every turn is founder-funded and runs on OpenAI's community model
  (`COMMUNITY_OWNER_FUNDED_MODEL_ID`). `single_inference_provider_contract_proof`
  keeps it that way.
- **Reached by:** `/runtime/runtime_turn`, `/runtime/runtime_cancel`, streaming;
  `/runtime/app/agent` from sites; mention serve requests.
- **Tables:** `threads`, `cloudMessages`, `cloudThreadAttachments`,
  `cloudThreadAttachmentUploadTickets`,
  `runtimeRuns`, `runtimeRunEvents`, `communityAgentConfigs`, `communityAgentRuns`,
  `communityAgentRunEvents`, `communityAgentServeRequests`, `memberAgentChannels`,
  `memberAgentEpisodes`.
- **Contracts:** [native-agent-runtime-context-contract-v1.md](native-agent-runtime-context-contract-v1.md),
  [community-agent-conversations.md](community-agent-conversations.md),
  [community-agent-conversation-end-state-v1.md](community-agent-conversation-end-state-v1.md).
- **Deleted Oct 27 (POL-19):** the global member-agent channel functions
  (`ensureMemberAgentGlobalChannel`, `startNewMemberAgentGlobalEpisode`) and
  `/runtime/list_personal_memory_items`. Stored global conversations stay readable
  as history; `memberAgentChannels` and `memberAgentEpisodes` stay (community
  conversations use them).
- **Going:** the `asPersonalAgent` argument alias (with the rename; old-client
  contract first); internal `personal_agent` and "member agent" names, renamed to
  the community agent.
- **Deleted Oct 27 (POL-10, Neil):** OpenRouter (`openRouterNativeTransport`, the
  failure answer now calls OpenAI directly), the free demo model, Claude, Gemini
  and Grok model entries, xAI web search (`xAiSearchTransport`), own-account
  payment (`chatgptAuth`, `httpChatgpt`, `chatgptResponsesTransport`,
  `providerConnections`), the funding gate queries (`gates`), and the unused model
  registry route (`httpContext`, `modelRegistry`).
- **Deleted Oct 28 (POL-21, Neil):** skills and the skill harness (skill packages,
  community skill attachments, platform and personal skills, `harnessMounts`,
  `harnessSkills`, `runtimeSkillResolution`, `platformSkillRuntime`). What stays:
  `runtimeCommunityResourceLane` resolves each turn's resource lane (fails closed
  without community entry; a community site always gets the member lane), and
  `runtimeHarnessComposition` adds the resources architect instructions
  (`shared/communityResourcesArchitect.ts`) to builder-lane turns only.

### 9. Proactive agent — Keep, growing

- **Does:** the founder's daily brief today; member outreach, journey board and
  programs next ([spec](specs/proactive-community-agent-v0.md)).
- **Code:** `communityFounderBrief` (cron "send due founder briefs", every 15 minutes);
  `stagingSeedBriefLab` (hand-run staging seed).
- **Tables:** `communityFounderBriefSettings`, `communityFounderBriefs`.
- **Going:** member workflows and forms (Studio Workflows tab, rule editor, forms):
  `communityMemberWorkflow*`, `communityWorkflow*`, `communityForm*`,
  `communityAgentServiceWorkflowCore`, `communityMemberServiceChannelCore`; tables
  `communityMemberWorkflows`, `communityMemberWorkflowMemberMilestones`,
  `communityMemberWorkflowTimers`, `communityMemberWorkflowRuns`,
  `communityMemberWorkflowTransitions`,
  `communityForms`, `communityFormVersions`, `communityFormRequests`; cron "advance due
  workflow milestones". The journey-stage idea moves into the agent's board.

### 10. Official Polynet MCP — Keep (protected, builders only)

- **Code:** `httpMcp` (builder gate at the entrance), `platformOperationExecutor`,
  `polynetCanonicalReceipts`; Vercel `api/mcp/*` (OAuth metadata, proxy).
- **Reached by:** `/runtime/mcp`, `/.well-known/oauth-*`.
- **Tables:** `polynetCanonicalOperationReceipts`.
- **Contracts:** [polynet-workspace-mcp-contract-v0.md](polynet-workspace-mcp-contract-v0.md),
  [canonical-platform-operation-contract-v1.md](canonical-platform-operation-contract-v1.md).

### 11. Community sites — Keep (staging only)

- **Does:** each community's own vibe-coded site on `<slug>.polynet.page`:
  sign-in with Polynet, the member experience through the SDK, the shared
  `<polynet-account>` shell, deploys.
- **Code:** `httpCommunityApps`, `communityApps`, `httpCommunitySites`,
  `communitySites`, `communitySiteDeploy`, `communityLive`;
  `infra/community-edge/dispatch/src/` (edge Worker `index.ts`, SDK `sdk.ts`, shell
  `ui.ts`, guide `llms.ts`); `packages/polynet-cli` (`@polynet/cli`: create, check,
  skills, deploy).
- **Reached by:** the edge only (`/runtime/app*`, `/runtime/community_edge/*`,
  edge secret); `/runtime/sites/deploy/*` from the CLI and MCP.
- **Tables:** `communityDomains`, `communitySiteDeploys`, `communityAppSessions`,
  `communityAppHandoffs`.
- **Contracts:** [infra/community-edge/README.md](../infra/community-edge/README.md),
  [research/community-frontend-hosting-20261016.md](research/community-frontend-hosting-20261016.md).
- **Gap:** no production edge yet; the CLI targets staging.

### 12. Billing and money — Keep (risk-high)

- **Does:** founder plan, paid memberships through Stripe Connect, the 2.9%
  application fee, refunds, payouts, usage and cost receipts.
- **Code:** `founderBilling`, `founderPlanCore`, `founderPlanPricing`,
  `founderCheckoutReceiptCore`, `communityBuilderAccessCore`, `billingCore`,
  `communityCommerce*`, `creatorCommerce`, `stripe*`, `httpBilling`,
  `communityApplicationFeeRefundCore`, `founderPaidTool*`, `providerCostCore`,
  `voiceProviderCostAccounting`.
- **Reached by:** `/billing/stripe_webhook` (authoritative), Studio checkout.
- **Tables:** `founderSubscriptions`, `founderUsageCycles`, `checkoutSessions`,
  `purchaseClaims`, `userStripeCustomers`, `communityStripeCustomers`,
  `userStripeConnectAccounts`, `communityPricePoints`, `communitySubscriptions`,
  `communityApplicationFeeRefunds`, `communityApplicationFeeRefundLocks`,
  `communityInferenceReceipts`,
  `communityPaidToolReceipts`, `providerCostEntries`, `userEntitlements`.
- **Contracts:** [auth-money-access-matrix.md](auth-money-access-matrix.md),
  [platform-cost-safety-contract-v1.md](platform-cost-safety-contract-v1.md),
  [product/reference/billing-entitlements.md](product/reference/billing-entitlements.md),
  [legal/](legal/).
- **Direction:** community free, agent paid (about $49 a month with an included
  budget), pending its spec. Today's code still sells the $79 founder plan.
- **Deleted Oct 28 (POL-24):** the `workspaceCredits` module. Voice transcription
  records its platform-absorbed provider cost through
  `voiceProviderCostAccounting.recordVoiceProviderCostInternal` into the shared
  provider cost ledger (`providerCostCore`).
- **Retiring tables (Neil, Oct 27):** `workspaceCreditBalances`,
  `workspaceComputeCharges`, `workspaceUsageCollections`, `creditLedgerEntries`,
  `legacyProgramGrants`; no writers. Still read directly by the operator
  dashboard's credits section and the production release preflight's accounting
  smoke. The 5 customers' unspent credits are recorded privately. Production
  backup first; Neil signs off on the data deletion.
- **Deleted Oct 27:** `entitlements`.

### 13. Email — Keep

- **Code:** `email`, `emailCore`, `emailEvents`, `emailDiagnostics`, `httpEmail`
  (Resend webhook),
  `communityWeeklyDigest*`, `communityMentionEmails`, `communityMentionEmailDelivery`.
- **Crons:** "process pending email outbox" (5 min), "process pending mention
  emails" (15 min), weekly digest.
- **Tables:** `emailOutbox`, `emailDeliveries`, `emailPreferences`,
  `communityWeeklyDigestSchedules`.
- **Dormant by design:** the weekly digest worker
  (`processDueCommunityWeeklyDigestsInternal`) has no cron; schedules are kept
  but nothing sends until a cron is added.

### 14. Operator and diagnostics — Keep (internal)

- **Code:** `operatorAccess`, `operatorDashboard`, `operatorEntitlementsCore`,
  `operatorGrantUsageCore`, `operatorIntelligence`, `operatorSentryDiagnostics`,
  `platformDiagnostics`, `businessAnalytics*`, `distributionAttribution*` (cron),
  `criticalAudit`, `errorLogging`, `probe` (health check).
- **Tables:** `operatorRoles`, `operatorGrantUsageCycles`, `platformDiagnosticEvents`,
  `criticalAuditEvents`, `communityAnalyticsEvents`, `platformBusinessVisits`,
  `distributionAttributionDeliveries`.
- **Contracts:** [platform-diagnostics-contract-v1.md](platform-diagnostics-contract-v1.md).

### 15. Integrations and skills — Deleted (Neil, Oct 27)

- **Deleted Oct 28 (POL-21):** community integrations (Composio, the HubSpot
  pilot, `communityIntegrationConnections` code, integration reads in the agent's
  tools, the integration receipt in paid tools, the callback page) and all skill
  code. `communityIntegrationActions` is a stub answering "not verified" for the
  cached production web's callback page; delete it next release.
- **Deleted Oct 28 (POL-22):** GitHub and Google Drive source import (OAuth,
  listing, import and fetch in `communityResources`, the `httpCommunitySourceIntegrations`
  callback routes, the web gateway calls). Sources imported that way keep their
  text and are labelled by provider, but are never fetched again; a claimed one
  fails closed with `community_source_provider_retired`.
- **Tables (retiring; dropped next release after a production backup, with
  Neil's OK):** `communityIntegrationConnections`, `skillPackages`,
  `skillPackageRevisions`, `userPlatformSkillInstalls`, `communitySkillAttachments`.
  Also `userSourceIntegrationConnections` and `userSourceIntegrationAuthStates`
  (encrypted OAuth tokens: delete with the backup, Neil's sign-off).
- **Retiring tables:** `userProviderConnections`, `userProviderAuthStates`,
  `userProviderDeviceAuthStates` (own-account payment, deleted Oct 27 in POL-10;
  they hold encrypted keys, deleted with Neil's sign-off).
- Deleted Oct 27: `providerConnectionProbes`.

### 16. Voice — Keep

- **Code:** `httpVoice` (`/runtime/voice_transcribe`), `voiceProviderCostAccounting`.

### 17. Polynet Studio — Keep

- **Does:** founders' admin (settings, members, billing, analytics), DMs, the
  Agent page, and today's member experience inside Polynet.
- **Code:** `apps/web` (React, Vite: `App.tsx`, `components/`, `controllers/`),
  `shared/` (gateways and shared UI), `api/` (Vercel functions); backend helper
  `publicAppUrl`.
- **Hosting:** Vercel `polynet` (production, www.polynet.ai) and `polynet-staging`.
- **Known hot spot:** `App.tsx` (3,100 lines).

### 18. Release, CI and the factory — Keep

- **Code:** `scripts/release_gate.mjs` (the release gate: guards, contract
  proofs, every unit test, and `scripts/run_all_checks.mjs` for every remaining
  `check:*` script), `scripts/` (proofs), `.github/workflows/` (`mvp-guards.yml`,
  `secret-scan.yml`, `cla.yml`), `docs/receipts/`.
- **Contracts:** [alpha-release-workflow.md](alpha-release-workflow.md); factory
  rules in [AGENTS.md](../AGENTS.md) §9.

## Scheduled jobs

| Job | Every | Module |
|---|---|---|
| Process pending email outbox | 5 min | `email` |
| Recover distribution attribution deliveries | 5 min | `distributionAttribution` |
| Recover archived community billing cleanup | 5 min | `communityColdArchive` |
| Enqueue 24-hour event reminder emails | 15 min | `eventReminders` |
| Process pending mention emails | 15 min | `communityMentionEmails` |
| Send due founder briefs | 15 min | `communityFounderBrief` |
| Community memory sweep | 6 h | `communityAgentHeartbeat` |
| Advance due workflow milestones | 1 min | `communityMemberWorkflows` (going) |

## Cleanup plan this map drives

1. **Dead code:** done Oct 27 (POL-17). `no_orphan_modules_proof` and
   `system_map_coverage_proof` keep orphans and unmapped modules and tables out.
   Personal-agent leftovers: done Oct 27 (POL-19).
2. **Old features:** Workflows and Forms, the funnel editor, skills and harness,
   integrations. Read-only production usage check first; tables retire over two
   releases.
3. **Legacy chat** retirement.
4. **One agent name:** rename `personal_agent` and "member agent" in code.
5. **Data deletion release:** production backup, then Neil signs off on each
   table's deletion.
