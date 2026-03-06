import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { AgentMode } from "../../features/harness/runPhase";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { AuthSession as CloudSession } from "../../../shared/authSessionCore";

import { createCloudPersonalMemoryItem } from "../../../shared/cloudPersonalMemoryGateway";

type SlashPanelState = {
  kind: "status" | "approvals" | "info";
  title: string;
  body?: string;
} | null;

type SettingsPage = "account" | "models" | "execution" | "memory" | "appearance";
type AppView = "home" | "settings";

type SessionResumeLike = {
  last_message_at?: number | null;
  last_response_id?: string | null;
} | null;

type ActiveProjectLike = {
  name: string | null;
  root_path: string;
} | null;

type UseDesktopSlashCommandsArgs = {
  sessionResume: SessionResumeLike;
  formatRelativeTime: (value: number) => string;
  agentMode: AgentMode;
  activeModelId: string | null;
  workspaceRoot: string | null;
  activeProject: ActiveProjectLike;
  execPolicyRules: string;
  effectiveCwd: string;
  runtimeClient: RuntimeClient;
  setSlashPanel: Dispatch<SetStateAction<SlashPanelState>>;
  setAgentMode: Dispatch<SetStateAction<AgentMode>>;
  getSession: () => CloudSession | null;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  handleSignIn: () => Promise<void>;
  getCloudAuthUid: (session: CloudSession) => string;
  getEffectiveWorkspacePath: () => string;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setSettingsPage: Dispatch<SetStateAction<SettingsPage>>;
  setPersonalMemoryQuery: Dispatch<SetStateAction<string>>;
  loadPersonalMemoryItems: () => Promise<void>;
  ensureThreadId: () => Promise<string | null>;
  setCommandInput: Dispatch<SetStateAction<string>>;
  dispatchRunPhase: (action: { type: "send_start" | "reset" }) => void;
  setAgentStatus: (value: null) => void;
  setRunningTools: (value: []) => void;
};

export function useDesktopSlashCommands(args: UseDesktopSlashCommandsArgs) {
  const proposeShellCommand = useCallback(
    async (_sessionId: string, _command: string) => {
      args.setSlashPanel({
        kind: "info",
        title: "Disabled",
        body: "Internal tool execution is disabled in MVP; use the engine terminal.",
      });
    },
    [args],
  );

  const handleSlashCommand = useCallback(
    async (userText: string, sessionId: string): Promise<boolean> => {
      if (!userText.startsWith("/")) return false;
      const [rawName] = userText.slice(1).trim().split(/\s+/);
      const name = (rawName || "").toLowerCase();
      if (!name) return false;

      const showPanel = (kind: "status" | "approvals" | "info", title: string, body?: string) => {
        args.setSlashPanel({ kind, title, body });
      };

      if (name === "status") {
        const lastMsg = args.sessionResume?.last_message_at
          ? args.formatRelativeTime(args.sessionResume.last_message_at)
          : "—";
        const responseId = args.sessionResume?.last_response_id ?? "—";
        const text = [
          "Status",
          `Session: ${sessionId}`,
          `Mode: ${args.agentMode}`,
          `Model: ${args.activeModelId ?? "none"}`,
          `Workspace: ${args.workspaceRoot ?? "(not bound)"}`,
          `Project: ${args.activeProject?.name ?? args.activeProject?.root_path ?? "none"}`,
          `Last message: ${lastMsg}`,
          `Last response: ${responseId}`,
          "Internal tool system: disabled (use engine terminal)",
        ].join("\n");
        showPanel("status", "Status", text);
        return true;
      }

      if (name === "mode") {
        const rest = userText.slice(userText.indexOf("mode") + "mode".length).trim();
        const requested = (rest || "").toLowerCase();
        if (!requested) {
          showPanel("info", "Mode", `Current mode: ${args.agentMode}\n\nUsage: /mode build|plan|explore`);
          return true;
        }
        if (requested !== "build" && requested !== "plan" && requested !== "explore") {
          showPanel("info", "Mode", "Invalid mode. Usage: /mode build|plan|explore");
          return true;
        }
        await args.runtimeClient.setAgentMode(sessionId, requested as AgentMode);
        args.setAgentMode(requested as AgentMode);
        showPanel("info", "Mode", `Set mode: ${requested}`);
        return true;
      }

      if (name === "approvals") {
        const globalRules = args.execPolicyRules.trim() ? args.execPolicyRules.trim() : "prompt";
        const text = [
          "Approvals",
          "Global rules:",
          globalRules,
        ].join("\n");
        showPanel("approvals", "Approvals", text);
        return true;
      }

      if (name === "diff") {
        await proposeShellCommand(sessionId, "git diff");
        showPanel("info", "Diff", "Proposed: git diff");
        return true;
      }

      if (name === "test") {
        const cwd = args.effectiveCwd || "";
        const commands = await args.runtimeClient.detectTestCommands(cwd);
        if (!commands || commands.length === 0) {
          showPanel("info", "Test", "No test command detected for this project.");
          return true;
        }
        const command = commands[0];
        await proposeShellCommand(sessionId, command);
        const more = commands.length > 1 ? ` (also found: ${commands.slice(1).join(", ")})` : "";
        showPanel("info", "Test", `Proposed: ${command}${more}`);
        return true;
      }

      if (name === "remember") {
        const rest = userText.slice(userText.indexOf("remember") + "remember".length).trim();
        try {
          if (!rest) {
            showPanel(
              "info",
              "Memory",
              "Usage:\n/remember <content>\n/remember global: <content>\n/remember workspace: <content>",
            );
            return true;
          }

          let scope: "global" | "workspace" = "workspace";
          let content = rest;
          const scopeMatch = rest.match(/^(global|workspace)\s*:\s*([\s\S]+)$/i);
          if (scopeMatch) {
            scope = scopeMatch[1].toLowerCase() as "global" | "workspace";
            content = scopeMatch[2];
          }
          content = content.trim();
          if (!content) {
            showPanel(
              "info",
              "Memory",
              "Usage:\n/remember <content>\n/remember global: <content>\n/remember workspace: <content>",
            );
            return true;
          }

          const session = args.getSession();
          if (!session) {
            args.setAuthError("Sign in to save memory.");
            await args.handleSignIn();
            return true;
          }
          await createCloudPersonalMemoryItem({
            session,
            userId: args.getCloudAuthUid(session),
            content,
            scope,
            scopeId: scope === "workspace" ? args.getEffectiveWorkspacePath() : null,
            pinned: false,
          });

          args.setActiveView("settings");
          args.setSettingsPage("memory");
          args.setPersonalMemoryQuery("");
          await args.loadPersonalMemoryItems();
          showPanel("info", "Memory", `Saved to ${scope} memory.`);
        } catch (error) {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Failed to save memory";
          showPanel("info", "Memory", message);
        }
        return true;
      }

      showPanel("info", "Slash command", `Unknown slash command: /${name}`);
      return true;
    },
    [args, proposeShellCommand],
  );

  const handleSlashSelect = useCallback(
    async (command: string) => {
      const sessionId = await args.ensureThreadId();
      if (!sessionId) return;
      args.setCommandInput("");
      args.dispatchRunPhase({ type: "send_start" });
      try {
        await handleSlashCommand(command, sessionId);
      } finally {
        args.dispatchRunPhase({ type: "reset" });
        args.setAgentStatus(null);
        args.setRunningTools([]);
      }
    },
    [args, handleSlashCommand],
  );

  return {
    handleSlashCommand,
    handleSlashSelect,
    proposeShellCommand,
  };
}
