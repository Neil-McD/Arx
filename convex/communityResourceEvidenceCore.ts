import type {
  CommunityResourceLike,
  CommunityResourceModuleLike,
} from "./communityCore.ts";
import {
  communityResourceIsMemberVisiblePage,
  communityResourceModuleIsMemberLive,
} from "../shared/communityResourceVisibility.ts";
import { parseCommunityResourceDirectoryUri } from "../shared/communityResourceDirectory.ts";
import { parseCommunityResourceEvidenceRef } from "../shared/communityEvidenceContract.ts";

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

/**
 * Resolve only canonical, exact member-resource selectors. Readable paths and
 * legacy raw ids deliberately return null so compatibility lookup stays
 * separate from the semantic repository.
 */
export async function resolveExactCommunityResourceEvidenceSelector(args: {
  ctx: { db: any };
  communityId: any;
  ref: unknown;
}): Promise<ResolvedCommunityResourceEvidence | null> {
  const ref = String(args.ref ?? "").trim();
  const typedResourceId = parseCommunityResourceEvidenceRef(ref);
  let resourceId = typedResourceId;
  let expectedModuleId: string | null = null;

  if (!typedResourceId) {
    if (ref.startsWith("resource:")) {
      throw new Error("community_resource_evidence_ref_invalid");
    }
    const parsed = parseCommunityResourceDirectoryUri(ref);
    if (!parsed) {
      if (ref.startsWith("resources://")) {
        throw new Error("community_resource_directory_uri_invalid");
      }
      return null;
    }
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    if (!parsed.resourceId) {
      throw new Error("community_resource_directory_path_not_readable");
    }
    if (parsed.sourceInbox) {
      throw new Error("community_resource_directory_scope_mismatch");
    }
    resourceId = parsed.resourceId;
    expectedModuleId = parsed.moduleId;
  }

  const resolved = await resolveCommunityResourceEvidenceSource({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId,
  });
  if (!resolved) throw new Error("community_resource_not_found");
  if (
    expectedModuleId &&
    expectedModuleId !== normalizeIdValue(resolved.module._id)
  ) {
    throw new Error("community_resource_directory_module_mismatch");
  }
  return resolved;
}
