const APP_THEME_IDS = ["dark", "polynet"] as const;

export type AppTheme = (typeof APP_THEME_IDS)[number];
export type AppThemeFamily = "dark";

export type AppThemeOption = {
  id: AppTheme;
  label: string;
  description: string;
  disabled: boolean;
};

export const APP_THEME_OPTIONS: readonly AppThemeOption[] = [
  { id: "dark", label: "Dark", description: "Default dark theme", disabled: false },
  { id: "polynet", label: "Polynet Dark", description: "Monolithic surface + violet", disabled: false },
] as const;

const APP_THEME_ID_SET = new Set<string>(APP_THEME_IDS);

export function parseAppTheme(input: string | null | undefined): AppTheme | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  return APP_THEME_ID_SET.has(raw) ? (raw as AppTheme) : null;
}

function themeFamilyForTheme(_theme: AppTheme): AppThemeFamily {
  return "dark";
}

export function applyAppThemeAttributes(theme: AppTheme, root: HTMLElement | null | undefined): void {
  if (!root) return;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-family", themeFamilyForTheme(theme));
}
