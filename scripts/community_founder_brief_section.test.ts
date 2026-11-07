import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { CommunityFounderBriefSection } = await import("../apps/web/src/components/CommunityFounderBriefSection");

test("the daily brief switch says what it does and waits for the saved settings before it can be changed", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityFounderBriefSection, {
    communityId: "c1", session: {}, ensureSession: async () => null,
  }));
  expect(html).toContain("Daily brief");
  expect(html).toContain("Send me a daily brief");
  expect(html).toContain("it never messages your members");
  expect(html).toMatch(/type="checkbox"[^>]*disabled/);
});
