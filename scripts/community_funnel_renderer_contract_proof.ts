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
const vsl = renderer.indexOf("{media ? (");
const defaultPrimaryAction = renderer.indexOf('props.renderModel.mode === "default"', vsl);
const defaultPrimaryCta = renderer.indexOf(
  '<FunnelAction action={props.action} position="primary" />',
  defaultPrimaryAction,
);
const customPrimaryAction = renderer.indexOf('props.renderModel.mode === "custom"', defaultPrimaryCta);
const customMemberProof = renderer.indexOf("{memberProof}", customPrimaryAction);
const pillars = renderer.indexOf('className="community-funnel-pillars');
const longForm = renderer.indexOf('className="community-funnel-long-form');
const conversion = renderer.indexOf('className="community-funnel-conversion');
const finalCta = renderer.indexOf(
  '<FunnelAction action={props.action} position="final" />',
  conversion,
);
assert.ok(
  identity >= 0 &&
    identity < hero &&
    hero < vsl &&
    vsl < defaultPrimaryAction &&
    defaultPrimaryAction < defaultPrimaryCta &&
    defaultPrimaryCta < customPrimaryAction &&
    customPrimaryAction < customMemberProof &&
    customMemberProof < pillars &&
    pillars < longForm &&
    longForm < conversion &&
    conversion < finalCta,
  "the canonical renderer must keep the simple default action and the custom funnel content in conversion order",
);
assert.doesNotMatch(renderer.slice(defaultPrimaryAction, customPrimaryAction), /\{memberProof\}/,
  "the default landing page must not render member proof");
assert.match(renderer, /props\.renderModel\.mode === "custom" \? \([\s\S]*className="community-funnel-conversion"/,
  "only custom funnels may render a second join action");
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
assert.doesNotMatch(
  `${rendererCss}\n${memberProofCss}`,
  /\.community-funnel-member-(?:faces|face|more|proof-row)\b/,
  "funnel surfaces must not recreate avatar holder or facepile CSS",
);
assert.match(
  renderer,
  /<CommunityAvatar[\s\S]*className="community-funnel-community-avatar"/,
  "the funnel identity must use the canonical community avatar component",
);
assert.doesNotMatch(
  rendererCss.match(/\.community-funnel-community-avatar\s*\{[\s\S]*?\}/)?.[0] ?? "",
  /border|border-radius|background/,
  "the funnel may size the canonical community avatar but must not recreate its holder styling",
);
assert.match(
  renderProjection,
  /mode:\s*"default"[\s\S]*subheadline:\s*null[\s\S]*longFormMarkdown:\s*null[\s\S]*vslUrl:\s*null/,
  "the deterministic landing page must omit long-form copy and media",
);
assert.match(memberProofCss, /\.community-funnel-member-proof-avatars[\s\S]*--member-avatar-stack-face-size/);
assert.match(rendererCss, /--community-funnel-page:\s*var\(--surface-workspace\)[\s\S]*var\(--accent-selection\)[\s\S]*var\(--bg-button\)/);
assert.match(rendererCss, /\.community-funnel-loading\s*\{[^}]*background:\s*var\(--surface-workspace\)/);
assert.match(rendererCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(rendererCss, /container-type: inline-size[\s\S]*font-size: clamp\([^;]*cqi/);
assert.match(
  rendererCss,
  /--community-funnel-rail:\s*980px[\s\S]*community-funnel-hero[\s\S]*var\(--community-funnel-rail\)[\s\S]*community-funnel-vsl[\s\S]*var\(--community-funnel-rail\)[\s\S]*community-funnel-pillars[\s\S]*var\(--community-funnel-rail\)/,
  "hero, VSL, and pillars must share one canonical content rail",
);
assert.doesNotMatch(rendererCss, /#d66a8a|accent-gold|pink/i, "retired Polynet-pink tokens must not leak into the funnel");
assert.match(
  renderProjection,
  /input\.funnel\?\.active_slot !== "default" && published\?\.version === 2/,
  "custom content must require an explicit active custom slot and published V2 snapshot",
);
assert.doesNotMatch(
  publicRoute,
  /isPreviewMode|previewDocument|funnel-preview-presentation/,
  "the join page has no draft preview mode",
);

console.log("community funnel renderer contract proof passed");
