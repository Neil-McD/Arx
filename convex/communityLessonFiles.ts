import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  type LessonFileRow,
  communityResourceIsLiveModulePage,
  listAttachedLessonFiles,
  lessonFileView,
  communityResourceModuleIsLive,
  normalizeLessonLinks,
  normalizeResourceRole,
  requireCommunityChatAccess,
  requireCommunityManager,
} from "./communityCore";
import { LESSON_FILE_MAX_BYTES, LESSON_RESOURCES_MAX } from "../shared/lessonFiles";

// Files under a lesson. A host uploads one (httpCommunityLessonFiles streams
// the bytes into storage under a pending row of theirs); Save with the lesson
// attaches it; removing it, or deleting the lesson or its course, deletes the
// bytes. A pending upload never saved is deleted when it expires.

// Long enough for a host to keep writing the lesson before pressing Save.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const LATE_UPLOAD_GRACE_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_HOST = 16;


function lessonFileTitle(raw: unknown, name: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || name;
}

async function requireLessonForEditing(ctx: any, resourceId: any, userId: any) {
  const lesson = resourceId ? await ctx.db.get(resourceId) : null;
  if (!lesson || normalizeResourceRole(lesson.role) !== "page") throw new Error("lesson_file_lesson_unavailable");
  await requireCommunityManager({ ctx, communityId: lesson.communityId, userId });
  return lesson;
}

async function deleteLessonFileRow(ctx: any, row: LessonFileRow, nowMs: number) {
  if (row.storageId) {
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
    return;
  }
  // An upload still on its way: its bytes may land after this. Keep the row,
  // unclaimable, so the upload route (or the late clean-up) deletes them.
  await ctx.db.patch(row._id, { status: "failed", uploadExpiresAt: nowMs, updatedAt: nowMs });
  await ctx.scheduler.runAfter(LATE_UPLOAD_GRACE_MS, (internal as any).communityLessonFiles.cleanupInternal, { fileId: row._id });
}

// Deleting a lesson (or the course it is in) deletes its files' bytes.
export async function deleteLessonFilesForLesson(ctx: any, resourceId: any): Promise<void> {
  const nowMs = Date.now();
  for (const status of ["attached", "pending", "failed"] as const) {
    const rows = (await ctx.db.query("communityLessonFiles")
      .withIndex("by_resource_status", (q: any) => q.eq("resourceId", resourceId).eq("status", status))
      .collect()) as LessonFileRow[];
    for (const row of rows) {
      if (status === "failed" && !row.storageId) continue;
      await deleteLessonFileRow(ctx, row, nowMs);
    }
  }
}

// Links and files together stay within LESSON_RESOURCES_MAX. Used where a
// lesson's links change without its files (the guide's course changes).
export async function requireLessonResourcesWithinLimit(ctx: any, resourceId: any, linkCount: number): Promise<void> {
  const files = await listAttachedLessonFiles(ctx, resourceId);
  if (linkCount + files.length > LESSON_RESOURCES_MAX) throw new Error("lesson_resources_limit");
}

