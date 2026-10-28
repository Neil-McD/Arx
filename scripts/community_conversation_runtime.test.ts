import { expect, test } from "vitest";
import { normalizeCommunityAgentSurfaceContext } from "../shared/communityAgentSurfaceContext";
import { buildRuntimeInvocationSurfacePrompt, resolveRuntimeInvocationSurfaceForThread, resolveRuntimeInvocationFundingPolicy } from "../shared/runtimeInvocationSurface";
import { buildCommunityConversationThreadKey } from "../shared/communityConversationIdentity";

test("client input cannot assert the server-derived conversation identity", () => {
  expect(normalizeCommunityAgentSurfaceContext({ version: 1, kind: "community", community_slug: "test-community", section: "chat", community_conversation: true })).not.toHaveProperty("community_conversation");
});

test("scoped conversations reuse community funding without personal-agent identity", () => {
  const surface = resolveRuntimeInvocationSurfaceForThread({ requestedSurface: "member_agent_dock", threadKey: buildCommunityConversationThreadKey("community-one", 1) });
  expect(surface).toBe("member_agent_dock");
  expect(resolveRuntimeInvocationFundingPolicy(surface!)).toBe("community_owner");
  const prompt = buildRuntimeInvocationSurfacePrompt(surface!);
  expect(prompt).toContain("this community's agent");
  expect(prompt).toContain("requesting member's current permissions");
  expect(prompt).not.toMatch(/personal agent|You do not belong to any community/);
  expect(resolveRuntimeInvocationSurfaceForThread({ requestedSurface: "community_funnel_builder", threadKey: buildCommunityConversationThreadKey("community-one", 1) })).toBeNull();
});
