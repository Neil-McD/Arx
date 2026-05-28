import {
  DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
  normalizeWorkspaceComputerProviderId,
  type WorkspaceComputerProviderId,
} from "../shared/workspaceComputerProvider.ts";

export type WorkspaceComputerProviderPolicySource =
  | "default_blaxel"
  | "server_configured_blaxel";

export type WorkspaceComputerProviderPolicyDecision = {
  providerId: WorkspaceComputerProviderId;
  source: WorkspaceComputerProviderPolicySource;
  reason: string;
};

type WorkspaceComputerProviderPolicyInput = {
  serverConfiguredProviderId?: unknown;
};

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
    return {
      providerId: "blaxel",
      source: "server_configured_blaxel",
      reason: "server_configured_provider",
    };
  }

  if (String(input.serverConfiguredProviderId ?? "").trim()) {
    return {
      providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
      source: "default_blaxel",
      reason: "unsupported_provider_ignored",
    };
  }

  return {
    providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID,
    source: "default_blaxel",
    reason: "default_provider",
  };
}

export function resolveWorkspaceComputerProviderFromServerEnv():
  WorkspaceComputerProviderPolicyDecision {
  return resolveWorkspaceComputerProviderPolicy({
    serverConfiguredProviderId: readServerEnv("POLYNET_WORKSPACE_COMPUTER_PROVIDER"),
  });
}
