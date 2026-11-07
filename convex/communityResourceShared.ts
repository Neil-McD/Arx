// Small helpers and row types shared by the community resources modules.
import { internal } from "./_generated/api";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  mapCommunityResourceRow,
  normalizeIdValue,
  requireCommunityManager,
} from "./communityCore";
import {
  hydrateCommunityResourceBody,
} from "./communityResourceContent";
import type {
  CommunitySourceCrawlJobStatus,
  CommunitySourceCrawlerProvider,
  CommunitySourceUnitKind,
  CommunitySourceUnitStatus,
} from "../shared/communitySourceCrawler";
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

export type CommunitySourceCrawlJobLike = {
  _id?: unknown;
  communityId: unknown;
  createdByUserId: unknown;
  provider: CommunitySourceCrawlerProvider;
  rootUrl: string;
  status: CommunitySourceCrawlJobStatus;
  maxPages: number;
  maxDepth: number;
  pageCount: number;
  readyPageCount: number;
  failedPageCount: number;
  savedSourceCount: number;
  skippedSourceCount: number;
  sourceResourceIds?: unknown[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CommunitySourceUnitLike = {
  _id?: unknown;
  communityId: unknown;
  crawlJobId: unknown;
  sourceResourceId?: unknown;
  rootUrl: string;
  unitKey: string;
  unitKind: CommunitySourceUnitKind;
  title?: string | null;
  sourceUrl: string;
  parentUrl?: string | null;
  path?: string | null;
  order: number;
  depth: number;
  status: CommunitySourceUnitStatus;
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
  const module = (await args.ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
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

export async function requireCommunityManagerForAction(ctx: any, userId: any, communityId: any): Promise<void> {
  await ctx.runQuery((internal as any).communityResources.requireCommunitySourceManagerInternal, {
    userId,
    communityId,
  });
}
