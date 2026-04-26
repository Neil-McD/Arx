import { type AuthSessionLike } from "./authSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";

export type DaytonaWorkspaceTerminalRecord = {
  id: string;
  run_id_started_by: string | null;
  status: "starting" | "running" | "exited" | "failed" | "stopped";
  command: string;
  cwd: string | null;
  preview_port: number | null;
  preview_path: string | null;
  preview_label: string | null;
  started_at: number;
  updated_at: number;
  finished_at: number | null;
  exit_code: number | null;
  output_tail: string | null;
};

export type DaytonaWorkspaceTerminalPreview = {
  terminal_session_id: string;
  preview_port: number;
  preview_url: string;
  preview_proxy_token: string;
  preview_path: string | null;
  preview_label: string | null;
  expires_in_seconds: number;
};

export type DaytonaWorkspaceTerminalSnapshot = {
  active: DaytonaWorkspaceTerminalRecord[];
  recent: DaytonaWorkspaceTerminalRecord[];
};

function mapWorkspaceTerminalRow(
  row: Record<string, unknown> | null | undefined,
): DaytonaWorkspaceTerminalRecord {
  return {
    id: String(row?.id ?? "").trim(),
    run_id_started_by:
      typeof row?.run_id_started_by === "string" && row.run_id_started_by.trim()
        ? row.run_id_started_by.trim()
        : null,
    status: (String(row?.status ?? "stopped").trim() || "stopped") as DaytonaWorkspaceTerminalRecord["status"],
    command: String(row?.command ?? "").trim(),
    cwd: typeof row?.cwd === "string" && row.cwd.trim() ? row.cwd.trim() : null,
    preview_port: typeof row?.preview_port === "number" ? Math.floor(row.preview_port) : null,
    preview_path: typeof row?.preview_path === "string" && row.preview_path.trim() ? row.preview_path.trim() : null,
    preview_label: typeof row?.preview_label === "string" && row.preview_label.trim() ? row.preview_label.trim() : null,
    started_at: Number(row?.started_at ?? 0) || 0,
    updated_at: Number(row?.updated_at ?? 0) || 0,
    finished_at: typeof row?.finished_at === "number" ? row.finished_at : null,
    exit_code: typeof row?.exit_code === "number" ? row.exit_code : null,
    output_tail:
      typeof row?.output_tail === "string" && row.output_tail.trim()
        ? row.output_tail
        : null,
  };
}

export async function listProjectWorkspaceTerminalSnapshot<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<DaytonaWorkspaceTerminalSnapshot> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const payload = (await client.action("workspaceTerminals:listProjectWorkspaceTerminalSnapshot" as any, {
    authSubject,
    projectId: params.projectId,
  })) as {
    active?: Array<Record<string, unknown>> | null;
    recent?: Array<Record<string, unknown>> | null;
  } | null;
  return {
    active: Array.isArray(payload?.active) ? payload.active.map((row) => mapWorkspaceTerminalRow(row)) : [],
    recent: Array.isArray(payload?.recent) ? payload.recent.map((row) => mapWorkspaceTerminalRow(row)) : [],
  };
}

export async function stopProjectWorkspaceTerminal<TSession>(params: {
  session: TSession;
  terminalSessionId: string;
  runId?: string | null;
}): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  await client.action("workspaceTerminals:stopProjectWorkspaceTerminal" as any, {
    authSubject,
    terminalSessionId: params.terminalSessionId,
    runId: params.runId ?? undefined,
  });
}

export async function stopAllProjectWorkspaceTerminals<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  await client.action("workspaceTerminals:stopAllProjectWorkspaceTerminals" as any, {
    authSubject,
    projectId: params.projectId,
  });
}

export async function getProjectWorkspaceTerminalPreviewUrl<TSession>(params: {
  session: TSession;
  terminalSessionId: string;
  runId?: string | null;
}): Promise<DaytonaWorkspaceTerminalPreview | null> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const payload = (await client.action("workspaceTerminals:getWorkspaceTerminalPreviewUrl" as any, {
    authSubject,
    terminalSessionId: params.terminalSessionId,
    runId: params.runId ?? undefined,
  })) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) return null;
  const previewUrl = String(payload.preview_url ?? "").trim();
  const previewProxyToken = String(payload.preview_proxy_token ?? "").trim();
  const previewPort = Number(payload.preview_port ?? 0);
  if (!previewUrl || !previewProxyToken || !Number.isFinite(previewPort) || previewPort < 1) return null;
  return {
    terminal_session_id: String(payload.terminal_session_id ?? "").trim(),
    preview_port: Math.floor(previewPort),
    preview_url: previewUrl,
    preview_proxy_token: previewProxyToken,
    preview_path: typeof payload.preview_path === "string" && payload.preview_path.trim() ? payload.preview_path.trim() : null,
    preview_label: typeof payload.preview_label === "string" && payload.preview_label.trim() ? payload.preview_label.trim() : null,
    expires_in_seconds: Number(payload.expires_in_seconds ?? 0) || 0,
  };
}
