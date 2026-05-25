import type {
  WorkspaceComputerProviderFailure,
  WorkspaceComputerProviderOperation,
} from "../shared/workspaceComputerProvider.ts";

export const BLAXEL_WORKSPACE_PROVIDER_DISABLED_CODE =
  "blaxel_provider_not_enabled";

function buildDisabledFailure(
  operation: WorkspaceComputerProviderOperation,
): WorkspaceComputerProviderFailure {
  return {
    ok: false,
    status: 501,
    code: BLAXEL_WORKSPACE_PROVIDER_DISABLED_CODE,
    message: "Blaxel workspace computers are not enabled for this environment.",
    details: {
      operation,
      providerId: "blaxel",
    },
  };
}

export async function ensureBlaxelWorkspaceComputer():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("ensureWorkspaceComputer");
}

export async function resolveBlaxelWorkspaceComputerIfReady():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("resolveWorkspaceComputerIfReady");
}

export async function releaseBlaxelWorkspaceComputerIfIdle():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("releaseWorkspaceComputerIfIdle");
}

export async function destroyBlaxelWorkspaceComputer():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("destroyWorkspaceComputer");
}

export async function executeBlaxelWorkspaceCommand():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("executeWorkspaceCommand");
}

export async function listBlaxelWorkspaceDirectory():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("listWorkspaceDirectory");
}

export async function readBlaxelWorkspaceFile():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("readWorkspaceFile");
}

export async function writeBlaxelWorkspaceFile():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("writeWorkspaceFile");
}

export async function getBlaxelWorkspacePreviewUrl():
  Promise<WorkspaceComputerProviderFailure> {
  return buildDisabledFailure("getWorkspacePreviewUrl");
}
