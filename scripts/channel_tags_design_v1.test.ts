import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const design = { v1: true };
vi.doMock("../shared/designSystem", () => ({ isDesignV1Active: () => design.v1 }));
const { agentBadgeLabel, hostBadgeLabel } = await import("../apps/web/src/components/communityInteractionFeed");

test("design v1 tags the community's agent 'guide'; classic keeps 'Agent'", () => {
  design.v1 = true;
  expect(agentBadgeLabel("community_agent")).toBe("guide");
  expect(agentBadgeLabel("human")).toBeNull();
  design.v1 = false;
  expect(agentBadgeLabel("community_agent")).toBe("Agent");
});

test("design v1 tags only the owner's own posts 'host'", () => {
  design.v1 = true;
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: "u1" }, "u1")).toBe("host");
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: "u2" }, "u1")).toBeNull();
  // A post the agent made is never the host's, whoever it acted for.
  expect(hostBadgeLabel({ actor_type: "community_agent", actor_user_id: "u1" }, "u1")).toBeNull();
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: null }, null)).toBeNull();
  design.v1 = false;
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: "u1" }, "u1")).toBeNull();
});
