import type {
  CommunityResourceLike,
  CommunityResourceModuleLike,
} from "./communityCore.ts";
import {
  communityResourceIsMemberVisiblePage,
  communityResourceModuleIsMemberLive,
} from "../shared/communityResourceVisibility.ts";

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export type ResolvedCommunityResourceEvidence = {
  resource: CommunityResourceLike;
  module: CommunityResourceModuleLike;
};

/**
 * Resolve canonical member-visible resource truth without applying viewer
 * authority. The resource and its live module must both belong to the
 * requested community. Builder-only sources and draft modules fail closed.
 */
export async function resolveCommunityResourceEvidenceSource(args: {
  ctx: { db: any };
  communityId: any;
  resourceId: unknown;
}): Promise<ResolvedCommunityResourceEvidence | null> {
  const resourceId = args.ctx.db.normalizeId(
    "communityResources" as any,
    String(args.resourceId ?? "").trim(),
  );
  if (!resourceId) return null;
  const resource = (await args.ctx.db.get(resourceId)) as CommunityResourceLike | null;
  if (
    !resource ||
    normalizeIdValue(resource.communityId) !== normalizeIdValue(args.communityId)
  ) {
    return null;
  }
  const moduleId = resource.moduleId
    ? args.ctx.db.normalizeId(
        "communityResourceModules" as any,
        normalizeIdValue(resource.moduleId),
      )
    : null;
  if (!moduleId) return null;
  const module = (await args.ctx.db.get(moduleId)) as CommunityResourceModuleLike | null;
  if (
    !module ||
    normalizeIdValue(module.communityId) !== normalizeIdValue(args.communityId) ||
    normalizeIdValue(module.communityId) !== normalizeIdValue(resource.communityId) ||
    !communityResourceModuleIsMemberLive(module)
  ) {
    return null;
  }
  if (!communityResourceIsMemberVisiblePage(resource, new Set([normalizeIdValue(module._id)]))) {
    return null;
  }
  return { resource, module };
}
