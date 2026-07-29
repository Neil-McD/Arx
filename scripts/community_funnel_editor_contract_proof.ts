import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const app = read("apps/web/src/App.tsx");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const funnelEditor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const surfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const shellProjection = read("apps/web/src/controllers/buildWebShellProjection.ts");
const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const routeController = read("apps/web/src/controllers/useWebPublicCommunityRouteController.ts");
const funnelAboutController = read("apps/web/src/controllers/useWebCommunityFunnelAboutController.ts");
const governanceController = read("shared/useCommunitySettingsGovernanceController.ts");
const funnelGateway = read("shared/cloudCommunityFunnelGateway.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const saveFunnelAboutSlice = sliceBetween(
  funnelAboutController,
  "const save = useCallback",
  "return {\n    isDirty,",
);

// --- The builder is fields + a Preview button, NOT an inline funnel render ---
assert.doesNotMatch(
  funnelEditor,
  /WebCommunityVisitorSurface|CommunityFunnelSurface/,
  "the funnel builder must not render a funnel surface inline — it is config fields plus a Preview button",
);
assert.match(
  funnelEditor,
  /className="funnel-editor-fields"[\s\S]*Intro video[\s\S]*About/,
  "the builder must present the intro video and About as explicit fields",
);
assert.match(
  funnelEditor,
  /className="public-funnel-media-placeholder funnel-editor-media-dropzone"[\s\S]*openVideoUrlModal/,
  "the intro-video field must open the paste-URL modal",
);
assert.match(
  funnelEditor,
  /onClick=\{handlePreviewCommunityFunnel\}[\s\S]*Preview/,
  "the builder must keep a Preview button that opens the live visitor page",
);

