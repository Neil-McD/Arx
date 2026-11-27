import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { CommunityFounderBriefSection } = await import("../apps/web/src/components/CommunityFounderBriefSection");

test("the morning brief settings are always on for Chief of Staff with delivery time and email copy controls disabled until loaded", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityFounderBriefSection, {
    communityId: "c1", session: {}, ensureSession: async () => null,
  }));
  expect(html).toContain("Morning brief");
  expect(html).toContain("Morning brief time");
  expect(html).toContain("Always on for Chief of Staff");
  expect(html).toContain("Also send by email");
  expect(html).toMatch(/role="switch"[^>]*disabled/);
  expect(html).toMatch(/id="brief-hour"[^>]*disabled/);
});
