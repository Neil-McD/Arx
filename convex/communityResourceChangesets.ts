// Builder changesets: parsing, previewing, checking and applying the edits an AI
// stages for an owner to approve, their expiry, and the builder health report.
import { internal } from "./_generated/api";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceBodyChars,
  communityResourceModuleIsLive,
  maybeDeleteStorageAsset,
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceRole,
  normalizeResourceStatus,
  normalizeResourceType,
  requireCommunityManager,
  requireResourceModuleStatusForWrite,
  requireResourceStatusForWrite,
  toIsoString,
} from "./communityCore";
import {
  deleteCommunityResourceBodyContent,
  hydrateCommunityResourceBody,
  normalizeCommunityResourceBodyMd,
  writeCommunityResourceBodyContent,
} from "./communityResourceContent";
import {
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_OPERATIONS,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TITLE_CHARS,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_SUMMARY_MAX_CHARS,
  COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS,
  COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT,
  COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS,
  COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS,
} from "./communityResourceConstants";
import {
  type CommunityResourceBuilderChangesetOperation,
  type CommunityResourceBuilderChangesetPreviewItem,
  type CommunityResourceBuilderChangesetRow,
  getNextResourceSortOrder,
  normalizeOptionalModuleId,
  requireResourceModuleForRole,
  requireValidResourceModule,
  resourceModuleIdentity,
} from "./communityResourceShared";

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
  if (next === "published") {
    throw new Error("community_resource_page_status_deprecated");
  }
  if (args.publishing) {
    throw new Error("community_resource_page_status_deprecated");
  }
  return next;
}

function hasOwnField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function normalizeChangesetSummary(raw: unknown): string {
  const summary = normalizeOptionalText(raw, COMMUNITY_RESOURCE_BUILDER_CHANGESET_SUMMARY_MAX_CHARS);
  if (!summary) throw new Error("community_resource_changeset_summary_required");
  return summary;
}

function normalizeChangesetOperationKey(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value && /^[a-z0-9_-]{1,80}$/.test(value) ? value : null;
}

export function normalizeRequiredResourceRef(raw: unknown, fieldName: string): string {
  const value = normalizeOptionalModuleId(raw);
  if (!value) throw new Error(`${fieldName}_required`);
  return value;
}

export function normalizeExpectedUpdatedAtForChangeset(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error("community_resource_changeset_expected_updated_at_required");
  }
  return value;
}

function normalizeChangesetPageStatus(raw: unknown): "draft" | "review" | "processing" | "failed" {
  const status = normalizeResourceStatus(raw);
  if (status === "published") {
    throw new Error("community_resource_changeset_publish_deferred");
  }
  return status;
}

function normalizeChangesetModuleStatus(raw: unknown): "draft" | "live" {
  return requireResourceModuleStatusForWrite(raw);
}

