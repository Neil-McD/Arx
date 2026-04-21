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
    "Personal skill packages are installed in your baseline platform layer.",
    "A personal skill package is injected only when you explicitly mention it, like `$weekly-research`.",
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
