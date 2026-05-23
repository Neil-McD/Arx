export const COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES = [
  "Start Here",
  "Methodology",
  "Playbooks",
] as const;

export const COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES = [
  {
    moduleName: "Start Here",
    title: "Welcome",
    bodyMd: [
      "## Welcome",
      "",
      "Draft the first orientation page for new members.",
      "",
      "## What This Community Helps With",
      "",
      "- Add the main promise.",
      "- Add who this is for.",
      "- Add what members should do first.",
    ].join("\n"),
  },
  {
    moduleName: "Start Here",
    title: "First Steps",
    bodyMd: [
      "## First Steps",
      "",
      "Draft the first actions a new member should take.",
      "",
      "## Recommended Path",
      "",
      "- Step 1",
      "- Step 2",
      "- Step 3",
    ].join("\n"),
  },
  {
    moduleName: "Start Here",
    title: "Quick Start Checklist",
    bodyMd: [
      "## Quick Start Checklist",
      "",
      "Draft the lightweight checklist a new member can follow.",
      "",
      "- [ ] Understand the community promise.",
      "- [ ] Read the first steps.",
      "- [ ] Ask the community agent for guidance.",
    ].join("\n"),
  },
] as const;

export const COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES =
  COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES.map((page) => page.title);

export function normalizeCommunityResourceBuilderTitle(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getCommunityResourceBuilderModulePageKey(args: {
  moduleName: string;
  title: string;
}): string {
  return `${normalizeCommunityResourceBuilderTitle(args.moduleName)}/${normalizeCommunityResourceBuilderTitle(args.title)}`;
}

export function getCommunityResourceBuilderScaffoldPageKey(args: {
  moduleName: string;
  title: string;
}): string {
  return getCommunityResourceBuilderModulePageKey(args);
}
