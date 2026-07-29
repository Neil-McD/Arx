import {
  WORKSPACE_PREVIEW_PORT_MAX,
  WORKSPACE_PREVIEW_PORT_MIN,
} from "../../../shared/workspacePreviewPort.ts";

export function buildWorkspaceServeDynamicToolSpec(): Record<string, unknown> {
  return {
    name: "workspace_serve",
    description:
      "Start a long-running server (dev server, app, API) in the user's workspace and get back a preview URL the user can open. Use this for anything that listens on a port. PolyNet attaches the app to the user's preview panel. Never print raw provider preview URLs. Calling it again with the same port reuses or replaces the existing server, so retry on the SAME port rather than hopping ports. On failure, read server_output before changing approach.",
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
