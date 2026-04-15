import { api, internal } from "./_generated/api";
import {
  runChatgptNativeToolCompletion,
  type ChatgptFunctionTool,
  type ChatgptToolAwareMessage,
} from "./httpChatgpt";
import { loadDaytonaConfig, type DaytonaConfig } from "./daytonaSandboxClient";
import {
  cleanupWorkspaceSandboxSession,
  createWorkspaceSandboxSession,
  resolveWorkspaceProjectContext,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import {
  appendWorkspaceToolCallFinished,
  appendWorkspaceToolCallStarted,
} from "./daytonaRuntimeEvents";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
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
import { runDaytonaComputerUseTool } from "./daytonaComputerUse";
import { executeWebResearch } from "./webResearchTools";
import { runOpenRouterNativeToolCompletion } from "./openRouterNativeTransport";
import {
  type RetrievalToolName,
  isComputerUseToolName,
  requiresWorkspaceSandbox,
} from "../shared/retrievalTools";
import {
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
} from "../shared/nativeToolProtocol";
import {
  runSerialNativeToolLoop,
  type NativeToolExecutionResult,
} from "../shared/nativeToolLoop";
import {
  buildCommunityOverlayRuntimeState,
  type CommunityOverlayMountedTool,
  type CommunityOverlaySelectedSkill,
  type CommunityOverlaySkillInventory,
} from "../shared/communityOverlayRuntime";
import { extractExplicitSkillMentions } from "../shared/communitySkillRuntime";
import {
  buildOpenAiFunctionTools,
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
  type ResponsesApiFunctionTool,
} from "../shared/toolRegistry";
import {
  buildWorkspaceRuntimeSystemPrompt,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
import { parseProviderModelRef } from "./httpInferenceConfig";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { logStructuredError, summarizeErrorForLog } from "./errorLogging";

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
  transcript: NativeToolAwareMessage[];
};

type RuntimeAgentLoopFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

type OpenAiCompatibleFunctionTool = ReturnType<
  typeof buildOpenAiFunctionTools
>[number];
type ChatgptCompatibleFunctionTool = ChatgptFunctionTool;

type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";
const WORKSPACE_RUN_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

type RuntimeMountedCommunityAppTool = {
  community_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type RuntimeMountedUserPlatformAppTool = {
  user_platform_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type RuntimeMountedMcpTool = {
  scope: "user" | "community";
  mount_id: string;
  runtime_tool_name: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type RuntimeCommunitySkillInventory = {
  community_skill_attachment_id: string;
  skill_package_id: string;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  instructions_md: string;
};

function normalizeMountedToolSchema(
  value: unknown,
): Record<string, unknown> | boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {
    type: "object",
    additionalProperties: true,
    properties: {},
  };
}

function normalizeRuntimeMountedCommunityAppTools(
  value: unknown,
): RuntimeMountedCommunityAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedCommunityAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      community_app_mount_id: String(record.community_app_mount_id ?? "").trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "Community app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(record.input_schema),
      risk_level: riskLevel,
    });
  }
  return tools;
}

function normalizeRuntimeMountedUserPlatformAppTools(
  value: unknown,
): RuntimeMountedUserPlatformAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedUserPlatformAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      user_platform_app_mount_id: String(
        record.user_platform_app_mount_id ?? "",
      ).trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "My app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(record.input_schema),
      risk_level: riskLevel,
    });
  }
  return tools;
}

function normalizeRuntimeCommunitySkillInventory(
  value: unknown,
): RuntimeCommunitySkillInventory[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeCommunitySkillInventory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    if (!mentionToken || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
    });
  }
  return skills;
}

function normalizeRuntimeSelectedCommunitySkills(
  value: unknown,
): RuntimeSelectedCommunitySkill[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeSelectedCommunitySkill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    const instructionsMd =
      typeof record.instructions_md === "string"
        ? record.instructions_md.trim()
        : "";
    if (!mentionToken || !instructionsMd || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      instructions_md: instructionsMd,
    });
  }
  return skills;
}

function buildMountedAppOpenAiTools(
  mountedTools: RuntimeMountedMcpTool[],
): OpenAiCompatibleFunctionTool[] {
  return mountedTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.runtime_tool_name,
      description: buildMountedAppToolDescription(tool),
      parameters: normalizeMountedToolSchema(tool.input_schema),
      strict: true,
    },
  }));
}

function buildMountedAppResponsesTools(
  mountedTools: RuntimeMountedMcpTool[],
): ResponsesApiFunctionTool[] {
  return mountedTools.map((tool) => ({
    type: "function",
    name: tool.runtime_tool_name,
    description: buildMountedAppToolDescription(tool),
    parameters: normalizeMountedToolSchema(tool.input_schema),
    strict: true,
  }));
}

