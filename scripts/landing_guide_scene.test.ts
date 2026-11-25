// The home page's guide section: built from the app's own parts, and only
// claiming what the scene shows and what Polynet does today.
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
vi.mock("../shared/cloudDiscoverGateway", () => ({ listCloudDiscoverCommunities: async () => [] }));
const { GuideScene, guideAsks } = await import("../apps/web/src/components/polynetLanding/GuideScene");
const { EVENTS } = await import("../apps/web/src/components/polynetLanding/RealAppPreview");
const { ConversionLanding } = await import("../apps/web/src/components/polynetLanding/ConversionLanding");

test("each question points to a different kind of place, and the chip names it exactly", () => {
  const now = Date.UTC(2026, 10, 25, 12);
  const asks = guideAsks(now);
  expect(asks.map((item) => item.source)).toEqual(["lesson", "wins", "call"]);
  expect(asks.map((item) => item.target.kind)).toEqual(["lesson", "channel", "event"]);
  // The chips are only ever lessons, courses, channels, pods and events (the app's
  // chips never cite posts or notes), and the event is the preview's own next call.
  expect(asks[2].target.name).toBe(EVENTS(now).next.title);
  for (const item of asks) expect(item.label).toBe(item.target.name);
});

test("the scene draws the guide chat with its questions and box", () => {
  const html = renderToStaticMarkup(React.createElement(GuideScene));
  expect(html).toContain("Ask your guide anything");
  for (const item of guideAsks(Date.now())) expect(html).toContain(item.question.replace("'", "&#x27;"));
});

test("the guide section leads with the pain, has no plan chip, and lists only what's true", () => {
  const html = renderToStaticMarkup(React.createElement(ConversionLanding));
  expect(html).toContain("Stop answering<br/>the same question twice.");
  expect(html).not.toContain("plan-tag");
  expect(html).not.toMatch(/Answers with their source|Follow-ups in active threads|cites? (its|their) sources?/i);
});

test("the brain graph: only the middle and each cluster are named, and each kind of memory is there", async () => {
  const { BrainScene, HUBS, DOTS, KINDS } = await import("../apps/web/src/components/polynetLanding/BrainScene");
  const html = renderToStaticMarkup(React.createElement(BrainScene)).replace(/&#x27;/g, "'");
  // It starts on the community, with the kinds of memory as a key.
  expect(html).toContain("What your community remembers");
  for (const kind of KINDS) expect(html).toContain(kind.name);
  // The only words on the map: each cluster and the middle.
  const names = [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  expect(names).toEqual([...HUBS.map((hub) => hub.name), "The Build Club"]);
  // Every learned note came from real posts; what a host taught has none.
  for (const dot of DOTS) if (dot.note && !dot.note.taught) expect(dot.note.sources.length).toBeGreaterThan(0);
  // The guide learns from posts; courses are where notes are filed.
  expect(html).not.toMatch(/learn(s|ed)? from (your )?courses/i);
  const page = renderToStaticMarkup(React.createElement(ConversionLanding)).replace(/&#x27;/g, "'");
  expect(page).toContain("Good answers get<br/>buried in old threads.");
  expect(page).not.toMatch(/Learned from courses and posts|Memory for each member/);
});


