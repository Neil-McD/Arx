import type {
  AppConnectionRow,
  DeveloperAppRow,
} from "./appCore.ts";
import { normalizeString } from "./appCore.ts";
import { assertDeveloperAppServerFetchAllowed } from "./appFetchPolicy.ts";
import {
  buildDeveloperAppAuthHeaders,
  callMcpTool,
  formatMcpToolResultOutput,
  initializeStreamableHttpMcpSession,
  sendInitializedNotification,
} from "./mcpHttpClient.ts";
import type { NativeToolExecutionResult } from "../shared/nativeToolLoop.ts";
import { applyDiscoverAppResultPolicyToText } from "../shared/discoverCatalog.ts";

export type RuntimeMountedMcpTool = {
  scope: "user" | "community";
  mount_id: string;
  runtime_tool_name: string;
  developer_app_id: string;
  catalog_app_id: string | null;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

export type RuntimeMcpConnectionBundle = {
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  secret: string | null;
} | null;

type RuntimeMcpRunEvent = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

type RuntimeMcpTransport = {
  buildAuthHeaders: typeof buildDeveloperAppAuthHeaders;
  initializeSession: typeof initializeStreamableHttpMcpSession;
  sendInitializedNotification: typeof sendInitializedNotification;
  callTool: typeof callMcpTool;
  formatToolResultOutput: typeof formatMcpToolResultOutput;
};

type RuntimeMcpSession = {
  protocolVersion: string;
  sessionId: string | null;
  headers: Record<string, string>;
};

const DEFAULT_TRANSPORT: RuntimeMcpTransport = {
  buildAuthHeaders: buildDeveloperAppAuthHeaders,
  initializeSession: initializeStreamableHttpMcpSession,
  sendInitializedNotification,
  callTool: callMcpTool,
  formatToolResultOutput: formatMcpToolResultOutput,
};

function buildToolDetails(tool: RuntimeMountedMcpTool): Record<string, unknown> {
  if (tool.scope === "community") {
    return {
      community_app: {
        community_app_mount_id: String(tool.mount_id),
        developer_app_id: String(tool.developer_app_id),
        app_name: tool.app_name,
        tool_name: tool.tool_name,
        namespaced_tool_name: tool.namespaced_tool_name,
        risk_level: tool.risk_level,
      },
    };
  }
  return {
    user_platform_app: {
      user_platform_app_mount_id: String(tool.mount_id),
      developer_app_id: String(tool.developer_app_id),
      app_name: tool.app_name,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      risk_level: tool.risk_level,
    },
  };
}

function buildAppNotFoundCode(tool: RuntimeMountedMcpTool): string {
  return tool.scope === "community"
    ? "community_app_not_found"
    : "user_platform_app_not_found";
}

function buildToolFailedCode(tool: RuntimeMountedMcpTool): string {
  return tool.scope === "community"
    ? "community_app_tool_failed"
    : "user_platform_app_tool_failed";
}

function buildSessionCacheKey(tool: RuntimeMountedMcpTool): string {
  return [
    tool.scope,
    tool.developer_app_id,
    tool.endpoint_url,
    tool.auth_type,
  ].join(":");
}

function shouldRetryReadToolWithFreshSession(params: {
  tool: RuntimeMountedMcpTool;
  error: unknown;
}): boolean {
  if (params.tool.risk_level !== "read") return false;
  const message = normalizeString(
    params.error instanceof Error ? params.error.message : String(params.error ?? ""),
    1_000,
  ).toLowerCase();
  if (!message.includes("session")) return false;
  return (
    message.includes("invalid") ||
    message.includes("expired") ||
    message.includes("unknown") ||
    message.includes("not found")
  );
}

export function createRuntimeMcpManager(params: {
  runId: string;
  mountedTools: RuntimeMountedMcpTool[];
  loadConnectionBundle: (params: {
    developerAppId: string;
  }) => Promise<RuntimeMcpConnectionBundle>;
  appendRunEvent?: (event: RuntimeMcpRunEvent) => Promise<void>;
  clientName?: string;
  clientVersion?: string;
  transport?: Partial<RuntimeMcpTransport>;
}) {
  const toolByRuntimeName = new Map(
    params.mountedTools.map((tool) => [tool.runtime_tool_name, tool]),
  );
  const connectionBundleCache = new Map<
    string,
    Promise<RuntimeMcpConnectionBundle>
  >();
  const sessionCache = new Map<string, Promise<RuntimeMcpSession>>();
  const transport: RuntimeMcpTransport = {
    ...DEFAULT_TRANSPORT,
    ...(params.transport ?? {}),
  };
  const clientName = normalizeString(params.clientName, 120) || "polynet-runtime";
  const clientVersion = normalizeString(params.clientVersion, 40) || "0.1.0";
  let eventSequence = 0;

  const emitRunEvent = async (
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    if (!params.appendRunEvent) return;
    try {
      eventSequence += 1;
      await params.appendRunEvent({
        eventType,
        eventKey: `${params.runId}:${eventType}:${eventSequence}`,
        payload: {
          run_id: params.runId,
          ...payload,
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  };

  const getConnectionBundle = async (
    tool: RuntimeMountedMcpTool,
  ): Promise<RuntimeMcpConnectionBundle> => {
    const existing = connectionBundleCache.get(tool.developer_app_id);
    if (existing) {
      await emitRunEvent("mcp_connection_bundle_cache_hit", {
        scope: tool.scope,
        developer_app_id: tool.developer_app_id,
        app_name: tool.app_name,
      });
      return await existing;
    }
    const pending = params.loadConnectionBundle({
      developerAppId: tool.developer_app_id,
    });
    connectionBundleCache.set(tool.developer_app_id, pending);
    try {
      const bundle = await pending;
      await emitRunEvent("mcp_connection_bundle_loaded", {
        scope: tool.scope,
        developer_app_id: tool.developer_app_id,
        app_name: tool.app_name,
        found: bundle !== null,
      });
      return bundle;
    } catch (error) {
      connectionBundleCache.delete(tool.developer_app_id);
      throw error;
    }
  };

  const createSession = async (params: {
    tool: RuntimeMountedMcpTool;
    bundle?: RuntimeMcpConnectionBundle;
    signal?: AbortSignal;
  }): Promise<RuntimeMcpSession> => {
    const bundle = params.bundle ?? (await getConnectionBundle(params.tool));
    if (!bundle) {
      throw new Error(buildAppNotFoundCode(params.tool));
    }
    assertDeveloperAppServerFetchAllowed(bundle.app);
    if (params.tool.endpoint_url !== bundle.app.endpointUrl) {
      throw new Error("Mounted app tool endpoint does not match its app definition.");
    }
    const headers = transport.buildAuthHeaders({
      app: bundle.app,
      secret: bundle.secret,
    });
    const initialized = await transport.initializeSession({
      url: params.tool.endpoint_url,
      headers,
      clientName,
      clientVersion,
      signal: params.signal,
    });
    await transport.sendInitializedNotification({
      url: params.tool.endpoint_url,
      headers,
      protocolVersion: initialized.protocolVersion,
      sessionId: initialized.sessionId,
      signal: params.signal,
    });
    await emitRunEvent("mcp_session_initialized", {
      scope: params.tool.scope,
      developer_app_id: params.tool.developer_app_id,
      app_name: params.tool.app_name,
      endpoint_url: params.tool.endpoint_url,
      protocol_version: initialized.protocolVersion,
      has_session_id: initialized.sessionId !== null,
    });
    return {
      protocolVersion: initialized.protocolVersion,
      sessionId: initialized.sessionId,
      headers,
    };
  };

  const getSession = async (params: {
    tool: RuntimeMountedMcpTool;
    bundle?: RuntimeMcpConnectionBundle;
    signal?: AbortSignal;
    forceFresh?: boolean;
  }): Promise<RuntimeMcpSession> => {
    const cacheKey = buildSessionCacheKey(params.tool);
    if (!params.forceFresh) {
      const existing = sessionCache.get(cacheKey);
      if (existing) {
        await emitRunEvent("mcp_session_reused", {
          scope: params.tool.scope,
          developer_app_id: params.tool.developer_app_id,
          app_name: params.tool.app_name,
          endpoint_url: params.tool.endpoint_url,
        });
        return await existing;
      }
    } else {
      sessionCache.delete(cacheKey);
    }

    const pending = createSession({
      tool: params.tool,
      bundle: params.bundle,
      signal: params.signal,
    });
    sessionCache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      sessionCache.delete(cacheKey);
      throw error;
    }
  };

  const executeWithSession = async (params: {
    tool: RuntimeMountedMcpTool;
    bundle: Exclude<RuntimeMcpConnectionBundle, null>;
    argumentsObject: Record<string, unknown>;
    signal?: AbortSignal;
    allowFreshSessionRetry: boolean;
  }): Promise<{ callResult: unknown; refreshedSession: boolean }> => {
    const session = await getSession({
      tool: params.tool,
      bundle: params.bundle,
      signal: params.signal,
    });
    try {
      return {
        callResult: await transport.callTool({
          url: params.tool.endpoint_url,
          headers: session.headers,
          protocolVersion: session.protocolVersion,
          sessionId: session.sessionId,
          toolName: params.tool.tool_name,
          argumentsObject: params.argumentsObject,
          signal: params.signal,
        }),
        refreshedSession: false,
      };
    } catch (error) {
      if (
        params.allowFreshSessionRetry &&
        shouldRetryReadToolWithFreshSession({
          tool: params.tool,
          error,
        })
      ) {
        await emitRunEvent("mcp_session_reinitialized", {
          scope: params.tool.scope,
          developer_app_id: params.tool.developer_app_id,
          app_name: params.tool.app_name,
          endpoint_url: params.tool.endpoint_url,
          runtime_tool_name: params.tool.runtime_tool_name,
        });
        const freshSession = await getSession({
          tool: params.tool,
          bundle: params.bundle,
          signal: params.signal,
          forceFresh: true,
        });
        return {
          callResult: await transport.callTool({
            url: params.tool.endpoint_url,
            headers: freshSession.headers,
            protocolVersion: freshSession.protocolVersion,
            sessionId: freshSession.sessionId,
            toolName: params.tool.tool_name,
            argumentsObject: params.argumentsObject,
            signal: params.signal,
          }),
          refreshedSession: true,
        };
      }
      throw error;
    }
  };

  return {
    async execute(params: {
      runtimeToolName: string;
      argumentsObject: Record<string, unknown>;
      signal?: AbortSignal;
    }): Promise<NativeToolExecutionResult> {
      const tool = toolByRuntimeName.get(params.runtimeToolName);
      if (!tool) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "mounted_app_tool_not_found",
          errorMessage: "Mounted app tool not found.",
          details: null,
        };
      }
      const executionStartedAt = Date.now();

      const emitExecutionCompleted = async (payload: {
        status: "ok" | "error";
        latencyMs: number;
        errorCode: string | null;
        refreshedSession: boolean;
      }) => {
        await emitRunEvent("mcp_tool_execution_completed", {
          scope: tool.scope,
          developer_app_id: tool.developer_app_id,
          app_name: tool.app_name,
          runtime_tool_name: tool.runtime_tool_name,
          risk_level: tool.risk_level,
          latency_ms: payload.latencyMs,
          status: payload.status,
          error_code: payload.errorCode,
          refreshed_session: payload.refreshedSession,
        });
      };

      try {
        const bundle = await getConnectionBundle(tool);
        if (!bundle) {
          const result = {
            status: "error" as const,
            exitCode: null,
            outputText: "",
            errorCode: buildAppNotFoundCode(tool),
            errorMessage:
              tool.scope === "community"
                ? "Mounted community app not found."
                : "Mounted platform app not found.",
            details: buildToolDetails(tool),
          };
          await emitExecutionCompleted({
            status: result.status,
            latencyMs: Date.now() - executionStartedAt,
            errorCode: result.errorCode,
            refreshedSession: false,
          });
          return result;
        }
        const { callResult, refreshedSession } = await executeWithSession({
          tool,
          bundle,
          argumentsObject: params.argumentsObject,
          signal: params.signal,
          allowFreshSessionRetry: true,
        });
        const record =
          callResult && typeof callResult === "object" && !Array.isArray(callResult)
            ? (callResult as Record<string, unknown>)
            : null;
        const isError = record?.isError === true;
        const rawOutputText = transport.formatToolResultOutput(callResult);
        const boundedOutput = applyDiscoverAppResultPolicyToText(
          tool.catalog_app_id,
          rawOutputText,
        );
        const outputText = boundedOutput.outputText;
        const status: "error" | "ok" = isError ? "error" : "ok";
        const result = {
          status,
          exitCode: isError ? null : 0,
          outputText,
          errorCode: isError ? buildToolFailedCode(tool) : null,
          errorMessage:
            isError
              ? outputText ||
                (tool.scope === "community"
                  ? "Community app tool failed."
                  : "Platform app tool failed.")
              : null,
          details: {
            ...buildToolDetails(tool),
            result_truncated: boundedOutput.truncated,
            max_result_bytes: boundedOutput.maxResultBytes,
          },
        };
        await emitExecutionCompleted({
          status: result.status,
          latencyMs: Date.now() - executionStartedAt,
          errorCode: result.errorCode,
          refreshedSession,
        });
        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? normalizeString(error.message, 2_000)
            : buildToolFailedCode(tool);
        const result = {
          status: "error" as const,
          exitCode: null,
          outputText: "",
          errorCode: buildToolFailedCode(tool),
          errorMessage:
            message ||
            (tool.scope === "community"
              ? "Community app tool failed."
              : "Platform app tool failed."),
          details: buildToolDetails(tool),
        };
        await emitExecutionCompleted({
          status: result.status,
          latencyMs: Date.now() - executionStartedAt,
          errorCode: result.errorCode,
          refreshedSession: false,
        });
        return result;
      }
    },
  };
}
