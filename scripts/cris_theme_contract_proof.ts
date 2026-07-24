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

const expectedThemeIds: AppTheme[] = ["dark", "polynet", "cris"];
assert.deepEqual(
  APP_THEME_DEFINITIONS.map((definition) => definition.id),
  expectedThemeIds,
  "the canonical theme registry should expose exactly the two existing themes plus CRIS",
);
assert.equal(APP_THEME_OPTIONS, APP_THEME_DEFINITIONS);
assert.deepEqual(
  getAppThemeDefinition("cris"),
  {
    id: "cris",
    label: "CRIS",
    description: "Paper workspace + intelligence blue",
    disabled: false,
    family: "light",
    browserColor: "#F8F8F4",
  },
);
assert.equal(DEFAULT_APP_THEME, "polynet");
assert.equal(APP_THEME_STORAGE_KEY, "polynet-theme");
assert.equal(LEGACY_APP_THEME_STORAGE_KEY, "arx-theme");

for (const theme of expectedThemeIds) {
  assert.equal(parseAppTheme(theme), theme);
  assert.equal(parseAppTheme(` ${theme} `), theme);
}
for (const invalidTheme of [null, undefined, "", "CRIS", "light", "system", "unknown"]) {
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
  assert.equal(result.rootAttributes.get("data-theme-family"), definition.family);
  assert.equal(result.browserColor, definition.browserColor);
  assert.deepEqual(result.storageReads, [APP_THEME_STORAGE_KEY]);
}

const legacyBootstrap = runThemeBootstrap({ legacy: "cris" });
assert.equal(legacyBootstrap.rootAttributes.get("data-theme"), "cris");
assert.deepEqual(legacyBootstrap.storageReads, [
  APP_THEME_STORAGE_KEY,
  LEGACY_APP_THEME_STORAGE_KEY,
]);

