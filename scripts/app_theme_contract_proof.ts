import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  APP_THEME_DEFINITIONS,
  APP_THEME_OPTIONS,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  LEGACY_APP_THEME_STORAGE_KEY,
  applyAppThemeAttributes,
  getAppThemeDefinition,
  parseAppTheme,
  type AppTheme,
} from "../shared/theme.ts";
import { applyDesignAttribute, isDesignV1Enabled } from "../apps/web/designSystemFlag.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.ok(channels && channels.length === 3, `expected six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendHex(foreground: string, background: string, alpha: number): string {
  const foregroundChannels = foreground
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  const backgroundChannels = background
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  assert.ok(foregroundChannels && foregroundChannels.length === 3);
  assert.ok(backgroundChannels && backgroundChannels.length === 3);
  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const expectedThemeIds: AppTheme[] = ["dark", "light"];
assert.deepEqual(
  APP_THEME_DEFINITIONS.map((definition) => definition.id),
  expectedThemeIds,
  "the canonical theme registry should expose exactly Dark and Light",
);
assert.equal(APP_THEME_OPTIONS, APP_THEME_DEFINITIONS);
assert.deepEqual(
  getAppThemeDefinition("light"),
  {
    id: "light",
    label: "Light",
    description: "Black and white",
    disabled: false,
    browserColor: "#FFFFFF",
  },
);
assert.equal(DEFAULT_APP_THEME, "dark");
assert.equal(APP_THEME_STORAGE_KEY, "polynet-theme");
assert.equal(LEGACY_APP_THEME_STORAGE_KEY, "arx-theme");

for (const theme of expectedThemeIds) {
  assert.equal(parseAppTheme(theme), theme);
  assert.equal(parseAppTheme(` ${theme} `), theme);
}
assert.equal(parseAppTheme("cris"), "light");
assert.equal(parseAppTheme(" cris "), "light");
for (const invalidTheme of [
  null,
  undefined,
  "",
  "CRIS",
  "Light",
  "polynet",
  "system",
  "unknown",
  "__proto__",
  "constructor",
]) {
  assert.equal(parseAppTheme(invalidTheme), null);
}

const indexHtml = read("apps/web/index.html");
const bootstrapMatch = indexHtml.match(
  /<script data-theme-bootstrap>([\s\S]*?)<\/script>/,
);
assert.ok(bootstrapMatch, "index.html should contain the synchronous theme bootstrap");
const bootstrapSource = bootstrapMatch[1];
const themeMetaIndex = indexHtml.indexOf('<meta name="theme-color"');
const bootstrapIndex = indexHtml.indexOf("<script data-theme-bootstrap>");
const firstStylesheetIndex = indexHtml.indexOf("<link ", bootstrapIndex);
const moduleIndex = indexHtml.indexOf('<script type="module"');
assert.ok(themeMetaIndex >= 0 && themeMetaIndex < bootstrapIndex);
assert.ok(
  firstStylesheetIndex > bootstrapIndex,
  "the theme bootstrap should execute before linked styles can paint",
);
assert.ok(moduleIndex > bootstrapIndex, "the theme bootstrap should execute before the app module");

function runThemeBootstrap(params: {
  primary?: string | null;
  legacy?: string | null;
  storageThrows?: boolean;
}) {
  const rootAttributes = new Map<string, string>();
  let browserColor = "";
  const storageReads: string[] = [];
  const values: Record<string, string | null> = {
    [APP_THEME_STORAGE_KEY]: params.primary ?? null,
    [LEGACY_APP_THEME_STORAGE_KEY]: params.legacy ?? null,
  };
  runInNewContext(bootstrapSource, {
    localStorage: {
      getItem(key: string) {
        storageReads.push(key);
        if (params.storageThrows) throw new Error("storage unavailable");
        return values[key] ?? null;
      },
    },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          rootAttributes.set(name, value);
        },
      },
      querySelector(selector: string) {
        assert.equal(selector, 'meta[name="theme-color"]');
        return {
          setAttribute(name: string, value: string) {
            assert.equal(name, "content");
            browserColor = value;
          },
        };
      },
    },
  });
  return { rootAttributes, browserColor, storageReads };
}

for (const definition of APP_THEME_DEFINITIONS) {
  const result = runThemeBootstrap({ primary: ` ${definition.id} ` });
  assert.equal(result.rootAttributes.get("data-theme"), definition.id);
  assert.equal(result.rootAttributes.has("data-theme-family"), false);
  assert.equal(result.browserColor, definition.browserColor);
  assert.deepEqual(result.storageReads, [APP_THEME_STORAGE_KEY]);
}