// --- The About field: inline editor internals (unchanged intent) ---
assert.match(
  funnelEditor,
  /funnelAbout: string;[\s\S]*setFunnelAbout: \(value: string\) => void;/,
  "the builder must receive the editable About copy",
);
assert.match(
  funnelEditor,
  /const renderAboutEditor = \(\) => \{[\s\S]*className="public-funnel-about funnel-editor-about-input"[\s\S]*setFunnelAbout\(event\.target\.value\);[\s\S]*markCommunitySettingsDirty\(\);/,
  "About edits must go through the inline About editor and mark canonical settings dirty",
);
assert.match(
  funnelEditor,
  /const syncAboutTextareaHeight = \(\) => \{[\s\S]*textarea\.style\.height = "auto";[\s\S]*textarea\.style\.height = `\$\{textarea\.scrollHeight\}px`;/,
  "About editing must auto-size to content",
);
assert.doesNotMatch(
  sliceBetween(funnelEditor, "const renderAboutEditor", "return ("),
  /\.select\(\)/,
  "About editing must not select all text on open",
);
assert.match(
  funnelEditor,
  /if \(isFunnelAboutDirty\) \{[\s\S]*const savedCopy = await handleSaveCommunityFunnelAbout\(\);[\s\S]*if \(savedCopy === false\) return;[\s\S]*\}[\s\S]*if \(isMediaDirty\) \{[\s\S]*const savedMedia = await handleSaveCommunityFunnel\(\);/,
  "combined save must save About before media and stop if About save fails",
);

// --- ONE render path: /preview renders the live visitor surface, no scaffold ---
assert.match(
  publicFunnel,
  /<WebCommunityVisitorSurface/,
  "the public funnel must render the live visitor surface",
);
assert.doesNotMatch(
  publicFunnel,
  /CommunityFunnelSurface/,
  "the public funnel must not fall back to the deleted scaffold for preview",
);
assert.doesNotMatch(
  surfaceHost,
  /public-route-panel|public-community-funnel-panel/,
  "the preview route must render through the plain community-body, identical to live",
);
assert.ok(
  surfaceHost.indexOf('props.showPublicCommunityFunnel ?') <
    surfaceHost.indexOf('props.activePage === "landing" ?'),
  "a direct /c/:slug route must render the community funnel before the app-page landing fallback",
);
assert.match(
  shellProjection,
  /const isVisitorCommunityRoute =[\s\S]*"community_funnel"[\s\S]*"community_funnel_preview";/,
  "the shell must treat /c/:slug and its /preview as the same visitor route (rail + nav)",
);

// --- Honest analytics: the owner's own preview must not log a funnel visit ---
assert.match(
  funnelActions,
  /if \(opts\?\.recordVisit !== false\) \{[\s\S]*recordCloudPublicFunnelVisit/,
  "loadPublicCommunity must gate the funnel-visit record behind opts.recordVisit",
);
assert.match(
  routeController,
  /loadPublicCommunity\(publicFunnelSlug, \{ recordVisit: !isPublicFunnelPreviewRoute \}\)/,
  "the route load effect must suppress the visit record on the /preview route",
);
assert.doesNotMatch(
  routeController,
  /isPreviewMode:/,
  "the route loader must not invent a second preview-data contract; preview is a presentation lens",
);

// --- Destination-owned About save workflow and App composition wiring ---
assert.match(
  funnelAboutController,
  /const isDirty =[\s\S]*Boolean\(params\.activeCommunity\) &&[\s\S]*params\.about !== \(params\.activeCommunity\?\.about \?\? ""\);/,
  "the Funnel About controller must derive dirtiness from active community truth",
);
assert.match(
  funnelAboutController,
  /const reset = useCallback\(\(\) => \{[\s\S]*params\.setAbout\(params\.activeCommunity\?\.about \?\? ""\);[\s\S]*params\.settingsDirtyRef\.current = hasOtherSettingsDirty\(\);/,
  "the Funnel About controller must reset copy back to active community truth",
);
assert.match(
  funnelAboutController,
  /saveCloudCommunityAbout\(\{[\s\S]*about: params\.about\.trim\(\) \|\| null,/,
  "the Funnel About controller must save inline copy through the narrow gateway",
);
assert.doesNotMatch(
  saveFunnelAboutSlice,
  /oneLiner:/,
  "inline Funnel About save must not write the one-liner",
);
assert.match(
  app,
  /useWebCommunityFunnelAboutController\(\{[\s\S]*about: communitySettingsAbout,[\s\S]*setAbout: setCommunitySettingsAbout,[\s\S]*funnelOneLiner: communitySettingsOneLiner,[\s\S]*funnelAbout: communitySettingsAbout,[\s\S]*isFunnelAboutDirty: isCommunityFunnelAboutDirty,[\s\S]*handleSaveCommunityFunnelAbout,[\s\S]*handleResetCommunityFunnelAbout,/,
  "App must compose the Funnel About controller into the builder's canonical settings state",
);
assert.doesNotMatch(
  governanceController,
  /Promise<boolean>|return false;/,
  "full community settings save must not be repurposed as Funnel About's save result transport",
);
assert.match(
  funnelGateway,
  /saveCloudCommunityAbout<[\s\S]*client\.mutation\("communityLifecycle:saveCommunityAbout"[\s\S]*about: params\.about/,
  "the Funnel gateway must own the narrow About RPC",
);
assert.match(
  communityLifecycle,
  /export const saveCommunityAbout = mutation\(\{[\s\S]*requireCommunityManager[\s\S]*normalizeOptionalText\(args\.about, 8_000\)[\s\S]*ctx\.db\.patch[\s\S]*about,/,
  "the narrow About mutation must remain manager-authorized and bounded",
);

// --- CSS: the inline About resting/editing state keeps native styling ---
const genericSettingsButtonSelector =
  baseCss.match(/\.settings-panel button[^{]+\{/)?.[0] ?? "";
assert.match(
  genericSettingsButtonSelector,
  /:not\(\.funnel-editor-about-trigger\)/,
  "generic settings button styling must not apply to the inline Funnel About resting state",
);
assert.match(
  genericSettingsButtonSelector,
  /:not\(\.platform-save-button\)/,
  "generic settings button styling must not override the canonical settings save action",
);
assert.match(
  baseCss,
  /\.funnel-editor-about-trigger,\s*[\s\S]*\.funnel-editor-about-input \{[\s\S]*background: transparent;/,
  "Funnel About resting and editing states should share native transparent styling",
);

console.log("PASS: the funnel builder is fields + a Preview button, and /preview renders the one live visitor surface.");
