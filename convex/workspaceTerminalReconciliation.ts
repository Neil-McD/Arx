import { internal } from "./_generated/api";
import {
  deleteDaytonaProcessSession,
  findDaytonaProcessSessionCommand,
  getDaytonaProcessSession,
  getDaytonaProcessSessionCommandLogs,
  readDaytonaProcessSessionCommandExitCode,
  type DaytonaProcessSessionDto,
} from "./daytonaProcessSessions";
import {
  releaseProjectBackgroundSandboxIfIdle,
  resolveTerminalSandboxContext,
} from "./workspaceTerminalBackgroundService";
import {
  normalizeWorkspaceTerminalLifecycleOwner,
  summarizeWorkspaceTerminalRow,
  truncateTerminalOutputTail,
  type WorkspaceTerminalHealthStatus,
  type WorkspaceTerminalLifecycleOwner,
  type WorkspaceTerminalPreviewStatus,
} from "./workspaceTerminalProcessCore";

function readFailureText(value: unknown): string {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return String(record?.response_text ?? "").trim().toLowerCase();
}

function failureMessageIncludes(value: unknown, needle: string): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const message = String(record?.message ?? "").trim().toLowerCase();
  return message.includes(needle.toLowerCase());
}

export function isConfirmedSandboxGoneFailure(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const code = String(record?.code ?? "").trim().toLowerCase();
  const failureText = readFailureText(record?.details);
  if (code === "terminal_not_found" || code === "sandbox_not_found") return true;
  if (failureText.includes("not found")) return true;
  if (failureMessageIncludes(value, "terminal state 'destroyed'")) return true;
  if (failureMessageIncludes(value, "terminal state 'destroying'")) return true;
  if (failureMessageIncludes(value, "terminal state 'error'")) return true;
  if (failureMessageIncludes(value, "terminal state 'build_failed'")) return true;
  return false;
}

export function isConfirmedSessionGoneFailure(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const code = String(record?.code ?? "").trim().toLowerCase();
  const failureText = readFailureText(record?.details);
  if (code === "terminal_not_found") return true;
  if (failureText.includes("not found")) return true;
  return false;
}

export function findDaytonaProcessSessionById(
  sessions: DaytonaProcessSessionDto[],
  sessionId: string,
): DaytonaProcessSessionDto | null {
  return (
    sessions.find(
      (session) =>
        String(session?.sessionId ?? session?.id ?? "").trim() === sessionId,
    ) ?? null
  );
}

export async function reconcileWorkspaceTerminalRow(params: {
  ctx: any;
  ownerId: any;
  row: any;
  lifecycleOwner?: WorkspaceTerminalLifecycleOwner;
}): Promise<ReturnType<typeof summarizeWorkspaceTerminalRow>> {
  const row = params.row;
  const lifecycleOwner = normalizeWorkspaceTerminalLifecycleOwner(
    params.lifecycleOwner ?? row?.lifecycleOwner,
  );
  const normalizedStatus = String(row?.status ?? "").trim().toLowerCase();
  if (
    normalizedStatus !== "starting" &&
    normalizedStatus !== "running"
  ) {
    return summarizeWorkspaceTerminalRow(row);
  }

  const projectId = String(row.projectId ?? "").trim();
  const providerSandboxId = String(row.providerSandboxId ?? "").trim();
  const providerSessionId = String(row.providerSessionId ?? "").trim();
  const providerCommandId = String(row.providerCommandId ?? "").trim();
  const nowMs = Date.now();

  const failAndRelease = async (
    status: "failed" | "stopped" | "exited" | "running" | "starting" = "failed",
  ): Promise<ReturnType<typeof summarizeWorkspaceTerminalRow>> => {
    const healthStatus: WorkspaceTerminalHealthStatus =
      status === "running"
        ? "healthy"
        : status === "starting"
          ? "starting"
          : status === "failed"
            ? "unhealthy"
            : "exited";
    const previewStatus: WorkspaceTerminalPreviewStatus = row.previewPort
      ? status === "running"
        ? "running"
        : status === "starting"
          ? "starting"
          : "server_exited"
      : "none";
    const patched = await params.ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      {
        terminalSessionId: row._id,
        status,
        finishedAt: nowMs,
        updatedAt: nowMs,
        lastHeartbeatAt: nowMs,
        healthStatus,
        healthSummary:
          healthStatus === "healthy"
            ? "Process is running."
            : healthStatus === "starting"
              ? "Process is starting."
              : healthStatus === "unhealthy"
                ? "Process session is no longer available."
                : "Process is no longer running.",
        previewStatus,
      },
    );
    if (lifecycleOwner === "project_background") {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx: params.ctx,
        ownerId: params.ownerId,
        projectId,
        providerSandboxId,
      });
    }
    return summarizeWorkspaceTerminalRow(patched ?? row);
  };

  const sandbox = await resolveTerminalSandboxContext({
    ctx: params.ctx,
    projectId,
    providerSandboxId,
    touchProjectBackground: lifecycleOwner === "project_background",
  });
  if (!sandbox.ok) {
    if (isConfirmedSandboxGoneFailure(sandbox)) {
      return await failAndRelease("failed");
    }
    return summarizeWorkspaceTerminalRow(row);
  }

  const session = await getDaytonaProcessSession({
    config: sandbox.config,
    toolboxProxyUrl: sandbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    sessionId: providerSessionId,
  });
  if (!session.ok) {
    if (isConfirmedSessionGoneFailure(session)) {
      return await failAndRelease("failed");
    }
    return summarizeWorkspaceTerminalRow(row);
  }

  const command = findDaytonaProcessSessionCommand(
    session.session,
    providerCommandId,
  );
  if (!command) {
    return await failAndRelease("failed");
  }

  const logs = await getDaytonaProcessSessionCommandLogs({
    config: sandbox.config,
    toolboxProxyUrl: sandbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    sessionId: providerSessionId,
    commandId: providerCommandId,
  });

  const exitCode = readDaytonaProcessSessionCommandExitCode(command);
  if (!logs.ok && exitCode === null) {
    return summarizeWorkspaceTerminalRow(row);
  }

  const nextStatus = exitCode === null ? "running" : exitCode === 0 ? "exited" : "failed";
  const healthStatus: WorkspaceTerminalHealthStatus =
    nextStatus === "running"
      ? "healthy"
      : nextStatus === "exited"
        ? "exited"
        : "unhealthy";
  const healthSummary =
    nextStatus === "running"
      ? "Process is running."
      : nextStatus === "exited"
        ? `Process exited with code ${exitCode}.`
        : `Process failed with exit code ${exitCode}.`;
  const previewStatus: WorkspaceTerminalPreviewStatus = row.previewPort
    ? nextStatus === "running"
      ? "running"
      : "server_exited"
    : "none";
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: row._id,
      status: nextStatus,
      updatedAt: nowMs,
      lastHeartbeatAt: nowMs,
      healthStatus,
      healthSummary,
      previewStatus,
      ...(exitCode === null ? null : { finishedAt: nowMs, exitCode }),
      ...(logs.ok ? { lastOutputTail: truncateTerminalOutputTail(logs.output) } : null),
    },
  );

  if (exitCode !== null) {
    await deleteDaytonaProcessSession({
      config: sandbox.config,
      toolboxProxyUrl: sandbox.toolboxProxyUrl,
      sandboxId: providerSandboxId,
      sessionId: providerSessionId,
    });
    if (lifecycleOwner === "project_background") {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx: params.ctx,
        ownerId: params.ownerId,
        projectId,
        providerSandboxId,
      });
    }
  }

  return summarizeWorkspaceTerminalRow(patched ?? row);
}
