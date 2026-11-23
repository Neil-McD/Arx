import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { agentBadgeLabel, hostBadgeLabel } = await import("../apps/web/src/components/communityInteractionFeed");

test("the community's agent is tagged 'guide'", () => {
  expect(agentBadgeLabel("community_agent")).toBe("guide");
  expect(agentBadgeLabel("human")).toBeNull();
});

test("only the owner's own posts are tagged 'host'", () => {
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: "u1" }, "u1")).toBe("host");
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: "u2" }, "u1")).toBeNull();
  // A post the agent made is never the host's, whoever it acted for.
  expect(hostBadgeLabel({ actor_type: "community_agent", actor_user_id: "u1" }, "u1")).toBeNull();
  expect(hostBadgeLabel({ actor_type: "human", actor_user_id: null }, null)).toBeNull();
});