function buildMountedAppToolDescription(tool: RuntimeMountedMcpTool): string {
  const baseDescription =
    tool.description ||
    `Run ${tool.tool_name} on ${
      tool.scope === "user" ? "your" : "the active community"
    } ${tool.app_name} app.`;
  if (tool.scope === "user" && tool.risk_level !== "read") {
    return `[Approval required for write or sensitive actions] ${baseDescription}`;
  }
  return baseDescription;
}

function buildUserPlatformMountedAppsPromptBlock(
  mountedTools: RuntimeMountedMcpTool[],
): string {
  if (mountedTools.length === 0) return "";
  return [
    "",
    "Your connected app tools are part of your baseline platform harness.",
    "These baseline app tools use the `me__` prefix when they are exposed to the model.",
    "These tools stay available across communities. Use the provided structured tool definitions directly.",
    "Personal app tools that are marked write or sensitive require an approval flow and will refuse execution until that flow ships. Read tools can run directly.",
  ].join("\n");
}

function mapMountedToolsToOverlayRuntime(
  mountedTools: RuntimeMountedCommunityAppTool[],
): CommunityOverlayMountedTool[] {
  return mountedTools.map((tool) => ({
    namespacedToolName: tool.namespaced_tool_name,
    toolName: tool.tool_name,
    appName: tool.app_name,
    description: tool.description,
  }));
}

function mapCommunitySkillsToOverlayRuntime(
  attachedSkills: RuntimeCommunitySkillInventory[],
): CommunityOverlaySkillInventory[] {
  return attachedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
  }));
}

function mapSelectedCommunitySkillsToOverlayRuntime(
  selectedSkills: RuntimeSelectedCommunitySkill[],
): CommunityOverlaySelectedSkill[] {
  return selectedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
    instructionsMd: skill.instructions_md,
  }));
}

function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function formatTerminalStartToolOutput(value: unknown): string {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const status =
    typeof record?.status === "string" && record.status.trim()
      ? record.status.trim()
      : "running";
  const previewAvailable =
    typeof record?.preview_port === "number" &&
    Number.isFinite(record.preview_port);
  return [
    "Background terminal started successfully.",
    `Current status: ${status}.`,
    previewAvailable
      ? "Inline preview is available."
      : "No inline preview was exposed.",
  ].join("\n");
}

function formatToolOutput(toolName: string, value: unknown): string {
  if (toolName === "terminal_start")
    return formatTerminalStartToolOutput(value);
  return formatJsonToolOutput(value);
}

function readFailureOutputPreview(details: unknown): string {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (!record) return "";
  const preferred = String(record.output_preview ?? "").trim();
  if (preferred) return preferred;
  const responseText = String(record.response_text ?? "").trim();
  if (responseText) return responseText;
  return "";
}

function summarizeToolArgsForLog(
  toolName: string,
  normalizedArgs: unknown,
): Record<string, unknown> {
  const record =
    normalizedArgs &&
    typeof normalizedArgs === "object" &&
    !Array.isArray(normalizedArgs)
      ? (normalizedArgs as Record<string, unknown>)
      : null;
  if (!record) return { toolName };
  const summary: Record<string, unknown> = {
    toolName,
    argKeys: Object.keys(record).sort(),
  };
  if (typeof record.path === "string" && record.path.trim()) {
    summary.path = record.path.trim().slice(0, 1024);
  }
  if (typeof record.cwd === "string" && record.cwd.trim()) {
    summary.cwd = record.cwd.trim().slice(0, 1024);
  }
  if (typeof record.offset === "number" && Number.isFinite(record.offset)) {
    summary.offset = Math.max(0, Math.floor(record.offset));
  }
  if (typeof record.limit === "number" && Number.isFinite(record.limit)) {
    summary.limit = Math.max(0, Math.floor(record.limit));
  }
  if (typeof record.preview_path === "string" && record.preview_path.trim()) {
    summary.previewPath = record.preview_path.trim().slice(0, 1024);
  }
  if (
    typeof record.preview_port === "number" &&
    Number.isFinite(record.preview_port)
  ) {
    summary.previewPort = Math.max(0, Math.floor(record.preview_port));
  }
  if (typeof record.command === "string") {
    summary.hasCommand = true;
  }
  return summary;
}

function isInlineImageDataUrl(value: unknown): value is string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .startsWith("data:image/");
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) throw new Error("invalid_image_data_url");
  const mimeType = match[1]!.trim() || "application/octet-stream";
  const binary = atob(match[2]!.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}

function extractComputerUseObservation(
  observationContent: NativeToolInputContentPart[] | null | undefined,
): { summary: string | null; imageUrl: string | null } {
  if (!Array.isArray(observationContent) || observationContent.length === 0) {
    return { summary: null, imageUrl: null };
  }
  let summary: string | null = null;
  let imageUrl: string | null = null;
  for (const part of observationContent) {
    if (!part || part.source !== "computer_use_observation") continue;
    if (part.type === "text" && !summary) {
      const nextSummary = String(part.text ?? "").trim();
      if (nextSummary) summary = nextSummary;
      continue;
    }
    if (part.type === "image" && !imageUrl) {
      const nextUrl = String(part.imageUrl ?? "").trim();
      if (nextUrl) imageUrl = nextUrl;
    }
  }
  return { summary, imageUrl };
}

