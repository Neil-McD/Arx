import { buildCommunityOverlayRuntimeState } from "../shared/communityOverlayRuntime.ts";
import type { CommunityResourceRuntimeLaneState } from "../shared/communityResourceLane.ts";
import { buildPersonalSkillOverlayRuntimeState } from "../shared/personalSkillOverlayRuntime.ts";
import { buildPlatformSkillOverlayRuntimeState } from "../shared/platformSkillOverlayRuntime.ts";
import { DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS } from "../shared/runtimeSkillInventoryPrompt.ts";
import type { RuntimePromptExtensionSection } from "../shared/runtimePrompt.ts";
import {
  mapCommunitySkillsToOverlayRuntime,
  mapPlatformSkillsToOverlayRuntime,
  mapSelectedCommunitySkillsToOverlayRuntime,
  mapSelectedPlatformSkillsToOverlayRuntime,
  mapSelectedUserPlatformSkillsToOverlayRuntime,
  mapUserPlatformSkillsToOverlayRuntime,
  type RuntimeCommunitySkillInventory,
  type RuntimePlatformSkillInventory,
  type RuntimeSelectedCommunitySkill,
  type RuntimeSelectedPlatformSkill,
  type RuntimeSelectedUserPlatformSkill,
  type RuntimeSkillResolution,
  type RuntimeUserPlatformSkillInventory,
} from "./runtimeHarnessShaping.ts";

export type ResolvedCommunityHarnessModule = {
  attachedSkills: RuntimeCommunitySkillInventory[];
  selectedSkills: RuntimeSelectedCommunitySkill[];
  systemPromptSuffix: string;
};

export type ResolvedPlatformHarnessModule = {
  skills: RuntimePlatformSkillInventory[];
  selectedSkills: RuntimeSelectedPlatformSkill[];
  systemPromptSuffix: string;
};

export type ResolvedEffectiveHarness = {
  communityResourceLane: CommunityResourceRuntimeLaneState;
  platformSkillInventory: RuntimePlatformSkillInventory[];
  selectedPlatformSkills: RuntimeSelectedPlatformSkill[];
  personalSkillInventory: RuntimeUserPlatformSkillInventory[];
  selectedPersonalSkills: RuntimeSelectedUserPlatformSkill[];
  activePlatformModule: ResolvedPlatformHarnessModule | null;
  activeCommunityModule: ResolvedCommunityHarnessModule | null;
  requestedSkillMentionTokens: string[];
  ambiguousSkillMentionTokens: string[];
  promptExtensions: RuntimePromptExtensionSection[];
};

export function buildAmbiguousSkillMentionsPromptBlock(
  mentionTokens: string[],
): string {
  if (mentionTokens.length === 0) return "";
  return [
    "",
    "Some explicitly mentioned skill tokens were ambiguous across active scopes, so no skill instructions were loaded for them this turn.",
    `Ambiguous tokens: ${mentionTokens.map((token) => `$${token}`).join(", ")}`,
    "If the user still wants one of these skills, ask them to clarify which scope they mean.",
  ].join("\n");
}

function subtractUsedSkillInventoryPromptBudget(
  remainingBudgetChars: number,
  usedChars: number,
): number {
  const safeRemaining =
    typeof remainingBudgetChars === "number" &&
    Number.isFinite(remainingBudgetChars)
      ? Math.max(0, Math.floor(remainingBudgetChars))
      : 0;
  const safeUsed =
    typeof usedChars === "number" && Number.isFinite(usedChars)
      ? Math.max(0, Math.floor(usedChars))
      : 0;
  return Math.max(0, safeRemaining - safeUsed);
}

