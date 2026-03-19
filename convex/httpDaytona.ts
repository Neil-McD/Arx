import { api, internal } from "./_generated/api";
import {
  runChatgptNativeToolCompletion,
  type ChatgptFunctionTool,
  type ChatgptToolAwareMessage,
} from "./httpChatgpt";
import {
  loadDaytonaConfig,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import {
  cleanupWorkspaceSandboxSession,
  createWorkspaceSandboxSession,
  resolveWorkspaceProjectLabel,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import {
  appendWorkspaceToolCallFinished,
  appendWorkspaceToolCallStarted,
} from "./daytonaRuntimeEvents";
import {
  editDaytonaWorkspaceFile,
  globDaytonaWorkspacePaths,
  grepDaytonaWorkspaceFiles,
  listDaytonaWorkspaceDirectory,
  readDaytonaWorkspaceFile,
  runDaytonaWorkspaceBash,
  sha256DaytonaWorkspaceFile,
  writeDaytonaWorkspaceFile,
} from "./daytonaWorkspaceTools";
import { executeWebResearch } from "./webResearchTools";
import { runOpenRouterNativeToolCompletion } from "./openRouterNativeTransport";
import {
  type RetrievalToolName,
} from "../shared/retrievalTools";
import { type NativeToolAwareCompletionSuccess, type NativeToolAwareMessage } from "../shared/nativeToolProtocol";
import {
  runSerialNativeToolLoop,
  type NativeToolExecutionResult,
} from "../shared/nativeToolLoop";
import {
  buildOpenAiFunctionTools,
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
} from "../shared/toolRegistry";
import {
  buildWorkspaceRuntimeSystemPrompt,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};

type RuntimeAgentLoopSuccess = {
  ok: true;
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

type RuntimeAgentLoopFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

type OpenAiCompatibleFunctionTool = ReturnType<typeof buildOpenAiFunctionTools>[number];
type ChatgptCompatibleFunctionTool = ChatgptFunctionTool;

type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";

function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function executeRetrievalHarnessTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  projectId?: string | null;
  runId: string;
  communityId: string | null;
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  workspaceSession?: WorkspaceSandboxSession | null;
}): Promise<NativeToolExecutionResult> {
  let normalizedArgs: Record<string, unknown>;
  try {
    normalizedArgs = normalizeToolArguments(params.toolName, params.args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "invalid_tool_args",
      errorMessage: message || "Invalid tool arguments.",
    };
  }

  if (params.toolName === "community_search") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_search requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runAction(internal.communityArchive.searchCommunityKnowledgeInternal as any, {
        userId: params.userId,
        authSubject: params.authSubject ?? undefined,
        communityId: params.communityId,
        query: String(normalizedArgs.query ?? "").trim(),
      });
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        const reasonCode = String((payload as { reason_code?: unknown } | null)?.reason_code ?? "").trim();
        const message = String((payload as { message?: unknown } | null)?.message ?? "").trim();
        return {
          status: "error",
          exitCode: null,
          outputText: formatJsonToolOutput(payload),
          errorCode: reasonCode || "community_search_failed",
          errorMessage: message || "Community search failed.",
        };
      }
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_search_failed",
        errorMessage: message || "Community search failed.",
      };
    }
  }

  if (params.toolName === "community_write") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_write requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(api.community.publishCommunityAiFeedAgentPost as any, {
        userId: params.userId,
        authSubject: params.authSubject ?? undefined,
        communityId: params.communityId,
        postType: String(normalizedArgs.post_type ?? "observation"),
        title: typeof normalizedArgs.title === "string" ? normalizedArgs.title : undefined,
        body: String(normalizedArgs.body ?? ""),
        evidence: Array.isArray(normalizedArgs.evidence)
          ? normalizedArgs.evidence.map((value) => String(value ?? ""))
          : [],
      });
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_write_failed",
        errorMessage: message || "Community write failed.",
      };
    }
  }

  if (
    params.toolName === "web_research"
  ) {
    const result = await executeWebResearch({
      action:
        String(normalizedArgs.action ?? "").trim() === "find_in_page"
          ? "find_in_page"
          : String(normalizedArgs.action ?? "").trim() === "open_page"
            ? "open_page"
            : "search",
      query:
        typeof normalizedArgs.query === "string"
          ? normalizedArgs.query
          : undefined,
      url:
        typeof normalizedArgs.url === "string"
          ? normalizedArgs.url
          : undefined,
    });
    if (!result.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: String(result.outputPreview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
    };
  }

  if (
    params.toolName === "list_dir" ||
    params.toolName === "read" ||
    params.toolName === "glob" ||
    params.toolName === "grep" ||
    params.toolName === "sha256" ||
    params.toolName === "write" ||
    params.toolName === "edit" ||
    params.toolName === "bash"
  ) {
    let workspaceSession = params.workspaceSession ?? null;
    const projectId = String(params.projectId ?? workspaceSession?.projectId ?? "").trim();
    const authSubject = String(params.authSubject ?? "").trim();
    if (!projectId || (!authSubject && !workspaceSession)) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "project_required",
        errorMessage: `${params.toolName} requires a bound project workspace.`,
      };
    }
    if (!workspaceSession) {
      const created = await createWorkspaceSandboxSession({
        ctx: params.ctx,
        userId: params.userId,
        authSubject,
        projectId,
        runId: params.runId,
      });
      if (!created.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: String((created as any).details?.output_preview ?? ""),
          errorCode: created.code,
          errorMessage: created.message,
        };
      }
      workspaceSession = created.session;
    }
    const result =
      params.toolName === "list_dir"
        ? await listDaytonaWorkspaceDirectory({
            config: workspaceSession.config,
            toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
            sandboxId: workspaceSession.providerSandboxId,
            relPath: String(normalizedArgs.path ?? ".") || ".",
          })
        : params.toolName === "read"
          ? await readDaytonaWorkspaceFile({
              config: workspaceSession.config,
              toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
              sandboxId: workspaceSession.providerSandboxId,
              relPath: String(normalizedArgs.path ?? "").trim(),
              offset:
                typeof normalizedArgs.offset === "number"
                  ? normalizedArgs.offset
                  : undefined,
              limit:
                typeof normalizedArgs.limit === "number"
                  ? normalizedArgs.limit
                  : undefined,
            })
          : params.toolName === "glob"
            ? await globDaytonaWorkspacePaths({
                config: workspaceSession.config,
                toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                sandboxId: workspaceSession.providerSandboxId,
                pattern: String(normalizedArgs.pattern ?? "").trim(),
                relPath:
                  typeof normalizedArgs.path === "string"
                    ? normalizedArgs.path
                    : undefined,
              })
            : params.toolName === "grep"
              ? await grepDaytonaWorkspaceFiles({
                  config: workspaceSession.config,
                  toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                  sandboxId: workspaceSession.providerSandboxId,
                  pattern: String(normalizedArgs.pattern ?? "").trim(),
                  relPath:
                    typeof normalizedArgs.path === "string"
                      ? normalizedArgs.path
                      : undefined,
                })
              : params.toolName === "sha256"
                ? await sha256DaytonaWorkspaceFile({
                    config: workspaceSession.config,
                    toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                    sandboxId: workspaceSession.providerSandboxId,
                    relPath: String(normalizedArgs.path ?? "").trim(),
                  })
                : params.toolName === "write"
                  ? await writeDaytonaWorkspaceFile({
                      config: workspaceSession.config,
                      toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                      sandboxId: workspaceSession.providerSandboxId,
                      relPath: String(normalizedArgs.path ?? "").trim(),
                      content: String(normalizedArgs.content ?? ""),
                    })
                  : params.toolName === "edit"
                    ? await editDaytonaWorkspaceFile({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        relPath: String(normalizedArgs.path ?? "").trim(),
                        oldText: String(normalizedArgs.old_text ?? ""),
                        newText: String(normalizedArgs.new_text ?? ""),
                        replaceAll: normalizedArgs.replace_all === true,
                      })
                    : await runDaytonaWorkspaceBash({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        command: String(normalizedArgs.command ?? ""),
                        relPath:
                          typeof normalizedArgs.cwd === "string"
                            ? normalizedArgs.cwd
                            : undefined,
                      });
    if (!result.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: String(result.details?.output_preview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "tool_not_allowed",
    errorMessage: `${params.toolName} is not active in this run's capability profile.`,
  };
}

