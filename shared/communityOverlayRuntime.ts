export type CommunityOverlayMountedTool = {
  namespacedToolName: string;
  toolName: string;
  appName: string;
  description: string | null;
};

export type CommunityOverlaySkillInventory = {
  name: string;
  mentionToken: string;
  description: string | null;
};

export type CommunityOverlaySelectedSkill = CommunityOverlaySkillInventory & {
  instructionsMd: string;
};

export function buildMountedAppsPromptBlock(
  mountedTools: CommunityOverlayMountedTool[],
): string {
  if (mountedTools.length === 0) return "";
  return [
    "",
    "Community-mounted app tools are available for this active community lens.",
    "Use the provided structured tool definitions directly instead of relying on recalled tool names.",
  ].join("\n");
}

export function buildCommunitySkillsPromptBlock(
  attachedSkills: CommunityOverlaySkillInventory[],
): string {
  if (attachedSkills.length === 0) return "";
  const lines = [
    "",
    "Community skill packages are attached for this active community lens.",
    "A skill package is injected only when the user explicitly mentions it, like `$weekly-research`.",
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
  allowedToolNames: readonly string[];
  mountedTools: CommunityOverlayMountedTool[];
  attachedSkills: CommunityOverlaySkillInventory[];
  selectedSkills: CommunityOverlaySelectedSkill[];
}): {
  activeToolNames: string[];
  systemPromptSuffix: string;
} {
  return {
    activeToolNames: [
      ...params.allowedToolNames,
      ...params.mountedTools.map((tool) => tool.namespacedToolName),
    ],
    systemPromptSuffix: `${buildMountedAppsPromptBlock(
      params.mountedTools,
    )}${buildCommunitySkillsPromptBlock(
      params.attachedSkills,
    )}${buildSelectedSkillInstructionsPromptBlock(params.selectedSkills)}`,
  };
}
