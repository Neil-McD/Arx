import { internal } from "./_generated/api";
import {
  parsePolynetCodexWorkerIngestContext,
} from "./polynetCodexWorkerIngest";
import { POLYNET_CODEX_WORKER_ENGINE_ID } from "./polynetCodexWorkerBridge";
import {
  verifyPolynetCodexWorkerRunToken,
} from "./polynetCodexWorkerRunToken";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import {
  createRuntimeMcpManager,
  type RuntimeMountedMcpTool,
} from "./runtimeMcpManager";
import {
  normalizeRuntimeMountedUserPlatformAppTools,
} from "./runtimeHarnessShaping";
import {
  findPolynetPlatformToolSurfaceEntry,
  type PolynetPlatformToolRequiredCommunityAuthority,
} from "../shared/polynetPlatformToolSurface";
import {
  buildMcpHarnessProjection,
} from "../shared/mcpHarnessProjection";
import {
  normalizeCommunityResourceRuntimeLane,
  type CommunityResourceRuntimeLane,
} from "../shared/communityResourceLane";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_TOOL_PATH =
  "/runtime/polynet_codex_worker_tool";

const PLATFORM_TOOL_OUTPUT_MAX_CHARS = 24_000;
const MCP_BRIDGE_TOOL_OUTPUT_MAX_CHARS = 24_000;
const CODEX_WORKER_ALLOWED_WRITE_TOOL_NAMES = new Set([
  "community_resource_builder_stage_changeset",
  "community_write",
]);

type RunCommunityAuthority = {
  relation: string | null;
  effectiveRole: string | null;
  canManage: boolean;
  canModerate: boolean;
  canManageResources: boolean;
  canReviewJoinRequests: boolean;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function redactBridgeEventPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBridgeEventPayload);
  const record = asRecord(value);
  if (!record) return value;
  const redacted: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("authorization") ||
      normalizedKey.includes("access_token") ||
      normalizedKey.includes("refresh_token") ||
      normalizedKey.includes("client_secret") ||
      normalizedKey === "secret" ||
      normalizedKey === "headers" ||
      normalizedKey === "endpoint_url"
    ) {
      continue;
    }
    redacted[key] = redactBridgeEventPayload(entry);
  }
  return redacted;
}

function mapRuntimeMountedUserPlatformAppToolToRuntimeMcpTool(
  tool: ReturnType<typeof normalizeRuntimeMountedUserPlatformAppTools>[number],
): RuntimeMountedMcpTool | null {
  const mountId = String(tool.user_platform_app_mount_id ?? "").trim();
  const developerAppId = String(tool.developer_app_id ?? "").trim();
  const namespacedToolName = String(tool.namespaced_tool_name ?? "").trim();
  const toolName = String(tool.tool_name ?? "").trim();
  if (!mountId || !developerAppId || !namespacedToolName || !toolName) return null;
  return {
    scope: "user",
    mount_id: mountId,
    runtime_tool_name: `me__${namespacedToolName}`,
    developer_app_id: developerAppId,
    catalog_app_id: tool.catalog_app_id,
    app_name: tool.app_name,
    endpoint_url: tool.endpoint_url,
    auth_type: tool.auth_type,
    tool_name: toolName,
    namespaced_tool_name: namespacedToolName,
    description: tool.description,
    input_schema: tool.input_schema,
    risk_level: tool.risk_level,
  };
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex exposes environment variables through process.env in actions.
  }
  return "";
}

function runAuthorityAllowsRequiredLane(
  lane: CommunityResourceRuntimeLane | null,
  requiredLane: "none" | "member" | "builder",
  authority?: RunCommunityAuthority | null,
): boolean {
  if (requiredLane === "none") return true;
  if (requiredLane === "builder") {
    return lane === "builder" && authority?.canManageResources === true;
  }
  return lane === "member" || lane === "builder";
}

function authorityRoleRank(value: unknown): number {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner") return 4;
  if (role === "admin") return 3;
  if (role === "moderator") return 2;
  if (role === "member") return 1;
  return 0;
}