for (const params of [
  { primary: "unknown" },
  { primary: "__proto__" },
  { storageThrows: true },
]) {
  const result = runThemeBootstrap(params);
  const fallbackDefinition = getAppThemeDefinition(DEFAULT_APP_THEME);
  assert.equal(result.rootAttributes.get("data-theme"), DEFAULT_APP_THEME);
  assert.equal(result.rootAttributes.get("data-theme-family"), fallbackDefinition.family);
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

applyAppThemeAttributes("cris", root);
assert.equal(attributes.get("data-theme"), "cris");
assert.equal(attributes.get("data-theme-family"), "light");
assert.equal(browserThemeColor, "#F8F8F4");

applyAppThemeAttributes("polynet", root);
assert.equal(attributes.get("data-theme"), "polynet");
assert.equal(attributes.get("data-theme-family"), "dark");
assert.equal(browserThemeColor, "#121214");

applyAppThemeAttributes("dark", root);
assert.equal(attributes.get("data-theme-family"), "dark");
assert.equal(browserThemeColor, "#1A1A1A");

const baseCss = read("apps/web/src/base.css");
const indexCss = read("apps/web/src/index.css");
const appearance = read("apps/web/src/components/WebAppearanceSettingsSection.tsx");
const main = read("apps/web/src/main.tsx");
const app = read("apps/web/src/App.tsx");
const persistenceLifecycle = read(
  "apps/web/src/controllers/useWebUiPersistenceLifecycle.ts",
);
const funnelCss = read("apps/web/src/components/CommunityFunnelSurface.css");
const memberAgentCss = read("apps/web/src/components/WebMemberAgentDock.css");
const memberAgentComponent = read("apps/web/src/components/WebMemberAgentDock.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const communityChat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const directMessages = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const voiceInputButton = read("shared/VoiceInputButton.tsx");
const mvpGuards = read(".github/workflows/mvp-guards.yml");

const crisThemeBlock = baseCss.match(
  /:root\[data-theme="cris"\]\s*\{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(crisThemeBlock, "base.css should define one canonical CRIS theme block");
assert.equal(
  baseCss.match(/:root\[data-theme="cris"\]/g)?.length,
  1,
  "CRIS identity tokens should have exactly one theme-id-scoped owner",
);

[
  "--bg-app: #F8F8F4;",
  "--bg-workspace: #F8F8F4;",
  "--bg-panel: #EBE9FB;",
  "--surface-rail: #F8F8F4;",
  "--surface-nav: #EBE9FB;",
  "--bg-card: #FFFFFF;",
  "--surface-selected: #DCD8F7;",
  "--text-primary: #171719;",
  "--text-muted: #6B6974;",
  "--border-strong: rgba(23, 23, 25, 0.22);",
  "--border-default: rgba(23, 23, 25, 0.1);",
  "--divider-accent: rgba(23, 23, 25, 0.22);",
  "--accent-selection: #2F55FF;",
  "--accent-agent: #2F55FF;",
  "--text-link: #2F55FF;",
  "--text-selected: #171719;",
  "--community-social-embed-surface: var(--surface-card);",
  "--community-social-embed-surface-hover: var(--surface-card-hover);",
  "--community-social-embed-stroke: var(--stroke-default);",
  "--community-social-embed-text: var(--text-ink-primary);",
  "--community-social-embed-muted: var(--text-ink-secondary);",
].forEach((token) => {
  assert.ok(crisThemeBlock.includes(token), `CRIS should define ${token}`);
});
assert.match(crisThemeBlock, /color-scheme:\s*light;/);
assert.match(
  baseCss,
  /\.community-interaction-day::before,[\s\S]*?\.community-interaction-day::after\s*\{[\s\S]*?background:\s*var\(--stroke-divider-accent\);/,
  "live community-feed day separators should consume the semantic structural-divider role",
);
assert.match(
  baseCss,
  /\.chat-date-separator::before,[\s\S]*?\.chat-date-separator::after\s*\{[\s\S]*?background:\s*var\(--stroke-divider-accent\);/,
  "legacy chat day separators should consume the same structural-divider role",
);

assert.match(baseCss, /:root\[data-theme-family="dark"\]\s*\.model-picker-nav-logo-img\.monochrome/);
assert.match(indexCss, /:root\[data-theme-family="dark"\]\s*\.message-item\.assistant \.message-text/);
assert.match(indexCss, /:root\[data-theme-family="dark"\]\s*\.web-download-logo\.monochrome/);
assert.doesNotMatch(
  indexCss,
  /:root\[data-theme="cris"\][^{]*\{[^}]*filter:\s*invert\(1\)/,
  "the light CRIS family must not inherit dark-only image inversion",
);
assert.match(
  indexCss,
  /--web-floating-chrome-surface:\s*var\(--surface-workspace,[^;]+;[\s\S]*--web-context-panel-surface:\s*var\(--surface-panel,[^;]+;[\s\S]*--web-popover-surface:\s*var\(--surface-card,[^;]+;/,
  "web chrome should expose one canonical material role for floating controls, context panels, and popovers",
);
assert.match(
  indexCss,
  /@supports \(background: color-mix\(in srgb, #000 50%, transparent\)\)[\s\S]*--web-floating-chrome-surface:\s*color-mix\([\s\S]*var\(--surface-workspace, var\(--bg-workspace\)\) 88%,[\s\S]*transparent/,
  "floating chrome should visually disappear into the active workspace until content passes underneath",
);
assert.doesNotMatch(
  indexCss,
  /:root\[data-theme-family="dark"\]\s*\{[^}]*--web-floating-chrome/,
  "floating chrome must derive from each theme's workspace instead of carrying a dark-family paint override",
);
assert.match(
  indexCss,
  /@supports \(color: rgb\(from #000 r g b\)\)[\s\S]*--web-context-panel-surface:\s*rgb\([\s\S]*from var\(--surface-panel, var\(--bg-panel\)\)[\s\S]*\br\b[\s\S]*\bg\b[\s\S]*\bb\b/,
  "context panels should preserve the theme panel color while stripping alpha that would reveal unrelated content",
);
assert.match(
  indexCss,
  /\.app-root\.web-header-islands \.app-topbar \.topbar-left,[\s\S]*background:\s*var\(--web-floating-chrome-surface\);/,
  "desktop top chrome should consume the canonical floating material",
);
assert.match(
  indexCss,
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
  `${indexCss}\n${baseCss}`,
  /--web-floating-chrome-(?:bg|border)/,
  "the retired overloaded glass background and border roles must not reappear",
);

assert.match(appearance, /role="group" aria-label="Theme"/);
assert.match(appearance, /aria-pressed=\{appTheme === theme\.id\}/);
assert.match(baseCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\);/);
assert.match(baseCss, /data-preview-theme="cris"/);
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
  app,
  /localStorage\.setItem\(APP_THEME_STORAGE_KEY,\s*appTheme\)/,
  "the selected theme should remain browser-persistent",
);
assert.match(
  app,
  /localStorage\.removeItem\(LEGACY_APP_THEME_STORAGE_KEY\)/,
  "the reactive owner should retire a migrated legacy preference",
);
assert.match(
  app,
  /readFirstLocalStorageValue\(\[APP_THEME_STORAGE_KEY,\s*LEGACY_APP_THEME_STORAGE_KEY\]\)/,
  "React state should initialize with the same primary-then-legacy precedence as bootstrap",
);
assert.match(
  app,
  /return DEFAULT_APP_THEME;/,
  "React state should use the canonical default when storage is absent or invalid",
);
assert.equal(
  app.match(/applyAppThemeAttributes\(appTheme,\s*document\.documentElement\)/g)?.length,
  1,
  "App.tsx should contain exactly one reactive theme applicator",
);
assert.doesNotMatch(
  persistenceLifecycle,
  /appTheme|applyAppThemeAttributes|polynet-theme|arx-theme/,
  "the general UI persistence hook should not own theme lifecycle",
);
assert.match(
  mvpGuards,
  /name:\s*Run CRIS theme contract proof[\s\S]*?run:\s*npm run check:cris-theme-contract-proof/,
  "the theme lifecycle contract should run in CI",
);

assert.match(
  memberAgentCss,
  /\.member-agent-dock\s*\{[\s\S]*?--member-agent-launcher-background:\s*color-mix\(\s*in srgb,\s*var\(--member-agent-accent\) 18%,\s*#111115 82%\s*\);[\s\S]*?--member-agent-launcher-shadow:\s*0 8px 24px rgba\(0, 0, 0, 0\.46\),\s*0 2px 8px rgba\(0, 0, 0, 0\.34\),\s*inset 0 1px 0 color-mix\(in srgb, var\(--member-agent-accent-strong\) 10%, transparent\);/,
  "the existing dark themes should retain the launcher's exact legacy surface and elevation",
);
assert.match(
  memberAgentCss,
  /:root\[data-theme-family="light"\]\s*\.member-agent-dock\s*\{[\s\S]*?--member-agent-launcher-background:\s*var\(--surface-selected\);[\s\S]*?--member-agent-launcher-border:\s*var\(--stroke-default\);[\s\S]*?--member-agent-launcher-shadow:\s*0 4px 12px rgba\(23, 23, 25, 0\.14\);[\s\S]*?--member-agent-launcher-glyph-filter:\s*none;/,
  "the light family should use the raised lavender surface without dark-theme highlights or glyph shadow",
);
assert.match(
  memberAgentCss,
  /\.member-agent-dock-launcher\s*\{[\s\S]*?background:\s*var\(--member-agent-launcher-background\);[\s\S]*?border:\s*1px solid var\(--member-agent-launcher-border\);[\s\S]*?box-shadow:\s*var\(--member-agent-launcher-shadow\);/,
  "the launcher should consume the scoped visual adapter",
);
assert.match(
  memberAgentCss,
  /\.member-agent-dock-panel\s*\{[\s\S]*?background:\s*var\(--web-context-panel-surface\);[\s\S]*?border:\s*1px solid var\(--web-context-panel-border\);[\s\S]*?box-shadow:\s*var\(--web-context-panel-shadow\);/,
  "the open member-agent panel should use the same semantic context material as other utility panels",
);
assert.doesNotMatch(
  memberAgentCss,
  /backdrop-filter/,
  "the opaque launcher should not carry a visually inert backdrop filter",
);

[
  "--cfg-selection-text: #17070c;",
  "--cfg-alert-border: rgba(226, 75, 74, 0.4);",
  "--cfg-alert-surface: rgba(226, 75, 74, 0.08);",
  "--cfg-alert-text: #f0a2a2;",
  "--cfg-primary-surface: #efeff2;",
  "--cfg-primary-surface-hover: #fff;",
  "--cfg-primary-text: #101114;",
  "--cfg-error-border: rgba(226, 75, 74, 0.4);",
  "--cfg-error-surface: rgba(226, 75, 74, 0.07);",
  "--cfg-gate-surface: #161619;",
  "--cfg-gate-avatar-stroke: #161619;",
].forEach((declaration) => {
  assert.ok(
    funnelCss.includes(declaration),
    `the existing dark themes should retain funnel declaration ${declaration}`,
  );
});
assert.match(
  funnelCss,
  /:root\[data-theme-family="light"\]\s*\.cfg-page\s*\{[\s\S]*?--cfg-primary-surface:\s*var\(--bg-button\);[\s\S]*?--cfg-gate-surface:\s*var\(--bg-modal\);[\s\S]*?--cfg-gate-avatar-stroke:\s*var\(--bg-modal\);[\s\S]*?\}/,
  "the light family should adapt funnel chrome through one family-scoped role block",
);
assert.match(
  funnelCss,
  /\.cfg-gatecard[^}]*background:\s*var\(--cfg-gate-surface\)/,
);
assert.match(
  funnelCss,
  /\.cfg-join[^}]*background:\s*var\(--cfg-primary-surface\)/,
);
assert.doesNotMatch(
  `${funnelCss}\n${memberAgentCss}`,
  /:root\[data-theme="(?:dark|polynet)"\]/,
  "existing dark-theme preservation should come from legacy defaults, not new overrides",
);
assert.doesNotMatch(
  `${indexCss}\n${funnelCss}\n${memberAgentCss}`,
  /:root\[data-theme="cris"\]\s+\./,
  "component luminance adapters should use the canonical theme family, not CRIS identity",
);

[
  /\.plan-badge\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.04\);/,
  /\.plan-feature-icon\.x\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.06\);[\s\S]*?color:\s*rgba\(255,\s*255,\s*255,\s*0\.42\);/,
  /\.plan-feature-icon\.check\s*\{[\s\S]*?background:\s*rgba\(70,\s*210,\s*140,\s*0\.16\);[\s\S]*?border-color:\s*rgba\(70,\s*210,\s*140,\s*0\.35\);[\s\S]*?color:\s*#56d48a;/,
  /\.plan-cta\s*\{[\s\S]*?background:\s*#fff;[\s\S]*?color:\s*#0a0a0a;/,
  /\.status\.canceled\s*\{[\s\S]*?background:\s*rgba\(210,\s*80,\s*80,\s*0\.25\);[\s\S]*?color:\s*#f1a3a3;/,
  /\.status\.failed\s*\{[\s\S]*?background:\s*rgba\(210,\s*80,\s*80,\s*0\.25\);[\s\S]*?color:\s*#f1a3a3;/,
  /\.action-error\s*\{[\s\S]*?color:\s*#f1a3a3;[\s\S]*?border:\s*1px solid rgba\(210,\s*80,\s*80,\s*0\.35\);[\s\S]*?background:\s*rgba\(210,\s*80,\s*80,\s*0\.12\);/,
  /\.settings-section\s*\{[\s\S]*?border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.05\);/,
].forEach((legacyRule) => {
  assert.match(
    baseCss,
    legacyRule,
    "existing dark-theme component values must remain on their legacy baseline",
  );
});
[
  /:root\[data-theme-family="light"\]\s*\.plan-badge\s*\{[\s\S]*?background:\s*var\(--hover-overlay\);/,
  /:root\[data-theme-family="light"\]\s*\.plan-feature-icon\.check\s*\{[\s\S]*?color:\s*var\(--accent-success\);/,
  /:root\[data-theme-family="light"\]\s*\.plan-cta,[\s\S]*?background:\s*var\(--bg-button\);[\s\S]*?color:\s*var\(--bg-button-text\);/,
  /:root\[data-theme-family="light"\]\s*\.status\.canceled,[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--accent-error\) 14%,\s*transparent\);[\s\S]*?color:\s*var\(--accent-error\);/,
  /:root\[data-theme-family="light"\]\s*\.action-error\s*\{[\s\S]*?color:\s*var\(--accent-error\);/,
  /:root\[data-theme-family="light"\]\s*\.settings-section\s*\{[\s\S]*?border-bottom-color:\s*var\(--border-default\);/,
].forEach((crisAdapter) => {
  assert.match(
    baseCss,
    crisAdapter,
    "light-theme component divergence must remain explicitly scoped to the light family",
  );
});

[
  workspaceHost,
  communityChat,
  directMessages,
  memberAgentComponent,
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
assert.match(workspaceHost, /className="ask-engine-trigger"/);
assert.match(workspaceHost, /className="ask-engine-menu"/);
assert.match(workspaceHost, /className=\{`ask-engine-option/);

[
  /\.ask-icon-btn\.ask-mic\.recording\s*\{[\s\S]*?background:\s*color-mix\(in srgb,\s*#ef4444 20%,\s*transparent\);[\s\S]*?color:\s*#ffe8e8;/,
].forEach((legacyRule) => {
  assert.match(
    indexCss,
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
  indexCss,
  /\.ask-send-btn\.ask-send-btn-v2\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "the shared send primitive should consume the canonical action roles",
);
assert.match(
  indexCss,
  /\.ask-send-btn\.ask-send-btn-v2:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-hover-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "send hover should consume the canonical hover role",
);
assert.match(
  indexCss,
  /\.ask-send-btn\.ask-send-btn-v2:disabled\s*\{[\s\S]*?background:\s*var\(--conversation-primary-action-surface\) !important;[\s\S]*?color:\s*var\(--conversation-primary-action-foreground\) !important;/,
  "disabled send should retain the canonical action role beneath its legacy opacity",
);
[
  /\.ask-engine-menu\s*\{[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--bg-modal\) 94%,\s*#1b1b22 6%\);/,
  /\.ask-engine-option\.is-selected\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.055\);/,
].forEach((legacyRule) => {
  assert.match(
    baseCss,
    legacyRule,
    "existing dark-theme runtime selector values must remain on their exact legacy baseline",
  );
});
assert.match(
  memberAgentCss,
  /\.member-agent-dock-error\s*\{[\s\S]*?color:\s*#e8b4c4;[\s\S]*?background:\s*rgba\(214,\s*106,\s*138,\s*0\.1\);[\s\S]*?border-left:\s*2px solid var\(--accent-gold\);/,
  "existing dark-theme dock errors must retain their exact legacy treatment",
);

assert.match(
  baseCss,
  /:root\[data-theme-family="light"\]\s*\{[\s\S]*?--conversation-primary-action-surface:\s*var\(--bg-button\);[\s\S]*?--conversation-primary-action-hover-surface:\s*var\(--bg-button-hover\);[\s\S]*?--conversation-primary-action-foreground:\s*var\(--bg-button-text\);[\s\S]*?\}/,
  "the live send primitive should adapt through one light-family role assignment",
);
[
  /:root\[data-theme-family="light"\]\s*\.ask-icon-btn\.ask-mic\.recording\s*\{[\s\S]*?color:\s*var\(--accent-error\);/,
  /:root\[data-theme-family="light"\]\s*\.ask-icon-btn\.ask-mic\.transcribing\s*\{[\s\S]*?var\(--accent,\s*var\(--accent-selection\)\)/,
  /:root\[data-theme-family="light"\]\s*\.ask-engine-menu\s*\{[\s\S]*?background:\s*var\(--bg-modal\);/,
  /:root\[data-theme-family="light"\]\s*\.ask-engine-premium-pill\s*\{[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--accent-selection\) 8%,\s*transparent\);[\s\S]*?color:\s*var\(--accent-selection\);/,
  /:root\[data-theme-family="light"\]\s*\.ask-engine-option\.is-selected\s*\{[\s\S]*?background:\s*var\(--surface-selected\);/,
].forEach((lightAdapter) => {
  assert.match(
    baseCss,
    lightAdapter,
    "the live conversation control should adapt through semantic light-family tokens",
  );
});
assert.match(
  memberAgentCss,
  /:root\[data-theme-family="light"\]\s*\.member-agent-dock-error\s*\{[\s\S]*?color:\s*var\(--accent-error\);[\s\S]*?border-left-color:\s*var\(--accent-error\);/,
  "light-family dock errors should use the functional error role",
);

const accessiblePairs = [
  ["Ink on Paper", "#171719", "#F8F8F4"],
  ["Muted ink on Paper", "#6B6974", "#F8F8F4"],
  ["Intelligence blue on Paper", "#2F55FF", "#F8F8F4"],
  ["Intelligence blue on Operating field", "#2F55FF", "#EBE9FB"],
  ["White on Intelligence blue", "#FFFFFF", "#2F55FF"],
  [
    "Intelligence blue on premium pill surface",
    "#2F55FF",
    blendHex("#2F55FF", "#FFFFFF", 0.08),
  ],
  ["Functional error on Paper", "#B42318", "#F8F8F4"],
  [
    "Functional error on recording surface",
    "#B42318",
    blendHex("#B42318", "#FFFFFF", 0.12),
  ],
  [
    "Functional error on dock feedback surface",
    "#B42318",
    blendHex("#B42318", "#EBE9FB", 0.1),
  ],
] as const;
for (const [label, foreground, background] of accessiblePairs) {
  assert.ok(
    contrastRatio(foreground, background) >= 4.5,
    `${label} should meet WCAG AA contrast for normal text`,
  );
}

console.log("cris_theme_contract_proof: ok");
