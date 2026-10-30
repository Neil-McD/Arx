import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const roster = read("apps/web/src/components/ChannelRosterPanel.tsx");
assert.match(roster, /const selectedMember = props\.memberSettings\.canManageMembers/);
assert.match(roster, /if \(selectedMembershipId && !selectedMember && !rebuilding\) setSelectedMembershipId\(null\)/);
assert.match(roster, /member\.role !== "owner"/);
assert.match(roster, /<CommunityMemberSettingsDialog \{\.\.\.props\.memberSettings\}/);
const memberScroll = read("apps/web/src/components/useMemberScrollPagination.ts");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function sectionBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const packageJson = read("package.json");
const webPackageJson = read("apps/web/package.json");
const webMain = read("apps/web/src/main.tsx");
const app = read("apps/web/src/App.tsx");
const interactionController = read(
  "apps/web/src/controllers/useWebCommunityInteractionProjection.ts",
);
const profileHydrationController = read(
  "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
);
const chatController = read(
  "apps/web/src/controllers/useWebCommunityChatController.ts",
);
const rootReplyTarget = read(
  "apps/web/src/controllers/communityRootReplyTarget.ts",
);
const administrationState = read(
  "apps/web/src/controllers/useWebCommunityAdministrationState.ts",
);
const memberManagementController = read(
  "apps/web/src/controllers/useWebCommunityMemberManagementController.ts",
);
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const chatPresentationMode = read(
  "apps/web/src/controllers/resolveWebCommunityChatPresentationMode.ts",
);
const projection = read(
  "apps/web/src/components/WebCommunityInteractionProjection.tsx",
);
const joinReview = read("apps/web/src/components/CommunityJoinRequestReview.tsx");
const memberSettingsDialog = read(
  "apps/web/src/components/CommunityMemberSettingsDialog.tsx",
);
const communityNav = read("shared/CommunityNav.tsx");
const communityAccessViewModel = read("shared/communityAccessViewModel.ts");
const chromeShared = read("apps/web/src/components/webShellChromeShared.ts");
const chromeHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const communityNavSurface = read("apps/web/src/components/WebCommunityNavSurface.tsx");
const mobileCommunityShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const chromeHostPropsBuilder = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const youtubeEmbed = read("apps/web/src/components/DeferredYouTubeEmbed.tsx");
const directMessages = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const directoryController = read("shared/useCommunityDirectoryController.ts");
const activeCommunityShellController = read(
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
);
const communityDirectory = read("convex/communityDirectory.ts");
const communityDirectoryPageQuery = communityDirectory.slice(
  communityDirectory.indexOf("export const listCommunityDirectoryPage"),
);
const communityPublic = read("convex/communityPublic.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const interactions = read("convex/communityInteractions.ts");
const baseCss = [
  read("apps/web/src/base.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");
const contextFaceCss = sectionBetween(
  baseCss,
  ".member-avatar-stack-face {",
  ".member-avatar-stack-more",
);
const contextMemberAvatarMediaCss = sectionBetween(
  baseCss,
  ".community-context-member-avatar-media {",
  ".community-context-member-dot",
);
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const chatBlockMarkdownUi = read("shared/chatBlockMarkdownUi.tsx");
const publicCommunityStatsMapper = sectionBetween(
  communityPublic,
  "function mapPublicCommunityStats",
  "export const resolvePublicFunnelBySlug",
);
const memberPresenceSummaryQuery = sectionBetween(
  communityPublic,
  "export const getCommunityPresenceSummary",
  "export const listPublicDiscoverCommunities",
);

assert.match(
  packageJson,
  /"check:community-interaction-projection-ui-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_projection_ui_contract_proof\.ts"/,
  "package scripts should expose the community interaction projection UI proof",
);
assert.match(
  packageJson,
  /"check:chat-block-markdown-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/chat_block_markdown_proof\.ts"/,
  "package scripts should expose the bounded chat formatting proof",
);

assert.doesNotMatch(
  `${app}\n${interactionController}`,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION/,
  "the web projection should not be gated behind a Vite env flag",
);
assert.doesNotMatch(
  interactionController,
  /COMMUNITY_INTERACTION_PROJECTION_ENABLED/,
  "the canonical projection should not retain a dead constant feature gate",
);
assert.match(
  interactionController,
  /listCloudCommunityInteractionRoots[\s\S]*listCloudCommunityInteractionReplies/,
  "the projection owner should read canonical interaction roots and drawer replies",
);
assert.match(
  app,
  /useWebCommunityInteractionProjection<MessageAttachment>\([\s\S]*interactionProjection:\s*\{[\s\S]*roots:\s*isActiveCommunityChannelReady\s*\?\s*visibleCommunityInteractionRoots\s*:\s*\[\][\s\S]*selectedRootId:\s*isActiveCommunityChannelReady\s*\?\s*selectedCommunityInteractionRootId\s*:\s*null/,
  "App should pass canonical optimistic roots only after the requested channel resolves",
);
assert.match(
  interactionController,
  /subscribeCloudCommunityInteractionRoots[\s\S]*subscribeCloudCommunityInteractionReplies/,
  "the projection owner should subscribe to canonical interaction roots and replies",
);
assert.doesNotMatch(
  app,
  /listCloudCommunityInteractionRootsPage|listCloudCommunityInteractionReplies|subscribeCloudCommunityInteractionRoots|subscribeCloudCommunityInteractionReplies|toggleCloudCommunityInteractionReaction|editCloudCommunityInteractionMessage|deleteCloudCommunityInteractionMessage/,
  "App should compose the projection controller without owning its gateway lifecycle",
);
assert.doesNotMatch(
  chatController,
  /useCommunityChatRealtime|useCommunityChatViewport/,
  "the canonical web owner should not mount legacy realtime or legacy scroll pagination",
);
assert.doesNotMatch(
  chatController,
  /current\.interaction\.load(?:Roots|Replies)\(/,
  "send completion should leave reconciliation to the canonical live subscription owner",
);
assert.match(
  interactionController,
  /rootsRequestIdRef[\s\S]*activeCommunityIdRef[\s\S]*activeCommunityIdRef\.current !== communityId/,
  "the projection owner should guard against stale roots after community switches",
);
assert.match(
  profileHydrationController,
  /params\.communityInteractionRoots[\s\S]*bundle\.root\.actor_user_id[\s\S]*params\.communityInteractionRepliesByRootId[\s\S]*bundle\.reply\.actor_user_id/,
  "the profile-hydration owner should collect canonical root and reply actors",
);
assert.match(
  app,
  /useWebCommunityProfileHydrationController\(\{[\s\S]*communityInteractionRoots,[\s\S]*communityInteractionRepliesByRootId,/,
  "App should compose canonical interaction actors into the profile-hydration owner",
);

assert.match(
  chatPanel,
  /WebCommunityInteractionProjection/,
  "chat panel should render the canonical projection component",
);
assert.match(
  chatPanel,
  /resolveWebCommunityChatPresentationMode\(\{[\s\S]*hasActiveCommunity:[\s\S]*hasAuthenticatedPresentation/,
  "chat panel should delegate structural ownership to the canonical presentation resolver",
);
assert.match(
  chatPanel,
  /const showInteractionProjection = communityChatPresentationMode === "canonical";[\s\S]*const showCanonicalCommunityBootstrap =[\s\S]*communityChatPresentationMode === "canonical_bootstrap"/,
  "canonical chat should own either the live projection or its geometry-compatible bootstrap",
);
assert.match(
  chatPresentationMode,
  /if \(input\.hasAuthenticatedPresentation && input\.hasActiveCommunity\)[\s\S]*return "canonical";[\s\S]*return "canonical_bootstrap";[\s\S]*return "empty";/,
  "authenticated community chat must resolve only to canonical owners",
);
assert.doesNotMatch(
  chatPanel,
  /legacy_bootstrap|showCommunityChatBootstrap/,
  "the dead legacy bootstrap presentation mode should be deleted",
);
assert.doesNotMatch(
  chatPanel,
  /CommunityChatMessageRow|communityMessages|communityActivityEvents|showLegacyInteractionSurface/,
  "chat panel should not keep the legacy message timeline or its state contract",
);
assert.match(
  chatPanel,
  /WebCommunityInteractionProjection[\s\S]*profilesByUserId=\{profilesByUserId\}/,
  "chat panel should pass hydrated profile rows into the canonical projection",
);
assert.match(
  app,
  /renderTextWithLinks,[\s\S]*interactionProjection:\s*\{/,
  "App should pass safe link rendering into the community chat panel",
);
assert.doesNotMatch(
  chatPanel,
  /renderMarkdown/,
  "community chat should not depend on the broad workspace markdown renderer",
);
assert.doesNotMatch(
  surfaceProjection,
  /renderMarkdown/,
  "community surface projection should not carry an unused workspace markdown renderer",
);
assert.doesNotMatch(
  projection,
  /renderMarkdown|interactionBodyRenderModeForActor|renderMode=/,
  "roots and replies should not branch rendering by actor type",
);
assert.match(
  feed,
  /ChatBlockMarkdown[\s\S]*tokenizeChatContactText[\s\S]*export function InteractionBody[\s\S]*renderFormattedRun: renderMentionAwareText,[\s\S]*allowLabeledLinks: true,[\s\S]*community-interaction-body community-interaction-chat-markdown[\s\S]*<ChatBlockMarkdown text=\{text\} renderInline=\{renderInline\}/,
  "every community message should use the bounded block renderer with contact and mention-aware inline formatting",
);
assert.doesNotMatch(
  feed,
  /interactionBodyRenderModeForActor|compact_markdown|props\.renderMarkdown/,
  "feed rendering should have one deterministic path for humans and agents",
);
assert.doesNotMatch(
  directMessages,
  /allowLabeledLinks/,
  "direct messages should retain their existing inline-only formatting behavior",
);
assert.match(
  chatBlockMarkdownUi,
  /className="chat-md-code-block"[\s\S]*tabIndex=\{0\}[\s\S]*onKeyDown=[\s\S]*ArrowLeft[\s\S]*ArrowRight[\s\S]*Home[\s\S]*End/,
  "overflowing community code blocks should be focusable and keyboard-scrollable",
);
assert.match(
  baseCss,
  /\.community-interaction-chat-markdown \.chat-md-code-block:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--chat-link\)/,
  "focused community code blocks should expose a visible theme-aware outline",
);
assert.match(
  contextFaceCss,
  /position:\s*relative;/,
  "presence face frames must contain canonical absolute avatar crops",
);
assert.match(
  contextFaceCss,
  /overflow:\s*hidden;/,
  "presence face frames must clip avatar crops to their circular boundary",
);
assert.match(
  contextMemberAvatarMediaCss,
  /position:\s*relative;/,
  "member avatar media must contain canonical absolute avatar crops",
);
assert.match(
  contextMemberAvatarMediaCss,
  /overflow:\s*hidden;/,
  "member avatar media must clip crops without clipping the sibling presence dot",
);
assert.match(
  feed,
  /export function bundleText[\s\S]*hasCanonicalMessageText[\s\S]*block\.block_type === "markdown_text"[\s\S]*hasCanonicalMessageText[\s\S]*block\.block_type !== "link"[\s\S]*:\s*orderedBlocks/,
  "interaction bodies should omit derived link blocks when canonical markdown text already contains the URL while preserving link-only fallback text",
);
assert.match(
  feed,
  /export function InteractionContent[\s\S]*<InteractionBody[\s\S]*<MessageLinkMedia text=\{props\.text\}[\s\S]*props\.afterBody/,
  "interaction content should preserve authored text, share media previews with DMs, and preserve attachments",
);
assert.doesNotMatch(
  feed,
  /CommunityInteractionLinkPreview|EmbedCards|selectRichInteractionEmbeds|props\.embeds/,
  "the shared feed renderer should not retain generic preview or stored-link-embed branches",
);
assert.match(
  youtubeEmbed,
  /IntersectionObserver[\s\S]*data-community-youtube-embed[\s\S]*<iframe[\s\S]*sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"/,
  "YouTube should share one viewport-loaded native player with its sandbox intact",
);
assert.match(
  projection,
  /communityInteractionRootHasRichContent[\s\S]*attachments\.length > 0[\s\S]*youTubeEmbedsInText\(text\)\.length > 0[\s\S]*pdfLinksInText\(text\)\.length > 0/,
  "rich-content detection should match attachments, YouTube and pasted PDF cards",
);
assert.doesNotMatch(
  projection,
  /selectRichInteractionEmbeds|CommunityInteractionEmbed|embeds=\{/,
  "thread roots and replies should not depend on stored generic link previews",
);
assert.match(
  communityAccessViewModel,
  /const canEnterCommunity = access \? Boolean\(access\.can_enter_community \?\? access\.can_view\) : false;[\s\S]*canViewMembers: canEnterCommunity,/,
  "member-facing community nav visibility should derive from community entry access, not admin authority",
);
assert.match(
  communityNav,
  /function resolveCommunityJoinUrl[\s\S]*const joinPath = `\/c\/\$\{encodeURIComponent\(slug\)\}`;[\s\S]*new URL\(joinPath, window\.location\.origin\)\.toString\(\)/,
  "community nav should copy the canonical public community funnel path for invites",
);
assert.match(
  communityNav,
  /const canCopyJoinLink = Boolean\(canViewMembersActiveCommunity && joinUrl && onCopyCommunityJoinLink\);/,
  "community nav invite action should be available to member-facing viewers with a resolvable slug",
);
assert.match(
  communityNav,
  /useEffect\(\(\) => \{[\s\S]*setDidCopyJoinLink\(false\);[\s\S]*copyResetTimeoutRef\.current = null;[\s\S]*\}, \[joinUrl\]\);/,
  "community nav should clear copied state when the active community join URL changes",
);
assert.match(
  communityNav,
  /className=\{`nav-item community-nav-invite\$\{didCopyJoinLink \? " is-copied" : ""\}`\}[\s\S]*onClick=\{\(\) => void handleCopyJoinLink\(\)\}/,
  "community nav should render the invite action as a stable left-nav item",
);
assert.match(
  chromeShared,
  /onCopyCommunityJoinLink: \(joinUrl: string\) => Promise<void> \| void;/,
  "web shell shared props should expose the invite copy callback explicitly",
);
assert.match(
  communityNavSurface,
  /<CommunityNav[\s\S]*onCopyCommunityJoinLink=\{communityShell\.onCopyCommunityJoinLink\}/,
  "the canonical community nav adapter should receive the invite copy callback",
);
assert.doesNotMatch(
  mobileCommunityShell,
  /<CommunityNav/,
  "the retired mobile community drawer should not duplicate community navigation",
);
assert.match(
  chromeHostPropsBuilder,
  /onCopyCommunityJoinLink: WebShellChromeHostProps\["communityShell"\]\["onCopyCommunityJoinLink"\];[\s\S]*onCopyCommunityJoinLink: params\.onCopyCommunityJoinLink,/,
  "web shell prop builder should carry the invite copy callback into the community shell",
);
assert.match(
  app,
  /buildWebShellChromeHostProps\(\{[\s\S]*onCopyCommunityJoinLink: copyTextToClipboard,/,
  "App should wire community invite copying through the existing clipboard helper",
);
assert.match(
  baseCss,
  /\.community-nav-footer\s*\{[\s\S]*margin-top:\s*auto;[\s\S]*padding-top:\s*12px;/,
  "community nav invite action should be bottom-pinned in the left nav",
);
assert.match(
  administrationState,
  /const directory = useCommunityDirectoryController<AuthSession>/,
  "community administration state should own the member-facing directory controller",
);
assert.match(
  directoryController,
  /loadCommunityDirectoryMembers[\s\S]*listCloudCommunityDirectoryWindow/,
  "mention and profile hydration retain the bounded canonical directory reader",
);
assert.match(
  directoryController,
  /requestedPresentationScope[\s\S]*isPresentationScoped[\s\S]*communityDirectoryMembers: isPresentationScoped/,
  "the directory must synchronously scope member presentation to identity and community",
);
assert.match(
  app,
  /communityAdministration\.directory/,
  "App should compose the canonical directory owner",
);
assert.doesNotMatch(
  app,
  /interactionProjection:\s*\{[\s\S]*communityMembers:\s*communityMembers[\s\S]*loadMoreCommunityMembers/,
  "chat right rail must not depend on the admin member roster",
);


assert.match(
  communityNav,
  /export const CommunityNav = memo\(function CommunityNav/,
  "left navigation should not rerender for unrelated shell content updates",
);


assert.match(
  memberScroll,
  /LOAD_MORE_SCROLL_THRESHOLD_PX[\s\S]*props\.onLoadMoreMembers\(\)/,
  "context panel should load additional roster pages as the member rail scrolls near the bottom",
);

assert.match(
  memberScroll,
  /membersViewportRef[\s\S]*loadMoreSentinelRef[\s\S]*IntersectionObserver[\s\S]*observer\.observe\(sentinel\)/,
  "context panel should observe a footer sentinel so visible additional pages load without requiring another scroll event",
);
assert.match(
  memberScroll,
  /requestAnimationFrame\(requestVisibleMemberPage\)/,
  "context panel should re-check after render when the member viewport is already near the bottom",
);



assert.doesNotMatch(
  directoryController,
  /setCommunityDirectoryMembersHasMore/,
  "mention directory must not retain the retired roster pagination state",
);



assert.match(
  baseCss,
  /\.community-context-member-action\s*\{[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;[\s\S]*opacity:\s*1;/,
  "directory actions should be visible without hover",
);
assert.match(
  baseCss,
  /\.community-context-member:hover \.community-context-member-action,[\s\S]*\.community-context-member-action:focus-visible\s*\{[\s\S]*opacity:\s*1;/,
  "member rail settings action should reveal on hover and keyboard focus",
);
assert.match(
  roster,
  /import \{ CommunityMemberSettingsDialog \} from "\.\/CommunityMemberSettingsDialog";/,
  "channel roster should reuse the shared member settings dialog",
);
assert.match(
  projection,
  /canManageCommunityMembers\?: boolean;[\s\S]*onSetCommunityMemberRole\?: \(membershipId: string, role: "co_creator" \| "admin" \| "moderator" \| "member"\) => Promise<void> \| void;[\s\S]*loadMemberBillingHistory\?: \(membershipId: string\) => Promise<CloudCommunityMemberBillingHistory \| null>;/,
  "interaction projection should accept the existing member-management controller contract explicitly",
);
assert.match(projection, /handleSetCommunityMemberRole: \(id, role\) => props\.onSetCommunityMemberRole\?\.\(id, role\)/);
assert.match(
  memberManagementController,
  /const reloadDirectory = useCallback[\s\S]*await params\.loadDirectoryMembers\(communityId, session\);/,
  "member-management controller should provide a right-panel directory reload",
);
assert.match(
  memberManagementController,
  /const setMemberRole = useCallback[\s\S]*await params\.setMemberRole\(membershipId, role\);[\s\S]*await reloadDirectory\(\);/,
  "right-panel role changes should reuse the existing member role mutation and then refresh the directory projection",
);
assert.match(
  app,
  /interactionProjection:\s*\{[\s\S]*canManageCommunityMembers:\s*canManageMembersActiveCommunity[\s\S]*onSetCommunityMemberRole:\s*handleSetCommunityContextMemberRole[\s\S]*onRemoveCommunityMember:\s*handleRemoveCommunityContextMember[\s\S]*onBanCommunityMember:\s*handleBanCommunityContextMember[\s\S]*loadMemberBillingHistory:\s*loadCommunityMemberBillingHistory/,
  "App should wire manager-only right-panel controls from the existing active-community permission and action contract",
);
assert.match(
  joinReview,
  /canReviewJoinRequests\?: boolean;[\s\S]*joinReviewMode\?: "paid" \| "free_auto" \| "free_approval" \| null;[\s\S]*pendingJoinRequests\?: CommunityAdmissionJoinRequest\[\] \| null;/,
  "context panel should receive the existing join-review queue projection explicitly",
);
assert.match(
  joinReview,
  /const canShowJoinRequests = Boolean\([\s\S]*props\.canReviewJoinRequests[\s\S]*props\.joinReviewMode === "free_approval"[\s\S]*pendingJoinRequests\.length > 0/,
  "context panel should only pop the request affordance for free approval queues the viewer can review",
);
assert.match(
  joinReview,
  /PENDING_JOIN_REQUEST_DISPLAY_LIMIT = 200[\s\S]*hasPendingJoinRequestOverflow[\s\S]*\? "200\+"[\s\S]*requestDividerLabel[\s\S]*requestDividerAriaLabel[\s\S]*visiblePendingJoinRequests\.map\(renderJoinRequest\)/,
  "context panel should render a bounded 200+ pending-request projection with an accessible divider label",
);
assert.match(
  adminGateway,
  /approved_pending_request_count\?: number;[\s\S]*pending_request_overflow\?: boolean;[\s\S]*listCommunityJoinRequests[\s\S]*limit: 201,[\s\S]*includeStatuses: \["pending"\]/,
  "admin gateway should fetch one extra pending request so the context rail can honestly show 200+ without an exact count query",
);
assert.match(
  joinReview,
  /className=\{`community-context-request-divider[\s\S]*aria-busy=\{props\.isLoadingJoinRequests \|\| undefined\}[\s\S]*aria-controls=\{joinRequestPanelId\}[\s\S]*aria-expanded=\{joinRequestsExpanded\}[\s\S]*id=\{joinRequestPanelId\}[\s\S]*visiblePendingJoinRequests\.map\(renderJoinRequest\)/,
  "context panel should expand confirmed pending requests from an accessible member-rail divider",
);
assert.doesNotMatch(
  joinReview,
  /community-context-request-chip|community-context-request-control-row|Loading requests\.\.\./,
  "context panel should not retain the legacy request pill or mount a transient loading affordance",
);
assert.match(
  joinReview,
  /const canShowJoinRequestLoadError = Boolean\([\s\S]*pendingJoinRequests\.length === 0[\s\S]*!props\.isLoadingJoinRequests[\s\S]*props\.joinRequestsError[\s\S]*role="status"/,
  "zero-count request load failures should remain readable without recreating the request control",
);
assert.match(
  joinReview,
  /props\.onApproveJoinRequest\?\.\(request\.id\)[\s\S]*props\.onDenyJoinRequest\?\.\(request\.id\)/,
  "context panel request rows should reuse the existing approve and deny callbacks",
);
assert.match(
  projection,
  /communityJoinRequests\?: CommunityAdmissionJoinRequest\[\] \| null;[\s\S]*onApproveCommunityJoinRequest\?: \(requestId: string\) => Promise<void> \| void;/,
  "interaction projection should carry admission controls and join-review callbacks into the context rail",
);

assert.match(
  memberManagementController,
  /const setFreeAccessMode = useCallback[\s\S]*setCloudCommunityFreeAccessMode\(\{[\s\S]*mode,[\s\S]*\}\);[\s\S]*entry_policy: result\?\.entry_policy \?\? mode/,
  "member-management controller should use the canonical free-access mutation and update the local entry policy",
);
assert.match(
  memberManagementController,
  /const isStillActive = \(\) => getActiveCommunity\(\) === communityId;[\s\S]*approved_pending_request_count[\s\S]*params\.clearJoinRequests\(\)[\s\S]*params\.loadDirectoryMembers\(communityId, session\)[\s\S]*if \(!isStillActive\(\)\) return;/,
  "member-management controller should key Auto-join side effects to the initiating community and refresh after backend approvals",
);
assert.match(
  app,
  /communityContextJoinRequests = useMemo\([\s\S]*\.filter\(\(request\) =>[\s\S]*request\.community_id === activeCommunityId &&[\s\S]*String\(request\.status \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "pending"[\s\S]*createdAtLabel: formatRelativeTime\(request\.created_at\)/,
  "App should pass only active-community pending request rows into the context rail request dropdown",
);
assert.match(
  app,
  /const shouldHydrateCommunityContextPanel =[\s\S]*activePage === "community" &&[\s\S]*(?:communityTab === "chat"|isCommunityChatBackedTab\(communityTab\));[\s\S]*shouldLoad: shouldHydrateCommunityContextPanel/,
  "join request review data should load from the community chat context rail",
);
assert.doesNotMatch(
  app,
  /shouldHydrateWorkspaceCommunityPanel/,
  "deleted workspace community panel must not keep a separate hydration trigger",
);
assert.match(
  communityAdmin,
  /approveCommunityJoinRequest = mutation\(\{[\s\S]*requestId: v\.id\("communityJoinRequests"\)[\s\S]*ctx\.db\.get\(args\.requestId\)/,
  "approve join request should validate request ids as communityJoinRequests ids",
);
assert.match(
  communityAdmin,
  /approveCommunityJoinRequestForFreeAccess[\s\S]*activateCommunityMembershipCore\(\{[\s\S]*activationReason: args\.grantReason[\s\S]*enqueueCommunityAccessGrantedEmailInternal[\s\S]*approveCommunityJoinRequest = mutation\(\{[\s\S]*approveCommunityJoinRequestForFreeAccess\(\{[\s\S]*grantReason: "join_request_approved"/,
  "manual join-request approval should use the canonical membership lifecycle so membership, counts, grants, and emails stay canonical",
);
assert.match(
  communityAdmin,
  /OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT = 100[\s\S]*approvePendingJoinRequestsForOpenAccessBatch[\s\S]*approvePendingJoinRequestsForOpenAccessInternal = internalMutation[\s\S]*resolveCommunityEntryPolicy\(community\) !== "open"[\s\S]*scheduleOpenAccessPendingApprovalContinuation/,
  "opening Auto-join should resolve pending requests in bounded backend batches and stop if the community is no longer open",
);
assert.match(
  communityAdmin,
  /setCommunityFreeAccessMode = mutation\(\{[\s\S]*entryPolicy === "open" && currentEntryPolicy !== "paid_subscription"[\s\S]*approvePendingJoinRequestsForOpenAccessBatch[\s\S]*approved_pending_request_count: approvedPendingRequestCount[\s\S]*pending_request_overflow: pendingRequestOverflow/,
  "setCommunityFreeAccessMode should canonicalize existing pending requests when free Auto-join is enabled",
);
assert.match(
  communityAdmin,
  /denyCommunityJoinRequest = mutation\(\{[\s\S]*requestId: v\.id\("communityJoinRequests"\)[\s\S]*ctx\.db\.get\(args\.requestId\)/,
  "deny join request should validate request ids as communityJoinRequests ids",
);
assert.equal(
  existsSync(
    join(root, "apps/web/src/components/WebWorkspaceUserDataPanel.tsx"),
  ),
  false,
  "the retired Workspace data panel must remain absent once member-header approvals own the queue",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-community-approval-|\.workspace-community-operations/,
  "base CSS should not keep stale workspace approval styles after the queue moves to the member rail",
);
[
  ".community-context-request-divider",
  ".community-context-request-panel",
  ".community-context-request-row",
].forEach((selector) => {
  assert.ok(baseCss.includes(selector), `base.css should include ${selector}`);
});
assert.doesNotMatch(
  baseCss,
  /\.community-context-request-chip|\.community-context-request-control-row/,
  "base CSS should not retain the legacy request pill selectors",
);
assert.match(
  baseCss,
  /\.community-context-request-divider::before,[\s\S]*\.community-context-request-divider::after[\s\S]*background: var\(--stroke-divider-accent\);/,
  "the request divider should reuse the platform divider token",
);
assert.match(
  baseCss,
  /\.community-context-members \{[\s\S]*scrollbar-gutter: stable;/,
  "member rail should reserve stable scrollbar space so roster refreshes do not move admission controls",
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
  /props\.isActiveCommunityOwner[\s\S]*\(\["member", "moderator", "admin", "co_creator"\] as const\)[\s\S]*memberIsAdmin[\s\S]*\(\[memberRole\] as const\)[\s\S]*\(\["member", "moderator"\] as const\)/,
  "member settings dialog should expose owner/admin role options according to the existing management split",
);
assert.match(
  memberSettingsDialog,
  /return \(\) => \{[\s\S]*didCancel = true;[\s\S]*requestedMemberBillingHistoryIdsRef\.current\.delete\(memberId\);[\s\S]*setLoadingMemberBillingHistoryId\(\(current\) => \([\s\S]*current === memberId \? null : current/,
  "member settings dialog should clear in-flight billing history state when closed or switched",
);
assert.doesNotMatch(
  surfaceProjection,
  /members:\s*\{/,
  "legacy Members page projection should stay deleted; the right rail owns member context",
);

assert.match(
  directoryGateway,
  /client\.query\("communityDirectory:listCommunityDirectoryPage" as any/,
  "directory gateway should read chat rail members through the member-facing directory query",
);
assert.match(
  communityTypes,
  /last_active_at: string;/,
  "directory rows must expose their canonical activity timestamp",
);
assert.doesNotMatch(
  directoryGateway,
  /countCommunityDirectoryMembers/,
  "directory pages must not expose a separate recount query",
);
assert.doesNotMatch(
  directoryGateway,
  /syncCommunityMembershipCount|listCommunityMembershipsAdminPage/,
  "directory gateway must not use admin roster reads or cache-sync mutations",
);
assert.match(
  directoryController,
  /listCloudCommunityDirectoryWindow[\s\S]*setCommunityDirectoryMemberCount\(page.totalCount\)/,
  "directory hydration should retain the canonical total count",
);
assert.match(
  communityDirectory,
  /resolveCommunityDirectoryContext[\s\S]*requireCommunityChatAccess[\s\S]*export const listCommunityDirectoryPage = query/,
  "directory backend should be gated by community chat access",
);
assert.match(
  communityDirectoryPageQuery,
  /by_community_createdAt[\s\S]*\.order\("asc"\)[\s\S]*\.paginate\(\{[\s\S]*cursor,[\s\S]*maximumRowsRead:/,
  "directory pages should use the activity ledger and an opaque bounded cursor",
);
assert.match(
  communityDirectoryPageQuery,
  /communityMembershipRowIsActive[\s\S]*resolveCommunityPresenceAuthorization[\s\S]*authorization\.authorized[\s\S]*page: memberRows/,
  "directory pages should reauthorize activity rows and filter inactive memberships",
);
assert.match(
  communityDirectoryPageQuery,
  /totalCount: readCommunityActiveMemberCount\(community\)[\s\S]*continueCursor: rawPage\.isDone \? null : prefix \+ rawPage\.continueCursor/,
  "directory pages should consume the durable member count and preserve Convex cursor semantics",
);
assert.match(
  communityDirectory,
  /last_active_at: args.lastSeenAt === null \? "" : toIsoString\(args\.lastSeenAt\)/,
  "directory rows should carry activity from the canonical ordering ledger",
);
assert.doesNotMatch(
  memberPresenceSummaryQuery,
  /online_last_active_at_by_user_id|onlineLastActiveAtByUserId/,
  "presence summary should not duplicate directory activity timestamps",
);
assert.match(
  activeCommunityShellController,
  /type ScopedPresenceSummary = \{[\s\S]*communityId: string;[\s\S]*sessionIdentity: string;[\s\S]*summary: CommunityPresenceSummary \| null;[\s\S]*useState<ScopedPresenceSummary \| null>[\s\S]*activeCommunityIdRef\.current === communityId[\s\S]*setActiveCommunityPresenceSummaryState\(\(previous\) => reuseEquivalentValue\(previous, \{[\s\S]*communityId,[\s\S]*sessionIdentity,[\s\S]*summary: summary \?\? null,[\s\S]*activeCommunityPresenceSummaryState\?\.communityId !== communityId\) return null;[\s\S]*activeCommunityPresenceSummaryState\.sessionIdentity !== sessionIdentity\) return null;/,
  "active community shell controller should scope and identity-stabilize presence summaries",
);
assert.doesNotMatch(
  communityDirectory,
  /mutation\(|syncCommunityMembershipCount|viewerCanManageMembers|community_forbidden/,
  "directory backend must stay read-only and member-facing",
);
assert.doesNotMatch(
  publicCommunityStatsMapper,
  /last_active_at|online_last_active_at_by_user_id|onlineLastActiveAtByUserId/,
  "public community funnel payloads must not expose per-member last active timestamps",
);

assert.doesNotMatch(
  projection,
  /online_last_active_at_by_user_id|onlineLastActiveAtByUserId|activityScopeKey/,
  "interaction projection should not carry the retired live-only activity map",
);
assert.doesNotMatch(
  baseCss,
  /\.community-context-member-activity/,
  "deleted activity labels should not retain styles",
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
  /client\.query\("communityInteractions:listCommunityInteractionRoots" as any/,
  "gateway should read roots through the community interaction query",
);
assert.match(
  gateway,
  /client\.query\("communityInteractions:listCommunityInteractionReplies" as any/,
  "gateway should read drawer replies through the community interaction query",
);
assert.match(
  gateway,
  /client\.mutation\([\s\S]*api\.communityInteractions\.createCommunityInteractionComposerMessage/,
  "gateway should expose the canonical composer bridge mutation",
);
assert.match(
  chatController,
  /if \(replySnapshot && !replyRootId\)[\s\S]*Reply target is unavailable[\s\S]*createCloudCommunityInteractionComposerMessageRows<AuthSession>/,
  "web composer should fail closed on unmapped replies and write only through the canonical gateway",
);
assert.doesNotMatch(
  chatController,
  /createCloudThreadUserMessageRows|ensureCommunityChatThread|loadCommunityChat|projection_disabled/,
  "web composer should not retain a legacy writer or loader fallback",
);
assert.match(
  chatController,
  /current\.interaction\.insertOptimistic\(\{[\s\S]*idempotencyKey,[\s\S]*attachments: preparedAttachments,[\s\S]*serializedAttachments/,
  "canonical optimistic projection rows should use the write idempotency key and prepared attachments",
);
assert.match(chatController, /serializedMentions: mentionsToSend/,
  "pending attempts must retain the original committed mentions");
assert.match(interactionController, /attachments: interaction\.serializedAttachments,[\s\S]*mentions: interaction\.serializedMentions/,
  "retries must submit original attachment claims and mentions");
assert.match(chatController,
  /if \(insertedOptimistic\) \{[\s\S]*settleOptimistic\([\s\S]*\} else \{\s*restoreDraft\(\);\s*\}\s*setError\(mapCommunityComposerErrorMessage\(sendError\)\);\s*\} finally/,
  "a failed pending attempt and a restored draft must be mutually exclusive recovery paths");
assert.match(
  interactionController,
  /function appendPendingRoots[\s\S]*new Set\(roots\.map\(\(bundle\) => bundle\.root\.idempotency_key\)\)[\s\S]*storedIdempotencyKey\(item\.idempotencyKey, "root"\)/,
  "pending root overlays should dedupe against visible canonical roots by stored idempotency key",
);
assert.match(
  interactionController,
  /embeds:\s*\[\]/,
  "optimistic roots and replies should not synthesize a second generic link-preview state",
);
assert.doesNotMatch(
  interactionController,
  /optimisticLinkEmbeds|pending-link:|extractCommunityInteractionLinkSources|maybeSafeCommunitySourceUrl/,
  "optimistic projection should keep authored links in canonical message text only",
);
assert.match(
  interactionController,
  /function appendPendingReplies[\s\S]*new Set\(replies\.map\(\(bundle\) => bundle\.reply\.idempotency_key\)\)[\s\S]*storedIdempotencyKey\(item\.idempotencyKey, "reply"\)/,
  "pending reply overlays should dedupe against visible canonical replies by stored idempotency key",
);
assert.match(
  chatPanel,
  /buildCommunityRootReplyTarget[\s\S]*root: selectedInteractionRootBundle\?\.root[\s\S]*communityName: activeCommunity\?\.name/,
  "canonical drawer should derive its root reply target from the shared fail-closed resolver",
);
assert.match(
  rootReplyTarget,
  /root\.actor_type === "human"[\s\S]*Boolean\(humanUserId\)[\s\S]*root\.actor_type === "community_agent"[\s\S]*root\.actor_agent_key === CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*!isHumanTarget[\s\S]*!isCanonicalCommunityAgentTarget[\s\S]*interaction_root_id: rootId[\s\S]*interaction_reply_id: null/,
  "root replies should support humans and the community agent without inventing a user or reply target",
);
assert.doesNotMatch(
  chatPanel,
  /if \(!root\?\.id \|\| !root\.actor_user_id\) return null/,
  "canonical agent-authored roots must not be hidden by the former human-only composer gate",
);
assert.match(
  projection,
  /onReply=\{replyMentionCandidate && props\.onStartRootReply[\s\S]*id: reply\.id,[\s\S]*mention_candidate: replyMentionCandidate[\s\S]*interaction_root_id: reply\.root_id[\s\S]*interaction_reply_id: reply\.id,/,
  "canonical drawer reply action should carry mention identity and canonical root and reply ids",
);
assert.doesNotMatch(
  gateway,
  /createThreadUserMessage|sendCloudCommunityMessage|communityChatMessages/,
  "interaction gateway should not fall back to legacy chat tables",
);
assert.match(
  interactions,
  /mapRootBundle[\s\S]*resolvePublicUserId\(ctx, root\.actorUserId[\s\S]*authorFields\(presentInteractionActorType\(root\.actorType\), publicActorUserId/,
  "root read bundles should expose public actor user ids (or the member a community agent post was for) for UI profile hydration",
);
assert.match(
  interactions,
  /mapReplyBundle[\s\S]*resolvePublicUserId\(ctx, reply\.actorUserId[\s\S]*authorFields\(presentInteractionActorType\(reply\.actorType\), publicActorUserId/,
  "reply read bundles should expose public actor user ids (or the member a community agent post was for) for UI profile hydration",
);

assert.match(
  projection,
  /selectedRoot[\s\S]*community-interaction-drawer/,
  "projection should render a one-level drawer for the selected root",
);
assert.match(
  projection,
  /CommunityPinnedRootSurface[\s\S]*onOpen=\{\(\) => props\.onSelectRoot[\s\S]*CommunityInteractionFeedList[\s\S]*roots=\{\[props\.pinnedRoot\]\}[\s\S]*showDayDividers=\{false\}/,
  "pinned projection should bound the canonical root renderer and open that same root",
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
  /export function CommunityInteractionFeedList[\s\S]*props\.roots[\s\S]*MessageActions[\s\S]*ReactionSummary/,
  "shared feed renderer should own root rows and their canonical reaction presentation",
);
assert.doesNotMatch(
  `${projection}\n${feed}`,
  /showReactions|interactionReactionsVisible/,
  "the shared feed renderer should not grow a second pinned-only rendering API",
);
assert.match(
  baseCss,
  /\.community-channel-pinned-root-viewport \.community-interaction-msg-actions,[\s\S]*?\.community-channel-pinned-root-viewport \.community-interaction-footer\s*\{[\s\S]*?display:\s*none;/,
  "the bounded teaser should suppress nested feed actions while the full thread keeps them canonical",
);
assert.match(
  projection,
  /communityInteractionRootHasRichContent[\s\S]*pdfLinksInText\(text\)[\s\S]*hasRichContent=\{communityInteractionRootHasRichContent/,
  "pinned roots should classify the same PDF cards and YouTube media as the feed",
);
assert.doesNotMatch(
  `${app}\n${projection}\n${feed}`,
  /workspaceRecentSignalFeed|density="(?:full|compact)"|density: "full" \| "compact"/,
  "workspace residue and the unused interaction-feed density contract should stay deleted",
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
  /\.community-channel-header\s*\{[\s\S]*flex:\s*0\s+0\s+var\(--web-topbar-height,\s*48px\);[\s\S]*\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*10px\s+18px\s+4px;/,
  "the active-channel header should own the web topbar band while the feed keeps compact pane padding",
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
  /\.community-interaction-body\.community-interaction-chat-markdown\s*\{[\s\S]*display:\s*block;[\s\S]*\.community-interaction-chat-markdown \.chat-md-heading-1\s*\{[\s\S]*font-size:\s*1\.08em;[\s\S]*\.community-interaction-chat-markdown \.chat-md-list\s*\{[\s\S]*padding-left:\s*1\.36em;[\s\S]*\.community-interaction-chat-markdown \.chat-md-code-block\s*\{/,
  "projection markdown should style bounded headings, lists, and code with compact chat typography",
);
assert.match(
  webPackageJson,
  /"@fontsource-variable\/ibm-plex-sans":\s*"5\.3\.0"/,
  "web must pin the self-hosted IBM Plex Sans package",
);
assert.match(
  webMain,
  /import\s+"@fontsource-variable\/ibm-plex-sans\/wght\.css";/,
  "web entrypoint must load the IBM Plex Sans variable font before application styles",
);
assert.match(
  baseCss,
  /--font-sans:\s*"IBM Plex Sans Variable",\s*"IBM Plex Sans",\s*system-ui,\s*-apple-system,\s*sans-serif;[\s\S]*font-family:\s*var\(--font-sans\);/,
  "the application must use the loaded IBM Plex family with resilient system fallbacks",
);
assert.match(
  baseCss,
  /--chat-author-text:\s*color-mix\(in srgb, var\(--text-primary\) 98%, var\(--surface-workspace\) 2%\);[\s\S]*--chat-body-text:\s*color-mix\(in srgb, var\(--text-primary\) 82%, var\(--surface-workspace\) 18%\);[\s\S]*--chat-meta-text:\s*color-mix\(in srgb, var\(--text-primary\) 70%, var\(--surface-workspace\) 30%\);[\s\S]*--chat-system-text:\s*color-mix\(in srgb, var\(--text-primary\) 62%, var\(--surface-workspace\) 38%\);/,
  "chat identity, content, and metadata should use a theme-aware semantic text ladder",
);
assert.match(
  baseCss,
  /\.community-interaction-meta-row\s*\{[^}]*color:\s*var\(--chat-meta-text\);[\s\S]*?\.community-interaction-author\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--text-primary\) 93%, var\(--surface-workspace\) 7%\);[^}]*font-size:\s*15px;[^}]*font-weight:\s*600;[\s\S]*?\.community-interaction-body\s*\{[^}]*margin-top:\s*2px;[^}]*color:\s*var\(--chat-body-text\);[^}]*font-size:\s*15px;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.48;/,
  "community chat should scan author first, body second, and metadata third",
);
assert.match(
  baseCss,
  /\.community-interaction-footer\s*\{[^}]*margin-top:\s*6px;[\s\S]*?\.community-interaction-day\s*\{[^}]*padding:\s*10px 4px 4px;[\s\S]*?\.community-interaction-group-body\s*\{[^}]*gap:\s*0;[\s\S]*?\.community-interaction-message\s*\{[^}]*padding:\s*0 6px 2px;/,
  "community chat rhythm should stay compact within groups while preserving separation between groups",
);
assert.match(
  baseCss,
  /\.community-interaction-thread-anchor-actions\s*\{[^}]*margin-top:\s*6px;[\s\S]*?\.community-interaction-reply-list\s*\{[^}]*gap:\s*0;[\s\S]*?\.community-interaction-reply\s*\{[^}]*padding:\s*8px;[\s\S]*?\.community-interaction-reply-content > \.community-interaction-reactions\s*\{[^}]*margin-top:\s*6px;/,
  "thread roots and replies should use the same compact body-to-footer rhythm as the channel feed",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-thread-drawer \.community-interaction-drawer-back\s*\{[^}]*height:\s*var\(--web-topbar-height, 48px\);[^}]*border-bottom:\s*1px solid var\(--stroke-divider-accent\);[^}]*background:\s*var\(--community-chat-surface\);[^}]*box-shadow:\s*none;/,
  "member threads should keep navigation in a stable top band above scrolling content",
);
assert.match(
  baseCss,
  /--chat-link:\s*var\(--accent-cyan\);[\s\S]*--chat-link-hover:[\s\S]*\.chat-link:visited\s*\{[\s\S]*color:\s*var\(--chat-link\);[\s\S]*\.chat-link:focus-visible\s*\{/,
  "Dark should inherit one accessible semantic treatment for chat links",
);
assert.match(
  read("apps/web/src/styles/message-media.css"),
  /\.deferred-youtube \{[^}]*min-height: 200px;[^}]*aspect-ratio: 16 \/ 9;[\s\S]*iframe:focus-visible[^}]*outline: 2px solid var\(--chat-link\)/,
  "native YouTube should reserve space, meet minimum height and retain keyboard focus",
);
assert.doesNotMatch(
  baseCss,
  /community-interaction-embed|community-social-embed/,
  "generic and social preview styling should be deleted with their renderers",
);
assert.match(
  read("shared/linkEmbedUi.tsx"),
  /className="chat-link"[\s\S]*target="_blank"[\s\S]*rel="noreferrer noopener"/,
  "auto-linked chat URLs should receive the semantic link class without weakening external-link safety",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-feed-scroll\s*\{[\s\S]*padding:\s*8px\s+12px\s+18px;/,
  "mobile projection feed should use compact pane padding because the mobile shell owns topbar clearance",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-channel-header\s*\{[\s\S]*flex:\s*0 0 var\(--mobile-topbar-clearance\);[\s\S]*min-height:\s*var\(--mobile-topbar-clearance\);[\s\S]*\.community-channel-header-identity\s*\{[\s\S]*clip:\s*rect\(0, 0, 0, 0\);/,
  "mobile chat should reserve one fixed top band while keeping duplicate channel identity visually hidden and accessible",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-interaction-drawer-scroll\s*\{[\s\S]*padding-top:\s*calc\(var\(--mobile-topbar-clearance\)\s*\+\s*62px\);/,
  "mobile projection drawer should reserve the mobile topbar clearance and floating back button",
);

assert.match(
  contract,
  /Current UI Projection Slice[\s\S]*canonical projection is the normal production and staging chat surface[\s\S]*legacy chat timeline is not a production UI routing option[\s\S]*projection subscribes to canonical interaction roots and replies directly[\s\S]*normal web chat UI does not mount legacy preload, realtime, or scroll-pagination lifecycles[\s\S]*canonical interaction read bundles expose public actor user ids[\s\S]*top-level composer sends use the canonical composer bridge[\s\S]*missing canonical writer fails closed[\s\S]*canonical projection does not rely on any legacy chat client lifecycle[\s\S]*stale interaction reads must not overwrite/,
  "interaction contract should document the active UI projection slice",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical chat writer[\s\S]*must not create legacy `communityChatMessages`[\s\S]*bounded, server-issued attachment claim IDs[\s\S]*communityInteractionAttachments/,
  "interaction contract should document the active canonical composer bridge slice",
);
assert.match(
  contract,
  /Current Link Presentation Slice[\s\S]*ordinary links render as authored blue links[\s\S]*generic websites, meeting links, extensionless document links, Descript, Loom, Vimeo, Wistia, and social posts do not create interaction preview cards[\s\S]*YouTube videos and explicit HTTPS PDF links/,
  "interaction contract should require simple authored links and bounded YouTube/PDF media",
);

console.log("community interaction projection UI contract proof passed");