// A host's Save: `requested` is the lesson's whole list of files, in order,
// each by id with the name to show. Files on the lesson left out are removed
// (bytes and all); the host's own unsaved uploads for this lesson are
// attached. Nothing else can be named: not another lesson's file, not
// another host's upload, not an expired one.
export async function applyLessonFilesFromSave(ctx: any, args: {
  lesson: any; userId: any; requested: unknown; linkCount: number; nowMs: number;
}): Promise<void> {
  const current = await listAttachedLessonFiles(ctx, args.lesson._id);
  if (args.requested === undefined) {
    if (args.linkCount + current.length > LESSON_RESOURCES_MAX) throw new Error("lesson_resources_limit");
    return;
  }
  if (normalizeResourceRole(args.lesson.role) !== "page" || !Array.isArray(args.requested)) {
    throw new Error("lesson_file_unavailable");
  }
  if (args.linkCount + args.requested.length > LESSON_RESOURCES_MAX) throw new Error("lesson_resources_limit");
  const seen = new Set<string>();
  const next: Array<{ row: LessonFileRow; title: string }> = [];
  for (const entry of args.requested) {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const id = ctx.db.normalizeId("communityLessonFiles", String(record.id ?? ""));
    const row = id ? (await ctx.db.get(id)) as LessonFileRow | null : null;
    if (!row || seen.has(String(row._id)) || String(row.resourceId) !== String(args.lesson._id)) {
      throw new Error("lesson_file_unavailable");
    }
    const ownUpload = row.status === "pending" && row.storageId && String(row.createdByUserId) === String(args.userId)
      && (row.uploadExpiresAt ?? 0) > args.nowMs;
    if (row.status !== "attached" && !ownUpload) throw new Error("lesson_file_unavailable");
    seen.add(String(row._id));
    next.push({ row, title: lessonFileTitle(record.title, row.name) });
  }
  for (const row of current) {
    if (!seen.has(String(row._id))) await deleteLessonFileRow(ctx, row, args.nowMs);
  }
  for (const [index, { row, title }] of next.entries()) {
    await ctx.db.patch(row._id, { status: "attached", title, position: index, uploadExpiresAt: undefined, updatedAt: args.nowMs });
  }
}

// How many links a save leaves the lesson with.
export function lessonLinkCountAfterSave(lesson: any, payload: Record<string, unknown>): number {
  return normalizeLessonLinks(Object.prototype.hasOwnProperty.call(payload, "lesson_links") ? payload.lesson_links : lesson.lessonLinks).length;
}

