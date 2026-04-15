import type {
  RuntimeKernelFailureInput,
  RuntimeKernelFailure,
  RuntimeKernelResolvedStep,
  RuntimeKernelSuccess,
  RuntimeKernelToolExecutionResult,
  RuntimeKernelToolResultEnvelope,
} from "./runtimeKernelTypes.ts";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "./runtimeKernelTypes.ts";
import {
  buildToolResultContent,
  buildToolResultEnvelope,
  runNativeRuntimeKernel,
} from "./runtimeKernel.ts";
import type {
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
} from "./nativeToolProtocol.ts";

export type NativeToolExecutionResult = RuntimeKernelToolExecutionResult;
export type NativeToolResultEnvelope<TToolName extends string = string> =
  RuntimeKernelToolResultEnvelope<TToolName>;
export type NativeToolLoopFailure<TToolName extends string = string> =
  RuntimeKernelFailure<TToolName>;
export type NativeToolLoopFailureInput = RuntimeKernelFailureInput;
export type NativeToolLoopSuccess<TToolName extends string = string> =
  RuntimeKernelSuccess<TToolName>;
export type NativeToolLoopStep<TToolName extends string = string> =
  RuntimeKernelResolvedStep<TToolName>;

export { buildToolResultContent, buildToolResultEnvelope };

export async function runSerialNativeToolLoop<TToolName extends string>(params: {
  messages: NativeToolAwareMessage[];
  maxIterations: number;
  runCompletion: (
    messages: NativeToolAwareMessage[],
  ) => Promise<
    NativeToolAwareCompletionSuccess<TToolName> | NativeToolLoopFailureInput
  >;
  normalizeToolArguments: (
    toolName: TToolName,
    rawArgs: Record<string, unknown>,
  ) => Record<string, unknown>;
  executeTool: (params: {
    iteration: number;
    providerCallId: string;
    toolName: TToolName;
    normalizedArgs: Record<string, unknown>;
    rawArguments: Record<string, unknown>;
  }) => Promise<NativeToolExecutionResult>;
  onToolStepStart?: (params: {
    iteration: number;
    step: Extract<NativeToolLoopStep<TToolName>, { kind: "tool_follow_up" }>;
  }) => Promise<void> | void;
  onToolStepFinish?: (params: {
    iteration: number;
    step: Extract<NativeToolLoopStep<TToolName>, { kind: "tool_follow_up" }>;
    toolResult: NativeToolExecutionResult;
    toolResultEnvelope: NativeToolResultEnvelope<TToolName>;
  }) => Promise<void> | void;
}): Promise<NativeToolLoopSuccess<TToolName> | NativeToolLoopFailure<TToolName>> {
  return await runNativeRuntimeKernel<TToolName>({
    messages: params.messages,
    budget: {
      ...DEFAULT_RUNTIME_KERNEL_BUDGET,
      maxToolSteps: params.maxIterations,
    },
    runCompletion: params.runCompletion,
    normalizeToolArguments: params.normalizeToolArguments,
    executeTool: params.executeTool,
    onToolStepStart: params.onToolStepStart
      ? async ({ iteration, step }): Promise<void> => {
          await params.onToolStepStart?.({
            iteration,
            step,
          });
        }
      : undefined,
    onToolStepFinish: params.onToolStepFinish
      ? async ({ iteration, step, toolResult, toolResultEnvelope }): Promise<void> => {
          await params.onToolStepFinish?.({
            iteration,
            step,
            toolResult,
            toolResultEnvelope,
          });
        }
      : undefined,
  });
}