async function enrichComputerUseToolResult(params: {
  ctx: any;
  toolName: RetrievalToolName;
  toolResult: NativeToolExecutionResult;
}): Promise<NativeToolExecutionResult> {
  if (!isComputerUseToolName(params.toolName)) return params.toolResult;
  const existingDetails =
    params.toolResult.details &&
    typeof params.toolResult.details === "object" &&
    !Array.isArray(params.toolResult.details)
      ? { ...(params.toolResult.details as Record<string, unknown>) }
      : {};
  const existingComputerUseDetails =
    existingDetails.computer_use &&
    typeof existingDetails.computer_use === "object" &&
    !Array.isArray(existingDetails.computer_use)
      ? { ...(existingDetails.computer_use as Record<string, unknown>) }
      : {};
  const { summary, imageUrl } = extractComputerUseObservation(
    params.toolResult.observationContent,
  );
  const computerUseDetails: Record<string, unknown> = {
    ...existingComputerUseDetails,
    action: params.toolName,
    summary:
      summary ||
      (typeof params.toolResult.outputText === "string" &&
      params.toolResult.outputText.trim()
        ? params.toolResult.outputText.trim()
        : null),
  };
  if (isInlineImageDataUrl(imageUrl)) {
    const { blob, mimeType } = dataUrlToBlob(imageUrl);
    const storageId = await params.ctx.storage.store(blob);
    const frameUrl = await params.ctx.storage.getUrl(storageId);
    computerUseDetails.frame_storage_id =
      String(storageId ?? "").trim() || null;
    computerUseDetails.frame_url = frameUrl ?? null;
    computerUseDetails.frame_mime_type = mimeType;
  }
  return {
    ...params.toolResult,
    details: {
      ...existingDetails,
      computer_use: computerUseDetails,
    },
  };
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
  signal?: AbortSignal;
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
      const payload = await params.ctx.runAction(
        internal.communityArchive.searchCommunityKnowledgeInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          query: String(normalizedArgs.query ?? "").trim(),
        },
      );
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        const reasonCode = String(
          (payload as { reason_code?: unknown } | null)?.reason_code ?? "",
        ).trim();
        const message = String(
          (payload as { message?: unknown } | null)?.message ?? "",
        ).trim();
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
      const payload = await params.ctx.runMutation(
        api.community.publishCommunityAiFeedAgentPost as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          postType: String(normalizedArgs.post_type ?? "observation"),
          title:
            typeof normalizedArgs.title === "string"
              ? normalizedArgs.title
              : undefined,
          body: String(normalizedArgs.body ?? ""),
          evidence: Array.isArray(normalizedArgs.evidence)
            ? normalizedArgs.evidence.map((value) => String(value ?? ""))
            : [],
        },
      );
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

  if (params.toolName === "web_research") {
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
        typeof normalizedArgs.url === "string" ? normalizedArgs.url : undefined,
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
      details:
        Array.isArray(result.webSources) && result.webSources.length > 0
          ? { web_sources: result.webSources }
          : null,
    };
  }

  if (
    params.toolName === "terminal_start" ||
    params.toolName === "terminal_read" ||
    params.toolName === "terminal_write" ||
    params.toolName === "terminal_stop"
  ) {
    const projectId = String(params.projectId ?? "").trim();
    const authSubject = String(params.authSubject ?? "").trim();
    if (params.toolName === "terminal_start" && (!projectId || !authSubject)) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "project_required",
        errorMessage: `${params.toolName} requires a bound project workspace.`,
      };
    }
    if (
      (params.toolName === "terminal_read" ||
        params.toolName === "terminal_write" ||
        params.toolName === "terminal_stop") &&
      !authSubject
    ) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "auth_required",
        errorMessage: `${params.toolName} requires an authenticated workspace run.`,
      };
    }

    try {
      const payload =
        params.toolName === "terminal_start"
          ? await params.ctx.runAction(
              internal.workspaceTerminals.startWorkspaceTerminalInternal as any,
              {
                authSubject,
                projectId,
                runId: params.runId,
                command: String(normalizedArgs.command ?? ""),
                ...(typeof normalizedArgs.cwd === "string"
                  ? { cwd: normalizedArgs.cwd }
                  : null),
                ...(typeof normalizedArgs.preview_port === "number"
                  ? { previewPort: normalizedArgs.preview_port }
                  : null),
                ...(typeof normalizedArgs.preview_path === "string"
                  ? { previewPath: normalizedArgs.preview_path }
                  : null),
                ...(typeof normalizedArgs.preview_label === "string"
                  ? { previewLabel: normalizedArgs.preview_label }
                  : null),
              },
            )
          : params.toolName === "terminal_read"
            ? await params.ctx.runAction(
                internal.workspaceTerminals
                  .readWorkspaceTerminalInternal as any,
                {
                  authSubject,
                  terminalSessionId: String(
                    normalizedArgs.terminal_session_id ?? "",
                  ).trim(),
                },
              )
            : params.toolName === "terminal_write"
              ? await params.ctx.runAction(
                  internal.workspaceTerminals
                    .writeWorkspaceTerminalInternal as any,
                  {
                    authSubject,
                    terminalSessionId: String(
                      normalizedArgs.terminal_session_id ?? "",
                    ).trim(),
                    input: String(normalizedArgs.input ?? ""),
                  },
                )
              : params.toolName === "terminal_stop"
                ? await params.ctx.runAction(
                    internal.workspaceTerminals
                      .stopWorkspaceTerminalInternal as any,
                    {
                      authSubject,
                      terminalSessionId: String(
                        normalizedArgs.terminal_session_id ?? "",
                      ).trim(),
                    },
                  )
                : null;
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: formatToolOutput(params.toolName, payload),
          errorCode: String(
            (payload as { code?: unknown } | null)?.code ??
              "terminal_operation_failed",
          ),
          errorMessage: String(
            (payload as { message?: unknown } | null)?.message ??
              "Terminal operation failed.",
          ),
        };
      }
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatToolOutput(params.toolName, payload),
        errorCode: null,
        errorMessage: null,
        details:
          params.toolName === "terminal_start" &&
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload)
            ? {
                terminal_session_id:
                  typeof (payload as Record<string, unknown>)
                    .terminal_session_id === "string"
                    ? (payload as Record<string, unknown>).terminal_session_id
                    : null,
                status:
                  typeof (payload as Record<string, unknown>).status ===
                  "string"
                    ? (payload as Record<string, unknown>).status
                    : null,
                command:
                  typeof (payload as Record<string, unknown>).command ===
                  "string"
                    ? (payload as Record<string, unknown>).command
                    : null,
                cwd:
                  typeof (payload as Record<string, unknown>).cwd === "string"
                    ? (payload as Record<string, unknown>).cwd
                    : null,
                preview_port:
                  typeof (payload as Record<string, unknown>).preview_port ===
                  "number"
                    ? (payload as Record<string, unknown>).preview_port
                    : null,
                preview_path:
                  typeof (payload as Record<string, unknown>).preview_path ===
                  "string"
                    ? (payload as Record<string, unknown>).preview_path
                    : null,
                preview_label:
                  typeof (payload as Record<string, unknown>).preview_label ===
                  "string"
                    ? (payload as Record<string, unknown>).preview_label
                    : null,
                output_tail:
                  typeof (payload as Record<string, unknown>).output_tail ===
                  "string"
                    ? (payload as Record<string, unknown>).output_tail
                    : null,
              }
            : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "terminal_operation_failed",
        errorMessage: message || "Terminal operation failed.",
      };
    }
  }

  if (isComputerUseToolName(params.toolName)) {
    let workspaceSession = params.workspaceSession ?? null;
    const projectId = String(
      params.projectId ?? workspaceSession?.projectId ?? "",
    ).trim();
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
          outputText: readFailureOutputPreview((created as any).details),
          errorCode: created.code,
          errorMessage: created.message,
        };
      }
      workspaceSession = created.session;
    }
    const computerResult = await runDaytonaComputerUseTool({
      config: workspaceSession.config,
      toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
      sandboxId: workspaceSession.providerSandboxId,
      toolName: params.toolName,
      args: normalizedArgs,
      signal: params.signal,
    });
    return await enrichComputerUseToolResult({
      ctx: params.ctx,
      toolName: params.toolName,
      toolResult: computerResult,
    });
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
    const projectId = String(
      params.projectId ?? workspaceSession?.projectId ?? "",
    ).trim();
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
          outputText: readFailureOutputPreview((created as any).details),
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
            signal: params.signal,
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
              signal: params.signal,
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
                signal: params.signal,
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
                  signal: params.signal,
                })
              : params.toolName === "sha256"
                ? await sha256DaytonaWorkspaceFile({
                    config: workspaceSession.config,
                    toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                    sandboxId: workspaceSession.providerSandboxId,
                    relPath: String(normalizedArgs.path ?? "").trim(),
                    signal: params.signal,
                  })
                : params.toolName === "write"
                  ? await writeDaytonaWorkspaceFile({
                      config: workspaceSession.config,
                      toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                      sandboxId: workspaceSession.providerSandboxId,
                      relPath: String(normalizedArgs.path ?? "").trim(),
                      content: String(normalizedArgs.content ?? ""),
                      signal: params.signal,
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
                        signal: params.signal,
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
                        signal: params.signal,
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
  responsesApiTools: ChatgptCompatibleFunctionTool[];
  apiKeyOverride?: string | null;
  onReasoningSummaryTextDelta?: (params: {
    delta: string;
    summaryIndex: number;
  }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: {
    summaryIndex: number;
  }) => Promise<void> | void;
  signal?: AbortSignal;
}): Promise<
  NativeToolAwareCompletionSuccess<string> | RuntimeAgentLoopFailure
