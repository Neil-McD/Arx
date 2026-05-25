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
): string {
  if (skills.length === 0) return "";
  const lines = [
    "",
    "PLATFORM_WORKFLOW_CONTEXT",
    "These built-in platform workflow skills are available in this community lens when your permissions allow them.",
    "They are platform defaults, not user-installed or community-attached skills, and they cannot be disabled from the workspace.",
    "Full platform skill instructions are injected only when the user explicitly mentions the skill under the current activation rules, like `$resources-architect`.",
  ];
  for (const skill of skills.slice(0, 12)) {
    lines.push(`- $${skill.mentionToken}: ${skill.description || skill.name}`);
  }
  return lines.join("\n");
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
}): {
  systemPromptSuffix: string;
} {
  return {
    systemPromptSuffix: `${buildPlatformSkillsPromptBlock(
      params.skills,
    )}${buildSelectedPlatformSkillInstructionsPromptBlock(
      params.selectedSkills,
    )}`,
  };
}
