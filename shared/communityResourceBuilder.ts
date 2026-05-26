export const COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES = [
  {
    moduleName: "Welcome",
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
