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
  expect(asks.map((item) => item.source)).toEqual(["wins", "lesson", "call"]);
  expect(asks.map((item) => item.target.kind)).toEqual(["channel", "lesson", "event"]);
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
  expect(html).toContain("An answer for every<br/>member, at any hour.");
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
  expect(page).toContain("Every good answer,<br/>kept and found again.");
  expect(page).not.toMatch(/Learned from courses and posts|Memory for each member/);
});



test("the Chief of Staff scene: the 8am brief and the unified Needs you deck, and only true claims", async () => {
  const { ChiefScene, morningBrief } = await import("../apps/web/src/components/polynetLanding/ChiefScene");
  const html = renderToStaticMarkup(React.createElement(ChiefScene)).replace(/&#x27;/g, "'");
  expect(html).toContain("8:00 am");
  expect(html).toContain("Two things need you.");
  expect(html).toContain("Needs you");
  expect(html).toContain("6,400 / 20,000");
  // A reply is only drafted once a question has waited a day.
  expect(html).toContain("no answer for 26 hours");
  expect(morningBrief(1)).toContain("One thing needs you.");
  expect(morningBrief(0)).toContain("That's everything for today.");
  const page = renderToStaticMarkup(React.createElement(ConversionLanding)).replace(/&#x27;/g, "'");
  expect(page).toContain("Catch members<br/>before they drift away.");
  // Nothing reaches people who already left; the buttons say Send, Edit, Skip.
  expect(page).not.toMatch(/Win-backs|Approve, edit or skip|Usage and limits/);
});

test("the members board section is the app's own board, and only claims what the AI really does", async () => {
  const { boardPulse } = await import("../apps/web/src/components/polynetLanding/BoardScene");
  const { sampleJourneyBoard } = await import("../apps/web/src/components/polynetLanding/boardSample");
  const board = sampleJourneyBoard(Date.UTC(2026, 10, 25, 12));
  // Dev and Jon have every checkpoint done; Rosa, Josh, Amir are stuck and Hana's payment is on hold.
  expect(boardPulse(board)).toBe("2 ready to move on · 4 need you · Jon: passed 100 members");
  const page = renderToStaticMarkup(React.createElement(ConversionLanding)).replace(/&#x27;/g, "'");
  expect(page).toContain("See who's getting<br/>real results.");
  expect(page).toContain("press it to move them on, or turn on Auto-move.");
  expect(page).not.toContain("on its own");
  // The AI suggests moves and follows up; it never moves anyone or judges progress by itself.
  expect(page).not.toMatch(/moves (members|them|people) (on )?(by itself|automatically|on its own)|judges? (their )?progress/i);
});
