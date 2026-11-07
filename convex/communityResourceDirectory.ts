// How resources read to the agent, the MCP and builders: the semantic directory,
// resource reads, builder references, and the builder directory.
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceBodyChars,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  mapCommunityResourceModuleRow,
  normalizeIdValue,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceRole,
  normalizeResourceModuleStatus,
  normalizeResourceSourceIngestionKind,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  hydrateCommunityResourceBody,
} from "./communityResourceContent";
import {
  COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT,
  COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory";
import {
  buildCommunityResourceEvidenceRef,
  deriveCommunityResourceLineageEnvelope,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";
import {
  COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT,
  COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT,
  COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT,
  COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT,
  COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT,
  COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT,
  COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_MAX_LIMIT,
} from "./communityResourceConstants";
import {
  boundedReadLimit,
  boundedReadOffset,
  compareCommunityResources,
  mapCommunityResourceRowWithBody,
  normalizeDirectoryPathForMatch,
  resourceModuleIdentity,
} from "./communityResourceShared";
import {
  buildCommunityResourceBuilderHealthReportFromRows,
} from "./communityResourceChangesets";

export async function requireCommunityResourceDirectoryToolAccess(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<any> {
  const userId =
    args.userId ??
    await resolveUserIdForAuthenticatedRequest({
      ctx: args.ctx,
      authSubject: args.authSubject ?? null,
    });
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return userId;
}

async function listResourceDirectoryModules(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceModuleLike[]> {
  return (await ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT)) as CommunityResourceModuleLike[];
}

export async function listResourceDirectoryLiveModules(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceModuleLike[]> {
  const rows = await listResourceDirectoryModules(ctx, communityId);
  return rows.filter(communityResourceModuleIsLive);
}

export async function listResourceDirectoryLivePageResources(
  ctx: any,
  communityId: any,
  liveModuleIds: Set<string>,
): Promise<CommunityResourceLike[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[];
  return rows
    .filter((row) => communityResourceIsLiveModulePage(row, liveModuleIds))
    .sort(compareCommunityResources);
}

function normalizeCommunityResourceSemanticTraversalLimit(raw: unknown): number {
  const parsed = Math.floor(
    Number(raw ?? COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT),
  );
  if (!Number.isFinite(parsed)) {
    return COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT;
  }
  return Math.max(
    1,
    Math.min(COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_MAX_LIMIT, parsed),
  );
}

function normalizeCommunityResourceSemanticTraversalCursor(
  raw: unknown,
): string | null {
  const cursor = String(raw ?? "").trim();
  if (cursor.length > 2_048) {
    throw new Error("community_resource_semantic_cursor_invalid");
  }
  return cursor || null;
}

function mapCommunityResourceSemanticModuleEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike;
}) {
  const directory = buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(args.module._id),
    moduleName: args.module.name,
  });
  return {
    kind: "directory" as const,
    name: args.module.name,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
  };
}

function mapCommunityResourceSemanticPageEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike;
  resource: CommunityResourceLike;
}) {
  const resourceId = normalizeIdValue(args.resource._id);
  const directory = buildCommunityResourceDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(args.module._id),
    moduleName: args.module.name,
    resourceId,
    resourceTitle: args.resource.title,
    resourceRole: "page",
  });
  return {
    kind: "document" as const,
    title: args.resource.title,
    ref: buildCommunityResourceEvidenceRef(resourceId),
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
  };
}

/**
 * Cursorable canonical traversal for the `/resources/` semantic mount.
 * This owns no product state and deliberately excludes bodies, sources,
 * builder state, counts, and readable-path resolution.
 */
export async function listCommunityResourceSemanticDirectoryCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  moduleId?: any;
  cursor?: string | null;
  limit?: number | null;
}) {
  await requireCommunityResourceDirectoryToolAccess({
    ctx: args.ctx,
    userId: args.userId,
    communityId: args.communityId,
  });
  const cursor = normalizeCommunityResourceSemanticTraversalCursor(args.cursor);
  const limit = normalizeCommunityResourceSemanticTraversalLimit(args.limit);

  if (!args.moduleId) {
    const page = await args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community_sortOrder", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate({
        cursor,
        numItems: limit,
        maximumRowsRead: limit,
      });
    return {
      scope: "modules" as const,
      entries: (page.page as CommunityResourceModuleLike[])
        .filter(communityResourceModuleIsLive)
        .map((module) =>
          mapCommunityResourceSemanticModuleEntry({
            communityId: args.communityId,
            module,
          }),
        ),
      next_cursor: page.isDone ? null : page.continueCursor,
      truncated: !page.isDone,
    };
  }

  const module = (await args.ctx.db.get(
    args.moduleId as any,
  )) as CommunityResourceModuleLike | null;
  if (
    !module ||
    normalizeIdValue(module.communityId) !== normalizeIdValue(args.communityId) ||
    !communityResourceModuleIsLive(module)
  ) {
    throw new Error("community_resource_semantic_module_not_found");
  }
  const page = await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module_sortOrder", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("moduleId", args.moduleId),
    )
    .order("asc")
    .paginate({
      cursor,
      numItems: limit,
      maximumRowsRead: limit,
    });
  const liveModuleIds = new Set([normalizeIdValue(module._id)]);
  return {
    scope: "resources" as const,
    module: mapCommunityResourceSemanticModuleEntry({
      communityId: args.communityId,
      module,
    }),
    entries: (page.page as CommunityResourceLike[])
      .filter((resource) =>
        communityResourceIsLiveModulePage(resource, liveModuleIds),
      )
      .map((resource) =>
        mapCommunityResourceSemanticPageEntry({
          communityId: args.communityId,
          module,
          resource,
        }),
      ),
    next_cursor: page.isDone ? null : page.continueCursor,
    truncated: !page.isDone,
  };
}

export function buildModuleNameMap(modules: CommunityResourceModuleLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const module of modules) {
    out.set(normalizeIdValue(module._id), module.name);
  }
  return out;
}

function buildUnsortedModuleDirectoryFields(communityId: any) {
  return buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(communityId),
    moduleId: COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
    moduleName: "Unsorted",
  });
}

function buildResourceDirectoryFieldsForTool(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const moduleId = row.moduleId ? normalizeIdValue(row.moduleId) : null;
  return buildCommunityResourceDirectoryFields({
    communityId: normalizeIdValue(row.communityId),
    moduleId,
    moduleName: moduleId ? moduleNameMap.get(moduleId) ?? null : null,
    resourceId: normalizeIdValue(row._id),
    resourceTitle: row.title,
    resourceRole: normalizeResourceRole(row.role),
  });
}

function compactResourceSummary(row: CommunityResourceLike): string | null {
  const body = String(row.bodyMd ?? "").replace(/\s+/g, " ").trim();
  if (body) return body.slice(0, 220);
  if (communityResourceBodyChars(row) > 0) return "Readable resource content stored.";
  const url = String(row.url ?? "").trim();
  if (url) return `External resource: ${url.slice(0, 180)}`;
  if (row.fileKey) return "Uploaded resource without parsed text.";
  return null;
}

function mapCompactCommunityResourceBuilderListRow(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const moduleId = row.moduleId ? normalizeIdValue(row.moduleId) : null;
  const directory = buildResourceDirectoryFieldsForTool(row, moduleNameMap);
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    module_id: moduleId,
    module_name: moduleId ? moduleNameMap.get(moduleId) ?? null : null,
    directory_uri: directory.directory_uri,
    directory_path: directory.directory_path,
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    type: String(row.type ?? "").trim().toLowerCase() || "post",
    url: row.url ?? null,
    source_resource_id: row.sourceResourceId ? normalizeIdValue(row.sourceResourceId) : null,
    source_ingestion_status: normalizeResourceSourceIngestionStatus(row),
    source_ingestion_kind: normalizeResourceSourceIngestionKind(row),
    has_file: Boolean(row.fileKey),
    body_chars: communityResourceBodyChars(row),
    summary: compactResourceSummary(row),
    updated_at: toIsoString(row.updatedAt),
  };
}