function readBoolean(record: JsonRecord | null, ...keys: string[]): boolean {
  if (!record) return false;
  return keys.some((key) => record[key] === true);
}

function runAuthorityAllowsRequiredAuthority(
  authority: RunCommunityAuthority | null,
  requiredAuthority: PolynetPlatformToolRequiredCommunityAuthority,
): boolean {
  if (requiredAuthority === "none") return true;
  if (!authority) return false;
  const rank = Math.max(
    authorityRoleRank(authority.effectiveRole),
    authorityRoleRank(authority.relation),
  );
  if (requiredAuthority === "member") return rank >= 1;
  if (requiredAuthority === "moderator") return rank >= 2 || authority.canModerate;
  if (requiredAuthority === "admin") return rank >= 3 || authority.canManage;
  return rank >= 4;
}

function communityAuthorityFailureCode(
  requiredAuthority: PolynetPlatformToolRequiredCommunityAuthority,
): string {
  if (requiredAuthority === "owner") return "community_owner_authority_required";
  if (requiredAuthority === "admin") return "community_admin_authority_required";
  if (requiredAuthority === "moderator") {
    return "community_moderator_authority_required";
  }
  if (requiredAuthority === "member") return "community_member_authority_required";
  return "community_authority_required";
}

function readRunCommunityResourceLane(runRow: {
  activeContextSnapshot?: unknown;
  communityId?: unknown;
  threadId?: unknown;
}): CommunityResourceRuntimeLane {
  const snapshot = asRecord(runRow.activeContextSnapshot);
  const envelope = asRecord(snapshot?.runtimeTurnEnvelope);
  const authority = asRecord(envelope?.authority);
  const snapshotCommunityId = String(authority?.communityId ?? "").trim();
  const snapshotThreadId = String(authority?.threadId ?? "").trim();
  const runCommunityId = String(runRow.communityId ?? "").trim();
  const runThreadId = String(runRow.threadId ?? "").trim();
  if (!snapshotCommunityId || snapshotCommunityId !== runCommunityId) return "none";
  if (!snapshotThreadId || snapshotThreadId !== runThreadId) return "none";
  return normalizeCommunityResourceRuntimeLane(authority?.communityResourceLane);
}

function readRunCommunityAuthority(runRow: {
  activeContextSnapshot?: unknown;
  communityId?: unknown;
  threadId?: unknown;
}): RunCommunityAuthority | null {
  const snapshot = asRecord(runRow.activeContextSnapshot);
  const envelope = asRecord(snapshot?.runtimeTurnEnvelope);
  const authority = asRecord(envelope?.authority);
  const snapshotCommunityId = String(authority?.communityId ?? "").trim();
  const snapshotThreadId = String(authority?.threadId ?? "").trim();
  const runCommunityId = String(runRow.communityId ?? "").trim();
  const runThreadId = String(runRow.threadId ?? "").trim();
  if (!snapshotCommunityId || snapshotCommunityId !== runCommunityId) return null;
  if (!snapshotThreadId || snapshotThreadId !== runThreadId) return null;
  const relation = String(
    authority?.communityRelation ?? authority?.community_relation ?? "",
  ).trim();
  const effectiveRole = String(
    authority?.communityEffectiveRole ?? authority?.community_effective_role ?? "",
  ).trim();
  if (!relation && !effectiveRole) return null;
  return {
    relation: relation || null,
    effectiveRole: effectiveRole || null,
    canManage: readBoolean(authority, "canManage", "can_manage"),
    canModerate: readBoolean(authority, "canModerate", "can_moderate"),
    canManageResources: readBoolean(
      authority,
      "canManageResources",
      "can_manage_resources",
    ),
    canReviewJoinRequests: readBoolean(
      authority,
      "canReviewJoinRequests",
      "can_review_join_requests",
    ),
  };
}

export function buildPolynetCodexWorkerToolTarget(): string | null {
  const siteUrl = readEnv("CONVEX_SITE_URL").replace(/\/+$/, "");
  if (!siteUrl) return null;
  return `${siteUrl}${POLYNET_CODEX_WORKER_TOOL_PATH}`;
}

