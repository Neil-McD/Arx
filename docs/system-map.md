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
  approval, paid), from Studio's funnel and from a community site's own
  `/join` (on its private twin, `communityAppJoin`, through the same cores and
  checkout); roles; blocks; Discover.
- **Code:** `communityCore`, `communityLifecycle`, `communityMembershipLifecycle`,
  `communityJoinRequestCore`, `communityAdmin`, `communityPublic`, `communityDirectory`,
  `communityColdArchive`, `communityCapabilityContext`, `communityPresenceCore`,
  `communityAccessAudit`, `communityAccessQueries`, `communityMembershipContextCore`,
  `communityNotificationAccess`, `communityRecipientCore`, `communitySemanticMembers`,
  `memberEntryDestination`, `platformHomeCommunity`.
- **Reached by:** Studio (`/c/<slug>`); community sites' `/join` (their private twin).
- **Rules:** rejoining starts as `member` (an earlier role is never restored);
  an active membership keeps its role through checkout. See
  [community-member-arrival-v1.md](community-member-arrival-v1.md).
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
  rendered custom content or intro media on the default page; `communityPublic`
  returns the plain default). The `communityFunnel` module and its four stand-ins
  for the cached production web were deleted after production moved to 150828216
  (POL-30). `communityFunnels` (validated by
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
  `communityInteractionAttachmentBridge`, `communityInteractionEvidence`,
  `communityInteractionEvidenceCore`, `communityChannelValidators`,
  `communityComposerReplay`, `communityTypingPresenceCore`, `communityReadCursorCore`,
  `communityActivity`, `communityText`, `httpCommunityAttachments`, `communityAttention`,
  `communityChat` (typing presence only; keeps its name for the cached production web).
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
- **Deleted Oct 28 (POL-26):** the old thread chat code: its reads, writes,
  reactions, ticketed upload route, dual-write adapter and backfill
  (`communityLegacyAttachmentUploads`, `communityInteractionLegacyAttachments`,
  `communityInteractionLegacyBridge`, `communityInteractionBackfill`). Production
  had 92 of 92 old messages copied into the new chat and none had attachments.
- **Going (table-drop release):** old chat tables `communityChatThreads`,
  `communityChatMessages`, `communityMessageReactions`,
  `communityInteractionLegacyChatLinks`, `communityFeaturedMessages`. Anonymous-user
  cleanup and orphan maintenance still delete their rows for removed users until
  then. The composer's old inline attachment shape, the `ai_feed` attention
  surface and the `reorderCommunityChannels` stub were deleted once production
  ran 150828216 (POL-30); the composer takes uploaded attachment ids only.
- **Hand-run:** `communityChannelAudit`, `communityChannelBackfill` (General channel
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
  `openAiNativeToolCompletion`, `httpInferenceConfig`, `httpCommunityAgentAttachments`, `httpRuntimeSupport`,
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
- **Two permission modes, one agent (Oct 28, POL-27):** `community_agent` acts on
  its own (@mention replies, founder brief, memory work); `community_agent_for_member`
  acts inside one member's permissions (Agent page, sites). All `member-agent`
  conversations, including the retired personal agent's global episodes, are
  read-only history. `one_agent_identity_proof` keeps the retired `personal_agent`
  value on stored history only (`shared/communityAgentIdentity.ts`).
- **Deleted Oct 28 (POL-30):** the `asPersonalAgent` composer flag (production
  150828216 never sends it).
- **Going:** stored `personal_agent` values on 14 posts, 4 replies and 9 receipts (rewritten in
  the table-drop release with Neil's OK); "community agent" code names (step 2b).
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
  sign-in with Polynet, the member experience through the SDK (chat with
  unread, mentions, typing and who's online; member profiles; events, courses,
  memory, the agent), the shared `<polynet-account>` shell, deploys. Every
  site is its own world (Oct 28): it ships a frame (`/frame.html`, its header,
  nav and footer around one `<polynet-page>`), and the edge serves that frame
  at Polynet's standard pages (`/chat`, `/people[/<handle>]`,
  `/events[/<event>]`, `/learn[/<course>[/<lesson>]]`, `/knowledge`, `/ask`,
  `/discover`) unless the site has its own file there; `<polynet-page>` fills
  it with Polynet's blocks (`<polynet-channels>`, `<polynet-chat>`,
  `<polynet-members>`, `<polynet-events>`, `<polynet-learn>`,
  `<polynet-knowledge>`, `<polynet-ask>`, `<polynet-discover>`, served from
  `blocks/`) over the SDK's events, resources, memory and private agent
  conversation. `/discover` is public: the edge's `/__polynet/discover`
  (cached a minute) reads `communityPublic.listSiteDiscoverCommunitiesInternal`
  (published, active, operational; the list Studio's Discover uses) through
  `/runtime/community_edge/discover`, and links each card to that
  community's own site, else its Studio page. Blocks style themselves with
  adopted stylesheets, so a site's `style-src 'self'` CSP doesn't break them. The route table is `STANDARD_PAGES` in
  `packages/polynet-cli/checks.mjs`, whose site checks fail `polynet check`,
  CLI and MCP deploys without the frame, or when a site's own standard page
  lacks its blocks. Sites style them only through tokens, `::part()`, slots
  and the page's `.pn-page-*` classes. A member's own pages (`/communities`,
  `/settings`, `/messages` and `/join`) live on the
  site's **private twin**, `<slug>--me<suffix>.polynet.page`: the edge draws
  the site's frame there with every script, handler and dangerous URL
  stripped (`twin.ts`, HTMLRewriter), adds only Polynet's scripts under a
  `script-src 'self'` policy, and `<polynet-personal>` (`blocks/personal.ts`)
  renders inside `<polynet-page>`. The twin's origin is registered beside the
  site's at deploy (`communityDomains.kind = "private"`); a session minted
  there is `kind: "private"` (`communityAppSessions.kind`), and personal
  endpoints (`/runtime/app/me/*`, the edge's `/__polynet/me/*`) refuse every
  other session and 404 on the site. Messages runs the helpers Studio's DM
  functions run (`directMessages`, `...ForTrustedUserInternal`) and goes live
  through `communityLive.watchMessages`, which answers only a private
  session's watch token, with versions only. Join (`communityAppJoin`) works
  signed out and is the one page for someone not yet a member (the twin's
  sign-in mints them a private session for it): Studio's funnel projection,
  join core and checkout, back to the twin's `/join`, with membership only from
  the webhook's record. The site <-> twin host mapping is
  `privateTwinHost` / `siteHostOfTwin` in `checks.mjs` (edge, backend, CLI). Spec:
  [specs/community-site-rails-v0.md](specs/community-site-rails-v0.md).
- **Code:** `httpCommunityApps`, `communityApps`, `communityAppJoin`, `communityPublic` (Discover's list), `httpCommunitySites`,
  `communitySites`, `communitySiteDeploy`, `communityLive`;
  `infra/community-edge/dispatch/src/` (edge Worker `index.ts`, the private twin
  `twin.ts`, SDK `sdk.ts`, shell `ui.ts`, blocks `blocks/` including `page.ts`
  `personal.ts`, `settings.ts`, `messages.ts` and `join.ts`, guide `llms.ts`); `packages/polynet-cli` (`@polynet/cli`: create, check,
  skills, deploy).
- **Reached by:** the edge only (`/runtime/app*`, `/runtime/community_edge/*`,
  edge secret); `/runtime/sites/deploy/*` from the CLI and MCP.
- **Tables:** `communityDomains`, `communitySiteDeploys`, `communityAppSessions`,
  `communityAppHandoffs`.
- **Contracts:** [infra/community-edge/README.md](../infra/community-edge/README.md),
  [research/community-frontend-hosting-20261016.md](research/community-frontend-hosting-20261016.md).
- **Addresses (Oct 28, POL-34):** production `<slug>.polynet.page`, staging
  `<slug>-staging.polynet.page` on the same domain (`POLYNET_SITES_HOST_SUFFIX`);
  production refuses names ending in `-staging`, and no site name ends in
  `--me` (each site's private twin is `<slug>--me<suffix>.polynet.page`). The
  CLI targets production by default (`--staging` for staging).
- **Gap:** the production edge, namespace and settings are set up after POL-34's
  code ships.
- **Staging seed:** `stagingSeedSunrise` (hand-run, refuses unless
  `POLYNET_ALLOW_SEED=1`). `seedSunriseInternal({ communityId, ownerUserId? })`
  fills one community (Sunrise Climbing Club on staging) with four simulated
  members (one moderator), a Beta channel, posts with replies and reactions, a
  member post that @-mentions the owner (an unread mention), five events (three
  upcoming, one past, one cancelled), the "Board basics" course and three
  memories; rerunning replaces it. `simulateSunriseLiveInternal({ communityId,
  action: "presence" | "typing" | "post", memberKey?, channelSlug?, text? })` is
  the second person for live checks: presence and typing leases, or a real post
  through the member composer.

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
  emails" (15 min). The weekly digest has no cron (see below).
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
  code. The `communityIntegrationActions` stub for the old callback page was
  deleted once production ran 150828216 (POL-30).
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

### 19. Fork additions — Proposed (each needs Neil's OK and its own PR)

Built in the2hourclo/Polynet and tested there; listed so the map stays whole.

- **Looks:** themes, layouts and brands per community, saved themes, a
  member's own layout choice. Code: `communityThemes`, `communityLayouts`,
  `communityBrands`, `communitySavedThemes`. Tables: `communityThemes`,
  `communityLayouts`, `communityBrands`, `communitySavedThemes`,
  `communityMemberLayoutPreferences`.
- **Lessons and progress:** lesson validators, per-member progress, page
  revisions, skill tracks, YouTube chapters, embed values. Code:
  `communityLessonValidators`, `communityResourceProgress`,
  `communityLessonTracks`, `youtubeChapters`, `communityEmbedValues`. Tables:
  `communityResourceProgress`, `communityResourceRevisions`,
  `communityLessonTracks`, `youtubeVideoChapters`, `communityEmbedValues`.
- **Post cards:** polls and forms shared in posts. Code: `communityPostCards`,
  `communityPostCardRead`. Tables: `communityInteractionPolls`,
  `communityInteractionPollVotes`, `communityInteractionFormShares`,
  `communityInteractionFormResponses`.
- **Members database:** properties, values, events, saved views, bulk actions,
  referrals. Code: `communityClients`. Tables: `communityClientProperties`,
  `communityClientValues`, `communityClientSettings`, `communityClientEvents`,
  `communityClientViews`, `communityClientBulkActions`, `communityReferrals`.
- **Pods:** invite-only rooms in Classroom. Code: `communityPods`.
- **Offers (risk-high):** the offer ladder and upgrades. Code:
  `communityOffers`, `communityOfferAccessCore`, `communityOfferCheckout`.
  Tables: `communityOffers`.
- **Access integrations (risk-high):** outside services that check who may use
  them, license keys, Continue with Polynet. Code: `communityAccess`,
  `communityAccessSecrets`, `communityAccessSync`, `httpCommunityAccess`.
  Tables: `communityAccessGrants`, `communityAccessMembers`,
  `communityMemberLicenseKeys`, `communityAccessIntegrations`,
  `communityAccessSignInCodes`, `communityAccessDeliveryStates`,
  `communityAccessEvents`.
- **Test members (risk-high, touches sign-in):** an owner goes through the
  community as a new member. Code: `communityTestMembers`,
  `communityTestMemberCore`, `communityTestMemberAutoplay`. Tables:
  `communityTestMembers`.
- **Agent parity:** every Settings change as an agent operation, and changes an
  owner applies. Code: `polynetBuilderSettings`, `polynetMemberSelfSettings`,
  `communitySettingProposals`. Tables: `communitySettingProposals`.

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
3. **Legacy chat** retirement: code done Oct 28 (POL-26); tables drop in step 5.
4. **One agent name:** identity done Oct 28 (POL-27); "community agent" code names next.
5. **Data deletion release:** production backup, then Neil signs off on each
   table's deletion.
