import {
  buildBoundedSkillInventoryPrompt,
  type BoundedSkillInventoryPromptReport,
} from "./runtimeSkillInventoryPrompt.ts";

export type CommunityOverlaySkillInventory = {
  name: string;
  mentionToken: string;
  description: string | null;
};

export type CommunityOverlaySelectedSkill = CommunityOverlaySkillInventory & {
  instructionsMd: string;
};

export function buildCommunitySkillsPromptBlock(
  attachedSkills: CommunityOverlaySkillInventory[],
  options?: {
    budgetChars?: number;
  },
): string {
  if (attachedSkills.length === 0) return "";
  return buildBoundedCommunitySkillsPrompt({
    attachedSkills,
    budgetChars: options?.budgetChars,
  }).text;
}

function buildBoundedCommunitySkillsPrompt(params: {
  attachedSkills: CommunityOverlaySkillInventory[];
  budgetChars?: number;
}) {
  return buildBoundedSkillInventoryPrompt({
    heading: "COMMUNITY_WORKFLOW_CONTEXT",
    introLines: [
      "These workflow skill packages are attached to the active community lens.",
      "Prefer these community workflows for community-relevant work, but personal skills and connected apps remain available when useful.",
      "If a community workflow and personal workflow overlap, prefer the community workflow for this lens.",
      "Full community skill instructions are injected only when the user explicitly mentions the skill under the current activation rules, like `$weekly-research`.",
    ],
    skills: params.attachedSkills,
    budgetChars: params.budgetChars,
  });
}

export function buildSelectedSkillInstructionsPromptBlock(
  selectedSkills: CommunityOverlaySelectedSkill[],
): string {
  if (selectedSkills.length === 0) return "";
  return [
    "",
    ...selectedSkills.map((skill) =>
      [
        `COMMUNITY_SKILL_PACKAGE: ${skill.name} ($${skill.mentionToken})`,
        skill.instructionsMd,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function buildCommunityOverlayRuntimeState(params: {
  attachedSkills: CommunityOverlaySkillInventory[];
  selectedSkills: CommunityOverlaySelectedSkill[];
  inventoryBudgetChars?: number;
}): {
  systemPromptSuffix: string;
  skillInventoryPromptReport: BoundedSkillInventoryPromptReport;
} {
  const skillInventoryPrompt = buildBoundedCommunitySkillsPrompt({
    attachedSkills: params.attachedSkills,
    budgetChars: params.inventoryBudgetChars,
  });
  return {
    systemPromptSuffix: `${skillInventoryPrompt.text}${buildSelectedSkillInstructionsPromptBlock(params.selectedSkills)}`,
    skillInventoryPromptReport: skillInventoryPrompt.report,
  };
}
