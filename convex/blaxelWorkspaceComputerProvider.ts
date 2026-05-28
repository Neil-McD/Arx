import {
  destroyBlaxelWorkspaceSandbox,
  ensureBlaxelWorkspaceSandbox,
  executeBlaxelWorkspaceCommand as executeBlaxelWorkspaceClientCommand,
  getBlaxelWorkspacePreviewUrl as getBlaxelWorkspaceClientPreviewUrl,
  inspectBlaxelWorkspaceSandbox,
  listBlaxelWorkspaceDirectory as listBlaxelWorkspaceClientDirectory,
  readBlaxelWorkspaceProcess as readBlaxelWorkspaceClientProcess,
  readBlaxelWorkspaceFile as readBlaxelWorkspaceClientFile,
  releaseBlaxelWorkspaceSandboxIfIdle,
  resolveBlaxelWorkspaceSandboxIfReady,
  stopBlaxelWorkspaceProcess as stopBlaxelWorkspaceClientProcess,
  writeBlaxelWorkspaceFile as writeBlaxelWorkspaceClientFile,
  type BlaxelWorkspaceCommandSpec,
  type BlaxelWorkspaceSandboxSpec,
} from "./blaxelWorkspaceClient.ts";

type EnsureBlaxelWorkspaceComputerParams = BlaxelWorkspaceSandboxSpec;

type BlaxelWorkspaceSandboxNameParams = {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
};

export async function ensureBlaxelWorkspaceComputer(
  params: EnsureBlaxelWorkspaceComputerParams,
) {
  return await ensureBlaxelWorkspaceSandbox(params);
}

export async function resolveBlaxelWorkspaceComputerIfReady(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  return await resolveBlaxelWorkspaceSandboxIfReady(params);
}

export async function inspectBlaxelWorkspaceComputer(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  return await inspectBlaxelWorkspaceSandbox(params);
}

export async function releaseBlaxelWorkspaceComputerIfIdle(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  return await releaseBlaxelWorkspaceSandboxIfIdle(params);
}

export async function destroyBlaxelWorkspaceComputer(
  params: BlaxelWorkspaceSandboxNameParams,
) {
  return await destroyBlaxelWorkspaceSandbox(params);
}

export async function executeBlaxelWorkspaceCommand(
  params: BlaxelWorkspaceCommandSpec,
) {
  return await executeBlaxelWorkspaceClientCommand(params);
}

export async function readBlaxelWorkspaceProcess(
  params: {
    sandboxName: string;
    processName: string;
  },
) {
  return await readBlaxelWorkspaceClientProcess(params);
}

export async function stopBlaxelWorkspaceProcess(
  params: {
    sandboxName: string;
    processName: string;
  },
) {
  return await stopBlaxelWorkspaceClientProcess(params);
}

export async function listBlaxelWorkspaceDirectory(
  params: {
    sandboxName: string;
    path?: string | null;
  },
) {
  return await listBlaxelWorkspaceClientDirectory(params);
}

export async function readBlaxelWorkspaceFile(
  params: {
    sandboxName: string;
    path: string;
  },
) {
  return await readBlaxelWorkspaceClientFile(params);
}

export async function writeBlaxelWorkspaceFile(
  params: {
    sandboxName: string;
    path: string;
    content: string;
  },
) {
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
  return await getBlaxelWorkspaceClientPreviewUrl(params);
}
