import { api, internal } from "./_generated/api";
import type { CommunityEvidenceSurface } from "../shared/communityEvidenceContract.ts";
import {
  parseCommunityAiFeedEvidenceRef,
  parseCommunityInteractionEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import {
  POLYNET_AI_FEED_DIRECTORY_PATH,
  POLYNET_BUILDER_DIRECTORY_PATH,
  POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH,
  POLYNET_CAPABILITIES_DIRECTORY_PATH,
  POLYNET_CHANNELS_DIRECTORY_PATH,
  POLYNET_DEFAULT_CHANNEL_DIRECTORY_PATH,
  POLYNET_MEMORY_DIRECTORY_PATH,
  POLYNET_RESOURCES_DIRECTORY_PATH,
} from "../shared/communitySemanticRepository.ts";
import {
  derivePolynetCommunityAgentAuthority,
  derivePolynetHumanAuthority,
  type PolynetPrincipalKind,
  type PolynetResolvedAuthority,
} from "../shared/polynetAuthority.ts";
import {
  POLYNET_CANONICAL_TOOL_DEFINITIONS,
  type PolynetCanonicalToolName,
} from "../shared/polynetCanonicalToolContract.ts";
import { parsePolynetSemanticRepositoryPath } from "../shared/polynetSemanticRepositoryContract.ts";
import { normalizeToolArguments } from "../shared/toolRegistry.ts";
import { executePlatformOperation } from "./platformOperationExecutor.ts";

export type PolynetCanonicalExecutionResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: string; message: string; value?: unknown };

type ResolvedCommunityTarget = {
  communityId: string;
  communitySlug: string;
  localPath: string;
  authority: PolynetResolvedAuthority;
};

type PolynetMutatingToolName = "polynet_write" | "polynet_call";

const MEMORY_TYPES = new Set([
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
]);

const BUILDER_CAPABILITIES = [
  "community.resources.changeset.status",
  "community.resources.changeset.approve",
  "community.resources.changeset.reject",
  "community.resources.changeset.apply",
] as const;

const MEMBER_CAPABILITIES = [
  "community.memory.record_outcome",
] as const;

function canonicalError(
  code: string,
  message: string,
  value?: unknown,
): PolynetCanonicalExecutionResult {
  return {
    ok: false,
    code,
    message,
    ...(value === undefined ? {} : { value }),
  };
}

function requiredString(value: unknown, maxLength = 2_000): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function mountedPath(communitySlug: string, localPath: string): string {
  return localPath === "/"
    ? `/communities/${communitySlug}/`
    : `/communities/${communitySlug}${localPath}`;
}

function virtualDirectory(args: {
  path: string;
  entries?: Array<Record<string, unknown>>;
  searchable?: boolean;
  writable?: boolean;
}) {
  return {
    path: args.path,
    entries: args.entries ?? [],
    next_cursor: null,
    truncated: false,
    skipped_incomplete: 0,
    ...(args.searchable === undefined
      ? {}
      : { searchable: args.searchable }),
    ...(args.writable === undefined ? {} : { writable: args.writable }),
  };
}

function canonicalReceipt(args: {
  toolName: PolynetCanonicalToolName;
  principalKind: PolynetPrincipalKind;
  target: ResolvedCommunityTarget;
  idempotencyKey?: string | null;
  deduped?: boolean;
}) {
  return {
    contract: "polynet.canonical.operation:v1",
    tool: args.toolName,
    principal_kind: args.principalKind,
    community_id: args.target.communityId,
    community_slug: args.target.communitySlug,
    authority_lane: args.target.authority.lane,
    relation: args.target.authority.relation,
    ...(args.idempotencyKey
      ? { idempotency_key: args.idempotencyKey }
      : {}),
    deduped: args.deduped === true,
  };
}

function stableRequestValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableRequestValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableRequestValue(nested)]),
  );
}

function omitNullishObjectFields(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) => {
        if (nested === null || nested === undefined) return [];
        if (Array.isArray(nested)) {
          return [
            [
              key,
              nested.map((entry) =>
                entry && typeof entry === "object" && !Array.isArray(entry)
                  ? omitNullishObjectFields(entry)
                  : entry,
              ),
            ],
          ];
        }
        return [
          [
            key,
            nested && typeof nested === "object"
              ? omitNullishObjectFields(nested)
              : nested,
          ],
        ];
      },
    ),
  );
}

function operationRequestFingerprint(input: Record<string, unknown>): string {
  return JSON.stringify(stableRequestValue(input));
}

function replayedOperationValue(value: unknown): Record<string, unknown> {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { result: value };
  const receipt =
    record.receipt &&
    typeof record.receipt === "object" &&
    !Array.isArray(record.receipt)
      ? (record.receipt as Record<string, unknown>)
      : null;
  return {
    ...record,
    deduped: true,
    ...(receipt ? { receipt: { ...receipt, deduped: true } } : {}),
  };
}