async function runProviderNativeToolCompletion(params: {
  ctx: any;
  userId: string;
  requestedModelId: string;
  inferenceSource: RuntimeInferenceSource;
  modelRef: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  openRouterTools: OpenAiCompatibleFunctionTool[];
  chatgptTools: ChatgptCompatibleFunctionTool[];
  apiKeyOverride?: string | null;
}): Promise<NativeToolAwareCompletionSuccess<string> | RuntimeAgentLoopFailure> {
  if (params.inferenceSource === "chatgpt") {
    return runChatgptNativeToolCompletion({
      ctx: params.ctx,
      userId: params.userId,
      modelId: params.requestedModelId,
      messages: params.messages as ChatgptToolAwareMessage[],
      maxTokens: params.maxTokens,
      tools: params.chatgptTools,
    });
  }
  return runOpenRouterNativeToolCompletion({
    modelRef: params.modelRef,
    messages: params.messages,
    maxTokens: params.maxTokens,
    tools: params.openRouterTools,
    apiKeyOverride: params.apiKeyOverride,
  });
}

async function executeRetrievalAgentLoop(params: RuntimeCommunityPromptFields & {
  ctx: any;
  req: Request;
  userId: string;
  requestedModelId: string;
  inferenceSource: RuntimeInferenceSource;
  modelRef: string;
  messages: InferenceMessage[];
  maxTokens: number;
  runId: string;
  harnessName: "chat_tools";
  maxIterations: number;
  allowedToolNames: readonly RetrievalToolName[];
  communitySystemPrompt?: string | null;
  projectId?: string | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  authSubject?: string | null;
  workspaceSession?: WorkspaceSandboxSession | null;
  apiKeyOverride?: string | null;
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  const ownsWorkspaceSession = !params.workspaceSession;
  let lazyWorkspaceSession = params.workspaceSession ?? null;
  const projectLabel = await resolveWorkspaceProjectLabel({
    ctx: params.ctx,
    projectId: params.projectId,
    authSubject: params.authSubject,
  });

  const systemPrompt = buildWorkspaceRuntimeSystemPrompt({
    maxIterations: params.maxIterations,
    allowedToolNames: params.allowedToolNames,
    harnessName: params.harnessName,
    communityId: params.communityId,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    customCommunitySystemPrompt: params.communitySystemPrompt,
    projectLabel,
    threadWorkingState: params.threadWorkingState,
  });
  const nativeTranscript: NativeToolAwareMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  const nativeTools = buildOpenAiFunctionTools(params.allowedToolNames);
  const chatgptNativeTools = buildResponsesApiFunctionTools(params.allowedToolNames);
  try {
    const loopResult = await runSerialNativeToolLoop<RetrievalToolName>({
      messages: nativeTranscript,
      maxIterations: params.maxIterations,
      runCompletion: async (messages) => {
        const completion = await runProviderNativeToolCompletion({
          ctx: params.ctx,
          userId: params.userId,
          requestedModelId: params.requestedModelId,
          inferenceSource: params.inferenceSource,
          modelRef: params.modelRef,
          messages,
          maxTokens: params.maxTokens,
          openRouterTools: nativeTools,
          chatgptTools: chatgptNativeTools,
          apiKeyOverride: params.apiKeyOverride,
        });
        if (!completion.ok) return completion;
        if (
          completion.type === "tool_call" &&
          !params.allowedToolNames.includes(completion.toolName as RetrievalToolName)
        ) {
          return {
            ok: false,
            status: 502,
            code: "invalid_model_output",
            message: "Provider returned an unknown tool name.",
            pendingToolCallId: completion.providerCallId,
            pendingToolName: completion.toolName,
          };
        }
        return completion as NativeToolAwareCompletionSuccess<RetrievalToolName>;
      },
      normalizeToolArguments,
      executeTool: async ({ toolName, normalizedArgs }) => {
        const needsWorkspaceSession =
          toolName === "list_dir" ||
          toolName === "read" ||
          toolName === "glob" ||
          toolName === "grep" ||
          toolName === "sha256" ||
          toolName === "write" ||
          toolName === "edit" ||
          toolName === "bash";

        if (needsWorkspaceSession && !lazyWorkspaceSession) {
          const projectId = String(params.projectId ?? "").trim();
          const authSubject = String(params.authSubject ?? "").trim();
          if (!projectId || !authSubject) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "project_required",
              errorMessage: `${toolName} requires a bound project workspace.`,
            };
          }
          const created = await createWorkspaceSandboxSession({
            ctx: params.ctx,
            userId: params.userId,
            authSubject,
            projectId,
            runId: params.runId,
          });
          if (!created.ok) {
            return {
              status: "error",
              exitCode: null,
              outputText: String((created as any).details?.output_preview ?? ""),
              errorCode: created.code,
              errorMessage: created.message,
            };
          }
          lazyWorkspaceSession = created.session;
          await params.appendRunEvent({
            eventType: "sandbox_started",
            eventKey: `${params.runId}:workspace_sandbox_started:1`,
            payload: {
              run_id: params.runId,
              sandbox_id: created.session.providerSandboxId,
              region: created.session.region,
              project_id: projectId,
            },
          });
        }

        return await executeRetrievalHarnessTool({
          ctx: params.ctx,
          userId: params.userId,
          communityId: params.communityId,
          authSubject: params.authSubject,
          projectId: params.projectId,
          runId: params.runId,
          toolName,
          args: normalizedArgs,
          workspaceSession: lazyWorkspaceSession,
        });
      },
      onToolStepStart: async ({ iteration, step }) => {
        await appendWorkspaceToolCallStarted({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          communityId: params.communityId,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
        });
      },
      onToolStepFinish: async ({ iteration, step, toolResult, toolResultEnvelope }) => {
        await appendWorkspaceToolCallFinished({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
          toolResult,
          toolResultEnvelope,
        });
        if (toolResult.status !== "ok") {
          console.error("[tool-loop] tool call failed", {
            runId: params.runId,
            harnessName: params.harnessName,
            toolName: step.toolName,
            providerCallId: step.providerCallId,
            iteration,
            errorCode: toolResult.errorCode,
            errorMessage: toolResult.errorMessage,
            exitCode: toolResult.exitCode,
            outputPreview: toolResult.outputText.slice(0, 2000),
          });
        }
      },
    });

    if (!loopResult.ok && loopResult.code === "empty_response") {
      return {
        ok: false,
        status: 502,
        code: "empty_response",
        message: `${params.harnessName} harness model returned an empty response.`,
      };
    }
    if (!loopResult.ok && loopResult.code === "run_loop_limit_exceeded") {
      return {
        ok: false,
        status: 502,
        code: "run_loop_limit_exceeded",
        message: `${params.harnessName} harness run exceeded max tool iterations (${params.maxIterations}).`,
      };
    }
    return loopResult;
  } finally {
    if (ownsWorkspaceSession && lazyWorkspaceSession) {
      await cleanupWorkspaceSandboxSession({
        session: lazyWorkspaceSession,
        runId: params.runId,
        projectId: String(params.projectId ?? lazyWorkspaceSession.projectId ?? "").trim(),
        appendRunEvent: params.appendRunEvent,
      });
    }
  }
}

async function executeChatToolsAgentLoop(params: RuntimeCommunityPromptFields & {
  ctx: any;
  req: Request;
  userId: string;
  authSubject?: string | null;
  projectId?: string | null;
  requestedModelId: string;
  inferenceSource: RuntimeInferenceSource;
  modelRef: string;
  messages: InferenceMessage[];
  maxTokens: number;
  runId: string;
  allowedToolNames: readonly RetrievalToolName[];
  communitySystemPrompt?: string | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  apiKeyOverride?: string | null;
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  return await executeRetrievalAgentLoop({
    ...params,
    harnessName: "chat_tools",
    maxIterations: 20,
  });
}

export type { DaytonaConfig };
export {
  executeChatToolsAgentLoop,
  listDaytonaWorkspaceDirectory,
  loadDaytonaConfig,
};
