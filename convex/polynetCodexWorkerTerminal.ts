import { internal } from "./_generated/api";
import {
  startWorkspaceTerminalProcess,
  resolveWorkspaceTerminalPreview,
  normalizeWorkspaceTerminalStartArgs,
} from "./workspaceTerminalProcessCore";
import {
  parsePolynetCodexWorkerIngestContext,
} from "./polynetCodexWorkerIngest";
import { POLYNET_CODEX_WORKER_ENGINE_ID } from "./polynetCodexWorkerBridge";
import {
  verifyPolynetCodexWorkerRunToken,
} from "./polynetCodexWorkerRunToken";
import {
  formatWorkspacePreviewPortRange,
} from "../shared/workspacePreviewPort";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_TERMINAL_PATH =
  "/runtime/polynet_codex_worker_terminal";

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

export function buildPolynetCodexWorkerTerminalTarget(): string | null {
  const siteUrl = readEnv("CONVEX_SITE_URL").replace(/\/+$/, "");
  if (!siteUrl) return null;
  return `${siteUrl}${POLYNET_CODEX_WORKER_TERMINAL_PATH}`;
}

// Lets the headless Codex worker start a long-running served process (dev
// server) through the SAME terminal-process system the native runtime uses:
// the persisted terminal row lights up the background-terminal rail and the
// workspace app preview, and the preview URL is the access-gated proxy URL,
// never a raw provider URL.
export async function handlePolynetCodexWorkerTerminal(
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
    expectedAudience: "terminal",
    context,
  });
  if (!runTokenVerification.ok) {
    return json(runTokenVerification.status, {
      ok: false,
      code: runTokenVerification.code,
      message: runTokenVerification.message,
    });
  }

  // The signed run token proves Convex minted this short-lived request; the
  // live run row still remains the authority for owner/thread/engine.
  let runRow: { threadId?: unknown; engineId?: unknown } | null = null;
  try {
    runRow = (await ctx.runQuery(
      (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
      { ownerId: context.owner_id, runId: context.run_id },
    )) as { threadId?: unknown; engineId?: unknown } | null;
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

  const lease = asRecord(asRecord(body.context)?.lease);
  const projectId = String(lease?.project_id ?? "").trim();
  const providerSandboxId = String(lease?.provider_sandbox_id ?? "").trim();
  if (!projectId || !providerSandboxId) {
    return json(400, {
      ok: false,
      code: "project_workspace_required",
      message: "Serving an app requires a project-bound workspace turn.",
    });
  }

  let terminal: ReturnType<typeof normalizeWorkspaceTerminalStartArgs>;
  try {
    terminal = normalizeWorkspaceTerminalStartArgs({
      command: String(body.command ?? ""),
      cwd: body.cwd,
      preview_port: body.port,
      preview_path: body.path,
      preview_label: body.label ?? "codex-serve",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error ?? "");
    if (errorMessage !== "invalid_preview_port") {
      return json(400, {
        ok: false,
        code: "invalid_terminal_arguments",
        message: "Terminal arguments are invalid.",
      });
    }
    return json(400, {
      ok: false,
      code: "valid_port_required",
      message: `port must be an integer between ${formatWorkspacePreviewPortRange()}.`,
    });
  }
  if (!terminal.command.trim()) {
    return json(400, { ok: false, code: "command_required" });
  }
  if (terminal.previewPort === null) {
    return json(400, {
      ok: false,
      code: "valid_port_required",
      message: `port must be an integer between ${formatWorkspacePreviewPortRange()}.`,
    });
  }

  const session = {
    providerId: "blaxel" as const,
    providerSandboxId,
    workspaceRoot: "/workspace",
  };

  let started: JsonRecord;
  try {
    started = await startWorkspaceTerminalProcess({
      ctx,
      ownerId: context.owner_id,
      projectId,
      threadId: context.thread_id as any,
      startedByRunId: context.run_id,
      session,
      terminal,
      providerSessionIdPrefix: "pn-codex-serve",
    });
  } catch (error) {
    return json(502, {
      ok: false,
      code: "terminal_start_failed",
      message: error instanceof Error ? error.message : "Terminal start failed.",
    });
  }
  if (started.ok !== true) {
    return json(200, {
      ok: false,
      code: String(started.code ?? "terminal_start_failed"),
      message: String(started.message ?? "Terminal start failed."),
      ...(typeof started.output_tail === "string" && started.output_tail
        ? { output_tail: started.output_tail }
        : {}),
      ...(typeof started.terminal_session_id === "string" && started.terminal_session_id
        ? { terminal_session_id: started.terminal_session_id }
        : {}),
    });
  }

  const preview = (await resolveWorkspaceTerminalPreview({
    row: {
      _id: String(started.terminal_session_id ?? ""),
      previewPort: terminal.previewPort,
      previewPath: terminal.previewPath,
      previewLabel: terminal.previewLabel,
      providerSandboxId,
    },
    session,
    workspaceRequiredMessage: "Workspace session is required for previews.",
    previewNotEnabledMessage: "This process does not expose a preview port.",
    workspaceMismatchMessage: "Workspace session changed; restart the app.",
  })) as JsonRecord;
  if (preview.ok !== true) {
    // The server IS running at this point — only the preview URL failed. Say
    // so explicitly so the model retries the URL instead of the server.
    return json(200, {
      ok: false,
      code: String(preview.code ?? "preview_url_unavailable"),
      message: `The server is running on port ${terminal.previewPort}, but the preview URL could not be issued: ${String(
        preview.message ?? "Preview is unavailable.",
      )} Do not restart the server — call workspace_serve again with the same command and port to retry the preview URL.`,
      terminal_session_id: String(started.terminal_session_id ?? ""),
      server_status: "running",
    });
  }

  return json(200, {
    ok: true,
    terminal_session_id: String(started.terminal_session_id ?? ""),
    port: terminal.previewPort,
    preview_url: String(preview.url ?? ""),
  });
}