function compactModuleSummary(module: CommunityResourceModuleLike | null): string | null {
  const description = String(module?.descriptionMd ?? "").replace(/\s+/g, " ").trim();
  return description ? description.slice(0, 220) : null;
}

export function buildResourceDirectoryEntry(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const directory = buildResourceDirectoryFieldsForTool(row, moduleNameMap);
  const resourceId = normalizeIdValue(row._id);
  return {
    type: "resource",
    ref: buildCommunityResourceEvidenceRef(resourceId),
    resource_id: resourceId,
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    url: row.url ?? null,
    has_file: Boolean(row.fileKey),
    summary: compactResourceSummary(row),
    lineage: deriveCommunityResourceLineageEnvelope({
      communityId: normalizeIdValue(row.communityId),
      resourceId,
      recordedByUserId: row.createdByUserId
        ? normalizeIdValue(row.createdByUserId)
        : null,
    }),
    updated_at: toIsoString(row.updatedAt),
  };
}

function buildModuleDirectoryEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  resources: CommunityResourceLike[];
}) {
  const moduleId = args.module
    ? normalizeIdValue(args.module._id)
    : COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT;
  const directory = args.module
    ? buildCommunityResourceModuleDirectoryFields({
        communityId: normalizeIdValue(args.communityId),
        moduleId,
        moduleName: args.module.name,
      })
    : buildUnsortedModuleDirectoryFields(args.communityId);
  const sourceCount = args.resources.filter((row) => normalizeResourceRole(row.role) === "source").length;
  const pageCount = args.resources.length - sourceCount;
  return {
    type: "directory",
    module_id: args.module ? moduleId : null,
    name: args.module ? args.module.name : "Unsorted",
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    resource_count: args.resources.length,
    page_count: pageCount,
    source_count: sourceCount,
    summary: compactModuleSummary(args.module),
    updated_at: args.module ? toIsoString(args.module.updatedAt) : null,
  };
}

function moduleResources(
  resources: CommunityResourceLike[],
  moduleId: string | null,
): CommunityResourceLike[] {
  const target = moduleId ?? "";
  return resources.filter((row) => resourceModuleIdentity(row.moduleId) === target);
}

function compareCommunityResourceModules(
  a: CommunityResourceModuleLike,
  b: CommunityResourceModuleLike,
): number {
  const aSortOrder = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
    ? a.sortOrder
    : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
    ? b.sortOrder
    : Number.MAX_SAFE_INTEGER;
  if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
  return b.createdAt - a.createdAt;
}

function compareSuggestedResourceReadTargets(
  a: CommunityResourceLike,
  b: CommunityResourceLike,
): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
  const aRole = normalizeResourceRole(a.role);
  const bRole = normalizeResourceRole(b.role);
  if (aRole !== bRole) return aRole === "page" ? -1 : 1;
  const aBodyReady = communityResourceBodyChars(a) > 0;
  const bBodyReady = communityResourceBodyChars(b) > 0;
  if (aBodyReady !== bBodyReady) return aBodyReady ? -1 : 1;
  return compareCommunityResources(a, b);
}

export function readContentUnavailableReason(row: CommunityResourceLike): string | null {
  if (communityResourceBodyChars(row) > 0) return null;
  if (row.fileKey && row.url) return "external_or_uploaded_content_not_parsed";
  if (row.fileKey) return "uploaded_file_not_parsed";
  if (row.url) return "external_url_metadata_only";
  return "resource_has_no_readable_content";
}

