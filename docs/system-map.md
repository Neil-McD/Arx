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
  `account`, `accountSetupCore`, `starterProfile` (a new account's name, photo and handle; Join's terms acceptance), `secretCrypto` (encryption for stored secrets), `legalAcceptances`; Vercel `api/auth/*`
  (HttpOnly `__Host-` cookies, return-path checks).
- **Reached by:** Studio sign-in (WorkOS AuthKit, Google), `/runtime/auth_*`,
  `/runtime/auth_bridge_session_*`, `/user_management/`.
- **Tables:** `users`, `authSessions`, `userProfileDetails`, `legalAcceptances`.
- **Contracts:** [auth-runtime-setup-workos-authkit.md](auth-runtime-setup-workos-authkit.md),
  [auth-session-target-architecture-v1.md](auth-session-target-architecture-v1.md),
  [auth-money-access-matrix.md](auth-money-access-matrix.md).
- **Hand-run:** `anonymousUserCleanup` (data deletion). The retired AI feed, the
  old memory compiler's tables and evidence trail, old archive documents and
  link-preview embeds were emptied and dropped on Nov 7 2026 (local backup kept). The retired onboarding,
  legacy-grant, personal-memory and provider-connection tables were emptied and
  dropped on Nov 7 2026.

### 2. Communities, membership and joining — Keep

- **Does:** create, configure, archive and restore communities; join (open,
  approval, paid) on a community site's own `/join` (on its private twin,
  `communityAppJoin`; paid joins are cash first); roles; blocks; Discover.
  Studio's `/c/<slug>` only hands over to the site (Nov 6).
- **Code:** `communityCore`, `communityLifecycle`, `communityMembershipLifecycle`,
  `communityJoinRequestCore`, `communityAdmin`, `communityPublic`, `communityDirectory`,
  `communityColdArchive`, `communityCapabilityContext`, `communityPresenceCore`,
  `communityAccessAudit`, `communityAccessQueries`, `communityMembershipContextCore`,
  `communityNotificationAccess`, `communityRecipientCore`, `communitySemanticMembers`,
  `communityOntologyCards` (the community card the agent reads, shared/communityOntology.ts),
  `memberEntryDestination`, `platformHomeCommunity`, `communityPeople` (one person, one action, from someone's
  own AI).
- **Reached by:** community sites' `/join` (their private twin); Studio's `/c/<slug>` hands over to it.
- **Rules:** a membership has one `state`: `active`, `left`, `removed`,
  `lapsed` or `payment_hold`. Only `communityMembershipLifecycle` changes it
  (granting is the only way back to `active`); `revokedReason` explains a change
  for the audit trail and never decides access. A payment update never brings
  back someone who left or was removed, and a payment hold (refund or dispute)
  lifts only on a new paid invoice or a won dispute. A ban is a
  `communityBlocks` row on top of `removed`. Leaving keeps the row as `left`
  in every community; leaving again, or "leaving" after a removal, changes nothing.
  Rejoining starts as `member` (an earlier role is never restored);
  an active membership keeps its role through checkout. See
  [community-member-arrival-v1.md](community-member-arrival-v1.md).
