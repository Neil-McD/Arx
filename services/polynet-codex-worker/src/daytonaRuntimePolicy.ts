type DaytonaRuntimePolicy = {
  id: string;
  nativeCodex: {
    approvalPolicy: "never";
    threadSandbox: "workspace-write";
    turnSandboxPolicy: {
      type: "workspaceWrite";
      networkAccess: false;
    };
    webSearch: "live";
    projectDocMaxBytes: 0;
  };
  workspaceTools: {
    shellTool: "workspace_bash";
    shellAccess: "full";
    shellNetworkAccess: "provider_default";
    shellNetworkAudit: "polynet_runtime_events";
    serveTool: "workspace_serve";
  };
  daytonaSandbox: {
    publicPreview: false;
    autoStopIntervalMinutes: 10;
    ephemeral: true;
    defaultResources: {
      cpu: 2;
      memory: 4;
      disk: 8;
    };
  };
};

function normalizeModel(value: string | null | undefined): string {
  return String(value ?? "").trim() || "gpt-5.5";
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export const DAYTONA_RUNTIME_POLICY: DaytonaRuntimePolicy = {
  id: "daytona_codex_runtime_policy_v1",
  nativeCodex: {
    approvalPolicy: "never",
    threadSandbox: "workspace-write",
    turnSandboxPolicy: {
      type: "workspaceWrite",
      networkAccess: false,
    },
    webSearch: "live",
    projectDocMaxBytes: 0,
  },
  workspaceTools: {
    shellTool: "workspace_bash",
    shellAccess: "full",
    shellNetworkAccess: "provider_default",
    shellNetworkAudit: "polynet_runtime_events",
    serveTool: "workspace_serve",
  },
  daytonaSandbox: {
    publicPreview: false,
    autoStopIntervalMinutes: 10,
    ephemeral: true,
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
    "",
    "[sandbox_workspace_write]",
    `network_access = ${policy.nativeCodex.turnSandboxPolicy.networkAccess ? "true" : "false"}`,
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
        network_access: policy.nativeCodex.turnSandboxPolicy.networkAccess,
      },
      web_search: policy.nativeCodex.webSearch,
      project_doc_max_bytes: policy.nativeCodex.projectDocMaxBytes,
    },
    workspace_tools: {
      shell_tool: policy.workspaceTools.shellTool,
      shell_access: policy.workspaceTools.shellAccess,
      shell_network_access: policy.workspaceTools.shellNetworkAccess,
      shell_network_audit: policy.workspaceTools.shellNetworkAudit,
      serve_tool: policy.workspaceTools.serveTool,
    },
    daytona_sandbox: {
      public_preview: policy.daytonaSandbox.publicPreview,
      auto_stop_interval_minutes: policy.daytonaSandbox.autoStopIntervalMinutes,
      ephemeral: policy.daytonaSandbox.ephemeral,
      default_resources: policy.daytonaSandbox.defaultResources,
    },
  };
}
