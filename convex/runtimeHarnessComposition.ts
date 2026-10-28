import type { CommunityResourceRuntimeLaneState } from "../shared/communityResourceLane.ts";
import { buildResourcesArchitectPromptBlock } from "../shared/communityResourcesArchitect.ts";
import type { RuntimePromptExtensionSection } from "../shared/runtimePrompt.ts";

export type ResolvedEffectiveHarness = {
  communityResourceLane: CommunityResourceRuntimeLaneState;
  promptExtensions: RuntimePromptExtensionSection[];
};

export function composeResolvedRuntimeHarness(args: {
  communityResourceLane: CommunityResourceRuntimeLaneState;
}): ResolvedEffectiveHarness {
  return {
    communityResourceLane: args.communityResourceLane,
    promptExtensions: [
      {
        id: "resources_architect",
        layer: "scoped",
        slot: "instruction",
        owner: "platform",
        authority: "platform_policy",
        source: "shared/communityResourcesArchitect.ts#buildResourcesArchitectPromptBlock",
        reason: "builder resource lane: resources architect instructions",
        text: buildResourcesArchitectPromptBlock(args.communityResourceLane),
      },
    ],
  };
}
