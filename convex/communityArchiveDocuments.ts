import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeResourceRole,
  normalizeResourceStatus,
  normalizeIdValue,
} from "./communityCore";
import {
  hydrateCommunityResourceBody,
} from "./communityResourceContent";
import {
  communityInteractionEvidenceSourceIsReadable,
  resolveCommunityInteractionEvidenceSource,
  type CommunityInteractionEvidenceRow,
} from "./communityInteractionEvidenceCore";
import { requireLiveCommunityForCognitionWrite } from "./communityCognitionLifecycle";

export type ArchiveSourceType = "chat" | "interaction" | "ai_feed" | "resource";
export type ArchiveEmbeddingStatus = "pending" | "embedded" | "failed";
export type ArchivePostType = "observation" | "recommendation" | "action";

export type FeedPostRow = {
  _id: any;
  communityId: any;
  authorLabel: string;
  type: ArchivePostType;
  title?: string;
  body: string;
  evidence?: string[];
  status: "live" | "hidden";
  createdAt: number;
  updatedAt: number;
};

type InteractionContentBlockRow = {
  blockOrder: number;
  blockType: string;
  text?: string;
  url?: string;
  workspaceRefKind?: string;
  workspaceRefId?: string;
  mentionedAgentKey?: string;
  mentionedRoleKey?: string;
};

type InteractionAttachmentRow = {
  status: "uploaded" | "processing" | "failed" | "deleted";
  name: string;
  externalUrl?: string;
};

export type ArchiveDocLike = {
  _id: any;
  communityId: any;
  sourceType: ArchiveSourceType;
  sourceId: string;
  title?: string;
  sourceText: string;
  pdfText?: string;
  text: string;
  snippet: string;
  url?: string;
  authorLabel?: string;
  postType?: ArchivePostType;
  resourceType?: string;
  resourceRole?: "page" | "source";
  resourceStatus?: "draft" | "review" | "published" | "processing" | "failed";
  isPdf: boolean;
  embeddingStatus: ArchiveEmbeddingStatus;
  embedding?: number[];
  embeddingError?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type PendingArchiveDocument = {
  id: string;
  source_type: ArchiveSourceType;
  source_id: string;
  title: string | null;
  source_text: string;
  pdf_text: string | null;
  text: string;
  url: string | null;
  is_pdf: boolean;
};

const MAX_ARCHIVE_TEXT_LENGTH = 80_000;
const MAX_ARCHIVE_SNIPPET_LENGTH = 280;
export const MAX_PDF_TEXT_LENGTH = 40_000;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return collapseWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\(([^)]+)\)/g, " $1 ")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
      .replace(/[#>*_~-]+/g, " "),
  );
}

