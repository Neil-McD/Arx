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
): string {
  if (installedSkills.length === 0) return "";
  const lines = [
    "",
    "PERSONAL_WORKFLOW_CONTEXT",
    "Personal skill packages remain available across community lenses.",
    "When active community workflows match the request, prefer them; use personal skills as supporting or fallback workflows when useful.",
    "Full personal skill instructions are injected only when the user explicitly mentions the skill under the current activation rules, like `$weekly-research`.",
  ];
  for (const skill of installedSkills.slice(0, 12)) {
    lines.push(`- $${skill.mentionToken}: ${skill.description || skill.name}`);
  }
  return lines.join("\n");
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
}): {
  systemPromptSuffix: string;
} {
  return {
    systemPromptSuffix: `${buildPersonalSkillsPromptBlock(
      params.installedSkills,
    )}${buildSelectedPersonalSkillInstructionsPromptBlock(params.selectedSkills)}`,
  };
}