function resolveVisibleResourceById(args: {
  resources: CommunityResourceLike[];
  resourceId: string;
}): CommunityResourceLike | null {
  const resourceId = normalizeIdValue(args.resourceId);
  return args.resources.find((row) => normalizeIdValue(row._id) === resourceId) ?? null;
}

export async function resolveResourceByRef(args: {
  ctx: any;
  communityId: any;
  ref: string;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}): Promise<
  | { ok: true; resource: CommunityResourceLike }
  | {
      ok: false;
      reason_code: "ambiguous_resource_ref";
      message: string;
      matches: ReturnType<typeof buildResourceDirectoryEntry>[];
    }
> {
  const ref = String(args.ref ?? "").trim();
  if (!ref) throw new Error("community_resource_ref_required");

  const typedResourceId = parseCommunityResourceEvidenceRef(ref);
  if (typedResourceId) {
    const typed = resolveVisibleResourceById({
      resources: args.resources,
      resourceId: typedResourceId,
    });
    if (!typed) throw new Error("community_resource_not_found");
    return { ok: true, resource: typed };
  }

  const parsed = parseCommunityResourceDirectoryUri(ref);
  if (parsed?.resourceId) {
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    const byUri = resolveVisibleResourceById({
      resources: args.resources,
      resourceId: parsed.resourceId,
    });
    if (!byUri) throw new Error("community_resource_not_found");
    return { ok: true, resource: byUri };
  }

  const byId = resolveVisibleResourceById({
    resources: args.resources,
    resourceId: ref,
  });
  if (byId) return { ok: true, resource: byId };

  const normalizedPath = normalizeDirectoryPathForMatch(ref);
  const matches = args.resources.filter((row) => {
    const directory = buildResourceDirectoryFieldsForTool(row, args.moduleNameMap);
    return normalizeDirectoryPathForMatch(directory.directory_path) === normalizedPath;
  });
  if (matches.length > 1) {
    return {
      ok: false,
      reason_code: "ambiguous_resource_ref",
      message: "Multiple community resources share this readable path. Use directory_uri or resource_id instead.",
      matches: matches
        .slice(0, COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT)
        .map((row) => buildResourceDirectoryEntry(row, args.moduleNameMap)),
    };
  }
  const match = matches[0];
  if (!match) throw new Error("community_resource_not_found");
  return { ok: true, resource: match };
}

export async function buildCommunityResourceDirectoryReadPayload(args: {
  ctx: any;
  resource: CommunityResourceLike;
  moduleNameMap: Map<string, string>;
  offset: unknown;
  limit: unknown;
}) {
  const row = await hydrateCommunityResourceBody(args.ctx, args.resource) ?? args.resource;
  const body = String(row.bodyMd ?? "");
  const offset = boundedReadOffset(args.offset);
  const limit = boundedReadLimit(args.limit);
  const bodySlice = body ? body.slice(offset, offset + limit) : null;
  return {
    ok: true,
    kind: "community_resource_read",
    resource: buildResourceDirectoryEntry(row, args.moduleNameMap),
    source: null,
    content: {
      body_md: bodySlice,
      offset,
      limit,
      total_chars: body.length,
      truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
      unavailable_reason: readContentUnavailableReason(row),
    },
  };
}

type CommunityResourceBuilderRefMatch =
  | {
      target_type: "resource";
      id: string;
      resource_id: string;
      title: string;
      module_id: string | null;
      module_name: string | null;
      directory_path: string;
      directory_uri: string;
      resource_role: string;
      resource_status: string;
    }
  | {
      target_type: "module";
      id: string | null;
      module_id: string | null;
      name: string;
      directory_path: string;
      directory_uri: string;
      module_status: string | null;
      source_inbox?: boolean;
      resource_count: number;
      page_count: number;
      source_count: number;
    };

