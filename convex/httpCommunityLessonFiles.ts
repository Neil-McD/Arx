import { internal } from "./_generated/api";
import type { registerCommunityAgentAttachmentRoutes } from "./httpCommunityAgentAttachments";
import { prepareCommunityAttachmentStream } from "./httpCommunityAttachments";
import { LESSON_FILE_DOWNLOAD_PATH, LESSON_FILE_MAX_BYTES, LESSON_FILE_UPLOAD_PATH } from "../shared/lessonFiles";

type RouteDependencies = Parameters<typeof registerCommunityAgentAttachmentRoutes>[0];

// The twin of the post and direct-message attachment routes, for files under
// a lesson: the same streamed upload (type read from the bytes, storage URL
// and id never in the browser) and the same streamed, re-checked download.
export async function storeLessonFileUpload(ctx: any, req: Request, scope: {
  ownerId: any; resourceId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  let fileId: any;
  let storageId: any;
  let finished = false;
  let upload: Awaited<ReturnType<typeof prepareCommunityAttachmentStream>> | undefined;
  try {
    upload = await prepareCommunityAttachmentStream(req, { maxBytes: () => LESSON_FILE_MAX_BYTES, anyType: true });
    const fileName = decodeURIComponent(req.headers.get("x-polynet-file-name") ?? "file");
    const prepared = await ctx.runMutation((internal as any).communityLessonFiles.prepareInternal, {
      ownerId: scope.ownerId, resourceId: scope.resourceId, name: fileName, mime: upload.mime,
    });
    fileId = prepared.fileId;
    const response = await fetch(prepared.uploadUrl, {
      method: "POST", headers: { "Content-Type": upload.mime }, body: upload.stream,
      // Node's test fetch requires duplex; Convex uses the standard streaming body.
      duplex: "half",
    } as RequestInit);
    if (!response.ok) throw new Error("lesson_file_storage_failed");
    const stored = await response.json();
    storageId = stored?.storageId;
    if (!storageId || !upload.bytesReceived()) throw new Error("lesson_file_storage_failed");
    const file = await ctx.runMutation((internal as any).communityLessonFiles.finishInternal, {
      ownerId: scope.ownerId, fileId, storageId,
    });
    finished = true;
    return { status: 200, body: { file } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // A code the editor turns into plain words.
    const [status, code] = message.includes("too_large") ? [413, "lesson_file_too_large"]
      : message.includes("resources_limit") ? [409, "lesson_resources_limit"]
      : message.includes("pending_limit") ? [429, "lesson_file_pending_limit"]
      : message.includes("forbidden") ? [403, "lesson_file_forbidden"]
      : [400, "lesson_file_upload_failed"];
    return { status, body: { code } };
  } finally {
    await upload?.cancel();
    if (!finished && fileId) {
      // Reconcile through the row: never delete a blob after a successful claim.
      await ctx.runMutation((internal as any).communityLessonFiles.cleanupInternal, {
        fileId, cancelOwnerId: scope.ownerId, ...(storageId ? { storageId } : {}),
      });
    }
  }
}

export function registerCommunityLessonFileRoutes(args: RouteDependencies) {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;
  http.route({ path: LESSON_FILE_DOWNLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: LESSON_FILE_DOWNLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    let upstream: Response | undefined;
    try {
      const queryArgs = { userId: auth.actor.dbUserId, fileId: req.headers.get("x-polynet-lesson-file-id") ?? "" };
      const source = await ctx.runQuery((internal as any).communityLessonFiles.resolveDownloadInternal, queryArgs);
      if (!source) return jsonResponse(req, 404, { code: "lesson_file_unavailable" });
      upstream = await fetch(source.url, { redirect: "error", signal: req.signal });
      if (!upstream.ok || !upstream.body) throw new Error("lesson_file_unavailable");
      // Access can change while waiting for storage (leaving the community,
      // the course back to draft, the file removed): never start delivery on
      // an earlier answer alone.
      const current = await ctx.runQuery((internal as any).communityLessonFiles.resolveDownloadInternal, queryArgs);
      if (!current || current.url !== source.url) throw new Error("lesson_file_unavailable");
      const headers = new Headers(jsonResponse(req, 200, {}).headers);
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(source.name).replace(/'/g, "%27")}`);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "private, no-store");
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      await upstream?.body?.cancel().catch(() => undefined);
      return jsonResponse(req, 404, { code: "lesson_file_unavailable" });
    }
  }) });
  http.route({ path: LESSON_FILE_UPLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: LESSON_FILE_UPLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    const result = await storeLessonFileUpload(ctx, req, {
      ownerId: auth.actor.dbUserId, resourceId: req.headers.get("x-polynet-resource-id") ?? "",
    });
    return jsonResponse(req, result.status, result.body);
  }) });
}
