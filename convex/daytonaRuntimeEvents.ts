import {
  type NativeToolExecutionResult,
  type NativeToolResultEnvelope,
} from "../shared/nativeToolLoop";
import {
  formatRuntimeDiagnosticSummary,
  parseRuntimeDiagnosticsFromText,
  selectTopRuntimeDiagnostic,
} from "../shared/runtimeDiagnostics";
import { getShellCommandAuditMetadataForToolCall } from "../shared/runtimeToolPolicy";
import { isVerificationShellCommand } from "../shared/runtimeWorkingStateLedger";

function normalizeCommand(args: Record<string, unknown>): string | null {
  const command = String(args.command ?? "").replace(/\s+/g, " ").trim();
  return command || null;
}

export async function appendWorkspaceToolCallStarted(params: {
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
  runId: string;
  harnessName: "chat_tools";
  communityId?: string | null;
  iteration: number;
  providerCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<void> {
  const toolCallId = `runtime_tools:${params.runId}:${params.harnessName}:${params.iteration}`;
  const shellCommandAuditMetadata = getShellCommandAuditMetadataForToolCall({
    toolName: params.toolName,
    normalizedArgs: params.args,
  });
  await params.appendRunEvent({
    eventType: "tool_call_started",
    eventKey: `${params.runId}:${params.harnessName}_tool_call_started:${params.iteration}`,
    payload: {
      run_id: params.runId,
      tool_call_id: toolCallId,
      provider_call_id: params.providerCallId,
      tool_name: params.toolName,
      args: params.args,
      ...(shellCommandAuditMetadata ?? {}),
      attempt: 1,
      community_scope_id: params.communityId ?? null,
      harness: {
        kind: params.harnessName,
      },
    },
  });
}

export async function appendWorkspaceToolCallFinished(params: {
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
  runId: string;
  harnessName: "chat_tools";
  iteration: number;
  providerCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  toolResult: NativeToolExecutionResult;
  toolResultEnvelope: NativeToolResultEnvelope;
}): Promise<void> {
  const toolCallId = `runtime_tools:${params.runId}:${params.harnessName}:${params.iteration}`;
  const shellCommandAuditMetadata = getShellCommandAuditMetadataForToolCall({
    toolName: params.toolName,
    normalizedArgs: params.args,
  });
  const command = params.toolName === "bash" ? normalizeCommand(params.args) : null;
  const diagnostics =
    params.toolName === "bash" &&
    params.toolResult.status !== "ok" &&
    isVerificationShellCommand(command)
      ? parseRuntimeDiagnosticsFromText({
          command,
          outputText: [
            params.toolResult.errorMessage,
            params.toolResult.outputText,
          ]
            .filter(Boolean)
            .join("\n"),
        })
      : [];
  const topDiagnosticSummary = formatRuntimeDiagnosticSummary(
    selectTopRuntimeDiagnostic(diagnostics),
  );
  const webSources = Array.isArray(params.toolResult.details?.web_sources)
    ? params.toolResult.details?.web_sources
    : null;
  await params.appendRunEvent({
    eventType: "tool_call_finished",
    eventKey: `${params.runId}:${params.harnessName}_tool_call_finished:${params.iteration}`,
    payload: {
      run_id: params.runId,
      tool_call_id: toolCallId,
      provider_call_id: params.providerCallId,
      args: params.args,
      ...(shellCommandAuditMetadata ?? {}),
      attempt: 1,
      ...params.toolResultEnvelope,
      tool_name: params.toolName,
      ...(params.toolResult.details && typeof params.toolResult.details === "object"
        ? { details: params.toolResult.details }
        : null),
      ...(diagnostics.length > 0
        ? {
            diagnostics,
            diagnostic_count: diagnostics.length,
            top_diagnostic_summary: topDiagnosticSummary,
          }
        : null),
      output_preview: params.toolResult.outputText.slice(0, 2000),
      ...(webSources ? { web_sources: webSources } : null),
    },
  });
  if (diagnostics.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "runtime_diagnostics_detected",
        eventKey: `${params.runId}:${params.harnessName}_runtime_diagnostics:${params.iteration}`,
        payload: {
          run_id: params.runId,
          tool_call_id: toolCallId,
          provider_call_id: params.providerCallId,
          tool_name: params.toolName,
          command,
          diagnostic_source: diagnostics[0]?.source ?? "shell",
          diagnostic_count: diagnostics.length,
          diagnostics,
          top_diagnostic_summary: topDiagnosticSummary,
        },
      });
    } catch {
      // Best-effort diagnostics sidecar only; the primary tool event already carries diagnostics.
    }
  }
}