async function reserveMutatingOperation(args: {
  ctx: any;
  userId: string;
  principalKind: PolynetPrincipalKind;
  target: ResolvedCommunityTarget;
  toolName: PolynetMutatingToolName;
  idempotencyKey: string;
  input: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      status: "reserved";
      requestFingerprint: string;
      attemptToken: string;
    }
  | {
      ok: true;
      status: "completed";
      requestFingerprint: string;
      completedValue: Record<string, unknown>;
    }
  | { ok: false; result: PolynetCanonicalExecutionResult }
> {
  const requestFingerprint = operationRequestFingerprint(args.input);
  const reservation = (await args.ctx.runMutation(
    (internal as any).polynetCanonicalReceipts
      .reserveCanonicalOperationReceiptInternal,
    {
      communityId: args.target.communityId,
      userId: args.userId,
      principalKind: args.principalKind,
      toolName: args.toolName,
      idempotencyKey: args.idempotencyKey,
      requestFingerprint,
    },
  )) as Record<string, unknown>;
  if (reservation.ok !== true) {
    return {
      ok: false,
      result: canonicalError(
        String(reservation.code ?? "idempotency_key_conflict"),
        String(
          reservation.message ??
            "This idempotency key conflicts with an earlier request.",
        ),
        typeof reservation.retryAfterMs === "number"
          ? { retry_after_ms: reservation.retryAfterMs }
          : undefined,
      ),
    };
  }
  if (reservation.status === "completed") {
    return {
      ok: true,
      status: "completed",
      requestFingerprint,
      completedValue: replayedOperationValue(reservation.result),
    };
  }
  const attemptToken = requiredString(reservation.attemptToken, 256);
  if (!attemptToken) {
    return {
      ok: false,
      result: canonicalError(
        "operation_receipt_invalid",
        "The operation receipt did not return an attempt token.",
      ),
    };
  }
  return {
    ok: true,
    status: "reserved",
    requestFingerprint,
    attemptToken,
  };
}

async function completeMutatingOperation(args: {
  ctx: any;
  userId: string;
  principalKind: PolynetPrincipalKind;
  target: ResolvedCommunityTarget;
  toolName: PolynetMutatingToolName;
  idempotencyKey: string;
  requestFingerprint: string;
  attemptToken: string;
  value: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const completed = (await args.ctx.runMutation(
    (internal as any).polynetCanonicalReceipts
      .completeCanonicalOperationReceiptInternal,
    {
      communityId: args.target.communityId,
      userId: args.userId,
      principalKind: args.principalKind,
      toolName: args.toolName,
      idempotencyKey: args.idempotencyKey,
      requestFingerprint: args.requestFingerprint,
      attemptToken: args.attemptToken,
      result: args.value,
    },
  )) as Record<string, unknown>;
  return completed.deduped === true
    ? replayedOperationValue(completed.result)
    : args.value;
}

async function failMutatingOperation(args: {
  ctx: any;
  userId: string;
  principalKind: PolynetPrincipalKind;
  target: ResolvedCommunityTarget;
  toolName: PolynetMutatingToolName;
  idempotencyKey: string;
  requestFingerprint: string;
  attemptToken: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  try {
    await args.ctx.runMutation(
      (internal as any).polynetCanonicalReceipts
        .failCanonicalOperationReceiptInternal,
      {
        communityId: args.target.communityId,
        userId: args.userId,
        principalKind: args.principalKind,
        toolName: args.toolName,
        idempotencyKey: args.idempotencyKey,
        requestFingerprint: args.requestFingerprint,
        attemptToken: args.attemptToken,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
      },
    );
  } catch {
    // Preserve the original operation error. A crashed or superseded attempt is
    // recoverable through the bounded receipt lease.
  }
}

async function resolveCommunityTarget(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  path: unknown;
}): Promise<
  | { ok: true; target: ResolvedCommunityTarget }
  | { ok: false; code: string; message: string }
> {
  const parsed = parsePolynetSemanticRepositoryPath(args.path);
  if (!parsed.ok || parsed.kind !== "community") {
    return {
      ok: false,
      code: parsed.ok ? "community_path_required" : parsed.code,
      message: parsed.ok
        ? "This operation requires an exact community repository path."
        : parsed.message,
    };
  }
  const resolved = (await args.ctx.runQuery(
    (internal as any).communityCapabilityContext
      .resolveCommunityCapabilityContextInternal,
    {
      authSubject: args.authSubject,
      communitySlug: parsed.communitySlug,
    },
  )) as
    | {
        ok: true;
        context: {
          communityId: string;
          communitySlug: string;
          access: Record<string, unknown>;
        };
      }
    | { ok: false; code: string };
  if (!resolved.ok) {
    return {
      ok: false,
      code: "semantic_not_found",
      message: "Community path not found or not accessible.",
    };
  }
  if (
    args.mountedCommunityId &&
    String(args.mountedCommunityId) !== String(resolved.context.communityId)
  ) {
    return {
      ok: false,
      code: "community_context_mismatch",
      message: "The requested path is outside the active community context.",
    };
  }
  const authority =
    args.principalKind === "community_agent"
      ? derivePolynetCommunityAgentAuthority()
      : derivePolynetHumanAuthority({
          access: resolved.context.access,
          principalKind: args.principalKind,
        });
  if (!authority) {
    return {
      ok: false,
      code: "community_access_closed",
      message: "Community path not found or not accessible.",
    };
  }
  return {
    ok: true,
    target: {
      communityId: String(resolved.context.communityId),
      communitySlug: resolved.context.communitySlug,
      localPath: parsed.localPath,
      authority,
    },
  };
}

function evidencePath(args: {
  communitySlug: string;
  sourceType: string;
  ref: string;
}): string | null {
  if (args.sourceType === "interaction") {
    return `/communities/${args.communitySlug}/channels/general/${args.ref}.md`;
  }
  if (args.sourceType === "ai_feed") {
    return `/communities/${args.communitySlug}/ai-feed/${args.ref}.md`;
  }
  return null;
}

function mountSearchResults(args: {
  communitySlug: string;
  path: string;
  results: Array<Record<string, unknown>>;
  retrievalId?: unknown;
  truncated?: unknown;
}) {
  return {
    path: args.path,
    results: args.results.map((result) => {
      const ref = requiredString(result.ref, 512);
      const sourceType = requiredString(result.source_type, 40);
      const localPath = requiredString(result.path, 1_024);
      const canonicalLocalPath =
        localPath &&
        [
          POLYNET_RESOURCES_DIRECTORY_PATH,
          POLYNET_CHANNELS_DIRECTORY_PATH,
          POLYNET_AI_FEED_DIRECTORY_PATH,
          POLYNET_MEMORY_DIRECTORY_PATH,
        ].some((prefix) => localPath.startsWith(prefix))
          ? localPath
          : null;
      const path =
        canonicalLocalPath
          ? mountedPath(args.communitySlug, canonicalLocalPath)
          : ref && sourceType
          ? evidencePath({
              communitySlug: args.communitySlug,
              sourceType,
              ref,
            })
          : null;
      return {
        ...result,
        ...(path ? { path } : {}),
      };
    }),
    truncated: args.truncated === true,
    ...(args.retrievalId
      ? { retrieval_id: String(args.retrievalId) }
      : {}),
  };
}

function canonicalJsonDocument(args: {
  target: ResolvedCommunityTarget;
  localPath: string;
  payload: unknown;
  ref?: string | null;
  retrievalId?: unknown;
}): Record<string, unknown> {
  const fullBody = JSON.stringify(args.payload, null, 2) ?? "null";
  const body = fullBody.slice(0, 24_000);
  return {
    path: mountedPath(args.target.communitySlug, args.localPath),
    body,
    truncated: body.length < fullBody.length,
    ...(args.ref ? { ref: args.ref } : {}),
    total_chars: fullBody.length,
    next_offset: body.length < fullBody.length ? body.length : null,
    ...(args.retrievalId
      ? { retrieval_id: String(args.retrievalId) }
      : {}),
  };
}

function capabilityDocument(args: {
  target: ResolvedCommunityTarget;
  operation: string;
}): Record<string, unknown> | null {
  const isMemberCapability = (MEMBER_CAPABILITIES as readonly string[]).includes(
    args.operation,
  );
  const isBuilderCapability = (
    BUILDER_CAPABILITIES as readonly string[]
  ).includes(args.operation);
  if (
    !isMemberCapability &&
    !(isBuilderCapability && args.target.authority.canUseBuilderProjection)
  ) {
    return null;
  }
  const operationDefinition: Record<string, unknown> = {
    operation: args.operation,
    version: 1,
    tool: "polynet_call",
    target: `/communities/${args.target.communitySlug}/capabilities/${args.operation}.json`,
    authority_lane: isBuilderCapability ? "builder" : "member",
    idempotency_required: true,
  };
  if (args.operation === "community.memory.record_outcome") {
    operationDefinition.input = {
      required: ["retrieval_log_id", "node_id", "result_status"],
      result_status: ["worked", "failed", "mixed"],
      optional: ["notes"],
    };
  } else {
    operationDefinition.input = {
      required: ["changeset_id"],
      ...(args.operation.endsWith(".reject") ? { optional: ["reason"] } : {}),
    };
  }
  return operationDefinition;
}

async function executeCanonicalList(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  const parsed = parsePolynetSemanticRepositoryPath(args.input.path);
  if (!parsed.ok) return canonicalError(parsed.code, parsed.message);
  if (parsed.kind !== "community") {
    if (args.principalKind === "community_agent") {
      return canonicalError(
        "community_path_required",
        "The community agent is restricted to its own community repository.",
      );
    }
    const execution = await executePlatformOperation({
      operationId: "community.semantic.list",
      ctx: args.ctx,
      authSubject: args.authSubject,
      userId: args.userId,
      semanticMount: { kind: "platform" },
      evidenceSurface: args.evidenceSurface,
      input: args.input,
    });
    return execution.ok
      ? { ok: true, value: execution.value as Record<string, unknown> }
      : execution;
  }
  const resolved = await resolveCommunityTarget({
    ...args,
    path: parsed.path,
  });
  if (!resolved.ok) {
    return canonicalError(resolved.code, resolved.message);
  }
  const { target } = resolved;
  const absolutePath = mountedPath(target.communitySlug, target.localPath);

  if (target.localPath === POLYNET_CHANNELS_DIRECTORY_PATH) {
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        entries: [
          {
            path: mountedPath(
              target.communitySlug,
              POLYNET_DEFAULT_CHANNEL_DIRECTORY_PATH,
            ),
            kind: "directory",
            type: "channel",
            name: "General",
          },
        ],
        searchable: true,
        writable: target.authority.canWriteParticipation,
      }),
    };
  }
  if (target.localPath === POLYNET_DEFAULT_CHANNEL_DIRECTORY_PATH) {
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        searchable: true,
        writable: target.authority.canWriteParticipation,
      }),
    };
  }
  if (target.localPath === POLYNET_AI_FEED_DIRECTORY_PATH) {
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        searchable: true,
        writable: target.authority.canWriteParticipation,
      }),
    };
  }
  if (target.localPath === POLYNET_MEMORY_DIRECTORY_PATH) {
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        searchable: true,
        writable: false,
      }),
    };
  }
  if (target.localPath === POLYNET_CAPABILITIES_DIRECTORY_PATH) {
    const operations = [
      ...MEMBER_CAPABILITIES,
      ...(target.authority.canUseBuilderProjection
        ? BUILDER_CAPABILITIES
        : []),
    ];
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        entries: operations.map((operation) => ({
          path: mountedPath(
            target.communitySlug,
            `${POLYNET_CAPABILITIES_DIRECTORY_PATH}${operation}.json`,
          ),
          kind: "document",
          type: "capability",
          operation,
          version: 1,
        })),
      }),
    };
  }
  if (target.localPath === POLYNET_BUILDER_DIRECTORY_PATH) {
    if (!target.authority.canUseBuilderProjection) {
      return canonicalError(
        "semantic_not_found",
        "Community path not found or not accessible.",
      );
    }
    return {
      ok: true,
      value: virtualDirectory({
        path: absolutePath,
        entries: [
          {
            path: mountedPath(
              target.communitySlug,
              POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH,
            ),
            kind: "directory",
            type: "builder",
            name: "Resources",
          },
        ],
      }),
    };
  }
  if (target.localPath === POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH) {
    if (!target.authority.canUseBuilderProjection) {
      return canonicalError(
        "semantic_not_found",
        "Community path not found or not accessible.",
      );
    }
    try {
      const directory = (await args.ctx.runQuery(
        (internal as any).communityResources
          .listCommunityResourceBuilderDirectoryInternal,
        {
          userId: args.userId,
          communityId: target.communityId,
          limit:
            typeof args.input.limit === "number"
              ? args.input.limit
              : undefined,
        },
      )) as Record<string, unknown>;
      const resources = Array.isArray(directory.resources)
        ? directory.resources
        : [];
      const modules = Array.isArray(directory.modules)
        ? directory.modules
        : [];
      const entries: Array<Record<string, unknown>> = [
        ...modules,
        ...resources,
      ].flatMap((row) => {
          const record =
            row && typeof row === "object"
              ? (row as Record<string, unknown>)
              : {};
          const id = requiredString(record.id, 180);
          return id
            ? [
                {
                  ...record,
                  path: mountedPath(
                    target.communitySlug,
                    `${POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH}${id}.json`,
                  ),
                  kind: "document",
                  type: "builder",
                },
              ]
            : [];
        });
      return {
        ok: true,
        value: {
          ...virtualDirectory({
            path: absolutePath,
            entries,
            writable: true,
          }),
          health: directory.health ?? null,
          total_resources: directory.total_resources ?? resources.length,
        },
      };
    } catch (error) {
      return canonicalError(
        "builder_resource_list_failed",
        error instanceof Error ? error.message : "Builder resource list failed.",
      );
    }
  }

  const execution = await executePlatformOperation({
    operationId: "community.semantic.list",
    ctx: args.ctx,
    authSubject: args.authSubject,
    userId: args.userId,
    semanticMount: { kind: "platform" },
    evidenceSurface: args.evidenceSurface,
    input: args.input,
  });
  if (!execution.ok) return execution;
  const value = execution.value as Record<string, unknown>;
  if (target.localPath !== "/") return { ok: true, value };
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const builderEntry = target.authority.canUseBuilderProjection
    ? [
        {
          path: mountedPath(
            target.communitySlug,
            POLYNET_BUILDER_DIRECTORY_PATH,
          ),
          kind: "directory",
          type: "builder",
        },
      ]
    : [];
  return {
    ok: true,
    value: {
      ...value,
      entries: [...rawEntries, ...builderEntry],
      authority: {
        lane: target.authority.lane,
        relation: target.authority.relation,
      },
    },
  };
}

