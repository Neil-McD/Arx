import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type AppConnectionRow,
  type AppToolSnapshotRow,
  type DeveloperAppRow,
  normalizeString,
  type AppToolValidationStatus,
} from "./appCore";
import {
  buildJsonRpcBody,
  buildDeveloperAppAuthHeaders,
  errorMessageFromRpc,
  initializeStreamableHttpMcpSession,
  type JsonRpcError,
  type JsonRpcSuccess,
  postMcpJson,
  sendInitializedNotification,
} from "./mcpHttpClient";
import { sha256HexText } from "./providerConnections";

type McpValidationTool = {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type ValidationStageId =
  | "endpoint_reachable"
  | "mcp_initialized"
  | "tools_discovered";

type ValidationStageStatus = "ok" | "error" | "skipped";

type ValidationStage = {
  id: ValidationStageId;
  label: string;
  status: ValidationStageStatus;
  detail: string | null;
};

type ValidationReport = {
  validation_status: "ok" | "error";
  validation_error: string | null;
  tool_count: number;
  stages: ValidationStage[];
};

const VALIDATION_STAGE_LABELS: Record<ValidationStageId, string> = {
  endpoint_reachable: "Endpoint reachable",
  mcp_initialized: "MCP initialized",
  tools_discovered: "Tools discovered",
};

function createBaseValidationStages(): ValidationStage[] {
  return (Object.keys(VALIDATION_STAGE_LABELS) as ValidationStageId[]).map(
    (id) => ({
      id,
      label: VALIDATION_STAGE_LABELS[id],
      status: "skipped",
      detail: null,
    }),
  );
}

function setValidationStage(
  stages: ValidationStage[],
  id: ValidationStageId,
  status: ValidationStageStatus,
  detail: string | null,
): void {
  const stage = stages.find((entry) => entry.id === id);
  if (!stage) return;
  stage.status = status;
  stage.detail = detail;
}

function classifyToolRisk(name: string, description: string | null): "read" | "write" | "sensitive" {
  const haystack = `${name} ${description ?? ""}`.trim().toLowerCase();
  const sensitiveKeywords = [
    "delete",
    "destroy",
    "drop",
    "reset",
    "revoke",
    "disconnect",
    "shell",
    "terminal",
    "command",
    "exec",
    "secret",
    "token",
    "credential",
    "billing",
    "charge",
    "purchase",
    "checkout",
    "payment",
  ];
  if (sensitiveKeywords.some((keyword) => haystack.includes(keyword))) return "sensitive";
  const writeKeywords = [
    "create",
    "update",
    "edit",
    "save",
    "insert",
    "patch",
    "post",
    "send",
    "reply",
    "approve",
    "merge",
    "deploy",
    "start",
    "stop",
    "restart",
    "run",
    "write",
  ];
  if (writeKeywords.some((keyword) => haystack.includes(keyword))) return "write";
  return "read";
}

function normalizeFunctionNameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function buildNamespacedToolName(
  app: DeveloperAppRow,
  toolName: string,
  seenNamespacedToolNames: Set<string>,
): string {
  const appSegment = normalizeFunctionNameSegment(app.slug) || "app";
  const toolSegment = normalizeFunctionNameSegment(toolName) || "tool";
  const base = `${appSegment}__${toolSegment}`.slice(0, 64);
  if (!seenNamespacedToolNames.has(base)) {
    seenNamespacedToolNames.add(base);
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const next = `${base.slice(0, Math.max(1, 64 - String(suffix).length - 1))}_${suffix}`;
    if (!seenNamespacedToolNames.has(next)) {
      seenNamespacedToolNames.add(next);
      return next;
    }
  }
  throw new Error("developer_app_namespaced_tool_conflict");
}

function normalizeToolArray(app: DeveloperAppRow, rawTools: unknown): McpValidationTool[] {
  if (!Array.isArray(rawTools)) return [];
  const tools: McpValidationTool[] = [];
  const seen = new Set<string>();
  const seenNamespacedToolNames = new Set<string>();
  for (const rawTool of rawTools) {
    if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) continue;
    const tool = rawTool as Record<string, unknown>;
    const toolName = normalizeString(tool.name, 200);
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    const description = normalizeString(tool.description, 2_000) || null;
    const risk = classifyToolRisk(toolName, description);
    tools.push({
      tool_name: toolName,
      namespaced_tool_name: buildNamespacedToolName(
        app,
        toolName,
        seenNamespacedToolNames,
      ),
      description,
      input_schema: tool.inputSchema ?? {},
      risk_level: risk,
    });
  }
  return tools;
}

