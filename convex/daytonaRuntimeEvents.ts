import {
  type NativeToolExecutionResult,
  type NativeToolResultEnvelope,
} from "../shared/nativeToolLoop";
import {
  formatRuntimeDiagnosticSummary,
  parseRuntimeDiagnosticsFromText,
  selectTopRuntimeDiagnostic,
  type RuntimeDiagnostic,
} from "../shared/runtimeDiagnostics";
import { inferRuntimeToolFailureSemantics } from "../shared/runtimeToolFailureSemantics";
import { getShellCommandAuditMetadataForToolCall } from "../shared/runtimeToolPolicy";
import { isVerificationShellCommand } from "../shared/runtimeWorkingStateLedger";

function normalizeCommand(args: Record<string, unknown>): string | null {
  const command = String(args.command ?? "").replace(/\s+/g, " ").trim();
  return command || null;
}

function normalizeText(value: unknown, maxLen = 500): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}...`
    : normalized;
}

function normalizeExitCode(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return numeric;
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
  const outputText = [
    params.toolResult.errorMessage,
    params.toolResult.outputText,
    normalizeText(params.toolResult.details?.output_preview, 2000),
  ]
    .filter(Boolean)
    .join("\n");
  const failureSemantics =
    params.toolResult.status !== "ok"
      ? inferRuntimeToolFailureSemantics({
          toolName: params.toolName,
          command,
          cwd: normalizeText(params.toolResult.details?.cwd, 260),
          exitCode:
            params.toolResult.exitCode ??
            normalizeExitCode(params.toolResult.details?.exit_code),
          errorCode: params.toolResult.errorCode,
          errorMessage: params.toolResult.errorMessage,
          outputText,
        })
      : null;
  const parsedDiagnostics =
    params.toolName === "bash" &&
    params.toolResult.status !== "ok" &&
    isVerificationShellCommand(command)
      ? parseRuntimeDiagnosticsFromText({
          command,
          outputText,
        })
      : [];
  const diagnostics: RuntimeDiagnostic[] = [
    ...parsedDiagnostics,
    ...(failureSemantics?.diagnostic ? [failureSemantics.diagnostic] : []),
  ];
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
      ...(failureSemantics
        ? {
            failure_semantics: {
              kind: failureSemantics.kind,
              summary: failureSemantics.summary,
              suggested_recovery: failureSemantics.suggestedRecovery,
              tool_name: failureSemantics.toolName,
              ...(failureSemantics.command
                ? { command: failureSemantics.command }
                : null),
              ...(failureSemantics.cwd ? { cwd: failureSemantics.cwd } : null),
              ...(typeof failureSemantics.exitCode === "number"
                ? { exit_code: failureSemantics.exitCode }
                : null),
              ...(failureSemantics.failedExecutable
                ? { failed_executable: failureSemantics.failedExecutable }
                : null),
            },
          }
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
          ...(failureSemantics
            ? {
                failure_semantics: {
                  kind: failureSemantics.kind,
                  summary: failureSemantics.summary,
                  suggested_recovery: failureSemantics.suggestedRecovery,
                  ...(failureSemantics.command
                    ? { command: failureSemantics.command }
                    : null),
                  ...(failureSemantics.cwd ? { cwd: failureSemantics.cwd } : null),
                  ...(typeof failureSemantics.exitCode === "number"
                    ? { exit_code: failureSemantics.exitCode }
                    : null),
                  ...(failureSemantics.failedExecutable
                    ? { failed_executable: failureSemantics.failedExecutable }
                    : null),
                },
              }
            : null),
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
