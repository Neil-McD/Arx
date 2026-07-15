import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  MEMBER_AGENT_ATTACHMENT_UPLOAD_PATH,
  MEMBER_AGENT_MAX_IMAGE_BYTES,
  isAllowedMemberAgentImageMime,
  normalizeMemberAgentImageMime,
  normalizeMemberAgentImageName,
} from "../shared/memberAgentAttachments";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => PublicHttpAction;

type RequireAuthenticatedActor = (
  ctx: any,
  req: Request,
) => Promise<
  | {
      ok: true;
      actor: {
        dbUserId: any;
        authSubject: string;
      };
    }
  | { ok: false; response: Response }
>;

type RegisterMemberAgentAttachmentRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

function readRequiredHeader(req: Request, name: string): string {
  return String(req.headers.get(name) ?? "").trim();
}

function decodeFileName(raw: string): string {
  try {
    return normalizeMemberAgentImageName(decodeURIComponent(raw));
  } catch {
    return normalizeMemberAgentImageName(raw);
  }
}

function bytesMatch(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function inferImageMime(bytes: Uint8Array): string | null {
  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    bytesMatch(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    bytesMatch(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

function uploadErrorResponse(
  req: Request,
  jsonResponse: RegisterMemberAgentAttachmentRoutesArgs["jsonResponse"],
  error: unknown,
): Response {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("rate_limited") || message.includes("pending_limit")) {
    return jsonResponse(req, 429, { ok: false, code: "member_agent_attachment_upload_rate_limited" });
  }
  if (message.includes("thread_required") || message.includes("message_key_required")) {
    return jsonResponse(req, 400, { ok: false, code: "member_agent_attachment_request_invalid" });
  }
  if (
    message.includes("owned") ||
    message.includes("forbidden") ||
    message.includes("writable") ||
    message.includes("access")
  ) {
    return jsonResponse(req, 403, { ok: false, code: "member_agent_attachment_upload_forbidden" });
  }
  return jsonResponse(req, 500, { ok: false, code: "member_agent_attachment_upload_failed" });
}

export function registerMemberAgentAttachmentRoutes(
  args: RegisterMemberAgentAttachmentRoutesArgs,
): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;

  http.route({
    path: MEMBER_AGENT_ATTACHMENT_UPLOAD_PATH,
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: MEMBER_AGENT_ATTACHMENT_UPLOAD_PATH,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const auth = await requireAuthenticatedActor(ctx, req);
      if (!auth.ok) return auth.response;

      const threadId = readRequiredHeader(req, "x-polynet-thread-id");
      const messageKey = readRequiredHeader(req, "x-polynet-message-key");
      const fileName = decodeFileName(readRequiredHeader(req, "x-polynet-file-name"));
      const mime = normalizeMemberAgentImageMime(req.headers.get("content-type"));
      if (!threadId || !messageKey) {
        return jsonResponse(req, 400, { ok: false, code: "member_agent_attachment_request_invalid" });
      }
      if (!isAllowedMemberAgentImageMime(mime)) {
        return jsonResponse(req, 415, { ok: false, code: "member_agent_attachment_type_not_supported" });
      }
      const contentLength = Number(req.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MEMBER_AGENT_MAX_IMAGE_BYTES) {
        return jsonResponse(req, 413, { ok: false, code: "member_agent_attachment_too_large" });
      }

      let ticketKey = "";
      let storageId: any = null;
      let claimed = false;
      try {
        const prepared = (await ctx.runMutation(
          (internal as any).threads.prepareCloudMemberAgentAttachmentUploadInternal,
          {
            ownerId: auth.actor.dbUserId,
            threadId,
            messageKey,
          },
        )) as { ticketKey?: string | null } | null;
        ticketKey = String(prepared?.ticketKey ?? "").trim();
        if (!ticketKey) throw new Error("member_agent_attachment_upload_ticket_missing");

        const body = new Uint8Array(await req.arrayBuffer());
        if (body.byteLength <= 0 || body.byteLength > MEMBER_AGENT_MAX_IMAGE_BYTES) {
          return jsonResponse(req, 413, { ok: false, code: "member_agent_attachment_too_large" });
        }
        if (inferImageMime(body) !== mime) {
          return jsonResponse(req, 415, { ok: false, code: "member_agent_attachment_content_invalid" });
        }

        storageId = await ctx.storage.store(new Blob([body], { type: mime }));
        const attachment = await ctx.runMutation(
          (internal as any).threads.claimStoredCloudMemberAgentAttachmentInternal,
          {
            ownerId: auth.actor.dbUserId,
            threadId,
            storageId,
            ticketKey,
            messageKey,
            name: fileName,
          },
        );
        claimed = true;
        return jsonResponse(req, 200, { ok: true, attachment });
      } catch (error) {
        return uploadErrorResponse(req, jsonResponse, error);
      } finally {
        if (!claimed && storageId) {
          await ctx.storage.delete(storageId).catch(() => undefined);
        }
        if (!claimed && ticketKey) {
          await ctx
            .runMutation((internal as any).threads.cancelCloudMemberAgentAttachmentUploadInternal, {
              ownerId: auth.actor.dbUserId,
              ticketKey,
            })
            .catch(() => undefined);
        }
      }
    }),
  });
}
