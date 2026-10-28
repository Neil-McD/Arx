import { internal } from "./_generated/api";
import type { registerCommunityAgentAttachmentRoutes } from "./httpCommunityAgentAttachments";
import { COMMUNITY_ATTACHMENT_DOWNLOAD_PATH, COMMUNITY_ATTACHMENT_UPLOAD_PATH, communityAttachmentByteLimit, detectCommunityAttachmentMime } from "../shared/communityAttachmentPolicy";

type RouteDependencies = Parameters<typeof registerCommunityAgentAttachmentRoutes>[0];

// Forward bounded bytes rather than buffering up to 50 MiB inside the runtime.
// The storage upload URL and its storage ID never come from the browser.
export async function prepareCommunityAttachmentStream(req: Request) {
  if (!req.body) throw new Error("community_attachment_empty");
  const reader = req.body.getReader();
  const first: Uint8Array[] = [];
  let prefixSize = 0;
  try {
    while (prefixSize < 64) {
      const item = await reader.read();
      if (item.done) break;
      first.push(item.value);
      prefixSize += item.value.length;
    }
    if (!prefixSize) throw new Error("community_attachment_empty");
    const prefix = new Uint8Array(Math.min(64, prefixSize));
    let offset = 0;
    for (const chunk of first) {
      const part = chunk.subarray(0, prefix.length - offset);
      prefix.set(part, offset);
      offset += part.length;
      if (offset === prefix.length) break;
    }
    const mime = detectCommunityAttachmentMime(prefix, (req.headers.get("content-type") ?? "").toLowerCase());
    const maxBytes = communityAttachmentByteLimit(mime);
    if (prefixSize > maxBytes || Number(req.headers.get("content-length")) > maxBytes) {
      throw new Error("community_attachment_too_large");
    }
    let total = 0;
    let completed = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const item = first.length ? { done: false, value: first.shift()! } : await reader.read();
          if (item.done) { completed = true; controller.close(); return; }
          total += item.value.length;
          if (total > maxBytes) throw new Error("community_attachment_too_large");
          controller.enqueue(item.value);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          controller.error(error);
        }
      },
      cancel: () => reader.cancel(),
    });
    return { mime, stream, bytesReceived: () => completed ? total : 0,
      cancel: () => reader.cancel().catch(() => undefined) };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

// Streams one upload into storage under a pending reservation that the post
// later claims. Shared by Studio and by community front ends (via the edge).
export async function storeCommunityAttachmentUpload(ctx: any, req: Request, scope: {
  ownerId: any; communityId: any; channelId?: any; uploadRootId?: any; messageKey: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  let attachmentId: any;
  let storageId: any;
  let finished = false;
  let upload: Awaited<ReturnType<typeof prepareCommunityAttachmentStream>> | undefined;
  try {
    upload = await prepareCommunityAttachmentStream(req);
    const fileName = decodeURIComponent(req.headers.get("x-polynet-file-name") ?? "attachment");
    const prepared = await ctx.runMutation((internal as any).communityAttachmentUploads.prepareInternal, {
      ownerId: scope.ownerId, communityId: scope.communityId, channelId: scope.channelId,
      uploadRootId: scope.uploadRootId, messageKey: scope.messageKey, name: fileName, mime: upload.mime,
    });
    attachmentId = prepared.attachmentId;
    const response = await fetch(prepared.uploadUrl, {
      method: "POST", headers: { "Content-Type": upload.mime }, body: upload.stream,
      // Node's test fetch requires duplex; Convex uses the standard streaming body.
      duplex: "half",
    } as RequestInit);
    if (!response.ok) throw new Error("community_attachment_storage_failed");
    const stored = await response.json();
    storageId = stored?.storageId;
    if (!storageId || !upload.bytesReceived()) throw new Error("community_attachment_storage_failed");
    const attachment = await ctx.runMutation((internal as any).communityAttachmentUploads.finishInternal, {
      ownerId: scope.ownerId, attachmentId, storageId,
    });
    finished = true;
    return { status: 200, body: { attachment } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("too_large") ? 413 : message.includes("pending_limit") ? 429 : 400;
    return { status, body: { code: "community_attachment_upload_failed" } };
  } finally {
    await upload?.cancel();
    if (!finished && attachmentId) {
      // Reconcile through the row: never delete a blob after a successful claim.
      await ctx.runMutation((internal as any).communityAttachmentUploads.cleanupInternal, {
        attachmentId, cancelOwnerId: scope.ownerId, ...(storageId ? { storageId } : {}),
      });
    }
  }
}

export function registerCommunityAttachmentRoutes(args: RouteDependencies) {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;
  http.route({ path: COMMUNITY_ATTACHMENT_DOWNLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: COMMUNITY_ATTACHMENT_DOWNLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    let upstream: Response | undefined;
    try {
      const attachmentId = req.headers.get("x-polynet-attachment-id");
      const queryArgs = { userId: auth.actor.dbUserId, attachmentId };
      const source = await ctx.runQuery((internal as any).communityAttachmentDownloads.resolveInternal, queryArgs);
      if (!source) return jsonResponse(req, 404, { code: "community_attachment_unavailable" });
      upstream = await fetch(source.url, { redirect: "error", signal: req.signal });
      if (!upstream.ok || !upstream.body) throw new Error("community_attachment_unavailable");
      // Permission can change while waiting for storage. Never start delivery
      // on the strength of an earlier query alone.
      const current = await ctx.runQuery((internal as any).communityAttachmentDownloads.resolveInternal, queryArgs);
      if (!current || current.url !== source.url) throw new Error("community_attachment_unavailable");
      const headers = new Headers(jsonResponse(req, 200, {}).headers);
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(source.name).replace(/'/g, "%27")}`);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "private, no-store");
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      await upstream?.body?.cancel().catch(() => undefined);
      return jsonResponse(req, 404, { code: "community_attachment_unavailable" });
    }
  }) });
  http.route({ path: COMMUNITY_ATTACHMENT_UPLOAD_PATH, method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)) });
  http.route({ path: COMMUNITY_ATTACHMENT_UPLOAD_PATH, method: "POST", handler: httpAction(async (ctx, req) => {
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    const result = await storeCommunityAttachmentUpload(ctx, req, {
      ownerId: auth.actor.dbUserId, communityId: req.headers.get("x-polynet-community-id"),
      channelId: req.headers.get("x-polynet-channel-id") || undefined,
      uploadRootId: req.headers.get("x-polynet-root-id") || undefined,
      messageKey: req.headers.get("x-polynet-message-key") ?? "",
    });
    return jsonResponse(req, result.status, result.body);
  }) });
}
