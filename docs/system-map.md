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
  ├─ Polynet Studio          polynet.ai (apps/web)  → Vercel functions (api/) ─────────────────┐
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

- **Does:** create, configure, archive and restore communities; the
  community's landing page at `/c/<slug>` in the app (Nov 13), where people
  join (open, approval, paid; paid joins are cash first: a signed-out buyer's
  checkout goes through the app's `api/community-checkout.js`, which limits
  each visitor; shared links get the community's preview from
  `api/community-page.js`); roles; blocks; Discover.
- **Code:** `communityLanding` (the landing page: its read, join, cancel,
  checkout, finish and visit count, over `communityAppJoin`'s projection),
  `httpCommunityLanding` (a signed-out buyer's checkout, from the app's server
  function only), `communityApps` (whether the community's agent answers),
  `communityFunnelEvents` (join-started counts for Analytics),
  `communityPublicPage` (the retired public-page editor the cached production
  app still calls; its stored copy is the `communityPublicPages` table),
  `communityCore`, `communityLifecycle`, `communityMembershipLifecycle`,
  `communityJoinRequestCore`, `communityAdmin`, `communityAdminAnalyticsCore`,
  `communityAdminBillingHistoryCore`, `communityAdminAdmissionsCore`, `communityPublic`, `communityDirectory`,
  `communityMemberSearch` (per-community searchable member index for fast `@` mention autocomplete, synced on membership/profile writes and backfilled asynchronously),
  `communityColdArchive`, `communityCapabilityContext`, `communityPresenceCore` (90-second presence leases with 15-second server-side heartbeat write coalescing and parallel online-member resolution),
  `communityAccessAudit`, `communityAccessQueries`, `communityMembershipContextCore`,
  `communityNotificationAccess`, `communityRecipientCore`, `communitySemanticMembers`,
  `communityOntologyCards` (the community card the agent reads, shared/communityOntology.ts),
  `communityMemberRecords` (Members for people who manage members: plan and price per person, money states,
  past members, one member's record with host-only notes and who did what; docs/design/members-invariants.md),
  `communityMemberProfiles` (Members for members: who is here, and the one profile of a person that channels and Members both open, `apps/web/src/v1/KitProfile.tsx`),
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
- **Tables:** `communities`, `communityMemberships`, `communityMemberSearch`, `communityMemberViewCounts`, `communityJoinRequests`, `communityMemberNotes`,
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
- **Code:** `communityInteractions`, `communityInteractionMentionsCore`,
  `communityInteractionBundlesCore`, `communityChannels`, `communityChannelCore`,
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

- **Code:** `directMessages`, `directMessageReadCore`, `directMessageEmails`;
  files in `directMessageAttachmentCore` (what a send may claim, what a read
  returns), `directMessageAttachments` (internal only: reserve, finish, clean
  up, resolve a download) and `httpDirectMessageAttachments` (the signed-in
  upload and download routes).
- **Files (Nov 17):** removed on Nov 5 because a send trusted a storage id from
  the browser; back, the way channels do theirs. The server reserves a row for
  the sender and the conversation (or, for a first message, the person),
  stores the bytes itself, reads the type from the bytes and finishes the row
  against what storage holds. A send names files by reservation id only and
  may claim only the sender's own finished upload, once, for that
  conversation. A message's files are read from their rows, never from its
  JSON, and the bytes are streamed only to an active participant. An unsent
  reservation is deleted after 30 minutes or when the sender removes it. Same
  limits and types as channel attachments (`shared/communityAttachmentPolicy`).
  Files from before Nov 5 have no row and are not served.
- **Tables:** `dmConversations`, `dmParticipants`, `dmMessages`, `dmBlocks`,
  `dmRateCounters`, `dmTypingPresence`, `dmAttachments`.

### 5. Courses and resources — Keep

- **Does:** courses, lessons, files and source material a community learns from.
- **Code:** `communityResources` registers every resources function (names and
  paths unchanged by the Nov 7 split); its helpers live in
  `communityResourceConstants`, `communityResourceShared`,
  `communityResourceDirectory` (what the agent, MCP and builders read),
  `communityResourceChangesets` (staged builder edits and the health report),
  `communitySourceFetch` (Polynet's URL fetcher and text extraction) and
  `communitySourceIngestion` (running ingestion);
  `communityResourceContent`, `communityResourceEvidence*`,
  `communityResourceMemoryProjection`, `communitySourceUrlPolicy`,
  `communityBuilderKnowledgeSetup`, `communityLessonProgress` (lessons a member
  marked done; hosts see each member's progress in a course, nobody else), `communityLessonFiles` (files under a lesson:
  reserve, finish, attach on Save, clean up, resolve a download) and
  `httpCommunityLessonFiles` (the signed-in upload and download routes);
  Vercel `api/source-url-fetch.js`.
- **Lesson files (Nov 18):** under a lesson, beside its links, 12 at most
  together. A host's upload streams through `/runtime/lesson_file_upload` the
  way channel attachments do (type read from the bytes, up to 100 MB each,
  `shared/lessonFiles`) into a pending row that Save attaches; one never
  saved is deleted after a day. `/runtime/lesson_file_download` streams the
  bytes as a download only to a course editor, or to a current member while
  the lesson is visible to members, asked again on every request. Removing
  a file, or deleting its lesson or course, deletes its bytes. AIs read a
  lesson's files by name, type and size only, and cannot add or remove one.
- **Tables:** `communityResourceModules`, `communityResources`,
  `communityResourceContents`, `communitySourceUnits`, `communitySourceUnitContents`,
  `communitySourceCrawlJobs`, `communityResourceBuilderChangesets`,
  `communityLessonProgress`, `communityCourseProgress`, `communityLessonFiles`.

### 6. Events — Keep

- **Code:** `communityEvents`, `eventReminders` (cron: 24-hour reminder emails),
  no "I'll be there" (removed Nov 14; its table and rows went Nov 16).
- **Tables:** `communityEvents`.

### 7. Community notes — Keep (protected)

- **Does:** community notes: short markdown notes that are the guide's memory.
  The community agent reads them under `memory/` to answer; owners and admins
  read, edit and delete them (Knowledge → What your guide knows). Since Nov 14
  a member is never handed them: not in the app, not through their own AI
  (MCP), not in search, Home or a channel. Members get them through answers. No member or connected AI writes
  them (Nov 5: closed a private-room leak and an injection path). Since Nov 15
  the guide writes its own notes again, only through one checked write
  (`communityMemory`, docs/specs/agent-system-slice-1.md): each cites the
  open-channel posts it came from, never changes a builder's note, and a
  builder can undo one note or a whole review. The old
  notes overview (`communityIntelligenceDirectory`) is deleted (Nov 6): nothing
  read it.
- **Code:** `communityNotesStore` (the one door to memory records, by scope), `communityNotes`, `communityMemory` (tables `communityNoteRevisions`,
  `communityNoteRemovals`, `communityMemoryIndex`, `agentWork`, `agentWorkRuns`, `communityReplyDrafts`, `communityMemberCoachSettings`, `communityMemberCoachDrafts`),
  `agentWork` (the guide's work with nobody present: claiming and completing a
  work row, and the one run every kind goes through),
  `communityMemoryReview` (the guide's nightly review: made due by posts in open
  channels, run on the shared run entry `communityAgentRun` in one pass: the
  server hands the guide memory.md, the notes and the new posts, and it writes
  once with `memory.apply`; each note is filed where it belongs on the
  community brain, under the lesson it adds to or a short subject, and notes
  that exist are filed without being rewritten), `communityBriefs` (a place's brief, table
  `communityBriefs`: written by the guide after new posts in a place, the
  community's open channels or a pod's own room where the guide works, at
  most every three hours, on the same run entry in one request, with one
  `brief.write`: a summary of one to three sentences and the posts it drew
  on, or nothing when the posts are only noise; read back as
  `brief.md` and `pods/<pod>/brief.md` through one reader, `readPlaceBrief`;
  the same reader feeds Home's middle column and the first part of a pod's
  right panel, `getPlaceBrief`; `communityReplyDrafts` (table
  `communityReplyDrafts`: proactive community participant replies. A post in an
  open channel, or in a pod where the guide is seated, makes that scope's row
  due a day later; the run takes the oldest unanswered question, shows the guide
  matching published lessons and strictly scoped notes (community notes in open
  channels; community notes plus that pod's own notes in a seated pod — never
  another pod's notes or private member data), and with one `reply.draft` writes
  a cited reply or nothing. Draft mode by default in Home's "Your guide
  suggests"; when the owner turns on `autoReplyEnabled`, daytime cited replies
  post automatically within caps: 3/day community-wide, 1/day per pod); `communityMemberCoach` (tables
  `communityMemberCoachSettings`, `communityMemberCoachDrafts`: Proactive Member
  Coach, slice 1 of `proactive-community-agent-v0.md`. Hourly bounded scan spots
  quiet newcomers, stalled course learners, and quiet members before an event,
  enforces interruption-budget caps and quiet hours, runs a silence-by-default
  judge on consented self facts only, queues drafts in "Your guide suggests" by
  default or auto-sends per reason into the member's private Agent thread, and
  honors per-member opt-out on `communityMemberSettings.coachMuted`); `communityChiefOfStaff` (Founder Chief of Staff signals, slice 3 of `proactive-community-agent-v0.md`: waiting approvals, proactive guide outcomes, stalled course learners, quiet paying members, rising contributors, and pod health counts — fed into both the daily Founder Brief and owner/admin `builder/analytics.json`, never exposing private member chats or private pod message text); `communityGuidePictures` (the pictures a person attached in their talk, found again from the guide's run so a post or reply can carry them: only this person's, this talk's, images within the limits, copied into files of the post's own); `communityGuideQuestions` (tables
  `communityGuideQuestions`, `communityGuideAlwaysAllowed`: what the guide
  asks a person before doing something for them in their private talk. The
  executor saves a channel write or a removal instead of running it and
  answers `waiting_for_person`; `KitGuideAsks` shows it above the box where
  they type; `answerGuideQuestion` runs the same call as them on yes.
  "Always allow posts" is per person per community); `shared/actionTools.ts`
  (one named tool per action, generated from the one list and translated
  into the calls the executor already runs: a person's own AI is shown theirs
  over the MCP, `mcpActionTools` deciding which, and the guide's private talk
  is given the ones its person may use in that community, `talkToolNames`); `communityKnowledgeUse` keeps one row of counts per community
  per day of the notes and lessons answers opened, added hours later at a
  random time so nothing traces to a conversation, for how much each is used
  and what is answered together; `communityBrain` (`getBrainMap`) reads it all
  into one map per viewer: courses and lessons, what was learned and where it
  is filed, the pods they can enter, and what is answered together, with the
  same naming rules; `shared/communityBrainLayout.ts` places it by its links (a
  course is a loose cluster of its lessons; what is answered together pulls
  together; the same map always gives the same picture), and `KitBrainMap` draws it;
  the panels' "community brain" (`PanelBrain` in `KitBrain`: a count, a small
  map with no words once at least three total nodes exist across published
  lessons, notes, and pods, and the latest names) reads the same map: counts
  for everyone in the community, every title for a builder, and for a member
  only titles learned from posts they can read;
  `KitBrainPage` is the map as a page in Knowledge, and `getBrainNote` reads
  one picked thing with the same rules: a member never gets a note's text),
  `communityEvidence*`,
  `communityCognitionLifecycle`, `communityWikiArchitect`; member knowledge stays in
  `memberOntology` and `memberOntologyCore` (`memberFacts`, `memberProfileSpines`, no
  longer read; dropped in a later release); people facts, one view of a person
  cut by lens (member, self, builder) for every agent, are `communityPersonFacts`;
  personal memory, what the guide remembers about one member from their own
  private talks (`members/me/memory.md`, read by that member only), is
  `memberMemory` (`memberMemories`) with its rules in `shared/personalMemory.ts`.
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
- **Code:** `communityTurnContract` (shared: who speaks, who sees the answer, which layers that allows, and how many recent turns an Ask carries: 20, current turn included; older messages stay stored, unsummarized; and whether the agent may speak in channels: Ask and tag turns only draft posts, the member sends them), `communityNotes` (community notes under memory/: hosts write them in Knowledge, everyone reads them), `runtimeAgentLoop` (a private talk's context, then the run entry `communityAgentRun`), `runtimeKernel` (the loop rules, `RuntimeKernelRun`), `piRuntimeKernel` (the loop engine, on Pi), `runtimeTurn*`, `runtimeContextIntegrity`,
  `runtimeHarnessShaping`, `polynetCanonicalExecutor`,
  `communityRepositorySearch`, `threads`, `threadAttachmentsCore`, `threadWorkingStateCore`, `communityAgent`, `communityAgentRuntime`,
  `communityAgentFilesystem`,
  `communityAgentContext`, `communityAgentChannelAccess`, `communityAgentConcierge*`,
  `communityAgentServeWorker`, `agentTools` (the one router for the guide's tools: a run gets its lens's tools, `LENS_TOOLS` in `shared/lens.ts`, and any other tool is refused), `stagingGuideEval` (staging only, hand-run: one request through a private talk's real loop with what the guide did handed back, for measuring a change to its instructions or tools; `scripts/guide_eval.mjs` holds the requests and their checks), `httpRuntimeRoutes`,
  `httpStreaming`, `fundedInferenceGateway`, `founderInference*`,
  `openAiNativeToolCompletion`, `httpInferenceConfig`, `httpCommunityAgentAttachments`, `httpRuntimeSupport`,
  `httpRuntimeTurnState`, `runtimeCancellation`,
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
  each turn's resource lane follows the private talk's lens (`TalkLens` in
  `shared/lens.ts`, worked out once in `communityAgent`; fails closed without
  community entry). The course-building instructions are a skill
  (`shared/guideSkills.ts`, Nov 18 2026): a document under skills/ for hosts,
  in the guide's prompt only when a host is on Knowledge.

### 9. Proactive agent — Keep, growing

- **Does:** the founder's daily brief today; member outreach, journey board and
  programs next ([spec](specs/proactive-community-agent-v0.md)).
- **Code:** `communityFounderBrief` (cron "send due founder briefs", every 15 minutes;
  runs up to `25` due briefs per round in bounded parallel chunks of `5` and
  self-continues up to `4` rounds when a batch fills with progress;
  the owner turns it on in Settings → Daily brief, `CommunityFounderBriefSection`);
  `stagingSeedBriefLab` and `stagingSeedPolynetDemo` (hand-run staging seeds; the demo
  community behind design v1); `reviewDemoSeed` (hand-run on production too, behind
  `POLYNET_ALLOW_REVIEW_DEMO=1`: the Unlisted Harbor Run Club for app-directory
  reviewers, owned by the reviewer account; seed, messages, reset).
- **Tables:** `communityFounderBriefSettings`, `communityFounderBriefs`.
- **Owner moments:** `communityOwnerMoments` (Home's milestone and detected-problem
  cards for the owner, [gateway spec](specs/community-agent-gateway-v0.md); the card
  is chosen in `shared/communityOwnerMoments.ts`). Table: `communityOwnerMoments`
  (what was shown and dismissed).
- **Pods:** `communityPods` (the Pods page: builders see every pod, members their
  own, then listed pods they could ask to join; a pod is an invite-only room plus
  its purpose, hosts, seats and listed/hidden, [spec](specs/pods-v0.md)).
  Tables: `communityPods`, `communityPodRequests` (asks to join and the waitlist).
  Pods in the guide's folder (`pods/`, `pods/<slug>/pod.md`, inside or outside by
  lens; the guide inside only the pod it works in) are `communityPodFacts`.
- **Tiers and grants (one door):** `communityTiers` (a membership holds one tier;
  each gives grants, the names a connected app reads; today's price is the base tier
  "member", and every reader of the price reads only it). Table: `communityTiers`;
  `communityPricePoints.tierKey` marks a tier's prices.
- **Plans held, and their pods:** `communityHeldTiers` (the plans a member
  holds now, from Polynet's price and the app's sales; read by grants and by
  pods so they can't disagree), `communityPlanPods` (a plan's pods: seats with
  the reason "plan" follow the plans held; `memberAccessChanged` is the one call
  wherever access changes, then connected apps are told; `tierHoldersChanged`
  syncs inline for communities with `<= 25` memberships and app grants and
  schedules paginated `syncTierHoldersBatchInternal` batches of `25` for larger
  communities, while `communityChannelAccess.getCommunityChannelCapabilities`
  revalidates plan-only seats live against `heldTiers` so pod revocations fail
  closed immediately before async sync finishes).
- **Changing plan:** `communityPlanChange` (a member paying Polynet monthly
  moves their Stripe subscription to another plan's price; Stripe's notice
  records it, and pods and grants follow).
- **Connected apps (one door):** `connectedApps` (a builder registers their app;
  `GET /apps/v1/access` in `httpConnectedApps` answers `{ allowed, tier, grants }` for
  a verified email), `connectedAppNotify` (signed `access.changed` webhooks where
  access may change, delivered and retried by `connectedApps`). Tables:
  `connectedApps`, `connectedAppDeliveries`.
- **App sales (one door):** `communityAppSales` (sales a connected app made
  through its own checkout, reported to `POST /apps/v1/sales`; no fee; lets a
  verified account in, or waits for one). Table: `communityAppGrants`.
- **Pod knowledge:** `communityPodNotes` (notes that belong to one pod: the pod
  reads, its hosts write, a builder may publish a copy to the community's notes).
  They are `pod:<roomId>` notes in the one memory store, `communityNotesStore`,
  where every memory row carries a scope key and every read names one scope
  (`scripts/memory_scope_wall.test.ts` lets only the store touch memory tables).
  Table `communityPodNotes` is retired: the scope backfill empties it; dropped later.
  A pod with the guide in it keeps its own memory: posts in its room make its
  `pod:<roomId>` review due (`communityMemory`, `communityMemoryReview`), read at
  `pods/<slug>/memory.md` and `memory/` inside the pod only; its hosts may undo.
- **Pod calls:** `communityEventAudience` (the one rule: an event with a pod is
  visible only to people who can enter that pod; every reader of `communityEvents`
  goes through it, enforced by `scripts/community_event_audience.test.ts`).
- **Paid pods:** `communityPodPayments` and `communityPodBillingCheck` (the hook the
  code that ends access calls, so pod billing stops at once) (a pod's price on top of membership, its
  Stripe checkout and subscription, and the grant that follows payment; notices
  routed from `httpBilling` by the `pod_payment_id` metadata; refunds and disputes
  end a pod payment; an hourly cron `sweepUnreachablePodPaymentsInternal` stops
  billing for pods someone can't reach and self-continues across bounded slices
  of `10` pages per run, up to `50` rounds, before draining refunds and
  abandoned checkouts).
  Table: `communityPodPayments`.
- **Home moments:** `communityHomeMoments` ("since you were last here" from the
  visit before this one, and a member's next step; ranked in
  `shared/communityHomeMoments.ts`). Table: `communityMemberVisits`.
- **Agent on/off:** `agent_on` on the access record
  (`communityAccessQueries.getMyCommunityAccess`, from `communityApps.communityAgentIsOn`);
  pages show the guide only when the Agent plan is paid and the agent is enabled.
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
  (works out each call's lens once and asks the lens table, `shared/lens.ts`:
  member, builder and community lenses, what each reads and may do; selections),
  `communityOperations`
  (a change to the community itself and its receipt in one transaction),
  `polynetCanonicalReceipts`; Vercel `api/mcp/*` (OAuth metadata, proxy).
- **Reached by:** `/runtime/mcp`, `/.well-known/oauth-*`.
- **Tables:** `polynetCanonicalOperationReceipts`, `accessBudgetCounters`
  (`accessBudgets`: what a person's own AI reads and writes, a minute and a
  day; the operations and budgets are in `shared/operationCatalog.ts`,
  [spec](specs/agent-access-v0.md)). `memberWriteRateCounters` is no longer
  written. `aiPostFingerprints` (`communityAiRules`: the words a person's AI
  posted lately, so they are not posted twice; the same file serves
  `rules.md` and the host's house rules, `communities.aiHouseRules`).
  `aiMessageFingerprints` (`directMessages`: the words an AI sent in someone's
  direct messages for a day, so the same words reach at most three people).
- **Contracts:** [polynet-workspace-mcp-contract-v0.md](polynet-workspace-mcp-contract-v0.md),
  [canonical-platform-operation-contract-v1.md](canonical-platform-operation-contract-v1.md).

### 11. Community sites — Removed (Nov 13, 2026)

- Each community's own site on `<slug>.polynet.page`, its Cloudflare edge,
  the CLI, the site SDK and the MCP's `community.site.deploy` are deleted. A
  community's public page is `/c/<slug>` in the app (area 2,
  `communityLanding`); members always use the app.
- **Kept until production runs this (slice 3):** the tables
  (`communityDomains`, `communitySiteDeploys`, `communityAppSessions`,
  `communityAppHandoffs`) and the owner's old member-experience switch
  (`communitySites`, `communityOwnerApprovals`), which the cached production
  app still calls. The production edge on Cloudflare is turned off then.
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
  `billingCore`,
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
- A community subscription is `active`, `past_due`, `cancel_at_period_end`
  or `ended` (Stripe's `canceled` is stored as `ended`). Only
  `communitySubscriptionLifecycle` writes its status, `cancelAtPeriodEnd` and
  `endedAt`, so they can't disagree; the membership follows through
  `communityMembershipLifecycle`.
- A checkout is a `community_join` or a `founder_subscription`. A join paid
  before signing in can carry a typed `communityHold` (refunded, disputed,
  buyer_blocked) and never grants while held; only a won dispute lifts one.
  The retired credit top-up and premium checkouts (15 prod rows) were backed
  up and deleted Nov 7, with their operator-panel figures.
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
- **Pricing (live Nov 2026):** Three tiers per community — **Free** ($0/month,
  up to 10 unfunded live communities per owner, unlimited members, no hosted AI),
  **Guide** ($20/month, $3/month AI allowance for reactive 1:1 chats, `@mentions`,
  active-thread follow-ups, and living memory), and **Chief of Staff**
  ($100/month, $20/month AI allowance plus Daily Briefs, Member & Builder
  Check-Ins, unanswered-question auto-replies, and optional `$30 → +$20 AI`
  prepaid usage boosts; legacy `$79` subscriptions grandfathered as Chief of
  Staff). See [specs/agent-pricing-and-overage-v1.md](specs/agent-pricing-and-overage-v1.md).
  Paid-member revenue carries a 2.9% platform fee across all tiers.
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
- **Crons:** "process pending email outbox" (5 min, batch limit `25`), "process
  pending mention emails" (15 min), and "process due weekly community digests"
  (30 min, zero-AI digest).
- **Delivery and scaling contract:** `emailOutbox` assigns `priorityRank` (`0`
  urgent/transactional, `1` mention notifications, `2` bulk event reminders and
  weekly digests) and claims due jobs in strict priority order via
  `by_status_priority_scheduledAt` (with legacy unranked fallback).
  `processPendingEmailOutboxInternal` sends claimed rows in bounded parallel
  chunks of `5` and self-continues at 2-second intervals for up to `10` rounds
  per trigger (backing off to the 5-minute cron on a 100%-failed batch).
  `enqueueEmailJobsBatchInternal` batches up to `100` outbox inserts per
  mutation for `eventReminders`, `communityMentionEmails`, and
  `communityWeeklyDigestWorker`. `communityMentionEmails` checks its 1-hour
  per-recipient cooldown in O(1) via `by_recipientUserId_kind_createdAt` and
  self-continues up to `4` rounds when a 25-recipient batch fills.
- **Tables:** `emailOutbox`, `emailDeliveries`, `emailPreferences`,
  `communityWeeklyDigestSchedules`.

### 14. Operator and diagnostics — Keep (internal)

- **Code:** `operatorAccess`, `operatorEntitlementsCore`,
  `operatorGrantUsageCore`,
  `communityAnalyticsRollups` (daily community analytics rollups, live billing summaries, and 15-minute paginated Discover activity stats refresh for published communities with a 25-minute read-cache TTL in `communityPublic.listPublicDiscoverCommunities`),
  `platformDiagnostics`, `businessAnalytics*`, `distributionAttribution*` (cron;
  kept on purpose, Nov 7: it forwards sign-ups that arrive from Distribution
  Engineer, Neil's own product, and has had none yet),
  `criticalAudit`, `errorLogging`, `probe` (health check).
- **Tables:** `operatorRoles`, `operatorGrantUsageCycles`, `platformDiagnosticEvents`,
  `criticalAuditEvents`, `communityAnalyticsEvents`, `communityDailyAnalytics`,
  `communityBillingSummary`, `platformOperatorSummary` (retired — cron stopped, awaiting table drop), `platformBusinessVisits`,
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
  default. Since Nov 13 members always use the app (custom sites are being
  removed): the owner's switch (`setCommunityMemberExperience`) is stored but
  no longer moves anyone, and Studio's member-to-site hand-off is gone. See
  the routing contract.
- **Code:** `apps/web` (React, Vite: `main.tsx` mounts a lightweight
  `WebPublicVisitorShell` + `base.css` on clean public `/`, `/discover`, and
  `/c/<slug>` URLs and hands off to lazy-loaded `App.tsx` + `index.css` for
  signed-in members and authenticated routes; top-level pages, community
  secondary tabs, DM panels, legal/setup modals, rich markdown/highlight
  assets, and Sentry/PostHog telemetry load on demand outside the initial
  startup bundle),
  `shared/` (gateways and shared UI), `api/` (Vercel functions); backend helper
  `publicAppUrl`.
- **Hosting:** Vercel `polynet` (production, www.polynet.ai) and `polynet-staging`.
- **Known hot spot:** `App.tsx` (~1,792 lines; down from 3,100 after Wave 4A/4B shell controller and prop builder extractions).

### 18. Release, CI and the factory — Keep

- **Code:** `scripts/release_gate.mjs`, `scripts/run_invariants.mjs` (curated
  security/money/integrity invariants), `scripts/deploy_production_ci.mjs`
  (automatic Main = Production Convex-then-Vercel deploy), `.github/workflows/`
  (`mvp-guards.yml`, `deploy-production.yml`, `secret-scan.yml`, `cla.yml`).
  Manual markdown release receipts in `docs/receipts/` are retired.
- **Contracts:** [alpha-release-workflow.md](alpha-release-workflow.md); factory
  rules in [AGENTS.md](../AGENTS.md) §9.

## Scheduled jobs

| Job | Every | Module |
|---|---|---|
| Process pending email outbox | 5 min | `email` |
| Recover distribution attribution deliveries | 5 min | `distributionAttribution` |
| Recover archived community billing cleanup | 5 min | `communityColdArchive` |
| Enqueue 24-hour event reminder emails | 15 min | `eventReminders` |
| Stop billing for unreachable pods | 60 min | `communityPodPayments` |
| Process pending mention emails | 15 min | `communityMentionEmails` |
| Send due founder briefs | 15 min | `communityFounderBrief` |
| Process due member coach scans | 60 min | `communityMemberCoach` |
| Process due weekly community digests | 30 min | `communityWeeklyDigestWorker` |
| Repair lost memory reviews | 24 hr | `agentWork` |
| Backfill community member search index | 15 min | `communityMemberSearch` |
| Backfill course progress projections | 15 min | `communityLessonProgress` |
| Refresh community member view counts | 15 min | `communityMemberRecords` |
| Refresh community analytics rollups | 15 min | `communityAnalyticsRollups` |
| Refresh discover activity stats | 15 min | `communityAnalyticsRollups` |

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
