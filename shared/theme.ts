export const APP_THEME_STORAGE_KEY = "polynet-theme";
export const LEGACY_APP_THEME_STORAGE_KEY = "arx-theme";

export const APP_THEME_DEFINITIONS = [
  {
    id: "dark",
    label: "Dark",
    description: "Neutral dark theme",
    disabled: false,
    browserColor: "#1A1A1A",
  },
  {
    id: "light",
    label: "Light",
    description: "Paper light with intelligence blue",
    disabled: false,
    browserColor: "#F8F8F4",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  disabled: boolean;
  browserColor: `#${string}`;
}[];

export type AppTheme = (typeof APP_THEME_DEFINITIONS)[number]["id"];
export type AppThemeDefinition = (typeof APP_THEME_DEFINITIONS)[number];

const LEGACY_APP_THEME_ID_ALIASES: Readonly<Record<string, AppTheme>> = {
  cris: "light",
};

export const DEFAULT_APP_THEME: AppTheme = "dark";

export type AppThemeOption = {
  id: AppTheme;
  label: string;
  description: string;
  disabled: boolean;
};

export const APP_THEME_OPTIONS: readonly AppThemeOption[] = APP_THEME_DEFINITIONS;

const APP_THEME_ID_SET = new Set<string>(
  APP_THEME_DEFINITIONS.map((definition) => definition.id),
);

export function parseAppTheme(input: string | null | undefined): AppTheme | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  const canonicalTheme = Object.prototype.hasOwnProperty.call(
    LEGACY_APP_THEME_ID_ALIASES,
    raw,
  )
    ? LEGACY_APP_THEME_ID_ALIASES[raw]
    : raw;
  return APP_THEME_ID_SET.has(canonicalTheme) ? (canonicalTheme as AppTheme) : null;
}

export function getAppThemeDefinition(theme: AppTheme): AppThemeDefinition {
  const definition = APP_THEME_DEFINITIONS.find((candidate) => candidate.id === theme);
  if (!definition) {
    throw new Error(`Unknown app theme: ${theme}`);
  }
  return definition;
}

export function applyAppThemeAttributes(theme: AppTheme, root: HTMLElement | null | undefined): void {
  if (!root) return;
  const definition = getAppThemeDefinition(theme);
  root.setAttribute("data-theme", theme);
  root.ownerDocument
    ?.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", definition.browserColor);
}
