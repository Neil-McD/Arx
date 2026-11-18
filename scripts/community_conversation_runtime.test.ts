import { expect, test } from "vitest";
import { normalizeCommunityAgentSurfaceContext } from "../shared/communityAgentSurfaceContext";
import { resolveRuntimeInvocationSurfaceForThread, resolveRuntimeInvocationFundingPolicy } from "../shared/runtimeInvocationSurface";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";
import { buildCommunityConversationThreadKey } from "../shared/communityConversationIdentity";

test("client input cannot assert the server-derived conversation identity", () => {
  expect(normalizeCommunityAgentSurfaceContext({ version: 1, kind: "community", community_slug: "test-community", section: "chat", community_conversation: true })).not.toHaveProperty("community_conversation");
});

test("scoped conversations reuse community funding without personal-agent identity", () => {
  const surface = resolveRuntimeInvocationSurfaceForThread({ requestedSurface: "member_agent_dock", threadKey: buildCommunityConversationThreadKey("community-one", 1) });
  expect(surface).toBe("member_agent_dock");
  expect(resolveRuntimeInvocationFundingPolicy(surface!)).toBe("community_owner");
  // The guide there is this community's own, acting with the person's permissions only.
  const prompt = buildPlatformHarnessRuntimePromptBundle({ allowedToolNames: ["polynet_list"], invocationSurface: surface!, communityId: "community-one",
    communityName: "Community One", communitySlug: "community-one", runtimeTurnContext: buildRuntimeTurnContextPacket({}) }).text;
  expect(prompt).toContain("You are the guide for Community One: the AI built into this community.");
  expect(prompt).toContain("You act for this person, with their permissions and nobody else's.");
  expect(prompt).not.toMatch(/personal agent|You do not belong to any community/);
  expect(resolveRuntimeInvocationSurfaceForThread({ requestedSurface: "community_funnel_builder", threadKey: buildCommunityConversationThreadKey("community-one", 1) })).toBeNull();
});
