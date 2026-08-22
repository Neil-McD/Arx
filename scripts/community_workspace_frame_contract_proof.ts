import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const baselineGate = read("scripts/foundation_baseline_gate.sh");
const frame = read("apps/web/src/components/WebCommunityWorkspaceFrame.tsx");
const frameStyles = read("apps/web/src/components/WebCommunityWorkspaceFrame.css");
const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");

assert.match(
  packageJson,
  /"check:community-workspace-frame-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_workspace_frame_contract_proof\.ts"/,
  "package scripts must expose the community workspace frame contract",
);
assert.match(
  baselineGate,
  /run_step "Community workspace frame contract" npm run check:community-workspace-frame-contract-proof/,
  "the foundation baseline must exercise the community workspace frame contract",
);

assert.match(
  frame,
  /import "\.\/WebCommunityWorkspaceFrame\.css";/,
  "the frame must own its structural stylesheet",
);
assert.match(
  frame,
  /ariaLabel: string;[\s\S]*children: ReactNode;/,
  "the frame API must stay limited to an accessible label and route-owned content",
);
assert.match(
  frame,
  /<section className="community-workspace-frame" aria-label=\{props\.ariaLabel\}>[\s\S]*className="community-workspace-frame-scroll"/,
  "the frame must expose one semantic surface and one scroll owner",
);
assert.doesNotMatch(
  frame,
  /theme|variant|permission|capabilit|communityTab|destination/,
  "the presentation frame must not absorb theme, route, or authorization ownership",
);

assert.match(
  secondaryPanels,
  /props\.communityTab === "resources"[\s\S]*<WebCommunityWorkspaceFrame ariaLabel="Community resources">[\s\S]*<CommunityResourcesPanel \{\.\.\.props\.resources\} \/>[\s\S]*<WebCommunityResourceModuleModal/,
  "Resources must render inside the canonical frame while modals remain outside it",
);
assert.match(
  secondaryPanels,
  /props\.communityTab === "events"[\s\S]*<WebCommunityWorkspaceFrame ariaLabel="Community events">[\s\S]*<WebCommunityEventsSection \{\.\.\.props\.events\} \/>/,
  "Events must render inside the canonical frame",
);
assert.doesNotMatch(
  secondaryPanels,
  /renderCenteredPane\(<(?:CommunityResourcesPanel|WebCommunityEventsSection)/,
  "Resources and Events must not retain the legacy centered-pane topology",
);
assert.match(
  secondaryPanels,
  /renderCenteredPane\(<WebCommunitySettingsSection[\s\S]*renderWorkspacePane\(<WebCommunityFunnelSection[\s\S]*renderCenteredPane\(<WebCommunityAnalyticsSection/,
  "the bounded slice must leave Settings, Funnel, and Analytics on their existing topology",
);

assert.match(
  frameStyles,
  /\.community-workspace-frame \{[\s\S]*display: flex;[\s\S]*min-width: 0;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;[\s\S]*background: var\(--surface-workspace, var\(--surface-app\)\);/,
  "the frame must own a bounded semantic workspace surface",
);
assert.match(
  frameStyles,
  /\.community-workspace-frame-scroll \{[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/,
  "the frame body must be the sole route-level vertical scroller",
);
assert.match(
  frameStyles,
  /\.app-root:not\(\.mobile-shell\)[\s\S]*\.product-shell-surface--community[\s\S]*\.community-workspace-frame \{[\s\S]*border: 1px solid var\(--community-shell-stroke\);[\s\S]*border-radius: var\(--community-shell-radius\);/,
  "desktop community workspaces must consume the canonical shell frame tokens",
);
assert.match(
  frameStyles,
  /\.app-root\.mobile-shell \.community-workspace-frame-scroll \{[\s\S]*var\(--mobile-topbar-clearance\)[\s\S]*env\(safe-area-inset-bottom, 0px\)/,
  "mobile workspaces must preserve topbar and safe-area clearance",
);
assert.doesNotMatch(
  frameStyles,
  /data-theme|#[0-9a-f]{3,8}\b|rgba?\(/i,
  "the structural frame must not fork by theme or introduce literal colors",
);

console.log("PASS: Resources and Events share one canonical community workspace frame.");
