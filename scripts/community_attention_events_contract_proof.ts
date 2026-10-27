import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const backend = read("convex/communityAttention.ts");
const readCursorCore = read("convex/communityReadCursorCore.ts");
const gateway = read("shared/cloudCommunityAttentionGateway.ts");
const controller = read("shared/useCommunityAttentionController.ts");
const app = read("apps/web/src/App.tsx");
const webAttentionController = read(
  "apps/web/src/controllers/useWebCommunityAttentionController.ts",
);
const nav = read("shared/CommunityNav.tsx");
const mentionEmails = read("convex/communityMentionEmails.ts");
const notificationAccess = read("convex/communityNotificationAccess.ts");
const emailCore = read("convex/emailCore.ts");
const emailModule = read("convex/email.ts");
const cronsFile = read("convex/crons.ts");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");

assert.match(
  schema,
  /communityMemberSettings:[\s\S]*eventsLastSeenAt: v\.optional\(v\.number\(\)\)/,
  "community member settings must persist per-user Events seen state",
);
assert.match(
  schema,
  /communityReadCursors: defineTable\(\{[\s\S]*streamKind: v\.literal\("chat"\)[\s\S]*seenThroughAt: v\.number\(\)[\s\S]*by_community_user_stream/,
  "chat unread state must have one indexed canonical cursor projection",
);

assert.match(
  schema,
  /communityEvents:[\s\S]*\.index\("by_community_status_updatedAt", \["communityId", "status", "updatedAt"\]\)/,
  "community events need an efficient latest live-activity index for attention derivation",
);

assert.match(
  backend,
  /type CommunityAttentionSurface = "chat" \| "ai_feed" \| "resources" \| "events" \| "mentions"/,
  "the backend must retain AI Feed as a historical attention compatibility value",
);

assert.match(
  backend,
  /getLatestCommunityEventsUpdatedAt[\s\S]*query\("communityEvents"[\s\S]*withIndex\("by_community_status_updatedAt"[\s\S]*eq\("status", "live"\)[\s\S]*order\("desc"\)[\s\S]*updatedAt/,
  "Events attention must derive from latest visible live event activity",
);

assert.match(
  backend,
  /events:\s*[\s\S]*latestEventsUpdatedAt > Math\.max\(0, Math\.floor\(settingsRow\?\.eventsLastSeenAt \?\? 0\)\)/,
  "Events attention must compare latest activity against the per-user seen marker",
);

assert.match(
  backend,
  /surface: v\.union\(v\.literal\("chat"\), v\.literal\("ai_feed"\), v\.literal\("resources"\), v\.literal\("events"\), v\.literal\("mentions"\)\)[\s\S]*seenAtMs: v\.optional\(v\.number\(\)\)/,
  "markCommunitySurfaceSeen must accept the Events surface and visible seen marker",
);

assert.match(
  backend,
  /const requestedEventsSeenAt = normalizePositiveMarker\(args\.seenAtMs\);[\s\S]*if \(requestedEventsSeenAt === null\) return;[\s\S]*const nextEventsLastSeenAt = Math\.min\(latestEventsUpdatedAt, requestedEventsSeenAt\)/,
  "Events mark-seen must clamp to the visible event marker instead of global latest activity",
);

assert.match(
  gateway,
  /CloudCommunityAttentionSurface = "chat" \| "resources" \| "events" \| "mentions"/,
  "the active shared gateway must expose Events without the retired AI Feed surface",
);
assert.doesNotMatch(
  gateway,
  /CloudCommunityAttentionSurface[^;]*ai_feed/,
  "the active shared attention gateway must not admit AI Feed acknowledgements",
);

assert.match(
  controller,
  /events: boolean[\s\S]*events: Boolean\(row\.events\)/,
  "frontend attention controller must carry Events indicators",
);

assert.match(
  webAttentionController,
  /latestEventsUpdatedAt[\s\S]*communityTab !== "events"[\s\S]*events\.hasLoadedVisibleRange[\s\S]*latestEventsUpdatedAt === null[\s\S]*acknowledgeSurface\([\s\S]*"events"[\s\S]*seenAtMs: latestEventsUpdatedAt[\s\S]*optimistic: false/,
  "Events tab must mark only loaded visible event activity seen",
);
assert.doesNotMatch(
  webAttentionController,
  /refreshCommunityAttention|refreshAfter/,
  "attention acknowledgements must reconcile through the canonical realtime subscription",
);

assert.match(
  app,
  /useWebCommunityAttentionModel\(\{[\s\S]*hasLoadedVisibleRange: hasLoadedActiveCommunityEventsRange[\s\S]*rows: communityEvents/,
  "App must compose the community attention owner with the visible events projection",
);

assert.doesNotMatch(
  app,
  /markCommunitySurfaceSeen|markCloudCommunityChatReadAt|useCommunityTypingPresence/,
  "App must not own low-level community attention, read receipt, or typing lifecycles",
);

assert.match(
  app,
  /activeCommunityAttentionSummary[\s\S]*events: false[\s\S]*Number\(Boolean\(activeCommunityAttentionSummary\.events\)\)/,
  "community attention count must include Events",
);

assert.match(
  app,
  /communityTabIndicators = \{[\s\S]*events: Boolean\(activeIndicators\.events\)/,
  "community tab indicators must include Events",
);

assert.match(
  app,
  /indicators\.chat \|\| indicators\.resources \|\| indicators\.events/,
  "community rail attention must include Events without the retired AI Feed indicator",
);

assert.match(
  nav,
  /communityTab !== "events" && tabIndicators\.events[\s\S]*nav-item-dot/,
  "Events tab must render an attention dot",
);

assert.doesNotMatch(
  eventsPanel,
  /Event saved\./,
  "Events saves should not show noisy success toasts",
);

assert.doesNotMatch(
  resourcesPanel,
  /Resource saved successfully!/,
  "Resource saves should not show noisy success toasts",
);

// Mentions surface (M2): an unseen mention-of-me is its own attention marker,
// derived from indexed non-suppressed mention states and the same canonical
// chat cursor, then rendered as the accent variant of the chat nav dot plus
// the rail OR. Ledger settlement is asynchronous and cannot fan out inside the
// user acknowledgement mutation.
assert.match(
  backend,
  /for \(const notifyState of \["pending", "sent", "read"\] as const\)[\s\S]*by_mentionedUser_community_channel_notifyState_createdAt/,
  "mention attention must derive from exact-channel indexed non-suppressed mention reads",
);
assert.doesNotMatch(
  backend,
  /by_mentionedUser_community_createdAt/,
  "mention attention must not treat suppressed mention rows as unseen mentions",
);
assert.match(
  backend,
  /channel\.systemRole === "general"[\s\S]*\[channel\._id, undefined\][\s\S]*latestMentionAt[\s\S]*latestMentionAt > readState\.mentionSeenThroughAt/,
  "mention attention must compare each channel against its canonical chat read state",
);
assert.match(
  backend,
  /acknowledgeCommunityChatRead[\s\S]*advanceCommunityChatReadCursor/,
  "caught-up chat acknowledgement must advance the canonical cursor",
);
assert.doesNotMatch(
  backend,
  /settleMentionRowInternal|by_mentionedUser_community_notifyState_createdAt[\s\S]*eq\("notifyState", "pending"\)/,
  "chat acknowledgement must not synchronously fan out over mention rows",
);
assert.match(
  readCursorCore,
  /clampCommunityReadPosition[\s\S]*Math\.min\(requested, latest\)[\s\S]*nextCommunityReadPosition[\s\S]*Math\.max/,
  "the canonical cursor must be server-clamped and monotonic",
);
assert.match(
  nav,
  /nav-item-dot\$\{indicator\.mentions \? " is-mention" : ""\}/,
  "an unseen mention upgrades its channel dot to the accent variant",
);
assert.match(
  app,
  /indicators\.chat \|\| indicators\.resources \|\| indicators\.events \|\| indicators\.mentions/,
  "the community rail attention OR must include mentions",
);

// M2b: mention email pings. Grace window before emailing (the in-app dot gets
// first chance), preference-gated (mentionEmailsEnabled), deduped per mention,
// and the ledger advances pending -> sent/suppressed while in-app reads keep
// winning (only pending rows advance).
assert.match(
  mentionEmails,
  /MENTION_EMAIL_GRACE_MS = 15 \* 60 \* 1000/,
  "mention emails wait out an in-app grace window first",
);
assert.match(
  mentionEmails,
  /dedupeKey: `mention_notification:\$\{job\.mentionId\}`/,
  "each mention can produce at most one email",
);
assert.match(
  mentionEmails,
  /settleMentionRowInternal\(\{[\s\S]*toState: update\.notifyState/,
  "only pending mention rows advance during asynchronous delivery settlement",
);
assert.match(
  mentionEmails,
  /readCommunityChannelReadState\([\s\S]*mention\.communityId[\s\S]*mention\.mentionedUserId[\s\S]*authorized\.channel[\s\S]*readOnlyJob\(mention\)[\s\S]*notifyState: "read"/,
  "the async mention worker must use the exact mention channel and settle rows already covered by its cursor",
);
assert.match(
  emailModule,
  /mention_notification[\s\S]*mentionEmailsEnabled !== false/,
  "mention emails respect the recipient preference",
);
assert.match(
  emailCore,
  /"mention_notification",/,
  "mention notification is a registered email template",
);
assert.match(
  cronsFile,
  /"process pending mention emails",\s*\{ minutes: 15 \}/,
  "mention email processing runs on a 15-minute cron",
);

// M2b abuse posture: the email fires >=15 minutes after the mention, so the
// snippet must not leak to people who left in between, and a hostile burst of
// mentions must not become a burst of emails.
assert.match(
  mentionEmails,
  /resolveMentionRecipientSource\(\{ ctx, mention, userId: mention\.mentionedUserId \}\)[\s\S]*if \(!authorized\)[\s\S]*suppressOnlyJob\(mention\)/,
  "mention email admission must resolve current recipient and source authority",
);
assert.match(notificationAccess, /resolveCommunityChannelActor\(args\)[\s\S]*resolveCommunityInteractionEvidenceSource[\s\S]*communityInteractionEvidenceSourceIsReadable[\s\S]*requireCommunityChannelCapability/, "notification authority must reuse community and channel access and live-source checks");
assert.match(emailModule, /sourceMentionId: v.optional\(v.id\("communityInteractionMentions"\)\)/, "outbox must retain typed mention lineage");
assert.match(emailModule, /prepareMentionEmailDispatchInternal[\s\S]*row.attemptCount !== args.attemptCount/, "dispatch must fence superseded attempts");
assert.match(emailModule, /job.templateKey === "mention_notification"[\s\S]*prepareMentionEmailDispatchInternal[\s\S]*if \(!prepared\)[\s\S]*continue[\s\S]*sendRenderedEmail/, "mention delivery must reauthorize immediately before provider dispatch");
assert.match(
  mentionEmails,
  /MENTION_EMAIL_RECIPIENT_COOLDOWN_MS = 60 \* 60 \* 1000/,
  "mention emails enforce a per-recipient cooldown between runs",
);
assert.match(
  mentionEmails,
  /withIndex\("by_recipientUserId"[\s\S]*?"mention_notification"/,
  "the cooldown derives from the recipient's latest mention email in the outbox",
);
assert.match(
  mentionEmails,
  /cooldownByRecipient\.get\(recipientKey\)\) continue/,
  "mentions inside the cooldown stay pending and batch into the next email",
);
assert.match(
  mentionEmails,
  /emailedThisRun\.has\(recipientKey\)/,
  "at most one mention email per recipient per run; extras collapse into it",
);
assert.match(
  mentionEmails,
  /if \(job\.collapsed\) \{[\s\S]*?notifyState: "sent"/,
  "collapsed mentions still advance the ledger so they are never re-pinged",
);

// Mention-target resolution at write time: clients may know members by
// canonical users id OR auth subject (the profiles projection exposes the
// latter as user_id); either resolves to the canonical id on the row, unknown
// targets fail closed, and every target must pass the community access gate
// (live-verified 2026-07-01: non-member target -> interaction_mention_user_not_allowed).
const interactions = read("convex/communityInteractions.ts");
assert.match(
  interactions,
  /normalizeId\("users" as any, rawUserId\)[\s\S]*?withIndex\("by_authSubject"/,
  "mention targets must resolve from canonical users id or auth subject",
);
assert.match(
  interactions,
  /if \(!user\) throw new Error\("interaction_mention_user_not_found"\)/,
  "unknown mention targets must fail closed",
);
assert.match(
  interactions,
  /for \(const spec of orderedMentionSpecs\)[\s\S]*spec.kind === "user"[\s\S]*resolveNotificationRecipientSource\(\{[\s\S]*userId: spec.userId[\s\S]*interaction_mention_user_not_allowed[\s\S]*db.insert\("communityInteractionMentions"/,
  "every user mention must pass source and recipient authority before insertion",
);
assert.match(
  interactions,
  /const spec: UserInteractionMentionSpec = \{ kind: "user", userId: user\._id \};[\s\S]*out\.push\(spec\)/,
  "mention rows must store the canonical users id, never the raw client value",
);
assert.match(
  interactions,
  /mentioned_user_id: row\.mentionedUserId\s*\?\s*await resolvePublicUserId\(ctx, row\.mentionedUserId, userIdCache\)/,
  "the mention projection must convert to the public id like actors — raw canonical ids never resolve to profiles on the frontend",
);

// Injection posture (verified 2026-07-01): every payload-derived string the
// mention email renders — title (mentioner name), intro (chat snippet), CTA
// URL — passes through escapeHtml in the shared email shell. Chat text must
// never become live markup in an inbox.
assert.match(
  emailCore,
  /\$\{escapeHtml\(params\.title\)\}/,
  "email shell must HTML-escape the title slot (carries user display names)",
);
assert.match(
  emailCore,
  /\$\{escapeHtml\(intro\)\}/,
  "email shell must HTML-escape the intro slot (carries chat snippets)",
);
assert.match(
  emailCore,
  /href="\$\{escapeHtml\(url\)\}"/,
  "email shell must HTML-escape CTA URLs",
);

console.log("community_attention_events_contract_proof: ok");
