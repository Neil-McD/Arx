import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const publicRoute = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const renderer = read("apps/web/src/components/WebCommunityFunnelRenderer.tsx");
const rendererCss = read("apps/web/src/components/WebCommunityFunnelRenderer.css");
const memberProof = read("apps/web/src/components/CommunityFunnelMemberProof.tsx");
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
assert.match(memberProof, /<UserAvatar[\s\S]*focusX=\{face\.avatar_focus_x\}[\s\S]*zoom=\{face\.avatar_zoom\}/);
assert.match(memberProof, /const MAX_VISIBLE_MEMBER_FACES = 5[\s\S]*slice\(0, MAX_VISIBLE_MEMBER_FACES\)/, "public member faces must remain bounded");
assert.match(rendererCss, /var\(--surface-app\)[\s\S]*var\(--accent-selection\)[\s\S]*var\(--bg-button\)/);
assert.match(rendererCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(rendererCss, /container-type: inline-size[\s\S]*font-size: clamp\([^;]*cqi/);
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