> {
  if (params.inferenceSource === "chatgpt") {
    return runChatgptNativeToolCompletion({
      ctx: params.ctx,
      userId: params.userId,
      modelId: params.requestedModelId,
      messages: params.messages as ChatgptToolAwareMessage[],
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      onReasoningSummaryTextDelta: params.onReasoningSummaryTextDelta,
      onReasoningSummaryPartAdded: params.onReasoningSummaryPartAdded,
      signal: params.signal,
    });
  }
  const parsedProviderRef = parseProviderModelRef(params.modelRef);
  if (
    params.inferenceSource === "platform" &&
    parsedProviderRef?.provider === "openai"
  ) {
    return runOpenAiNativeToolCompletion({
      modelId: parsedProviderRef.providerModel,
      messages: params.messages,
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      signal: params.signal,
    });
  }
  return runOpenRouterNativeToolCompletion({
    modelRef: params.modelRef,
    messages: params.messages,
    maxTokens: params.maxTokens,
    tools: params.openRouterTools,
    apiKeyOverride: params.apiKeyOverride,
    signal: params.signal,
  });
}

async function executeRetrievalAgentLoop(
  params: RuntimeCommunityPromptFields & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
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
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  const ownsWorkspaceSession = !params.workspaceSession;
  let lazyWorkspaceSession = params.workspaceSession ?? null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatInFlight = false;
  const ensureWorkspaceHeartbeat = () => {
    if (!params.touchRunHeartbeat || !lazyWorkspaceSession || heartbeatTimer)
      return;
    const touchRunHeartbeat = params.touchRunHeartbeat;
    heartbeatTimer = setInterval(() => {
      if (!lazyWorkspaceSession || heartbeatInFlight) return;
      heartbeatInFlight = true;
      void Promise.resolve(touchRunHeartbeat())
        .catch(() => {})
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, WORKSPACE_RUN_HEARTBEAT_INTERVAL_MS);
  };
  ensureWorkspaceHeartbeat();
  const projectContext = await resolveWorkspaceProjectContext({
    ctx: params.ctx,
    projectId: params.projectId,
    authSubject: params.authSubject,
  });
  const now = new Date();
  const runtimeTimeZone = "UTC";
  const runtimeDateTimeIso = now.toISOString();
  const runtimeDateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: runtimeTimeZone,
  }).format(now);
  const terminalSnapshot =
    params.projectId && params.allowedToolNames.includes("terminal_start")
      ? await params.ctx.runAction(
          internal.workspaceTerminals
            .reconcileProjectWorkspaceTerminalsInternal as any,
          {
            ownerId: params.userId,
            projectId: params.projectId,
          },
        )
      : { active: [] };

  const mountedUserPlatformAppTools = normalizeRuntimeMountedUserPlatformAppTools(
    await params.ctx.runQuery(
      internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
      {
        userId: params.userId as any,
      },
    ),
  );
  const runtimeMountedUserPlatformAppTools: RuntimeMountedMcpTool[] =
    mountedUserPlatformAppTools.map((tool) => ({
      scope: "user",
      mount_id: tool.user_platform_app_mount_id,
      runtime_tool_name: `me__${tool.namespaced_tool_name}`,
      developer_app_id: tool.developer_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
  const mountedCommunityAppTools = params.communityId
    ? normalizeRuntimeMountedCommunityAppTools(
        await params.ctx.runQuery(
          internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal,
          {
            userId: params.userId as any,
            communityId: params.communityId as any,
          },
        ),
      )
    : [];
  const runtimeMountedCommunityAppTools: RuntimeMountedMcpTool[] =
    mountedCommunityAppTools.map((tool) => ({
      scope: "community",
      mount_id: tool.community_app_mount_id,
      runtime_tool_name: tool.namespaced_tool_name,
      developer_app_id: tool.developer_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
  const runtimeMountedTools = [
    ...runtimeMountedUserPlatformAppTools,
    ...runtimeMountedCommunityAppTools,
  ];
  const explicitCommunitySkillMentions = new Set(
    extractExplicitSkillMentions(params.messages),
  );
  const attachedCommunitySkills = params.communityId
    ? normalizeRuntimeCommunitySkillInventory(
        await params.ctx.runQuery(
          internal.communitySkillAttachments
            .listRuntimeCommunitySkillInventoryInternal,
          {
            userId: params.userId as any,
            authSubject: params.authSubject ?? undefined,
            communityId: params.communityId as any,
          },
        ),
      )
    : [];
  const selectedCommunitySkills =
    params.communityId && explicitCommunitySkillMentions.size > 0
      ? normalizeRuntimeSelectedCommunitySkills(
          await params.ctx.runQuery(
            internal.communitySkillAttachments
              .listRuntimeSelectedCommunitySkillsInternal,
            {
              userId: params.userId as any,
              authSubject: params.authSubject ?? undefined,
              communityId: params.communityId as any,
              requestedMentionTokens: Array.from(explicitCommunitySkillMentions),
            },
          ),
        )
      : [];
  const mountedToolByName = new Map(
    runtimeMountedTools.map((tool) => [tool.runtime_tool_name, tool]),
  );
  const overlayRuntimeState = buildCommunityOverlayRuntimeState({
    allowedToolNames: [
      ...params.allowedToolNames,
      ...runtimeMountedUserPlatformAppTools.map((tool) => tool.runtime_tool_name),
    ],
    mountedTools: mapMountedToolsToOverlayRuntime(mountedCommunityAppTools),
    attachedSkills: mapCommunitySkillsToOverlayRuntime(attachedCommunitySkills),
    selectedSkills: mapSelectedCommunitySkillsToOverlayRuntime(
      selectedCommunitySkills,
    ),
  });
  const activeToolNames = overlayRuntimeState.activeToolNames;

  const baseSystemPrompt = buildWorkspaceRuntimeSystemPrompt({
    maxIterations: params.maxIterations,
    allowedToolNames: params.allowedToolNames,
    harnessName: params.harnessName,
    communityId: params.communityId,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    customCommunitySystemPrompt: params.communitySystemPrompt,
    projectLabel: projectContext.label,
    projectDescription: projectContext.description,
    threadWorkingState: params.threadWorkingState,
    activeBackgroundTerminals: Array.isArray(terminalSnapshot?.active)
      ? terminalSnapshot.active.map((terminal: any) => ({
          id: String(terminal?.id ?? "").trim(),
          status: terminal?.status,
          command: String(terminal?.command ?? "").trim(),
          cwd: typeof terminal?.cwd === "string" ? terminal.cwd : null,
          outputTail:
            typeof terminal?.output_tail === "string"
              ? terminal.output_tail
              : null,
          exitCode:
            typeof terminal?.exit_code === "number" ? terminal.exit_code : null,
        }))
      : [],
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
  });
  const systemPrompt = `${baseSystemPrompt}${buildUserPlatformMountedAppsPromptBlock(
    runtimeMountedUserPlatformAppTools,
  )}${overlayRuntimeState.systemPromptSuffix}`;
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
  const nativeTools = [
    ...buildOpenAiFunctionTools(params.allowedToolNames),
    ...buildMountedAppOpenAiTools(runtimeMountedTools),
  ];
  const responsesApiNativeTools = [
    ...buildResponsesApiFunctionTools(params.allowedToolNames),
    ...buildMountedAppResponsesTools(runtimeMountedTools),
  ];
  let reasoningSummaryStreamCount = 0;
  let reasoningSummaryPartAddedCount = 0;
  let reasoningSummaryTextDeltaCount = 0;
  if (runtimeMountedUserPlatformAppTools.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "platform_app_tools_resolved",
        eventKey: `${params.runId}:platform_app_tools_resolved:1`,
        payload: {
          run_id: params.runId,
          user_scope_id: params.userId ?? null,
          tools: runtimeMountedUserPlatformAppTools.map((tool) => ({
            runtime_tool_name: tool.runtime_tool_name,
            app_name: tool.app_name,
            tool_name: tool.tool_name,
            namespaced_tool_name: tool.namespaced_tool_name,
            risk_level: tool.risk_level,
          })),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (mountedCommunityAppTools.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "community_app_tools_resolved",
        eventKey: `${params.runId}:community_app_tools_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          tools: mountedCommunityAppTools.map((tool) => ({
            app_name: tool.app_name,
            tool_name: tool.tool_name,
            namespaced_tool_name: tool.namespaced_tool_name,
            risk_level: tool.risk_level,
          })),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (attachedCommunitySkills.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "community_skills_resolved",
        eventKey: `${params.runId}:community_skills_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          skills: attachedCommunitySkills.map((skill) => ({
            skill_name: skill.name,
            skill_mention_token: skill.mention_token,
          })),
          selected_skill_mention_tokens: selectedCommunitySkills.map(
            (skill) => skill.mention_token,
          ),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  try {
    const throwIfCancelled = async (): Promise<void> => {
      await throwIfRuntimeRunCancelled({
        ctx: params.ctx,
        ownerId: params.userId,
        runId: params.runId,
      });
    };
    const loopResult = await runSerialNativeToolLoop<string>({
      messages: nativeTranscript,
      maxIterations: params.maxIterations,
      runCompletion: async (messages) => {
        let completion:
          | NativeToolAwareCompletionSuccess<string>
          | RuntimeAgentLoopFailure;
        const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
          runId: params.runId,
          summaryStreamId: `${params.runId}:tool_completion:${reasoningSummaryStreamCount}`,
          appendRunEvent: params.appendRunEvent,
        });
        reasoningSummaryStreamCount += 1;
        try {
          completion = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            operation: async (signal) =>
              await runProviderNativeToolCompletion({
                ctx: params.ctx,
                userId: params.userId,
                requestedModelId: params.requestedModelId,
                inferenceSource: params.inferenceSource,
                modelRef: params.modelRef,
                messages,
                maxTokens: params.maxTokens,
                openRouterTools: nativeTools,
                responsesApiTools: responsesApiNativeTools,
                apiKeyOverride: params.apiKeyOverride,
                onReasoningSummaryPartAdded: async ({ summaryIndex }) => {
                  try {
                    reasoningSummaryPartAddedCount += 1;
                    await reasoningSummaryEmitter.onPartAdded(summaryIndex);
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                onReasoningSummaryTextDelta: async ({
                  delta,
                  summaryIndex,
                }) => {
                  if (!delta) return;
                  try {
                    reasoningSummaryTextDeltaCount += 1;
                    await reasoningSummaryEmitter.onTextDelta(
                      delta,
                      summaryIndex,
                    );
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                signal,
              }),
          });
          await throwIfCancelled();
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              ok: false,
              status: 409,
              code: USER_CANCELLED_RUNTIME_CODE,
              message: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_provider_completion_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            projectId: params.projectId ?? undefined,
            communityId: params.communityId ?? undefined,
            inferenceSource: params.inferenceSource,
            requestedModelId: params.requestedModelId,
            modelRef: params.modelRef,
            allowedToolNames: params.allowedToolNames,
          });
          return {
            ok: false,
            status: 502,
            code: "agent_loop_provider_crash",
            message: `Provider completion crashed: ${summary.message}`,
          };
        }
        if (!completion.ok) return completion;
        if (
          completion.type === "tool_call" &&
          !activeToolNames.includes(completion.toolName)
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
        return completion as NativeToolAwareCompletionSuccess<string>;
      },
      normalizeToolArguments: (toolName, rawArgs) => {
        if (params.allowedToolNames.includes(toolName as RetrievalToolName)) {
          return normalizeToolArguments(toolName as RetrievalToolName, rawArgs);
        }
        return rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
          ? rawArgs
          : {};
      },
      executeTool: async ({ toolName, normalizedArgs }) => {
        try {
          await throwIfCancelled();
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error.message,
            };
          }
          throw error;
        }
        const isFixedTool = params.allowedToolNames.includes(
          toolName as RetrievalToolName,
        );
        if (!isFixedTool) {
          const mountedTool = mountedToolByName.get(toolName);
          if (!mountedTool) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_not_found",
              errorMessage: `${toolName} is not active for this runtime.`,
            };
          }
          try {
            const toolResult = await runAbortableWithRuntimeCancellation({
              ctx: params.ctx,
              ownerId: params.userId,
              runId: params.runId,
              operation: async () => {
                if (mountedTool.scope === "user") {
                  return await params.ctx.runAction(
                    internal.userPlatformAppMounts
                      .executeUserPlatformMountedAppToolInternal,
                    {
                      userId: params.userId as any,
                      namespacedToolName: mountedTool.namespaced_tool_name,
                      argsJson: normalizedArgs,
                    },
                  );
                }
                if (!params.communityId) {
                  return {
                    status: "error" as const,
                    exitCode: null,
                    outputText: "",
                    errorCode: "community_app_tool_not_found",
                    errorMessage: `${toolName} is not active for this community lens.`,
                  };
                }
                return await params.ctx.runAction(
                  internal.communityAppMounts
                    .executeCommunityMountedAppToolInternal,
                  {
                    userId: params.userId as any,
                    communityId: params.communityId as any,
                    namespacedToolName: mountedTool.namespaced_tool_name,
                    argsJson: normalizedArgs,
                  },
                );
              },
            });
            await throwIfCancelled();
            return toolResult as NativeToolExecutionResult;
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_mounted_app_tool_execution_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              communityId: params.communityId ?? undefined,
              developerAppId: mountedTool.developer_app_id,
              mountedToolScope: mountedTool.scope,
              mountedToolName: mountedTool.runtime_tool_name,
              toolName,
              ...summarizeToolArgsForLog(toolName, normalizedArgs),
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_execute_failed",
              errorMessage: `Mounted app tool execution failed: ${summary.message}`,
            };
          }
        }

        const needsWorkspaceSession = requiresWorkspaceSandbox(
          toolName as RetrievalToolName,
        );

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
          try {
            await throwIfCancelled();
            await params.appendRunEvent({
              eventType: "workspace_session_create_started",
              eventKey: `${params.runId}:workspace_session_create_started:1`,
              payload: {
                run_id: params.runId,
                project_id: projectId,
                tool_name: toolName,
              },
            });
          } catch {
            // best-effort debug event only
          }
          let created: Awaited<
            ReturnType<typeof createWorkspaceSandboxSession>
          >;
          try {
            created = await createWorkspaceSandboxSession({
              ctx: params.ctx,
              userId: params.userId,
              authSubject,
              projectId,
              runId: params.runId,
            });
          } catch (error) {
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_workspace_session_create_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              toolName,
              projectId,
              communityId: params.communityId ?? undefined,
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "workspace_session_create_failed",
              errorMessage: `Workspace session create failed: ${summary.message}`,
            };
          }
          if (!created.ok) {
            return {
              status: "error",
              exitCode: null,
              outputText: readFailureOutputPreview((created as any).details),
              errorCode: created.code,
              errorMessage: created.message,
            };
          }
          try {
            await throwIfCancelled();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            throw error;
          }
          lazyWorkspaceSession = created.session;
          ensureWorkspaceHeartbeat();
          try {
            await params.appendRunEvent({
              eventType: "workspace_session_created",
              eventKey: `${params.runId}:workspace_session_created:1`,
              payload: {
                run_id: params.runId,
                sandbox_id: created.session.providerSandboxId,
                region: created.session.region,
                project_id: projectId,
                toolbox_proxy_url: created.session.toolboxProxyUrl,
              },
            });
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
          } catch (error) {
            const summary = summarizeErrorForLog(error);
            logStructuredError(
              "agent_loop_sandbox_started_event_append_crashed",
              {
                error,
                runId: params.runId,
                threadId: params.threadId ?? undefined,
                toolName,
                projectId,
                sandboxId: created.session.providerSandboxId,
                communityId: params.communityId ?? undefined,
              },
            );
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "sandbox_started_event_failed",
              errorMessage: `Sandbox started event failed: ${summary.message}`,
            };
          }
        }

        try {
          const toolResult = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            operation: async (signal) =>
              await executeRetrievalHarnessTool({
                ctx: params.ctx,
                userId: params.userId,
                communityId: params.communityId ?? null,
                authSubject: params.authSubject,
                projectId: params.projectId,
                runId: params.runId,
                toolName: toolName as RetrievalToolName,
                args: normalizedArgs,
                workspaceSession: lazyWorkspaceSession,
                signal,
              }),
          });
          await throwIfCancelled();
          return toolResult;
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_tool_execution_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            communityId: params.communityId ?? undefined,
            projectId: params.projectId ?? undefined,
            ...summarizeToolArgsForLog(toolName, normalizedArgs),
          });
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "workspace_tool_execute_failed",
            errorMessage: `Workspace tool execution failed: ${summary.message}`,
          };
        }
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
      onToolStepFinish: async ({
        iteration,
        step,
        toolResult,
        toolResultEnvelope,
      }) => {
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
          console.error("tool_loop_tool_call_failed", {
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            harnessName: params.harnessName,
            providerCallId: step.providerCallId,
            iteration,
            communityId: params.communityId ?? undefined,
            projectId: params.projectId ?? undefined,
            errorCode: toolResult.errorCode,
            errorMessage: toolResult.errorMessage,
            exitCode: toolResult.exitCode,
            hasOutputText: Boolean(toolResult.outputText),
            outputLength: String(toolResult.outputText ?? "").length,
            ...summarizeToolArgsForLog(step.toolName, step.normalizedArgs),
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
    if (!loopResult.ok && loopResult.code === USER_CANCELLED_RUNTIME_CODE) {
      return loopResult;
    }
    return loopResult;
  } catch (error) {
    if (isRuntimeRunCancelledError(error)) {
      return {
        ok: false,
        status: 409,
        code: USER_CANCELLED_RUNTIME_CODE,
        message: error.message,
      };
    }
    const summary = summarizeErrorForLog(error);
    logStructuredError("agent_loop_unhandled_crash", {
      error,
      runId: params.runId,
      threadId: params.threadId ?? undefined,
      projectId: params.projectId ?? undefined,
      communityId: params.communityId ?? undefined,
      inferenceSource: params.inferenceSource,
      requestedModelId: params.requestedModelId,
      allowedToolNames: params.allowedToolNames,
    });
    try {
      await params.appendRunEvent({
        eventType: "agent_loop_internal_error",
        eventKey: `${params.runId}:agent_loop_internal_error:1`,
        payload: {
          run_id: params.runId,
          inference_source: params.inferenceSource,
          model_id: params.requestedModelId,
          error_name: summary.name,
          error_message: summary.message,
          stack_preview: summary.stackPreview,
        },
      });
    } catch {
      // ignore best-effort debug event persistence failures
    }
    return {
      ok: false,
      status: 502,
      code: "agent_loop_internal_error",
      message: `Agent loop crashed: ${summary.message}`,
    };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (ownsWorkspaceSession && lazyWorkspaceSession) {
      await cleanupWorkspaceSandboxSession({
        ctx: params.ctx,
        userId: params.userId,
        session: lazyWorkspaceSession,
        runId: params.runId,
        projectId: String(
          params.projectId ?? lazyWorkspaceSession.projectId ?? "",
        ).trim(),
        appendRunEvent: params.appendRunEvent,
      });
    }
  }
}

async function executeChatToolsAgentLoop(
  params: RuntimeCommunityPromptFields & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
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
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
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
