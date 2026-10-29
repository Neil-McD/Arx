import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// A dialog portaled to document.body leaves the community's theme scope and
// falls back to the app's own look. This reads the scope from where the
// dialog is mounted, so the portal can carry it along.
export function useCommunityThemeScope() {
  const marker = useRef<HTMLSpanElement | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  useLayoutEffect(() => {
    setTheme(marker.current?.closest("[data-community-theme]")?.getAttribute("data-community-theme") ?? null);
  });
  return {
    marker: <span ref={marker} hidden />,
    scope: (children: ReactNode) => <div className="community-theme-scope" data-community-theme={theme ?? undefined} style={{ display: "contents" }}>{children}</div>,
  };
}
