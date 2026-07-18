import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  interactionPresentationForEmbeds,
  selectRichInteractionEmbeds,
} from "../shared/communityInteractionLinkPresentation.ts";

const root = process.cwd();

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
const app = read("apps/web/src/App.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const visitorSurface = read("apps/web/src/components/WebCommunityVisitorSurface.tsx");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const memberSettingsDialog = read("apps/web/src/components/CommunityMemberSettingsDialog.tsx");
const communityNav = read("shared/CommunityNav.tsx");
const communityAccessViewModel = read("shared/communityAccessViewModel.ts");
const chromeShared = read("apps/web/src/components/webShellChromeShared.ts");
const chromeHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const mobileCommunityShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const chromeHostPropsBuilder = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const linkPreview = read("apps/web/src/components/CommunityInteractionLinkPreview.tsx");
const socialLinkPreview = linkPreview.slice(
  linkPreview.indexOf("function SocialPostFallback"),
  linkPreview.indexOf("function GenericLinkPreview"),
);
const directMessages = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const directoryController = read("shared/useCommunityDirectoryController.ts");
const activeCommunityShellController = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
const communityDirectory = read("convex/communityDirectory.ts");
const communityPublic = read("convex/communityPublic.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const sendController = read("shared/useCommunityChatMutationController.ts");
const interactions = read("convex/communityInteractions.ts");
const baseCss = read("apps/web/src/base.css");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const chatBlockMarkdownUi = read("shared/chatBlockMarkdownUi.tsx");
const readyFirstLinkEmbed = {
  embed_kind: "link",
  status: "ready",
  source_url: "https://example.com/first",
  normalized_source_url: "https://example.com/first",
};
const readySecondLinkEmbed = {
  embed_kind: "link",
  status: "ready",
  source_url: "https://example.com/second",
  normalized_source_url: "https://example.com/second",
};
const failedFirstLinkEmbed = {
  ...readyFirstLinkEmbed,
  status: "failed",
};
const pendingFirstLinkEmbed = {
  ...readyFirstLinkEmbed,
  status: "pending",
};
const publicCommunityStatsMapper = sectionBetween(
  communityPublic,
  "function mapPublicCommunityStats",
  "const PUBLIC_FEATURED_MESSAGE_LIMIT",
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
  /renderTextWithLinks,[\s\S]*onScrollToReplyMessage: scrollToCommunityMessage/,
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
  visitorSurface,
  /renderMarkdown/,
  "visitor chat should use the same bounded community renderer without importing workspace markdown",
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
  feed,
  /export function bundleText[\s\S]*hasCanonicalMessageText[\s\S]*block\.block_type === "markdown_text"[\s\S]*hasCanonicalMessageText[\s\S]*block\.block_type !== "link"[\s\S]*:\s*orderedBlocks/,
  "interaction bodies should omit derived link blocks when canonical markdown text already contains the URL while preserving link-only fallback text",
);
assert.match(
  feed,
  /selectRichInteractionEmbeds[\s\S]*export function EmbedCards[\s\S]*const visible = selectRichInteractionEmbeds\(props\.embeds\)[\s\S]*embed\.status === "pending"[\s\S]*embed\.status !== "ready"\) return null;[\s\S]*<CommunityInteractionLinkPreview[^>]*embed=\{embed\}/,
  "interaction embeds should use the shared single-preview policy before rendering pending skeletons or ready cards",
);
assert.doesNotMatch(
  feed,
  /community-interaction-embed is-bare/,
  "interaction embeds should not render failed previews as duplicate bare URL cards",
);
assert.match(
  linkPreview,
  /function approvedHttpsUrl[\s\S]*function approvedVideoUrl[\s\S]*const isLoom[\s\S]*const isYouTube[\s\S]*function VideoPreviewMetadata[\s\S]*community-interaction-embed-video-link[\s\S]*function VideoLinkPreview[\s\S]*const \[active, setActive\] = useState\(false\)[\s\S]*data-preview-kind="video"[\s\S]*<iframe[\s\S]*sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"/,
  "video previews should revalidate source and player hosts and paths, defer the player until an explicit click, and retain an external fallback",
);
assert.match(
  linkPreview,
  /const href = approvedHttpsUrl[\s\S]*const mediaUrl = approvedHttpsUrl/,
  "the browser should fail closed on corrupted legacy source or media URLs",
);
assert.match(
  linkPreview,
  /referrerPolicy="no-referrer"/,
  "preview images should avoid leaking chat referrers to third-party media hosts",
);
assert.match(
  socialLinkPreview,
  /function SocialPostFallback[\s\S]*author_name[\s\S]*<a[\s\S]*href=\{props\.href\}[\s\S]*target="_blank"[\s\S]*community-interaction-embed-social-header[\s\S]*community-interaction-embed-social-body[\s\S]*<\/a>[\s\S]*function SocialPostLinkPreview[\s\S]*data-preview-kind="social_post"[\s\S]*community-interaction-embed-social-native[\s\S]*<SocialPostFallback/,
  "social previews should expose a safe readable fallback until the native X post is ready",
);
assert.doesNotMatch(
  socialLinkPreview,
  /<img|mediaUrl|community-interaction-embed-media/,
  "meaningful-text social fallbacks should omit attached media while media-led generic fallbacks remain available",
);
assert.match(
  linkPreview,
  /const X_WIDGETS_SCRIPT_URL = "https:\/\/platform\.x\.com\/widgets\.js";[\s\S]*function xPostIdFromUrl[\s\S]*\[0-9\]\{1,24\}[\s\S]*function loadXWidgets[\s\S]*existing instanceof HTMLScriptElement/,
  "native X rendering should be lazy, source-bounded, compact, privacy-aware, and fail back to readable content",
);
assert.match(
  socialLinkPreview,
  /IntersectionObserver[\s\S]*const failNative = \(\) => \{[\s\S]*target\.replaceChildren\(\);[\s\S]*setNativeFailed\(true\);[\s\S]*window\.setTimeout\(failNative, X_WIDGETS_RENDER_TIMEOUT_MS\)[\s\S]*createTweet\?\.\(postId, target, \{[\s\S]*cards: "hidden"[\s\S]*conversation: "none"[\s\S]*dnt: true[\s\S]*theme: "dark"[\s\S]*nativeFailed \? "failed"/,
  "X posts should load near the viewport and retain the fallback when the provider fails",
);
assert.doesNotMatch(
  linkPreview,
  /dangerouslySetInnerHTML/,
  "community link previews must not inject raw provider markup",
);
assert.match(
  linkPreview,
  /function GenericLinkPreview[\s\S]*data-preview-kind="link"[\s\S]*target="_blank"[\s\S]*rel="noreferrer noopener"/,
  "unknown providers should retain one safe generic metadata card",
);
assert.match(
  feed,
  /export function InteractionContent[\s\S]*interactionPresentationForEmbeds\(props\.text, props\.embeds\)[\s\S]*presentation\.bodySegments\.map[\s\S]*segment\.type === "embed"[\s\S]*props\.afterBody[\s\S]*presentation\.trailingEmbeds/,
  "interaction content should render authored-order text and embed segments before preserving attachments and trailing previews",
);
assert.match(
  projection,
  /<InteractionContent[\s\S]*embeds=\{selectedRoot\.embeds\}[\s\S]*afterBody=\{\([\s\S]*<InteractionAttachments[\s\S]*<InteractionContent[\s\S]*embeds=\{bundle\.embeds\}[\s\S]*afterBody=\{\([\s\S]*<InteractionAttachments/,
  "thread roots and replies should share authored-order presentation while preserving attachment placement",
);
assert.equal(
  selectRichInteractionEmbeds([readyFirstLinkEmbed, readySecondLinkEmbed]).length,
  1,
  "a message should render at most one rich embed",
);
assert.deepEqual(
  interactionPresentationForEmbeds("Shared https://example.com/first for context", [readyFirstLinkEmbed]),
  {
    bodySegments: [{ type: "text", text: "Shared https://example.com/first for context" }],
    trailingEmbeds: [readyFirstLinkEmbed],
  },
  "links inside meaningful prose should remain visible while their preview keeps its trailing position",
);
assert.deepEqual(
  interactionPresentationForEmbeds("Wild: https://example.com/first", [readyFirstLinkEmbed]),
  {
    bodySegments: [
      { type: "text", text: "Wild:" },
      { type: "embed", embed: readyFirstLinkEmbed },
    ],
    trailingEmbeds: [],
  },
  "a ready preview should replace its matching bare URL at the end of a caption line",
);
assert.deepEqual(
  interactionPresentationForEmbeds(
    "Useful context\nhttps://example.com/first\nhttps://example.com/first",
    [readyFirstLinkEmbed],
  ),
  {
    bodySegments: [
      { type: "text", text: "Useful context" },
      { type: "embed", embed: readyFirstLinkEmbed },
    ],
    trailingEmbeds: [],
  },
  "a ready preview should replace its standalone URL in authored order and collapse consecutive duplicates",
);
assert.deepEqual(
  interactionPresentationForEmbeds(
    "Read online:\nhttps://example.com/first\n\nDownload the PDF: https://example.com/second\n\nSafe to share.",
    [readyFirstLinkEmbed, readySecondLinkEmbed],
  ),
  {
    bodySegments: [
      { type: "text", text: "Read online:" },
      { type: "embed", embed: readyFirstLinkEmbed },
      {
        type: "text",
        text: "Download the PDF: https://example.com/second\n\nSafe to share.",
      },
    ],
    trailingEmbeds: [],
  },
  "a mid-message standalone URL should become an in-flow card without reordering the surrounding copy",
);
assert.deepEqual(
  interactionPresentationForEmbeds(
    "https://example.com/first\nhttps://example.com/first",
    [failedFirstLinkEmbed],
  ),
  {
    bodySegments: [{ type: "text", text: "https://example.com/first" }],
    trailingEmbeds: [],
  },
  "failed previews should preserve one standalone URL fallback",
);
assert.deepEqual(
  interactionPresentationForEmbeds("https://example.com/first", [pendingFirstLinkEmbed]),
  {
    bodySegments: [{ type: "text", text: "https://example.com/first" }],
    trailingEmbeds: [pendingFirstLinkEmbed],
  },
  "pending previews should preserve the source link and existing trailing skeleton placement",
);
assert.deepEqual(
  interactionPresentationForEmbeds("```txt\nhttps://example.com/first\n```", [readyFirstLinkEmbed]),
  {
    bodySegments: [{ type: "text", text: "```txt\nhttps://example.com/first\n```" }],
    trailingEmbeds: [readyFirstLinkEmbed],
  },
  "standalone URLs inside fenced code should remain code instead of becoming in-flow embeds",
);
assert.deepEqual(
  interactionPresentationForEmbeds(
    "https://example.com/first\nhttps://example.com/second",
    [readyFirstLinkEmbed, readySecondLinkEmbed],
  ),
  {
    bodySegments: [
      { type: "embed", embed: readyFirstLinkEmbed },
      { type: "text", text: "https://example.com/second" },
    ],
    trailingEmbeds: [],
  },
  "additional ready links should remain as text when only the first rich preview is shown",
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
  chromeHost,
  /<CommunityNav[\s\S]*onCopyCommunityJoinLink=\{props\.communityShell\.onCopyCommunityJoinLink\}/,
  "desktop community nav should receive the invite copy callback",
);
assert.match(
  mobileCommunityShell,
  /<CommunityNav[\s\S]*onCopyCommunityJoinLink=\{communityShell\.onCopyCommunityJoinLink\}/,
  "mobile community drawer nav should receive the invite copy callback",
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
  /membersViewportRef[\s\S]*loadMoreSentinelRef[\s\S]*IntersectionObserver[\s\S]*observer\.observe\(sentinel\)/,
  "context panel should observe a footer sentinel so visible additional pages load without requiring another scroll event",
);
assert.match(
  contextPanel,
  /requestAnimationFrame\(requestVisibleMemberPage\)/,
  "context panel should re-check after render when the member viewport is already near the bottom",
);
assert.match(
  contextPanel,
  /const membersFooterLabel = props\.membersHasMore[\s\S]*\? "Loading more\.\.\."[\s\S]*: loadedSummary;/,
  "context panel must not show the terminal loaded-summary label while more member pages are available",
);
assert.match(
  contextPanel,
  /const hasUnloadedKnownMembers =[\s\S]*loadedMemberCount < knownMemberCount[\s\S]*Member list out of sync/,
  "context panel should not present a partial loaded member page as terminal when known total is higher",
);
assert.match(
  contextPanel,
  /ref=\{props\.membersHasMore \? loadMoreSentinelRef : undefined\}[\s\S]*\{membersFooterLabel\}/,
  "context panel footer should be the load-more sentinel while additional member pages exist",
);
assert.match(
  directoryController,
  /setCommunityDirectoryMembersHasMore\(Boolean\(page\.continueCursor && !page\.isDone\)\)/,
  "directory controller should only advertise more pages when a continue cursor exists",
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
  /\.community-context-member-action\s*\{[\s\S]*width:\s*26px;[\s\S]*height:\s*26px;[\s\S]*opacity:\s*0;/,
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
  contextPanel,
  /entryPolicy\?: CommunityAdmissionEntryPolicy \| null;[\s\S]*canSetFreeAccessMode\?: boolean;[\s\S]*onSetFreeAccessMode\?: \(mode: "open" \| "approval"\) => Promise<void> \| void;/,
  "context panel should model a manager-only free-access mode control instead of inventing an autojoin data model",
);
assert.match(
  contextPanel,
  /const isFreeAdmissionMode = entryPolicy === "open" \|\| entryPolicy === "approval";[\s\S]*const canShowFreeAccessSwitch = Boolean\([\s\S]*isFreeAdmissionMode[\s\S]*props\.canSetFreeAccessMode[\s\S]*props\.onSetFreeAccessMode/,
  "context panel should hide the Auto-join switch for paid communities and unauthorized viewers",
);
assert.match(
  contextPanel,
  /role="switch"[\s\S]*aria-checked=\{autoJoinEnabled\}[\s\S]*onClick=\{handleToggleFreeAccessMode\}[\s\S]*Auto-join/,
  "context panel should render the free-access mode as an accessible Auto-join switch",
);
assert.match(
  contextPanel,
  /canReviewJoinRequests\?: boolean;[\s\S]*joinReviewMode\?: "paid" \| "free_auto" \| "free_approval" \| null;[\s\S]*pendingJoinRequests\?: CommunityAdmissionJoinRequest\[\] \| null;/,
  "context panel should receive the existing join-review queue projection explicitly",
);
assert.match(
  contextPanel,
  /const canShowJoinRequests = Boolean\([\s\S]*props\.canReviewJoinRequests[\s\S]*props\.joinReviewMode === "free_approval"[\s\S]*pendingJoinRequests\.length > 0/,
  "context panel should only pop the request affordance for free approval queues the viewer can review",
);
assert.match(
  contextPanel,
  /PENDING_JOIN_REQUEST_DISPLAY_LIMIT = 200[\s\S]*hasPendingJoinRequestOverflow[\s\S]*\? "200\+"[\s\S]*aria-label=\{requestChipAriaLabel\}[\s\S]*visiblePendingJoinRequests\.map\(renderJoinRequest\)/,
  "context panel should render a bounded 200+ pending-request projection with an accessible request chip",
);
assert.match(
  adminGateway,
  /approved_pending_request_count\?: number;[\s\S]*pending_request_overflow\?: boolean;[\s\S]*listCommunityJoinRequests[\s\S]*limit: 201,[\s\S]*includeStatuses: \["pending"\]/,
  "admin gateway should fetch one extra pending request so the context rail can honestly show 200+ without an exact count query",
);
assert.match(
  contextPanel,
  /className=\{`community-context-request-chip[\s\S]*aria-expanded=\{joinRequestsExpanded\}[\s\S]*visiblePendingJoinRequests\.map\(renderJoinRequest\)/,
  "context panel should render pending join requests from a compact member-header dropdown",
);
assert.match(
  contextPanel,
  /props\.onApproveJoinRequest\?\.\(request\.id\)[\s\S]*props\.onDenyJoinRequest\?\.\(request\.id\)/,
  "context panel request rows should reuse the existing approve and deny callbacks",
);
assert.match(
  projection,
  /communityEntryPolicy\?: CommunityAdmissionEntryPolicy \| null;[\s\S]*canSetCommunityFreeAccessMode\?: boolean;[\s\S]*communityJoinRequests\?: CommunityAdmissionJoinRequest\[\] \| null;[\s\S]*onApproveCommunityJoinRequest\?: \(requestId: string\) => Promise<void> \| void;/,
  "interaction projection should carry admission controls and join-review callbacks into the context rail",
);
assert.match(
  projection,
  /<CommunityContextPanel[\s\S]*entryPolicy=\{props\.communityEntryPolicy \?\? null\}[\s\S]*onSetFreeAccessMode=\{props\.onSetCommunityFreeAccessMode\}[\s\S]*pendingJoinRequests=\{props\.communityJoinRequests \?\? null\}[\s\S]*onApproveJoinRequest=\{props\.onApproveCommunityJoinRequest\}/,
  "interaction projection should pass admission controls through to CommunityContextPanel",
);
assert.match(
  app,
  /const handleSetCommunityContextFreeAccessMode = useCallback\(async \(mode: "open" \| "approval"\) => \{[\s\S]*setCloudCommunityFreeAccessMode\(\{[\s\S]*mode,[\s\S]*\}\);[\s\S]*entry_policy: result\?\.entry_policy \?\? mode/,
  "App should use the existing free-access-mode mutation and update the local community entry policy",
);
assert.match(
  app,
  /const isStillActiveCommunity = \(\) =>[\s\S]*activeCommunityIdRef\.current[\s\S]*=== communityId;[\s\S]*approved_pending_request_count[\s\S]*setCommunityJoinRequests\(\[\]\)[\s\S]*loadCommunityDirectoryMembers\(communityId, usableSession\)[\s\S]*if \(!isStillActiveCommunity\(\)\) return;/,
  "App should key Auto-join side effects to the community that started the mutation and refresh member counts after backend approvals",
);
assert.match(
  app,
  /canSetCommunityFreeAccessMode:[\s\S]*canManageMembersActiveCommunity &&[\s\S]*\(activeCommunity\?\.entry_policy === "open" \|\| activeCommunity\?\.entry_policy === "approval"\)/,
  "App should expose the Auto-join switch only to managers of free communities",
);
assert.match(
  app,
  /communityContextJoinRequests = useMemo\([\s\S]*\.filter\(\(request\) => String\(request\.status \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "pending"\)[\s\S]*createdAtLabel: formatRelativeTime\(request\.created_at\)/,
  "App should pass only pending request rows into the context rail request dropdown",
);
assert.match(
  app,
  /const shouldHydrateCommunityContextPanel =[\s\S]*activePage === "community" &&[\s\S]*communityTab === "chat";[\s\S]*shouldLoad: shouldHydrateCommunityContextPanel/,
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
  /approveCommunityJoinRequestForFreeAccess[\s\S]*adjustCommunityActiveMemberCountForMembershipTransition[\s\S]*enqueueCommunityAccessGrantedEmailInternal[\s\S]*approveCommunityJoinRequest = mutation\(\{[\s\S]*approveCommunityJoinRequestForFreeAccess\(\{[\s\S]*grantReason: "join_request_approved"/,
  "manual join-request approval should use the shared free-access approval helper so membership, counts, app grants, and emails stay canonical",
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
assert.doesNotMatch(
  read("apps/web/src/components/WebWorkspaceUserDataPanel.tsx"),
  /WorkspaceCommunityOperations|workspace-community-approval|onApproveCommunityJoinRequest/,
  "old workspace operations approvals projection should stay removed once member-header approvals own the queue",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-community-approval-|\.workspace-community-operations/,
  "base CSS should not keep stale workspace approval styles after the queue moves to the member rail",
);
[
  ".community-context-autojoin",
  ".community-context-request-chip",
  ".community-context-request-panel",
  ".community-context-request-row",
].forEach((selector) => {
  assert.ok(baseCss.includes(selector), `base.css should include ${selector}`);
});
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
assert.doesNotMatch(
  surfaceProjection,
  /members:\s*\{/,
  "legacy Members page projection should stay deleted; the right rail owns member context",
);

assert.match(
  directoryGateway,
  /client\.query\("community:listCommunityDirectoryPage" as any/,
  "directory gateway should read chat rail members through the member-facing directory query",
);
assert.match(
  directoryGateway,
  /last_active_at\?: string \| null;/,
  "directory gateway member rows should expose member-gated last active timestamps",
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
assert.match(
  communityDirectory,
  /query\("communityPresence" as any\)[\s\S]*withIndex\("by_community_lastSeenAt"[\s\S]*\.order\("desc"\)[\s\S]*const lastSeenAtByUserId = new Map<string, number>/,
  "directory backend should read community-scoped presence ordered by last seen",
);
assert.match(
  communityDirectory,
  /const orderedCandidates = \[ownerCandidate, \.\.\.memberCandidates\][\s\S]*\.sort\(compareCommunityDirectoryCandidates\);[\s\S]*const selectedCandidates = orderedCandidates\.slice\(offset, offset \+ pageSize\);/,
  "directory backend should order all candidates by activity before pagination",
);
assert.doesNotMatch(
  communityDirectory,
  /includeOwner|memberTake|selectedMemberRows|readCommunityDirectoryLastActiveAt/,
  "directory backend should not page by owner-first membership order before activity sorting",
);
assert.match(
  memberPresenceSummaryQuery,
  /online_last_active_at_by_user_id: stats\.onlineLastActiveAtByUserId/,
  "member-gated presence summary should include fresh online last-active timestamps",
);
assert.match(
  activeCommunityShellController,
  /type ScopedPresenceSummary = \{[\s\S]*communityId: string;[\s\S]*summary: PresenceSummary \| null;[\s\S]*useState<ScopedPresenceSummary \| null>[\s\S]*activeCommunityIdRef\.current === communityId[\s\S]*setActiveCommunityPresenceSummaryState\(\{[\s\S]*communityId,[\s\S]*summary: summary \?\? null,[\s\S]*activeCommunityPresenceSummaryState\?\.communityId !== communityId\) return null;/,
  "active community shell controller should scope presence summaries to the active community",
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
assert.match(
  contextPanel,
  /last_active_at\?: string \| null;[\s\S]*onlineLastActiveAtByUserId\?: Record<string, string> \| null;/,
  "context panel member types should include directory and presence-summary last-active fields",
);
assert.match(
  contextPanel,
  /formatMemberActivityLabel[\s\S]*Active now[\s\S]*Active \$\{relative\}/,
  "context panel should format online and relative member activity labels",
);
assert.match(
  contextPanel,
  /observedActivity\.scopeKey === activityScopeKey[\s\S]*setObservedActivity\(\{ scopeKey: activityScopeKey, byUserId: \{\} \}\)[\s\S]*props\.onlineLastActiveAtByUserId[\s\S]*latestObservedLastActiveAt \?\? member\.last_active_at[\s\S]*community-context-member-activity/,
  "context panel should render last-active status as a member-row hover label",
);
assert.match(
  projection,
  /online_last_active_at_by_user_id\?: Record<string, string> \| null;[\s\S]*onlineLastActiveAtByUserId=\{props\.presenceSummary\?\.online_last_active_at_by_user_id \?\? null\}/,
  "interaction projection should pass fresh member-gated presence timestamps into the context panel",
);
assert.match(
  baseCss,
  /\.community-context-member:hover \.community-context-member-activity,[\s\S]*\.community-context-member:focus-within \.community-context-member-activity/,
  "member activity labels should reveal on hover and keyboard focus",
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
  /onReply=\{replyMentionCandidate && props\.onStartRootReply[\s\S]*id: reply\.legacy_message_id \?\? reply\.id[\s\S]*mention_candidate: replyMentionCandidate[\s\S]*interaction_root_id: reply\.root_id[\s\S]*legacy_message_id: reply\.legacy_message_id \?\? null/,
  "canonical drawer reply action should carry mention identity, canonical root id, and optional legacy metadata",
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
assert.doesNotMatch(
  app,
  /workspaceRecentSignalFeed|<CommunityInteractionFeedList[\s\S]*density="compact"/,
  "workspace panel should not keep a compact community feed projection after the right rail owns community context",
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
  /\.community-interaction-body\.community-interaction-chat-markdown\s*\{[\s\S]*display:\s*block;[\s\S]*\.community-interaction-chat-markdown \.chat-md-heading-1\s*\{[\s\S]*font-size:\s*1\.08em;[\s\S]*\.community-interaction-chat-markdown \.chat-md-list\s*\{[\s\S]*padding-left:\s*1\.36em;[\s\S]*\.community-interaction-chat-markdown \.chat-md-code-block\s*\{/,
  "projection markdown should style bounded headings, lists, and code with compact chat typography",
);
assert.match(
  baseCss,
  /--chat-link:\s*var\(--accent-cyan\);[\s\S]*--chat-link-hover:[\s\S]*\.chat-link:visited\s*\{[\s\S]*color:\s*var\(--chat-link\);[\s\S]*\.chat-link:focus-visible\s*\{/,
  "both dark-family themes should inherit one accessible semantic treatment for chat links",
);
assert.match(
  baseCss,
  /\.community-interaction-embeds\s*\{[\s\S]*--community-interaction-embed-max-width:\s*420px;[\s\S]*--community-interaction-embed-row-height:\s*104px;[\s\S]*\.community-interaction-embed\s*\{[\s\S]*height:\s*max-content;[\s\S]*max-width:\s*var\(--community-interaction-embed-max-width\);[\s\S]*background:\s*var\(--surface-card\);[\s\S]*\.community-interaction-embed:focus-visible[\s\S]*\.community-interaction-embed-provider\s*\{[\s\S]*color:\s*var\(--text-ink-secondary\);[\s\S]*\.community-interaction-embed-desc\s*\{[\s\S]*-webkit-line-clamp:\s*1;/,
  "embed rows should own their readable intrinsic height, inherit theme surfaces, and keep metadata clear",
);
assert.match(
  baseCss,
  /\.community-interaction-embed-play:focus-visible[\s\S]*\.community-interaction-embed-video-link:focus-visible[\s\S]*\.community-interaction-embed-summary[\s\S]*grid-template-columns:[\s\S]*\.community-interaction-embed-player[\s\S]*aspect-ratio:\s*16\s*\/\s*9;[\s\S]*\.community-interaction-embed\.is-social-post[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*grid-template-rows:\s*auto 1fr;[\s\S]*\.community-interaction-embed-social-header[\s\S]*border-bottom:\s*1px solid var\(--stroke-default\);[\s\S]*\.community-interaction-embed-social-body[\s\S]*-webkit-line-clamp:\s*5;/,
  "video previews should retain horizontal play rows while social previews use stacked text cards with primary navigation",
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
assert.match(
  contract,
  /Current Async Link Embed Enrichment Slice[\s\S]*link blocks as derived preview metadata[\s\S]*must not append the URL a second time[\s\S]*failed preview embeds render no fallback card/,
  "interaction contract should prohibit duplicate link text and failed-preview fallback cards",
);

console.log("community interaction projection UI contract proof passed");
