# Polynet system map

Every part of Polynet in one place: what it does, where its code lives, how it is
reached, what it stores, which contract governs it, and whether it stays.
Start here before changing anything, and update this map in the same PR when a
row changes.

Status: written October 27, 2026 from `main` at `d63eb4a63`. Code paths are
`convex/<module>.ts` unless shown otherwise.

**Status column:** **Keep** (core), **Going** (removal planned), **Decide**
(waiting on Neil), **Dead** (no first-party caller found; verify, then delete).

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

Three ways in, one backend. Every door reaches the same domain owners with the
same authorization ([core-contract.md](core-contract.md), invariant 3).

## Areas

### 1. Identity and sign-in — Keep

- **Does:** one Polynet identity everywhere; sessions; profiles.
- **Code:** `auth`, `authIdentity`, `authActor`, `authSessions`, `authSessionLifecycleCore`,
  `authSessionMaintenanceCore`, `httpAuth`, `httpAuthBridge`, `workosEmailVerification`,
  `profiles`, `profileCore`, `accountSetupCore`, `legalAcceptances`; Vercel `api/auth/*`
  (HttpOnly `__Host-` cookies, return-path checks).
- **Reached by:** Studio sign-in (WorkOS AuthKit, Google), `/runtime/auth_*`,
  `/runtime/auth_bridge_session_*`, `/user_management/`.
- **Tables:** `users`, `authSessions`, `userProfileDetails`, `legalAcceptances`.
- **Contracts:** [auth-runtime-setup-workos-authkit.md](auth-runtime-setup-workos-authkit.md),
  [auth-session-target-architecture-v1.md](auth-session-target-architecture-v1.md),
  [auth-money-access-matrix.md](auth-money-access-matrix.md).
- **Dead:** `anonymousUserCleanup`, `emailVerificationRepair`.

### 2. Communities, membership and joining — Keep

- **Does:** create, configure, archive and restore communities; join (open,
  approval, paid); roles; blocks; Discover.
- **Code:** `communityCore`, `communityLifecycle`, `communityMembershipLifecycle`,
  `communityJoinRequestCore`, `communityAdmin`, `communityPublic`, `communityDirectory`,
  `communityColdArchive`, `communityCapabilityContext`, `communityPresenceCore`,
  `platformHomeCommunity`.
- **Reached by:** Studio; site join links go to Polynet's `/c/<slug>` join page.
- **Tables:** `communities`, `communityMemberships`, `communityJoinRequests`,
  `communityBlocks`, `communityMemberSettings`, `communityPresence`,
  `communityOnboardingConfigs`, `communityArchiveBillingJobs`.
- **Contracts:** [community-join-request-canonicalization.md](community-join-request-canonicalization.md),
  [community-member-arrival-v1.md](community-member-arrival-v1.md),
  [destructive-lifecycle-quarantine-contract-v1.md](destructive-lifecycle-quarantine-contract-v1.md),
  [url-routing-contract-v1.md](url-routing-contract-v1.md).
- **Decide:** the funnel editor (`communityFunnel`, `communityFunnels` table,
  Studio funnel editor). Community sites are now the front door; keep only a
  plain join and checkout page?
- **Dead:** `communityFeatured`, `communityLaunchSetup`, `communityMaintenance`,
  `communityReadKernel`, `communityRepositorySearch`; `communityOnboarding` (tests
  only); `communityOnboardingSessions` table (no writers).

### 3. Chat — Keep

- **Does:** channels, posts, replies, reactions, mentions, attachments, typing,
  read cursors. One canonical interaction substrate.
- **Code:** `communityInteractions`, `communityChannels`, `communityChannelCore`,
  `communityChannelAccess`, `communityChannelParticipants`, `communityMention*`,
  `communityAttachmentUploads`, `httpCommunityAttachments`, `communityAttention`;
  legacy bridge `communityChat`, `communityInteractionLegacyBridge`.
- **Tables:** `communityChannels`, `communityChannelParticipants`,
  `communityInteractionRoots`, `…Replies`, `…Attachments`, `…Embeds`,
  `…ContentBlocks`, `…Mentions`, `…Reactions`, `…ModerationEvents`,
  `communityMentionBroadcasts`, `communityTypingPresence`, `communityReadCursors`,
  `communityActivityEvents`.
- **Contracts:** [community-interaction-substrate-contract-v1.md](community-interaction-substrate-contract-v1.md),
  [community-interaction-migration-residue-map.md](community-interaction-migration-residue-map.md),
  [community-private-channels-v1.md](community-private-channels-v1.md).
- **Known duplicate:** legacy chat tables (`communityChatThreads`,
  `communityChatMessages`, `communityMessageReactions`,
  `communityInteractionLegacyChatLinks`, `communityFeaturedMessages`) are still
  written by the legacy bridge. Prove callers, migrate, then retire.
