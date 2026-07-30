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
  findPolynetPlatformToolSurfaceEntry,
  type PolynetPlatformToolRequiredCommunityAuthority,
} from "../shared/polynetPlatformToolSurface";
import {
  normalizeCommunityResourceRuntimeLane,
  type CommunityResourceRuntimeLane,
} from "../shared/communityResourceLane";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_TOOL_PATH =
  "/runtime/polynet_codex_worker_tool";

const PLATFORM_TOOL_OUTPUT_MAX_CHARS = 24_000;
const CODEX_WORKER_ALLOWED_WRITE_TOOL_NAMES = new Set([
  "polynet_write",
  "polynet_call",
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
      evidenceSurface: "coding_harness",
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
