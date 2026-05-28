import { type AuthSessionLike } from "./authSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";

export type WorkspaceTerminalRecord = {
  id: string;
  lifecycle_owner: "project_background";
  started_by_thread_id: string | null;
  started_by_run_id: string | null;
  provider_sandbox_provider_id: "blaxel" | null;
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
  completion_recorded_at: number | null;
  completion_reason:
    | "exited"
    | "failed"
    | "stopped"
    | "sandbox_missing"
    | "session_missing"
    | "command_missing"
    | "preflight_failed"
    | null;
  output_tail: string | null;
  last_heartbeat_at: number | null;
  health_status: "unknown" | "starting" | "healthy" | "unhealthy" | "exited" | "stale";
  health_summary: string | null;
  preview_status:
    | "none"
    | "starting"
    | "running"
    | "blank"
    | "render_error_suspected"
    | "unreachable"
    | "server_exited";
  last_preview_probe_at: number | null;
  last_preview_probe_summary: string | null;
  last_browser_observation_at: number | null;
  last_browser_observation_summary: string | null;
  preview_transport_status:
    | "not_started"
    | "loading"
    | "loaded"
    | "failed"
    | null;
  preview_inspection_status:
    | "not_attempted"
    | "same_origin_dom"
    | "cross_origin_uninspectable"
    | "dom_unavailable"
    | null;
  preview_render_status:
    | "unknown"
    | "visible_content"
    | "blank_suspected"
    | "transport_error"
    | null;
};

export type WorkspaceTerminalPreview = {
  terminal_session_id: string;
  preview_port: number;
  preview_url: string;
  preview_proxy_token: string;
  preview_path: string | null;
  preview_label: string | null;
  expires_in_seconds: number;
};

export type WorkspaceTerminalPreviewStatus =
  WorkspaceTerminalRecord["preview_status"];

export type WorkspaceTerminalSnapshot = {
  active: WorkspaceTerminalRecord[];
  recent: WorkspaceTerminalRecord[];
};

export type WorkspaceComputerStartResult =
  | {
      ok: true;
      status: "active";
      provider_sandbox_id: string | null;
      credit_budget_credits: number | null;
      credit_budget_expires_at: number | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      required_credits: number | null;
    };

export type WorkspaceComputerStopResult = {
  ok: true;
  status: "standby";
  stopped_count: number;
  provider_sandbox_id: string | null;
};

function mapWorkspaceTerminalRow(
  row: Record<string, unknown> | null | undefined,
): WorkspaceTerminalRecord {
  return {
    id: String(row?.id ?? "").trim(),
    lifecycle_owner: "project_background",
    started_by_thread_id:
      typeof row?.started_by_thread_id === "string" && row.started_by_thread_id.trim()
        ? row.started_by_thread_id.trim()
        : null,
    started_by_run_id:
      typeof row?.started_by_run_id === "string" && row.started_by_run_id.trim()
        ? row.started_by_run_id.trim()
        : null,
    provider_sandbox_provider_id:
      row?.provider_sandbox_provider_id === "blaxel"
        ? row.provider_sandbox_provider_id
        : null,
    status: (String(row?.status ?? "stopped").trim() || "stopped") as WorkspaceTerminalRecord["status"],
    command: String(row?.command ?? "").trim(),
    cwd: typeof row?.cwd === "string" && row.cwd.trim() ? row.cwd.trim() : null,
    preview_port: typeof row?.preview_port === "number" ? Math.floor(row.preview_port) : null,
    preview_path: typeof row?.preview_path === "string" && row.preview_path.trim() ? row.preview_path.trim() : null,
    preview_label: typeof row?.preview_label === "string" && row.preview_label.trim() ? row.preview_label.trim() : null,
    started_at: Number(row?.started_at ?? 0) || 0,
    updated_at: Number(row?.updated_at ?? 0) || 0,
    finished_at: typeof row?.finished_at === "number" ? row.finished_at : null,
    exit_code: typeof row?.exit_code === "number" ? row.exit_code : null,
    completion_recorded_at:
      typeof row?.completion_recorded_at === "number"
        ? row.completion_recorded_at
        : null,
    completion_reason:
      typeof row?.completion_reason === "string" && row.completion_reason.trim()
        ? (row.completion_reason.trim() as WorkspaceTerminalRecord["completion_reason"])
        : null,
    output_tail:
      typeof row?.output_tail === "string" && row.output_tail.trim()
        ? row.output_tail
        : null,
    last_heartbeat_at: typeof row?.last_heartbeat_at === "number" ? row.last_heartbeat_at : null,
    health_status: (String(row?.health_status ?? "unknown").trim() || "unknown") as WorkspaceTerminalRecord["health_status"],
    health_summary:
      typeof row?.health_summary === "string" && row.health_summary.trim()
        ? row.health_summary.trim()
        : null,
    preview_status: (String(row?.preview_status ?? "none").trim() || "none") as WorkspaceTerminalRecord["preview_status"],
    last_preview_probe_at:
      typeof row?.last_preview_probe_at === "number"
        ? row.last_preview_probe_at
        : null,
    last_preview_probe_summary:
      typeof row?.last_preview_probe_summary === "string" && row.last_preview_probe_summary.trim()
        ? row.last_preview_probe_summary.trim()
        : null,
    last_browser_observation_at:
      typeof row?.last_browser_observation_at === "number"
        ? row.last_browser_observation_at
        : null,
    last_browser_observation_summary:
      typeof row?.last_browser_observation_summary === "string" && row.last_browser_observation_summary.trim()
        ? row.last_browser_observation_summary.trim()
        : null,
    preview_transport_status:
      typeof row?.preview_transport_status === "string" && row.preview_transport_status.trim()
        ? (row.preview_transport_status.trim() as WorkspaceTerminalRecord["preview_transport_status"])
        : null,
    preview_inspection_status:
      typeof row?.preview_inspection_status === "string" && row.preview_inspection_status.trim()
        ? (row.preview_inspection_status.trim() as WorkspaceTerminalRecord["preview_inspection_status"])
        : null,
    preview_render_status:
      typeof row?.preview_render_status === "string" && row.preview_render_status.trim()
        ? (row.preview_render_status.trim() as WorkspaceTerminalRecord["preview_render_status"])
        : null,
  };
}

