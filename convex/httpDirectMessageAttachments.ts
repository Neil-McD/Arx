import { internal } from "./_generated/api";
import type { registerCommunityAgentAttachmentRoutes } from "./httpCommunityAgentAttachments";
import { prepareCommunityAttachmentStream } from "./httpCommunityAttachments";
import { DIRECT_MESSAGE_ATTACHMENT_DOWNLOAD_PATH, DIRECT_MESSAGE_ATTACHMENT_UPLOAD_PATH } from "../shared/communityAttachmentPolicy";

type RouteDependencies = Parameters<typeof registerCommunityAgentAttachmentRoutes>[0];

// Streams one upload into storage under the sender's reservation, which a send
// later claims. The upload URL and the storage id never reach the browser, and
// the type is read from the bytes, not from what the browser says.
export async function storeDirectMessageAttachmentUpload(ctx: any, req: Request, scope: {
  ownerId: any; conversationId?: string; targetUserId?: string; communityId?: string; messageKey: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  let attachmentId: any;
  let storageId: any;
  let finished = false;
  let upload: Awaited<ReturnType<typeof prepareCommunityAttachmentStream>> | undefined;
  try {
    upload = await prepareCommunityAttachmentStream(req);
    const fileName = decodeURIComponent(req.headers.get("x-polynet-file-name") ?? "attachment");
    const prepared = await ctx.runMutation((internal as any).directMessageAttachments.prepareInternal, {
      ownerId: scope.ownerId, conversationId: scope.conversationId, targetUserId: scope.targetUserId,
      communityId: scope.communityId, messageKey: scope.messageKey, name: fileName, mime: upload.mime,
    });
    attachmentId = prepared.attachmentId;
    const response = await fetch(prepared.uploadUrl, {
      method: "POST", headers: { "Content-Type": upload.mime }, body: upload.stream,
      // Node's test fetch requires duplex; Convex uses the standard streaming body.
      duplex: "half",
    } as RequestInit);
    if (!response.ok) throw new Error("dm_attachment_storage_failed");
    const stored = await response.json();
    storageId = stored?.storageId;
    if (!storageId || !upload.bytesReceived()) throw new Error("dm_attachment_storage_failed");
    const attachment = await ctx.runMutation((internal as any).directMessageAttachments.finishInternal, {
      ownerId: scope.ownerId, attachmentId, storageId,
    });
    finished = true;
    return { status: 200, body: { attachment } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("too_large") ? 413 : message.includes("pending_limit") ? 429
      : message.includes("access_required") || message.includes("participant_required") ? 403 : 400;
    return { status, body: { code: "dm_attachment_upload_failed" } };
  } finally {
    await upload?.cancel();
    if (!finished && attachmentId) {
      // Reconcile through the row: never delete a blob after a successful claim.
      await ctx.runMutation((internal as any).directMessageAttachments.cleanupInternal, {
        attachmentId, cancelOwnerId: scope.ownerId, ...(storageId ? { storageId } : {}),
      });
    }
  }
}

export function registerDirectMessageAttachmentRoutes(args: RouteDependencies) {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;
  http.route({ path: DIRECT_MESSAGE_ATTACHMENT_DOWNLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: DIRECT_MESSAGE_ATTACHMENT_DOWNLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    let upstream: Response | undefined;
    try {
      const queryArgs = { userId: auth.actor.dbUserId, attachmentId: req.headers.get("x-polynet-attachment-id") ?? "" };
      const source = await ctx.runQuery((internal as any).directMessageAttachments.resolveDownloadInternal, queryArgs);
      if (!source) return jsonResponse(req, 404, { code: "dm_attachment_unavailable" });
      upstream = await fetch(source.url, { redirect: "error", signal: req.signal });
      if (!upstream.ok || !upstream.body) throw new Error("dm_attachment_unavailable");
      // Access can change while waiting for storage (a block, leaving the
      // conversation): never start delivery on an earlier answer alone.
      const current = await ctx.runQuery((internal as any).directMessageAttachments.resolveDownloadInternal, queryArgs);
      if (!current || current.url !== source.url) throw new Error("dm_attachment_unavailable");
      const headers = new Headers(jsonResponse(req, 200, {}).headers);
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(source.name).replace(/'/g, "%27")}`);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "private, no-store");
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      await upstream?.body?.cancel().catch(() => undefined);
      return jsonResponse(req, 404, { code: "dm_attachment_unavailable" });
    }
  }) });
  http.route({ path: DIRECT_MESSAGE_ATTACHMENT_UPLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: DIRECT_MESSAGE_ATTACHMENT_UPLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    const result = await storeDirectMessageAttachmentUpload(ctx, req, {
      ownerId: auth.actor.dbUserId,
      conversationId: req.headers.get("x-polynet-conversation-id") || undefined,
      targetUserId: req.headers.get("x-polynet-target-user-id") || undefined,
      communityId: req.headers.get("x-polynet-community-id") || undefined,
      messageKey: req.headers.get("x-polynet-message-key") ?? "",
    });
    return jsonResponse(req, result.status, result.body);
  }) });
}
