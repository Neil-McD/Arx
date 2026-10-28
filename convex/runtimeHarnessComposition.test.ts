import { describe, expect, test } from "vitest";
import { composeResolvedRuntimeHarness } from "./runtimeHarnessComposition";
import { buildCommunityResourceRuntimeLaneState } from "../shared/communityResourceLane";
import { RESOURCES_ARCHITECT_INSTRUCTIONS_MD } from "../shared/communityResourcesArchitect";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";

const CANONICAL_TOOLS = ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"] as const;

function harnessText(lane: "none" | "member" | "builder"): string {
  return composeResolvedRuntimeHarness({ communityResourceLane: buildCommunityResourceRuntimeLaneState(lane) })
    .promptExtensions.map((section) => String(section.text ?? "")).join("");
}

describe("resources architect instructions", () => {
  test("only the builder lane gets them", () => {
    expect(harnessText("builder")).toContain("RESOURCES_ARCHITECT");
    expect(harnessText("builder")).toContain(RESOURCES_ARCHITECT_INSTRUCTIONS_MD);
    expect(harnessText("member")).toBe("");
    expect(harnessText("none")).toBe("");
  });

  test("a builder lane without the resource builder gets none", () => {
    const harness = composeResolvedRuntimeHarness({
      communityResourceLane: { lane: "builder", can_read_live_resources: true, can_use_resource_builder: false },
    });
    expect(harness.promptExtensions.map((section) => section.text).join("")).toBe("");
  });

  test("they are appended to the prompt and recorded as platform policy", () => {
    const harness = composeResolvedRuntimeHarness({
      communityResourceLane: buildCommunityResourceRuntimeLaneState("builder"),
    });
    const params = {
      loopBudget: { maxToolSteps: 2, maxRepeatedIdenticalCalls: 1, maxConsecutiveFailures: 1, maxNoProgressSteps: 1 },
      allowedToolNames: CANONICAL_TOOLS,
      harnessName: "chat_tools" as const,
      invocationSurface: "member_agent_dock" as const,
      runtimeTurnContext: buildRuntimeTurnContextPacket({}),
    };
    const base = buildPlatformHarnessRuntimePromptBundle(params);
    const bundle = buildPlatformHarnessRuntimePromptBundle({ ...params, promptExtensions: harness.promptExtensions });
    expect(bundle.text).toBe(base.text + harnessText("builder"));
    const manifest = buildRuntimeContextManifest({ promptSections: bundle.sections, allowedToolNames: [...CANONICAL_TOOLS] });
    expect(manifest.prompts.find((prompt) => prompt.id === "resources_architect")?.authority).toBe("platform_policy");
  });
});
