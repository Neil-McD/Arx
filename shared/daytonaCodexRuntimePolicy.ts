import { CODEX_WORKSPACE_SERVE_TOOL_NAME } from "./harnessToolPolicy.ts";
import { DEFAULT_ACTIVE_MODEL_ID } from "./modelCatalog.ts";

export type DaytonaCodexSandboxMode = "workspace-write" | "danger-full-access";
export type DaytonaRuntimeTargetLifecycleMode =
  | "prepared_staging_reuse"
  | "thread_ephemeral"
  | "per_turn_ephemeral";

type DaytonaCodexTurnSandboxPolicy =
  | {
      type: "workspaceWrite";
      networkAccess: false;
    }
  | {
      type: "dangerFullAccess";
    };

type DaytonaRuntimePolicy = {
  id: string;
  nativeCodex: {
    approvalPolicy: "never";
    threadSandbox: DaytonaCodexSandboxMode;
    turnSandboxPolicy: DaytonaCodexTurnSandboxPolicy;
    webSearch: "live";
    projectDocMaxBytes: 0;
    defaultModelId: string;
  };
  workspaceAccess: {
    mode: "native_codex";
    duplicateShellTool: false;
    serveTool: typeof CODEX_WORKSPACE_SERVE_TOOL_NAME;
  };
  daytonaSandbox: {
    workerPort: number;
    remoteRoot: string;
    workspaceRoot: string;
    codexHome: string;
    publicPreview: false;
    autoStopIntervalMinutes: number;
    autoArchiveIntervalMinutes: number;
    autoDeleteIntervalMinutes: number;
    previewLeaseMinutes: number;
    humanSaveRetentionMinutes: number;
    maxHumanSaveRetentionMinutes: number;
    providerEphemeralByLifecycle: {
      thread_ephemeral: false;
      per_turn_ephemeral: true;
    };
    defaultResources: {
      cpu: number;
      memory: number;
      disk: number;
    };
  };
};

export const DAYTONA_CODEX_WORKER_PORT = 8877;
export const DAYTONA_CODEX_REMOTE_ROOT = "/home/daytona/polynet";
export const DAYTONA_CODEX_WORKSPACE_ROOT = "/home/daytona/workspace";
export const DAYTONA_CODEX_CODEX_HOME = "/home/daytona/.polynet-codex-home";
export const DAYTONA_CODEX_DEFAULT_PREVIEW_LEASE_MINUTES = 30;
export const DAYTONA_CODEX_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES = 120;
export const DAYTONA_CODEX_MAX_HUMAN_SAVE_RETENTION_MINUTES = 8 * 60;
export const DAYTONA_CODEX_DEFAULT_AUTO_STOP_MINUTES = 30;
export const DAYTONA_CODEX_DEFAULT_AUTO_ARCHIVE_MINUTES = 60;
export const DAYTONA_CODEX_DEFAULT_AUTO_DELETE_MINUTES = 180;

export function defaultDaytonaProviderEphemeralForLifecycleMode(
  lifecycleMode: DaytonaRuntimeTargetLifecycleMode,
): boolean {
  if (lifecycleMode === "per_turn_ephemeral") return true;
  return false;
}