export function truncateText(raw: unknown, maxLen: number): string {
  const value = collapseWhitespace(String(raw ?? ""));
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export function normalizeOptionalText(raw: unknown, maxLen: number): string | null {
  const value = truncateText(raw, maxLen);
  return value || null;
}

export function normalizeUrl(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isPdfUrl(raw: unknown): boolean {
  const url = normalizeUrl(raw);
  if (!url) return false;
  const normalized = url.toLowerCase();
  return normalized.includes(".pdf");
}

export function buildArchiveSnippet(title: string | null, text: string): string {
  const parts = [title ?? "", text].filter(Boolean);
  return truncateText(parts.join(" — "), MAX_ARCHIVE_SNIPPET_LENGTH);
}

export function buildArchiveText(parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => stripMarkdown(String(part ?? "")))
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  return truncateText(normalized.join("\n\n"), MAX_ARCHIVE_TEXT_LENGTH);
}

function buildAiFeedArchiveDoc(post: FeedPostRow): Omit<
  ArchiveDocLike,
  "_id" | "embeddingStatus" | "embedding" | "embeddingError" | "embeddingModel" | "embeddingDimensions" | "embeddingUpdatedAt"
> | null {
  if (post.status !== "live") return null;
  const title = normalizeOptionalText(post.title, 180);
  const sourceText = buildArchiveText([
    title,
    post.body,
    ...(Array.isArray(post.evidence) ? post.evidence : []),
  ]);
  if (!sourceText) return null;
  return {
    communityId: post.communityId,
    sourceType: "ai_feed",
    sourceId: normalizeIdValue(post._id),
    title: title ?? undefined,
    sourceText,
    pdfText: undefined,
    text: sourceText,
    snippet: buildArchiveSnippet(title, sourceText),
    url: undefined,
    authorLabel: normalizeOptionalText(post.authorLabel, 160) ?? "Agent",
    postType: post.type,
    resourceType: undefined,
    resourceRole: undefined,
    resourceStatus: undefined,
    isPdf: false,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function buildResourceArchiveDoc(params: {
  resource: CommunityResourceLike;
  existing: ArchiveDocLike | null;
}): Omit<
  ArchiveDocLike,
  "_id" | "embeddingStatus" | "embedding" | "embeddingError" | "embeddingModel" | "embeddingDimensions" | "embeddingUpdatedAt"
> | null {
  const url = normalizeUrl(params.resource.url);
  const isPdf = isPdfUrl(url);
  const resourceRole = normalizeResourceRole(params.resource.role);
  const resourceStatus = normalizeResourceStatus(params.resource.status);
  const sourceText = buildArchiveText([
    params.resource.title,
    params.resource.bodyMd ?? "",
    url ?? "",
  ]);
  if (!sourceText) return null;
  const preservedPdfText =
    isPdf && params.existing?.isPdf && normalizeUrl(params.existing.url) === url
      ? truncateText(params.existing.pdfText ?? "", MAX_PDF_TEXT_LENGTH)
      : "";
  const pdfText = preservedPdfText || undefined;
  const text = buildArchiveText([sourceText, pdfText ?? ""]);
  return {
    communityId: params.resource.communityId,
    sourceType: "resource",
    sourceId: normalizeIdValue(params.resource._id),
    title: params.resource.title,
    sourceText,
    pdfText,
    text,
    snippet: buildArchiveSnippet(params.resource.title, text),
    url: url ?? undefined,
    authorLabel: undefined,
    postType: undefined,
    resourceType: normalizeOptionalText(params.resource.type, 64) ?? undefined,
    resourceRole,
    resourceStatus,
    isPdf,
    createdAt: params.resource.createdAt,
    updatedAt: params.resource.updatedAt,
  };
}

function interactionAuthorLabel(row: CommunityInteractionEvidenceRow): string {
  if (row.actorType === "human") {
    return row.actorUserId ? `member:${normalizeIdValue(row.actorUserId)}` : "member";
  }
  return row.actorAgentKey
    ? `${row.actorType}:${row.actorAgentKey}`
    : row.actorType;
}

function interactionBlockText(row: InteractionContentBlockRow): string {
  if (row.blockType === "markdown_text") return String(row.text ?? "").trim();
  if (row.blockType === "link") return String(row.text ?? row.url ?? "").trim();
  if (row.blockType === "workspace_ref") {
    return String(
      row.text ??
        [row.workspaceRefKind, row.workspaceRefId].filter(Boolean).join(":"),
    ).trim();
  }
  if (row.blockType === "mention") {
    return String(
      row.text ?? `@${row.mentionedRoleKey ?? row.mentionedAgentKey ?? "member"}`,
    ).trim();
  }
  return String(row.text ?? row.url ?? "").trim();
}

async function listInteractionArchiveText(args: {
  ctx: { db: any };
  objectType: "root" | "reply";
  objectId: any;
}): Promise<string> {
  const [blocks, attachments] = await Promise.all([
    args.ctx.db
      .query("communityInteractionContentBlocks" as any)
      .withIndex(
        args.objectType === "root" ? "by_root_order" : "by_reply_order",
        (q: any) =>
          q.eq(args.objectType === "root" ? "rootId" : "replyId", args.objectId),
      )
      .take(64),
    args.ctx.db
      .query("communityInteractionAttachments" as any)
      .withIndex(args.objectType === "root" ? "by_root" : "by_reply", (q: any) =>
        q.eq(args.objectType === "root" ? "rootId" : "replyId", args.objectId),
      )
      .take(32),
  ]) as [InteractionContentBlockRow[], InteractionAttachmentRow[]];
  return buildArchiveText([
    ...blocks
      .slice()
      .sort((a, b) => a.blockOrder - b.blockOrder)
      .map(interactionBlockText),
    ...attachments
      .filter((attachment) => attachment.status !== "deleted")
      .map((attachment) =>
        [attachment.name, attachment.externalUrl].filter(Boolean).join(" "),
      ),
  ]);
}

function interactionSourceId(
  objectType: "root" | "reply",
  objectId: unknown,
): string {
  return `${objectType}:${normalizeIdValue(objectId)}`;
}

export async function syncArchiveDocumentForInteraction(args: {
  ctx: { db: any };
  communityId: any;
  objectType: "root" | "reply";
  objectId: any;
}): Promise<{ indexed: boolean; sourceId: string }> {
  const sourceId = interactionSourceId(args.objectType, args.objectId);
  const deleteCurrent = async () => {
    await deleteArchiveDocumentBySource(args.ctx, {
      communityId: args.communityId,
      sourceType: "interaction",
      sourceId,
    });
    return { indexed: false, sourceId };
  };
  const source = await resolveCommunityInteractionEvidenceSource(args);
  if (!source || !communityInteractionEvidenceSourceIsReadable(source)) {
    return await deleteCurrent();
  }
  const { row, root } = source;

  const sourceText = await listInteractionArchiveText({
    ctx: args.ctx,
    objectType: args.objectType,
    objectId: row._id,
  });
  const text = sourceText || buildArchiveText([row.contentSummary]);
  if (!text) return await deleteCurrent();
  const title = normalizeOptionalText(
    args.objectType === "root" ? row.title : root.title,
    180,
  );
  await upsertArchiveDoc(args.ctx, {
    communityId: row.communityId,
    sourceType: "interaction",
    sourceId,
    title: title ?? undefined,
    sourceText: text,
    pdfText: undefined,
    text,
    snippet: buildArchiveSnippet(title, text),
    url: undefined,
    authorLabel: interactionAuthorLabel(row),
    postType: undefined,
    resourceType: undefined,
    resourceRole: undefined,
    resourceStatus: undefined,
    isPdf: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  return { indexed: true, sourceId };
}

async function getExistingArchiveDoc(ctx: { db: any }, params: {
  communityId: any;
  sourceType: ArchiveSourceType;
  sourceId: string;
}): Promise<ArchiveDocLike | null> {
  return ((await ctx.db
    .query("communityArchiveDocuments" as any)
    .withIndex("by_community_source", (q: any) =>
      q.eq("communityId", params.communityId).eq("sourceType", params.sourceType).eq("sourceId", params.sourceId),
    )
    .first()) as ArchiveDocLike | null) ?? null;
}

function archiveSourceKey(args: {
  sourceType: ArchiveSourceType;
  sourceId: string;
}): string {
  return `${args.sourceType}:${args.sourceId}`;
}

async function upsertArchiveDoc(ctx: { db: any }, nextDoc: Omit<
  ArchiveDocLike,
  "_id" | "embeddingStatus" | "embedding" | "embeddingError" | "embeddingModel" | "embeddingDimensions" | "embeddingUpdatedAt"
> | null): Promise<void> {
  if (!nextDoc) return;
  await requireLiveCommunityForCognitionWrite(ctx, nextDoc.communityId);
  const existing = await getExistingArchiveDoc(ctx, {
    communityId: nextDoc.communityId,
    sourceType: nextDoc.sourceType,
    sourceId: nextDoc.sourceId,
  });
  const textChanged =
    !existing ||
    existing.text !== nextDoc.text ||
    existing.sourceText !== nextDoc.sourceText ||
    (existing.pdfText ?? "") !== (nextDoc.pdfText ?? "");

  const basePatch = {
    title: nextDoc.title,
    sourceText: nextDoc.sourceText,
    pdfText: nextDoc.pdfText,
    text: nextDoc.text,
    snippet: nextDoc.snippet,
    url: nextDoc.url,
    authorLabel: nextDoc.authorLabel,
    postType: nextDoc.postType,
    resourceType: nextDoc.resourceType,
    resourceRole: nextDoc.resourceRole,
    resourceStatus: nextDoc.resourceStatus,
    isPdf: nextDoc.isPdf,
    createdAt: nextDoc.createdAt,
    updatedAt: nextDoc.updatedAt,
  };

  if (!existing) {
    await ctx.db.insert("communityArchiveDocuments" as any, {
      communityId: nextDoc.communityId,
      sourceType: nextDoc.sourceType,
      sourceId: nextDoc.sourceId,
      ...basePatch,
      embeddingStatus: "pending",
    });
    return;
  }

  await ctx.db.patch(existing._id as any, {
    ...basePatch,
    ...(textChanged
      ? {
          embeddingStatus: "pending",
          embedding: undefined,
          embeddingError: undefined,
          embeddingModel: undefined,
          embeddingDimensions: undefined,
          embeddingUpdatedAt: undefined,
        }
      : null),
  });
}

export async function deleteArchiveDocumentBySource(ctx: { db: any }, params: {
  communityId: any;
  sourceType: ArchiveSourceType;
  sourceId: string;
}): Promise<void> {
  const existing = await getExistingArchiveDoc(ctx, params);
  if (!existing) return;
  await ctx.db.delete(existing._id as any);
}

export async function upsertArchiveDocumentForAiFeedPost(ctx: { db: any }, post: FeedPostRow): Promise<void> {
  const nextDoc = buildAiFeedArchiveDoc(post);
  if (!nextDoc) {
    await deleteArchiveDocumentBySource(ctx, {
      communityId: post.communityId,
      sourceType: "ai_feed",
      sourceId: normalizeIdValue(post._id),
    });
    return;
  }
  await upsertArchiveDoc(ctx, nextDoc);
}

export async function upsertArchiveDocumentForResource(ctx: { db: any }, resource: CommunityResourceLike): Promise<void> {
  const hydratedResource = await hydrateCommunityResourceBody(ctx, resource) ?? resource;
  const module = hydratedResource.moduleId
    ? ((await ctx.db.get(hydratedResource.moduleId as any)) as CommunityResourceModuleLike | null)
    : null;
  const liveModuleIds = new Set(
    module &&
      String(module.communityId) === String(hydratedResource.communityId) &&
      communityResourceModuleIsLive(module)
      ? [normalizeIdValue(module._id)]
      : [],
  );
  const existing = await getExistingArchiveDoc(ctx, {
    communityId: hydratedResource.communityId,
    sourceType: "resource",
    sourceId: normalizeIdValue(hydratedResource._id),
  });
  if (!communityResourceIsLiveModulePage(hydratedResource, liveModuleIds)) {
    await deleteArchiveDocumentBySource(ctx, {
      communityId: hydratedResource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(hydratedResource._id),
    });
    return;
  }
  const nextDoc = buildResourceArchiveDoc({
    resource: hydratedResource,
    existing,
  });
  if (!nextDoc) {
    await deleteArchiveDocumentBySource(ctx, {
      communityId: hydratedResource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(hydratedResource._id),
    });
    return;
  }
  await upsertArchiveDoc(ctx, nextDoc);
}

export async function backfillCommunityArchive(ctx: { db: any }, communityId: any): Promise<{
  interaction: "paginated_async";
  legacy_chat_deleted: number;
  ai_feed: number;
  resource: number;
}> {
  const activeSourceKeys = new Set<string>();
  const aiFeedRows = (await ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) => q.eq("communityId", communityId).eq("status", "live"))
    .collect()) as FeedPostRow[];
  for (const row of aiFeedRows) {
    activeSourceKeys.add(
      archiveSourceKey({
        sourceType: "ai_feed",
        sourceId: normalizeIdValue(row._id),
      }),
    );
    await upsertArchiveDocumentForAiFeedPost(ctx, row);
  }

  const resources = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityResourceLike[];
  for (const row of resources) {
    activeSourceKeys.add(
      archiveSourceKey({
        sourceType: "resource",
        sourceId: normalizeIdValue(row._id),
      }),
    );
    await upsertArchiveDocumentForResource(ctx, row);
  }

  const existingArchiveDocs = (await ctx.db
    .query("communityArchiveDocuments" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as ArchiveDocLike[];
  let legacyChatDeleted = 0;
  for (const doc of existingArchiveDocs) {
    // Canonical interaction cleanup is handled by the paginated evidence
    // backfill scheduled by the caller; do not turn this legacy archive sweep
    // back into an unbounded interaction scan.
    if (doc.sourceType === "interaction") continue;
    const key = archiveSourceKey({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
    });
    if (activeSourceKeys.has(key)) continue;
    await ctx.db.delete(doc._id as any);
    if (doc.sourceType === "chat") legacyChatDeleted += 1;
  }

  return {
    interaction: "paginated_async",
    legacy_chat_deleted: legacyChatDeleted,
    ai_feed: aiFeedRows.length,
    resource: resources.length,
  };
}
