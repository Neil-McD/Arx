import {
  buildBoundedSkillInventoryPrompt,
  type BoundedSkillInventoryPromptReport,
} from "./runtimeSkillInventoryPrompt.ts";

export type PersonalOverlaySkillInventory = {
  name: string;
  mentionToken: string;
  description: string | null;
};

export type PersonalOverlaySelectedSkill = PersonalOverlaySkillInventory & {
  instructionsMd: string;
};

export function buildPersonalSkillsPromptBlock(
  installedSkills: PersonalOverlaySkillInventory[],
  options?: {
    budgetChars?: number;
  },
): string {
  if (installedSkills.length === 0) return "";
  return buildBoundedPersonalSkillsPrompt({
    installedSkills,
    budgetChars: options?.budgetChars,
  }).text;
}

function buildBoundedPersonalSkillsPrompt(params: {
  installedSkills: PersonalOverlaySkillInventory[];
  budgetChars?: number;
}) {
  return buildBoundedSkillInventoryPrompt({
    heading: "PERSONAL_WORKFLOW_CONTEXT",
    introLines: [
      "Personal skill packages remain available across community lenses.",
      "When active community workflows match the request, prefer them; use personal skills as supporting or fallback workflows when useful.",
      "Full personal skill instructions are injected only when the user explicitly mentions the skill under the current activation rules, like `$weekly-research`.",
    ],
    skills: params.installedSkills,
    budgetChars: params.budgetChars,
  });
}

export function buildSelectedPersonalSkillInstructionsPromptBlock(
  selectedSkills: PersonalOverlaySelectedSkill[],
): string {
  if (selectedSkills.length === 0) return "";
  return [
    "",
    ...selectedSkills.map((skill) =>
      [
        `PERSONAL_SKILL_PACKAGE: ${skill.name} ($${skill.mentionToken})`,
        skill.instructionsMd,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function buildPersonalSkillOverlayRuntimeState(params: {
  installedSkills: PersonalOverlaySkillInventory[];
  selectedSkills: PersonalOverlaySelectedSkill[];
  inventoryBudgetChars?: number;
}): {
  systemPromptSuffix: string;
  skillInventoryPromptReport: BoundedSkillInventoryPromptReport;
} {
  const skillInventoryPrompt = buildBoundedPersonalSkillsPrompt({
    installedSkills: params.installedSkills,
    budgetChars: params.inventoryBudgetChars,
  });
  return {
    systemPromptSuffix: `${skillInventoryPrompt.text}${buildSelectedPersonalSkillInstructionsPromptBlock(params.selectedSkills)}`,
    skillInventoryPromptReport: skillInventoryPrompt.report,
  };
}
