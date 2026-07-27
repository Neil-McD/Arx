import {
  WORKSPACE_PREVIEW_PORT_MAX,
  WORKSPACE_PREVIEW_PORT_MIN,
} from "../../../shared/workspacePreviewPort.ts";

export type WorkerMcpBridgeToolSpec = {
  bridgeToolName: string;
  runtimeToolName: string;
  connectorName: string;
  appIdentityKey: string;
  catalogAppId: string | null;
  toolName: string;
  namespacedToolName: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  riskLevel: "read" | "write" | "sensitive";
};

export function buildWorkspaceServeDynamicToolSpec(): Record<string, unknown> {
  return {
    name: "workspace_serve",
    description:
      "Start a long-running server (dev server, app, API) in the user's workspace for runtime-side validation. Use this for anything that listens on a port. After it starts, inspect localhost with computer_open_url and computer_screenshot when visual verification is needed. Do not claim the user has an inline preview or print provider URLs. Calling it again with the same port reuses or replaces the existing server, so retry on the SAME port rather than hopping ports. On failure, read server_output before changing approach.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command that starts the server, for example `npm run dev -- --host 0.0.0.0`.",
        },
        port: {
          type: "number",
          description: `The localhost port the server listens on. Must be between ${WORKSPACE_PREVIEW_PORT_MIN} and ${WORKSPACE_PREVIEW_PORT_MAX}.`,
        },
      },
      required: ["command", "port"],
      additionalProperties: false,
    },
  };
}

export function buildMcpBridgeDynamicToolSpec(
  tool: WorkerMcpBridgeToolSpec,
): Record<string, unknown> {
  const connector = tool.connectorName || "connected MCP app";
  const description =
    tool.description ||
    `Call ${tool.toolName} on ${connector} through the user's PolyNet connection.`;
  return {
    name: tool.bridgeToolName,
    description: [
      description,
      `Connector: ${connector}.`,
      `Risk: ${tool.riskLevel}.`,
      "This tool is mediated by PolyNet; do not ask the user to configure the same app again inside Codex.",
    ].join(" "),
    inputSchema: tool.inputSchema,
  };
}
