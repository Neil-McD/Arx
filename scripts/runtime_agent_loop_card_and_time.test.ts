import { expect, test } from "vitest";
import { resolveRuntimeTimeZone } from "../convex/runtimeAgentLoop";
import { parseCommunityTurnLayerBody as parseCommunityCardBody } from "../shared/communityTurnLayers";

// A private Ask reads "now" in the asker's own timezone, and carries the
// community card read through the canonical door.
test("the asker's timezone is used when it's a real zone, otherwise UTC", () => {
  expect(resolveRuntimeTimeZone("America/New_York")).toBe("America/New_York");
  expect(resolveRuntimeTimeZone("Mars/Olympus")).toBe("UTC");
  expect(resolveRuntimeTimeZone("")).toBe("UTC");
  expect(resolveRuntimeTimeZone(null)).toBe("UTC");
});

test("the card is the read's body, bounded; anything else is no card", () => {
  expect(parseCommunityCardBody(JSON.stringify({ path: "/communities/a/community.md", body: "# A\n\n- Members: 4\n" }))).toBe("# A\n\n- Members: 4");
  expect(parseCommunityCardBody(JSON.stringify({ body: "x".repeat(9_000) }))?.length).toBe(6_000);
  expect(parseCommunityCardBody(JSON.stringify({ body: "  " }))).toBeNull();
  expect(parseCommunityCardBody("not json")).toBeNull();
});