export const prepareInternal = internalMutation({
  args: { ownerId: v.id("users"), resourceId: v.string(), name: v.string(), mime: v.string() },
  handler: async (ctx, args) => {
    const resourceId = ctx.db.normalizeId("communityResources", args.resourceId);
    const lesson = await requireLessonForEditing(ctx, resourceId, args.ownerId);
    const pending = await ctx.db.query("communityLessonFiles")
      .withIndex("by_uploader_status", (q) => q.eq("createdByUserId", args.ownerId).eq("status", "pending"))
      .take(MAX_PENDING_PER_HOST);
    if (pending.length >= MAX_PENDING_PER_HOST) throw new Error("lesson_file_pending_limit");
    const attached = await listAttachedLessonFiles(ctx, lesson._id);
    if (normalizeLessonLinks(lesson.lessonLinks).length + attached.length >= LESSON_RESOURCES_MAX) {
      throw new Error("lesson_resources_limit");
    }
    const now = Date.now();
    const name = args.name.replace(/[\r\n"\\/]+/g, " ").trim().slice(0, 200) || "file";
    const fileId = await ctx.db.insert("communityLessonFiles", {
      communityId: lesson.communityId, resourceId: lesson._id, status: "pending",
      name, title: lessonFileTitle(name, name), mimeType: args.mime, sizeBytes: 0,
      uploadExpiresAt: now + PENDING_TTL_MS, createdByUserId: args.ownerId, createdAt: now, updatedAt: now,
    });
    await ctx.scheduler.runAfter(PENDING_TTL_MS, (internal as any).communityLessonFiles.cleanupInternal, { fileId });
    // Only the authenticated HTTP handler receives this capability, never the client.
    return { fileId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const finishInternal = internalMutation({
  args: { ownerId: v.id("users"), fileId: v.id("communityLessonFiles"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.fileId);
    if (!row || row.createdByUserId !== args.ownerId || row.status !== "pending" ||
      !row.uploadExpiresAt || row.uploadExpiresAt <= Date.now()) throw new Error("lesson_file_upload_expired");
    await requireLessonForEditing(ctx, row.resourceId, args.ownerId);
    if (row.storageId && row.storageId !== args.storageId) throw new Error("lesson_file_already_stored");
    const claimed = await ctx.db.query("communityLessonFiles").withIndex("by_storage", (q) => q.eq("storageId", args.storageId)).first();
    if (claimed && claimed._id !== row._id) throw new Error("lesson_file_storage_reused");
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size <= 0 || metadata.size > LESSON_FILE_MAX_BYTES ||
      metadata.contentType !== row.mimeType) throw new Error("lesson_file_metadata_invalid");
    await ctx.db.patch(row._id, { storageId: args.storageId, sizeBytes: metadata.size,
      contentHash: metadata.sha256, updatedAt: Date.now() });
    return lessonFileView({ ...row, storageId: args.storageId, sizeBytes: metadata.size } as LessonFileRow);
  },
});

export const cleanupInternal = internalMutation({
  args: { fileId: v.id("communityLessonFiles"),
    // Only the HTTP handler may cancel its reservation early, with the blob it just received.
    cancelOwnerId: v.optional(v.id("users")), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.fileId);
    if (!row || (row.status !== "pending" && row.status !== "failed") || !row.uploadExpiresAt) return;
    const now = Date.now();
    if (args.cancelOwnerId ? row.createdByUserId !== args.cancelOwnerId : row.uploadExpiresAt > now) return;
    if (args.storageId && (!args.cancelOwnerId || (row.storageId && row.storageId !== args.storageId))) {
      throw new Error("lesson_file_cleanup_scope_mismatch");
    }
    const storageId = row.storageId ?? args.storageId;
    if (storageId) {
      const claims = await ctx.db.query("communityLessonFiles").withIndex("by_storage", (q) => q.eq("storageId", storageId)).take(2);
      if (claims.some((claim) => claim._id !== row._id)) throw new Error("lesson_file_storage_reused");
      await ctx.storage.delete(storageId);
    } else if (now < row.uploadExpiresAt + LATE_UPLOAD_GRACE_MS) {
      // Storage may still finish after expiry or cancellation: keep the row,
      // unclaimable, so the HTTP handler can reconcile its blob.
      if (row.status === "pending") {
        await ctx.db.patch(row._id, { status: "failed", updatedAt: now });
        await ctx.scheduler.runAfter(row.uploadExpiresAt + LATE_UPLOAD_GRACE_MS - now,
          (internal as any).communityLessonFiles.cleanupInternal, { fileId: row._id });
      }
      return;
    }
    await ctx.db.delete(row._id);
  },
});

// Whether this person may read this lesson right now: anyone who edits
// courses, always; a current member when the lesson is visible to members by
// the one rule (communityResourceIsMemberVisiblePage).
async function lessonReadableBy(ctx: any, lesson: any, userId: any): Promise<boolean> {
  try {
    await requireCommunityManager({ ctx, communityId: lesson.communityId, userId });
    return true;
  } catch {
    // Not a host: the member rule decides.
  }
  try {
    await requireCommunityChatAccess({ ctx, communityId: lesson.communityId, userId });
  } catch {
    return false;
  }
  const module = lesson.moduleId ? await ctx.db.get(lesson.moduleId) : null;
  const liveModuleIds = new Set<string>(
    module && String(module.communityId) === String(lesson.communityId) && communityResourceModuleIsLive(module)
      ? [String(module._id)] : [],
  );
  return communityResourceIsLiveModulePage(lesson, liveModuleIds);
}

// The HTTP handler alone is given the storage URL, and only for a file on a
// lesson the asker may read at this moment. Asked again just before the
// bytes go out, so a change in between stops the download.
export const resolveDownloadInternal = internalQuery({
  args: { userId: v.id("users"), fileId: v.string() },
  handler: async (ctx, args) => {
    const fileId = ctx.db.normalizeId("communityLessonFiles", args.fileId);
    const row = fileId ? await ctx.db.get(fileId) : null;
    if (!row || row.status !== "attached" || !row.storageId) return null;
    const lesson = await ctx.db.get(row.resourceId);
    if (!lesson || String(lesson.communityId) !== String(row.communityId) || normalizeResourceRole(lesson.role) !== "page") return null;
    if (!(await lessonReadableBy(ctx, lesson, args.userId))) return null;
    const claims = await ctx.db.query("communityLessonFiles").withIndex("by_storage", (q) => q.eq("storageId", row.storageId)).take(2);
    if (claims.length !== 1 || claims[0]._id !== row._id) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url ? { url, name: row.name, mime: row.mimeType, size: row.sizeBytes } : null;
  },
});
