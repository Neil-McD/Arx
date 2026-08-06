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
import {
  renderPlatformUserProfileMarkdown,
  validateCommunitySemanticOperationInput,
  validatePolynetSemanticRepositoryOperationInput,
  type PlatformUserProfileSemanticSource,
} from "../shared/communitySemanticRepository.ts";
import {
  buildPolynetCommunitiesDirectory,
  buildPolynetPlatformRootDirectory,
  buildPolynetUserDirectory,
  buildPolynetUsersRootDirectory,
  mountCommunitySemanticResult,
  parsePolynetSemanticRepositoryPath,
  type PolynetSemanticMount,
} from "../shared/polynetSemanticRepositoryContract.ts";
import { parseCommunityResourceEvidenceRef } from "../shared/communityEvidenceContract.ts";
import { parseCommunityResourceDirectoryUri } from "../shared/communityResourceDirectory.ts";
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
  semanticMount?: PolynetSemanticMount;
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
    const requestedOperation =
      operation.executor === "communitySemantic.list" ? "list" : "read";
    const suppliedCommunitySlug = requiredString(args.communitySlug);
    const suppliedCommunityId = Boolean(args.communityId);
    const suppliedCommunitySelector =
      suppliedCommunityId || Boolean(suppliedCommunitySlug);
    const semanticMount =
      args.semanticMount ??
      (suppliedCommunitySelector
        ? {
            kind: "community" as const,
            ...(suppliedCommunityId
              ? { communityId: String(args.communityId) }
              : null),
            ...(suppliedCommunitySlug
              ? { communitySlug: suppliedCommunitySlug }
              : null),
          }
        : { kind: "platform" as const });
    if (semanticMount.kind === "platform" && suppliedCommunitySelector) {
      return {
        ok: false,
        code: "community_selector_invalid",
        message:
          "Platform-mounted repository calls cannot supply a community selector.",
      };
    }
    const validatedRepositoryInput =
      semanticMount.kind === "community"
        ? validateCommunitySemanticOperationInput({
            operation: requestedOperation,
            path: args.input.path,
            cursor: args.input.cursor,
            limit: args.input.limit,
            offset: args.input.offset,
          })
        : validatePolynetSemanticRepositoryOperationInput({
            operation: requestedOperation,
            path: args.input.path,
            cursor: args.input.cursor,
            limit: args.input.limit,
            offset: args.input.offset,
          });
    if (!validatedRepositoryInput.ok) {
      return {
        ok: false,
        code: validatedRepositoryInput.code,
        message: validatedRepositoryInput.message,
      };
    }

    let communityId =
      semanticMount.kind === "community"
        ? (requiredString(semanticMount.communityId) ?? args.communityId)
        : null;
    let communitySlug =
      semanticMount.kind === "community"
        ? (requiredString(semanticMount.communitySlug) ?? suppliedCommunitySlug)
        : null;
    let mountedCommunitySlug: string | null = null;
    let semanticInput: Record<string, unknown> =
      validatedRepositoryInput.operation === "list"
        ? {
            path: validatedRepositoryInput.path,
            ...(validatedRepositoryInput.cursor
              ? { cursor: validatedRepositoryInput.cursor }
              : null),
            ...(validatedRepositoryInput.limit !== null
              ? { limit: validatedRepositoryInput.limit }
              : null),
          }
        : {
            path: validatedRepositoryInput.path,
            ...(validatedRepositoryInput.offset !== null
              ? { offset: validatedRepositoryInput.offset }
              : null),
            ...(validatedRepositoryInput.limit !== null
              ? { limit: validatedRepositoryInput.limit }
              : null),
          };

    if (semanticMount.kind === "platform") {
      const resourceSelector =
        parseCommunityResourceEvidenceRef(semanticInput.path) ||
        parseCommunityResourceDirectoryUri(semanticInput.path);
      if (resourceSelector) {
        const resourceMount = (await args.ctx.runQuery(
          (internal as any).communityCapabilityContext
            .resolvePlatformSemanticResourceMountInternal,
          {
            authSubject: String(args.authSubject),
            ...(args.userId ? { userId: args.userId } : null),
            selector: String(semanticInput.path),
          },
        )) as
          | {
              ok: true;
              communityId: string;
              communitySlug: string;
            }
          | { ok: false; code: string; message: string };
        if (!resourceMount.ok) {
          return {
            ok: false,
            code: resourceMount.code,
            message: resourceMount.message,
          };
        }
        communityId = resourceMount.communityId;
        mountedCommunitySlug = resourceMount.communitySlug;
      } else {
        const parsedRepositoryPath = parsePolynetSemanticRepositoryPath(
          semanticInput.path,
        );
        if (!parsedRepositoryPath.ok) {
          return {
            ok: false,
            code: parsedRepositoryPath.code,
            message: parsedRepositoryPath.message,
          };
        }
        if (parsedRepositoryPath.kind === "platform_root") {
          return { ok: true, value: buildPolynetPlatformRootDirectory() };
        }
        if (parsedRepositoryPath.kind === "communities_root") {
          const cursor = semanticInput.cursor;
          const limit = semanticInput.limit;
          type CommunityDirectoryPage =
            | {
                ok: true;
                communities: Array<{
                  slug: string;
                  name: string;
                  relation: string;
                }>;
                nextCursor: string | null;
                skippedIncomplete: number;
              }
            | { ok: false; code: string };
          let pageCursor =
            typeof cursor === "string" && cursor ? cursor : null;
          const callerSuppliedCursor = Boolean(pageCursor);
          let listed: CommunityDirectoryPage | null = null;
          let skippedIncomplete = 0;
          try {
            for (let attempt = 0; attempt < 2; attempt += 1) {
              listed = (await args.ctx.runQuery(
                (internal as any).communityCapabilityContext
                  .listAccessibleCommunityDirectoryPageInternal,
                {
                  authSubject: String(args.authSubject),
                  ...(args.userId ? { userId: args.userId } : null),
                  ...(pageCursor ? { cursor: pageCursor } : null),
                  ...(typeof limit === "number" ? { limit } : null),
                },
              )) as CommunityDirectoryPage;
              if (listed.ok) {
                skippedIncomplete += listed.skippedIncomplete;
              }
              if (
                !listed.ok ||
                listed.communities.length > 0 ||
                !listed.nextCursor
              ) {
                break;
              }
              pageCursor = listed.nextCursor;
            }
          } catch {
            return {
              ok: false,
              code: callerSuppliedCursor
                ? "invalid_selector"
                : "semantic_context_unavailable",
              message: callerSuppliedCursor
                ? "The communities directory cursor is invalid."
                : "Community listing failed.",
            };
          }
          if (!listed) {
            return {
              ok: false,
              code: "semantic_context_unavailable",
              message: "Community listing failed.",
            };
          }
          if (!listed.ok) {
            return {
              ok: false,
              code: "invalid_selector",
              message: "The communities directory cursor is invalid.",
            };
          }
          return {
            ok: true,
            value: buildPolynetCommunitiesDirectory({
              communities: listed.communities,
              nextCursor: listed.nextCursor,
              skippedIncomplete,
            }),
          };
        }
        if (parsedRepositoryPath.kind === "users_root") {
          return { ok: true, value: buildPolynetUsersRootDirectory() };
        }
        if (
          parsedRepositoryPath.kind === "user_root" ||
          parsedRepositoryPath.kind === "user_profile"
        ) {
          const profile = (await args.ctx.runQuery(
            (internal as any).communityCapabilityContext
              .resolvePlatformUserSemanticProfileInternal,
            {
              authSubject: String(args.authSubject),
              ...(args.userId ? { userId: args.userId } : null),
              userSelector: parsedRepositoryPath.userSelector,
            },
          )) as
            | { ok: true; source: PlatformUserProfileSemanticSource }
            | { ok: false; code: string; message: string };
          if (!profile.ok) {
            return {
              ok: false,
              code: profile.code,
              message: profile.message,
            };
          }
          if (parsedRepositoryPath.kind === "user_root") {
            return {
              ok: true,
              value: buildPolynetUserDirectory({
                path: parsedRepositoryPath.path,
                profilePath: profile.source.profilePath,
                ref: profile.source.userRef,
                name: profile.source.displayName,
              }),
            };
          }
          return {
            ok: true,
            value: {
              path: parsedRepositoryPath.path,
              ref: profile.source.userRef,
              body: renderPlatformUserProfileMarkdown(profile.source),
              truncated: false,
            },
          };
        }
        communitySlug = parsedRepositoryPath.communitySlug;
        mountedCommunitySlug = parsedRepositoryPath.communitySlug;
        semanticInput = {
          ...semanticInput,
          path: parsedRepositoryPath.localPath,
        };
      }
    }

    const hasCommunityId = Boolean(communityId);
    const hasCommunitySlug = Boolean(communitySlug);
    if (hasCommunityId === hasCommunitySlug) {
      return {
        ok: false,
        code: "community_selector_invalid",
        message: "Exactly one verified community selector is required.",
      };
    }
    const validated = validateCommunitySemanticOperationInput({
      operation: requestedOperation,
      path: semanticInput.path,
      cursor: semanticInput.cursor,
      limit: semanticInput.limit,
      offset: semanticInput.offset,
    });
    if (!validated.ok) {
      return {
        ok: false,
        code: validated.code,
        message: validated.message,
      };
    }
    try {
      const payload = (await (operation.executor === "communitySemantic.list"
        ? args.ctx.runQuery(
            (internal as any).communityCapabilityContext
              .resolveCommunitySemanticRepositoryInternal,
            {
              authSubject: String(args.authSubject),
              ...(args.userId ? { userId: args.userId } : null),
              ...(hasCommunityId ? { communityId } : null),
              ...(communitySlug ? { communitySlug } : null),
              operation: "list",
              path: validated.path,
              cursor: validated.operation === "list" ? validated.cursor : null,
              limit:
                validated.operation === "list" && validated.limit !== null
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
              ...(hasCommunityId ? { communityId } : null),
              ...(communitySlug ? { communitySlug } : null),
              path: validated.path,
              offset:
                validated.operation === "read" && validated.offset !== null
                  ? validated.offset
                  : undefined,
              limit:
                validated.operation === "read" && validated.limit !== null
                  ? validated.limit
                  : undefined,
              surface: args.evidenceSurface ?? "member_agent_dock",
            },
          ))) as {
        ok?: boolean;
        code?: unknown;
        message?: unknown;
        result?: unknown;
      };
      if (payload?.ok !== true || payload.result === undefined) {
        const payloadCode = String(
          payload?.code ?? "community_semantic_read_failed",
        );
        const platformAccessFailure =
          Boolean(mountedCommunitySlug) &&
          new Set([
            "community_not_accessible",
            "community_access_closed",
            "community_access_unavailable",
            "invalid_community_slug",
          ]).has(payloadCode);
        return {
          ok: false,
          code: platformAccessFailure ? "semantic_not_found" : payloadCode,
          message: platformAccessFailure
            ? "Semantic path not found or not accessible."
            : (requiredString(payload?.message) ??
              "Semantic path not found or not accessible."),
          value: payload,
        };
      }
      return {
        ok: true,
        value: mountedCommunitySlug
          ? mountCommunitySemanticResult({
              communitySlug: mountedCommunitySlug,
              result: payload.result as Record<string, unknown>,
            })
          : payload.result,
      };
    } catch (error) {
      const communityAccessClosed =
        error instanceof Error && error.message === "community_archived";
      return {
        ok: false,
        code: communityAccessClosed
          ? "semantic_not_found"
          : "community_semantic_read_failed",
        message: communityAccessClosed
          ? "Semantic path not found or not accessible."
          : error instanceof Error && error.message
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
        limit:
          typeof args.input.limit === "number" ? args.input.limit : undefined,
        section:
          typeof args.input.section === "string"
            ? args.input.section
            : undefined,
        audience:
          typeof args.input.audience === "string"
            ? args.input.audience
            : undefined,
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
