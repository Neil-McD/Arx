import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("desktop shell retains production resize rules without a second navigation mode", () => {
  const host = readFileSync("apps/web/src/components/WebShellChromeHost.tsx", "utf8");
  const css = readFileSync("apps/web/src/index.css", "utf8");
  expect(host).not.toContain("navigationOpen");
  expect(host).not.toContain("compact-community-toolbar");
  expect(host).toContain("<div className={rootClassName}>");
  expect(host).toContain("<div className={shellClassName}>");
  expect(host).toContain("<WebMobileCommunityShell");
  expect(css).not.toContain("@container community-shell");
  expect(css).not.toContain("compact-navigation-open");
  expect(css).toContain("grid-template-columns: clamp(168px, 20vw, 420px) minmax(0, 1fr)");
  const narrow = css.slice(css.indexOf("@media (max-width: 720px)"));
  expect(narrow).toContain("grid-template-columns: 56px minmax(0, 1fr)");
  expect(narrow).toContain(".community-nav .nav-item");
  const rosterCss = readFileSync("apps/web/src/styles/community-and-content.css", "utf8");
  expect(rosterCss).toContain("@media (max-width: 640px) {\n  .community-interaction-projection.has-channel-context");
  expect(rosterCss).toContain("@media (max-width: 640px) {\n  .community-channel-header .channel-people-trigger");
});
