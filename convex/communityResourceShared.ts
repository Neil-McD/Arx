// Small helpers and row types shared by the community resources modules.
import { internal } from "./_generated/api";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  mapCommunityResourceRow,
  normalizeIdValue,
  normalizeResourceRole,
  requireCommunityManager,
} from "./communityCore";
import {
  hydrateCommunityResourceBody,
} from "./communityResourceContent";
import {
  COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS,
  COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS,
} from "./communityResourceConstants";

export async function mapCommunityResourceRowWithBody(
  ctx: any,
  row: CommunityResourceLike,
  userIdCache?: Map<string, string | null>,
  moduleNameCache?: Map<string, string | null>,
) {
  const hydrated = await hydrateCommunityResourceBody(ctx, row) ?? row;
  return await mapCommunityResourceRow(ctx, hydrated, userIdCache, moduleNameCache);
}

// The courses members can see: the published ones.
export function communityResourceLiveModuleIds(
  modules: CommunityResourceModuleLike[],
): Set<string> {
  return new Set(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => normalizeIdValue(module._id)),
  );
}

// What an agent reads about a lesson under builder/resources/ says whether
// members can see it, by the one rule members are shown by
// (shared/communityResourceVisibility.ts): its course is published and it has
// a title and content. A lesson's own status is not part of that rule (every
// lesson an agent makes is stored as "draft"), so a lesson's resource_status
// is left out here: read as visibility it told hosts a lesson members could
// already see was hidden. A source keeps its status (members never see one).
export function withMembersCanSee<T extends { resource_status?: unknown }>(
  entry: T,
  row: CommunityResourceLike,
  liveModuleIds: Set<string>,
): Omit<T, "resource_status"> & {
  resource_status?: T["resource_status"];
  members_can_see: boolean;
} {
  const { resource_status, ...rest } = entry;
  return {
    ...rest,
    ...(normalizeResourceRole(row.role) === "source" ? { resource_status } : {}),
    members_can_see: communityResourceIsLiveModulePage(row, liveModuleIds),
  };
}

// Source units: page evidence old crawls saved (nothing writes them now).
export type CommunitySourceUnitLike = {
  _id?: unknown;
  communityId: unknown;
  crawlJobId: unknown;
  sourceResourceId?: unknown;
  rootUrl: string;
  unitKey: string;
  unitKind: "page" | "virtual_section";
  title?: string | null;
  sourceUrl: string;
  parentUrl?: string | null;
  path?: string | null;
  order: number;
  depth: number;
  status: "ready" | "failed" | "skipped";
  bodyChars: number;
  bodyOriginalChars?: number;
  bodyHash: string;
  bodyTruncated?: boolean;
  captureMethod?: string | null;
  error?: string | null;
  seenCount: number;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunityResourceBuilderChangesetRow = {
  _id?: unknown;
  communityId: unknown;
  createdByUserId: unknown;
  idempotencyKey?: string;
  status: "staged" | "approved" | "applied" | "rejected" | "failed" | "expired";
  summary: string;
  operations: CommunityResourceBuilderChangesetOperation[];
  preflight: unknown;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  approvedByUserId?: unknown;
  rejectedAt?: number;
  rejectedByUserId?: unknown;
  appliedAt?: number;
  appliedByUserId?: unknown;
};

export type CommunityResourceBuilderChangesetOperation =
  | {
      op: "create_module";
      module_key?: string | null;
      name: string;
      description_md?: string | null;
      module_status?: "draft" | "live";
    }
  | {
      op: "edit_module";
      module_id: string;
      expected_updated_at: number;
      name?: string;
      description_md?: string | null;
      module_status?: "draft" | "live";
    }
  | {
      op: "create_page";
      module_id?: string | null;
      module_key?: string | null;
      title: string;
      body_md?: string | null;
      source_resource_id?: string | null;
      type?: string;
      url?: string | null;
      resource_status?: string;
      pinned?: boolean;
      lesson_links?: Array<{ title: string; url: string }>;
    }
  | {
      op: "edit_page";
      resource_id: string;
      expected_updated_at: number;
      module_id?: string | null;
      title?: string;
      body_md?: string | null;
      source_resource_id?: string | null;
      type?: string;
      url?: string | null;
      resource_status?: string;
      pinned?: boolean;
      lesson_links?: Array<{ title: string; url: string }>;
    }
  | {
      // The lessons of one course, in the order members follow them: every
      // lesson of that course, each once.
      op: "reorder_pages";
      module_id: string;
      resource_ids: string[];
    }
  | {
      // The courses, in the order members see them: every course, each once.
      op: "reorder_modules";
      module_ids: string[];
    }
  | {
      op: "move_resource";
      resource_id: string;
      expected_updated_at: number;
      module_id?: string | null;
    }
  | {
      op: "delete_page";
      resource_id: string;
      expected_updated_at: number;
    }
  | {
      op: "delete_category";
      module_id: string;
      expected_updated_at: number;
    }
  | {
      op: "link_source_to_page";
      page_resource_id: string;
      expected_updated_at: number;
      source_resource_id: string;
    };

export type CommunityResourceBuilderChangesetPreviewItem = {
  op: CommunityResourceBuilderChangesetOperation["op"];
  marker: "+" | "~" | ">" | "x";
  title: string;
  preview: string | null;
};

export function normalizeOptionalModuleId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

export function resourceModuleIdentity(raw: unknown): string {
  return normalizeOptionalModuleId(raw) ?? "";
}

export function compareCommunityResources(a: CommunityResourceLike, b: CommunityResourceLike): number {
  const aSortOrder = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : null;
  const bSortOrder = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : null;
  if (aSortOrder !== null || bSortOrder !== null) {
    if (aSortOrder !== bSortOrder) {
      return (aSortOrder ?? Number.MAX_SAFE_INTEGER) - (bSortOrder ?? Number.MAX_SAFE_INTEGER);
    }
  } else if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return Boolean(a.pinned) ? -1 : 1;
  }
  return b.createdAt - a.createdAt;
}

