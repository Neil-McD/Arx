import {
  buildBoundedSkillInventoryPrompt,
  type BoundedSkillInventoryPromptReport,
} from "./runtimeSkillInventoryPrompt.ts";

export type PlatformOverlaySkillInventory = {
  name: string;
  mentionToken: string;
  description: string | null;
};

export type PlatformOverlaySelectedSkill = PlatformOverlaySkillInventory & {
  instructionsMd: string;
};

export function buildPlatformSkillsPromptBlock(
  skills: PlatformOverlaySkillInventory[],
  options?: {
    budgetChars?: number;
  },
): string {
  if (skills.length === 0) return "";
  return buildBoundedPlatformSkillsPrompt({
    skills,
    budgetChars: options?.budgetChars,
  }).text;
}

function buildBoundedPlatformSkillsPrompt(params: {
  skills: PlatformOverlaySkillInventory[];
  budgetChars?: number;
}) {
  return buildBoundedSkillInventoryPrompt({
    heading: "PLATFORM_WORKFLOW_CONTEXT",
    introLines: [
      "These built-in platform workflow skills are available in this community lens when your permissions allow them.",
      "They are platform defaults, not user-installed or community-attached skills, and they cannot be disabled from the workspace.",
      "Full platform skill instructions are injected automatically when the active role and community lens require them, or explicitly when the user mentions a skill.",
    ],
    skills: params.skills,
    budgetChars: params.budgetChars,
  });
}

export function buildSelectedPlatformSkillInstructionsPromptBlock(
  selectedSkills: PlatformOverlaySelectedSkill[],
): string {
  if (selectedSkills.length === 0) return "";
  return [
    "",
    ...selectedSkills.map((skill) =>
      [
        `PLATFORM_SKILL_PACKAGE: ${skill.name} ($${skill.mentionToken})`,
        skill.instructionsMd,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function buildPlatformSkillOverlayRuntimeState(params: {
  skills: PlatformOverlaySkillInventory[];
  selectedSkills: PlatformOverlaySelectedSkill[];
  inventoryBudgetChars?: number;
}): {
  systemPromptSuffix: string;
  skillInventoryPromptReport: BoundedSkillInventoryPromptReport;
} {
  const skillInventoryPrompt = buildBoundedPlatformSkillsPrompt({
    skills: params.skills,
    budgetChars: params.inventoryBudgetChars,
  });
  return {
    systemPromptSuffix: `${skillInventoryPrompt.text}${buildSelectedPlatformSkillInstructionsPromptBlock(
      params.selectedSkills,
    )}`,
    skillInventoryPromptReport: skillInventoryPrompt.report,
  };
}
