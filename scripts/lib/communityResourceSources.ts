import { readFileSync } from "node:fs";
import { join } from "node:path";

// Community resources live in several modules (convex/communityResources.ts
// registers the functions; the rest hold its helpers). Checks that read the
// resources source read all of them, in this order.
export const COMMUNITY_RESOURCE_SOURCE_FILES = [
  "convex/communityResources.ts",
  "convex/communityResourceConstants.ts",
  "convex/communityResourceShared.ts",
  "convex/communityResourceDirectory.ts",
  "convex/communityResourceChangesets.ts",
  "convex/communitySourceFetch.ts",
  "convex/communitySourceIngestion.ts",
] as const;

export function readCommunityResourceSources(root = process.cwd()): string {
  return COMMUNITY_RESOURCE_SOURCE_FILES.map((path) => readFileSync(join(root, path), "utf8")).join("\n");
}
