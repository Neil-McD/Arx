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
  buildDeveloperAppAuthHeaders,
  initializeStreamableHttpMcpSession,
  listMcpTools,
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
}> {
  const headers = buildDeveloperAppAuthHeaders(params);
  const { protocolVersion, sessionId } = await initializeStreamableHttpMcpSession({
    url: params.app.endpointUrl,
    headers,
    clientName: "polynet",
    clientVersion: "0.1.0",
  });
  await sendInitializedNotification({
    url: params.app.endpointUrl,
    headers,
    protocolVersion,
    sessionId,
  });
  const normalizedTools = normalizeToolArray(
    params.app,
    await listMcpTools({
      url: params.app.endpointUrl,
      headers,
      protocolVersion,
      sessionId,
    }),
  );
  const fetchedAt = Date.now();
  const snapshotVersion = await sha256HexText(
    JSON.stringify({
      endpointUrl: params.app.endpointUrl,
      protocolVersion,
      tools: normalizedTools,
    }),
  );
  return {
    validationStatus: "ok",
    validationError: null,
    toolsJson: normalizedTools,
    snapshotVersion,
    fetchedAt,
  };
}

export const validateDeveloperAppInternal = internalAction({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
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
    } catch (error) {
      validationStatus = "error";
      validationError =
        error instanceof Error ? normalizeString(error.message, 2_000) : "developer_app_validation_failed";
      toolsJson = [];
      fetchedAt = Date.now();
      snapshotVersion = `error-${fetchedAt}`;
    }

    const snapshotId = await ctx.runMutation(internal.appValidation.createAppToolSnapshotInternal, {
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
