import type {
  WorkspaceComputerProviderFailure,
  WorkspaceComputerProviderSession,
} from "../shared/workspaceComputerProvider.ts";

export const BLAXEL_WORKSPACE_ROOT = "/workspace";

export type BlaxelWorkspaceConfig = {
  workspace: string;
  apiKey: string;
  image: string;
  memoryMb: number;
  region: string;
  volumeSizeMb: number;
  workspaceRoot: string;
  idleDeleteAfter: string;
  maxAgeDeleteAfter: string;
};

export type BlaxelWorkspaceSandboxSpec = {
  sandboxName: string;
  volumeName?: string | null;
  image?: string | null;
  memoryMb?: number | null;
  region?: string | null;
  workspaceRoot?: string | null;
  volumeSizeMb?: number | null;
  ports?: Array<{ name?: string; target: number; protocol?: "HTTP" | "TCP" }>;
  labels?: Record<string, string>;
};

export type BlaxelWorkspaceCommandSpec = {
  sandboxName: string;
  command: string;
  cwd?: string | null;
  processName?: string | null;
  timeoutSeconds?: number | null;
  waitForCompletion?: boolean | null;
};

export type BlaxelWorkspaceCommandResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      providerCommandId: string | null;
      status: string | null;
      exitCode: number | null;
      stdout: string | null;
      stderr: string | null;
      raw: unknown;
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspaceDirectoryResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      path: string;
      entries: unknown;
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspaceFileResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      path: string;
      content: string;
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspacePreviewResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      port: number;
      url: string;
      raw: unknown;
    }
  | WorkspaceComputerProviderFailure;

type BlaxelCoreModule = typeof import("@blaxel/core");

type SafeBlaxelErrorDetails = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeWorkspaceRoot(value: unknown): string {
  const raw = normalizeOptionalString(value) ?? BLAXEL_WORKSPACE_ROOT;
  if (raw.includes("\0")) throw new Error("invalid_workspace_root");
  const normalized = raw.replace(/\/+/g, "/").replace(/\/+$/g, "") || "/";
  const segments = normalized.split("/").filter(Boolean);
  if (
    !normalized.startsWith("/") ||
    normalized === "/" ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("invalid_workspace_root");
  }
  return normalized;
}

export function normalizeBlaxelWorkspacePath(
  rawPath: unknown,
  workspaceRoot: unknown = BLAXEL_WORKSPACE_ROOT,
): string {
  const root = normalizeWorkspaceRoot(workspaceRoot);
  const raw = String(rawPath ?? ".").trim() || ".";
  if (raw.includes("\0")) throw new Error("workspace_path_outside_root");
  const normalizedRaw = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
  const rootPrefix = `${root}/`;
  const relative =
    normalizedRaw === root
      ? "."
      : normalizedRaw.startsWith(rootPrefix)
        ? normalizedRaw.slice(rootPrefix.length)
        : normalizedRaw.startsWith("/")
          ? null
          : normalizedRaw;
  if (relative === null) throw new Error("workspace_path_outside_root");
  const segments = String(relative)
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error("workspace_path_outside_root");
  }
  return segments.length === 0 ? root : `${root}/${segments.join("/")}`;
}

