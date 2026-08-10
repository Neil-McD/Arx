type ReadyCommunitySource = {
  id: string;
  ingestedAt: string | null;
};

type StartResourceBuild = (input: {
  communityId: string;
  prompt: string;
}) => Promise<boolean | undefined>;

function hashResourceBuildSourceSet(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildWebCommunityResourceBuildHandler(params: {
  activeCommunityId: string | null;
  canManageResources: boolean;
  startResourceBuild: StartResourceBuild;
  showToastMessage: (message: string) => void;
}) {
  return async (input: {
    communityId: string;
    readySources: ReadyCommunitySource[];
  }): Promise<boolean> => {
    const communityId = String(input.communityId ?? "").trim();
    if (
      !communityId ||
      communityId !== params.activeCommunityId ||
      !params.canManageResources ||
      input.readySources.length === 0
    ) {
      return false;
    }
    const architectSources = input.readySources
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 80);
    const idempotencyKey =
      `initial-community-resources:${communityId}:${hashResourceBuildSourceSet(
        architectSources
          .map((source) => `${source.id}:${source.ingestedAt ?? "ready"}`)
          .join("|"),
      )}`;
    const prompt = [
      "Build the first useful draft of this community's Resources from the ready source inbox items.",
      "List and inspect the active community builder/resources directory first, including its health summary and current categories, pages, and ready sources.",
      `Use these ready source record ids as the bounded source set: ${architectSources.map((source) => source.id).join(", ")}.`,
      "Create a small, clear draft category and page structure grounded only in those sources. Preserve source lineage, do not invent unsupported claims, do not delete or move source inbox records, and keep every created category and page in draft state.",
      "For every new source-backed page, put the ready source id directly in create_page.source_resource_id. Do not use edit, move, delete, or link_source_to_page operations in this initial draft; those operations require exact expected_updated_at values from a prior read.",
      `Stage exactly one changeset with polynet_write and use this exact idempotency_key: ${idempotencyKey}.`,
      "Do not apply or publish anything. Stop after staging so I can review the proposal in Polynet.",
    ].join("\n");
    const opened = await params.startResourceBuild({ communityId, prompt });
    if (!opened) {
      params.showToastMessage(
        "Finish the current agent message or resource build, then try again.",
      );
    }
    return opened === true;
  };
}