async function validateStreamableHttpApp(params: {
  app: DeveloperAppRow;
  secret: string | null;
}): Promise<{
  validationStatus: AppToolValidationStatus;
  validationError: string | null;
  toolsJson: unknown;
  snapshotVersion: string;
  fetchedAt: number;
  validationReport: ValidationReport;
}> {
  const headers = buildDeveloperAppAuthHeaders(params);
  const stages = createBaseValidationStages();
  let validationStatus: AppToolValidationStatus = "error";
  let validationError: string | null = null;
  let normalizedTools: McpValidationTool[] = [];

  const initializeResponse = await postMcpJson({
    url: params.app.endpointUrl,
    headers,
    body: buildJsonRpcBody("initialize", "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "polynet",
        version: "0.1.0",
      },
    }),
  });
  if (initializeResponse.status < 200 || initializeResponse.status >= 300) {
    validationError = errorMessageFromRpc(initializeResponse);
    setValidationStage(
      stages,
      "endpoint_reachable",
      "error",
      validationError,
    );
  } else {
    setValidationStage(
      stages,
      "endpoint_reachable",
      "ok",
      "Remote MCP endpoint responded.",
    );
    const initializeError = normalizeString(
      (initializeResponse.payload as JsonRpcError | null)?.error?.message,
      1_500,
    );
    if (initializeError) {
      validationError = initializeError;
      setValidationStage(
        stages,
        "mcp_initialized",
        "error",
        initializeError,
      );
    } else {
      const protocolVersion =
        normalizeString(
          (initializeResponse.payload as JsonRpcSuccess | null)?.result
            ?.protocolVersion,
        ) || "2025-06-18";
      const sessionId = initializeResponse.sessionId;
      setValidationStage(
        stages,
        "mcp_initialized",
        "ok",
        `Protocol ${protocolVersion}`,
      );
      await sendInitializedNotification({
        url: params.app.endpointUrl,
        headers,
        protocolVersion,
        sessionId,
      });
      const toolsResponse = await postMcpJson({
        url: params.app.endpointUrl,
        headers,
        protocolVersion,
        sessionId,
        body: buildJsonRpcBody("tools-list", "tools/list", {}),
      });
      if (toolsResponse.status < 200 || toolsResponse.status >= 300) {
        validationError = errorMessageFromRpc(toolsResponse);
        setValidationStage(
          stages,
          "tools_discovered",
          "error",
          validationError,
        );
      } else {
        const toolsError = normalizeString(
          (toolsResponse.payload as JsonRpcError | null)?.error?.message,
          1_500,
        );
        if (toolsError) {
          validationError = toolsError;
          setValidationStage(
            stages,
            "tools_discovered",
            "error",
            toolsError,
          );
        } else {
          normalizedTools = normalizeToolArray(
            params.app,
            (toolsResponse.payload as JsonRpcSuccess | null)?.result?.tools ?? [],
          );
          if (normalizedTools.length > 0) {
            validationStatus = "ok";
            validationError = null;
            setValidationStage(
              stages,
              "tools_discovered",
              "ok",
              `${normalizedTools.length} tools discovered`,
            );
          } else {
            validationError = "No tools were discovered from this MCP server.";
            setValidationStage(
              stages,
              "tools_discovered",
              "error",
              validationError,
            );
          }
        }
      }
    }
  }
  const fetchedAt = Date.now();
  const snapshotVersion = await sha256HexText(
    JSON.stringify({
      endpointUrl: params.app.endpointUrl,
      protocolVersion:
        initializeResponse.status >= 200 && initializeResponse.status < 300
          ? normalizeString(
              (initializeResponse.payload as JsonRpcSuccess | null)?.result
                ?.protocolVersion,
            ) || "2025-06-18"
          : "2025-06-18",
      tools: normalizedTools,
    }),
  );
  return {
    validationStatus,
    validationError,
    toolsJson: normalizedTools,
    snapshotVersion,
    fetchedAt,
    validationReport: {
      validation_status: validationStatus === "ok" ? "ok" : "error",
      validation_error: validationError,
      tool_count: normalizedTools.length,
      stages,
    },
  };
}