const primaryAliasBootstrap = runThemeBootstrap({ primary: "cris" });
assert.equal(primaryAliasBootstrap.rootAttributes.get("data-theme"), "light");
assert.equal(primaryAliasBootstrap.rootAttributes.has("data-theme-family"), false);
assert.equal(primaryAliasBootstrap.browserColor, "#FFFFFF");
assert.deepEqual(primaryAliasBootstrap.storageReads, [APP_THEME_STORAGE_KEY]);

const legacyBootstrap = runThemeBootstrap({ legacy: "cris" });
assert.equal(legacyBootstrap.rootAttributes.get("data-theme"), "light");
assert.equal(legacyBootstrap.rootAttributes.has("data-theme-family"), false);
assert.equal(legacyBootstrap.browserColor, "#FFFFFF");
assert.deepEqual(legacyBootstrap.storageReads, [
  APP_THEME_STORAGE_KEY,
  LEGACY_APP_THEME_STORAGE_KEY,
]);

for (const params of [
  { primary: "unknown" },
  { primary: "__proto__" },
  { primary: "polynet", legacy: "cris" },
  { storageThrows: true },
]) {
  const result = runThemeBootstrap(params);
  const fallbackDefinition = getAppThemeDefinition(DEFAULT_APP_THEME);
  assert.equal(result.rootAttributes.get("data-theme"), DEFAULT_APP_THEME);
  assert.equal(result.rootAttributes.has("data-theme-family"), false);
  assert.equal(result.browserColor, fallbackDefinition.browserColor);
}

const attributes = new Map<string, string>();
let browserThemeColor = "";
const root = {
  ownerDocument: {
    querySelector(selector: string) {
      assert.equal(selector, 'meta[name="theme-color"]');
      return {
        setAttribute(name: string, value: string) {
          assert.equal(name, "content");
          browserThemeColor = value;
        },
      };
    },
  },
  setAttribute(name: string, value: string) {
    attributes.set(name, value);
  },
} as unknown as HTMLElement;

applyAppThemeAttributes("light", root);
assert.equal(attributes.get("data-theme"), "light");
assert.equal(attributes.has("data-theme-family"), false);
assert.equal(browserThemeColor, "#FFFFFF");

applyAppThemeAttributes("dark", root);
assert.equal(attributes.get("data-theme"), "dark");
assert.equal(attributes.has("data-theme-family"), false);
assert.equal(browserThemeColor, "#08090A");