function failure(params: {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): WorkspaceComputerProviderFailure {
  return {
    ok: false,
    status: params.status,
    code: params.code,
    message: params.message,
    ...(params.details ? { details: params.details } : null),
  };
}

function invalidWorkspacePathFailure(): WorkspaceComputerProviderFailure {
  return failure({
    status: 400,
    code: "workspace_path_outside_root",
    message: "Workspace path is outside the Blaxel workspace root.",
  });
}

export function loadBlaxelWorkspaceConfig():
  | { ok: true; config: BlaxelWorkspaceConfig }
  | WorkspaceComputerProviderFailure {
  const workspace = readEnv("BL_WORKSPACE");
  const apiKey = readEnv("BL_API_KEY");
  if (!workspace || !apiKey) {
    return failure({
      status: 503,
      code: "blaxel_credentials_missing",
      message: "Blaxel workspace provider is unavailable. Missing BL_WORKSPACE or BL_API_KEY.",
    });
  }
  return {
    ok: true,
    config: {
      workspace,
      apiKey,
      image: readEnv("BLAXEL_WORKSPACE_IMAGE") || "blaxel/base-image:latest",
      memoryMb: readPositiveIntegerEnv("BLAXEL_WORKSPACE_MEMORY_MB", 4096),
      region: readEnv("BLAXEL_WORKSPACE_REGION") || "us-pdx-1",
      volumeSizeMb: readPositiveIntegerEnv("BLAXEL_WORKSPACE_VOLUME_SIZE_MB", 8192),
      workspaceRoot: readEnv("BLAXEL_WORKSPACE_ROOT") || BLAXEL_WORKSPACE_ROOT,
      idleDeleteAfter: readEnv("BLAXEL_WORKSPACE_IDLE_DELETE_AFTER") || "1h",
      maxAgeDeleteAfter: readEnv("BLAXEL_WORKSPACE_MAX_AGE_DELETE_AFTER") || "2h",
    },
  };
}

function describeError(error: unknown): string {
  const details = sanitizeBlaxelErrorDetails(error);
  const message = [
    details.errorName,
    details.errorMessage,
    details.providerCode,
    Number.isFinite(details.responseStatus) ? `status:${details.responseStatus}` : null,
  ].filter(Boolean).join(": ");
  return message || "Blaxel provider error";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function redactSensitiveText(value: string): string {
  const clipped = value.slice(0, 500);
  if (/(authorization|api[_-]?key|x-api-key|token|secret|headers|config|bearer\s+)/i.test(clipped)) {
    return "[redacted_provider_error]";
  }
  return clipped;
}

function safeText(value: unknown): string | undefined {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, 500);
  }
  return undefined;
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sanitizeBlaxelErrorDetails(error: unknown): SafeBlaxelErrorDetails {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  return {
    errorName:
      error instanceof Error
        ? safeText(error.name)
        : safeText(record?.name),
    errorMessage:
      error instanceof Error
        ? safeText(error.message)
        : safeText(record?.message) ??
          safeText(record?.error) ??
          safeText(responseData?.message) ??
          safeText(responseData?.error),
    responseStatus: safeNumber(record?.status ?? record?.statusCode ?? response?.status),
    providerCode: safeText(record?.code ?? responseData?.code),
  };
}

function classifyBlaxelError(error: unknown): WorkspaceComputerProviderFailure {
  const message = describeError(error);
  const details = sanitizeBlaxelErrorDetails(error);
  if (/quota exceeded|0\/0 volumes|volume quota/i.test(message)) {
    return failure({
      status: 402,
      code: "blaxel_volume_quota_exceeded",
      message: "Blaxel volume quota is exhausted or not enabled for this workspace.",
      details,
    });
  }
  if (/404|not found|not_found|does not exist/i.test(message)) {
    return failure({
      status: 404,
      code: "blaxel_sandbox_not_found",
      message: "Blaxel sandbox not found.",
      details,
    });
  }
  if (/wait|timeout|not ready|starting|pending/i.test(message)) {
    return failure({
      status: 503,
      code: "blaxel_sandbox_not_ready",
      message: "Blaxel sandbox is not ready.",
      details,
    });
  }
  return failure({
    status: 503,
    code: "blaxel_request_failed",
    message: "Blaxel workspace provider request failed.",
    details,
  });
}

async function loadBlaxelCore():
  Promise<{ ok: true; mod: BlaxelCoreModule } | WorkspaceComputerProviderFailure> {
  try {
    const mod = await import("@blaxel/core");
    if (!mod.SandboxInstance) {
      return failure({
        status: 500,
        code: "blaxel_sdk_unavailable",
        message: "Blaxel SDK did not export SandboxInstance.",
      });
    }
    return { ok: true, mod };
  } catch (error) {
    return failure({
      status: 500,
      code: "blaxel_sdk_unavailable",
      message: "Blaxel SDK could not be loaded.",
      details: sanitizeBlaxelErrorDetails(error),
    });
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return /exist|already/i.test(describeError(error));
}

async function ensureBlaxelWorkspaceRootDirectory(
  sandbox: any,
  workspaceRoot: string,
) {
  try {
    await sandbox.fs.mkdir(workspaceRoot);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      // Best effort. Some mounted volumes already exist but do not report mkdir
      // idempotently through the SDK.
    }
  }
}

function sandboxIdFrom(sandbox: any, fallbackName: string): string {
  return (
    normalizeOptionalString(sandbox?.metadata?.name) ??
    normalizeOptionalString(sandbox?.name) ??
    fallbackName
  );
}

function commandIdFrom(command: any, fallbackName: string | null): string | null {
  return (
    normalizeOptionalString(command?.identifier) ??
    normalizeOptionalString(command?.name) ??
    normalizeOptionalString(command?.metadata?.name) ??
    fallbackName
  );
}

function statusFrom(value: any): string | null {
  return normalizeOptionalString(value?.status);
}

function exitCodeFrom(value: any): number | null {
  const parsed = Number(value?.exitCode ?? value?.exit_code);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSandboxCreateSpec(
  params: BlaxelWorkspaceSandboxSpec,
  config: BlaxelWorkspaceConfig,
) {
  const sandboxName = normalizeOptionalString(params.sandboxName);
  if (!sandboxName) throw new Error("blaxel_sandbox_name_required");
  const workspaceRoot = normalizeOptionalString(params.workspaceRoot) ?? config.workspaceRoot;
  const volumeName = normalizeOptionalString(params.volumeName);
  return {
    name: sandboxName,
    image: normalizeOptionalString(params.image) ?? config.image,
    memory: normalizePositiveInteger(params.memoryMb, config.memoryMb),
    region: normalizeOptionalString(params.region) ?? config.region,
    ...(Array.isArray(params.ports) && params.ports.length > 0
      ? { ports: params.ports }
      : null),
    ...(volumeName
      ? {
          volumes: [
            {
              name: volumeName,
              mountPath: workspaceRoot,
              readOnly: false,
            },
          ],
        }
      : null),
    lifecycle: {
      expirationPolicies: [
        { type: "ttl-idle" as const, value: config.idleDeleteAfter, action: "delete" as const },
        { type: "ttl-max-age" as const, value: config.maxAgeDeleteAfter, action: "delete" as const },
      ],
    },
    labels: {
      owner: "polynet",
      provider: "blaxel",
      ...(params.labels ?? {}),
    },
  };
}

export async function ensureBlaxelWorkspaceSandbox(
  params: BlaxelWorkspaceSandboxSpec,
): Promise<WorkspaceComputerProviderSession | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (!loadedConfig.ok) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  const { SandboxInstance, VolumeInstance } = loadedCore.mod;
  const config = loadedConfig.config;
  const sandboxName = normalizeString(params.sandboxName);
  const volumeName = normalizeOptionalString(params.volumeName);
  const workspaceRoot = normalizeOptionalString(params.workspaceRoot) ?? config.workspaceRoot;

  try {
    if (volumeName) {
      await VolumeInstance.createIfNotExists({
        name: volumeName,
        size: normalizePositiveInteger(params.volumeSizeMb, config.volumeSizeMb),
        region: normalizeOptionalString(params.region) ?? config.region,
        labels: {
          owner: "polynet",
          provider: "blaxel",
          ...(params.labels ?? {}),
        },
      });
    }
    const sandbox = await SandboxInstance.createIfNotExists(
      buildSandboxCreateSpec(params, config),
    );
    if (typeof sandbox?.wait === "function") {
      await sandbox.wait({ maxWait: 120_000, interval: 2_000 });
    }
    await ensureBlaxelWorkspaceRootDirectory(sandbox, workspaceRoot);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: sandboxIdFrom(sandbox, sandboxName),
      projectVolumeId: volumeName,
      workspaceRoot,
      startedAt: Date.now(),
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function resolveBlaxelWorkspaceSandboxIfReady(params: {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
}): Promise<WorkspaceComputerProviderSession | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (!loadedConfig.ok) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  const sandboxName = normalizeString(params.sandboxName);
  const workspaceRoot =
    normalizeOptionalString(params.workspaceRoot) ?? loadedConfig.config.workspaceRoot;
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(sandboxName);
    if (typeof sandbox?.wait === "function") {
      await sandbox.wait({ maxWait: 120_000, interval: 2_000 });
    }
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: sandboxIdFrom(sandbox, sandboxName),
      projectVolumeId: normalizeOptionalString(params.volumeName),
      workspaceRoot,
      startedAt: Date.now(),
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function destroyBlaxelWorkspaceSandbox(params: {
  sandboxName: string;
}): Promise<{ ok: true; providerId: "blaxel"; providerSandboxId: string } | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (!loadedConfig.ok) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  const sandboxName = normalizeString(params.sandboxName);
  try {
    await loadedCore.mod.SandboxInstance.delete(sandboxName);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: sandboxName,
    };
  } catch (error) {
    const failed = classifyBlaxelError(error);
    if (failed.code === "blaxel_sandbox_not_found") {
      return { ok: true, providerId: "blaxel", providerSandboxId: sandboxName };
    }
    return failed;
  }
}

export async function releaseBlaxelWorkspaceSandboxIfIdle(params: {
  sandboxName: string;
}): Promise<{ ok: true; providerId: "blaxel"; providerSandboxId: string; mode: "provider_standby" } | WorkspaceComputerProviderFailure> {
  return {
    ok: true,
    providerId: "blaxel",
    providerSandboxId: normalizeString(params.sandboxName),
    mode: "provider_standby",
  };
}

export async function executeBlaxelWorkspaceCommand(
  params: BlaxelWorkspaceCommandSpec,
): Promise<BlaxelWorkspaceCommandResult> {
  const resolved = await resolveBlaxelWorkspaceSandboxIfReady({
    sandboxName: params.sandboxName,
  });
  if (!resolved.ok) return resolved;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  const sandboxName = normalizeString(params.sandboxName);
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(sandboxName);
    const processName =
      normalizeOptionalString(params.processName) ??
      `polynet-command-${crypto.randomUUID().slice(0, 8)}`;
    let workingDir: string | null = null;
    try {
      workingDir = params.cwd
        ? normalizeBlaxelWorkspacePath(params.cwd, resolved.workspaceRoot)
        : null;
    } catch {
      return invalidWorkspacePathFailure();
    }
    const result = await sandbox.process.exec({
      name: processName,
      command: params.command,
      ...(workingDir ? { workingDir } : null),
      waitForCompletion: params.waitForCompletion ?? true,
      timeout: normalizePositiveInteger(params.timeoutSeconds, 60),
    });
    const providerCommandId = commandIdFrom(result, processName);
    let stdout: string | null = null;
    let stderr: string | null = null;
    if (providerCommandId) {
      try {
        stdout = await sandbox.process.logs(providerCommandId, "stdout");
      } catch {
        stdout = null;
      }
      try {
        stderr = await sandbox.process.logs(providerCommandId, "stderr");
      } catch {
        stderr = null;
      }
    }
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      providerCommandId,
      status: statusFrom(result),
      exitCode: exitCodeFrom(result),
      stdout,
      stderr,
      raw: result,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function listBlaxelWorkspaceDirectory(params: {
  sandboxName: string;
  path?: string | null;
}): Promise<BlaxelWorkspaceDirectoryResult> {
  const resolved = await resolveBlaxelWorkspaceSandboxIfReady({
    sandboxName: params.sandboxName,
  });
  if (!resolved.ok) return resolved;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  let directoryPath: string;
  try {
    directoryPath = normalizeBlaxelWorkspacePath(
      params.path ?? ".",
      resolved.workspaceRoot,
    );
  } catch {
    return invalidWorkspacePathFailure();
  }
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(params.sandboxName);
    const entries = await sandbox.fs.ls(directoryPath);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: directoryPath,
      entries,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function readBlaxelWorkspaceFile(params: {
  sandboxName: string;
  path: string;
}): Promise<BlaxelWorkspaceFileResult> {
  const resolved = await resolveBlaxelWorkspaceSandboxIfReady({
    sandboxName: params.sandboxName,
  });
  if (!resolved.ok) return resolved;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  let filePath: string;
  try {
    filePath = normalizeBlaxelWorkspacePath(params.path, resolved.workspaceRoot);
  } catch {
    return invalidWorkspacePathFailure();
  }
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(params.sandboxName);
    const content = await sandbox.fs.read(filePath);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: filePath,
      content: String(content),
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function writeBlaxelWorkspaceFile(params: {
  sandboxName: string;
  path: string;
  content: string;
}): Promise<{ ok: true; providerId: "blaxel"; providerSandboxId: string; path: string } | WorkspaceComputerProviderFailure> {
  const resolved = await resolveBlaxelWorkspaceSandboxIfReady({
    sandboxName: params.sandboxName,
  });
  if (!resolved.ok) return resolved;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  let filePath: string;
  try {
    filePath = normalizeBlaxelWorkspacePath(params.path, resolved.workspaceRoot);
  } catch {
    return invalidWorkspacePathFailure();
  }
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(params.sandboxName);
    await sandbox.fs.write(filePath, params.content);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: filePath,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function getBlaxelWorkspacePreviewUrl(params: {
  sandboxName: string;
  port: number;
  previewName?: string | null;
  public?: boolean | null;
}): Promise<BlaxelWorkspacePreviewResult> {
  const resolved = await resolveBlaxelWorkspaceSandboxIfReady({
    sandboxName: params.sandboxName,
  });
  if (!resolved.ok) return resolved;
  const loadedCore = await loadBlaxelCore();
  if (!loadedCore.ok) return loadedCore;
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(params.sandboxName);
    const preview = await sandbox.previews.createIfNotExists({
      metadata: {
        name: normalizeOptionalString(params.previewName) ?? `port-${params.port}`,
      },
      spec: {
        port: params.port,
        public: params.public ?? false,
      },
    });
    const url = normalizeOptionalString(preview?.spec?.url);
    if (!url) {
      return failure({
        status: 503,
        code: "blaxel_preview_url_missing",
        message: "Blaxel preview URL is missing.",
      });
    }
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      port: params.port,
      url,
      raw: preview,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}