// The single bridged-tool endpoint: every PolyNet platform capability a
// headless Codex turn can invoke lands here. One trust check (the same
// run/owner/thread/engine validation as ingest and terminal), one billing
// hook (per surface-entry policy; "free" today, credit reservation when paid
// tools join), one audit point. Tool semantics come from the SAME
// executeRetrievalHarnessTool dispatch the native loop uses.
export async function handlePolynetCodexWorkerTool(
  ctx: any,
  req: Request,
): Promise<Response> {
  const json = (status: number, payload: JsonRecord): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  const expectedToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  const rawAuth = String(req.headers.get("authorization") ?? "").trim();
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : "";
  if (!expectedToken || bearer !== expectedToken) {
    return json(401, { ok: false, code: "unauthorized" });
  }

  let body: JsonRecord;
  try {
    body = asRecord(await req.json()) ?? {};
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }

  const context = parsePolynetCodexWorkerIngestContext(body.context);
  if (!context) {
    return json(400, { ok: false, code: "invalid_ingest_context" });
  }
  const runTokenVerification = await verifyPolynetCodexWorkerRunToken({
    token: String(body.run_token ?? ""),
    expectedAudience: "tool",
    context,
  });
  if (!runTokenVerification.ok) {
    return json(runTokenVerification.status, {
      ok: false,
      code: runTokenVerification.code,
      message: runTokenVerification.message,
    });
  }

  // The signed run token proves Convex minted this short-lived tool request;
  // the live run row still remains the authority for owner/thread/engine.
  let runRow: {
    threadId?: unknown;
    engineId?: unknown;
    status?: unknown;
    communityId?: unknown;
    activeContextSnapshot?: unknown;
  } | null = null;
  try {
    runRow = (await ctx.runQuery(
      (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
      { ownerId: context.owner_id, runId: context.run_id },
    )) as {
      threadId?: unknown;
      engineId?: unknown;
      status?: unknown;
      communityId?: unknown;
      activeContextSnapshot?: unknown;
    } | null;
  } catch {
    runRow = null;
  }
  if (
    !runRow ||
    String(runRow.threadId ?? "") !== context.thread_id ||
    String(runRow.engineId ?? "") !== POLYNET_CODEX_WORKER_ENGINE_ID
  ) {
    return json(404, { ok: false, code: "invalid_run" });
  }
  const runStatus = String(runRow.status ?? "").trim();
  if (runStatus !== "running") {
    return json(409, {
      ok: false,
      code: "codex_worker_run_not_active",
      message: "This Codex worker run is no longer active.",
      run_status: runStatus || null,
    });
  }
  const appendBridgeRunEvent = async (
    eventType: string,
    payload: JsonRecord,
    eventKey?: string,
  ): Promise<void> => {
    try {
      await ctx.runMutation(
        (internal as any).threads.appendCloudRuntimeRunEventInternal as any,
        {
          ownerId: context.owner_id as any,
          threadId: String(runRow.threadId) as any,
          runId: context.run_id,
          eventType,
          eventKey,
          payload: {
            run_id: context.run_id,
            ...((redactBridgeEventPayload(payload) as JsonRecord) ?? {}),
          },
        },
      );
    } catch {
      // Runtime events are operational evidence only; tool dispatch remains
      // governed by the run token and canonical run row.
    }
  };

  const requestedToolName = String(body.tool_name ?? "").trim();
  if (requestedToolName === "computer_open_url") {
    const toolArgs = asRecord(body.arguments) ?? {};
    const opened = (await ctx.runAction(
      (internal as any).daytonaCodexRuntimeTargetActions
        .openDaytonaComputerUseUrlInternal as any,
      {
        ownerId: context.owner_id,
        runId: context.run_id,
        url: String(toolArgs.url ?? ""),
        reason: "codex_worker_computer_open_url_tool",
      },
    )) as JsonRecord;
    if (opened?.ok !== true) {
      return json(200, {
        ok: false,
        code:
          String(opened?.code ?? "").trim() ||
          "daytona_computer_open_url_unavailable",
        message:
          String(opened?.message ?? "").trim() ||
          "Daytona Computer Use browser navigation is unavailable for this run.",
      });
    }
    const summary =
      String(opened.summary ?? "").trim() ||
      "Opened URL in the Daytona computer browser.";
    return json(200, {
      ok: true,
      tool_name: "computer_open_url",
      output: summary,
      summary,
      command_exit_code: opened.command_exit_code ?? null,
      display_keys: opened.display_keys ?? [],
      window_count: opened.window_count ?? null,
    });
  }
  if (requestedToolName === "computer_screenshot") {
    const captured = (await ctx.runAction(
      (internal as any).daytonaCodexRuntimeTargetActions
        .captureDaytonaComputerUseScreenshotInternal as any,
      {
        ownerId: context.owner_id,
        runId: context.run_id,
        reason: "codex_worker_computer_screenshot_tool",
      },
    )) as JsonRecord;
    if (captured?.ok !== true) {
      return json(200, {
        ok: false,
        code:
          String(captured?.code ?? "").trim() ||
          "daytona_computer_use_screenshot_unavailable",
        message:
          String(captured?.message ?? "").trim() ||
          "Daytona Computer Use screenshot is unavailable for this run.",
      });
    }
    const summary =
      String(captured.summary ?? "").trim() ||
      "Captured Daytona computer screenshot.";
    return json(200, {
      ok: true,
      tool_name: "computer_screenshot",
      output: summary,
      summary,
      frame_url: String(captured.frame_url ?? "").trim() || null,
      frame_storage_id: String(captured.frame_storage_id ?? "").trim() || null,
      frame_mime_type: captured.frame_mime_type ?? null,
      frame_size_bytes: captured.frame_size_bytes ?? null,
      screenshot_method: captured.screenshot_method ?? null,
      screenshot_width: captured.screenshot_width ?? null,
      screenshot_height: captured.screenshot_height ?? null,
    });
  }
  const requestedToolKind = String(body.tool_kind ?? "").trim();
  if (
    requestedToolKind === "mcp_bridge" ||
    String(body.bridge_tool_name ?? "").trim() ||
    requestedToolName.startsWith("polynet_mcp__")
  ) {
    const bridgeToolName =
      String(body.bridge_tool_name ?? "").trim() || requestedToolName;
    const startedAt = Date.now();
    await appendBridgeRunEvent("codex_mcp_bridge_tool_requested", {
      bridge_tool_name: bridgeToolName,
    });
    const rejectBridgeTool = async (
      code: string,
      message: string,
      extra: JsonRecord = {},
    ): Promise<Response> => {
      await appendBridgeRunEvent("codex_mcp_bridge_tool_rejected", {
        bridge_tool_name: bridgeToolName,
        code,
        message,
        ...extra,
      });
      return json(200, {
        ok: false,
        code,
        message,
        ...extra,
      });
    };
    if (!bridgeToolName) {
      return await rejectBridgeTool(
        "mcp_bridge_tool_name_required",
        "MCP bridge tool name is required.",
      );
    }

    let effectiveMcpApps: unknown[] = [];
    let runtimeMountedTools: RuntimeMountedMcpTool[] = [];
    try {
      const [effectiveAppsPayload, mountedToolsPayload] = await Promise.all([
        ctx.runQuery(internal.harnessMounts.listEffectiveMcpAppsInternal, {
          userId: context.owner_id as any,
          communityId: String(runRow.communityId ?? "").trim()
            ? (String(runRow.communityId) as any)
            : undefined,
        }),
        ctx.runQuery(
          internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
          {
            userId: context.owner_id as any,
          },
        ),
      ]);
      effectiveMcpApps = Array.isArray(effectiveAppsPayload)
        ? effectiveAppsPayload
        : [];
      runtimeMountedTools = normalizeRuntimeMountedUserPlatformAppTools(
        mountedToolsPayload,
      )
        .map(mapRuntimeMountedUserPlatformAppToolToRuntimeMcpTool)
        .filter((tool): tool is RuntimeMountedMcpTool => tool !== null);
    } catch {
      return await rejectBridgeTool(
        "mcp_bridge_projection_failed",
        "PolyNet could not resolve connected MCP tools for this Codex turn.",
      );
    }

    const projection = buildMcpHarnessProjection({
      effectiveApps: effectiveMcpApps as any,
      runtimeMountedTools,
    });
    const projectedTool = projection.codexBridgeTools.find(
      (tool) => tool.bridge_tool_name === bridgeToolName,
    );
    if (!projectedTool) {
      return await rejectBridgeTool(
        "mcp_bridge_tool_not_available",
        `"${bridgeToolName}" is not available for this Codex turn.`,
      );
    }
    if (projectedTool.risk_level !== "read") {
      return await rejectBridgeTool(
        "mcp_bridge_write_tool_not_enabled",
        "Only read-only MCP bridge tools are enabled for Codex worker turns right now.",
        {
          bridge_tool_name: projectedTool.bridge_tool_name,
          runtime_tool_name: projectedTool.runtime_tool_name,
          risk_level: projectedTool.risk_level,
        },
      );
    }
    const mountedTool = runtimeMountedTools.find(
      (tool) => tool.runtime_tool_name === projectedTool.runtime_tool_name,
    );
    if (!mountedTool) {
      return await rejectBridgeTool(
        "mcp_bridge_runtime_tool_not_found",
        "The projected MCP bridge tool no longer maps to an active runtime tool.",
        {
          bridge_tool_name: projectedTool.bridge_tool_name,
          runtime_tool_name: projectedTool.runtime_tool_name,
        },
      );
    }

    const runtimeMcpManager = createRuntimeMcpManager({
      runId: context.run_id,
      mountedTools: runtimeMountedTools,
      clientName: "polynet-codex-worker",
      clientVersion: "0.1.0",
      loadConnectionBundle: async ({ developerAppId }) =>
        (await ctx.runAction(
          internal.appOAuth.getFreshDeveloperAppConnectionBundleInternal,
          {
            developerAppId: developerAppId as any,
          },
        )) as any,
      appendRunEvent: async (event) => {
        await appendBridgeRunEvent(event.eventType, event.payload, event.eventKey);
      },
    });
    const args = asRecord(body.arguments) ?? {};
    let result;
    try {
      result = await runtimeMcpManager.execute({
        runtimeToolName: mountedTool.runtime_tool_name,
        argumentsObject: args,
      });
    } catch (error) {
      return await rejectBridgeTool(
        "mcp_bridge_tool_failed",
        error instanceof Error ? error.message : "MCP bridge tool execution failed.",
        {
          bridge_tool_name: projectedTool.bridge_tool_name,
          runtime_tool_name: projectedTool.runtime_tool_name,
        },
      );
    }

    const outputText = String(result.outputText ?? "");
    const ok = result.status === "ok";
    await appendBridgeRunEvent("codex_mcp_bridge_tool_finished", {
      bridge_tool_name: projectedTool.bridge_tool_name,
      runtime_tool_name: projectedTool.runtime_tool_name,
      connector_name: projectedTool.connector_name,
      status: result.status,
      ok,
      error_code: result.errorCode ?? null,
      latency_ms: Date.now() - startedAt,
      output_chars: outputText.length,
    });
    if (!ok) {
      return json(200, {
        ok: false,
        code: String(result.errorCode ?? "mcp_bridge_tool_failed"),
        message: String(result.errorMessage ?? "MCP bridge tool failed."),
      });
    }
    return json(200, {
      ok: true,
      tool_name: projectedTool.bridge_tool_name,
      runtime_tool_name: projectedTool.runtime_tool_name,
      output:
        outputText.length > MCP_BRIDGE_TOOL_OUTPUT_MAX_CHARS
          ? `${outputText.slice(0, MCP_BRIDGE_TOOL_OUTPUT_MAX_CHARS)}\n[output truncated]`
          : outputText,
    });
  }

  const surfaceEntry = findPolynetPlatformToolSurfaceEntry(requestedToolName);
  if (!surfaceEntry) {
    return json(200, {
      ok: false,
      code: "unknown_platform_tool",
      message: `"${requestedToolName}" is not an available PolyNet platform tool.`,
    });
  }
  if (
    surfaceEntry.riskLevel !== "read" &&
    !CODEX_WORKER_ALLOWED_WRITE_TOOL_NAMES.has(surfaceEntry.toolName)
  ) {
    return json(200, {
      ok: false,
      code: "platform_write_tool_not_enabled",
      message:
        "This PolyNet write tool is not enabled for Codex worker turns.",
      tool_name: surfaceEntry.toolName,
      risk_level: surfaceEntry.riskLevel,
    });
  }

  // The community lens binds to the CANONICAL run row, never to anything the
  // worker echoes back — a compromised worker cannot choose the lens.
  const communityId = String(runRow.communityId ?? "").trim() || null;
  if (surfaceEntry.requiresCommunity && !communityId) {
    return json(200, {
      ok: false,
      code: "community_required",
      message: "This tool needs an active community on the thread.",
    });
  }
  if (surfaceEntry.requiresCommunity && communityId) {
    const communityAuthority = readRunCommunityAuthority(runRow);
    if (
      !runAuthorityAllowsRequiredAuthority(
        communityAuthority,
        surfaceEntry.requiredCommunityAuthority,
      )
    ) {
      const code = communityAuthorityFailureCode(
        surfaceEntry.requiredCommunityAuthority,
      );
      return json(200, {
        ok: false,
        code,
        message:
          "This tool requires stronger authority in the active community lens.",
        tool_name: surfaceEntry.toolName,
        risk_level: surfaceEntry.riskLevel,
        required_community_authority:
          surfaceEntry.requiredCommunityAuthority,
      });
    }
    const communityResourceLane = readRunCommunityResourceLane(runRow);
    if (
      !runAuthorityAllowsRequiredLane(
        communityResourceLane,
        surfaceEntry.requiredCommunityResourceLane,
        communityAuthority,
      )
    ) {
      return json(200, {
        ok: false,
        code:
          surfaceEntry.requiredCommunityResourceLane === "builder"
            ? "community_builder_authority_required"
            : "community_member_authority_required",
        message:
          surfaceEntry.requiredCommunityResourceLane === "builder"
            ? "This tool requires builder access to the active community Resources lane."
            : "This tool requires member access to the active community Resources lane.",
        tool_name: surfaceEntry.toolName,
        risk_level: surfaceEntry.riskLevel,
        required_community_resource_lane:
          surfaceEntry.requiredCommunityResourceLane,
      });
    }
  }

  // Billing hook. Every surface entry carries a policy; "free" is a no-op by
  // policy, not by absence — activating a usage-billed tool later is a policy
  // change on the registry row, enforced here.
  if (surfaceEntry.billingPolicy !== "free") {
    return json(200, {
      ok: false,
      code: "tool_billing_unsupported",
      message: "This tool's billing policy is not yet supported on worker turns.",
    });
  }

  const lease = asRecord(asRecord(body.context)?.lease);
  const projectId = String(lease?.project_id ?? "").trim() || null;
  const args = asRecord(body.arguments) ?? {};

  let result;
  try {
    result = await executeRetrievalHarnessTool({
      ctx,
      userId: String(context.owner_id),
      authSubject: context.auth_subject ?? undefined,
      projectId,
      runId: context.run_id,
      communityId,
      toolName: surfaceEntry.toolName,
      args,
      evidenceSurface: "external_mcp",
      workspaceSession: null,
    });
  } catch (error) {
    return json(200, {
      ok: false,
      code: "platform_tool_failed",
      message: error instanceof Error ? error.message : "Platform tool execution failed.",
    });
  }

  if (result.status !== "ok") {
    return json(200, {
      ok: false,
      code: String(result.errorCode ?? "platform_tool_failed"),
      message: String(result.errorMessage ?? "Platform tool execution failed."),
    });
  }

  const outputText = String(result.outputText ?? "");
  return json(200, {
    ok: true,
    tool_name: surfaceEntry.toolName,
    output:
      outputText.length > PLATFORM_TOOL_OUTPUT_MAX_CHARS
        ? `${outputText.slice(0, PLATFORM_TOOL_OUTPUT_MAX_CHARS)}\n[output truncated]`
        : outputText,
  });
}
