// The home page's product preview: every click moves one fixed script, the
// three screens share one state, and it only shows what Polynet does today.
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
const { ProductPreview, previewReducer, INITIAL_PREVIEW, PREVIEW_MEMBERS, GUIDE_REPLY, PREVIEW_COMMUNITY } =
  await import("../apps/web/src/components/polynetLanding/ProductPreview");

const run = (...actions: Parameters<typeof previewReducer>[1][]) => actions.reduce(previewReducer, INITIAL_PREVIEW);

test("a check-in is drafted, waits for the yes, and shows on Members once sent", () => {
  expect(run({ type: "send" }).joshCheckedIn).toBe(false); // nothing to send before Review
  const reviewing = run({ type: "review" });
  expect(reviewing.draftOpen).toBe(true);
  expect(run({ type: "review" }, { type: "skip" })).toMatchObject({ draftOpen: false, joshCheckedIn: false });
  const sent = run({ type: "review" }, { type: "send" });
  expect(sent).toMatchObject({ draftOpen: false, joshCheckedIn: true });
  // Sent from Home, it is already true on Members, and can't be sent twice.
  expect(previewReducer(sent, { type: "open", screen: "members" }).joshCheckedIn).toBe(true);
  expect(previewReducer(sent, { type: "review" }).draftOpen).toBe(false);
});

test("the guide answers only after a question, and its source opens only after the answer", () => {
  expect(run({ type: "answer" }).answered).toBe(false);
  expect(run({ type: "toggle_source" }).sourceOpen).toBe(false);
  const answered = run({ type: "open", screen: "general" }, { type: "ask" }, { type: "answer" }, { type: "toggle_source" });
  expect(answered).toMatchObject({ asked: true, answered: true, sourceOpen: true });
  expect(previewReducer(answered, { type: "open", screen: "home" }).sourceOpen).toBe(false);
});

test("a profile belongs to Members and closes on leaving it", () => {
  const open = run({ type: "open", screen: "members" }, { type: "profile", member: "josh" });
  expect(open.profile).toBe("josh");
  expect(previewReducer(open, { type: "open", screen: "home" }).profile).toBeNull();
  expect(PREVIEW_MEMBERS.filter((member) => member.status === "quiet").map((member) => member.key)).toEqual(["josh"]);
});

test("it starts on the morning brief, with real buttons and only true claims", () => {
  const html = renderToStaticMarkup(React.createElement(ProductPreview)).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  expect(html).toContain(PREVIEW_COMMUNITY);
  expect(html).toContain("Good morning.");
  expect(html).toContain(">Review</button>");
  for (const label of ["Home", "# general", "Members"]) expect(html).toContain(`>${label}</button>`);
  const words = `${html} ${GUIDE_REPLY}`;
  expect(words).not.toMatch(/RSVP|voice note|import|trained on|Coming soon|save you a spot/i);
});