const baseThemeCss = read("apps/web/src/base.css");
const baseCss = [
  baseThemeCss,
  read("apps/web/src/index.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");
const appearance = read("apps/web/src/components/WebAppearanceSettingsSection.tsx");
const main = read("apps/web/src/main.tsx");
const app = read("apps/web/src/App.tsx");
const shellState = read("apps/web/src/controllers/useWebShellState.ts");
const persistenceLifecycle = read(
  "apps/web/src/controllers/useWebUiPersistenceLifecycle.ts",
);
const publicBuilderLandingCss = read(
  "apps/web/src/components/polynetLanding/ConversionLanding.css",
);
const communityAgentCss = read("apps/web/src/components/WebCommunityAgentDock.css");
const communityAgentComponent = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const communityChat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const directMessages = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const directMessagesChrome = read(
  "apps/web/src/controllers/useWebDirectMessagesChromeController.tsx",
);
const communityNav = read("shared/CommunityNav.tsx");
const voiceInputButton = read("shared/VoiceInputButton.tsx");
const mvpGuards = read(".github/workflows/mvp-guards.yml");
const releaseGate = read("scripts/release_gate.mjs");
const manifest = read("apps/web/public/manifest.webmanifest");

const darkRootBlock = baseThemeCss.match(/^:root\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(darkRootBlock, "base.css should define canonical Dark tokens at root");
[
  "--bg-app: #08090a;",
  "--bg-workspace: rgba(11, 12, 13, 0.96);",
  "--bg-panel: rgba(15, 16, 17, 0.92);",
  "--bg-card: rgba(28, 29, 32, 0.94);",
  "--bg-card-hover: rgba(36, 37, 40, 0.96);",
  "--accent-gold: #f7f8f8;",
  "--accent-agent: #f7f8f8;",
  "--text-primary: #f7f8f8;",
  "--text-secondary: #d0d3d9;",
  "--text-muted: #9a9fa8;",
  "--text-faint: #82878f;",
  "--border-default: #232427;",
  "--border-strong: #313236;",
  "--border-muted: #1a1b1e;",
].forEach((token) => {
  assert.ok(darkRootBlock.includes(token), `Dark root should define ${token}`);
});

const publicBuilderLandingThemeBlock = publicBuilderLandingCss.match(
  /\.pn-landing\s*\{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(
  publicBuilderLandingThemeBlock,
  "the public front door should own one dark-locked theme adapter",
);
[
  "--bg: #08090a;",
  "--surface: #0f1011;",
  "--surface-raised: #161719;",
  "--line-default: #232427;",
  "--line-strong: #313236;",
  "--text: #f7f8f8;",
  "--muted: #9a9fa8;",
  "--quiet: #82878f;",
  "--action: #f7f8f8;",
  "--action-text: #08090a;",
].forEach((token) => {
  assert.ok(
    publicBuilderLandingThemeBlock.includes(token),
    `the public front door should map the black-and-white role ${token}`,
  );
});
assert.doesNotMatch(
  publicBuilderLandingCss,
  /--pink|--brand|--attention|#ff3d7f|#d66a8a|#7baad6|#a78bfa|#8b5cf6|#c4b5fd/i,
  "the public front door should carry no accent colour",
);
assert.doesNotMatch(
  publicBuilderLandingCss,
  /:root\[data-theme="light"\][^{]*\.pn-landing/,
  "the public front door should remain dark-locked regardless of a saved app theme",
);
assert.match(
  publicBuilderLandingCss,
  /\.pn-landing \.cta\s*\{[\s\S]*?background:\s*var\(--action\);[\s\S]*?color:\s*var\(--action-text\);/,
  "the public front door CTA should use the white action treatment",
);

const lightThemeBlock = baseThemeCss.match(
  /:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(lightThemeBlock, "base.css should define one canonical Light theme block");
assert.equal(
  baseThemeCss.match(/:root\[data-theme="light"\]/g)?.length,
  1,
  "Light identity tokens should have exactly one theme-id-scoped owner",
);

[
  "--bg-app: #F1F1F3;",
  "--bg-workspace: #F7F7F8;",
  "--bg-panel: #F7F7F8;",
  "--surface-rail: #F1F1F3;",
  "--community-rail-control-bg: var(--surface-nav);",
  "--surface-nav: #F7F7F8;",
  "--bg-card: #FFFFFF;",
  "--bg-card-hover: #F1F1F3;",
  "--surface-selected: rgba(11, 11, 12, 0.05);",
  "--text-primary: #0B0B0C;",
  "--text-secondary: #3C3F45;",
  "--text-muted: #5F636B;",
  "--text-faint: #686C73;",
  "--border-strong: rgba(11, 11, 12, 0.18);",
  "--border-default: rgba(11, 11, 12, 0.09);",
  "--divider-accent: rgba(11, 11, 12, 0.08);",
  "--stroke-panel-edge: rgba(11, 11, 12, 0.1);",
  "--accent-brand: #0B0B0C;",
  "--accent-selection: #0B0B0C;",
  "--accent-agent: #0B0B0C;",
  "--accent-attention: #0B0B0C;",
  "--text-on-attention: #FFFFFF;",
  "--accent-global-attention: #B42318;",
  "--text-on-global-attention: #FFFFFF;",
  "--text-link: #0B0B0C;",
  "--stroke-selected: transparent;",
  "--text-selected: #0B0B0C;",
].forEach((token) => {
  assert.ok(lightThemeBlock.includes(token), `Light should define ${token}`);
});
assert.match(
  baseCss,
  /\.community-rail-button\s*\{[\s\S]*?background:\s*var\(--community-rail-control-bg\);/,
  "community rail utility controls should consume the theme-specific rail control surface",
);
// Black and white: routine selection is a tint of ink on the surface, while
// attention is solid ink, so the two stay distinct without a hue.
const lightSelection = lightThemeBlock.match(/--surface-selected:\s*([^;]+);/)?.[1]?.trim();
const lightAttention = lightThemeBlock.match(/--accent-attention:\s*([^;]+);/)?.[1]?.trim();
assert.ok(lightSelection && lightAttention, "Light should expose selection and attention roles");
assert.notEqual(
  lightSelection,
  lightAttention,
  "Light routine selection and community-local attention must stay visually distinct",
);
for (const removedLavender of ["#EBE9FB", "#DCD8F7"]) {
  assert.ok(
    !lightThemeBlock.includes(removedLavender),
    `Light structural surfaces should not retain legacy lavender ${removedLavender}`,
  );
}
assert.match(lightThemeBlock, /color-scheme:\s*light;/);
assert.match(
  baseCss,
  /\.community-interaction-day::before,[\s\S]*?\.community-interaction-day::after\s*\{[\s\S]*?background:\s*var\(--stroke-divider-accent\);/,
  "live community-feed day separators should consume the semantic structural-divider role",
);
[
  /--community-shell-stroke:\s*var\(--stroke-panel-edge\);/,
  /\.community-rail-divider\s*\{[^}]*background:\s*var\(--stroke-divider-accent\);[^}]*\}/,
  /\.community-nav-divider\s*\{[^}]*background:\s*var\(--stroke-divider-accent\);[^}]*\}/,
  /\.community-context-panel\s*\{[^}]*border-left:\s*1px solid var\(--stroke-panel-edge\);[^}]*\}/,
  /\.community-channel-header\s*\{[^}]*border-bottom:\s*1px solid var\(--stroke-divider-accent\);[^}]*\}/,
  /\.community-interaction-drawer\s*\{[^}]*border-left:\s*1px solid var\(--stroke-panel-edge\);[^}]*\}/,
].forEach((structuralDividerSelector) => {
  assert.match(
    baseCss,
    structuralDividerSelector,
    "shell edges and internal separators should consume their explicit semantic stroke roles",
  );
});
assert.match(
  baseCss,
  /\.community-nav\s*\{[^}]*border-left:\s*1px solid var\(--stroke-panel-edge\);[^}]*border-right:\s*1px solid var\(--stroke-panel-edge\);[^}]*\}/,
  "community navigation panel edges should use the dedicated structural edge role",
);
assert.match(
  communityNav,
  /community-nav-utility-loading[\s\S]*?\{!isLoadingAccess \? \([\s\S]*?title="Agent"[\s\S]*?title="Knowledge"[\s\S]*?title="Events"/,
  "community navigation keeps Members after Events within the access-gated utility group",
);
assert.doesNotMatch(
  baseCss,
  /\.community-nav-divider\s*\{[^}]*opacity:/,
  "the canonical navigation divider should not receive a second opacity reduction",
);
assert.match(
  baseCss,
  /--accent-attention:\s*#f7f8f8;[\s\S]*?--text-on-attention:\s*#08090a;[\s\S]*?--accent-global-attention:\s*#EF4444;[\s\S]*?--text-on-global-attention:\s*#171719;/,
  "community and global attention should have independent readable semantic roles",
);
[
  /\.community-interaction-reply-pill\s*\{[\s\S]*?color:\s*var\(--accent-attention\);/,
  /\.community-interaction-unread-divider::before\s*\{[\s\S]*?var\(--accent-attention\)/,
  /\.community-interaction-unread-dot\s*\{[\s\S]*?background:\s*var\(--accent-attention\);/,
  /\.community-interaction-message\.is-self-mentioned,[\s\S]*?\.community-interaction-reply\.is-self-mentioned\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--accent-attention\) 6%, transparent\);[\s\S]*?border-left:\s*2px solid var\(--accent-attention\);/,
  /\.nav-item-dot\s*\{[\s\S]*?background:\s*var\(--accent-attention\);/,
  /\.mobile-topbar-attention\s*\{[\s\S]*?background:\s*var\(--accent-attention\);[\s\S]*?color:\s*var\(--text-on-attention\);/,
].forEach((activitySelector) => {
  assert.match(
    baseCss,
    activitySelector,
    "community-local reply, unread, and navigation activity should share the attention role",
  );
});
[
  /\.community-dm-inbox-row-unread\s*\{[\s\S]*?background:\s*var\(--accent-global-attention\);/,
  /\.community-rail-dot\s*\{[\s\S]*?background:\s*var\(--accent-global-attention\);/,
  /\.mobile-bottom-rail-unread\s*\{[\s\S]*?background:\s*var\(--accent-global-attention\);[\s\S]*?color:\s*var\(--text-on-global-attention\);/,
  /\.mobile-bottom-rail-dot\s*\{[\s\S]*?background:\s*var\(--accent-global-attention\);/,
  /\.direct-messages-unread-badge\s*\{[\s\S]*?background:\s*var\(--accent-global-attention\);[\s\S]*?color:\s*var\(--text-on-global-attention\);/,
].forEach((globalAttentionSelector) => {
  assert.match(
    baseCss,
    globalAttentionSelector,
    "DM and outer-rail attention should share the red global-attention role",
  );
});
assert.match(
  directMessagesChrome,
  /className="direct-messages-unread-badge"/,
  "the DM trigger should use its exact semantic badge class",
);
assert.doesNotMatch(
  `${baseThemeCss}\n${baseCss}\n${directMessagesChrome}`,
  /accent-attention-fill|className="unread-badge"|\.unread-badge\s*\{/,
  "the redundant attention fill and generic unread badge aliases should stay deleted",
);
assert.match(
  baseCss,
  /\.nav-item\.active\s*\{[\s\S]*?background:\s*var\(--surface-selected\);[\s\S]*?border-color:\s*var\(--stroke-selected\);[\s\S]*?color:\s*var\(--text-selected\);/,
  "routine selection should remain independent from activity attention",
);
assert.doesNotMatch(
  baseCss,
  /:root\[data-theme="light"\][^{]*\{[^}]*filter:\s*invert\(1\)/,
  "the Light theme must not inherit dark-only image inversion",
);
assert.match(
  baseCss,
  /--web-floating-chrome-surface:\s*var\(--surface-workspace,[^;]+;[\s\S]*--web-context-panel-surface:\s*var\(--surface-panel,[^;]+;[\s\S]*--web-popover-surface:\s*var\(--surface-card,[^;]+;/,
  "web chrome should expose one canonical material role for floating controls, context panels, and popovers",
);
assert.match(
  baseCss,
  /@supports \(background: color-mix\(in srgb, #000 50%, transparent\)\)[\s\S]*--web-floating-chrome-surface:\s*color-mix\([\s\S]*var\(--surface-workspace, var\(--bg-workspace\)\) 88%,[\s\S]*transparent/,
  "floating chrome should visually disappear into the active workspace until content passes underneath",
);
assert.doesNotMatch(
  baseCss,
  /:root\[data-theme="dark"\]\s*\{[^}]*--web-floating-chrome/,
  "floating chrome must derive from the workspace instead of carrying a Dark-only paint override",
);
assert.match(
  baseCss,
  /@supports \(color: rgb\(from #000 r g b\)\)[\s\S]*--web-context-panel-surface:\s*rgb\([\s\S]*from var\(--surface-panel, var\(--bg-panel\)\)[\s\S]*\br\b[\s\S]*\bg\b[\s\S]*\bb\b[\s\S]*\/ 1/,
  "context panels should preserve the theme panel color while stripping alpha that would reveal unrelated content",
);
assert.match(
  baseCss,
  /\.app-topbar \.topbar-right\.topbar-right-island\s*\{[\s\S]*background:\s*var\(--web-floating-chrome-surface\);/,
  "desktop top chrome should consume the canonical floating material",
);
assert.match(
  baseCss,
  /\.community-interaction-drawer-back\s*\{[\s\S]*background:\s*var\(--web-floating-chrome-surface\);/,
  "thread navigation should consume the same floating material",
);
assert.match(
  baseCss,
  /\.community-profile-panel\s*\{[\s\S]*background:\s*var\(--web-context-panel-surface\);[\s\S]*box-shadow:\s*var\(--web-context-panel-shadow\);/,
  "member profile utility panels should consume the canonical context-panel material",
);
assert.match(
  baseCss,
  /\.chat-profile-hover-card\s*\{[\s\S]*background:\s*var\(--web-popover-surface\);[\s\S]*box-shadow:\s*var\(--web-popover-shadow\);/,
  "hover cards should consume the canonical raised popover material",
);
assert.doesNotMatch(
  baseCss,
  /--web-floating-chrome-(?:bg|border)/,
  "the retired overloaded glass background and border roles must not reappear",
);

assert.match(appearance, /role="group" aria-label="Theme"/);
assert.match(appearance, /aria-pressed=\{appTheme === theme\.id\}/);
assert.match(baseCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\);/);
assert.match(baseCss, /data-preview-theme="light"/);
assert.match(baseCss, /data-preview-theme="dark"/);
assert.doesNotMatch(baseCss, /data-preview-theme="polynet"|data-theme="polynet"/);
assert.doesNotMatch(
  `${indexHtml}\n${read("shared/theme.ts")}\n${baseCss}\n${communityAgentCss}`,
  /data-theme-family/,
  "theme family must not survive as a second styling authority",
);
assert.match(indexHtml, /<meta name="theme-color" content="#08090A"/);
assert.match(indexHtml, /manifest\.webmanifest\?v=20261105b/);
assert.match(manifest, /"start_url": "\/m\?launch=app"/);
assert.match(manifest, /"background_color": "#08090A"/);
assert.match(manifest, /"theme_color": "#08090A"/);
const genericSettingsButtonSelector =
  baseCss.match(/\.settings-panel button[^{]+\{/)?.[0] ?? "";
assert.match(
  genericSettingsButtonSelector,
  /:not\(\.appearance-option\)/,
  "generic settings-button rules must not override theme-card geometry or active state",
);

assert.doesNotMatch(
  main,
  /parseAppTheme|applyAppThemeAttributes|polynet-theme|arx-theme/,
  "main.tsx should not duplicate pre-paint or reactive theme ownership",
);
assert.match(
  shellState,
  /localStorage\.setItem\(APP_THEME_STORAGE_KEY,\s*appTheme\)/,
  "the selected theme should remain browser-persistent",
);
assert.match(
  shellState,
  /localStorage\.removeItem\(LEGACY_APP_THEME_STORAGE_KEY\)/,
  "the reactive owner should retire a migrated legacy preference",
);
assert.match(
  shellState,
  /readFirstLocalStorageValue\(\[\s*APP_THEME_STORAGE_KEY,\s*LEGACY_APP_THEME_STORAGE_KEY,\s*\]\)/,
  "React state should initialize with the same primary-then-legacy precedence as bootstrap",
);
assert.match(
  shellState,
  /return DEFAULT_APP_THEME;/,
  "React state should use the canonical default when storage is absent or invalid",
);
assert.equal(
  shellState.match(/applyAppThemeAttributes\(appTheme,\s*document\.documentElement\)/g)?.length,
  1,
  "the shell state owner should contain exactly one reactive theme applicator",
);
assert.doesNotMatch(
  app,
  /APP_THEME_STORAGE_KEY|LEGACY_APP_THEME_STORAGE_KEY|applyAppThemeAttributes|parseAppTheme/,
  "App.tsx must not duplicate the shell state owner's theme lifecycle",
);
assert.doesNotMatch(
  persistenceLifecycle,
  /appTheme|applyAppThemeAttributes|polynet-theme|arx-theme/,
  "the general UI persistence hook should not own theme lifecycle",
);
assert.match(
  mvpGuards,
  /name:\s*Run canonical release gate[\s\S]*?run:\s*npm run release:gate/,
  "CI should delegate validation to the canonical release gate",
);
assert.match(
  releaseGate,
  /"app_theme_contract"[\s\S]*?"npm run check:app-theme-contract-proof"/,
  "the canonical release gate should retain the theme lifecycle contract",
);

assert.match(
  communityAgentCss,
  /\.community-agent-dock-panel\s*\{[\s\S]*?background:\s*var\(--web-context-panel-surface\);[\s\S]*?border:\s*1px solid var\(--web-context-panel-border\);[\s\S]*?box-shadow:\s*var\(--web-context-panel-shadow\);/,
  "the open member-agent panel should use the same semantic context material as other utility panels",
);

assert.doesNotMatch(
  baseCss,
  /\.cfg-(?:page|shell|guestbar|nav|center|topic|feed|rope|mobile-ident)\b/,
  "retired guest-shell selectors must not survive in the account bridge",
);
assert.match(
  baseCss,
  /\.polynet-account-setup-modal\s*\{[\s\S]*?width:\s*min\(100%,\s*560px\);/,
  "the live account bridge should use the canonical account setup modal",
);
assert.match(
  baseCss,
  /\.account-setup-primary\.is-ready\s*\{[\s\S]*?background:\s*var\(--bg-button\);[\s\S]*?color:\s*var\(--bg-button-text\);/,
  "account setup conversion actions should use the canonical button roles",
);
assert.match(
  baseCss,
  /\.account-setup-avatar-trigger\s*\{[\s\S]*?border:\s*1px dashed var\(--border-default\);[\s\S]*?background:\s*var\(--bg-card-alt\);/,
  "account setup identity media should use canonical border and card roles",
);
assert.doesNotMatch(
  communityAgentCss,
  /:root\[data-theme="dark"\]/,
  "Dark component preservation should come from canonical root defaults, not new component overrides",
);

[
  /\.status\.canceled\s*\{[\s\S]*?background:\s*var\(--danger-surface\);[\s\S]*?color:\s*var\(--danger-text\);/,
  /\.status\.failed\s*\{[\s\S]*?background:\s*var\(--danger-surface\);[\s\S]*?color:\s*var\(--danger-text\);/,
  /\.settings-section\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--border-muted\);/,
].forEach((legacyRule) => {
  assert.match(
    baseCss,
    legacyRule,
    "dark-theme component states must consume the danger and border tokens",
  );
});
[
  /:root\[data-theme="light"\]\s*\.status\.canceled,[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--accent-error\) 14%,\s*transparent\);[\s\S]*?color:\s*var\(--accent-error\);/,
  /:root\[data-theme="light"\]\s*\.settings-section\s*\{[\s\S]*?border-bottom-color:\s*var\(--border-default\);/,
].forEach((lightAdapter) => {
  assert.match(
    baseCss,
    lightAdapter,
    "Light component divergence must remain explicitly scoped to Light",
  );
});

[
  communityChat,
  directMessages,
  communityAgentComponent,
].forEach((component) => {
  assert.match(
    component,
    /className="[^"]*chat-send ask-send-btn ask-send-btn-v2/,
    "every live core conversation send control should consume the canonical send primitive",
  );
});
assert.match(
  voiceInputButton,
  /className=\{`ask-icon-btn ask-mic \$\{state\}`\}/,
  "the shared voice control should project idle, recording, and transcribing state classes",
);

[
  /\.ask-icon-btn\.ask-mic\.recording\s*\{[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--accent-error\) 20%,\s*transparent\);[\s\S]*?color:\s*#ffe8e8;/,
].forEach((legacyRule) => {
  assert.match(
    baseCss,
    legacyRule,
    "existing dark-theme conversation values must remain on their exact legacy baseline",
  );
});
[
  "--conversation-primary-action-surface: #ffffff;",
  "--conversation-primary-action-hover-surface: #ffffff;",
  "--conversation-primary-action-foreground: #111111;",
].forEach((legacyDeclaration) => {
  assert.ok(
    baseCss.includes(legacyDeclaration),
    `existing dark-theme send controls should retain ${legacyDeclaration}`,
  );
});
assert.match(
  baseCss,
  /\.ask-send-btn\.ask-send-btn-v2\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "the shared send primitive should consume the canonical action roles",
);
assert.match(
  baseCss,
  /\.ask-send-btn\.ask-send-btn-v2:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-hover-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "send hover should consume the canonical hover role",
);
assert.match(
  baseCss,
  /\.ask-send-btn\.ask-send-btn-v2:disabled\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "disabled send should retain the canonical action role beneath its legacy opacity",
);
assert.match(
  communityAgentCss,
  /\.community-agent-dock-error\s*\{[\s\S]*?color:\s*var\(--text-secondary\);[\s\S]*?background:\s*var\(--surface-selected\);[\s\S]*?border-left:\s*2px solid var\(--accent-gold\);/,
  "dark-theme dock errors must use the neutral surface and text tokens",
);

assert.match(
  baseCss,
  /:root\[data-theme="light"\]\s*\{[\s\S]*?--conversation-primary-action-surface:\s*var\(--bg-button\);[\s\S]*?--conversation-primary-action-hover-surface:\s*var\(--bg-button-hover\);[\s\S]*?--conversation-primary-action-foreground:\s*var\(--bg-button-text\);[\s\S]*?\}/,
  "the live send primitive should adapt through one Light role assignment",
);
[
  /:root\[data-theme="light"\]\s*\.ask-icon-btn\.ask-mic\.recording\s*\{[\s\S]*?color:\s*var\(--accent-error\);/,
  /:root\[data-theme="light"\]\s*\.ask-icon-btn\.ask-mic\.transcribing\s*\{[\s\S]*?var\(--accent,\s*var\(--accent-selection\)\)/,
].forEach((lightAdapter) => {
  assert.match(
    baseCss,
    lightAdapter,
    "the live conversation control should adapt through semantic Light tokens",
  );
});
assert.match(
  communityAgentCss,
  /:root\[data-theme="light"\]\s*\.community-agent-dock-error\s*\{[\s\S]*?color:\s*var\(--accent-error\);[\s\S]*?border-left-color:\s*var\(--accent-error\);/,
  "Light dock errors should use the functional error role",
);

const accessiblePairs = [
  ["Builder primary text on canvas", "#F7F8F8", "#08090A"],
  ["Builder muted text on canvas", "#9A9FA8", "#08090A"],
  ["Builder faint text on canvas", "#82878F", "#08090A"],
  ["Builder faint text on card", "#82878F", "#1C1D20"],
  ["Builder muted text on hover card", "#9A9FA8", "#242528"],
  ["Builder action text on white", "#08090A", "#F7F8F8"],
  ["Builder action text on cream", "#0A0A0A", "#F1EDE5"],
  ["Dark attention on canvas", "#F7F8F8", "#0B0C0D"],
  ["Light attention on workspace", "#0B0B0C", "#FFFFFF"],
  ["Light attention on navigation", "#0B0B0C", "#F7F7F8"],
  ["Dark unread count on attention fill", "#08090A", "#F7F8F8"],
  ["Light unread count on activity fill", "#FFFFFF", "#326FAD"],
  ["Dark global attention count", "#171719", "#EF4444"],
  ["Light global attention count", "#FFFFFF", "#B42318"],
  ["Primary ink on workspace", "#0B0B0C", "#FFFFFF"],
  ["Secondary ink on panel", "#3C3F45", "#F7F7F8"],
  ["Muted ink on rail", "#5F636B", "#F1F1F3"],
  ["Faint ink on workspace", "#686C73", "#FFFFFF"],
  ["Faint ink on panel", "#686C73", "#F7F7F8"],
  ["Selection ink on card", "#0B0B0C", "#FFFFFF"],
  ["White on control ink", "#FFFFFF", "#0B0B0C"],
  [
    "Agent ink on agent surface",
    "#3C3F45",
    blendHex("#0B0B0C", "#FFFFFF", 0.06),
  ],
  ["Functional success on card", "#147A4B", "#FFFFFF"],
  ["Functional error on panel", "#B42318", "#F7F7F8"],
  [
    "Functional error on recording surface",
    "#B42318",
    blendHex("#B42318", "#FFFFFF", 0.12),
  ],
  [
    "Functional error on dock feedback surface",
    "#B42318",
    blendHex("#B42318", "#F7F7F8", 0.1),
  ],
] as const;
for (const [label, foreground, background] of accessiblePairs) {
  assert.ok(
    contrastRatio(foreground, background) >= 4.5,
    `${label} should meet WCAG AA contrast for normal text`,
  );
}

// Design system v1 (docs/specs/design-system-v1.md) ships behind a build-time
// switch. Without it the app must render exactly as before: nothing in the v1
// stylesheet may apply unless the root carries data-design="v1".
assert.equal(isDesignV1Enabled("1"), true);
for (const off of [undefined, null, "", "0", "true", "v1", " 2 "]) {
  assert.equal(isDesignV1Enabled(off), false, `VITE_DESIGN_V1=${String(off)} must leave v1 off`);
}
const sourceIndexHtml = read("apps/web/index.html");
assert.doesNotMatch(sourceIndexHtml, /data-design=/, "only the build may stamp data-design");
assert.equal(applyDesignAttribute(sourceIndexHtml, false), sourceIndexHtml);
assert.match(applyDesignAttribute('<html lang="en">', true), /^<html lang="en" data-design="v1">$/);
assert.equal(
  applyDesignAttribute('<html lang="en" data-design="v1">', true),
  '<html lang="en" data-design="v1">',
);

const designV1Css = read("apps/web/src/styles/design-v1.css");
const indexCssImports = [...read("apps/web/src/index.css").matchAll(/^@import "([^"]+)";$/gm)].map((m) => m[1]);
assert.equal(indexCssImports.at(-1), "./styles/design-v1.css", "the v1 stylesheet must be imported last");
function topLevelSelectors(selectorList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of selectorList) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

for (const selector of designV1Css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) {
  for (const part of topLevelSelectors(selector[1])) {
    assert.match(part.trim(), /^:root\[data-design="v1"\]/, `v1 rule must be scoped: ${part.trim()}`);
  }
}

function v1Tokens(selector: string): Map<string, string> {
  const start = designV1Css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `design-v1.css should define ${selector}`);
  const block = designV1Css.slice(start, designV1Css.indexOf("}", start));
  return new Map(
    [...block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1], match[2]]),
  );
}

for (const [mode, selector] of [
  ["dark", ':root[data-design="v1"]:not([data-theme="light"])'],
  ["light", ':root[data-design="v1"][data-theme="light"]'],
] as const) {
  const tokens = v1Tokens(selector);
  const token = (name: string) => {
    const value = tokens.get(name);
    assert.ok(value, `v1 ${mode} should set ${name} to a six-digit colour`);
    return value;
  };
  const ground = token("--bg-app");
  const pairs: Array<[string, string, string]> = [
    ["primary text", token("--text-primary"), ground],
    ["secondary text", token("--text-secondary"), ground],
    ["muted text", token("--text-muted"), ground],
    ["faint text", token("--text-faint"), ground],
    ["primary button", token("--bg-button-text"), token("--bg-button")],
    ["primary button, hover", token("--bg-button-text"), token("--bg-button-hover")],
    ["link", token("--text-link"), ground],
    ["agent text", token("--accent-agent-foreground"), ground],
    ["error text", token("--danger-text"), ground],
    ["text on attention", token("--text-on-attention"), token("--accent-attention")],
  ];
  for (const [label, foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `v1 ${mode}: ${label} should meet WCAG AA contrast (${foreground} on ${background})`,
    );
  }
}

// The agent's voice: Newsreader is fetched only when v1 is on, and channel rows
// say who wrote them so the voice can follow the author.
const webMain = read("apps/web/src/main.tsx");
assert.doesNotMatch(webMain, /^import\s+["']@fontsource-variable\/newsreader/m, "Newsreader must not load by default");
assert.match(
  webMain,
  /if \(document\.documentElement\.dataset\.design === "v1"\) \{\s*void import\("@fontsource-variable\/newsreader\/opsz\.css"\);/,
  "Newsreader loads only when the build enabled v1",
);
assert.match(
  read("apps/web/src/components/communityInteractionFeed.tsx"),
  /className="community-interaction-group" data-actor-type=\{first\.root\.actor_type\}/,
);
assert.match(
  read("apps/web/src/components/WebCommunityInteractionProjection.tsx"),
  /data-actor-type=\{reply\.actor_type\} className=\{`community-interaction-reply/,
);
assert.match(designV1Css, /\[data-actor-type="community_agent"\] \.community-interaction-body/);

console.log("app_theme_contract_proof: ok");