- **Dead:** `communityInteractionBackfill`; `communityChannelAudit`,
  `communityChannelBackfill` (tests only).

### 4. Direct messages — Keep (Studio only)

- **Code:** `directMessages`, `directMessageReadCore`.
- **Tables:** `dmConversations`, `dmParticipants`, `dmMessages`, `dmBlocks`,
  `dmRateCounters`, `dmTypingPresence`.

### 5. Courses and resources — Keep

- **Does:** courses, lessons, files and source material a community learns from.
- **Code:** `communityResources` (10k lines, a known hot spot),
  `communityResourceContent`, `communityResourceEvidence*`,
  `communityResourceMemoryProjection`; Vercel `api/source-url-fetch.js`.
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
  `communityMemoryWorkKey`, `memberOntology`, `memberOntologyCore`; cron "community
  memory sweep" (`communityAgentHeartbeat`, every 6 hours).
- **Tables:** `communitySourceTraces`, `communityEvidenceCitations`,
  `communityEvidenceRetrievalLogs`, `communityIntelligenceNodes`, `…Edges`,
  `…Mutations`, `…ChangeRequests`, `…RetrievalLogs`, `communityOutcomeObservations`,
  `communityCompilerDigests`, `memberFacts`, `memberProfileSpines`.
- **Contracts:** [community-agent-cognition-contract-v1.md](community-agent-cognition-contract-v1.md),
  [community-lineage-ontology-contract-v0.md](community-lineage-ontology-contract-v0.md),
  [community-evidence-integrity-contract-v1.md](community-evidence-integrity-contract-v1.md),
  [member-ontology-contract-v1.md](member-ontology-contract-v1.md).
- **Going:** `personalMemory` and `personalMemoryItems` (personal-agent era);
  `communityAiFeed*` tables and `communityAiFeedRetirement` (feature retired).
- **Dead:** `communityAiFeedEvidence`, `communityCognitionCleanup`,
  `communityMemoryHealth`, `communityMemoryMetabolizer` (+ `communityMemoryMetabolizerRuns`);
  `communityArchiveDocuments` table (no writers).

### 8. Community agent runtime — Keep (protected)

- **Does:** the one community agent: Agent-page conversations, @mention replies,
  site conversations; tools, streaming, model calls, receipts.
- **Code:** `runtimeAgentLoop`, `runtimeTurn*`, `runtimeContextIntegrity`,
  `runtimeHarnessShaping`, `polynetCanonicalExecutor`, `threads`, `communityAgent`,
  `communityAgentContext`, `communityAgentChannelAccess`, `communityAgentConcierge*`,
  `communityAgentServeWorker`, `communityAppAgentTurn`, `httpRuntimeRoutes`,
  `httpStreaming`, `modelRegistry`, `fundedInferenceGateway`, `founderInference*`,
  `chatgptResponsesTransport`, `openAiNativeToolCompletion`, web research transports.
- **Reached by:** `/runtime/runtime_turn`, `/runtime/runtime_cancel`, streaming;
  `/runtime/app/agent` from sites; mention serve requests.
- **Tables:** `threads`, `cloudMessages`, `cloudThreadAttachments`,
  `runtimeRuns`, `runtimeRunEvents`, `communityAgentConfigs`, `communityAgentRuns`,
  `communityAgentRunEvents`, `communityAgentServeRequests`, `memberAgentChannels`,
  `memberAgentEpisodes`.
- **Contracts:** [native-agent-runtime-context-contract-v1.md](native-agent-runtime-context-contract-v1.md),
  [community-agent-conversations.md](community-agent-conversations.md),
  [community-agent-conversation-end-state-v1.md](community-agent-conversation-end-state-v1.md).
- **Going:** personal-agent leftovers (global member-agent channel,
  `/runtime/list_personal_memory_items`, personal skills, the `asPersonalAgent`
  alias); internal `personal_agent` and "member agent" names, renamed to the
  community agent; `openRouterNativeTransport`, `xAiSearchTransport` (POL-10).
- **Decide:** harness mounts and skills (`harnessMounts`, `harnessSkills`,
  `runtimeHarnessComposition`, `runtimeSkillResolution`).
- **Dead:** `communityAgentFilesystem`.

### 9. Proactive agent — Keep, growing

- **Does:** the founder's daily brief today; member outreach, journey board and
  programs next ([spec](specs/proactive-community-agent-v0.md)).
