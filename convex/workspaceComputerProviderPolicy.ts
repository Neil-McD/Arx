import {
  DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
  normalizeWorkspaceComputerProviderId,
  type WorkspaceComputerProviderId,
} from "../shared/workspaceComputerProvider.ts";

export type WorkspaceComputerProviderPolicySource =
  | "default_daytona"
  | "server_configured_daytona"
  | "server_configured_blaxel";

export type WorkspaceComputerProviderPolicyDecision = {
  providerId: WorkspaceComputerProviderId;
  source: WorkspaceComputerProviderPolicySource;
  reason: string;
};

type WorkspaceComputerProviderPolicyInput = {
  serverConfiguredProviderId?: unknown;
  blaxelEnabled?: unknown;
  deploymentKind?: unknown;
};

function normalizeFlag(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

function normalizeDeploymentKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function readServerEnv(name: string): string {
  try {
    const env = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env;
    return String(env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

export function resolveWorkspaceComputerProviderPolicy(
  input: WorkspaceComputerProviderPolicyInput = {},
): WorkspaceComputerProviderPolicyDecision {
  const configured = normalizeWorkspaceComputerProviderId(
    input.serverConfiguredProviderId,
  );

  if (configured === "blaxel") {
    if (!normalizeFlag(input.blaxelEnabled)) {
      return {
        providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
        source: "default_daytona",
        reason: "blaxel_provider_not_enabled",
      };
    }
    if (normalizeDeploymentKind(input.deploymentKind) === "production") {
      return {
        providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
        source: "default_daytona",
        reason: "blaxel_provider_staging_only",
      };
    }
    return {
      providerId: "blaxel",
      source: "server_configured_blaxel",
      reason: "server_configured_provider",
    };
  }

  if (String(input.serverConfiguredProviderId ?? "").trim()) {
    return {
      providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
      source: "server_configured_daytona",
      reason: "server_configured_provider",
    };
  }

  return {
    providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
    source: "default_daytona",
    reason: "default_provider",
  };
}

export function resolveWorkspaceComputerProviderFromServerEnv():
  WorkspaceComputerProviderPolicyDecision {
  return resolveWorkspaceComputerProviderPolicy({
    serverConfiguredProviderId: readServerEnv("POLYNET_WORKSPACE_COMPUTER_PROVIDER"),
    blaxelEnabled: readServerEnv("POLYNET_ENABLE_BLAXEL_WORKSPACE_PROVIDER"),
    deploymentKind: readServerEnv("POLYNET_DEPLOYMENT_KIND"),
  });
}