function normalizeComputerStartResult(value: unknown): WorkspaceComputerStartResult {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (row.ok === true) {
    return {
      ok: true,
      status: "active",
      provider_sandbox_id:
        typeof row.provider_sandbox_id === "string" && row.provider_sandbox_id.trim()
          ? row.provider_sandbox_id.trim()
          : null,
      credit_budget_credits: Number.isFinite(Number(row.credit_budget_credits))
        ? Number(row.credit_budget_credits)
        : null,
      credit_budget_expires_at: Number.isFinite(Number(row.credit_budget_expires_at))
        ? Number(row.credit_budget_expires_at)
        : null,
    };
  }
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details)
    ? row.details as Record<string, unknown>
    : {};
  return {
    ok: false,
    status: Number.isFinite(Number(row.status)) ? Number(row.status) : 503,
    code: String(row.code ?? "workspace_computer_unavailable"),
    message: String(row.message ?? "Computer is unavailable."),
    required_credits: Number.isFinite(Number(details.required_credits))
      ? Number(details.required_credits)
      : null,
  };
}

export async function startProjectWorkspaceComputer<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<WorkspaceComputerStartResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const payload = await client.action("workspaceTerminals:startProjectWorkspaceComputer" as any, {
    authSubject,
    projectId: params.projectId,
  });
  return normalizeComputerStartResult(payload);
}

export async function stopProjectWorkspaceComputer<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<WorkspaceComputerStopResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const payload = await client.action("workspaceTerminals:stopProjectWorkspaceComputer" as any, {
    authSubject,
    projectId: params.projectId,
  });
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  return {
    ok: true,
    status: "standby",
    stopped_count: Number.isFinite(Number(row.stopped_count)) ? Number(row.stopped_count) : 0,
    provider_sandbox_id:
      typeof row.provider_sandbox_id === "string" && row.provider_sandbox_id.trim()
        ? row.provider_sandbox_id.trim()
        : null,
  };
}

export async function listProjectWorkspaceTerminalSnapshot<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<WorkspaceTerminalSnapshot> {
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
}): Promise<WorkspaceTerminalPreview | null> {
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

export async function recordProjectWorkspaceTerminalPreviewObservation<TSession>(params: {
  session: TSession;
  terminalSessionId: string;
  runId?: string | null;
  previewStatus?: WorkspaceTerminalPreviewStatus | null;
  previewProbeSummary?: string | null;
  browserObservationSummary?: string | null;
  previewTransportStatus?: Exclude<
    WorkspaceTerminalRecord["preview_transport_status"],
    null
  > | null;
  previewInspectionStatus?: Exclude<
    WorkspaceTerminalRecord["preview_inspection_status"],
    null
  > | null;
  previewRenderStatus?: Exclude<
    WorkspaceTerminalRecord["preview_render_status"],
    null
  > | null;
}): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  await client.action("workspaceTerminals:recordWorkspaceTerminalPreviewObservation" as any, {
    authSubject,
    terminalSessionId: params.terminalSessionId,
    runId: params.runId ?? undefined,
    previewStatus: params.previewStatus ?? undefined,
    previewProbeSummary: params.previewProbeSummary ?? undefined,
    browserObservationSummary: params.browserObservationSummary ?? undefined,
    previewTransportStatus: params.previewTransportStatus ?? undefined,
    previewInspectionStatus: params.previewInspectionStatus ?? undefined,
    previewRenderStatus: params.previewRenderStatus ?? undefined,
  });
}
