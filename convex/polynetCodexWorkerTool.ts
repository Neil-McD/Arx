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
} from "../shared/polynetPlatformToolSurface";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_TOOL_PATH =
  "/runtime/polynet_codex_worker_tool";

const PLATFORM_TOOL_OUTPUT_MAX_CHARS = 24_000;

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
  let runRow: { threadId?: unknown; engineId?: unknown; communityId?: unknown } | null = null;
  try {
    runRow = (await ctx.runQuery(
      (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
      { ownerId: context.owner_id, runId: context.run_id },
    )) as { threadId?: unknown; engineId?: unknown; communityId?: unknown } | null;
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

  const requestedToolName = String(body.tool_name ?? "").trim();
  const surfaceEntry = findPolynetPlatformToolSurfaceEntry(requestedToolName);
  if (!surfaceEntry) {
    return json(200, {
      ok: false,
      code: "unknown_platform_tool",
      message: `"${requestedToolName}" is not an available PolyNet platform tool.`,
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
      projectId,
      runId: context.run_id,
      communityId,
      toolName: surfaceEntry.toolName,
      args,
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
