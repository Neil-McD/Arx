import productDocsIndexJson from "../docs/product/generated/index.json";
import {
  getPlatformOperationContract,
  type PlatformOperationId,
} from "../shared/platformOperationContract.ts";
import {
  executeGetProductDocTool,
  executeSearchProductDocsTool,
} from "../shared/productDocsRuntime.ts";
import type { ProductDocsSearchIndex } from "../shared/productDocsSearch.ts";
import type { CommunityEvidenceSurface } from "../shared/communityEvidenceContract.ts";
import { validateCommunitySemanticOperationInput } from "../shared/communitySemanticRepository.ts";
import {
  listCommunityReadSummaries,
  resolveAccessibleCommunityReadDetail,
} from "./communityReadKernel.ts";
import { internal } from "./_generated/api";

const productDocsIndex = productDocsIndexJson as ProductDocsSearchIndex;

export type PlatformOperationExecutionResult =
  | { ok: true; value: unknown }
  | { ok: false; code: string; message: string; value?: unknown };

function requiredString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function executePlatformOperation(args: {
  operationId: PlatformOperationId;
  ctx?: any;
  authSubject?: string | null;
  userId?: any;
  communityId?: any;
  communitySlug?: string | null;
  evidenceSurface?: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PlatformOperationExecutionResult> {
  const operation = getPlatformOperationContract(args.operationId);
  if (
    operation.authority.actor === "authenticated_user" &&
    !requiredString(args.authSubject)
  ) {
    return {
      ok: false,
      code: "authenticated_user_required",
      message: "An authenticated user is required.",
    };
  }

  if (operation.executor === "communityRead.list") {
    const listed = await listCommunityReadSummaries({
      ctx: args.ctx,
      authSubject: String(args.authSubject),
      scope: args.input.scope,
    });
    if (!listed.ok) {
      return {
        ok: false,
        code: listed.code,
        message: "scope must be joined or discover.",
      };
    }
    return {
      ok: true,
      value: {
        communities: listed.communities,
      },
    };
  }

  if (operation.executor === "communityRead.read") {
    const communitySlug = requiredString(args.input.communitySlug);
    if (!communitySlug) {
      return {
        ok: false,
        code: "community_slug_required",
        message: "community_slug is required.",
      };
    }
    const resolved = await resolveAccessibleCommunityReadDetail({
      ctx: args.ctx,
      authSubject: String(args.authSubject),
      communitySlug,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.code,
        message: "Community not found or not accessible.",
      };
    }
    return {
      ok: true,
      value: {
        community: resolved.community,
      },
    };
  }

  if (
    operation.executor === "communitySemantic.list" ||
    operation.executor === "communitySemantic.read"
  ) {
    if (!args.ctx) {
      return {
        ok: false,
        code: "platform_operation_context_required",
        message: "A server execution context is required.",
      };
    }
    const communitySlug = requiredString(args.communitySlug);
    const hasCommunityId = Boolean(args.communityId);
    const hasCommunitySlug = Boolean(communitySlug);
    if (hasCommunityId === hasCommunitySlug) {
      return {
        ok: false,
        code: "community_selector_invalid",
        message: "Exactly one verified community selector is required.",
      };
    }
    const validated = validateCommunitySemanticOperationInput({
      operation:
        operation.executor === "communitySemantic.list" ? "list" : "read",
      path: args.input.path,
      cursor: args.input.cursor,
      limit: args.input.limit,
      offset: args.input.offset,
    });
    if (!validated.ok) {
      return {
        ok: false,
        code: validated.code,
        message: validated.message,
      };
    }
    try {
      const payload = (await (
        operation.executor === "communitySemantic.list"
          ? args.ctx.runQuery(
              (internal as any).communityCapabilityContext
                .resolveCommunitySemanticRepositoryInternal,
              {
                authSubject: String(args.authSubject),
                ...(args.userId ? { userId: args.userId } : null),
                ...(hasCommunityId ? { communityId: args.communityId } : null),
                ...(communitySlug ? { communitySlug } : null),
                operation: "list",
                path: validated.path,
                cursor:
                  validated.operation === "list"
                    ? validated.cursor
                    : null,
                limit:
                  validated.operation === "list" &&
                  validated.limit !== null
                    ? validated.limit
                    : undefined,
              },
            )
          : args.ctx.runAction(
              (internal as any).communityCapabilityContext
                .readCommunitySemanticRepositoryInternal,
              {
                authSubject: String(args.authSubject),
                ...(args.userId ? { userId: args.userId } : null),
                ...(hasCommunityId ? { communityId: args.communityId } : null),
                ...(communitySlug ? { communitySlug } : null),
                path: validated.path,
                offset:
                  validated.operation === "read" &&
                  validated.offset !== null
                    ? validated.offset
                    : undefined,
                limit:
                  validated.operation === "read" &&
                  validated.limit !== null
                    ? validated.limit
                    : undefined,
                surface: args.evidenceSurface ?? "member_agent_dock",
              },
            )
      )) as {
        ok?: boolean;
        code?: unknown;
        message?: unknown;
        result?: unknown;
      };
      if (payload?.ok !== true || payload.result === undefined) {
        return {
          ok: false,
          code: String(payload?.code ?? "community_semantic_read_failed"),
          message:
            requiredString(payload?.message) ??
            "Semantic path not found or not accessible.",
          value: payload,
        };
      }
      return {
        ok: true,
        value: payload.result,
      };
    } catch (error) {
      return {
        ok: false,
        code: "community_semantic_read_failed",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Community semantic read failed.",
      };
    }
  }

  if (operation.executor === "productDocs.search") {
    const query = requiredString(args.input.query);
    if (!query) {
      return {
        ok: false,
        code: "product_docs_query_required",
        message: "query is required.",
      };
    }
    return {
      ok: true,
      value: executeSearchProductDocsTool({
        index: productDocsIndex,
        query,
        limit: typeof args.input.limit === "number" ? args.input.limit : undefined,
        section:
          typeof args.input.section === "string" ? args.input.section : undefined,
        audience:
          typeof args.input.audience === "string" ? args.input.audience : undefined,
      }),
    };
  }

  if (operation.executor === "productDocs.read") {
    const slug = requiredString(args.input.slug);
    if (!slug) {
      return {
        ok: false,
        code: "product_doc_slug_required",
        message: "slug is required.",
      };
    }
    const productDoc = executeGetProductDocTool({
      index: productDocsIndex,
      slug,
      heading:
        typeof args.input.heading === "string" ? args.input.heading : undefined,
    });
    if (!productDoc.ok) {
      return {
        ok: false,
        code: productDoc.code,
        message: productDoc.message,
        value: productDoc,
      };
    }
    return {
      ok: true,
      value: productDoc,
    };
  }
  return {
    ok: false,
    code: "platform_operation_executor_missing",
    message: `No executor is registered for ${operation.id}.`,
  };
}