async function executeCanonicalRead(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  const parsed = parsePolynetSemanticRepositoryPath(args.input.path);
  if (!parsed.ok || parsed.kind !== "community") {
    if (args.principalKind === "community_agent") {
      return canonicalError(
        "community_path_required",
        "The community agent is restricted to its own community repository.",
      );
    }
    const execution = await executePlatformOperation({
      operationId: "community.semantic.read",
      ctx: args.ctx,
      authSubject: args.authSubject,
      userId: args.userId,
      semanticMount: { kind: "platform" },
      evidenceSurface: args.evidenceSurface,
      input: args.input,
    });
    return execution.ok
      ? { ok: true, value: execution.value as Record<string, unknown> }
      : execution;
  }
  const resolved = await resolveCommunityTarget({
    ...args,
    path: parsed.path,
  });
  if (!resolved.ok) {
    return canonicalError(resolved.code, resolved.message);
  }
  const { target } = resolved;

  const interactionMatch =
    /^\/channels\/general\/(interaction:(?:root|reply):[A-Za-z0-9_-]+)\.md$/.exec(
      target.localPath,
    );
  if (interactionMatch) {
    if (!parseCommunityInteractionEvidenceRef(interactionMatch[1])) {
      return canonicalError("semantic_not_found", "Evidence not found.");
    }
    try {
      const value = (await args.ctx.runAction(
        (internal as any).communityInteractionEvidence
          .readCommunityInteractionEvidenceForToolInternal,
        {
          userId: args.userId,
          authSubject: args.authSubject,
          communityId: target.communityId,
          ref: interactionMatch[1],
          surface: args.evidenceSurface,
        },
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: canonicalJsonDocument({
          target,
          localPath: target.localPath,
          payload: value.evidence ?? value,
          ref: interactionMatch[1],
          retrievalId: value.retrieval_id,
        }),
      };
    } catch (error) {
      return canonicalError(
        "semantic_not_found",
        error instanceof Error ? error.message : "Evidence not found.",
      );
    }
  }

  const aiFeedMatch =
    /^\/ai-feed\/(ai_feed:[A-Za-z0-9_-]+)\.md$/.exec(target.localPath);
  if (aiFeedMatch) {
    if (!parseCommunityAiFeedEvidenceRef(aiFeedMatch[1])) {
      return canonicalError("semantic_not_found", "Evidence not found.");
    }
    try {
      const value = (await args.ctx.runAction(
        (internal as any).communityAiFeedEvidence
          .readCommunityAiFeedEvidenceForToolInternal,
        {
          userId: args.userId,
          authSubject: args.authSubject,
          communityId: target.communityId,
          ref: aiFeedMatch[1],
          surface: args.evidenceSurface,
        },
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: canonicalJsonDocument({
          target,
          localPath: target.localPath,
          payload: value.evidence ?? value,
          ref: aiFeedMatch[1],
          retrievalId: value.retrieval_id,
        }),
      };
    } catch (error) {
      return canonicalError(
        "semantic_not_found",
        error instanceof Error ? error.message : "Evidence not found.",
      );
    }
  }

  const memoryMatch = /^\/memory\/([A-Za-z0-9_-]+)\.md$/.exec(
    target.localPath,
  );
  if (memoryMatch) {
    try {
      const value = (await args.ctx.runMutation(
        (internal as any).communityIntelligenceDirectory
          .readCommunityMemoryInternal,
        {
          userId: args.userId,
          authSubject: args.authSubject,
          communityId: target.communityId,
          surface: args.evidenceSurface,
          nodeId: memoryMatch[1],
          forceMemberView: true,
        },
      )) as Record<string, unknown>;
      if (value?.ok !== true) {
        return canonicalError(
          String(value?.code ?? "semantic_not_found"),
          String(value?.message ?? "Memory not found or not accessible."),
          value,
        );
      }
      return {
        ok: true,
        value: canonicalJsonDocument({
          target,
          localPath: target.localPath,
          payload: value.node ?? value,
          ref: `memory:${memoryMatch[1]}`,
          retrievalId: value.retrieval_log_id,
        }),
      };
    } catch (error) {
      return canonicalError(
        "semantic_not_found",
        error instanceof Error ? error.message : "Memory not found.",
      );
    }
  }

  const capabilityMatch =
    /^\/capabilities\/([a-z0-9][a-z0-9._-]*)\.json$/.exec(target.localPath);
  if (capabilityMatch) {
    const definition = capabilityDocument({
      target,
      operation: capabilityMatch[1],
    });
    if (!definition) {
      return canonicalError(
        "semantic_not_found",
        "Capability not found or not authorized.",
      );
    }
    return {
      ok: true,
      value: {
        path: mountedPath(target.communitySlug, target.localPath),
        body: JSON.stringify(definition, null, 2),
        truncated: false,
      },
    };
  }

  const builderResourceMatch =
    /^\/builder\/resources\/([A-Za-z0-9_-]+)\.json$/.exec(target.localPath);
  if (builderResourceMatch) {
    if (!target.authority.canUseBuilderProjection) {
      return canonicalError(
        "semantic_not_found",
        "Builder resource not found or not accessible.",
      );
    }
    try {
      const value = (await args.ctx.runQuery(
        (internal as any).communityResources
          .readCommunityResourceBuilderResourceInternal,
        {
          userId: args.userId,
          communityId: target.communityId,
          ref: builderResourceMatch[1],
        },
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: canonicalJsonDocument({
          target,
          localPath: target.localPath,
          payload: value,
          ref: builderResourceMatch[1],
        }),
      };
    } catch (error) {
      return canonicalError(
        "semantic_not_found",
        error instanceof Error ? error.message : "Builder resource not found.",
      );
    }
  }

  const execution = await executePlatformOperation({
    operationId: "community.semantic.read",
    ctx: args.ctx,
    authSubject: args.authSubject,
    userId: args.userId,
    semanticMount: { kind: "platform" },
    evidenceSurface: args.evidenceSurface,
    input: args.input,
  });
  return execution.ok
    ? { ok: true, value: execution.value as Record<string, unknown> }
    : execution;
}

async function executeCanonicalSearch(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  const resolved = await resolveCommunityTarget({
    ...args,
    path: args.input.path,
  });
  if (!resolved.ok) {
    return canonicalError(resolved.code, resolved.message);
  }
  const { target } = resolved;
  const query = requiredString(args.input.query, 500);
  if (!query) return canonicalError("invalid_tool_args", "query is required.");
  const limit =
    typeof args.input.limit === "number" ? args.input.limit : undefined;
  const common = {
    userId: args.userId,
    authSubject: args.authSubject,
    communityId: target.communityId,
    query,
    limit,
    surface: args.evidenceSurface,
  };
  try {
    if (target.localPath.startsWith(POLYNET_RESOURCES_DIRECTORY_PATH)) {
      const value = (await args.ctx.runAction(
        (internal as any).communityResourceEvidence
          .searchCommunityResourceEvidenceInternal,
        common,
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: mountSearchResults({
          communitySlug: target.communitySlug,
          path: mountedPath(target.communitySlug, target.localPath),
          results: Array.isArray(value.matches)
            ? (value.matches as Array<Record<string, unknown>>)
            : [],
          retrievalId: value.retrieval_id,
          truncated: value.truncated,
        }),
      };
    }
    if (target.localPath.startsWith(POLYNET_CHANNELS_DIRECTORY_PATH)) {
      const value = (await args.ctx.runAction(
        (internal as any).communityInteractionEvidence
          .searchCommunityInteractionEvidenceInternal,
        common,
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: mountSearchResults({
          communitySlug: target.communitySlug,
          path: mountedPath(target.communitySlug, target.localPath),
          results: Array.isArray(value.results)
            ? (value.results as Array<Record<string, unknown>>)
            : [],
          retrievalId: value.retrieval_id,
          truncated: value.truncated,
        }),
      };
    }
    if (target.localPath.startsWith(POLYNET_AI_FEED_DIRECTORY_PATH)) {
      const value = (await args.ctx.runAction(
        (internal as any).communityAiFeedEvidence
          .searchCommunityAiFeedEvidenceInternal,
        common,
      )) as Record<string, unknown>;
      return {
        ok: true,
        value: mountSearchResults({
          communitySlug: target.communitySlug,
          path: mountedPath(target.communitySlug, target.localPath),
          results: Array.isArray(value.matches)
            ? (value.matches as Array<Record<string, unknown>>)
            : [],
          retrievalId: value.retrieval_id,
          truncated: value.truncated,
        }),
      };
    }
    if (target.localPath.startsWith(POLYNET_MEMORY_DIRECTORY_PATH)) {
      const requestedTypes = Array.isArray(args.input.types)
        ? args.input.types
            .map((value) => String(value ?? "").trim())
            .filter((value) => MEMORY_TYPES.has(value))
        : [];
      const value = (await args.ctx.runMutation(
        (internal as any).communityIntelligenceDirectory
          .searchCommunityMemoryInternal,
        {
          ...common,
          ...(requestedTypes.length ? { types: requestedTypes } : {}),
          forceMemberView: true,
        },
      )) as Record<string, unknown>;
      if (value?.ok !== true) {
        return canonicalError(
          String(value?.code ?? "community_memory_search_failed"),
          String(value?.message ?? "Community memory search failed."),
          value,
        );
      }
      const nodes = Array.isArray(value.nodes)
        ? (value.nodes as Array<Record<string, unknown>>)
        : [];
      return {
        ok: true,
        value: {
          path: mountedPath(target.communitySlug, target.localPath),
          results: nodes.map((node) => {
            const nodeId = requiredString(
              node.node_id ?? node.id ?? node._id,
              180,
            );
            return {
              ...node,
              ...(nodeId
                ? {
                    path: mountedPath(
                      target.communitySlug,
                      `${POLYNET_MEMORY_DIRECTORY_PATH}${nodeId}.md`,
                    ),
                  }
                : {}),
            };
          }),
          truncated: value.truncated === true,
          retrieval_id: value.retrieval_log_id ?? null,
        },
      };
    }
    if (target.localPath !== "/") {
      return canonicalError(
        "semantic_not_found",
        "Search path not found or not searchable.",
      );
    }
    const value = (await args.ctx.runAction(
      (internal as any).communityRepositorySearch
        .searchCommunityRepositoryInternal,
      {
        userId: args.userId,
        authSubject: args.authSubject,
        communityId: target.communityId,
        query,
        limit,
        surface: args.evidenceSurface,
        ...(Array.isArray(args.input.types)
          ? { types: args.input.types }
          : {}),
      },
    )) as Record<string, unknown>;
    if (value?.ok !== true) {
      return canonicalError(
        String(value?.reason_code ?? "community_repository_search_failed"),
        String(value?.message ?? "Community repository search failed."),
        value,
      );
    }
    return {
      ok: true,
      value: mountSearchResults({
        communitySlug: target.communitySlug,
        path: mountedPath(target.communitySlug, "/"),
        results: Array.isArray(value.results)
          ? (value.results as Array<Record<string, unknown>>)
          : [],
        retrievalId: value.retrieval_id,
        truncated: value.truncated,
      }),
    };
  } catch (error) {
    return canonicalError(
      "polynet_search_failed",
      error instanceof Error ? error.message : "Polynet search failed.",
    );
  }
}

async function executeCanonicalWrite(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  const resolved = await resolveCommunityTarget({
    ...args,
    path: args.input.path,
  });
  if (!resolved.ok) {
    return canonicalError(resolved.code, resolved.message);
  }
  const { target } = resolved;
  const content = omitNullishObjectFields(args.input.content);
  const mode = String(args.input.mode ?? "");
  const idempotencyKey = String(args.input.idempotencyKey ?? "");

  if (
    target.localPath === POLYNET_DEFAULT_CHANNEL_DIRECTORY_PATH ||
    target.localPath === POLYNET_CHANNELS_DIRECTORY_PATH
  ) {
    if (!target.authority.canWriteParticipation) {
      return canonicalError(
        "community_write_forbidden",
        "This principal cannot write community chat.",
      );
    }
    const rootId = requiredString(content.root_id ?? content.rootId, 180);
    if (
      (mode === "create" && rootId) ||
      (mode === "append" && !rootId) ||
      mode === "update"
    ) {
      return canonicalError(
        "invalid_tool_args",
        "Use create without root_id for a new post or append with root_id for a reply.",
      );
    }
    const reservation = await reserveMutatingOperation({
      ...args,
      target,
      toolName: "polynet_write",
      idempotencyKey,
    });
    if (!reservation.ok) return reservation.result;
    if (reservation.status === "completed") {
      return { ok: true, value: reservation.completedValue };
    }
    try {
      const canonicalIdempotencyKey =
        `polynet:${args.principalKind}:${idempotencyKey}`;
      const mutationArgs = {
        userId: args.userId,
        authSubject: args.authSubject,
        communityId: target.communityId,
        idempotencyKey: canonicalIdempotencyKey,
        text: String(content.text ?? content.body ?? ""),
        ...(rootId ? { rootId } : {}),
        ...(content.reply_to_message_id
          ? { replyToMessageId: String(content.reply_to_message_id) }
          : {}),
        ...(Array.isArray(content.mentions)
          ? { mentions: content.mentions }
          : {}),
        ...(Array.isArray(content.attachments)
          ? { attachments: content.attachments }
          : {}),
      };
      const value = (await args.ctx.runMutation(
        args.principalKind === "community_agent"
          ? (internal as any).communityInteractions
              .createCommunityAgentCanonicalInteractionInternal
          : (api as any).communityInteractions
              .createCommunityInteractionComposerMessage,
        args.principalKind === "community_agent"
          ? mutationArgs
          : { ...mutationArgs, asPersonalAgent: true },
      )) as Record<string, unknown>;
      const interaction =
        value.interaction && typeof value.interaction === "object"
          ? (value.interaction as Record<string, unknown>)
          : {};
      const ref =
        interaction.kind === "reply"
          ? `interaction:reply:${String(interaction.reply_id ?? "")}`
          : `interaction:root:${String(interaction.root_id ?? "")}`;
      const responseValue = {
        ok: true,
        path: evidencePath({
          communitySlug: target.communitySlug,
          sourceType: "interaction",
          ref,
        }),
        ref,
        deduped: interaction.deduped === true,
        receipt: canonicalReceipt({
          toolName: "polynet_write",
          principalKind: args.principalKind,
          target,
          idempotencyKey,
          deduped: interaction.deduped === true,
        }),
        result: value,
      };
      return {
        ok: true,
        value: await completeMutatingOperation({
          ...args,
          target,
          toolName: "polynet_write",
          idempotencyKey,
          requestFingerprint: reservation.requestFingerprint,
          attemptToken: reservation.attemptToken,
          value: responseValue,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Community chat write failed.";
      await failMutatingOperation({
        ...args,
        target,
        toolName: "polynet_write",
        idempotencyKey,
        requestFingerprint: reservation.requestFingerprint,
        attemptToken: reservation.attemptToken,
        errorCode: "community_chat_write_failed",
        errorMessage,
      });
      return canonicalError(
        "community_chat_write_failed",
        errorMessage,
      );
    }
  }

  if (target.localPath === POLYNET_AI_FEED_DIRECTORY_PATH) {
    if (!target.authority.canWriteParticipation || mode !== "create") {
      return canonicalError(
        "community_write_forbidden",
        "AI Feed supports authorized create operations only.",
      );
    }
    const postType = String(content.post_type ?? "observation");
    if (
      postType !== "observation" &&
      postType !== "recommendation" &&
      postType !== "action"
    ) {
      return canonicalError(
        "invalid_tool_args",
        "post_type must be observation, recommendation, or action.",
      );
    }
    const reservation = await reserveMutatingOperation({
      ...args,
      target,
      toolName: "polynet_write",
      idempotencyKey,
    });
    if (!reservation.ok) return reservation.result;
    if (reservation.status === "completed") {
      return { ok: true, value: reservation.completedValue };
    }
    try {
      const value = (await args.ctx.runMutation(
        (internal as any).communityAiFeed
          .publishCanonicalPolynetAiFeedPostInternal,
        {
          userId: args.userId,
          authSubject: args.authSubject,
          communityId: target.communityId,
          principalKind: args.principalKind,
          idempotencyKey,
          postType,
          title: requiredString(content.title, 180),
          body: String(content.body ?? content.text ?? ""),
          evidence: Array.isArray(content.evidence)
            ? content.evidence.map((value) => String(value ?? ""))
            : [],
        },
      )) as Record<string, unknown>;
      const postId = requiredString(value.id, 180);
      const ref = postId ? `ai_feed:${postId}` : null;
      const responseValue = {
        ok: true,
        ...(ref
          ? {
              path: evidencePath({
                communitySlug: target.communitySlug,
                sourceType: "ai_feed",
                ref,
              }),
              ref,
            }
          : {}),
        deduped: value.deduped === true,
        receipt: canonicalReceipt({
          toolName: "polynet_write",
          principalKind: args.principalKind,
          target,
          idempotencyKey,
          deduped: value.deduped === true,
        }),
        result: value,
      };
      return {
        ok: true,
        value: await completeMutatingOperation({
          ...args,
          target,
          toolName: "polynet_write",
          idempotencyKey,
          requestFingerprint: reservation.requestFingerprint,
          attemptToken: reservation.attemptToken,
          value: responseValue,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Community AI Feed write failed.";
      await failMutatingOperation({
        ...args,
        target,
        toolName: "polynet_write",
        idempotencyKey,
        requestFingerprint: reservation.requestFingerprint,
        attemptToken: reservation.attemptToken,
        errorCode: "community_ai_feed_write_failed",
        errorMessage,
      });
      return canonicalError(
        "community_ai_feed_write_failed",
        errorMessage,
      );
    }
  }

  if (target.localPath === POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH) {
    if (
      !target.authority.canUseBuilderProjection ||
      mode !== "create" ||
      !Array.isArray(content.operations)
    ) {
      return canonicalError(
        "builder_authority_required",
        "Builder authority and a create changeset payload are required.",
      );
    }
    const reservation = await reserveMutatingOperation({
      ...args,
      target,
      toolName: "polynet_write",
      idempotencyKey,
    });
    if (!reservation.ok) return reservation.result;
    if (reservation.status === "completed") {
      return { ok: true, value: reservation.completedValue };
    }
    try {
      const value = (await args.ctx.runMutation(
        (internal as any).communityResources
          .stageCommunityResourceBuilderChangesetInternal,
        {
          userId: args.userId,
          communityId: target.communityId,
          summary: String(content.summary ?? ""),
          operations: content.operations,
          idempotencyKey: `polynet:${args.principalKind}:${idempotencyKey}`,
        },
      )) as Record<string, unknown>;
      const responseValue = {
        ok: true,
        ref: value.changeset_id ?? null,
        deduped: value.deduped === true,
        receipt: canonicalReceipt({
          toolName: "polynet_write",
          principalKind: args.principalKind,
          target,
          idempotencyKey,
          deduped: value.deduped === true,
        }),
        result: value,
      };
      return {
        ok: true,
        value: await completeMutatingOperation({
          ...args,
          target,
          toolName: "polynet_write",
          idempotencyKey,
          requestFingerprint: reservation.requestFingerprint,
          attemptToken: reservation.attemptToken,
          value: responseValue,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Changeset staging failed.";
      await failMutatingOperation({
        ...args,
        target,
        toolName: "polynet_write",
        idempotencyKey,
        requestFingerprint: reservation.requestFingerprint,
        attemptToken: reservation.attemptToken,
        errorCode: "builder_changeset_stage_failed",
        errorMessage,
      });
      return canonicalError(
        "builder_changeset_stage_failed",
        errorMessage,
      );
    }
  }

  return canonicalError(
    "semantic_not_writable",
    "This repository path is not naturally writable.",
  );
}

async function executeCanonicalCall(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  const targetPath = requiredString(args.input.target, 1_024);
  if (!targetPath) {
    return canonicalError(
      "community_path_required",
      "A canonical community capability target is required.",
    );
  }
  const resolved = await resolveCommunityTarget({
    ...args,
    path: targetPath,
  });
  if (!resolved.ok) {
    return canonicalError(resolved.code, resolved.message);
  }
  const { target } = resolved;
  const operation = String(args.input.operation ?? "");
  const version = Number(args.input.version ?? 0);
  const input = omitNullishObjectFields(args.input.input);
  const idempotencyKey = String(args.input.idempotencyKey ?? "");
  if (version !== 1) {
    return canonicalError(
      "operation_version_unsupported",
      "Only operation version 1 is supported.",
    );
  }
  if (!capabilityDocument({ target, operation })) {
    return canonicalError(
      "operation_not_found",
      "Operation is not discoverable or authorized for this community.",
    );
  }
  let resultStatus: "worked" | "failed" | "mixed" | null = null;
  let changesetId: string | null = null;
  if (operation === "community.memory.record_outcome") {
    const candidate = String(input.result_status ?? "");
    if (
      candidate !== "worked" &&
      candidate !== "failed" &&
      candidate !== "mixed"
    ) {
      return canonicalError(
        "invalid_tool_args",
        "result_status must be worked, failed, or mixed.",
      );
    }
    if (
      !requiredString(input.retrieval_log_id, 180) ||
      !requiredString(input.node_id, 180)
    ) {
      return canonicalError(
        "invalid_tool_args",
        "retrieval_log_id and node_id are required.",
      );
    }
    resultStatus = candidate;
  } else {
    if (!target.authority.canUseBuilderProjection) {
      return canonicalError(
        "builder_authority_required",
        "Builder authority is required.",
      );
    }
    changesetId = requiredString(
      input.changeset_id ?? input.changesetId,
      180,
    );
    if (!changesetId) {
      return canonicalError(
        "invalid_tool_args",
        "changeset_id is required.",
      );
    }
  }
  const reservation = await reserveMutatingOperation({
    ...args,
    target,
    toolName: "polynet_call",
    idempotencyKey,
  });
  if (!reservation.ok) return reservation.result;
  if (reservation.status === "completed") {
    return { ok: true, value: reservation.completedValue };
  }
  try {
    let result: Record<string, unknown>;
    if (operation === "community.memory.record_outcome") {
      result = (await args.ctx.runMutation(
        (internal as any).communityIntelligenceDirectory
          .recordCommunityOutcomeObservationInternal,
        {
          userId: args.userId,
          authSubject: args.authSubject,
          communityId: target.communityId,
          surface: args.evidenceSurface,
          retrievalLogId: String(input.retrieval_log_id ?? ""),
          nodeId: String(input.node_id ?? ""),
          resultStatus: resultStatus!,
          ...(input.notes ? { notes: String(input.notes) } : {}),
        },
      )) as Record<string, unknown>;
    } else {
      const common = {
        userId: args.userId,
        authSubject: args.authSubject,
        communityId: target.communityId,
        changesetId: changesetId!,
      };
      if (operation === "community.resources.changeset.status") {
        result = (await args.ctx.runQuery(
          (api as any).communityResources
            .getCommunityResourceBuilderChangesetStatus,
          common,
        )) as Record<string, unknown>;
      } else if (operation === "community.resources.changeset.approve") {
        result = (await args.ctx.runMutation(
          (api as any).communityResources
            .approveCommunityResourceBuilderChangeset,
          common,
        )) as Record<string, unknown>;
      } else if (operation === "community.resources.changeset.reject") {
        result = (await args.ctx.runMutation(
          (api as any).communityResources
            .rejectCommunityResourceBuilderChangeset,
          {
            ...common,
            ...(input.reason ? { reason: String(input.reason) } : {}),
          },
        )) as Record<string, unknown>;
      } else if (operation === "community.resources.changeset.apply") {
        result = (await args.ctx.runMutation(
          (api as any).communityResources
            .applyCommunityResourceBuilderChangeset,
          common,
        )) as Record<string, unknown>;
      } else {
        return canonicalError(
          "operation_not_found",
          "Operation is not implemented.",
        );
      }
    }
    const deduped =
      result.deduped === true || result.deduplicated === true;
    const responseValue = {
      ok: true,
      operation,
      result,
      deduped,
      receipt: canonicalReceipt({
        toolName: "polynet_call",
        principalKind: args.principalKind,
        target,
        idempotencyKey,
        deduped,
      }),
    };
    return {
      ok: true,
      value: await completeMutatingOperation({
        ...args,
        target,
        toolName: "polynet_call",
        idempotencyKey,
        requestFingerprint: reservation.requestFingerprint,
        attemptToken: reservation.attemptToken,
        value: responseValue,
      }),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Polynet operation failed.";
    await failMutatingOperation({
      ...args,
      target,
      toolName: "polynet_call",
      idempotencyKey,
      requestFingerprint: reservation.requestFingerprint,
      attemptToken: reservation.attemptToken,
      errorCode: "polynet_call_failed",
      errorMessage,
    });
    return canonicalError(
      "polynet_call_failed",
      errorMessage,
    );
  }
}

export async function executePolynetCanonicalTool(args: {
  ctx: any;
  authSubject: string;
  userId: string;
  principalKind: PolynetPrincipalKind;
  mountedCommunityId?: string | null;
  evidenceSurface: CommunityEvidenceSurface;
  toolName: PolynetCanonicalToolName;
  input: Record<string, unknown>;
}): Promise<PolynetCanonicalExecutionResult> {
  if (!POLYNET_CANONICAL_TOOL_DEFINITIONS[args.toolName]) {
    return canonicalError("unknown_tool", "Unknown Polynet tool.");
  }
  const authSubject = requiredString(args.authSubject, 512);
  const userId = requiredString(args.userId, 180);
  if (!authSubject || !userId) {
    return canonicalError(
      "authenticated_user_required",
      "An authenticated Polynet principal is required.",
    );
  }
  let input: Record<string, unknown>;
  try {
    input = normalizeToolArguments(args.toolName, args.input);
  } catch (error) {
    return canonicalError(
      "invalid_tool_args",
      error instanceof Error ? error.message : "Invalid tool arguments.",
    );
  }
  const common = {
    ...args,
    authSubject,
    userId,
    input,
  };
  if (args.toolName === "polynet_list") return await executeCanonicalList(common);
  if (args.toolName === "polynet_read") return await executeCanonicalRead(common);
  if (args.toolName === "polynet_search")
    return await executeCanonicalSearch(common);
  if (args.toolName === "polynet_write")
    return await executeCanonicalWrite(common);
  return await executeCanonicalCall(common);
}
