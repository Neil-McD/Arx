import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const memberSettingsDialog = read("apps/web/src/components/CommunityMemberSettingsDialog.tsx");
const membersSection = read("apps/web/src/components/WebCommunityMembersSection.tsx");
const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const directoryController = read("shared/useCommunityDirectoryController.ts");
const communityDirectory = read("convex/communityDirectory.ts");
const sendController = read("shared/useCommunityChatMutationController.ts");
const interactions = read("convex/communityInteractions.ts");
const baseCss = read("apps/web/src/base.css");
const contract = read("docs/community-interaction-substrate-contract-v1.md");

assert.match(
  packageJson,
  /"check:community-interaction-projection-ui-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_projection_ui_contract_proof\.ts"/,
  "package scripts should expose the community interaction projection UI proof",
);

assert.doesNotMatch(
  app,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION/,
  "App should not gate the production canonical projection behind a Vite env flag",
);
assert.match(
  app,
  /const COMMUNITY_INTERACTION_PROJECTION_ENABLED = true;/,
  "App should make canonical interaction projection the normal web chat surface",
);
assert.match(
  app,
  /listCloudCommunityInteractionRoots[\s\S]*listCloudCommunityInteractionReplies/,
  "App should read canonical interaction roots and drawer replies",
);
assert.match(
  app,
  /interactionProjection:\s*\{[\s\S]*enabled:\s*COMMUNITY_INTERACTION_PROJECTION_ENABLED[\s\S]*roots:\s*appendPendingRoots\(communityInteractionRoots, pendingCanonicalInteractions, activeCommunityId\)[\s\S]*selectedRootId:\s*selectedCommunityInteractionRootId/,
  "App should pass the canonical projection with optimistic roots into the chat panel",
);
assert.match(
  app,
  /subscribeCloudCommunityInteractionRoots[\s\S]*subscribeCloudCommunityInteractionReplies/,
  "App should subscribe to canonical interaction roots and replies directly",
);
assert.match(
  app,
  /useCommunityChatRealtime\(\{[\s\S]*isEnabled: activePage === "community" && hasResolvedCommunityChat && !COMMUNITY_INTERACTION_PROJECTION_ENABLED/,
  "legacy chat realtime should remain disabled while canonical projection is the normal chat surface",
);
assert.match(
  app,
  /onCommunityMessageSent:[\s\S]*loadCommunityInteractionRoots\(communityId, session\)/,
  "send completion should request canonical projection refresh through canonical reads",
);
assert.match(
  app,
  /communityInteractionRootsRequestIdRef[\s\S]*activeCommunityInteractionCommunityIdRef[\s\S]*activeCommunityInteractionCommunityIdRef\.current !== communityId/,
  "App should guard the projection against stale roots after community switches",
);
assert.match(
  app,
  /visibleCommunityProfileIds[\s\S]*communityInteractionRoots[\s\S]*bundle\.root\.actor_user_id[\s\S]*communityInteractionRepliesByRootId[\s\S]*bundle\.reply\.actor_user_id/,
  "App should hydrate profiles for canonical root and reply actors",
);

assert.match(
  chatPanel,
  /WebCommunityInteractionProjection/,
  "chat panel should render the canonical projection component",
);
assert.match(
  chatPanel,
  /showInteractionProjection[\s\S]*interactionProjection\?\.enabled[\s\S]*hasResolvedCommunityChat[\s\S]*!isLoadingChat/,
  "chat panel should only switch projections once the authenticated chat surface is resolved",
);
assert.match(
  chatPanel,
  /showInteractionProjection && interactionProjection[\s\S]*community-interaction-scroll[\s\S]*WebCommunityInteractionProjection[\s\S]*:\s*\([\s\S]*className="chat-messages"/,
  "chat panel should keep the legacy message timeline as the fallback projection",
);
assert.match(
  chatPanel,
  /WebCommunityInteractionProjection[\s\S]*profilesByUserId=\{profilesByUserId\}/,
  "chat panel should pass hydrated profile rows into the canonical projection",
);
assert.match(
  app,
  /useCommunityDirectoryController<AuthSession>[\s\S]*loadCommunityDirectoryMembers[\s\S]*loadMoreCommunityDirectoryMembers/,
  "App should own a member-facing directory controller for the chat right rail",
);
assert.match(
  app,
  /interactionProjection:\s*\{[\s\S]*communityMemberCount: communityDirectoryMemberCount,[\s\S]*communityMembers: communityDirectoryMembers,[\s\S]*communityMembersHasMore: communityDirectoryMembersHasMore,[\s\S]*isLoadingCommunityMembers: isLoadingCommunityDirectoryMembers,[\s\S]*isLoadingMoreCommunityMembers: isLoadingMoreCommunityDirectoryMembers,[\s\S]*communityMembersLoadError: communityDirectoryMembersLoadError,[\s\S]*loadMoreCommunityDirectoryMembers/,
  "App should pass directory count/loading/pagination state into the chat right rail",
);
assert.doesNotMatch(
  app,
  /interactionProjection:\s*\{[\s\S]*communityMembers:\s*communityMembers[\s\S]*loadMoreCommunityMembers/,
  "chat right rail must not depend on the admin member roster",
);
assert.match(
  projection,
  /communityMemberCount\?: number \| null;[\s\S]*communityMembers\?: CommunityRailMember\[\] \| null;[\s\S]*communityMembersHasMore\?: boolean;[\s\S]*isLoadingCommunityMembers\?: boolean;[\s\S]*isLoadingMoreCommunityMembers\?: boolean;[\s\S]*communityMembersLoadError\?: string \| null;[\s\S]*onLoadMoreCommunityMembers\?: \(\) => void;/,
  "interaction projection should model roster count/loading/pagination state for the right rail",
);
assert.match(
  projection,
  /memberCount=\{props\.communityMemberCount \?\? props\.presenceSummary\?\.member_count \?\? null\}[\s\S]*membersHasMore=\{props\.communityMembersHasMore\}[\s\S]*isLoadingMembers=\{props\.isLoadingCommunityMembers\}[\s\S]*isLoadingMoreMembers=\{props\.isLoadingMoreCommunityMembers\}[\s\S]*membersLoadError=\{props\.communityMembersLoadError\}[\s\S]*onLoadMoreMembers=\{props\.onLoadMoreCommunityMembers\}/,
  "interaction projection should pass roster state through to the context panel",
);
assert.match(
  contextPanel,
  /Members — \{memberCountLabel\}/,
  "context panel should label the member population from a total-count label",
);
assert.match(
  contextPanel,
  /Offline — \{offlineCountLabel\}/,
  "context panel should label offline members from the total-count model",
);
assert.doesNotMatch(
  contextPanel,
  /Offline — \{offlineMembers\.length\}/,
  "context panel must not present the loaded offline row count as the full offline population",
);
assert.match(
  contextPanel,
  /LOAD_MORE_SCROLL_THRESHOLD_PX[\s\S]*props\.onLoadMoreMembers\(\)/,
  "context panel should load additional roster pages as the member rail scrolls near the bottom",
);
assert.match(
  contextPanel,
  /onScroll=\{handleMembersScroll\}/,
  "context panel should attach the load-more scroll handler to the member rail",
);
assert.match(
  contextPanel,
  /canManageMembers\?: boolean;[\s\S]*onOpenMemberSettings\?: \(member: CommunityRailMember\) => void;/,
  "context panel should model an optional manager-only member settings affordance",
);
assert.match(
  contextPanel,
  /const canOpenSettings = Boolean\([\s\S]*props\.canManageMembers[\s\S]*props\.onOpenMemberSettings[\s\S]*!isOwnerMember[\s\S]*!String\(member\.id \?\? ""\)\.startsWith\("owner:"\)/,
  "context panel should hide member settings for normal viewers and owner rows",
);
assert.match(
  contextPanel,
  /className="community-context-member-action"[\s\S]*aria-label=\{`Open settings for \$\{name\}`\}[\s\S]*props\.onOpenMemberSettings\?\.\(member\)/,
  "context panel should open the supplied settings callback from the stable row action button",
);
assert.match(
  baseCss,
  /\.community-context-member-action\s*\{[\s\S]*width:\s*24px;[\s\S]*height:\s*24px;[\s\S]*opacity:\s*0;/,
  "member rail settings action should reserve a stable icon footprint without always showing management chrome",
);
assert.match(
  baseCss,
  /\.community-context-member:hover \.community-context-member-action,[\s\S]*\.community-context-member-action:focus-visible\s*\{[\s\S]*opacity:\s*1;/,
  "member rail settings action should reveal on hover and keyboard focus",
);
assert.match(
  projection,
  /import \{ CommunityMemberSettingsDialog \} from "\.\/CommunityMemberSettingsDialog";/,
  "interaction projection should reuse the shared member settings dialog",
);
assert.match(
  projection,
  /canManageCommunityMembers\?: boolean;[\s\S]*onSetCommunityMemberRole\?: \(membershipId: string, role: "admin" \| "moderator" \| "member"\) => Promise<void> \| void;[\s\S]*loadMemberBillingHistory\?: \(membershipId: string\) => Promise<CloudCommunityMemberBillingHistory \| null>;/,
  "interaction projection should accept the existing member-management controller contract explicitly",
);
assert.match(
  projection,
  /const canManageCommunityMembers = Boolean\([\s\S]*props\.canManageCommunityMembers[\s\S]*props\.communityId[\s\S]*props\.onSetCommunityMemberRole[\s\S]*props\.onRemoveCommunityMember[\s\S]*props\.onBanCommunityMember/,
  "interaction projection should fail closed unless community id and member-management mutation callbacks are available",
);
assert.match(
  projection,
  /if \(!canManageCommunityMembers\) \{[\s\S]*setSelectedCommunityMemberId\(null\);[\s\S]*return;[\s\S]*\}/,
  "interaction projection should close member settings if the manager gate disappears while open",
);
assert.match(
  projection,
  /CommunityContextPanel[\s\S]*canManageMembers=\{canManageCommunityMembers\}[\s\S]*onOpenMemberSettings=\{\(member\) => setSelectedCommunityMemberId\(member\.id\)\}/,
  "interaction projection should only wire right-rail member settings through the manager gate",
);
assert.match(
  projection,
  /<CommunityMemberSettingsDialog[\s\S]*member=\{selectedCommunityMember\}[\s\S]*canManageMembers=\{canManageCommunityMembers\}[\s\S]*handleSetCommunityMemberRole=\{\(membershipId, role\) =>[\s\S]*props\.onSetCommunityMemberRole\?\.\(membershipId, role\)/,
  "interaction projection should route right-panel role changes through the existing mutation callback",
);
assert.match(
  app,
  /const reloadActiveCommunityDirectoryMembers = useCallback\(async \(\) => \{[\s\S]*await loadCommunityDirectoryMembers\(communityId, usableSession\);/,
  "App should provide a right-panel directory reload after member-management mutations",
);
assert.match(
  app,
  /const handleSetCommunityContextMemberRole = useCallback\(async \([\s\S]*await handleSetCommunityMemberRole\(membershipId, role\);[\s\S]*await reloadActiveCommunityDirectoryMembers\(\);/,
  "right-panel role changes should reuse the existing member role mutation and then refresh the directory projection",
);
assert.match(
  app,
  /interactionProjection:\s*\{[\s\S]*canManageCommunityMembers:\s*canManageMembersActiveCommunity[\s\S]*onSetCommunityMemberRole:\s*handleSetCommunityContextMemberRole[\s\S]*onRemoveCommunityMember:\s*handleRemoveCommunityContextMember[\s\S]*onBanCommunityMember:\s*handleBanCommunityContextMember[\s\S]*loadMemberBillingHistory:\s*loadCommunityMemberBillingHistory/,
  "App should wire manager-only right-panel controls from the existing active-community permission and action contract",
);
assert.match(
  memberSettingsDialog,
  /export function CommunityMemberSettingsDialog\(props: CommunityMemberSettingsDialogProps\)/,
  "member settings dialog should be a reusable shared component",
);
assert.match(
  memberSettingsDialog,
  /const canChangeRole = Boolean\([\s\S]*props\.canManageMembers[\s\S]*!memberIsOwner[\s\S]*\(props\.isActiveCommunityOwner \|\| !memberIsAdmin\)/,
  "member settings dialog should prevent non-owners from role-changing owners or admins",
);
assert.match(
  memberSettingsDialog,
  /props\.isActiveCommunityOwner[\s\S]*\(\["member", "moderator", "admin"\] as const\)[\s\S]*memberIsAdmin[\s\S]*\(\["admin"\] as const\)[\s\S]*\(\["member", "moderator"\] as const\)/,
  "member settings dialog should expose owner/admin role options according to the existing management split",
);
assert.match(
  memberSettingsDialog,
  /return \(\) => \{[\s\S]*didCancel = true;[\s\S]*requestedMemberBillingHistoryIdsRef\.current\.delete\(memberId\);[\s\S]*setLoadingMemberBillingHistoryId\(\(current\) => \([\s\S]*current === memberId \? null : current/,
  "member settings dialog should clear in-flight billing history state when closed or switched",
);
assert.match(
  membersSection,
  /import \{ CommunityMemberSettingsDialog \} from "\.\/CommunityMemberSettingsDialog";[\s\S]*<CommunityMemberSettingsDialog/,
  "legacy members management surface should reuse the same settings dialog while it still exists",
);
assert.doesNotMatch(
  membersSection,
  /function formatBaseUnitsAmount|function formatBillingEventTitle|function formatBillingEventDetail/,
  "legacy members management surface should not keep a forked billing/settings formatter implementation",
);

assert.match(
  directoryGateway,
  /client\.query\("community:listCommunityDirectoryPage" as any/,
  "directory gateway should read chat rail members through the member-facing directory query",
);
assert.match(
  directoryGateway,
  /client\.query\("community:countCommunityDirectoryMembers" as any/,
  "directory gateway should expose a read-only member-facing count query",
);
assert.doesNotMatch(
  directoryGateway,
  /syncCommunityMembershipCount|listCommunityMembershipsAdminPage/,
  "directory gateway must not use admin roster reads or cache-sync mutations",
);
assert.match(
  directoryController,
  /listCloudCommunityDirectoryPage[\s\S]*setCommunityDirectoryMemberCount[\s\S]*setCommunityDirectoryMembersHasMore/,
  "directory controller should drive count and pagination state from directory pages",
);
assert.match(
  communityDirectory,
  /requireCommunityChatAccess[\s\S]*export const listCommunityDirectoryPage = query/,
  "directory backend should be gated by community chat access",
);
assert.match(
  communityDirectory,
  /listCanonicalCommunityMemberMembershipRows[\s\S]*countCanonicalCommunityMembersFromRows/,
  "directory backend should use the canonical member count and row helpers",
);
assert.doesNotMatch(
  communityDirectory,
  /mutation\(|syncCommunityMembershipCount|viewerCanManageMembers|community_forbidden/,
  "directory backend must stay read-only and member-facing",
);

assert.match(
  surfaceProjection,
  /interactionProjection: WebCommunityChatPanelProps\["interactionProjection"\]/,
  "surface builder should accept the interaction projection prop explicitly",
);
assert.match(
  surfaceProjection,
  /interactionProjection: params\.interactionProjection/,
  "surface builder should pass the projection through to WebCommunityChatPanel",
);

assert.match(
  gateway,
  /client\.query\("community:listCommunityInteractionRoots" as any/,
  "gateway should read roots through the community interaction query",
);
assert.match(
  gateway,
  /client\.query\("community:listCommunityInteractionReplies" as any/,
  "gateway should read drawer replies through the community interaction query",
);
assert.match(
  gateway,
  /client\.mutation\("community:createCommunityInteractionComposerMessage" as any/,
  "gateway should expose the canonical composer bridge mutation",
);
assert.match(
  sendController,
  /resolveCommunityChatSendRoute[\s\S]*projection_disabled[\s\S]*community_interaction_writer_missing[\s\S]*community_interaction_reply_target_unmapped/,
  "send controller should keep canonical projection writes behind one explicit fail-closed route decision",
);
assert.doesNotMatch(
  sendController,
  /reason:\s*"writer_missing"|return\s+\{\s*kind:\s*"legacy",\s*reason:\s*"writer_missing"\s*\}/,
  "projection-active sends should not fall back to legacy when the canonical writer is missing",
);
assert.match(
  sendController,
  /onCanonicalOptimisticInsert[\s\S]*idempotencyKey: sendRoute\.idempotencyKey[\s\S]*attachments: preparedAttachments[\s\S]*serializedAttachments/,
  "canonical optimistic projection rows should use the route idempotency key and prepared attachments",
);
assert.match(
  app,
  /function appendPendingRoots[\s\S]*new Set\(roots\.map\(\(bundle\) => bundle\.root\.idempotency_key\)\)[\s\S]*composerStoredIdempotencyKey\(p\.idempotencyKey, "root"\)/,
  "pending root overlays should dedupe against visible canonical roots by stored idempotency key",
);
assert.match(
  app,
  /function appendPendingReplies[\s\S]*new Set\(replies\.map\(\(bundle\) => bundle\.reply\.idempotency_key\)\)[\s\S]*composerStoredIdempotencyKey\(p\.idempotencyKey, "reply"\)/,
  "pending reply overlays should dedupe against visible canonical replies by stored idempotency key",
);
assert.match(
  chatPanel,
  /const rootReplyTarget[\s\S]*if \(!root\?\.id \|\| !root\.actor_user_id\) return null[\s\S]*id: root\.legacy_message_id \?\? root\.id[\s\S]*legacy_message_id: root\.legacy_message_id \?\? null/,
  "canonical drawer root reply target should not require a legacy message id",
);
assert.match(
  projection,
  /onReply=\{\(\) => \{[\s\S]*if \(!reply\.actor_user_id\) return[\s\S]*id: reply\.legacy_message_id \?\? reply\.id[\s\S]*interaction_root_id: reply\.root_id[\s\S]*legacy_message_id: reply\.legacy_message_id \?\? null/,
  "canonical drawer reply action should carry canonical root id and optional legacy metadata",
);
assert.doesNotMatch(
  gateway,
  /createThreadUserMessage|sendCloudCommunityMessage|communityChatMessages/,
  "interaction gateway should not fall back to legacy chat tables",
);
assert.match(
  interactions,
  /mapRootBundle[\s\S]*resolvePublicUserId\(ctx, root\.actorUserId[\s\S]*actor_user_id: publicActorUserId/,
  "root read bundles should expose public actor user ids for UI profile hydration",
);
assert.match(
  interactions,
  /mapReplyBundle[\s\S]*resolvePublicUserId\(ctx, reply\.actorUserId[\s\S]*actor_user_id: publicActorUserId/,
  "reply read bundles should expose public actor user ids for UI profile hydration",
);

assert.match(
  projection,
  /selectedRoot[\s\S]*community-interaction-drawer/,
  "projection should render a one-level drawer for the selected root",
);
assert.match(
  projection,
  /CommunityInteractionFeedList[\s\S]*density="full"/,
  "projection shell should delegate main feed rows to the shared full-density interaction feed",
);
assert.match(
  projection,
  /profilesByUserId: Record<string, UserProfile>/,
  "projection props should carry hydrated profile rows for avatar rendering",
);
assert.match(
  feed,
  /export function ActorAvatar[\s\S]*UserAvatar[\s\S]*imageUrl=\{props\.profile\?\.avatar_url \?\? null\}[\s\S]*focusX=\{props\.profile\?\.avatar_focus_x \?\? 0\.5\}[\s\S]*focusY=\{props\.profile\?\.avatar_focus_y \?\? 0\.5\}[\s\S]*zoom=\{props\.profile\?\.avatar_zoom \?\? 1\}/,
  "shared feed renderer should render avatars from the hydrated profile cache",
);
assert.match(
  projection,
  /props\.replies\.map/,
  "projection drawer should render replies supplied by the bounded reply query",
);
assert.doesNotMatch(
  projection,
  /onStartReply|onSendCommunityMessage|client\.mutation|sendCloudCommunityMessage/,
  "projection component should not introduce a second writer path",
);
assert.match(
  feed,
  /export function CommunityInteractionFeedList[\s\S]*density: "full" \| "compact"[\s\S]*props\.roots[\s\S]*community-interaction-message/,
  "shared feed renderer should own root row rendering for full and compact projections",
);
assert.match(
  app,
  /workspaceRecentSignalFeed[\s\S]*<CommunityInteractionFeedList[\s\S]*density="compact"/,
  "workspace panel should use the shared compact interaction feed projection",
);

[
  ".community-interaction-projection.has-drawer",
  ".community-interaction-drawer",
  ".community-interaction-root.selected",
  ".community-interaction-thread-anchor",
  ".community-interaction-avatar-image",
  ".community-interaction-reply-list",
  ".app-root.mobile-shell .community-chat .community-interaction-drawer",
].forEach((selector) => {
  assert.ok(baseCss.includes(selector), `base.css should include ${selector}`);
});

assert.match(
  baseCss,
  /\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*calc\(var\(--web-topbar-height,\s*48px\)\s*\+\s*10px\)\s+18px\s+4px;/,
  "projection feed should reserve the web topbar while leaving space for the pane-scoped composer",
);
assert.match(
  baseCss,
  /\.community-interaction-drawer-scroll\s*\{[\s\S]*padding-top:\s*calc\(var\(--web-topbar-height,\s*48px\)\s*\+\s*12px\);/,
  "projection drawer scroll region should reserve the web topbar and floating back button before rendering replies",
);
assert.match(
  baseCss,
  /\.community-interaction-avatar\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;[\s\S]*overflow:\s*hidden;/,
  "projection avatars should be stable positioned clipping boxes",
);
assert.match(
  baseCss,
  /\.community-interaction-avatar-image\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*cover;/,
  "projection avatar images should fill the avatar clipping box",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*8px\s+12px\s+18px;/,
  "mobile projection feed should use compact pane padding because the mobile shell owns topbar clearance",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-drawer-scroll\s*\{[\s\S]*padding-top:\s*calc\(var\(--mobile-topbar-clearance\)\s*\+\s*62px\);/,
  "mobile projection drawer should reserve the mobile topbar clearance and floating back button",
);

assert.match(
  contract,
  /Current UI Projection Slice[\s\S]*canonical projection is the normal production and staging chat surface[\s\S]*legacy chat timeline is not a production UI routing option[\s\S]*projection subscribes to canonical interaction roots and replies directly[\s\S]*legacy chat realtime is disabled for the normal web chat UI[\s\S]*canonical interaction read bundles expose public actor user ids[\s\S]*top-level composer sends use the canonical composer bridge[\s\S]*missing canonical writer fails closed[\s\S]*canonical projection does not rely on legacy chat realtime[\s\S]*stale interaction reads must not overwrite/,
  "interaction contract should document the active UI projection slice",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical chat writer[\s\S]*must not create legacy `communityChatMessages`[\s\S]*bounded, already-prepared attachment metadata[\s\S]*communityInteractionAttachments/,
  "interaction contract should document the active canonical composer bridge slice",
);

console.log("community interaction projection UI contract proof passed");