export function composeResolvedRuntimeHarness(args: {
  skillResolution: RuntimeSkillResolution;
}): ResolvedEffectiveHarness {
  const platformSkillInventory = args.skillResolution.platform_skill_inventory;
  const selectedPlatformSkills = args.skillResolution.selected_platform_skills;
  const communityResourceLane = args.skillResolution.community_resource_lane;
  const personalSkillInventory =
    args.skillResolution.user_platform_skill_inventory;
  const selectedPersonalSkills =
    args.skillResolution.selected_user_platform_skills;
  const attachedCommunitySkills =
    args.skillResolution.community_skill_inventory;
  const selectedCommunitySkills =
    args.skillResolution.selected_community_skills;

  let remainingSkillInventoryPromptBudgetChars =
    DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS;

  const activePlatformModule =
    platformSkillInventory.length > 0 || selectedPlatformSkills.length > 0
      ? (() => {
          const overlayRuntimeState = buildPlatformSkillOverlayRuntimeState({
            skills: mapPlatformSkillsToOverlayRuntime(platformSkillInventory),
            selectedSkills:
              mapSelectedPlatformSkillsToOverlayRuntime(selectedPlatformSkills),
            inventoryBudgetChars: remainingSkillInventoryPromptBudgetChars,
          });
          remainingSkillInventoryPromptBudgetChars =
            subtractUsedSkillInventoryPromptBudget(
              remainingSkillInventoryPromptBudgetChars,
              overlayRuntimeState.skillInventoryPromptReport.usedChars,
            );
          return {
            skills: platformSkillInventory,
            selectedSkills: selectedPlatformSkills,
            systemPromptSuffix: overlayRuntimeState.systemPromptSuffix,
          } satisfies ResolvedPlatformHarnessModule;
        })()
      : null;

  const activeCommunityModule =
    attachedCommunitySkills.length > 0 || selectedCommunitySkills.length > 0
      ? (() => {
          const overlayRuntimeState = buildCommunityOverlayRuntimeState({
            attachedSkills:
              mapCommunitySkillsToOverlayRuntime(attachedCommunitySkills),
            selectedSkills: mapSelectedCommunitySkillsToOverlayRuntime(
              selectedCommunitySkills,
            ),
            inventoryBudgetChars: remainingSkillInventoryPromptBudgetChars,
          });
          remainingSkillInventoryPromptBudgetChars =
            subtractUsedSkillInventoryPromptBudget(
              remainingSkillInventoryPromptBudgetChars,
              overlayRuntimeState.skillInventoryPromptReport.usedChars,
            );
          return {
            attachedSkills: attachedCommunitySkills,
            selectedSkills: selectedCommunitySkills,
            systemPromptSuffix: overlayRuntimeState.systemPromptSuffix,
          } satisfies ResolvedCommunityHarnessModule;
        })()
      : null;

  const personalSkillRuntimeState = buildPersonalSkillOverlayRuntimeState({
    installedSkills:
      mapUserPlatformSkillsToOverlayRuntime(personalSkillInventory),
    selectedSkills: mapSelectedUserPlatformSkillsToOverlayRuntime(
      selectedPersonalSkills,
    ),
    inventoryBudgetChars: remainingSkillInventoryPromptBudgetChars,
  });
  const ambiguousSkillMentionsPrompt = buildAmbiguousSkillMentionsPromptBlock(
    args.skillResolution.ambiguous_mention_tokens,
  );
  const promptExtensions: RuntimePromptExtensionSection[] = [
    {
      id: "platform_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "platform",
      authority: "platform_policy",
      source: "shared/platformSkillOverlayRuntime.ts#buildPlatformSkillOverlayRuntimeState",
      reason: "resolved platform skill inventory and selected instructions",
      text: activePlatformModule?.systemPromptSuffix ?? "",
    },
    {
      id: "personal_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "user",
      authority: "user_preference",
      source: "shared/personalSkillOverlayRuntime.ts#buildPersonalSkillOverlayRuntimeState",
      reason: "resolved personal skill inventory and selected instructions",
      text: personalSkillRuntimeState.systemPromptSuffix,
    },
    {
      id: "ambiguous_skill_mentions",
      layer: "volatile",
      slot: "context",
      owner: "runtime",
      authority: "runtime_fact",
      source: "convex/runtimeHarnessComposition.ts#buildAmbiguousSkillMentionsPromptBlock",
      reason: "ambiguous explicit skill mentions rejected by runtime resolution",
      text: ambiguousSkillMentionsPrompt,
    },
    {
      id: "community_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "community",
      authority: "community_policy",
      source: "shared/communityOverlayRuntime.ts#buildCommunityOverlayRuntimeState",
      reason: "resolved community skill inventory and selected instructions",
      text: activeCommunityModule?.systemPromptSuffix ?? "",
    },
  ];
  return {
    communityResourceLane,
    platformSkillInventory,
    selectedPlatformSkills,
    personalSkillInventory,
    selectedPersonalSkills,
    activePlatformModule,
    activeCommunityModule,
    requestedSkillMentionTokens: args.skillResolution.requested_mention_tokens,
    ambiguousSkillMentionTokens: args.skillResolution.ambiguous_mention_tokens,
    promptExtensions,
  };
}