- **Code:** `communityFounderBrief` (cron "send due founder briefs", every 15 minutes).
- **Tables:** `communityFounderBriefSettings`, `communityFounderBriefs`.
- **Going:** member workflows and forms (Studio Workflows tab, rule editor, forms):
  `communityMemberWorkflow*`, `communityWorkflow*`, `communityForm*`; tables
  `communityMemberWorkflows`, `…MemberMilestones`, `…Timers`, `…Runs`, `…Transitions`,
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
  `communityApplicationFeeRefunds`, `…RefundLocks`, `communityInferenceReceipts`,
  `communityPaidToolReceipts`, `providerCostEntries`, `userEntitlements`.
- **Contracts:** [auth-money-access-matrix.md](auth-money-access-matrix.md),
  [platform-cost-safety-contract-v1.md](platform-cost-safety-contract-v1.md),
  [product/reference/billing-entitlements.md](product/reference/billing-entitlements.md),
  [legal/](legal/).
- **Direction:** community free, agent paid (about $49 a month with an included
  budget), pending its spec. Today's code still sells the $79 founder plan.
- **Decide:** retired Workspace money tables (`workspaceCreditBalances`,
  `workspaceComputeCharges`, `workspaceUsageCollections`, `creditLedgerEntries`,
  `legacyProgramGrants`, `workspaceCredits` module); no writers found.
- **Dead:** `entitlements`; `communityApplicationFeeRefunds` (tests only; the core
  module is live).

### 13. Email — Keep

- **Code:** `email`, `emailCore`, `emailEvents`, `httpEmail` (Resend webhook),
  `communityWeeklyDigest*`, `communityMentionEmails`, `communityMentionEmailDelivery`.
- **Crons:** "process pending email outbox" (5 min), "process pending mention
  emails" (15 min), weekly digest.
- **Tables:** `emailOutbox`, `emailDeliveries`, `emailPreferences`,
  `communityWeeklyDigestSchedules`.

### 14. Operator and diagnostics — Keep (internal)

- **Code:** `operatorAccess`, `operatorDashboard`, `operatorEntitlementsCore`,
  `operatorGrantUsageCore`, `operatorIntelligence`, `operatorSentryDiagnostics`,
  `platformDiagnostics`, `businessAnalytics*`, `distributionAttribution*` (cron),
  `criticalAudit`, `errorLogging`.
- **Tables:** `operatorRoles`, `operatorGrantUsageCycles`, `platformDiagnosticEvents`,
  `criticalAuditEvents`, `communityAnalyticsEvents`, `platformBusinessVisits`,
  `distributionAttributionDeliveries`.
- **Contracts:** [platform-diagnostics-contract-v1.md](platform-diagnostics-contract-v1.md).

### 15. Integrations and skills — Decide

- **Code:** `communityIntegration*`, `providerConnections`, `providerConnectionProbes`,
  `httpCommunitySourceIntegrations` (GitHub and Google Drive callbacks),
  `composioConnectionAdapter`, `hubspotPilotContract`, `integrationVerificationPilot`,
  `skillCore`, `skillPackages`, `userPlatformSkills`, `platformSkillRuntime`,
  `communitySkillAttachments`.
- **Tables:** `userProviderConnections`, `userProviderAuthStates`,
  `userProviderDeviceAuthStates`, `userSourceIntegrationConnections`,
  `userSourceIntegrationAuthStates`, `communityIntegrationConnections`,
  `skillPackages`, `skillPackageRevisions`, `userPlatformSkillInstalls`,
  `communitySkillAttachments`.
- **Contracts:** [skill-harness-contract.md](skill-harness-contract.md).
- **Dead:** `communityIntegrationConnections` module, `communitySkillAttachments`
  module, `providerConnectionProbes`, `userPlatformSkills`.

### 16. Voice — Keep

- **Code:** `httpVoice` (`/runtime/voice_transcribe`), `voiceProviderCostAccounting`.

### 17. Polynet Studio — Keep

- **Does:** founders' admin (settings, members, billing, analytics), DMs, the
  Agent page, and today's member experience inside Polynet.
- **Code:** `apps/web` (React, Vite: `App.tsx`, `components/`, `controllers/`),
  `shared/` (gateways and shared UI), `api/` (Vercel functions).
- **Hosting:** Vercel `polynet` (production, www.polynet.ai) and `polynet-staging`.
- **Known hot spot:** `App.tsx` (3,100 lines).

### 18. Release, CI and the factory — Keep

- **Code:** `scripts/release_gate.mjs` (the release gate: guards and contract
  proofs), `scripts/` (proofs), `.github/workflows/` (`mvp-guards.yml`,
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

1. **Dead code:** delete the modules marked Dead after checking each one by hand
   (some may be operator tools run by hand), plus the personal-agent leftovers.
2. **Workflows and forms:** remove after a read-only production usage check;
   tables retire over two releases.
3. **One agent name:** rename `personal_agent` and "member agent" in code.
4. **Decisions:** funnel editor, harness and skills, Workspace money tables,
   integrations.
