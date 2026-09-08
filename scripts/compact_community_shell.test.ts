import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("compact desktop shell is presentation-only and retains canonical surfaces", () => {
  const host = readFileSync("apps/web/src/components/WebShellChromeHost.tsx", "utf8");
  expect(host).toContain("responsive-community-shell");
  expect(host).toContain("aria-expanded={navigationOpen}");
  expect(host).toContain('event.key === "Escape"');
  expect(host).toContain("navigationButton.current?.focus()");
  expect(host).toContain("setNavigationOpen(false); }, [destinationKey]");
  expect(host).not.toContain("window.location");
  expect(host).not.toContain("matchMedia");
  expect(host).not.toContain("key={navigationOpen}");
  const css = readFileSync("apps/web/src/index.css", "utf8");
  expect(css).toContain("@container community-shell (max-width: 900px)");
  expect(css).not.toContain("grid-template-columns: 56px minmax(0, 1fr)");
  expect(css).toContain("compact-navigation-open .product-shell-surface--community > :not(.community-nav) { display: none; }");
  expect(css).toContain("compact-context-open.has-context-panel > .community-context-panel { display: flex; }");
});
