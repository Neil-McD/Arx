import { expect, test } from "vitest";

import { communityPageStep } from "../apps/web/src/controllers/useWebCommunityRouteController";

// Choosing a page is a step in history; the screen follows the address.
const base = { communitySlug: "sunrise", sameCommunity: true, channelSlug: null };

test("a page you choose is a step to its address", () => {
  expect(communityPageStep({ ...base, communityTab: "resources", here: "/c/sunrise/events" }))
    .toEqual({ kind: "go", path: "/c/sunrise/knowledge" });
  expect(communityPageStep({ ...base, communityTab: "agent", here: "/c/sunrise/chat" }))
    .toEqual({ kind: "go", path: "/c/sunrise/home" });
});

test("the page you're on, exactly as it is, adds nothing (phone addresses too)", () => {
  expect(communityPageStep({ ...base, communityTab: "events", here: "/c/sunrise/events" })).toEqual({ kind: "here" });
  expect(communityPageStep({ ...base, communityTab: "events", here: "/m/c/sunrise/events" })).toEqual({ kind: "here" });
});

test("choosing Knowledge from inside a lesson goes to Knowledge's front, as a step", () => {
  expect(communityPageStep({ ...base, communityTab: "resources", here: "/c/sunrise/knowledge/course1/lesson2" }))
    .toEqual({ kind: "go", path: "/c/sunrise/knowledge" });
});

test("back to the channels keeps your channel in the same community, not in another", () => {
  expect(communityPageStep({ ...base, communityTab: "chat", channelSlug: "beta", here: "/c/sunrise/events" }))
    .toEqual({ kind: "go", path: "/c/sunrise/chat/beta" });
  expect(communityPageStep({ ...base, sameCommunity: false, communityTab: "chat", channelSlug: "beta", here: "/c/other/events" }))
    .toEqual({ kind: "go", path: "/c/sunrise/chat" });
});
