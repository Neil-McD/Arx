export type CommunityResourceDirectoryStateRow = {
  id: string;
  community_id?: string | null;
  body_md: string | null;
  body_chars?: number | null;
  updated_at?: string;
};

export function mergeCommunityResourceDirectoryRows<
  ResourceT extends CommunityResourceDirectoryStateRow,
>(previousRows: ResourceT[], directoryRows: ResourceT[]): ResourceT[] {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  return directoryRows.map((row) => {
    const previous = previousById.get(row.id);
    if (
      previous &&
      previous.updated_at === row.updated_at &&
      (previous.body_md ?? "").trim() &&
      !(row.body_md ?? "").trim()
    ) {
      return { ...row, body_md: previous.body_md };
    }
    return row;
  });
}

export function mergeCommunityResourceContentRow<
  ResourceT extends CommunityResourceDirectoryStateRow,
>(args: {
  rows: ResourceT[];
  resource: ResourceT;
  communityId: string;
  expectedUpdatedAt: string | null;
}): { accepted: boolean; rows: ResourceT[] } {
  const current = args.rows.find((row) => row.id === args.resource.id);
  if (
    !current ||
    (args.resource.community_id && args.resource.community_id !== args.communityId) ||
    (args.expectedUpdatedAt && current.updated_at !== args.expectedUpdatedAt) ||
    (
      current.updated_at &&
      args.resource.updated_at &&
      args.resource.updated_at.localeCompare(current.updated_at) < 0
    ) ||
    (
      Number(args.resource.body_chars ?? 0) > 0 &&
      !(args.resource.body_md ?? "").trim()
    )
  ) {
    return { accepted: false, rows: args.rows };
  }
  return {
    accepted: true,
    rows: args.rows.map((row) => row.id === args.resource.id ? args.resource : row),
  };
}
