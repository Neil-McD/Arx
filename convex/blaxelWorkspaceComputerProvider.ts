import type {
  WorkspaceComputerProviderFailure,
  WorkspaceComputerProviderOperation,
} from "../shared/workspaceComputerProvider.ts";
import {
  destroyBlaxelWorkspaceSandbox,
  ensureBlaxelWorkspaceSandbox,
  executeBlaxelWorkspaceCommand as executeBlaxelWorkspaceClientCommand,
  getBlaxelWorkspacePreviewUrl as getBlaxelWorkspaceClientPreviewUrl,
  inspectBlaxelWorkspaceSandbox,
  listBlaxelWorkspaceDirectory as listBlaxelWorkspaceClientDirectory,
  readBlaxelWorkspaceFile as readBlaxelWorkspaceClientFile,
  releaseBlaxelWorkspaceSandboxIfIdle,
  resolveBlaxelWorkspaceSandboxIfReady,
  writeBlaxelWorkspaceFile as writeBlaxelWorkspaceClientFile,
  type BlaxelWorkspaceCommandSpec,
  type BlaxelWorkspaceSandboxSpec,
} from "./blaxelWorkspaceClient.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";

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

type EnsureBlaxelWorkspaceComputerParams = BlaxelWorkspaceSandboxSpec;

type BlaxelWorkspaceSandboxNameParams = {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
};

function isBlaxelProviderEnabled(): boolean {
  return resolveWorkspaceComputerProviderFromServerEnv().providerId === "blaxel";
}

export async function ensureBlaxelWorkspaceComputer(
  params: EnsureBlaxelWorkspaceComputerParams,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("ensureWorkspaceComputer");
  }
  return await ensureBlaxelWorkspaceSandbox(params);
}

export async function resolveBlaxelWorkspaceComputerIfReady(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("resolveWorkspaceComputerIfReady");
  }
  return await resolveBlaxelWorkspaceSandboxIfReady(params);
}

export async function inspectBlaxelWorkspaceComputer(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("resolveWorkspaceComputerIfReady");
  }
  return await inspectBlaxelWorkspaceSandbox(params);
}

export async function releaseBlaxelWorkspaceComputerIfIdle(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("releaseWorkspaceComputerIfIdle");
  }
  return await releaseBlaxelWorkspaceSandboxIfIdle(params);
}

export async function destroyBlaxelWorkspaceComputer(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("destroyWorkspaceComputer");
  }
  return await destroyBlaxelWorkspaceSandbox(params);
}

export async function executeBlaxelWorkspaceCommand(
  params: BlaxelWorkspaceCommandSpec,
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("executeWorkspaceCommand");
  }
  return await executeBlaxelWorkspaceClientCommand(params);
}

export async function listBlaxelWorkspaceDirectory(
  params: {
    sandboxName: string;
    path?: string | null;
  },
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("listWorkspaceDirectory");
  }
  return await listBlaxelWorkspaceClientDirectory(params);
}

export async function readBlaxelWorkspaceFile(
  params: {
    sandboxName: string;
    path: string;
  },
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("readWorkspaceFile");
  }
  return await readBlaxelWorkspaceClientFile(params);
}

export async function writeBlaxelWorkspaceFile(
  params: {
    sandboxName: string;
    path: string;
    content: string;
  },
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("writeWorkspaceFile");
  }
  return await writeBlaxelWorkspaceClientFile(params);
}

export async function getBlaxelWorkspacePreviewUrl(
  params: {
    sandboxName: string;
    port: number;
    previewName?: string | null;
    public?: boolean | null;
  },
) {
  if (!isBlaxelProviderEnabled()) {
    return buildDisabledFailure("getWorkspacePreviewUrl");
  }
  return await getBlaxelWorkspaceClientPreviewUrl(params);
}
