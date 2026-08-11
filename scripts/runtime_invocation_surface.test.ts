import { describe, expect, it } from "vitest";

import {
  buildCommunityFunnelThreadKey,
  isCommunityFunnelThreadKeyForCommunity,
  resolveRuntimeInvocationFundingPolicy,
  resolveRuntimeInvocationSurfaceForThread,
  restrictToolNamesForInvocationSurface,
} from "../shared/runtimeInvocationSurface";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";

const promptBudget = {
  maxToolSteps: 4,
  maxRepeatedIdenticalCalls: 1,
  maxConsecutiveFailures: 2,
  maxNoProgressSteps: 2,
};

describe("community funnel runtime surface", () => {
  it("binds one canonical thread to one community", () => {
    const threadKey = buildCommunityFunnelThreadKey("community-1");
    expect(threadKey).toBe("community-funnel:community-1");
    expect(
      isCommunityFunnelThreadKeyForCommunity(threadKey, "community-1"),
    ).toBe(true);
    expect(
      isCommunityFunnelThreadKeyForCommunity(threadKey, "community-2"),
    ).toBe(false);
    expect(
      resolveRuntimeInvocationSurfaceForThread({
        requestedSurface: "workspace",
        threadKey,
      }),
    ).toBe("community_funnel_builder");
  });

  it("exposes only discovery, read, and canonical call tools", () => {
    expect(
      restrictToolNamesForInvocationSurface({
        invocationSurface: "community_funnel_builder",
        toolNames: [
          "polynet_list",
          "polynet_read",
          "polynet_search",
          "polynet_write",
          "polynet_call",
        ],
      }),
    ).toEqual(["polynet_list", "polynet_read", "polynet_call"]);
  });

  it("uses platform-managed inference without personal provider gates", () => {
    expect(
      resolveRuntimeInvocationFundingPolicy("community_funnel_builder"),
    ).toBe("platform_managed");
    expect(resolveRuntimeInvocationFundingPolicy("member_agent_dock")).toBe(
      "community_owner",
    );
    expect(resolveRuntimeInvocationFundingPolicy("workspace")).toBe(
      "generic_gate",
    );
  });

  it("injects the funnel contract into the assembled runtime prompt", () => {
    const bundle = buildPlatformHarnessRuntimePromptBundle({
      loopBudget: promptBudget,
      allowedToolNames: ["polynet_list", "polynet_read", "polynet_call"],
      harnessName: "chat_tools",
      runtimeTurnContext: buildRuntimeTurnContextPacket({}),
      invocationSurface: "community_funnel_builder",
      communityId: "community-1",
      communityName: "Proof Community",
      communitySlug: "proof-community",
    });

    expect(
      bundle.sections.find((section) => section.id === "invocation_surface"),
    ).toMatchObject({ rendered: true, layer: "scoped", owner: "runtime" });
    expect(bundle.text).toContain("bounded community funnel composer");
    expect(bundle.text).toContain("Never invent an audience, offer, price");
    expect(bundle.text).toContain("saved intro video immediately after the hero");
    expect(bundle.text).toContain(
      "Appearance always inherits the manager's canonical Polynet theme",
    );
    expect(bundle.text).toContain("Never publish, change pricing, change access policy");
    expect(bundle.sections.some((section) => section.id === "current_surface")).toBe(false);
    expect(
      bundle.sections.some((section) => section.id === "member_identity_context"),
    ).toBe(false);
  });

  it("does not add an invocation-surface section to a generic workspace prompt", () => {
    const bundle = buildPlatformHarnessRuntimePromptBundle({
      loopBudget: promptBudget,
      allowedToolNames: ["polynet_list"],
      harnessName: "chat_tools",
      runtimeTurnContext: buildRuntimeTurnContextPacket({}),
      invocationSurface: "workspace",
    });

    expect(
      bundle.sections.some((section) => section.id === "invocation_surface"),
    ).toBe(false);
  });
});
