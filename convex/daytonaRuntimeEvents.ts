import {
  type NativeToolExecutionResult,
  type NativeToolResultEnvelope,
} from "../shared/nativeToolLoop";
import { type RetrievalToolName } from "../shared/retrievalTools";

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
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
}): Promise<void> {
  const toolCallId = `runtime_tools:${params.runId}:${params.harnessName}:${params.iteration}`;
  await params.appendRunEvent({
    eventType: "tool_call_started",
    eventKey: `${params.runId}:${params.harnessName}_tool_call_started:${params.iteration}`,
    payload: {
      run_id: params.runId,
      tool_call_id: toolCallId,
      provider_call_id: params.providerCallId,
      tool_name: params.toolName,
      args: params.args,
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
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  toolResult: NativeToolExecutionResult;
  toolResultEnvelope: NativeToolResultEnvelope;
}): Promise<void> {
  const toolCallId = `runtime_tools:${params.runId}:${params.harnessName}:${params.iteration}`;
  await params.appendRunEvent({
    eventType: "tool_call_finished",
    eventKey: `${params.runId}:${params.harnessName}_tool_call_finished:${params.iteration}`,
    payload: {
      run_id: params.runId,
      tool_call_id: toolCallId,
      provider_call_id: params.providerCallId,
      tool_name: params.toolName,
      args: params.args,
      attempt: 1,
      ...params.toolResultEnvelope,
      output_preview: params.toolResult.outputText.slice(0, 2000),
    },
  });
}
