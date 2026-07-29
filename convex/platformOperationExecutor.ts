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
import {
  listCommunityReadSummaries,
  resolveAccessibleCommunityReadDetail,
} from "./communityReadKernel.ts";

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
  input: Record<string, unknown>;
}): Promise<PlatformOperationExecutionResult> {
  const operation = getPlatformOperationContract(args.operationId);
  if (
    operation.authority === "authenticated_user" &&
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
