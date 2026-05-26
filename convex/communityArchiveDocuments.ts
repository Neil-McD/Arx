import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
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

export type ArchiveSourceType = "chat" | "ai_feed" | "resource";
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

function extractChatAttachmentTexts(contentJson: unknown): string[] {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const attachments = Array.isArray((contentJson as Record<string, unknown>).attachments)
    ? ((contentJson as Record<string, unknown>).attachments as unknown[])
    : [];
  const texts: string[] = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) continue;
    const text = truncateText((attachment as Record<string, unknown>).text ?? "", 8_000);
    if (text) texts.push(text);
  }
  return texts;
}

function extractChatMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return collapseWhitespace(contentJson);
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return "";
  const record = contentJson as Record<string, unknown>;
  const parts = [
    truncateText(record.text ?? "", 20_000),
    ...extractChatAttachmentTexts(record),
  ].filter(Boolean);
  return truncateText(parts.join("\n\n"), MAX_ARCHIVE_TEXT_LENGTH);
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

function buildChatArchiveDoc(params: {
  communityId: any;
  message: CommunityChatMessageLike;
}): Omit<
  ArchiveDocLike,
  "_id" | "embeddingStatus" | "embedding" | "embeddingError" | "embeddingModel" | "embeddingDimensions" | "embeddingUpdatedAt"
> | null {
  const sourceText = extractChatMessageText(params.message.contentJson);
  if (!sourceText) return null;
  return {
    communityId: params.communityId,
    sourceType: "chat",
    sourceId: normalizeIdValue(params.message._id),
    title: undefined,
    sourceText,
    pdfText: undefined,
    text: sourceText,
    snippet: buildArchiveSnippet(null, sourceText),
    url: undefined,
    authorLabel: params.message.senderUserId ? `member:${normalizeIdValue(params.message.senderUserId)}` : "member",
    postType: undefined,
    resourceType: undefined,
    resourceRole: undefined,
    resourceStatus: undefined,
    isPdf: false,
    createdAt: params.message.createdAt,
    updatedAt: params.message.updatedAt,
  };
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

export async function upsertArchiveDocumentForChatMessage(ctx: { db: any }, params: {
  thread: CommunityChatThreadLike;
  message: CommunityChatMessageLike;
}): Promise<void> {
  await upsertArchiveDoc(
    ctx,
    buildChatArchiveDoc({
      communityId: params.thread.communityId,
      message: params.message,
    }),
  );
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
  chat: number;
  ai_feed: number;
  resource: number;
}> {
  const activeSourceKeys = new Set<string>();
  const threads = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityChatThreadLike[];
  let chatCount = 0;
  for (const thread of threads) {
    const rows = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id))
      .collect()) as CommunityChatMessageLike[];
    for (const row of rows) {
      activeSourceKeys.add(
        archiveSourceKey({
          sourceType: "chat",
          sourceId: normalizeIdValue(row._id),
        }),
      );
      await upsertArchiveDocumentForChatMessage(ctx, { thread, message: row });
      chatCount += 1;
    }
  }

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
  for (const doc of existingArchiveDocs) {
    const key = archiveSourceKey({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
    });
    if (activeSourceKeys.has(key)) continue;
    await ctx.db.delete(doc._id as any);
  }

  return {
    chat: chatCount,
    ai_feed: aiFeedRows.length,
    resource: resources.length,
  };
}
