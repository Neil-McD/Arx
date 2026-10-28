import { describe, expect, it } from "vitest";

import {
  resolveRuntimeInvocationSurfaceForThread,
} from "../shared/runtimeInvocationSurface";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";

const promptBudget = {
  maxToolSteps: 4,
  maxRepeatedIdenticalCalls: 1,
  maxConsecutiveFailures: 2,
  maxNoProgressSteps: 2,
};

describe("runtime invocation surfaces", () => {
  it("rejects retired and missing invocation surfaces", () => {
    expect(
      resolveRuntimeInvocationSurfaceForThread({
        requestedSurface: "workspace",
        threadKey: "workspace:legacy",
      }),
    ).toBeNull();
    expect(
      resolveRuntimeInvocationSurfaceForThread({
        requestedSurface: "community_funnel_builder",
        threadKey: "community-funnel:community-1",
      }),
    ).toBeNull();
    expect(
      resolveRuntimeInvocationSurfaceForThread({
        requestedSurface: null,
        threadKey: "member-agent:global:episode:1",
      }),
    ).toBeNull();
    expect(() =>
      buildPlatformHarnessRuntimePromptBundle({
        loopBudget: promptBudget,
        allowedToolNames: ["polynet_list"],
        harnessName: "chat_tools",
        runtimeTurnContext: buildRuntimeTurnContextPacket({}),
        invocationSurface: "workspace" as never,
      }),
    ).toThrow("invalid_runtime_invocation_surface");
  });
});
