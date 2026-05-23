import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsPublishedKnowledge,
  getCommunityAndMembership,
  mapCommunityResourceModuleRow,
  mapCommunityResourceRow,
  maybeDeleteStorageAsset,
  normalizeIdValue,
  normalizeBannerFocus,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceRole,
  normalizeResourceStatus,
  normalizeResourceType,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireResourceStatusForWrite,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import {
  COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT,
  COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory";
import {
  COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES,
  COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES,
  COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES,
  getCommunityResourceBuilderScaffoldPageKey,
} from "../shared/communityResourceBuilder";

const COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT = 50;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT = 100;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT = 5000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT = 500;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS = 12_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS = 20_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS = 420;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS = 240;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;

function normalizeOptionalModuleId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

function resourceModuleIdentity(raw: unknown): string {
  return normalizeOptionalModuleId(raw) ?? "";
}

function compareCommunityResources(a: CommunityResourceLike, b: CommunityResourceLike): number {
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

async function requireValidResourceModule(args: {
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

async function canManageCommunityResources(args: {
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

async function getNextResourceSortOrder(args: {
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

function normalizeDraftLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function truncateDraftLine(raw: string, maxLength: number): string {
  const value = normalizeDraftLine(raw);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function stripDraftBulletPrefix(raw: string): string {
  return normalizeDraftLine(raw.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/, ""));
}

function uniqueDraftLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const normalized = truncateDraftLine(line, 240);
    if (normalized.length < 12) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function extractDraftSummary(sourceBody: string): string {
  const paragraphs = sourceBody
    .split(/\n{2,}/)
    .map((paragraph) => normalizeDraftLine(paragraph.replace(/\r?\n/g, " ")))
    .filter((paragraph) => paragraph.length >= 24);
  const firstParagraph = paragraphs[0] ?? "";
  if (firstParagraph) return truncateDraftLine(stripDraftBulletPrefix(firstParagraph), 520);
  return "Review the source and replace this with the durable takeaway members should remember.";
}

function extractDraftKeyIdeas(sourceBody: string): string[] {
  const lines = sourceBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = uniqueDraftLines(
    lines
      .filter((line) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line))
      .map(stripDraftBulletPrefix),
  );
  if (bulletLines.length > 0) return bulletLines.slice(0, 5);

  const sentenceLines = uniqueDraftLines(
    normalizeDraftLine(sourceBody)
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map(stripDraftBulletPrefix) ?? [],
  );
  return sentenceLines.slice(0, 5);
}

function buildPageDraftBodyFromSource(source: CommunityResourceLike): string {
  const sourceBody = normalizeOptionalText(source.bodyMd, 10_000);
  const sourceUrl = normalizeOptionalUrl(source.url);
  const sourceFile = normalizeOptionalFileKey(source.fileKey);
  const sourceLine = sourceUrl
    ? `[Original source](${sourceUrl})`
    : sourceFile
      ? `Uploaded file: ${sourceFile}`
      : source.title;
  const summary = sourceBody
    ? extractDraftSummary(sourceBody)
    : "Review the source and replace this with the durable takeaway members should remember.";
  const keyIdeas = sourceBody ? extractDraftKeyIdeas(sourceBody) : [];
  const keyIdeaLines = keyIdeas.length > 0
    ? keyIdeas.map((line) => `- ${line}`)
    : [
      "- Add the main idea.",
      "- Add the most useful detail.",
      "- Remove anything that should stay as raw source material.",
    ];
  const memberUse = sourceBody
    ? "Use this page as the member-facing version of the source. Tighten the summary, remove private notes, and publish when the content is accurate."
    : "Review the source, add the member-facing takeaway, and publish only after the page is accurate.";
  const sourceNotes = sourceBody
    ? sourceBody
    : "Review the original source and replace this note with the durable context members should reuse.";

  return [
    "## Summary",
    "",
    summary,
    "",
    "## Key Ideas",
    "",
    ...keyIdeaLines,
    "",
    "## How Members Should Use This",
    "",
    memberUse,
    "",
    "## Source Notes",
    "",
    sourceNotes,
    "",
    "## Source",
    "",
    sourceLine,
  ].join("\n");
}

function boundedToolLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT, parsed));
}

function boundedReadOffset(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1_000_000, parsed));
}

function boundedReadLimit(raw: unknown): number {
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

function normalizeDirectoryPathForMatch(raw: unknown): string {
  return normalizeDirectoryToolPath(raw).toLowerCase();
}

function normalizeBuilderWriteKind(raw: unknown): "module" | "page" | "source" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "module" || value === "page" || value === "source") return value;
  throw new Error("community_resource_builder_kind_invalid");
}

function normalizeBuilderHealthTitle(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isBuilderScaffoldPageTitle(raw: unknown): boolean {
  return COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES.some(
    (title) => normalizeBuilderHealthTitle(title) === normalizeBuilderHealthTitle(raw),
  );
}

function isBuilderDefaultModuleName(raw: unknown): boolean {
  return COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES.some(
    (moduleName) => normalizeBuilderHealthTitle(moduleName) === normalizeBuilderHealthTitle(raw),
  );
}

function requireExpectedUpdatedAt(args: {
  expectedUpdatedAt: unknown;
  actualUpdatedAt: unknown;
}): void {
  const expected = Number(args.expectedUpdatedAt);
  const actual = Number(args.actualUpdatedAt);
  if (!Number.isFinite(expected)) {
    throw new Error("community_resource_expected_updated_at_required");
  }
  if (expected !== actual) {
    throw new Error("community_resource_edit_conflict");
  }
}

function normalizeBuilderResourceStatus(args: {
  raw: unknown;
  existingStatus?: unknown;
  publishing?: boolean;
  confirmPublish?: boolean;
  defaultStatus: "draft" | "review";
}): "draft" | "review" | "published" | "processing" | "failed" {
  const hasRaw = args.raw !== undefined;
  const next = hasRaw
    ? requireResourceStatusForWrite(args.raw)
    : args.existingStatus !== undefined
      ? normalizeResourceStatus(args.existingStatus)
      : args.defaultStatus;
  if (next === "published" && !args.confirmPublish) {
    throw new Error("community_resource_publish_confirmation_required");
  }
  if (args.publishing && next !== "published") {
    throw new Error("community_resource_publish_status_required");
  }
  return next;
}

function isCommunityResourceRow(row: unknown): row is CommunityResourceLike {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      (row as CommunityResourceLike).communityId !== undefined &&
      (row as CommunityResourceLike).createdByUserId !== undefined &&
      typeof (row as CommunityResourceLike).title === "string" &&
      typeof (row as CommunityResourceLike).pinned === "boolean" &&
      typeof (row as CommunityResourceLike).createdAt === "number" &&
      typeof (row as CommunityResourceLike).updatedAt === "number",
  );
}

async function requireCommunityResourceDirectoryToolAccess(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<void> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
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

async function listResourceDirectoryPublishedResources(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceLike[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[];
  return rows.filter(communityResourceIsPublishedKnowledge).sort(compareCommunityResources);
}

function buildModuleNameMap(modules: CommunityResourceModuleLike[]): Map<string, string> {
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
  const url = String(row.url ?? "").trim();
  if (url) return `External resource: ${url.slice(0, 180)}`;
  if (row.fileKey) return "Uploaded resource without parsed text.";
  return null;
}

function compactModuleSummary(module: CommunityResourceModuleLike | null): string | null {
  const description = String(module?.descriptionMd ?? "").replace(/\s+/g, " ").trim();
  return description ? description.slice(0, 220) : null;
}

function buildResourceDirectoryEntry(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const directory = buildResourceDirectoryFieldsForTool(row, moduleNameMap);
  return {
    type: "resource",
    resource_id: normalizeIdValue(row._id),
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    url: row.url ?? null,
    has_file: Boolean(row.fileKey),
    summary: compactResourceSummary(row),
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

function sourceInboxEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  sourceCount: number;
}) {
  const moduleDirectory = args.module
    ? buildCommunityResourceModuleDirectoryFields({
        communityId: normalizeIdValue(args.communityId),
        moduleId: normalizeIdValue(args.module._id),
        moduleName: args.module.name,
      })
    : buildUnsortedModuleDirectoryFields(args.communityId);
  return {
    type: "directory",
    name: "Source Inbox",
    path: `${moduleDirectory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    directory_path: `${moduleDirectory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    directory_uri: `${moduleDirectory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    resource_count: args.sourceCount,
    resource_role: "source",
    summary: "Published source materials for this module.",
    updated_at: null,
  };
}

function listRootResourceDirectory(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  limit: number;
}) {
  const entries = args.modules
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    })
    .map((module) =>
      buildModuleDirectoryEntry({
        communityId: args.communityId,
        module,
        resources: moduleResources(args.resources, normalizeIdValue(module._id)),
      }),
    );
  const unsortedResources = moduleResources(args.resources, null);
  if (unsortedResources.length > 0) {
    entries.push(
      buildModuleDirectoryEntry({
        communityId: args.communityId,
        module: null,
        resources: unsortedResources,
      }),
    );
  }
  return entries.slice(0, args.limit);
}

type ResolvedResourceDirectoryModuleTarget =
  | {
      ok: true;
      module: CommunityResourceModuleLike | null;
      moduleId: string | null;
      sourceInbox: boolean;
      path: string;
      directoryUri: string;
    }
  | {
      ok: false;
      reason_code: "ambiguous_resource_directory_path";
      message: string;
      matches: Array<{ module_id: string | null; name: string; directory_path: string; directory_uri: string }>;
    };

function resolveModuleTargetFromUri(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  ref: string;
}): ResolvedResourceDirectoryModuleTarget | null {
  const parsed = parseCommunityResourceDirectoryUri(args.ref);
  if (!parsed) return null;
  if (parsed.communityId !== normalizeIdValue(args.communityId)) {
    throw new Error("community_resource_directory_community_mismatch");
  }
  if (parsed.resourceId) {
    throw new Error("community_resource_directory_path_not_listable");
  }
  if (parsed.moduleId === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    const directory = buildUnsortedModuleDirectoryFields(args.communityId);
    return {
      ok: true,
      module: null,
      moduleId: null,
      sourceInbox: parsed.sourceInbox,
      path: parsed.sourceInbox
        ? `${directory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
        : directory.directory_path,
      directoryUri: parsed.sourceInbox
        ? `${directory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
        : directory.directory_uri,
    };
  }
  const module = args.modules.find((candidate) => normalizeIdValue(candidate._id) === parsed.moduleId) ?? null;
  if (!module) throw new Error("community_resource_directory_module_not_found");
  const directory = buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(module._id),
    moduleName: module.name,
  });
  return {
    ok: true,
    module,
    moduleId: normalizeIdValue(module._id),
    sourceInbox: parsed.sourceInbox,
    path: parsed.sourceInbox
      ? `${directory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : directory.directory_path,
    directoryUri: parsed.sourceInbox
      ? `${directory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : directory.directory_uri,
  };
}

function resolveModuleTargetFromPath(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  ref: string;
}): ResolvedResourceDirectoryModuleTarget {
  const normalizedPath = normalizeDirectoryToolPath(args.ref);
  const sourceSuffix = `/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`;
  const sourceInbox = normalizedPath.endsWith(sourceSuffix);
  const modulePath = sourceInbox
    ? normalizedPath.slice(0, -sourceSuffix.length) || "/"
    : normalizedPath;

  const candidates: Array<{
    module: CommunityResourceModuleLike | null;
    moduleId: string | null;
    name: string;
    directory_path: string;
    directory_uri: string;
  }> = [];
  const unsortedDirectory = buildUnsortedModuleDirectoryFields(args.communityId);
  if (normalizeDirectoryPathForMatch(modulePath) === normalizeDirectoryPathForMatch(unsortedDirectory.directory_path)) {
    candidates.push({
      module: null,
      moduleId: null,
      name: "Unsorted",
      directory_path: unsortedDirectory.directory_path,
      directory_uri: unsortedDirectory.directory_uri,
    });
  }
  for (const module of args.modules) {
    const directory = buildCommunityResourceModuleDirectoryFields({
      communityId: normalizeIdValue(args.communityId),
      moduleId: normalizeIdValue(module._id),
      moduleName: module.name,
    });
    if (normalizeDirectoryPathForMatch(modulePath) !== normalizeDirectoryPathForMatch(directory.directory_path)) {
      continue;
    }
    candidates.push({
      module,
      moduleId: normalizeIdValue(module._id),
      name: module.name,
      directory_path: directory.directory_path,
      directory_uri: directory.directory_uri,
    });
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      reason_code: "ambiguous_resource_directory_path",
      message: "Multiple community resource modules share this readable path. Use directory_uri instead.",
      matches: candidates.map((candidate) => ({
        module_id: candidate.moduleId,
        name: candidate.name,
        directory_path: candidate.directory_path,
        directory_uri: candidate.directory_uri,
      })),
    };
  }
  const candidate = candidates[0];
  if (!candidate) throw new Error("community_resource_directory_module_not_found");
  return {
    ok: true,
    module: candidate.module,
    moduleId: candidate.moduleId,
    sourceInbox,
    path: sourceInbox
      ? `${candidate.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : candidate.directory_path,
    directoryUri: sourceInbox
      ? `${candidate.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : candidate.directory_uri,
  };
}

function readContentUnavailableReason(row: CommunityResourceLike): string | null {
  const body = String(row.bodyMd ?? "").trim();
  if (body) return null;
  if (row.fileKey && row.url) return "external_or_uploaded_content_not_parsed";
  if (row.fileKey) return "uploaded_file_not_parsed";
  if (row.url) return "external_url_metadata_only";
  return "resource_has_no_readable_content";
}

async function resolveResourceById(args: {
  ctx: any;
  communityId: any;
  resourceId: string;
}): Promise<CommunityResourceLike | null> {
  let row: unknown;
  try {
    row = await args.ctx.db.get(args.resourceId as any);
  } catch {
    return null;
  }
  if (!isCommunityResourceRow(row)) return null;
  if (normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) return null;
  if (!communityResourceIsPublishedKnowledge(row)) return null;
  return row;
}

async function resolveResourceByRef(args: {
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

  const parsed = parseCommunityResourceDirectoryUri(ref);
  if (parsed?.resourceId) {
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    const byUri = await resolveResourceById({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: parsed.resourceId,
    });
    if (!byUri) throw new Error("community_resource_not_found");
    return { ok: true, resource: byUri };
  }

  const byId = await resolveResourceById({
    ctx: args.ctx,
    communityId: args.communityId,
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

async function buildSourceResourceMetadata(args: {
  ctx: any;
  communityId: any;
  sourceResourceId: any;
  moduleNameMap: Map<string, string>;
}) {
  const source = await resolveResourceById({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: normalizeIdValue(args.sourceResourceId),
  });
  if (!source) {
    return {
      source_resource_id: normalizeIdValue(args.sourceResourceId),
      available: false,
    };
  }
  return {
    source_resource_id: normalizeIdValue(source._id),
    available: true,
    ...buildResourceDirectoryEntry(source, args.moduleNameMap),
  };
}

function normalizeSearchQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function resourceSearchText(row: CommunityResourceLike): string {
  return [row.title, row.bodyMd ?? "", row.url ?? ""].join("\n").toLowerCase();
}

function resourceSearchScore(row: CommunityResourceLike, query: string, terms: string[]): number {
  const text = resourceSearchText(row);
  if (!terms.every((term) => text.includes(term))) return 0;
  const title = String(row.title ?? "").toLowerCase();
  const body = String(row.bodyMd ?? "").toLowerCase();
  let score = 1;
  if (text.includes(query)) score += 4;
  if (title.includes(query)) score += 6;
  for (const term of terms) {
    if (title.includes(term)) score += 2;
    if (body.includes(term)) score += 1;
  }
  if (row.pinned) score += 0.5;
  return score;
}

function excerptAroundQuery(row: CommunityResourceLike, query: string, terms: string[]): string | null {
  const source = String(row.bodyMd ?? row.url ?? row.title ?? "").replace(/\s+/g, " ").trim();
  if (!source) return null;
  const lower = source.toLowerCase();
  const needles = [query, ...terms].filter(Boolean);
  const index = needles
    .map((needle) => lower.indexOf(needle))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 120);
  const excerpt = source.slice(start, start + COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS).trim();
  const prefix = start > 0 ? "..." : "";
  const suffix = start + COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS < source.length ? "..." : "";
  return `${prefix}${excerpt}${suffix}`;
}

export const listCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const limit = boundedToolLimit(args.limit);
    const path = String(args.path ?? "/").trim() || "/";
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const resources = await listResourceDirectoryPublishedResources(ctx, args.communityId);
    const moduleNameMap = buildModuleNameMap(modules);

    if (normalizeDirectoryToolPath(path) === "/" && !parseCommunityResourceDirectoryUri(path)) {
      return {
        ok: true,
        kind: "community_resources_list",
        path: "/",
        entries: listRootResourceDirectory({
          communityId: args.communityId,
          modules,
          resources,
          limit,
        }),
      };
    }

    const target = resolveModuleTargetFromUri({
      communityId: args.communityId,
      modules,
      ref: path,
    }) ?? resolveModuleTargetFromPath({
      communityId: args.communityId,
      modules,
      ref: path,
    });
    if (!target.ok) {
      return {
        kind: "community_resources_list",
        ...target,
      };
    }

    const rows = moduleResources(resources, target.moduleId);
    const sourceRows = rows.filter((row) => normalizeResourceRole(row.role) === "source");
    const pageRows = rows.filter((row) => normalizeResourceRole(row.role) !== "source");
    const entries = target.sourceInbox
      ? sourceRows.slice(0, limit).map((row) => buildResourceDirectoryEntry(row, moduleNameMap))
      : [
          ...pageRows.slice(0, limit).map((row) => buildResourceDirectoryEntry(row, moduleNameMap)),
          ...(sourceRows.length > 0
            ? [
                sourceInboxEntry({
                  communityId: args.communityId,
                  module: target.module,
                  sourceCount: sourceRows.length,
                }),
              ]
            : []),
        ].slice(0, limit);

    return {
      ok: true,
      kind: "community_resources_list",
      path: target.path,
      directory_uri: target.directoryUri,
      source_inbox: target.sourceInbox,
      entries,
    };
  },
});

export const readCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const resources = await listResourceDirectoryPublishedResources(ctx, args.communityId);
    const moduleNameMap = buildModuleNameMap(modules);
    const resolved = await resolveResourceByRef({
      ctx,
      communityId: args.communityId,
      ref: args.ref,
      resources,
      moduleNameMap,
    });
    if (!resolved.ok) {
      return {
        kind: "community_resource_read",
        ...resolved,
      };
    }

    const row = resolved.resource;
    const body = String(row.bodyMd ?? "");
    const offset = boundedReadOffset(args.offset);
    const limit = boundedReadLimit(args.limit);
    const bodySlice = body ? body.slice(offset, offset + limit) : null;
    const source = row.sourceResourceId
      ? await buildSourceResourceMetadata({
          ctx,
          communityId: args.communityId,
          sourceResourceId: row.sourceResourceId,
          moduleNameMap,
        })
      : null;
    return {
      ok: true,
      kind: "community_resource_read",
      resource: buildResourceDirectoryEntry(row, moduleNameMap),
      source,
      content: {
        body_md: bodySlice,
        offset,
        limit,
        total_chars: body.length,
        truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
        unavailable_reason: readContentUnavailableReason(row),
      },
    };
  },
});

export const searchCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const query = String(args.query ?? "").trim().toLowerCase();
    if (!query) throw new Error("community_resource_search_query_required");
    const limit = boundedToolLimit(args.limit);
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const moduleNameMap = buildModuleNameMap(modules);
    const terms = normalizeSearchQueryTerms(query);
    const matches = (await listResourceDirectoryPublishedResources(ctx, args.communityId))
      .map((row) => ({
        row,
        score: resourceSearchScore(row, query, terms),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || b.row.updatedAt - a.row.updatedAt)
      .slice(0, limit)
      .map((match) => ({
        ...buildResourceDirectoryEntry(match.row, moduleNameMap),
        score: Number(match.score.toFixed(2)),
        snippet: excerptAroundQuery(match.row, query, terms),
      }));
    return {
      ok: true,
      kind: "community_resources_search",
      query: args.query,
      matches,
    };
  },
});

export const listCommunityResourceBuilderDirectory = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 1000)));
    const [modules, resources] = await Promise.all([
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
        .query("communityResources" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceLike[]>,
    ]);
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    return {
      ok: true,
      kind: "community_resource_builder_directory",
      modules: await Promise.all(
        modules
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
          .map((row) => mapCommunityResourceModuleRow(ctx, row)),
      ),
      resources: await Promise.all(
        resources
          .slice()
          .sort(compareCommunityResources)
          .slice(0, limit)
          .map((row) => mapCommunityResourceRow(ctx, row, userIdCache, moduleNameCache)),
      ),
    };
  },
});

export const readCommunityResourceBuilderResource = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    if (args.resourceId) {
      const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
      if (!resource || String(resource.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_not_found");
      }
      return {
        ok: true,
        kind: "community_resource_builder_read",
        resource: await mapCommunityResourceRow(ctx, resource),
      };
    }
    if (args.moduleId) {
      const module = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      return {
        ok: true,
        kind: "community_resource_builder_read",
        module: await mapCommunityResourceModuleRow(ctx, module),
      };
    }
    throw new Error("community_resource_builder_read_ref_required");
  },
});

export const writeCommunityResourceBuilderResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    kind: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const kind = normalizeBuilderWriteKind(args.kind);
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const nowMs = Date.now();

    if (kind === "module") {
      const rows = (await ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityResourceModuleLike[];
      const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
      const id = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        name: normalizeName(payload.name),
        descriptionMd: normalizeOptionalText(payload.description_md, 1200),
        sortOrder: nextSortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
      if (!created) throw new Error("community_resource_module_create_failed");
      return {
        ok: true,
        kind: "community_resource_builder_write",
        module: await mapCommunityResourceModuleRow(ctx, created),
      };
    }

    const role = kind === "source" ? "source" : "page";
    const status = normalizeBuilderResourceStatus({
      raw: payload.resource_status,
      confirmPublish: Boolean(payload.confirm_publish),
      defaultStatus: role === "source" ? "review" : "draft",
    });
    const moduleId = await requireValidResourceModule({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(payload.module_id),
    });
    const sourceResourceIdRaw = normalizeOptionalModuleId(payload.source_resource_id);
    const sourceResource = sourceResourceIdRaw
      ? ((await ctx.db.get(sourceResourceIdRaw as any)) as CommunityResourceLike | null)
      : null;
    if (sourceResourceIdRaw) {
      if (!sourceResource || String(sourceResource.communityId) !== String(args.communityId)) {
        throw new Error("community_source_resource_not_found");
      }
      if (normalizeResourceRole(sourceResource.role) !== "source") {
        throw new Error("community_source_resource_required");
      }
    }
    const sortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: args.communityId,
      moduleId,
    });
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: args.communityId,
      ...(moduleId ? { moduleId } : {}),
      createdByUserId: userId,
      type: normalizeResourceType(payload.type),
      role,
      status,
      ...(sourceResource ? { sourceResourceId: sourceResource._id } : {}),
      title: normalizeName(payload.title),
      bodyMd: normalizeOptionalText(payload.body_md, 20_000),
      url: normalizeOptionalUrl(payload.url),
      fileKey: normalizeOptionalFileKey(payload.file_key),
      pinned: Boolean(payload.pinned),
      sortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await upsertArchiveDocumentForResource(ctx, created);
    return {
      ok: true,
      kind: "community_resource_builder_write",
      resource: await mapCommunityResourceRow(ctx, created),
    };
  },
});

export const editCommunityResourceBuilderResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    expectedUpdatedAt: v.number(),
    confirmPublish: v.optional(v.boolean()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const nowMs = Date.now();

    if (args.moduleId) {
      const existing = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
      if (!existing || String(existing.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: args.expectedUpdatedAt,
        actualUpdatedAt: existing.updatedAt,
      });
      await ctx.db.patch(existing._id as any, {
        ...(Object.prototype.hasOwnProperty.call(payload, "name")
          ? { name: normalizeName(payload.name) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "description_md")
          ? { descriptionMd: normalizeOptionalText(payload.description_md, 1200) }
          : {}),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceModuleLike | null;
      if (!updated) throw new Error("community_resource_module_not_found");
      return {
        ok: true,
        kind: "community_resource_builder_edit",
        module: await mapCommunityResourceModuleRow(ctx, updated),
      };
    }

    if (!args.resourceId) throw new Error("community_resource_builder_edit_ref_required");
    const existing = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!existing || String(existing.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_not_found");
    }
    requireExpectedUpdatedAt({
      expectedUpdatedAt: args.expectedUpdatedAt,
      actualUpdatedAt: existing.updatedAt,
    });
    const nextStatus = Object.prototype.hasOwnProperty.call(payload, "resource_status")
      ? normalizeBuilderResourceStatus({
          raw: payload.resource_status,
          existingStatus: existing.status,
          confirmPublish: Boolean(args.confirmPublish),
          defaultStatus: normalizeResourceRole(existing.role) === "source" ? "review" : "draft",
        })
      : normalizeResourceStatus(existing.status);
    const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
      ? payload.module_id
      : existing.moduleId;
    const nextModuleId = await requireValidResourceModule({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
    });
    const sourceResourceIdRaw = Object.prototype.hasOwnProperty.call(payload, "source_resource_id")
      ? normalizeOptionalModuleId(payload.source_resource_id)
      : normalizeIdValue(existing.sourceResourceId ?? "");
    const sourceResource = sourceResourceIdRaw
      ? ((await ctx.db.get(sourceResourceIdRaw as any)) as CommunityResourceLike | null)
      : null;
    if (sourceResourceIdRaw) {
      if (!sourceResource || String(sourceResource.communityId) !== String(args.communityId)) {
        throw new Error("community_source_resource_not_found");
      }
      if (normalizeResourceRole(sourceResource.role) !== "source") {
        throw new Error("community_source_resource_required");
      }
    }
    const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
    const nextSortOrder = moduleChanged
      ? await getNextResourceSortOrder({
          ctx,
          communityId: args.communityId,
          moduleId: nextModuleId,
          excludeResourceId: existing._id,
        })
      : existing.sortOrder;

    await ctx.db.patch(existing._id as any, {
      ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
      ...(Object.prototype.hasOwnProperty.call(payload, "type") ? { type: normalizeResourceType(payload.type) } : {}),
      status: nextStatus,
      ...(sourceResource ? { sourceResourceId: sourceResource._id } : { sourceResourceId: undefined }),
      ...(Object.prototype.hasOwnProperty.call(payload, "title") ? { title: normalizeName(payload.title) } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "body_md")
        ? { bodyMd: normalizeOptionalText(payload.body_md, 20_000) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "url") ? { url: normalizeOptionalUrl(payload.url) } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "file_key")
        ? { fileKey: normalizeOptionalFileKey(payload.file_key) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "pinned") ? { pinned: Boolean(payload.pinned) } : {}),
      ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) throw new Error("community_resource_not_found");
    await upsertArchiveDocumentForResource(ctx, updated);
    return {
      ok: true,
      kind: "community_resource_builder_edit",
      resource: await mapCommunityResourceRow(ctx, updated),
    };
  },
});

export const getCommunityResourceBuilderHealth = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await buildCommunityResourceBuilderHealthReport({
      ctx,
      communityId: args.communityId,
      nowMs: Number.isFinite(args.nowMs) ? Number(args.nowMs) : Date.now(),
    });
  },
});
export async function buildCommunityResourceBuilderHealthReport(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}): Promise<any> {
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
  const pages = resources.filter((row) => normalizeResourceRole(row.role) === "page");
  const sources = resources.filter((row) => normalizeResourceRole(row.role) === "source");
  const existingModuleNames = new Set(modules.map((module) => normalizeBuilderHealthTitle(module.name)));
  const missingDefaultModules = COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES.filter(
    (moduleName) => !existingModuleNames.has(normalizeBuilderHealthTitle(moduleName)),
  );
  const moduleNameById = new Map(
    modules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]),
  );
  const existingScaffoldPageKeys = new Set(
    pages.map((page) =>
      getCommunityResourceBuilderScaffoldPageKey({
        moduleName: moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? "",
        title: page.title,
      }),
    ),
  );
  const missingScaffoldPages = COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES.filter(
    (page) =>
      !existingScaffoldPageKeys.has(
        getCommunityResourceBuilderScaffoldPageKey({
          moduleName: page.moduleName,
          title: page.title,
        }),
      ),
  ).map((page) => `${page.moduleName}/${page.title}`);
  const referencedSourceIds = new Set(
    pages
      .map((row) => normalizeIdValue(row.sourceResourceId ?? ""))
      .filter(Boolean),
  );
  const modulePageCounts = new Map<string, number>();
  for (const page of pages) {
    const moduleId = normalizeIdValue(page.moduleId ?? "");
    if (!moduleId) continue;
    modulePageCounts.set(moduleId, (modulePageCounts.get(moduleId) ?? 0) + 1);
  }
  const staleDraftCutoff = args.nowMs - COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS;
  const issues = {
    emptyModules: modules
      .filter(
        (module) =>
          (modulePageCounts.get(normalizeIdValue(module._id)) ?? 0) === 0 &&
          !isBuilderDefaultModuleName(module.name),
      )
      .map((module) => ({
        module_id: normalizeIdValue(module._id),
        name: module.name,
      })),
    sparsePages: pages
      .filter(
        (page) =>
          !isBuilderScaffoldPageTitle(page.title) &&
          String(page.bodyMd ?? "").trim().length < COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS,
      )
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
        body_chars: String(page.bodyMd ?? "").trim().length,
      })),
    pagesWithoutSourceLineage: pages
      .filter((page) => !normalizeIdValue(page.sourceResourceId ?? "") && !isBuilderScaffoldPageTitle(page.title))
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
      })),
    unreferencedSources: sources
      .filter((source) => !referencedSourceIds.has(normalizeIdValue(source._id)))
      .map((source) => ({
        resource_id: normalizeIdValue(source._id),
        title: source.title,
        status: normalizeResourceStatus(source.status),
      })),
    staleDrafts: pages
      .filter((page) => normalizeResourceStatus(page.status) === "draft" && page.updatedAt < staleDraftCutoff)
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        updated_at: toIsoString(page.updatedAt),
      })),
  };
  return {
    ok: true,
    kind: "community_resource_builder_health",
    checked_at: toIsoString(args.nowMs),
    summary: {
      modules: modules.length,
      resources: resources.length,
      pages: pages.length,
      sources: sources.length,
      published_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "published").length,
      draft_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "draft").length,
      source_inbox_items: sources.length,
      missing_default_modules: missingDefaultModules,
      missing_scaffold_pages: missingScaffoldPages,
      issue_count:
        issues.emptyModules.length +
        issues.sparsePages.length +
        issues.pagesWithoutSourceLineage.length +
        issues.unreferencedSources.length +
        issues.staleDrafts.length,
    },
    issues,
  };
}

export const ensureCommunityResourceWikiScaffold = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const nowMs = Date.now();
    const modules = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    const moduleByName = new Map(modules.map((module) => [normalizeBuilderHealthTitle(module.name), module]));
    const modulesCreated: string[] = [];
    const existingModules: string[] = [];
    let nextModuleSortOrder = modules.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;

    for (const moduleName of COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES) {
      const key = normalizeBuilderHealthTitle(moduleName);
      if (moduleByName.has(key)) {
        existingModules.push(moduleName);
        continue;
      }
      const id = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        name: moduleName,
        descriptionMd: null,
        sortOrder: nextModuleSortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      nextModuleSortOrder += 1000;
      const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
      if (!created) throw new Error("community_resource_module_create_failed");
      moduleByName.set(key, created);
      modulesCreated.push(moduleName);
    }

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const pagesByModuleAndTitle = new Set(
      resources
        .filter((row) => normalizeResourceRole(row.role) === "page")
        .map((row) => `${normalizeIdValue(row.moduleId ?? "")}:${normalizeBuilderHealthTitle(row.title)}`),
    );
    const pagesCreated: string[] = [];
    const existingPages: string[] = [];

    for (const page of COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES) {
      const module = moduleByName.get(normalizeBuilderHealthTitle(page.moduleName));
      if (!module) throw new Error("community_resource_scaffold_module_missing");
      const pageKey = `${normalizeIdValue(module._id)}:${normalizeBuilderHealthTitle(page.title)}`;
      if (pagesByModuleAndTitle.has(pageKey)) {
        existingPages.push(`${page.moduleName}/${page.title}`);
        continue;
      }
      const sortOrder = await getNextResourceSortOrder({
        ctx,
        communityId: args.communityId,
        moduleId: module._id,
      });
      const id = await ctx.db.insert("communityResources" as any, {
        communityId: args.communityId,
        moduleId: module._id,
        createdByUserId: userId,
        type: "post",
        role: "page",
        status: "draft",
        title: page.title,
        bodyMd: normalizeOptionalText(page.bodyMd, 20_000),
        pinned: false,
        sortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
      if (!created) throw new Error("community_resource_create_failed");
      await upsertArchiveDocumentForResource(ctx, created);
      pagesByModuleAndTitle.add(pageKey);
      pagesCreated.push(`${page.moduleName}/${page.title}`);
    }

    return {
      ok: true,
      kind: "community_resource_wiki_scaffold",
      summary: {
        modules_created: modulesCreated,
        modules_existing: existingModules,
        pages_created: pagesCreated,
        pages_existing: existingPages,
      },
      health: await buildCommunityResourceBuilderHealthReport({
        ctx,
        communityId: args.communityId,
        nowMs: Date.now(),
      }),
    };
  },
});

export const listCommunityResourceModules = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return b.createdAt - a.createdAt;
        })
        .slice(0, limit)
        .map((row) => mapCommunityResourceModuleRow(ctx, row)),
    );
  },
});

export const saveCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const moduleId = String(args.moduleId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || moduleId.length > 0;

    if (isPatch) {
      if (!moduleId) throw new Error("community_resource_module_id_required");
      const existing = (await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null;
      if (!existing) throw new Error("community_resource_module_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextNameRaw = Object.prototype.hasOwnProperty.call(payload, "name") ? payload.name : existing.name;
      const nextDescriptionRaw = Object.prototype.hasOwnProperty.call(payload, "description_md")
        ? payload.description_md
        : existing.descriptionMd;
      const nextBannerUrlRaw = Object.prototype.hasOwnProperty.call(payload, "banner_url")
        ? payload.banner_url
        : existing.bannerUrl;
      const nextBannerStorageId = Object.prototype.hasOwnProperty.call(payload, "banner_storage_id")
        ? (payload.banner_storage_id ?? undefined)
        : existing.bannerStorageId;
      const previousBannerStorageId = existing.bannerStorageId;
      await ctx.db.patch(existing._id as any, {
        name: normalizeName(nextNameRaw),
        descriptionMd: normalizeOptionalText(nextDescriptionRaw, 1200),
        bannerUrl: nextBannerStorageId ? undefined : normalizeOptionalUrl(nextBannerUrlRaw),
        bannerStorageId: nextBannerStorageId,
        bannerFocusX: normalizeBannerFocus(payload.banner_focus_x ?? existing.bannerFocusX),
        bannerFocusY: normalizeBannerFocus(payload.banner_focus_y ?? existing.bannerFocusY),
        bannerZoom: normalizeBannerZoom(payload.banner_zoom ?? existing.bannerZoom),
        updatedAt: nowMs,
      });
      if (previousBannerStorageId && String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")) {
        await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
      }
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceModuleLike | null;
      if (!updated) throw new Error("community_resource_module_not_found");
      return await mapCommunityResourceModuleRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityManager({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityResourceModuleLike[];
    const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
    const bannerStorageId = payload.banner_storage_id ?? undefined;
    const id = await ctx.db.insert("communityResourceModules" as any, {
      communityId: community._id,
      createdByUserId: args.userId,
      name: normalizeName(payload.name),
      descriptionMd: normalizeOptionalText(payload.description_md, 1200),
      bannerUrl: bannerStorageId ? undefined : normalizeOptionalUrl(payload.banner_url),
      bannerStorageId,
      bannerFocusX: normalizeBannerFocus(payload.banner_focus_x),
      bannerFocusY: normalizeBannerFocus(payload.banner_focus_y),
      bannerZoom: normalizeBannerZoom(payload.banner_zoom),
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
    if (!created) throw new Error("community_resource_module_create_failed");
    return await mapCommunityResourceModuleRow(ctx, created);
  },
});

export const reorderCommunityResourceModules = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleIds: v.array(v.id("communityResourceModules")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    const existingIds = new Set(rows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.moduleIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_module_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_module_order_stale");
    }
    for (const moduleId of requestedIds) {
      if (!existingIds.has(moduleId)) {
        throw new Error("community_resource_module_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((moduleId, index) =>
        ctx.db.patch(moduleId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
  },
});

export const deleteCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const module = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
    if (!module) return { ok: true, movedResources: 0 };

    await requireCommunityManager({
      ctx,
      communityId: module.communityId,
      userId: args.userId,
    });

    const nowMs = Date.now();
    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", module.communityId).eq("moduleId", module._id),
      )
      .collect()) as CommunityResourceLike[];

    const movedResources = resources.slice().sort(compareCommunityResources);
    const nextLegacySortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: module.communityId,
      moduleId: null,
    });

    await Promise.all(
      movedResources.map(async (resource, index) => {
        await ctx.db.patch(resource._id as any, {
          moduleId: undefined,
          sortOrder: nextLegacySortOrder + index * 1000,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(resource._id as any)) as CommunityResourceLike | null;
        if (updated) await upsertArchiveDocumentForResource(ctx, updated);
      }),
    );

    if (module.bannerStorageId) {
      await maybeDeleteStorageAsset(ctx, module.bannerStorageId);
    }
    await ctx.db.delete(module._id as any);
    return { ok: true, movedResources: resources.length };
  },
});

export const listCommunityResources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const canManageResources = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .filter((row) => canManageResources || communityResourceIsPublishedKnowledge(row))
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityResourceRow(ctx, row, userIdCache, moduleNameCache)),
    );
  },
});

export const countCommunityResources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const sinceMs = parseIsoMs(args.sinceIso);
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    if (sinceMs === null) return rows.length;
    return rows.reduce((count, row) => count + (row.createdAt >= sinceMs ? 1 : 0), 0);
  },
});

export const saveCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const resourceId = String(args.resourceId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || resourceId.length > 0;

    if (isPatch) {
      if (!resourceId) throw new Error("community_resource_id_required");
      const existing = (await ctx.db.get(resourceId as any)) as CommunityResourceLike | null;
      if (!existing) throw new Error("community_resource_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextTitleRaw = Object.prototype.hasOwnProperty.call(payload, "title") ? payload.title : existing.title;
      const nextTitle = normalizeName(nextTitleRaw);
      const nextTypeRaw = Object.prototype.hasOwnProperty.call(payload, "type") ? payload.type : existing.type;
      const nextRoleRaw = Object.prototype.hasOwnProperty.call(payload, "resource_role")
        ? payload.resource_role
        : existing.role;
      const nextStatusRaw = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? payload.resource_status
        : existing.status;
      const nextStatus = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? requireResourceStatusForWrite(nextStatusRaw)
        : normalizeResourceStatus(nextStatusRaw);
      const nextBodyRaw = Object.prototype.hasOwnProperty.call(payload, "body_md") ? payload.body_md : existing.bodyMd;
      const nextUrlRaw = Object.prototype.hasOwnProperty.call(payload, "url") ? payload.url : existing.url;
      const nextFileKeyRaw = Object.prototype.hasOwnProperty.call(payload, "file_key")
        ? payload.file_key
        : existing.fileKey;
      const nextPinnedRaw = Object.prototype.hasOwnProperty.call(payload, "pinned") ? payload.pinned : existing.pinned;
      const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
        ? payload.module_id
        : existing.moduleId;
      const nextModuleId = await requireValidResourceModule({
        ctx,
        communityId: existing.communityId,
        moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
      });
      const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
      const nextSortOrder = moduleChanged
        ? await getNextResourceSortOrder({
            ctx,
            communityId: existing.communityId,
            moduleId: nextModuleId,
            excludeResourceId: existing._id,
          })
        : existing.sortOrder;

      await ctx.db.patch(existing._id as any, {
        ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
        type: normalizeResourceType(nextTypeRaw),
        role: normalizeResourceRole(nextRoleRaw),
        status: nextStatus,
        title: nextTitle,
        bodyMd: normalizeOptionalText(nextBodyRaw, 20_000),
        url: normalizeOptionalUrl(nextUrlRaw),
        fileKey: normalizeOptionalFileKey(nextFileKeyRaw),
        pinned: Boolean(nextPinnedRaw),
        ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
      if (!updated) throw new Error("community_resource_not_found");
      await upsertArchiveDocumentForResource(ctx, updated);
      return await mapCommunityResourceRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityManager({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
    const type = normalizeResourceType(payload.type);
    const role = normalizeResourceRole(payload.resource_role);
    const hasStatusPayload = Object.prototype.hasOwnProperty.call(payload, "resource_status");
    const status = hasStatusPayload
      ? requireResourceStatusForWrite(payload.resource_status)
      : role === "source"
        ? "review"
        : "published";
    const title = normalizeName(payload.title);
    const bodyMd = normalizeOptionalText(payload.body_md, 20_000);
    const url = normalizeOptionalUrl(payload.url);
    const fileKey = normalizeOptionalFileKey(payload.file_key);
    const pinned = Boolean(payload.pinned);
    const moduleId = await requireValidResourceModule({
      ctx,
      communityId: community._id,
      moduleId: normalizeOptionalModuleId(payload.module_id),
    });
    const nextSortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: community._id,
      moduleId,
    });

    const id = await ctx.db.insert("communityResources" as any, {
      communityId: community._id,
      ...(moduleId ? { moduleId } : {}),
      createdByUserId: args.userId,
      type,
      role,
      status,
      title,
      bodyMd,
      url,
      fileKey,
      pinned,
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await upsertArchiveDocumentForResource(ctx, created);
    if (status === "published") {
      await recordCommunityActivityEventBestEffort({
        ctx,
        communityId: community._id,
        type: "resource_added",
        actorUserId: args.userId,
        targetType: "resource",
        targetId: created._id,
        targetTitle: created.title,
        dedupeKey: `resource_added:${normalizeIdValue(created._id)}`,
        nowMs,
      });
    }
    return await mapCommunityResourceRow(ctx, created);
  },
});

export const createCommunityResourcePageDraftFromSource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    sourceResourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const sourceResourceId = String(args.sourceResourceId ?? "").trim();
    if (!sourceResourceId) throw new Error("community_source_resource_id_required");
    const source = (await ctx.db.get(sourceResourceId as any)) as CommunityResourceLike | null;
    if (!source) throw new Error("community_source_resource_not_found");
    await requireCommunityManager({
      ctx,
      communityId: source.communityId,
      userId: args.userId,
    });
    if (normalizeResourceRole(source.role) !== "source") {
      throw new Error("community_source_resource_required");
    }
    if (!String(source.bodyMd ?? "").trim() && !String(source.url ?? "").trim() && !String(source.fileKey ?? "").trim()) {
      throw new Error("community_source_resource_empty");
    }

    const nowMs = Date.now();
    const sortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: source.communityId,
      moduleId: source.moduleId ?? null,
    });
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: source.communityId,
      ...(source.moduleId ? { moduleId: source.moduleId } : {}),
      createdByUserId: args.userId,
      type: "post",
      role: "page",
      status: "draft",
      sourceResourceId: source._id,
      title: source.title,
      bodyMd: normalizeOptionalText(buildPageDraftBodyFromSource(source), 20_000),
      pinned: false,
      sortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await upsertArchiveDocumentForResource(ctx, created);
    return await mapCommunityResourceRow(ctx, created);
  },
});

export const reorderCommunityResources = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    resourceIds: v.array(v.id("communityResources")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const moduleId = args.moduleId ?? null;
    if (moduleId) {
      await requireValidResourceModule({
        ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(moduleId),
      });
    }

    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const targetModuleIdentity = resourceModuleIdentity(moduleId);
    const scopedRows = rows.filter((row) => resourceModuleIdentity(row.moduleId) === targetModuleIdentity);
    const existingIds = new Set(scopedRows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.resourceIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_order_stale");
    }
    for (const resourceId of requestedIds) {
      if (!existingIds.has(resourceId)) {
        throw new Error("community_resource_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((resourceId, index) =>
        ctx.db.patch(resourceId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
  },
});

export const deleteCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!resource) return { ok: true };
    await requireCommunityManager({
      ctx,
      communityId: resource.communityId,
      userId: args.userId,
    });
    await ctx.db.delete(resource._id as any);
    await deleteArchiveDocumentBySource(ctx, {
      communityId: resource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(resource._id),
    });
    return { ok: true };
  },
});
