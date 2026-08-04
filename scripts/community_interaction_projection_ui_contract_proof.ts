import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const interactionController = read(
  "apps/web/src/controllers/useWebCommunityInteractionProjection.ts",
);
const profileHydrationController = read(
  "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
);
const chatController = read(
  "apps/web/src/controllers/useWebCommunityChatController.ts",
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
  linkPreview.indexOf("function SocialPostLinkPreview"),
  linkPreview.indexOf("function GenericLinkPreview"),
);
const directMessages = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const directoryController = read("shared/useCommunityDirectoryController.ts");
const activeCommunityShellController = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
const communityDirectory = read("convex/communityDirectory.ts");
const communityDirectoryPageQuery = communityDirectory.slice(
  communityDirectory.indexOf("export const listCommunityDirectoryPage"),
);
const communityPublic = read("convex/communityPublic.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const interactions = read("convex/communityInteractions.ts");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const contextFaceCss = sectionBetween(
  baseCss,
  ".community-context-face {",
  ".community-context-face-more",
);
const contextMemberAvatarMediaCss = sectionBetween(
  baseCss,
  ".community-context-member-avatar-media {",
  ".community-context-member-dot",
);
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
  /const href = approvedHttpsUrl[\s\S]*const videoUrl = props\.embed\.video_url \? approvedVideoUrl[\s\S]*props\.embed\.preview_kind === "video"[\s\S]*const thumbnailUrl = approvedHttpsUrl\(props\.embed\.image_url\)/,
  "the browser should validate thumbnail URLs only inside the approved video path",
);
assert.match(
  linkPreview,
  /referrerPolicy="no-referrer"/,
  "preview images should avoid leaking chat referrers to third-party media hosts",
);
assert.match(
  socialLinkPreview,
  /function SocialPostLinkPreview[\s\S]*author_name[\s\S]*author_handle[\s\S]*author_avatar_url[\s\S]*<a[\s\S]*data-preview-kind="social_post"[\s\S]*href=\{props\.href\}[\s\S]*target="_blank"[\s\S]*community-interaction-embed-social-avatar[\s\S]*community-interaction-embed-social-identity[\s\S]*published_at[\s\S]*community-interaction-embed-social-body[\s\S]*<\/a>/,
  "social previews should render one compact theme-aware X-style provenance-and-text link with a same-origin avatar",
);
assert.match(
  linkPreview,
  /function approvedXAvatarUrl[\s\S]*pbs\.twimg\.com[\s\S]*\/api\/x-avatar\?url=/,
  "X avatars should reach the browser only through the bounded same-origin proxy",
);
assert.doesNotMatch(
  socialLinkPreview,
  /community-interaction-embed-media|community-interaction-embed-social-mark|iframe|replies|Copy link|favorite_count|conversation_count|BadgeCheck/,
  "meaningful-text social previews should omit attached media, provider marks, and action chrome",
);
assert.doesNotMatch(
  linkPreview,
  /dangerouslySetInnerHTML|platform\.x\.com\/widgets\.js|createTweet/,
  "community X previews must not inject raw provider markup or load the oversized widget",
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
  /const isUnavailable =[\s\S]*lifecycle_status === "archiving"[\s\S]*lifecycle_status === "archived";[\s\S]*const canEnterCommunity = access\s*\? !isUnavailable && Boolean\(access\.can_enter_community \?\? access\.can_view\)\s*: false;[\s\S]*canViewMembers: canEnterCommunity,/,
  "member-facing community nav visibility should derive from lifecycle-aware community entry access, not admin authority",
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
  administrationState,
  /const directory = useCommunityDirectoryController<AuthSession>/,
  "community administration state should own the member-facing directory controller",
);
assert.match(
  directoryController,
  /loadCommunityDirectoryMembers[\s\S]*loadMoreCommunityDirectoryMembers/,
  "the canonical directory controller must expose initial and paginated reads",
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
  projection,
  /COMMUNITY_CONTEXT_PROJECTION_KEYS[\s\S]*StableCommunityInteractionContextPanelSurface = memo[\s\S]*pickCommunityContextProjection\(props\)/,
  "right-panel rendering should be isolated from feed-only prop churn",
);
assert.match(
  communityNav,
  /export const CommunityNav = memo\(function CommunityNav/,
  "left navigation should not rerender for unrelated shell content updates",
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
  /canSetCommunityFreeAccessMode:[\s\S]*canManageMembersActiveCommunity &&[\s\S]*\(activeCommunity\?\.entry_policy === "open" \|\| activeCommunity\?\.entry_policy === "approval"\)/,
  "App should expose the Auto-join switch only to managers of free communities",
);
assert.match(
  app,
  /communityContextJoinRequests = useMemo\([\s\S]*\.filter\(\(request\) =>[\s\S]*request\.community_id === activeCommunityId &&[\s\S]*String\(request\.status \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "pending"[\s\S]*createdAtLabel: formatRelativeTime\(request\.created_at\)/,
  "App should pass only active-community pending request rows into the context rail request dropdown",
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
  existsSync(join(root, "apps/web/src/components/WebWorkspaceUserDataPanel.tsx")),
  false,
  "the retired Workspace data panel must remain absent once member-header approvals own the queue",
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
  /listCloudCommunityDirectoryPage[\s\S]*setCommunityDirectoryMemberCount[\s\S]*setCommunityDirectoryMembersHasMore/,
  "directory controller should drive count and pagination state from directory pages",
);
assert.match(
  communityDirectory,
  /resolveCommunityDirectoryContext[\s\S]*requireCommunityChatAccess[\s\S]*export const listCommunityDirectoryPage = query/,
  "directory backend should be gated by community chat access",
);
assert.match(
  communityDirectoryPageQuery,
  /by_community_lastSeenAt[\s\S]*\.order\("desc"\)[\s\S]*\.paginate\(\{[\s\S]*cursor: args\.cursor \?\? null[\s\S]*maximumRowsRead:/,
  "directory pages should use the activity ledger and an opaque bounded cursor",
);
assert.match(
  communityDirectoryPageQuery,
  /resolveCommunityPresenceAuthorization[\s\S]*authorization\.authorized[\s\S]*communityMembershipRowIsActive[\s\S]*page: memberRows/,
  "directory pages should reauthorize activity rows and filter inactive memberships",
);
assert.match(
  communityDirectoryPageQuery,
  /totalCount: readCommunityActiveMemberCount\(community\)[\s\S]*continueCursor: rawPage\.isDone \? null : rawPage\.continueCursor/,
  "directory pages should consume the durable member count and preserve Convex cursor semantics",
);
assert.match(
  communityDirectory,
  /last_active_at: toIsoString\(args\.lastSeenAt\)/,
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
assert.match(
  contextPanel,
  /formatMemberActivityLabel[\s\S]*Active now[\s\S]*Active \$\{relative\}/,
  "context panel should format online and relative member activity labels",
);
assert.match(
  `${communityTypes}\n${contextPanel}`,
  /last_active_at: string;[\s\S]*formatMemberActivityLabel\([\s\S]*member\.last_active_at,[\s\S]*community-context-member-activity/,
  "context panel should render activity directly from directory rows",
);
assert.doesNotMatch(
  projection,
  /online_last_active_at_by_user_id|onlineLastActiveAtByUserId|activityScopeKey/,
  "interaction projection should not carry the retired live-only activity map",
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
assert.match(
  interactionController,
  /function appendPendingRoots[\s\S]*new Set\(roots\.map\(\(bundle\) => bundle\.root\.idempotency_key\)\)[\s\S]*storedIdempotencyKey\(item\.idempotencyKey, "root"\)/,
  "pending root overlays should dedupe against visible canonical roots by stored idempotency key",
);
assert.match(
  interactionController,
  /function appendPendingReplies[\s\S]*new Set\(replies\.map\(\(bundle\) => bundle\.reply\.idempotency_key\)\)[\s\S]*storedIdempotencyKey\(item\.idempotencyKey, "reply"\)/,
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
  /communityInteractionRootHasRichContent[\s\S]*attachments\.length > 0[\s\S]*embed\.status === "ready"[\s\S]*hasRichContent=\{communityInteractionRootHasRichContent/,
  "rich pinned roots should preserve real attachment and preview visibility without clamping text-only pins",
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
  /\.community-interaction-embed-summary[\s\S]*grid-template-columns:[\s\S]*\.community-interaction-embed-play:focus-visible[\s\S]*\.community-interaction-embed-video-link:focus-visible[\s\S]*\.community-interaction-embed-player[\s\S]*aspect-ratio:\s*16\s*\/\s*9;[\s\S]*\.community-interaction-embed\.is-social-post[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*background:\s*var\(--community-social-embed-surface\);[\s\S]*\.community-interaction-embed-social-identity[\s\S]*unicode-bidi:\s*plaintext;[\s\S]*\.community-interaction-embed-social-meta[\s\S]*\.community-interaction-embed-social-body[\s\S]*-webkit-line-clamp:\s*5;/,
  "video previews should retain horizontal play rows while social previews use compact theme-aware provenance-and-text cards",
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
  /\.app-root\.mobile-shell\s+\.community-chat\s+\.community-channel-header\s*\{[\s\S]*min-height:\s*calc\(var\(--mobile-topbar-clearance\)\s*\+\s*44px\);/,
  "mobile active-channel identity should render below the fixed mobile topbar",
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
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical chat writer[\s\S]*must not create legacy `communityChatMessages`[\s\S]*bounded, already-prepared attachment metadata[\s\S]*communityInteractionAttachments/,
  "interaction contract should document the active canonical composer bridge slice",
);
assert.match(
  contract,
  /Current Async Link Embed Enrichment Slice[\s\S]*link blocks as derived preview metadata[\s\S]*must not append the URL a second time[\s\S]*failed preview embeds render no fallback card/,
  "interaction contract should prohibit duplicate link text and failed-preview fallback cards",
);

console.log("community interaction projection UI contract proof passed");