type ResolvedCommunityResourceBuilderRef =
  | {
      ok: true;
      target_type: "resource";
      resource: CommunityResourceLike;
    }
  | {
      ok: true;
      target_type: "module";
      module: CommunityResourceModuleLike | null;
      sourceInbox: boolean;
    }
  | {
      ok: false;
      reason_code: "ambiguous_resource_builder_ref";
      message: string;
      matches: CommunityResourceBuilderRefMatch[];
    }
  | {
      ok: false;
      reason_code: "resource_builder_ref_not_found";
      message: string;
      suggested_refs: CommunityResourceBuilderRefMatch[];
    };

function normalizeBuilderRefLookupText(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeBuilderRefSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function buildBuilderResourceRefMatch(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
): CommunityResourceBuilderRefMatch {
  const compact = mapCompactCommunityResourceBuilderListRow(row, moduleNameMap);
  return {
    target_type: "resource",
    id: compact.id,
    resource_id: compact.id,
    title: compact.title,
    module_id: compact.module_id,
    module_name: compact.module_name,
    directory_path: compact.directory_path,
    directory_uri: compact.directory_uri,
    resource_role: compact.resource_role,
    resource_status: compact.resource_status,
  };
}

function buildBuilderModuleRefMatch(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  resources: CommunityResourceLike[];
  sourceInbox?: boolean;
}): CommunityResourceBuilderRefMatch {
  const rows = moduleResources(
    args.resources,
    args.module ? normalizeIdValue(args.module._id) : null,
  );
  const resourceRows = args.sourceInbox
    ? rows.filter((row) => normalizeResourceRole(row.role) === "source")
    : rows;
  const entry = buildModuleDirectoryEntry({
    communityId: args.communityId,
    module: args.module,
    resources: resourceRows,
  });
  return {
    target_type: "module",
    id: entry.module_id,
    module_id: entry.module_id,
    name: args.sourceInbox ? `${entry.name} Source Inbox` : entry.name,
    directory_path: args.sourceInbox
      ? `${entry.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : entry.directory_path,
    directory_uri: args.sourceInbox
      ? `${entry.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : entry.directory_uri,
    module_status: args.module ? normalizeResourceModuleStatus(args.module.status) : null,
    ...(args.sourceInbox ? { source_inbox: true } : null),
    resource_count: resourceRows.length,
    page_count: resourceRows.filter((row) => normalizeResourceRole(row.role) !== "source").length,
    source_count: resourceRows.filter((row) => normalizeResourceRole(row.role) === "source").length,
  };
}

function uniqueBuilderRefMatches(matches: CommunityResourceBuilderRefMatch[]): CommunityResourceBuilderRefMatch[] {
  const seen = new Set<string>();
  const out: CommunityResourceBuilderRefMatch[] = [];
  for (const match of matches) {
    const key = `${match.target_type}:${match.id ?? "unsorted"}:${"source_inbox" in match && match.source_inbox ? "source" : "main"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function ambiguousBuilderRef(matches: CommunityResourceBuilderRefMatch[], ref: string): ResolvedCommunityResourceBuilderRef {
  return {
    ok: false,
    reason_code: "ambiguous_resource_builder_ref",
    message: `Multiple resource builder targets match "${ref}". Call community_resource_builder_read again with one exact directory_uri or id from matches.`,
    matches: uniqueBuilderRefMatches(matches).slice(0, COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT),
  };
}

function missingBuilderRef(args: {
  ref: string;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  communityId: any;
}): ResolvedCommunityResourceBuilderRef {
  const suggestedModules = args.modules
    .slice()
    .sort(compareCommunityResourceModules)
    .slice(0, 5)
    .map((module) =>
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
      }),
    );
  const suggestedResources = args.resources
    .slice()
    .sort(compareSuggestedResourceReadTargets)
    .slice(0, 7)
    .map((row) => buildBuilderResourceRefMatch(row, args.moduleNameMap));
  return {
    ok: false,
    reason_code: "resource_builder_ref_not_found",
    message: `No resource builder target matched "${args.ref}". Use a module name, page/source title, id, directory_uri, or readable path from the builder resource listing.`,
    suggested_refs: uniqueBuilderRefMatches([...suggestedModules, ...suggestedResources]),
  };
}

function resolveBuilderModuleById(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleId: string;
  sourceInbox?: boolean;
}): ResolvedCommunityResourceBuilderRef {
  if (args.moduleId === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    return {
      ok: true,
      target_type: "module",
      module: null,
      sourceInbox: Boolean(args.sourceInbox),
    };
  }
  const module = args.modules.find((candidate) => normalizeIdValue(candidate._id) === args.moduleId) ?? null;
  if (!module) {
    return missingBuilderRef({
      ref: args.moduleId,
      modules: args.modules,
      resources: args.resources,
      moduleNameMap: buildModuleNameMap(args.modules),
      communityId: args.communityId,
    });
  }
  return {
    ok: true,
    target_type: "module",
    module,
    sourceInbox: Boolean(args.sourceInbox),
  };
}

function resolveBuilderRefStage(args: {
  ref: string;
  matches: Array<
    | { target_type: "resource"; resource: CommunityResourceLike; match: CommunityResourceBuilderRefMatch }
    | {
        target_type: "module";
        module: CommunityResourceModuleLike | null;
        sourceInbox: boolean;
        match: CommunityResourceBuilderRefMatch;
      }
  >;
}): ResolvedCommunityResourceBuilderRef | null {
  if (args.matches.length === 0) return null;
  if (args.matches.length > 1) {
    return ambiguousBuilderRef(args.matches.map((match) => match.match), args.ref);
  }
  const match = args.matches[0];
  if (match.target_type === "resource") {
    return {
      ok: true,
      target_type: "resource",
      resource: match.resource,
    };
  }
  return {
    ok: true,
    target_type: "module",
    module: match.module,
    sourceInbox: match.sourceInbox,
  };
}

export function resolveCommunityResourceBuilderRef(args: {
  communityId: any;
  ref: string;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}): ResolvedCommunityResourceBuilderRef {
  const ref = String(args.ref ?? "").trim();
  if (!ref) throw new Error("community_resource_builder_read_ref_required");

  const resourceById = args.resources.find((row) => normalizeIdValue(row._id) === ref) ?? null;
  if (resourceById) {
    return {
      ok: true,
      target_type: "resource",
      resource: resourceById,
    };
  }

  const moduleById = resolveBuilderRefStage({
    ref,
    matches: args.modules
      .filter((module) => normalizeIdValue(module._id) === ref)
      .map((module) => ({
        target_type: "module" as const,
        module,
        sourceInbox: false,
        match: buildBuilderModuleRefMatch({
          communityId: args.communityId,
          module,
          resources: args.resources,
        }),
      })),
  });
  if (moduleById) return moduleById;
  if (ref === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    return {
      ok: true,
      target_type: "module",
      module: null,
      sourceInbox: false,
    };
  }

  const parsed = parseCommunityResourceDirectoryUri(ref);
  if (parsed) {
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    if (parsed.resourceId) {
      const resource = args.resources.find((row) => normalizeIdValue(row._id) === parsed.resourceId) ?? null;
      if (!resource) {
        return missingBuilderRef({
          ref,
          modules: args.modules,
          resources: args.resources,
          moduleNameMap: args.moduleNameMap,
          communityId: args.communityId,
        });
      }
      return {
        ok: true,
        target_type: "resource",
        resource,
      };
    }
    return resolveBuilderModuleById({
      communityId: args.communityId,
      modules: args.modules,
      resources: args.resources,
      moduleId: parsed.moduleId,
      sourceInbox: parsed.sourceInbox,
    });
  }

  const resourcePathMatches = args.resources
    .filter((row) => {
      const directory = buildResourceDirectoryFieldsForTool(row, args.moduleNameMap);
      return normalizeDirectoryPathForMatch(directory.directory_path) === normalizeDirectoryPathForMatch(ref);
    })
    .map((resource) => ({
      target_type: "resource" as const,
      resource,
      match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
    }));
  const resourcePath = resolveBuilderRefStage({
    ref,
    matches: resourcePathMatches,
  });
  if (resourcePath) return resourcePath;

  const modulePathCandidates: Array<{
    target_type: "module";
    module: CommunityResourceModuleLike | null;
    sourceInbox: boolean;
    match: CommunityResourceBuilderRefMatch;
  }> = [];
  for (const module of args.modules) {
    for (const match of [
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
      }),
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
        sourceInbox: true,
      }),
    ]) {
      modulePathCandidates.push({
        target_type: "module",
        module,
        sourceInbox: match.target_type === "module" && Boolean(match.source_inbox),
        match,
      });
    }
  }
  for (const match of [
    buildBuilderModuleRefMatch({
      communityId: args.communityId,
      module: null,
      resources: args.resources,
    }),
    buildBuilderModuleRefMatch({
      communityId: args.communityId,
      module: null,
      resources: args.resources,
      sourceInbox: true,
    }),
  ]) {
    modulePathCandidates.push({
      target_type: "module",
      module: null,
      sourceInbox: match.target_type === "module" && Boolean(match.source_inbox),
      match,
    });
  }
  const modulePathMatches = modulePathCandidates.filter((candidate) =>
    normalizeDirectoryPathForMatch(candidate.match.directory_path) === normalizeDirectoryPathForMatch(ref),
  );
  const modulePath = resolveBuilderRefStage({
    ref,
    matches: modulePathMatches,
  });
  if (modulePath) return modulePath;

  const refText = normalizeBuilderRefLookupText(ref);
  const moduleName = resolveBuilderRefStage({
    ref,
    matches: args.modules
      .filter((module) => normalizeBuilderRefLookupText(module.name) === refText)
      .map((module) => ({
        target_type: "module" as const,
        module,
        sourceInbox: false,
        match: buildBuilderModuleRefMatch({
          communityId: args.communityId,
          module,
          resources: args.resources,
        }),
      })),
  });
  if (moduleName) return moduleName;

  const resourceTitle = resolveBuilderRefStage({
    ref,
    matches: args.resources
      .filter((resource) => normalizeBuilderRefLookupText(resource.title) === refText)
      .map((resource) => ({
        target_type: "resource" as const,
        resource,
        match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
      })),
  });
  if (resourceTitle) return resourceTitle;

  const refSlug = normalizeBuilderRefSlug(ref);
  if (refSlug) {
    const moduleSlug = resolveBuilderRefStage({
      ref,
      matches: args.modules
        .filter((module) => normalizeBuilderRefSlug(module.name) === refSlug)
        .map((module) => ({
          target_type: "module" as const,
          module,
          sourceInbox: false,
          match: buildBuilderModuleRefMatch({
            communityId: args.communityId,
            module,
            resources: args.resources,
          }),
        })),
    });
    if (moduleSlug) return moduleSlug;

    const resourceSlug = resolveBuilderRefStage({
      ref,
      matches: args.resources
        .filter((resource) => normalizeBuilderRefSlug(resource.title) === refSlug)
        .map((resource) => ({
          target_type: "resource" as const,
          resource,
          match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
        })),
    });
    if (resourceSlug) return resourceSlug;
  }

  return missingBuilderRef({
    ref,
    modules: args.modules,
    resources: args.resources,
    moduleNameMap: args.moduleNameMap,
    communityId: args.communityId,
  });
}

async function buildCommunityResourceBuilderModuleReadPayload(args: {
  ctx: any;
  communityId: any;
  module: CommunityResourceModuleLike | null;
  sourceInbox: boolean;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}) {
  const moduleId = args.module ? normalizeIdValue(args.module._id) : null;
  const rows = moduleResources(args.resources, moduleId)
    .filter((row) => !args.sourceInbox || normalizeResourceRole(row.role) === "source")
    .sort(compareCommunityResources);
  const module = args.module
    ? await mapCommunityResourceModuleRow(args.ctx, args.module)
    : {
        id: null,
        community_id: normalizeIdValue(args.communityId),
        ...buildUnsortedModuleDirectoryFields(args.communityId),
        module_status: null,
        name: "Unsorted",
        description_md: "Existing knowledge items that are not assigned to a module.",
        banner_url: null,
        banner_storage_id: null,
        banner_focus_x: null,
        banner_focus_y: null,
        banner_zoom: null,
        sort_order: null,
        created_at: null,
        updated_at: null,
      };
  return {
    ok: true,
    kind: "community_resource_builder_read",
    target_type: "module",
    source_inbox: args.sourceInbox,
    module,
    resource_count: rows.length,
    resources: rows.map((row) => mapCompactCommunityResourceBuilderListRow(row, args.moduleNameMap)),
  };
}

export async function listCommunityResourceBuilderDirectoryCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  limit?: number;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const limit = Math.max(
    1,
    Math.min(
      COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT,
      Math.floor(args.limit ?? COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT),
    ),
  );
  const [modules, resources] = await Promise.all([
    args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceLike[]>,
  ]);
  const moduleNameMap = new Map(
    modules.map((module) => [normalizeIdValue(module._id), module.name]),
  );
  return {
    ok: true,
    kind: "community_resource_builder_directory",
    limit,
    total_resources: resources.length,
    truncated: resources.length > limit,
    health: buildCommunityResourceBuilderHealthReportFromRows({
      modules,
      resources,
      nowMs: Date.now(),
    }),
    modules: await Promise.all(
      modules
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
        .map((row) => mapCommunityResourceModuleRow(args.ctx, row)),
    ),
    resources: await Promise.all(
      resources
        .slice()
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCompactCommunityResourceBuilderListRow(row, moduleNameMap)),
    ),
  };
}

export async function readCommunityResourceBuilderResourceCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  ref?: string;
  resourceId?: any;
  moduleId?: any;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const ref = String(args.ref ?? args.resourceId ?? args.moduleId ?? "").trim();
  if (!ref) throw new Error("community_resource_builder_read_ref_required");

  const [modules, resources] = await Promise.all([
    args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceLike[]>,
  ]);
  const moduleNameMap = buildModuleNameMap(modules);
  const resolved = resolveCommunityResourceBuilderRef({
    communityId: args.communityId,
    ref,
    modules,
    resources,
    moduleNameMap,
  });
  if (!resolved.ok) {
    return {
      kind: "community_resource_builder_read",
      ...resolved,
    };
  }
  if (resolved.target_type === "resource") {
    return {
      ok: true,
      kind: "community_resource_builder_read",
      target_type: "resource",
      resource: await mapCommunityResourceRowWithBody(args.ctx, resolved.resource),
    };
  }
  return await buildCommunityResourceBuilderModuleReadPayload({
    ctx: args.ctx,
    communityId: args.communityId,
    module: resolved.module,
    sourceInbox: resolved.sourceInbox,
    resources,
    moduleNameMap,
  });
}

export function mapCommunityLaunchKnowledgeSourceRow(row: CommunityResourceLike) {
  return {
    id: normalizeIdValue(row._id),
    title: String(row.title ?? "").trim() || "Link source",
    source_ingestion_status: normalizeResourceSourceIngestionStatus(row),
    source_ingestion_kind: normalizeResourceSourceIngestionKind(row),
    source_ingestion_error: normalizeOptionalText(row.sourceIngestionError, 500) ?? null,
    source_external_url: normalizeOptionalUrl(row.url) ?? null,
    updated_at: toIsoString(row.updatedAt),
  };
}