function normalizeModel(value: string | null | undefined): string {
  return String(value ?? "").trim() || DEFAULT_ACTIVE_MODEL_ID;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function readEnv(name: string): string {
  try {
    return String(process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}

function readDaytonaCodexSandboxMode(): DaytonaCodexSandboxMode {
  const value = readEnv("POLYNET_DAYTONA_CODEX_SANDBOX_MODE");
  if (value === "workspace-write") return "workspace-write";
  return "danger-full-access";
}

function buildTurnSandboxPolicy(
  sandboxMode: DaytonaCodexSandboxMode,
): DaytonaCodexTurnSandboxPolicy {
  if (sandboxMode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  return {
    type: "workspaceWrite",
    networkAccess: false,
  };
}

const DAYTONA_CODEX_SANDBOX_MODE = readDaytonaCodexSandboxMode();

export const DAYTONA_RUNTIME_POLICY: DaytonaRuntimePolicy = {
  id: "daytona_codex_runtime_policy_v1",
  nativeCodex: {
    approvalPolicy: "never",
    threadSandbox: DAYTONA_CODEX_SANDBOX_MODE,
    turnSandboxPolicy: buildTurnSandboxPolicy(DAYTONA_CODEX_SANDBOX_MODE),
    webSearch: "live",
    projectDocMaxBytes: 0,
    defaultModelId: DEFAULT_ACTIVE_MODEL_ID,
  },
  workspaceAccess: {
    mode: "native_codex",
    duplicateShellTool: false,
    serveTool: CODEX_WORKSPACE_SERVE_TOOL_NAME,
  },
  daytonaSandbox: {
    workerPort: DAYTONA_CODEX_WORKER_PORT,
    remoteRoot: DAYTONA_CODEX_REMOTE_ROOT,
    workspaceRoot: DAYTONA_CODEX_WORKSPACE_ROOT,
    codexHome: DAYTONA_CODEX_CODEX_HOME,
    publicPreview: false,
    autoStopIntervalMinutes: DAYTONA_CODEX_DEFAULT_AUTO_STOP_MINUTES,
    autoArchiveIntervalMinutes: DAYTONA_CODEX_DEFAULT_AUTO_ARCHIVE_MINUTES,
    autoDeleteIntervalMinutes: DAYTONA_CODEX_DEFAULT_AUTO_DELETE_MINUTES,
    previewLeaseMinutes: DAYTONA_CODEX_DEFAULT_PREVIEW_LEASE_MINUTES,
    humanSaveRetentionMinutes: DAYTONA_CODEX_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES,
    maxHumanSaveRetentionMinutes: DAYTONA_CODEX_MAX_HUMAN_SAVE_RETENTION_MINUTES,
    providerEphemeralByLifecycle: {
      thread_ephemeral: false,
      per_turn_ephemeral: true,
    },
    defaultResources: {
      cpu: 2,
      memory: 4,
      disk: 8,
    },
  },
};

export function renderDaytonaCodexCliConfigToml(params: {
  model: string | null | undefined;
}): string {
  const policy = DAYTONA_RUNTIME_POLICY;
  return [
    `model = ${tomlString(normalizeModel(params.model))}`,
    `approval_policy = ${tomlString(policy.nativeCodex.approvalPolicy)}`,
    `sandbox_mode = ${tomlString(policy.nativeCodex.threadSandbox)}`,
    `project_doc_max_bytes = ${policy.nativeCodex.projectDocMaxBytes}`,
    ...(policy.nativeCodex.turnSandboxPolicy.type === "workspaceWrite"
      ? [
          "",
          "[sandbox_workspace_write]",
          `network_access = ${policy.nativeCodex.turnSandboxPolicy.networkAccess ? "true" : "false"}`,
        ]
      : []),
    "",
  ].join("\n");
}

export function buildDaytonaRuntimePolicyReceipt(): Record<string, unknown> {
  const policy = DAYTONA_RUNTIME_POLICY;
  return {
    id: policy.id,
    native_codex: {
      approval_policy: policy.nativeCodex.approvalPolicy,
      thread_sandbox: policy.nativeCodex.threadSandbox,
      turn_sandbox_policy: {
        type: policy.nativeCodex.turnSandboxPolicy.type,
        ...(policy.nativeCodex.turnSandboxPolicy.type === "workspaceWrite"
          ? { network_access: policy.nativeCodex.turnSandboxPolicy.networkAccess }
          : {}),
      },
      web_search: policy.nativeCodex.webSearch,
      project_doc_max_bytes: policy.nativeCodex.projectDocMaxBytes,
      default_model_id: policy.nativeCodex.defaultModelId,
    },
    workspace_access: {
      mode: policy.workspaceAccess.mode,
      duplicate_shell_tool: policy.workspaceAccess.duplicateShellTool,
      serve_tool: policy.workspaceAccess.serveTool,
    },
    daytona_sandbox: {
      worker_port: policy.daytonaSandbox.workerPort,
      remote_root: policy.daytonaSandbox.remoteRoot,
      workspace_root: policy.daytonaSandbox.workspaceRoot,
      codex_home: policy.daytonaSandbox.codexHome,
      public_preview: policy.daytonaSandbox.publicPreview,
      auto_stop_interval_minutes: policy.daytonaSandbox.autoStopIntervalMinutes,
      auto_archive_interval_minutes: policy.daytonaSandbox.autoArchiveIntervalMinutes,
      auto_delete_interval_minutes: policy.daytonaSandbox.autoDeleteIntervalMinutes,
      preview_lease_minutes: policy.daytonaSandbox.previewLeaseMinutes,
      human_save_retention_minutes: policy.daytonaSandbox.humanSaveRetentionMinutes,
      max_human_save_retention_minutes:
        policy.daytonaSandbox.maxHumanSaveRetentionMinutes,
      provider_ephemeral_by_lifecycle:
        policy.daytonaSandbox.providerEphemeralByLifecycle,
      default_resources: policy.daytonaSandbox.defaultResources,
    },
  };
}