export async function requireValidResourceModule(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null;
}): Promise<any | undefined> {
  if (!args.moduleId) return undefined;
  const normalizedModuleId = args.ctx.db.normalizeId("communityResourceModules", args.moduleId);
  if (!normalizedModuleId) {
    throw new Error("community_resource_module_not_found");
  }
  const module = (await args.ctx.db.get(normalizedModuleId)) as CommunityResourceModuleLike | null;
  if (!module || String(module.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_module_not_found");
  }
  return module._id;
}

export async function requireResourceModuleForRole(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null;
  role: "page" | "source";
}): Promise<any | undefined> {
  const moduleId = await requireValidResourceModule(args);
  if (args.role === "page" && !moduleId) {
    throw new Error("community_resource_course_required");
  }
  return moduleId;
}

export async function canManageCommunityResources(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<boolean> {
  try {
    await requireCommunityManager(args);
    return true;
  } catch {
    return false;
  }
}

export async function getNextResourceSortOrder(args: {
  ctx: any;
  communityId: any;
  moduleId: any | null | undefined;
  excludeResourceId?: any;
}): Promise<number> {
  const rows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceLike[];
  const targetModuleIdentity = resourceModuleIdentity(args.moduleId);
  const excludeResourceId = args.excludeResourceId ? normalizeIdValue(args.excludeResourceId) : null;
  return (
    rows
      .filter((row) => {
        if (excludeResourceId && normalizeIdValue(row._id) === excludeResourceId) return false;
        return resourceModuleIdentity(row.moduleId) === targetModuleIdentity;
      })
      .reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000
  );
}

export function boundedReadOffset(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1_000_000, parsed));
}

export function boundedReadLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS, parsed));
}

function normalizeDirectoryToolPath(raw: unknown): string {
  const value = String(raw ?? "/").trim() || "/";
  const withRoot = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withRoot.replace(/\/+/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/$/, "") : "/";
}

export function normalizeDirectoryPathForMatch(raw: unknown): string {
  return normalizeDirectoryToolPath(raw).toLowerCase();
}

export async function resolveAuthenticatedActionUserId(ctx: any, authSubject?: string | null): Promise<any> {
  const actor = (await ctx.runQuery((internal as any).authActor.resolveAuthenticatedActorInternal, {
    authSubject: authSubject ?? undefined,
  })) as { dbUserId?: unknown } | null;
  if (!actor?.dbUserId) throw new Error("authenticated_user_required");
  return actor.dbUserId;
}