export function normalizeCommunityResourceBuilderChangesetOperations(
  rawOperations: unknown,
): CommunityResourceBuilderChangesetOperation[] {
  if (!Array.isArray(rawOperations)) {
    throw new Error("community_resource_changeset_operations_required");
  }
  if (rawOperations.length < 1) {
    throw new Error("community_resource_changeset_empty");
  }
  if (rawOperations.length > COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_OPERATIONS) {
    throw new Error("community_resource_changeset_too_large");
  }

  return rawOperations.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`community_resource_changeset_operation_${index}_invalid`);
    }
    const record = raw as Record<string, unknown>;
    const op = String(record.op ?? record.kind ?? "").trim().toLowerCase();
    if (op === "create_module") {
      return {
        op,
        ...(normalizeChangesetOperationKey(record.module_key)
          ? { module_key: normalizeChangesetOperationKey(record.module_key) }
          : null),
        name: normalizeName(record.name),
        description_md: normalizeOptionalText(record.description_md, 1200) ?? null,
        module_status: hasOwnField(record, "module_status")
          ? normalizeChangesetModuleStatus(record.module_status)
          : "draft",
      };
    }
    if (op === "edit_module") {
      const next: CommunityResourceBuilderChangesetOperation = {
        op,
        module_id: normalizeRequiredResourceRef(record.module_id, "community_resource_changeset_module_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
      if (hasOwnField(record, "name")) next.name = normalizeName(record.name);
      if (hasOwnField(record, "description_md")) {
        next.description_md = normalizeOptionalText(record.description_md, 1200) ?? null;
      }
      if (hasOwnField(record, "module_status")) {
        next.module_status = normalizeChangesetModuleStatus(record.module_status);
      }
      if (!hasOwnField(record, "name") && !hasOwnField(record, "description_md") && !hasOwnField(record, "module_status")) {
        throw new Error("community_resource_changeset_edit_module_empty");
      }
      return next;
    }
    if (op === "create_page") {
      return {
        op,
        module_id: normalizeOptionalModuleId(record.module_id),
        ...(normalizeChangesetOperationKey(record.module_key)
          ? { module_key: normalizeChangesetOperationKey(record.module_key) }
          : null),
        title: normalizeName(record.title),
        body_md: hasOwnField(record, "body_md")
          ? normalizeCommunityResourceBodyMd(record.body_md, 20_000)
          : null,
        source_resource_id: normalizeOptionalModuleId(record.source_resource_id),
        ...(hasOwnField(record, "type") ? { type: normalizeResourceType(record.type) } : null),
        ...(hasOwnField(record, "url") ? { url: normalizeOptionalUrl(record.url) ?? null } : null),
        ...(hasOwnField(record, "resource_status")
          ? { resource_status: normalizeChangesetPageStatus(record.resource_status) }
          : null),
        ...(hasOwnField(record, "pinned") ? { pinned: Boolean(record.pinned) } : null),
      };
    }
    if (op === "edit_page") {
      const next: CommunityResourceBuilderChangesetOperation = {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
      if (hasOwnField(record, "module_id")) next.module_id = normalizeOptionalModuleId(record.module_id);
      if (hasOwnField(record, "title")) next.title = normalizeName(record.title);
      if (hasOwnField(record, "body_md")) next.body_md = normalizeCommunityResourceBodyMd(record.body_md, 20_000);
      if (hasOwnField(record, "source_resource_id")) {
        next.source_resource_id = normalizeOptionalModuleId(record.source_resource_id);
      }
      if (hasOwnField(record, "type")) next.type = normalizeResourceType(record.type);
      if (hasOwnField(record, "url")) next.url = normalizeOptionalUrl(record.url) ?? null;
      if (hasOwnField(record, "resource_status")) next.resource_status = normalizeChangesetPageStatus(record.resource_status);
      if (hasOwnField(record, "pinned")) next.pinned = Boolean(record.pinned);
      if (Object.keys(next).length <= 3) {
        throw new Error("community_resource_changeset_edit_page_empty");
      }
      return next;
    }
    if (op === "move_resource") {
      return {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
        module_id: normalizeOptionalModuleId(record.module_id),
      };
    }
    if (op === "delete_page") {
      return {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
    }
    if (op === "delete_category") {
      return {
        op,
        module_id: normalizeRequiredResourceRef(record.module_id, "community_resource_changeset_module_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
    }
    if (op === "link_source_to_page") {
      return {
        op,
        page_resource_id: normalizeRequiredResourceRef(record.page_resource_id, "community_resource_changeset_page_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
        source_resource_id: normalizeRequiredResourceRef(record.source_resource_id, "community_resource_changeset_source_resource_id"),
      };
    }
    throw new Error("community_resource_changeset_operation_unsupported");
  });
}

function communityResourceBuilderChangesetOperationSummary(
  operation: CommunityResourceBuilderChangesetOperation,
): string {
  if (operation.op === "create_module") return `Create module "${operation.name}"`;
  if (operation.op === "edit_module") return `Edit module ${operation.module_id}`;
  if (operation.op === "create_page") return `Create page "${operation.title}"`;
  if (operation.op === "edit_page") return `Edit page ${operation.resource_id}`;
  if (operation.op === "move_resource") return `Move resource ${operation.resource_id}`;
  if (operation.op === "delete_page") return `Delete page ${operation.resource_id}`;
  if (operation.op === "delete_category") return `Delete empty category ${operation.module_id}`;
  return `Link source ${operation.source_resource_id} to page ${operation.page_resource_id}`;
}

function trimChangesetPreviewText(raw: unknown, maxChars: number): string | null {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxChars
    ? `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
    : normalized;
}

function trimChangesetPreviewTitle(raw: unknown): string {
  return trimChangesetPreviewText(raw, COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TITLE_CHARS) ?? "Resource change";
}

function changesetOperationModuleTarget(
  operation: { module_id?: string | null; module_key?: string | null },
): string {
  if (operation.module_key) return operation.module_key;
  if (operation.module_id) return operation.module_id;
  return "Unsorted";
}

function previewCommunityResourceBuilderChangesetOperation(
  operation: CommunityResourceBuilderChangesetOperation,
): CommunityResourceBuilderChangesetPreviewItem {
  if (operation.op === "create_module") {
    return {
      op: operation.op,
      marker: "+",
      title: trimChangesetPreviewTitle(operation.name),
      preview: trimChangesetPreviewText(
        operation.description_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "edit_module") {
    return {
      op: operation.op,
      marker: "~",
      title: trimChangesetPreviewTitle(operation.name ?? operation.module_id),
      preview: trimChangesetPreviewText(
        operation.description_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "create_page") {
    return {
      op: operation.op,
      marker: "+",
      title: trimChangesetPreviewTitle(
        `${changesetOperationModuleTarget(operation)} / ${operation.title}`,
      ),
      preview: trimChangesetPreviewText(
        operation.body_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "edit_page") {
    return {
      op: operation.op,
      marker: "~",
      title: trimChangesetPreviewTitle(operation.title ?? operation.resource_id),
      preview: trimChangesetPreviewText(
        operation.body_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "move_resource") {
    return {
      op: operation.op,
      marker: ">",
      title: trimChangesetPreviewTitle(operation.resource_id),
      preview: `Moves to ${changesetOperationModuleTarget(operation)}`,
    };
  }
  if (operation.op === "delete_page") {
    return {
      op: operation.op,
      marker: "x",
      title: trimChangesetPreviewTitle(operation.resource_id),
      preview: "Deletes this page from Resources.",
    };
  }
  if (operation.op === "delete_category") {
    return {
      op: operation.op,
      marker: "x",
      title: trimChangesetPreviewTitle(operation.module_id),
      preview: "Deletes this empty category from Resources.",
    };
  }
  return {
    op: operation.op,
    marker: ">",
    title: trimChangesetPreviewTitle(operation.page_resource_id),
    preview: trimChangesetPreviewText(
      `Links source ${operation.source_resource_id}`,
      COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
    ),
  };
}

export function buildCommunityResourceBuilderChangesetPreview(
  operations: CommunityResourceBuilderChangesetOperation[],
): {
  total_count: number;
  preview_limit: number;
  preview_items: CommunityResourceBuilderChangesetPreviewItem[];
} {
  return {
    total_count: operations.length,
    preview_limit: COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT,
    preview_items: operations
      .slice(0, COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT)
      .map(previewCommunityResourceBuilderChangesetOperation),
  };
}

export function getCommunityResourceBuilderPreflightIssueCount(preflight: unknown): number {
  const record =
    preflight && typeof preflight === "object" && !Array.isArray(preflight)
      ? (preflight as Record<string, unknown>)
      : null;
  const health =
    record?.health && typeof record.health === "object" && !Array.isArray(record.health)
      ? (record.health as Record<string, unknown>)
      : null;
  const summary =
    health?.summary && typeof health.summary === "object" && !Array.isArray(health.summary)
      ? (health.summary as Record<string, unknown>)
      : null;
  const count = Number(summary?.issue_count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

async function requireChangesetModuleRef(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null | undefined;
  createdModuleKeys?: Set<string>;
  moduleKey?: string | null;
}): Promise<void> {
  if (args.moduleKey) {
    if (!args.createdModuleKeys?.has(args.moduleKey)) {
      throw new Error("community_resource_changeset_module_key_not_found");
    }
    return;
  }
  await requireValidResourceModule({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: args.moduleId ?? null,
  });
}

async function requireChangesetResourceRef(args: {
  ctx: any;
  communityId: any;
  resourceId: string;
  role?: "page" | "source";
  expectedUpdatedAt?: number;
}): Promise<CommunityResourceLike> {
  const resource = (await args.ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
  if (!resource || String(resource.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_changeset_resource_not_found");
  }
  if (args.role && normalizeResourceRole(resource.role) !== args.role) {
    throw new Error(args.role === "source" ? "community_source_resource_required" : "community_page_resource_required");
  }
  if (typeof args.expectedUpdatedAt === "number") {
    requireExpectedUpdatedAt({
      expectedUpdatedAt: args.expectedUpdatedAt,
      actualUpdatedAt: resource.updatedAt,
    });
  }
  return resource;
}

export async function requireChangesetEmptyModuleRef(args: {
  ctx: any;
  communityId: any;
  moduleId: string;
  expectedUpdatedAt: number;
}): Promise<CommunityResourceModuleLike> {
  const module = (await args.ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
  if (!module || String(module.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_module_not_found");
  }
  requireExpectedUpdatedAt({
    expectedUpdatedAt: args.expectedUpdatedAt,
    actualUpdatedAt: module.updatedAt,
  });
  const children = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module", (q: any) =>
      q.eq("communityId", args.communityId).eq("moduleId", module._id),
    )
    .take(1)) as CommunityResourceLike[];
  if (children.length > 0) {
    throw new Error("community_resource_changeset_category_not_empty");
  }
  return module;
}

export async function buildCommunityResourceBuilderChangesetPreflight(args: {
  ctx: any;
  communityId: any;
  operations: CommunityResourceBuilderChangesetOperation[];
  nowMs: number;
}): Promise<any> {
  const createdModuleKeys = new Set<string>();
  const operationSummaries: Array<Record<string, unknown>> = [];

  for (const [index, operation] of args.operations.entries()) {
    if (operation.op === "create_module") {
      if (operation.module_key) {
        if (createdModuleKeys.has(operation.module_key)) {
          throw new Error("community_resource_changeset_duplicate_module_key");
        }
        createdModuleKeys.add(operation.module_key);
      }
      operationSummaries.push({
        index,
        op: operation.op,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_module") {
      const module = (await args.ctx.db.get(operation.module_id as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: operation.expected_updated_at,
        actualUpdatedAt: module.updatedAt,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "create_page") {
      await requireChangesetModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
        moduleKey: operation.module_key,
        createdModuleKeys,
      });
      if (operation.source_resource_id) {
        await requireChangesetResourceRef({
          ctx: args.ctx,
          communityId: args.communityId,
          resourceId: operation.source_resource_id,
          role: "source",
        });
      }
      operationSummaries.push({
        index,
        op: operation.op,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_page") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        role: "page",
        expectedUpdatedAt: operation.expected_updated_at,
      });
      if (hasOwnField(operation as any, "module_id")) {
        await requireChangesetModuleRef({
          ctx: args.ctx,
          communityId: args.communityId,
          moduleId: operation.module_id,
        });
      }
      if (operation.source_resource_id) {
        await requireChangesetResourceRef({
          ctx: args.ctx,
          communityId: args.communityId,
          resourceId: operation.source_resource_id,
          role: "source",
        });
      }
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "move_resource") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      await requireChangesetModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_page") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        role: "page",
        expectedUpdatedAt: operation.expected_updated_at,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_category") {
      await requireChangesetEmptyModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.page_resource_id,
      role: "page",
      expectedUpdatedAt: operation.expected_updated_at,
    });
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.source_resource_id,
      role: "source",
    });
    operationSummaries.push({
      index,
      op: operation.op,
      target_id: operation.page_resource_id,
      summary: communityResourceBuilderChangesetOperationSummary(operation),
    });
  }

  return {
    ok: true,
    kind: "community_resource_builder_changeset_preflight",
    checked_at: toIsoString(args.nowMs),
    operation_count: args.operations.length,
    operations: operationSummaries,
    health: await buildCommunityResourceBuilderHealthReport({
      ctx: args.ctx,
      communityId: args.communityId,
      nowMs: args.nowMs,
    }),
  };
}

function resolveChangesetModuleId(args: {
  operation: { module_id?: string | null; module_key?: string | null };
  createdModuleIdsByKey: Map<string, any>;
}): any | undefined {
  if (args.operation.module_key) {
    const createdId = args.createdModuleIdsByKey.get(args.operation.module_key);
    if (!createdId) throw new Error("community_resource_changeset_module_key_not_applied");
    return createdId;
  }
  return args.operation.module_id ? args.operation.module_id : undefined;
}

async function createModuleFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "create_module" }>;
  nowMs: number;
}): Promise<CommunityResourceModuleLike> {
  const rows = (await args.ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceModuleLike[];
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
  const id = await args.ctx.db.insert("communityResourceModules" as any, {
    communityId: args.communityId,
    createdByUserId: args.userId,
    status: args.operation.module_status ?? "draft",
    name: args.operation.name,
    descriptionMd: args.operation.description_md ?? undefined,
    sortOrder: nextSortOrder,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
  if (!created) throw new Error("community_resource_module_create_failed");
  return created;
}

async function createPageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "create_page" }>;
  createdModuleIdsByKey: Map<string, any>;
  nowMs: number;
}): Promise<CommunityResourceLike> {
  const moduleId = resolveChangesetModuleId({
    operation: args.operation,
    createdModuleIdsByKey: args.createdModuleIdsByKey,
  });
  const validatedModuleId = await requireResourceModuleForRole({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: normalizeOptionalModuleId(moduleId),
    role: "page",
  });
  const sourceResourceId = normalizeOptionalModuleId(args.operation.source_resource_id);
  if (sourceResourceId) {
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: sourceResourceId,
      role: "source",
    });
  }
  const sortOrder = await getNextResourceSortOrder({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: validatedModuleId,
  });
  const id = await args.ctx.db.insert("communityResources" as any, {
    communityId: args.communityId,
    moduleId: validatedModuleId,
    createdByUserId: args.userId,
    type: args.operation.type ? normalizeResourceType(args.operation.type) : "post",
    role: "page",
    status: args.operation.resource_status
      ? normalizeBuilderResourceStatus({
          raw: args.operation.resource_status,
          confirmPublish: false,
          defaultStatus: "draft",
        })
      : "draft",
    ...(sourceResourceId ? { sourceResourceId } : {}),
    title: args.operation.title,
    ...(args.operation.url ? { url: args.operation.url } : {}),
    sourceIngestionStatus: "not_required",
    sourceIngestionKind: "manual",
    pinned: Boolean(args.operation.pinned),
    sortOrder,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as CommunityResourceLike | null;
  if (!created) throw new Error("community_resource_create_failed");
  if (args.operation.body_md) {
    await writeCommunityResourceBodyContent(args.ctx, {
      communityId: args.communityId,
      resourceId: created._id,
      bodyMd: args.operation.body_md,
      nowMs: args.nowMs,
      maxChars: 20_000,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, created) ?? created;
  return hydrated;
}

async function editPageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "edit_page" }>;
  nowMs: number;
}): Promise<CommunityResourceLike> {
  const existing = await requireChangesetResourceRef({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: args.operation.resource_id,
    role: "page",
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  const nextModuleId = hasOwnField(args.operation as any, "module_id")
    ? await requireResourceModuleForRole({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(args.operation.module_id),
        role: "page",
      })
    : existing.moduleId;
  if (!nextModuleId) throw new Error("community_resource_course_required");
  const nextSourceResourceId = hasOwnField(args.operation as any, "source_resource_id")
    ? normalizeOptionalModuleId(args.operation.source_resource_id)
    : normalizeIdValue(existing.sourceResourceId ?? "");
  if (nextSourceResourceId) {
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: nextSourceResourceId,
      role: "source",
    });
  }
  const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
  const nextSortOrder = moduleChanged
    ? await getNextResourceSortOrder({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: nextModuleId,
        excludeResourceId: existing._id,
      })
    : existing.sortOrder;
  const bodyChanged = hasOwnField(args.operation as any, "body_md");
  await args.ctx.db.patch(existing._id as any, {
    moduleId: nextModuleId,
    ...(hasOwnField(args.operation as any, "type") ? { type: normalizeResourceType(args.operation.type) } : {}),
    ...(hasOwnField(args.operation as any, "resource_status")
      ? {
          status: normalizeBuilderResourceStatus({
            raw: args.operation.resource_status,
            confirmPublish: false,
            defaultStatus: "draft",
          }),
        }
      : {}),
    ...(nextSourceResourceId ? { sourceResourceId: nextSourceResourceId } : { sourceResourceId: undefined }),
    ...(hasOwnField(args.operation as any, "title") ? { title: normalizeName(args.operation.title) } : {}),
    ...(hasOwnField(args.operation as any, "url") ? { url: normalizeOptionalUrl(args.operation.url) } : {}),
    ...(hasOwnField(args.operation as any, "pinned") ? { pinned: Boolean(args.operation.pinned) } : {}),
    ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
    updatedAt: args.nowMs,
  });
  const updated = (await args.ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
  if (!updated) throw new Error("community_resource_not_found");
  if (bodyChanged) {
    await writeCommunityResourceBodyContent(args.ctx, {
      communityId: args.communityId,
      resourceId: updated._id,
      bodyMd: args.operation.body_md ?? null,
      nowMs: args.nowMs,
      maxChars: 20_000,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, updated) ?? updated;
  return hydrated;
}

export async function deletePageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "delete_page" }>;
}): Promise<CommunityResourceLike> {
  const existing = await requireChangesetResourceRef({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: args.operation.resource_id,
    role: "page",
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  await deleteCommunityResourceBodyContent(args.ctx, existing._id);
  await args.ctx.db.delete(existing._id as any);
  return existing;
}

export async function deleteCategoryFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "delete_category" }>;
}): Promise<CommunityResourceModuleLike> {
  const module = await requireChangesetEmptyModuleRef({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: args.operation.module_id,
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  if (module.bannerStorageId) {
    await maybeDeleteStorageAsset(args.ctx, module.bannerStorageId);
  }
  await args.ctx.db.delete(module._id as any);
  return module;
}

export async function applyCommunityResourceBuilderChangesetOperations(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operations: CommunityResourceBuilderChangesetOperation[];
  nowMs: number;
}): Promise<any> {
  const createdModuleIdsByKey = new Map<string, any>();
  const applied: Array<Record<string, unknown>> = [];

  for (const [index, operation] of args.operations.entries()) {
    if (operation.op === "create_module") {
      const module = await createModuleFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        userId: args.userId,
        operation,
        nowMs: args.nowMs,
      });
      if (operation.module_key) createdModuleIdsByKey.set(operation.module_key, module._id);
      applied.push({
        index,
        op: operation.op,
        module_id: normalizeIdValue(module._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_module") {
      const module = (await args.ctx.db.get(operation.module_id as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: operation.expected_updated_at,
        actualUpdatedAt: module.updatedAt,
      });
      await args.ctx.db.patch(module._id as any, {
        ...(hasOwnField(operation as any, "name") ? { name: operation.name } : {}),
        ...(hasOwnField(operation as any, "description_md") ? { descriptionMd: operation.description_md ?? undefined } : {}),
        ...(hasOwnField(operation as any, "module_status") ? { status: operation.module_status } : {}),
        updatedAt: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        module_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "create_page") {
      const page = await createPageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        userId: args.userId,
        operation,
        createdModuleIdsByKey,
        nowMs: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: normalizeIdValue(page._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_page") {
      const page = await editPageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
        nowMs: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: normalizeIdValue(page._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "move_resource") {
      const resource = await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      const moduleId = await requireResourceModuleForRole({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(operation.module_id),
        role: normalizeResourceRole(resource.role),
      });
      const sortOrder = await getNextResourceSortOrder({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId,
        excludeResourceId: resource._id,
      });
      await args.ctx.db.patch(resource._id as any, {
        ...(moduleId ? { moduleId } : { moduleId: undefined }),
        sortOrder,
        updatedAt: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_page") {
      const page = await deletePageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: operation.resource_id,
        title: page.title,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_category") {
      const module = await deleteCategoryFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
      });
      applied.push({
        index,
        op: operation.op,
        module_id: operation.module_id,
        name: module.name,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    const page = await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.page_resource_id,
      role: "page",
      expectedUpdatedAt: operation.expected_updated_at,
    });
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.source_resource_id,
      role: "source",
    });
    await args.ctx.db.patch(page._id as any, {
      sourceResourceId: operation.source_resource_id,
      updatedAt: args.nowMs,
    });
    applied.push({
      index,
      op: operation.op,
      resource_id: operation.page_resource_id,
      source_resource_id: operation.source_resource_id,
      summary: communityResourceBuilderChangesetOperationSummary(operation),
    });
  }

  return {
    ok: true,
    kind: "community_resource_builder_changeset_apply_result",
    operation_count: args.operations.length,
    applied,
    health: await buildCommunityResourceBuilderHealthReport({
      ctx: args.ctx,
      communityId: args.communityId,
      nowMs: args.nowMs,
    }),
  };
}

const COMMUNITY_RESOURCE_BUILDER_ACTIONABLE_STATUSES = [
  "staged",
  "approved",
] as const;

export function communityResourceBuilderChangesetExpiresAt(
  changeset: CommunityResourceBuilderChangesetRow,
): number {
  return changeset.createdAt + COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS;
}

function communityResourceBuilderChangesetIsActionable(
  changeset: CommunityResourceBuilderChangesetRow,
): boolean {
  return changeset.status === "staged" || changeset.status === "approved";
}

export function communityResourceBuilderChangesetIsExpired(
  changeset: CommunityResourceBuilderChangesetRow,
  nowMs: number,
): boolean {
  return (
    communityResourceBuilderChangesetIsActionable(changeset) &&
    nowMs >= communityResourceBuilderChangesetExpiresAt(changeset)
  );
}

export function buildCommunityResourceBuilderExpiredResult(args: {
  changeset: CommunityResourceBuilderChangesetRow;
  changesetId: unknown;
  communityId: unknown;
  deduped: boolean;
}) {
  const operations = normalizeCommunityResourceBuilderChangesetOperations(
    args.changeset.operations,
  );
  const preview = buildCommunityResourceBuilderChangesetPreview(operations);
  return {
    ok: false,
    kind: "community_resource_builder_changeset_expired",
    code: "community_resource_changeset_expired",
    changeset_id: normalizeIdValue(args.changesetId),
    community_id: normalizeIdValue(args.communityId),
    status: "expired",
    summary: args.changeset.summary,
    operation_count: operations.length,
    preview_items: preview.preview_items,
    preview_total_count: preview.total_count,
    preview_limit: preview.preview_limit,
    error: COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE,
    expires_at: toIsoString(
      communityResourceBuilderChangesetExpiresAt(args.changeset),
    ),
    deduped: args.deduped,
  };
}

export async function expireCommunityResourceBuilderChangesetIfNeeded(args: {
  ctx: any;
  changeset: CommunityResourceBuilderChangesetRow;
  nowMs: number;
}): Promise<boolean> {
  if (!communityResourceBuilderChangesetIsExpired(args.changeset, args.nowMs)) {
    return false;
  }
  await args.ctx.db.patch(args.changeset._id as any, {
    status: "expired",
    error: COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE,
    updatedAt: args.nowMs,
  });
  return true;
}

export async function readLatestCommunityResourceBuilderActionableRows(args: {
  ctx: any;
  communityId: any;
}): Promise<CommunityResourceBuilderChangesetRow[]> {
  return (
    await Promise.all(
      COMMUNITY_RESOURCE_BUILDER_ACTIONABLE_STATUSES.map(async (status) =>
        await args.ctx.db
          .query("communityResourceBuilderChangesets" as any)
          .withIndex("by_community_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", status),
          )
          .order("desc")
          .first(),
      ),
    )
  ).filter(Boolean) as CommunityResourceBuilderChangesetRow[];
}

export async function stageCommunityResourceBuilderChangesetCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  summary: string;
  operations: unknown[];
  idempotencyKey?: string | null;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const nowMs = Date.now();
  const summary = normalizeChangesetSummary(args.summary);
  const operations = normalizeCommunityResourceBuilderChangesetOperations(args.operations);
  const idempotencyKey = normalizeOptionalText(args.idempotencyKey, 200);
  if (idempotencyKey) {
    const existing = (await args.ctx.db
      .query("communityResourceBuilderChangesets" as any)
      .withIndex("by_community_creator_idempotencyKey", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("createdByUserId", args.userId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique()) as CommunityResourceBuilderChangesetRow | null;
    if (existing) {
      const existingOperations =
        normalizeCommunityResourceBuilderChangesetOperations(
          existing.operations,
        );
      if (
        existing.summary !== summary ||
        JSON.stringify(existingOperations) !== JSON.stringify(operations)
      ) {
        throw new Error("community_resource_changeset_idempotency_conflict");
      }
      if (existing.status === "expired") {
        return buildCommunityResourceBuilderExpiredResult({
          changeset: existing,
          changesetId: existing._id,
          communityId: args.communityId,
          deduped: true,
        });
      }
      if (
        await expireCommunityResourceBuilderChangesetIfNeeded({
          ctx: args.ctx,
          changeset: existing,
          nowMs,
        })
      ) {
        return buildCommunityResourceBuilderExpiredResult({
          changeset: existing,
          changesetId: existing._id,
          communityId: args.communityId,
          deduped: true,
        });
      }
      const existingPreview =
        buildCommunityResourceBuilderChangesetPreview(existingOperations);
      return {
        ok: true,
        kind: "community_resource_builder_changeset_staged",
        changeset_id: normalizeIdValue(existing._id),
        community_id: normalizeIdValue(args.communityId),
        status: existing.status,
        summary: existing.summary,
        operation_count: existingOperations.length,
        preview_items: existingPreview.preview_items,
        preview_total_count: existingPreview.total_count,
        preview_limit: existingPreview.preview_limit,
        warning_count:
          getCommunityResourceBuilderPreflightIssueCount(existing.preflight),
        preflight: existing.preflight,
        deduped: true,
      };
    }
  }
  const recentActionableRows = await readLatestCommunityResourceBuilderActionableRows({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  const liveActionableRows: CommunityResourceBuilderChangesetRow[] = [];
  for (const changeset of recentActionableRows) {
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx: args.ctx,
        changeset,
        nowMs,
      })
    ) {
      continue;
    }
    liveActionableRows.push(changeset);
  }
  if (liveActionableRows.length > 0) {
    throw new Error("community_resource_changeset_already_pending");
  }
  const preflight = await buildCommunityResourceBuilderChangesetPreflight({
    ctx: args.ctx,
    communityId: args.communityId,
    operations,
    nowMs,
  });
  const preview = buildCommunityResourceBuilderChangesetPreview(operations);
  const id = await args.ctx.db.insert("communityResourceBuilderChangesets" as any, {
    communityId: args.communityId,
    createdByUserId: args.userId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    status: "staged",
    summary,
    operations,
    preflight,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await args.ctx.scheduler.runAt(
    nowMs + COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS,
    (internal as any).communityResources
      .expireCommunityResourceBuilderChangesetInternal,
    { changesetId: id },
  );
  return {
    ok: true,
    kind: "community_resource_builder_changeset_staged",
    changeset_id: normalizeIdValue(id),
    community_id: normalizeIdValue(args.communityId),
    status: "staged",
    summary,
    operation_count: operations.length,
    preview_items: preview.preview_items,
    preview_total_count: preview.total_count,
    preview_limit: preview.preview_limit,
    warning_count: getCommunityResourceBuilderPreflightIssueCount(preflight),
    preflight,
    deduped: false,
  };
}

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
  return buildCommunityResourceBuilderHealthReportFromRows({
    modules,
    resources,
    nowMs: args.nowMs,
  });
}

export function buildCommunityResourceBuilderHealthReportFromRows(args: {
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  nowMs: number;
}): any {
  const { modules, resources } = args;
  const pages = resources.filter((row) => normalizeResourceRole(row.role) === "page");
  const sources = resources.filter((row) => normalizeResourceRole(row.role) === "source");
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
  const allIssues = {
    emptyModules: modules
      .filter((module) => (modulePageCounts.get(normalizeIdValue(module._id)) ?? 0) === 0)
      .map((module) => ({
        module_id: normalizeIdValue(module._id),
        name: module.name,
      })),
    sparsePages: pages
      .filter((page) => communityResourceBodyChars(page) < COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS)
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
        body_chars: communityResourceBodyChars(page),
      })),
    pagesWithoutSourceLineage: pages
      .filter((page) => !normalizeIdValue(page.sourceResourceId ?? ""))
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
  const issueTotals = {
    emptyModules: allIssues.emptyModules.length,
    sparsePages: allIssues.sparsePages.length,
    pagesWithoutSourceLineage: allIssues.pagesWithoutSourceLineage.length,
    unreferencedSources: allIssues.unreferencedSources.length,
    staleDrafts: allIssues.staleDrafts.length,
  };
  const issues = {
    emptyModules: allIssues.emptyModules.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    sparsePages: allIssues.sparsePages.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    pagesWithoutSourceLineage: allIssues.pagesWithoutSourceLineage.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    unreferencedSources: allIssues.unreferencedSources.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    staleDrafts: allIssues.staleDrafts.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
  };
  return {
    ok: true,
    kind: "community_resource_builder_health_report",
    checked_at: toIsoString(args.nowMs),
    summary: {
      modules: modules.length,
      live_modules: modules.filter(communityResourceModuleIsLive).length,
      draft_modules: modules.filter((module) => !communityResourceModuleIsLive(module)).length,
      resources: resources.length,
      pages: pages.length,
      sources: sources.length,
      draft_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "draft").length,
      source_inbox_items: sources.length,
      issue_count:
        issueTotals.emptyModules +
        issueTotals.sparsePages +
        issueTotals.pagesWithoutSourceLineage +
        issueTotals.unreferencedSources +
        issueTotals.staleDrafts,
      issue_counts: issueTotals,
      issue_sample_limit: COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT,
      issues_truncated: Object.values(issueTotals).some(
        (count) => count > COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT,
      ),
    },
    issues,
  };
}