- **Tables:** `communities`, `communityMemberships`, `communityJoinRequests`,
  `communityBlocks`, `communityMemberSettings`, `communityPresence`,
  `communityOnboardingConfigs`, `communityArchiveBillingJobs`. Tags on people
  (`communityTags`, `communityMemberTags`) were never used and were dropped Nov 7.
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
  (POL-30). The `communityFunnels` table was emptied and dropped Nov 7.
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
  `communityInteractionAttachmentBridge`, `communityInteractionEvidence`, `communitySearchDocs`
  (search rows, rebuilt in the same write as each post), `communityMemberTimeline`
  (one member's readable posts and replies, members/<handle>/timeline.md),
  `communityInteractionEvidenceCore`, `communityChannelValidators`,
  `communityComposerReplay`, `communityTypingPresenceCore`, `communityReadCursorCore`,
  `communityActivity`, `communityText`, `httpCommunityAttachments`, `communityAttention`,
  `communityChat` (typing presence only; keeps its name for the cached production web).
- **Tables:** `communityChannels`, `communityChannelParticipants`,
  `communityInteractionRoots`, `communityInteractionReplies`,
  `communityInteractionAttachments`, `communityInteractionEmbeds`,
  `communityInteractionContentBlocks`, `communitySearchDocs`, `communityInteractionMentions`,
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
- **Dropped Nov 7 (empty on staging and production):** old chat tables
  `communityChatThreads`, `communityChatMessages`, `communityMessageReactions`,
  `communityInteractionLegacyChatLinks`, `communityFeaturedMessages`. The composer's old inline attachment shape, the `ai_feed` attention
  surface and the `reorderCommunityChannels` stub were deleted once production
  ran 150828216 (POL-30); the composer takes uploaded attachment ids only.
- The General-channel migration finished in production (Nov 7 2026: 453 rows,
  two clean audits) and its backfill and audit are deleted (residue map R-009).

### 4. Direct messages — Keep (Studio only)

- **Code:** `directMessages`, `directMessageReadCore`, `directMessageEmails`.
  Text only since Nov 5 (attachments removed; the two upload-URL mutations
  stay as refusing stubs for one release, for cached Studio pages).
- **Tables:** `dmConversations`, `dmParticipants`, `dmMessages`, `dmBlocks`,
  `dmRateCounters`, `dmTypingPresence`.

### 5. Courses and resources — Keep

- **Does:** courses, lessons, files and source material a community learns from.
- **Code:** `communityResources` registers every resources function (names and
  paths unchanged by the Nov 7 split); its helpers live in
  `communityResourceConstants`, `communityResourceShared`,
  `communityResourceDirectory` (what the agent, MCP and builders read),
  `communityResourceChangesets` (staged builder edits and the health report),
  `communitySourceFetch` (Polynet's URL fetcher, the crawler, text extraction) and
  `communitySourceIngestion` (running ingestion, saving crawled pages);
  `communityResourceContent`, `communityResourceEvidence*`,
  `communityResourceMemoryProjection`, `communitySourceUrlPolicy`,
  `communityBuilderKnowledgeSetup`, `communityLessonProgress` (lessons a member
  marked done, private to them); Vercel `api/source-url-fetch.js`.
- **Tables:** `communityResourceModules`, `communityResources`,
  `communityResourceContents`, `communitySourceUnits`, `communitySourceUnitContents`,
  `communitySourceCrawlJobs`, `communityResourceBuilderChangesets`,
  `communityLessonProgress`.

### 6. Events — Keep

- **Code:** `communityEvents`, `eventReminders` (cron: 24-hour reminder emails).
- **Tables:** `communityEvents`.

### 7. Community notes — Keep (protected)

- **Does:** community notes: short markdown notes every member and the
  community agent read under `memory/`; only owners and admins edit or delete
  them in Studio (Knowledge → Notes). No agent, member or connected AI writes
  them (Nov 5: closed a private-room leak and an injection path). The old
  notes overview (`communityIntelligenceDirectory`) is deleted (Nov 6): nothing
  read it.
- **Code:** `communityNotes`, `communityEvidence*`,
  `communityCognitionLifecycle`, `communityWikiArchitect`; member knowledge stays in
  `memberOntology` and `memberOntologyCore` (`memberFacts`, `memberProfileSpines`).
- **Legacy, until the old tables drop (POL-39 slice 3):** `communityMemoryMigration`
  (one-time copy of old memory into notes), and the unused tables
  `communityIntelligenceNodes`, `communityIntelligenceEdges`,
  `communityIntelligenceMutations`, `communityIntelligenceChangeRequests`,
  `communityIntelligenceRetrievalLogs`, `communitySourceTraces`,
  `communityCompilerDigests`, `communityMemoryMetabolizerRuns`,
  `communityOutcomeObservations`, and `communityAgentRuns` (the old steward's run log; 1,383 rows backed up, emptied and dropped Nov 7).
  The steward, the 6-hour memory sweep, the compiler and the metabolizer were
  deleted on 2026-11-03.
- **Contracts:** [community-agent-cognition-contract-v1.md](community-agent-cognition-contract-v1.md),
  [community-lineage-ontology-contract-v0.md](community-lineage-ontology-contract-v0.md),
  [community-evidence-integrity-contract-v1.md](community-evidence-integrity-contract-v1.md),
  [member-ontology-contract-v1.md](member-ontology-contract-v1.md).
- **Going:** `personalMemoryItems` and `userMemorySettings` tables (personal-agent
  era; the `personalMemory` module was deleted Oct 27);
  `communityAiFeed*` tables and `communityAiFeedRetirement` (feature retired).
- **Retiring tables:** `communityArchiveDocuments` (no writers). Deleted Oct 27:
  `communityAiFeedEvidence`, `communityMemoryHealth`.

### 8. Community agent runtime — Keep (protected)

- **Does:** the one community agent: Agent-page conversations, @mention replies,
  site conversations; tools, streaming, model calls, receipts.
- **Code:** `communityTurnContract` (shared: who speaks, who sees the answer, which layers that allows, and how many recent turns an Ask carries: 20, current turn included; older messages stay stored, unsummarized; and whether the agent may speak in channels: Ask and tag turns only draft posts, the member sends them), `communityNotes` (community notes under memory/: the agent writes them, everyone reads them), `runtimeAgentLoop`, `runtimeKernel` (the loop rules, `RuntimeKernelRun`), `piRuntimeKernel` (the loop engine, on Pi), `runtimeTurn*`, `runtimeContextIntegrity`,
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
  `runtimeRuns`, `runtimeRunEvents`, `communityAgentConfigs`,
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
- **Code:** `communityFounderBrief` (cron "send due founder briefs", every 15 minutes;
  the owner turns it on in Settings → Daily brief, `CommunityFounderBriefSection`);
  `stagingSeedBriefLab` (hand-run staging seed).
- **Tables:** `communityFounderBriefSettings`, `communityFounderBriefs`.
- **Handbook:** `communityHandbook` (the founder-approved handbook: owners and admins
  draft it with the agent, edit and approve it in Studio; members and the agent read
  only the approved text at `handbook.md`). Table: `communityHandbooks`.
- **Retired (Nov 7 2026):** member workflows and forms (the Studio Workflows tab,
  rule editor, forms, member service channels, their MCP actions and the 1-minute
  milestone cron). No workflow ever ran in production. The proactive agent with
  heartbeats does that job, and members' notes and progress live on the members
  page. Their tables (`communityMemberWorkflows`, `communityMemberWorkflowMemberMilestones`,
  `communityMemberWorkflowTimers`, `communityMemberWorkflowRuns`,
  `communityMemberWorkflowTransitions`, `communityForms`, `communityFormVersions`,
  `communityFormRequests`) were emptied (backup kept locally) and dropped the same day.

### 10. Official Polynet MCP — Keep (protected; every role in its own lens)

- **Code:** `httpMcp`, `platformOperationExecutor`, `polynetCanonicalExecutor`
  (member, moderator and builder lenses; selections), `communityOperations`
  (a change to the community itself and its receipt in one transaction),
  `polynetCanonicalReceipts`; Vercel `api/mcp/*` (OAuth metadata, proxy).
- **Reached by:** `/runtime/mcp`, `/.well-known/oauth-*`.
- **Tables:** `polynetCanonicalOperationReceipts`, `memberWriteRateCounters`
  (`memberWriteRateLimit`: a person's writes per minute through their own AI
  or site).
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
  `privateTwinHost` / `siteHostOfTwin` in `checks.mjs` (edge, backend, CLI).
  Page views on a public site are the founder's analytics visits: the edge
  reports each one after the page (`/runtime/app/visit`, a keyed hash of the
  address, no bots or fetches; of the twin only Join, the doorstep, reported as
  the site's) to `recordCommunitySiteVisitInternal`, one per visitor per half
  hour, into `communityAnalyticsEvents` (`funnel_visit`). The funnel's middle
  step, "Started joining", is `funnel_join_started` there
  (`communityFunnelEvents.recordCommunityJoinStarted`): written when a
  `community_join` checkout is created (signed in or guest) and when someone
  joins or asks to join on the twin (`joinCommunityAppVisitorInternal`), one per
  person per community per half hour, keyed by account (`visitorKey`
  `user:<id>`) or, for a signed-out buyer, the keyed visitor hash; analytics
  only, never access. Studio's Analytics shows Page visits → Started joining →
  New members (`join_starts_window`). Join is the community's doorstep (its
  address's front door): the one-liner as the promise, the live courses, the
  About, and the owner's sales sections from `communityPublicPages`
  (`communityPublicPage`, limits in `shared/communityPublicPage.ts`: who it's
  for and not for, first steps, results, founder bio, a YouTube/Vimeo/Loom
  intro video by id, a guarantee, objections; owner-only saves, revision
  checked), each shown only when filled in. Only Join's policy frames anything
  (those three players). Spec:
  [specs/community-site-rails-v0.md](specs/community-site-rails-v0.md).
- **Code:** `httpCommunityApps`, `communityApps`, `communityAppJoin`, `communityFunnelEvents`, `communityPublicPage`, `communityPublic` (Discover's list), `httpCommunitySites`,
  `communitySites`, `communitySiteDeploy`, `communityLive`;
  `infra/community-edge/dispatch/src/` (edge Worker `index.ts`, the private twin
  `twin.ts`, SDK `sdk.ts`, shell `ui.ts`, blocks `blocks/` including `page.ts`
  `personal.ts`, `settings.ts`, `messages.ts` and `join.ts`, guide `llms.ts`); `packages/polynet-cli` (`@polynet/cli`: create, check,
  skills, deploy).
- **Reached by:** the edge only (`/runtime/app*`, `/runtime/community_edge/*`,
  edge secret); `/runtime/sites/deploy/*` from the CLI and MCP.
- **Tables:** `communityDomains`, `communitySiteDeploys`, `communityAppSessions`,
  `communityAppHandoffs`, `communityOwnerApprovals` (a change the owner's AI
  asked for, waiting for the owner's approval in Studio: where members spend
  time; `communityOwnerApprovals.ts`).
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
  `communityBuilderAccessCore`, `billingCore`,
  `communityCommerce*`, `communityCheckoutBuyer` (who a paid join belongs to, and settling it), `creatorCommerce`, `stripe*`, `httpBilling`,
  `communityApplicationFeeRefundCore`, `founderPaidTool*`, `providerCostCore`,
  `voiceProviderCostAccounting`.
- **Reached by:** `/billing/stripe_webhook` (authoritative), Studio's founder
  plan checkout, and community sites' join checkout (section 4).
- Building a community is free: `startPublicBuilderCheckout` (the anonymous
  $79 Builder purchase) refused from Nov 5 and was deleted Nov 6, with Studio's
  own community checkout and join (`startPublicCommunityCheckout`,
  `finalizeCheckoutSession`, `joinPublicCommunity*`). Its recovery path (`createPendingPublicBuilderCheckoutInternal`, the
  recovery email, `founderCheckoutReceiptCore` and the email-hash receipt
  claim) was deleted Nov 6. A founder checkout now needs a signed-in owner;
  one without an owner fails (`founder_subscription_owner_missing`).
- **Tables:** `founderSubscriptions`, `founderUsageCycles`, `checkoutSessions`,
  `userStripeCustomers`, `communityStripeCustomers`,
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
- **Dropped Nov 7 (Neil, Oct 27 and Nov 7):** `workspaceCreditBalances`,
  `workspaceComputeCharges`, `workspaceUsageCollections`, `creditLedgerEntries`
  (358 production rows, last written July 7, backed up locally first) and the
  operator dashboard's tool economics panel that read them. The 5 customers'
  unspent credits are recorded privately.
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
  `platformDiagnostics`, `businessAnalytics*`, `distributionAttribution*` (cron;
  kept on purpose, Nov 7: it forwards sign-ups that arrive from Distribution
  Engineer, Neil's own product, and has had none yet),
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
  callback routes, the web gateway calls). Nov 7: the leftover provider kinds and
  external-source fields went too (no source used them); sources are links and files.
- **Tables:** `communityIntegrationConnections`, `skillPackages`,
  `skillPackageRevisions`, `userPlatformSkillInstalls` and `communitySkillAttachments`
  were emptied and dropped Nov 7, and so were `userSourceIntegrationConnections` and
  `userSourceIntegrationAuthStates` (14 rows of stale OAuth tokens, backed up locally first).
- **Dropped Nov 7:** `userProviderConnections`, `userProviderAuthStates`,
  `userProviderDeviceAuthStates` (own-account payment, deleted Oct 27 in POL-10).
- Deleted Oct 27: `providerConnectionProbes`.

### 16. Voice — Keep

- **Code:** `httpVoice` (`/runtime/voice_transcribe`), `voiceProviderCostAccounting`.

### 17. Polynet Studio — Keep

- **Does:** the back office (founders' admin: settings, members, billing,
  analytics) and Polynet's app, the member experience a community uses by
  default. The owner's switch (Nov 6, `setCommunityMemberExperience`,
  `CommunityMemberExperienceSection`) moves members to the community's own
  deployed site instead; then Studio hands them there
  (`useWebMemberSiteHandoff`). See the routing contract.
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

## Cleanup plan this map drives

1. **Dead code:** done Oct 27 (POL-17). `no_orphan_modules_proof` and
   `system_map_coverage_proof` keep orphans and unmapped modules and tables out.
   Personal-agent leftovers: done Oct 27 (POL-19).
2. **Old features:** the funnel editor, skills and harness, integrations;
   Workflows and Forms retired Nov 7 2026. Read-only production usage check first; tables retire over two
   releases.
3. **Legacy chat** retirement: code done Oct 28 (POL-26); tables drop in step 5.
4. **One agent name:** identity done Oct 28 (POL-27); "community agent" code names next.
5. **Data deletion release:** production backup, then Neil signs off on each
   table's deletion.
