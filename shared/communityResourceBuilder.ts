export function normalizeCommunityResourceBuilderTitle(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getCommunityResourceBuilderModulePageKey(args: {
  moduleName: string;
  title: string;
}): string {
  return `${normalizeCommunityResourceBuilderTitle(args.moduleName)}/${normalizeCommunityResourceBuilderTitle(args.title)}`;
}
