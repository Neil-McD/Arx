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
): string {
  if (attachedSkills.length === 0) return "";
  const lines = [
    "",
    "COMMUNITY_WORKFLOW_CONTEXT",
    "These workflow skill packages are attached to the active community lens.",
    "Prefer these community workflows for community-relevant work, but personal skills and connected apps remain available when useful.",
    "If a community workflow and personal workflow overlap, prefer the community workflow for this lens.",
    "Full community skill instructions are injected only when the user explicitly mentions the skill under the current activation rules, like `$weekly-research`.",
  ];
  for (const skill of attachedSkills.slice(0, 12)) {
    lines.push(`- $${skill.mentionToken}: ${skill.description || skill.name}`);
  }
  return lines.join("\n");
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
}): {
  systemPromptSuffix: string;
} {
  return {
    systemPromptSuffix: `${buildCommunitySkillsPromptBlock(
      params.attachedSkills,
    )}${buildSelectedSkillInstructionsPromptBlock(params.selectedSkills)}`,
  };
}
