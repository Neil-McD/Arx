import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const publicRoute = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const renderer = read("apps/web/src/components/WebCommunityFunnelRenderer.tsx");
const rendererCss = read("apps/web/src/components/WebCommunityFunnelRenderer.css");
const memberProof = read("apps/web/src/components/CommunityFunnelMemberProof.tsx");
const memberProofCss = read("apps/web/src/components/CommunityFunnelMemberProof.css");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const previewController = read(
  "apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController.ts",
);
const renderProjection = read("shared/communityFunnelUi.ts");

assert.match(
  publicRoute,
  /buildCommunityFunnelRenderModel[\s\S]*<WebCommunityFunnelRenderer/,
  "the public route must have one projection and one renderer",
);
assert.doesNotMatch(
  publicRoute,
  /WebCommunityVisitorSurface|CommunityFunnelTemplate/,
  "the public route must not branch into a legacy or parallel renderer",
);
assert.equal(
  existsSync("apps/web/src/components/WebCommunityVisitorSurface.tsx"),
  false,
  "the frosted-chat visitor surface must stay deleted",
);
assert.equal(
  existsSync("apps/web/src/components/CommunityVisitorChrome.tsx"),
  false,
  "the duplicate visitor chrome must stay deleted",
);
assert.equal(
  existsSync("apps/web/src/controllers/buildWebCommunityVisitorProjection.ts"),
  false,
  "the duplicate chat projection must stay deleted",
);

const identity = renderer.indexOf('className="community-funnel-identity');
const hero = renderer.indexOf('className="community-funnel-hero');
const vsl = renderer.indexOf('className="community-funnel-vsl');
const primaryAction = renderer.indexOf('position="primary"');
const memberProofPlacement = renderer.indexOf("{memberProof}", primaryAction);
const pillars = renderer.indexOf('className="community-funnel-pillars');
const longForm = renderer.indexOf('className="community-funnel-long-form');
const conversion = renderer.indexOf('className="community-funnel-conversion');
assert.ok(
  identity >= 0 &&
    identity < hero &&
    hero < vsl &&
    vsl < primaryAction &&
    primaryAction < memberProofPlacement &&
    memberProofPlacement < pillars &&
    pillars < longForm &&
    longForm < conversion,
  "the canonical renderer must keep identity, hero, VSL, primary action, member proof, pillars, narrative, and final conversion in order",
);
assert.doesNotMatch(
  renderer.slice(conversion),
  /\{memberProof\}/,
  "member proof must stay next to the primary conversion instead of drifting to the bottom",
);
assert.match(renderer, /renderMarkdown\(props\.renderModel\.longFormMarkdown, \{ headingLevelOffset: 1 \}\)/);
assert.doesNotMatch(renderer, /dangerouslySetInnerHTML|communityMessages|CommunityContextPanel/);
assert.match(
  memberProof,
  /buildCommunityFunnelMemberProofView\([\s\S]*<MemberAvatarStack[\s\S]*limit=\{5\}/,
  "public member proof must compose the canonical proof projection and member avatar stack",
);
assert.doesNotMatch(
  memberProof,
  /UserAvatar|\.map\(\(face/,
  "public member proof must not recreate member avatar holders",
);
assert.match(
  editor,
  /<WebCommunityFunnelRenderer[\s\S]*memberFaces=\{hydratedPreviewCommunity\.member_faces_preview[\s\S]*renderModel=\{previewRenderModel\}/,
  "builder preview and public lander must share the same canonical renderer",
);
assert.doesNotMatch(
  editor,
  /CommunityFunnelPreview|MemberAvatarStack|buildCommunityFunnelMemberProofView/,
  "builder preview must not retain or rebuild a parallel renderer",
);
assert.doesNotMatch(
  `${rendererCss}\n${memberProofCss}`,
  /\.community-funnel-member-(?:faces|face|more|proof-row)\b/,
  "funnel surfaces must not recreate avatar holder or facepile CSS",
);
assert.match(memberProofCss, /\.community-funnel-member-proof-avatars[\s\S]*--member-avatar-stack-face-size/);
assert.match(rendererCss, /var\(--surface-app\)[\s\S]*var\(--accent-selection\)[\s\S]*var\(--bg-button\)/);
assert.match(rendererCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(rendererCss, /container-type: inline-size[\s\S]*font-size: clamp\([^;]*cqi/);
assert.match(
  rendererCss,
  /--community-funnel-rail:\s*980px[\s\S]*community-funnel-hero[\s\S]*var\(--community-funnel-rail\)[\s\S]*community-funnel-vsl[\s\S]*var\(--community-funnel-rail\)[\s\S]*community-funnel-pillars[\s\S]*var\(--community-funnel-rail\)/,
  "hero, VSL, and pillars must share one canonical content rail",
);
assert.match(
  previewController,
  /funnel_draft_preview_retry[\s\S]*forceRefresh:\s*true[\s\S]*funnel_draft_preview_query_retry[\s\S]*forceRefresh:\s*true/,
  "the owner preview must retry both initial and query-time session verification once through the canonical auth refresh lock",
);
assert.doesNotMatch(rendererCss, /#d66a8a|accent-gold|pink/i, "retired Polynet-pink tokens must not leak into the funnel");
assert.match(
  renderProjection,
  /input\.funnel\?\.live_mode === "custom" && published\?\.version === 2/,
  "custom content must require an explicit live-mode selection and published V2 snapshot",
);
assert.match(
  publicRoute,
  /isPreviewMode \|\|[\s\S]*isPrimaryActionDisabled/,
  "preview must preserve the real renderer while disabling admission side effects",
);

console.log("community funnel renderer contract proof passed");