export const validateDeveloperAppInternal = internalAction({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const connectionBundle = (await ctx.runQuery(
      internal.appConnections.getDecryptedDeveloperAppConnectionBundleInternal,
      {
      developerAppId: args.developerAppId,
      },
    )) as {
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
      secret: string | null;
    };
    const { app, secret } = connectionBundle;

    let validationStatus: AppToolValidationStatus = "error";
    let validationError: string | null = null;
    let toolsJson: unknown = [];
    let fetchedAt = Date.now();
    let snapshotVersion = `error-${fetchedAt}`;
    let validationReport: ValidationReport = {
      validation_status: "error",
      validation_error: null,
      tool_count: 0,
      stages: createBaseValidationStages(),
    };

    try {
      const result = await validateStreamableHttpApp({
        app,
        secret,
      });
      validationStatus = result.validationStatus;
      validationError = result.validationError;
      toolsJson = result.toolsJson;
      fetchedAt = result.fetchedAt;
      snapshotVersion = result.snapshotVersion;
      validationReport = result.validationReport;
    } catch (error) {
      validationStatus = "error";
      validationError =
        error instanceof Error ? normalizeString(error.message, 2_000) : "developer_app_validation_failed";
      toolsJson = [];
      fetchedAt = Date.now();
      snapshotVersion = `error-${fetchedAt}`;
      validationReport = {
        validation_status: "error",
        validation_error: validationError,
        tool_count: 0,
        stages: [
          {
            id: "endpoint_reachable",
            label: VALIDATION_STAGE_LABELS.endpoint_reachable,
            status: "error",
            detail: validationError,
          },
          {
            id: "mcp_initialized",
            label: VALIDATION_STAGE_LABELS.mcp_initialized,
            status: "skipped",
            detail: null,
          },
          {
            id: "tools_discovered",
            label: VALIDATION_STAGE_LABELS.tools_discovered,
            status: "skipped",
            detail: null,
          },
        ],
      };
    }

    const snapshotId: any = await ctx.runMutation(internal.appValidation.createAppToolSnapshotInternal, {
      developerAppId: app._id,
      snapshotVersion,
      endpointUrl: app.endpointUrl,
      validationStatus,
      validationError: validationError ?? undefined,
      toolsJson,
      fetchedAt,
      createdAt: fetchedAt,
    });

    await ctx.runMutation(internal.developerApps.patchDeveloperAppValidationInternal, {
      developerAppId: app._id,
      status: validationStatus === "ok" ? "valid" : "invalid",
      activeSnapshotId: validationStatus === "ok" ? snapshotId : null,
      lastValidatedAt: fetchedAt,
      lastValidationError: validationError,
      nowMs: fetchedAt,
    });

    if (app.authType !== "none") {
      await ctx.runMutation(internal.appConnections.patchAppConnectionValidationStateInternal, {
        developerAppId: app._id,
        connectionStatus: validationStatus === "ok" ? "connected" : "error",
        lastValidatedAt: fetchedAt,
        lastError: validationError,
        nowMs: fetchedAt,
      });
    }

    return {
      app_id: String(app._id),
      validation_status: validationStatus,
      validation_error: validationError,
      snapshot: {
        id: String(snapshotId),
        developer_app_id: String(app._id),
        snapshot_version: snapshotVersion,
        validation_status: validationStatus,
        validation_error: validationError,
        tools: toolsJson ?? [],
        fetched_at: new Date(fetchedAt).toISOString(),
      },
      validation_report: validationReport,
    };
  },
});

export const createAppToolSnapshotInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
    snapshotVersion: v.string(),
    endpointUrl: v.string(),
    validationStatus: v.union(v.literal("ok"), v.literal("error")),
    validationError: v.optional(v.string()),
    toolsJson: v.any(),
    fetchedAt: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("appToolSnapshots", {
      developerAppId: args.developerAppId,
      snapshotVersion: args.snapshotVersion,
      endpointUrl: args.endpointUrl,
      validationStatus: args.validationStatus,
      validationError: args.validationError,
      toolsJson: args.toolsJson,
      fetchedAt: args.fetchedAt,
      createdAt: args.createdAt,
    });
  },
});
