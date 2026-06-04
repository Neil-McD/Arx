import type {
  WorkspaceComputerLifecycleIntent,
  WorkspaceComputerProviderFailure,
  WorkspaceComputerProviderSession,
} from "../shared/workspaceComputerProvider.ts";
import {
  BLAXEL_AUTO_STANDBY_GRACE_SECONDS,
  WORKSPACE_COMPUTER_LIFECYCLE_POLICY,
  compareWorkspaceComputerLifecycleIntents,
  isWorkspaceComputerLifecycleIntent,
  normalizeWorkspaceComputerLifecycleIntent,
  resolveStrongestWorkspaceComputerLifecycleIntent,
} from "../shared/workspaceComputerProvider.ts";

export const BLAXEL_WORKSPACE_ROOT = "/workspace";

export type BlaxelWorkspaceConfig = {
  workspace: string;
  apiKey: string;
  image: string;
  memoryMb: number;
  region: string;
  volumeSizeMb: number;
  providerVolumeLimit: number | null;
  providerVolumeSafetyBuffer: number;
  workspaceRoot: string;
  fileInspectionIdleDeleteAfter: string;
  agentRunIdleDeleteAfter: string;
  interactiveIdleDeleteAfter: string;
  nonAgentMaxAgeDeleteAfter: string;
};

export type BlaxelWorkspaceSandboxSpec = {
  sandboxName: string;
  volumeName?: string | null;
  image?: string | null;
  memoryMb?: number | null;
  region?: string | null;
  workspaceRoot?: string | null;
  volumeSizeMb?: number | null;
  lifecycleIntent?: WorkspaceComputerLifecycleIntent | null;
  ports?: Array<{ name?: string; target: number; protocol?: "HTTP" | "TCP" }>;
  labels?: Record<string, string>;
};

export type BlaxelWorkspaceExpirationPolicy = {
  type: "ttl-idle" | "ttl-max-age" | "date";
  value: string;
  action: "delete";
};

export type BlaxelWorkspaceLifecyclePolicy = {
  intent: WorkspaceComputerLifecycleIntent;
  expirationPolicies: BlaxelWorkspaceExpirationPolicy[];
  allowActiveRunPastMaxAge: boolean;
};

export type BlaxelWorkspaceLifecycleConfig = Pick<
  BlaxelWorkspaceConfig,
  | "fileInspectionIdleDeleteAfter"
  | "agentRunIdleDeleteAfter"
  | "interactiveIdleDeleteAfter"
  | "nonAgentMaxAgeDeleteAfter"
>;

export type BlaxelSandboxLifecycleState = {
  labelIntent: WorkspaceComputerLifecycleIntent | null;
  inferredIntent: WorkspaceComputerLifecycleIntent | null;
  effectiveIntent: WorkspaceComputerLifecycleIntent;
  expirationPolicies: BlaxelWorkspaceExpirationPolicy[];
  policyMatchesEffectiveIntent: boolean;
  labelMatchesEffectiveIntent: boolean;
};

export type BlaxelWorkspaceCommandSpec = {
  sandboxName: string;
  command: string;
  cwd?: string | null;
  env?: Record<string, string> | null;
  processName?: string | null;
  timeoutSeconds?: number | null;
  readyRetryMs?: number | null;
  waitForCompletion?: boolean | null;
  waitForPorts?: number[] | null;
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

export type BlaxelWorkspaceProcessResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      providerProcessId: string;
      status: string | null;
      exitCode: number | null;
      stdout: string | null;
      stderr: string | null;
      logs: string | null;
      raw: unknown;
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspaceProcessStopResult =
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      providerProcessId: string;
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

export type BlaxelWorkspaceSandboxInspectionResult =
  | {
      ok: true;
      providerId: "blaxel";
      sandboxName: string;
      providerSandboxId: string;
      projectVolumeId: string | null;
      workspaceRoot: string;
      exists: true;
      state: string | null;
      url: string | null;
      lifecycleState: BlaxelSandboxLifecycleState;
    }
  | {
      ok: true;
      providerId: "blaxel";
      sandboxName: string;
      providerSandboxId: string;
      projectVolumeId: string | null;
      workspaceRoot: string;
      exists: false;
      state: "missing";
      missingReason: "not_found";
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspaceInventoryResource = {
  name: string;
  status: string | null;
  providerId: "blaxel";
  kind: "sandbox" | "volume";
  labels: Record<string, string>;
  region: string | null;
  sizeMb: number | null;
  attachedTo: string | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
};

export type BlaxelWorkspaceInventoryListResult =
  | {
      ok: true;
      providerId: "blaxel";
      kind: "sandbox" | "volume";
      resources: BlaxelWorkspaceInventoryResource[];
      rawCount: number;
    }
  | WorkspaceComputerProviderFailure;

export type BlaxelWorkspaceVolumeQuotaSnapshot =
  | {
      ok: true;
      providerId: "blaxel";
      providerVolumeCount: number;
      providerVolumeLimit: number | null;
      providerVolumeSafetyBuffer: number;
      source: "provider_inventory_configured_limit" | "provider_inventory_no_limit";
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

function readOptionalPositiveIntegerEnv(name: string): number | null {
  const raw = readEnv(name);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function normalizeCommandEnv(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) return null;
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    const normalizedKey = key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedKey)) continue;
    out[normalizedKey] = String(rawValue ?? "");
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeBlaxelPreviewName(value: unknown, fallbackPort: number): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || `port-${fallbackPort}`;
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

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

type BlaxelWorkspacePathGuardKind = "directory" | "file" | "writable_file";

function blaxelWorkspacePathGuardFailure(
  code: string,
): WorkspaceComputerProviderFailure {
  if (code === "missing") {
    return failure({
      status: 404,
      code: "workspace_path_not_found",
      message: "Workspace path not found.",
    });
  }
  if (code === "not_directory") {
    return failure({
      status: 400,
      code: "workspace_path_not_directory",
      message: "Workspace path is not a directory.",
    });
  }
  if (code === "not_file") {
    return failure({
      status: 400,
      code: "workspace_path_not_file",
      message: "Workspace path is not a regular file.",
    });
  }
  if (code === "symlink") {
    return failure({
      status: 400,
      code: "workspace_symlink_not_supported",
      message: "Workspace symlinks are not supported by Blaxel file operations.",
    });
  }
  if (code === "unresolved") {
    return failure({
      status: 400,
      code: "workspace_path_unresolved",
      message: "Workspace path could not be resolved safely.",
    });
  }
  return invalidWorkspacePathFailure();
}

export function buildBlaxelWorkspacePathGuardCommand(params: {
  workspaceRoot: string;
  path: string;
  kind: BlaxelWorkspacePathGuardKind;
}): string {
  return [
    "set -f;",
    `root=${shellQuote(params.workspaceRoot)};`,
    `safe_path=${shellQuote(params.path)};`,
    `kind=${shellQuote(params.kind)};`,
    'resolved_root="$( { realpath -- "$root" 2>/dev/null || readlink -f -- "$root" 2>/dev/null || true; } | sed -n "1p" )";',
    'if [ -z "$resolved_root" ]; then printf unresolved; exit 0; fi;',
    'case "$safe_path" in "$root"|"$root"/*) ;; *) printf outside; exit 0;; esac;',
    'rel="${safe_path#"$root"}";',
    'rel="${rel#/}";',
    'abs="$root";',
    'if [ -n "$rel" ]; then',
    '  old_ifs="$IFS"; IFS="/"; set -- $rel; IFS="$old_ifs";',
    '  for part do',
    '    [ -n "$part" ] || continue;',
    '    abs="$abs/$part";',
    '    if [ -L "$abs" ]; then printf symlink; exit 0; fi;',
    "  done;",
    "fi;",
    'if [ "$kind" = "writable_file" ]; then',
    '  if [ -e "$abs" ] && [ ! -f "$abs" ]; then printf not_file; exit 0; fi;',
    '  if [ -e "$abs" ]; then',
    '    resolved="$( { realpath -- "$abs" 2>/dev/null || readlink -f -- "$abs" 2>/dev/null || true; } | sed -n "1p" )";',
    '    if [ -z "$resolved" ]; then printf unresolved; exit 0; fi;',
    '    case "$resolved" in "$resolved_root"|"$resolved_root"/*) ;; *) printf outside; exit 0;; esac;',
    "  fi;",
    '  printf "ok\\t%s" "$abs";',
    "  exit 0;",
    "fi;",
    'if [ ! -e "$abs" ]; then printf missing; exit 0; fi;',
    'resolved="$( { realpath -- "$abs" 2>/dev/null || readlink -f -- "$abs" 2>/dev/null || true; } | sed -n "1p" )";',
    'if [ -z "$resolved" ]; then printf unresolved; exit 0; fi;',
    'case "$resolved" in "$resolved_root"|"$resolved_root"/*) ;; *) printf outside; exit 0;; esac;',
    'if [ "$kind" = "directory" ] && [ ! -d "$abs" ]; then printf not_directory; exit 0; fi;',
    'if [ "$kind" = "file" ] && [ ! -f "$abs" ]; then printf not_file; exit 0; fi;',
    'printf "ok\\t%s" "$resolved";',
  ].join(" ");
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
      volumeSizeMb: readPositiveIntegerEnv("BLAXEL_WORKSPACE_VOLUME_SIZE_MB", 2048),
      providerVolumeLimit: readOptionalPositiveIntegerEnv("BLAXEL_WORKSPACE_VOLUME_LIMIT"),
      providerVolumeSafetyBuffer: readNonNegativeIntegerEnv(
        "BLAXEL_WORKSPACE_VOLUME_SAFETY_BUFFER",
        1,
      ),
      workspaceRoot: readEnv("BLAXEL_WORKSPACE_ROOT") || BLAXEL_WORKSPACE_ROOT,
      fileInspectionIdleDeleteAfter:
        readEnv("BLAXEL_WORKSPACE_FILE_INSPECTION_IDLE_DELETE_AFTER") ||
        WORKSPACE_COMPUTER_LIFECYCLE_POLICY.file_inspection.idleDeleteAfter,
      agentRunIdleDeleteAfter:
        readEnv("BLAXEL_WORKSPACE_AGENT_RUN_IDLE_DELETE_AFTER") ||
        WORKSPACE_COMPUTER_LIFECYCLE_POLICY.agent_run.idleDeleteAfter,
      interactiveIdleDeleteAfter:
        readEnv("BLAXEL_WORKSPACE_INTERACTIVE_IDLE_DELETE_AFTER") ||
        WORKSPACE_COMPUTER_LIFECYCLE_POLICY.interactive.idleDeleteAfter,
      nonAgentMaxAgeDeleteAfter:
        readEnv("BLAXEL_WORKSPACE_NON_AGENT_MAX_AGE_DELETE_AFTER") ||
        WORKSPACE_COMPUTER_LIFECYCLE_POLICY.interactive.maxAgeDeleteAfter,
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
  if (
    /quota exceeded|0\/0 volumes|volume quota|total volume size|maximum allowed total size|exceeds maximum allowed/i.test(
      message,
    )
  ) {
    return failure({
      status: 402,
      code: "blaxel_volume_quota_exceeded",
      message: "Blaxel workspace storage quota is exhausted or not enabled for this workspace.",
      details,
    });
  }
  if (/WORKLOAD_UNAVAILABLE|currently not available|temporarily unavailable|not ready|starting|pending/i.test(message)) {
    return failure({
      status: 503,
      code: "blaxel_sandbox_not_ready",
      message: "Blaxel sandbox is not ready.",
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
  if (/wait|timeout/i.test(message)) {
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
    if (!mod.VolumeInstance) {
      return failure({
        status: 500,
        code: "blaxel_sdk_unavailable",
        message: "Blaxel SDK did not export VolumeInstance.",
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

function isTransientVolumeDeleteError(error: unknown): boolean {
  return /attach|detach|mount|busy|in use|locked|conflict|409|still/i.test(
    describeError(error),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sandboxStateFrom(sandbox: any): string | null {
  return (
    normalizeOptionalString(sandbox?.status) ??
    normalizeOptionalString(sandbox?.state) ??
    normalizeOptionalString(sandbox?.metadata?.status) ??
    normalizeOptionalString(sandbox?.metadata?.state) ??
    normalizeOptionalString(sandbox?.spec?.status) ??
    normalizeOptionalString(sandbox?.spec?.state)
  );
}

function normalizeBlaxelSandboxState(value: unknown): string | null {
  const state = normalizeOptionalString(value);
  return state ? state.toLowerCase().replace(/[\s-]+/g, "_") : null;
}

export function isBlaxelWorkspaceSandboxTerminalState(value: unknown): boolean {
  const state = normalizeBlaxelSandboxState(value);
  return Boolean(
    state &&
    [
      "deleted",
      "deleting",
      "error",
      "failed",
      "failure",
      "stopped",
      "terminated",
      "terminating",
    ].includes(state),
  );
}

function isBlaxelWorkspaceSandboxProvisioningState(value: unknown): boolean {
  const state = normalizeBlaxelSandboxState(value);
  return Boolean(
    state &&
    [
      "creating",
      "deploying",
      "deployment_pending",
      "pending",
      "provisioning",
      "starting",
      "standby",
    ].includes(state),
  );
}

function terminalBlaxelSandboxFailure(
  state: unknown,
): WorkspaceComputerProviderFailure {
  return failure({
    status: 404,
    code: "blaxel_sandbox_not_found",
    message: "Blaxel sandbox is no longer reusable.",
    details: {
      provider_state: normalizeOptionalString(state) ?? null,
    },
  });
}

function provisioningBlaxelSandboxFailure(
  state: unknown,
): WorkspaceComputerProviderFailure {
  return failure({
    status: 503,
    code: "blaxel_sandbox_not_ready",
    message: "Blaxel sandbox is not ready.",
    details: {
      provider_state: normalizeOptionalString(state) ?? null,
    },
  });
}

async function loadReadyBlaxelWorkspaceSandbox(params: {
  SandboxInstance: any;
  sandboxName: string;
  timeoutMs?: number | null;
  intervalMs?: number | null;
}): Promise<
  | {
      ok: true;
      sandbox: any;
      providerSandboxId: string;
      state: string | null;
    }
  | WorkspaceComputerProviderFailure
> {
  const sandboxName = normalizeString(params.sandboxName);
  const timeoutMs = normalizePositiveInteger(params.timeoutMs, 5_000);
  const intervalMs = normalizePositiveInteger(params.intervalMs, 2_000);
  const deadlineMs = Date.now() + timeoutMs;
  let lastState: string | null = null;

  while (true) {
    let sandbox: any;
    try {
      sandbox = await params.SandboxInstance.get(sandboxName);
      if (typeof sandbox?.wait === "function") {
        const remainingMs = Math.max(1, deadlineMs - Date.now());
        await sandbox.wait({
          maxWait: Math.min(remainingMs, intervalMs),
          interval: Math.min(intervalMs, 2_000),
        });
      }
      sandbox = await params.SandboxInstance.get(sandboxName);
    } catch (error) {
      const failed = classifyBlaxelError(error);
      if (failed.code !== "blaxel_sandbox_not_ready") return failed;
      if (Date.now() >= deadlineMs) return failed;
      await sleep(Math.min(intervalMs, Math.max(1, deadlineMs - Date.now())));
      continue;
    }

    const state = sandboxStateFrom(sandbox);
    lastState = state;
    if (isBlaxelWorkspaceSandboxTerminalState(state)) {
      return terminalBlaxelSandboxFailure(state);
    }
    if (!isBlaxelWorkspaceSandboxProvisioningState(state)) {
      return {
        ok: true,
        sandbox,
        providerSandboxId: sandboxIdFrom(sandbox, sandboxName),
        state,
      };
    }
    if (Date.now() >= deadlineMs) {
      return provisioningBlaxelSandboxFailure(lastState);
    }
    await sleep(Math.min(intervalMs, Math.max(1, deadlineMs - Date.now())));
  }
}

function sandboxUrlFrom(sandbox: any): string | null {
  return (
    normalizeOptionalString(sandbox?.metadata?.url) ??
    normalizeOptionalString(sandbox?.url) ??
    normalizeOptionalString(sandbox?.spec?.url)
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

function sandboxLabelsFrom(sandbox: unknown): Record<string, unknown> | null {
  const record = asRecord(sandbox);
  return (
    asRecord(asRecord(record?.metadata)?.labels) ??
    asRecord(record?.labels) ??
    asRecord(asRecord(record?.spec)?.labels)
  );
}

function sandboxStringLabelsFrom(sandbox: unknown): Record<string, string> {
  const labels = sandboxLabelsFrom(sandbox);
  if (!labels) return {};
  return Object.fromEntries(
    Object.entries(labels)
      .map(([key, value]) => [normalizeString(key), normalizeString(value)] as const)
      .filter(([key]) => Boolean(key)),
  );
}

function sanitizedInventoryLabelsFrom(value: unknown): Record<string, string> {
  const labels = sandboxStringLabelsFrom(value);
  const allowed = new Set([
    "lifecycle_intent",
    "owner",
    "owner_id",
    "project_id",
    "provider",
    "purpose",
    "run_id",
  ]);
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => allowed.has(key))
      .map(([key, labelValue]) => [key, labelValue.slice(0, 160)]),
  );
}

function extractListItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["items", "resources", "data", "sandboxes", "volumes"]) {
    const maybeItems = record?.[key];
    if (Array.isArray(maybeItems)) return maybeItems;
  }
  return [];
}

function metadataNameFrom(value: unknown): string | null {
  const record = asRecord(value);
  return (
    normalizeOptionalString(asRecord(record?.metadata)?.name) ??
    normalizeOptionalString(record?.name) ??
    normalizeOptionalString(record?.id) ??
    normalizeOptionalString(record?.identifier)
  );
}

function inventoryStatusFrom(value: unknown): string | null {
  const record = asRecord(value);
  return (
    normalizeOptionalString(record?.status) ??
    normalizeOptionalString(record?.state) ??
    normalizeOptionalString(asRecord(record?.metadata)?.status) ??
    normalizeOptionalString(asRecord(record?.metadata)?.state) ??
    normalizeOptionalString(asRecord(record?.spec)?.status) ??
    normalizeOptionalString(asRecord(record?.spec)?.state)
  );
}

function inventoryRegionFrom(value: unknown): string | null {
  const record = asRecord(value);
  return (
    normalizeOptionalString(record?.region) ??
    normalizeOptionalString(asRecord(record?.metadata)?.region) ??
    normalizeOptionalString(asRecord(record?.spec)?.region)
  );
}

function inventorySizeMbFrom(value: unknown): number | null {
  const record = asRecord(value);
  const spec = asRecord(record?.spec);
  const raw = record?.size ?? record?.sizeMb ?? record?.sizeMB ?? spec?.size ?? spec?.sizeMb ?? spec?.sizeMB;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function inventoryAttachedToFrom(value: unknown): string | null {
  const record = asRecord(value);
  const spec = asRecord(record?.spec);
  return (
    normalizeOptionalString(record?.attachedTo) ??
    normalizeOptionalString(record?.attached_to) ??
    normalizeOptionalString(record?.attachedSandbox) ??
    normalizeOptionalString(record?.attached_sandbox) ??
    normalizeOptionalString(spec?.attachedTo) ??
    normalizeOptionalString(spec?.attached_to)
  );
}

function inventoryTimestampFrom(value: unknown, keys: string[]): string | number | null {
  const record = asRecord(value);
  const metadata = asRecord(record?.metadata);
  for (const key of keys) {
    const raw = record?.[key] ?? metadata?.[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function sanitizeInventoryResource(
  value: unknown,
  kind: "sandbox" | "volume",
): BlaxelWorkspaceInventoryResource | null {
  const name = metadataNameFrom(value);
  if (!name) return null;
  return {
    name,
    status: inventoryStatusFrom(value),
    providerId: "blaxel",
    kind,
    labels: sanitizedInventoryLabelsFrom(value),
    region: inventoryRegionFrom(value),
    sizeMb: inventorySizeMbFrom(value),
    attachedTo: inventoryAttachedToFrom(value),
    createdAt: inventoryTimestampFrom(value, ["createdAt", "created_at", "created"]),
    updatedAt: inventoryTimestampFrom(value, ["updatedAt", "updated_at", "updated"]),
  };
}

function lifecycleIntentFromLabel(value: unknown): WorkspaceComputerLifecycleIntent | null {
  const normalized = normalizeString(value).toLowerCase();
  return isWorkspaceComputerLifecycleIntent(normalized) ? normalized : null;
}

export function resolveBlaxelSandboxLifecycleIntent(
  sandbox: unknown,
): WorkspaceComputerLifecycleIntent {
  const labels = sandboxLabelsFrom(sandbox);
  return (
    lifecycleIntentFromLabel(labels?.lifecycle_intent) ??
    normalizeWorkspaceComputerLifecycleIntent(null)
  );
}

export function shouldReplaceBlaxelSandboxForLifecycle(params: {
  currentIntent: unknown;
  requestedIntent: unknown;
}): boolean {
  return compareWorkspaceComputerLifecycleIntents(
    params.currentIntent,
    params.requestedIntent,
  ) < 0;
}

function normalizeBlaxelWorkspaceExpirationPolicy(
  value: unknown,
): BlaxelWorkspaceExpirationPolicy | null {
  const record = asRecord(value);
  const type = normalizeString(record?.type);
  const action = normalizeString(record?.action);
  const policyValue = normalizeString(record?.value);
  if (
    (type !== "ttl-idle" && type !== "ttl-max-age" && type !== "date") ||
    action !== "delete" ||
    !policyValue
  ) {
    return null;
  }
  return {
    type,
    action,
    value: policyValue,
  };
}

export function resolveBlaxelSandboxLifecyclePolicies(
  sandbox: unknown,
): BlaxelWorkspaceExpirationPolicy[] {
  const record = asRecord(sandbox);
  const spec = asRecord(record?.spec);
  const lifecycle = asRecord(spec?.lifecycle) ?? asRecord(record?.lifecycle);
  const rawPolicies =
    lifecycle?.expirationPolicies ?? lifecycle?.expiration_policies;
  if (!Array.isArray(rawPolicies)) return [];
  return rawPolicies.flatMap((policy) => {
    const normalized = normalizeBlaxelWorkspaceExpirationPolicy(policy);
    return normalized ? [normalized] : [];
  });
}

function expirationPolicyKey(policy: BlaxelWorkspaceExpirationPolicy): string {
  return `${policy.type}:${policy.value}:${policy.action}`;
}

function expirationPoliciesMatch(
  actual: BlaxelWorkspaceExpirationPolicy[],
  expected: BlaxelWorkspaceExpirationPolicy[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualKeys = new Set(actual.map(expirationPolicyKey));
  return expected.every((policy) => actualKeys.has(expirationPolicyKey(policy)));
}

function inferBlaxelSandboxLifecycleIntent(params: {
  expirationPolicies: BlaxelWorkspaceExpirationPolicy[];
  config: BlaxelWorkspaceLifecycleConfig;
}): WorkspaceComputerLifecycleIntent | null {
  for (const intent of [
    "agent_run",
    "interactive",
    "file_inspection",
  ] as const satisfies WorkspaceComputerLifecycleIntent[]) {
    const expected = resolveBlaxelWorkspaceLifecyclePolicy({
      lifecycleIntent: intent,
      config: params.config,
    });
    if (expirationPoliciesMatch(params.expirationPolicies, expected.expirationPolicies)) {
      return intent;
    }
  }
  return null;
}

export function blaxelSandboxLifecycleMatchesIntent(params: {
  sandbox: unknown;
  lifecycleIntent: WorkspaceComputerLifecycleIntent;
  config: BlaxelWorkspaceLifecycleConfig;
}): boolean {
  const labels = sandboxLabelsFrom(params.sandbox);
  const labelIntent = lifecycleIntentFromLabel(labels?.lifecycle_intent);
  if (labelIntent !== params.lifecycleIntent) return false;
  const actualPolicies = resolveBlaxelSandboxLifecyclePolicies(params.sandbox);
  const expected = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: params.lifecycleIntent,
    config: params.config,
  });
  return expirationPoliciesMatch(actualPolicies, expected.expirationPolicies);
}

export function resolveBlaxelSandboxLifecycleState(params: {
  sandbox: unknown;
  config: BlaxelWorkspaceLifecycleConfig;
}): BlaxelSandboxLifecycleState {
  const labels = sandboxLabelsFrom(params.sandbox);
  const labelIntent = lifecycleIntentFromLabel(labels?.lifecycle_intent);
  const expirationPolicies = resolveBlaxelSandboxLifecyclePolicies(params.sandbox);
  const inferredIntent = inferBlaxelSandboxLifecycleIntent({
    expirationPolicies,
    config: params.config,
  });
  const effectiveIntent =
    resolveStrongestWorkspaceComputerLifecycleIntent(
      [labelIntent, inferredIntent].filter(
        (intent): intent is WorkspaceComputerLifecycleIntent => intent !== null,
      ),
    ) ??
    normalizeWorkspaceComputerLifecycleIntent(null);
  const expected = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: effectiveIntent,
    config: params.config,
  });
  return {
    labelIntent,
    inferredIntent,
    effectiveIntent,
    expirationPolicies,
    policyMatchesEffectiveIntent: expirationPoliciesMatch(
      expirationPolicies,
      expected.expirationPolicies,
    ),
    labelMatchesEffectiveIntent: labelIntent === effectiveIntent,
  };
}

function exitCodeFrom(value: any): number | null {
  const parsed = Number(value?.exitCode ?? value?.exit_code);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveBlaxelWorkspaceLifecyclePolicy(params: {
  lifecycleIntent?: WorkspaceComputerLifecycleIntent | null;
  config: BlaxelWorkspaceLifecycleConfig;
}): BlaxelWorkspaceLifecyclePolicy {
  const intent = normalizeWorkspaceComputerLifecycleIntent(params.lifecycleIntent);
  const basePolicy = WORKSPACE_COMPUTER_LIFECYCLE_POLICY[intent];
  const idleDeleteAfter =
    intent === "file_inspection"
      ? params.config.fileInspectionIdleDeleteAfter
      : intent === "agent_run"
        ? params.config.agentRunIdleDeleteAfter
      : params.config.interactiveIdleDeleteAfter;
  const maxAgeDeleteAfter =
    basePolicy.maxAgeDeleteAfter === null
      ? null
      : params.config.nonAgentMaxAgeDeleteAfter;
  return {
    intent,
    expirationPolicies: [
      { type: "ttl-idle", value: idleDeleteAfter, action: "delete" },
      ...(maxAgeDeleteAfter
        ? [
            {
              type: "ttl-max-age" as const,
              value: maxAgeDeleteAfter,
              action: "delete" as const,
            },
          ]
        : []),
    ],
    allowActiveRunPastMaxAge: basePolicy.allowActiveRunPastMaxAge,
  };
}

export async function updateBlaxelWorkspaceSandboxLifecycle(params: {
  SandboxInstance: {
    updateLifecycle: (
      sandboxName: string,
      lifecycle: { expirationPolicies: BlaxelWorkspaceExpirationPolicy[] },
    ) => Promise<unknown>;
    updateMetadata: (
      sandboxName: string,
      metadata: { labels: Record<string, string> },
    ) => Promise<unknown>;
  };
  sandboxName: string;
  lifecycleIntent?: WorkspaceComputerLifecycleIntent | null;
  config: BlaxelWorkspaceLifecycleConfig;
  labels?: Record<string, string>;
}): Promise<unknown> {
  const lifecycle = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: params.lifecycleIntent,
    config: params.config,
  });
  const lifecycleUpdated = await params.SandboxInstance.updateLifecycle(
    params.sandboxName,
    { expirationPolicies: lifecycle.expirationPolicies },
  );
  const labels = sandboxStringLabelsFrom(lifecycleUpdated);
  return await params.SandboxInstance.updateMetadata(params.sandboxName, {
    labels: {
      ...labels,
      ...(params.labels ?? {}),
      owner: "polynet",
      provider: "blaxel",
      lifecycle_intent: lifecycle.intent,
    },
  });
}

function buildSandboxCreateSpec(
  params: BlaxelWorkspaceSandboxSpec,
  config: BlaxelWorkspaceConfig,
) {
  const sandboxName = normalizeOptionalString(params.sandboxName);
  if (!sandboxName) throw new Error("blaxel_sandbox_name_required");
  const workspaceRoot = normalizeOptionalString(params.workspaceRoot) ?? config.workspaceRoot;
  const volumeName = normalizeOptionalString(params.volumeName);
  const lifecycle = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: params.lifecycleIntent,
    config,
  });
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
      expirationPolicies: lifecycle.expirationPolicies,
    },
    labels: {
      ...(params.labels ?? {}),
      owner: "polynet",
      provider: "blaxel",
      lifecycle_intent: lifecycle.intent,
    },
  };
}

export async function ensureBlaxelWorkspaceSandbox(
  params: BlaxelWorkspaceSandboxSpec,
): Promise<WorkspaceComputerProviderSession | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  const { SandboxInstance, VolumeInstance } = loadedCore.mod;
  const config = loadedConfig.config;
  const sandboxName = normalizeString(params.sandboxName);
  const volumeName = normalizeOptionalString(params.volumeName);
  const workspaceRoot = normalizeOptionalString(params.workspaceRoot) ?? config.workspaceRoot;
  const requestedLifecycle = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: params.lifecycleIntent,
    config,
  });

  try {
    if (volumeName) {
      await VolumeInstance.createIfNotExists({
        name: volumeName,
        size: normalizePositiveInteger(params.volumeSizeMb, config.volumeSizeMb),
        region: normalizeOptionalString(params.region) ?? config.region,
        labels: {
          ...(params.labels ?? {}),
          owner: "polynet",
          provider: "blaxel",
        },
      });
    }
    try {
      const existingSandbox = await SandboxInstance.get(sandboxName);
      if (typeof existingSandbox?.wait === "function") {
        await existingSandbox.wait({ maxWait: 120_000, interval: 2_000 });
      }
      const existingState = sandboxStateFrom(existingSandbox);
      if (
        isBlaxelWorkspaceSandboxTerminalState(existingState) ||
        isBlaxelWorkspaceSandboxProvisioningState(existingState)
      ) {
        try {
          await SandboxInstance.delete(sandboxName);
        } catch (deleteError) {
          const deleteFailure = classifyBlaxelError(deleteError);
          if (deleteFailure.code !== "blaxel_sandbox_not_found") {
            return deleteFailure;
          }
        }
      } else {
        const existingLifecycleState = resolveBlaxelSandboxLifecycleState({
          sandbox: existingSandbox,
          config,
        });
        const targetLifecycleIntent = shouldReplaceBlaxelSandboxForLifecycle({
          currentIntent: existingLifecycleState.effectiveIntent,
          requestedIntent: requestedLifecycle.intent,
        })
          ? requestedLifecycle.intent
          : existingLifecycleState.effectiveIntent;
        if (
          existingLifecycleState.effectiveIntent === targetLifecycleIntent &&
          existingLifecycleState.policyMatchesEffectiveIntent &&
          existingLifecycleState.labelMatchesEffectiveIntent
        ) {
          await ensureBlaxelWorkspaceRootDirectory(existingSandbox, workspaceRoot);
          return {
            ok: true,
            providerId: "blaxel",
            providerSandboxId: sandboxIdFrom(existingSandbox, sandboxName),
            projectVolumeId: volumeName,
            workspaceRoot,
            startedAt: Date.now(),
          };
        }
        try {
          const updatedSandbox = await updateBlaxelWorkspaceSandboxLifecycle({
            SandboxInstance,
            sandboxName,
            lifecycleIntent: targetLifecycleIntent,
            config,
            labels: params.labels,
          });
          if (typeof (updatedSandbox as any)?.wait === "function") {
            await (updatedSandbox as any).wait({ maxWait: 120_000, interval: 2_000 });
          }
          const updatedState = sandboxStateFrom(updatedSandbox);
          if (isBlaxelWorkspaceSandboxTerminalState(updatedState)) {
            return terminalBlaxelSandboxFailure(updatedState);
          }
          if (isBlaxelWorkspaceSandboxProvisioningState(updatedState)) {
            return provisioningBlaxelSandboxFailure(updatedState);
          }
          await ensureBlaxelWorkspaceRootDirectory(updatedSandbox, workspaceRoot);
          return {
            ok: true,
            providerId: "blaxel",
            providerSandboxId: sandboxIdFrom(updatedSandbox, sandboxName),
            projectVolumeId: volumeName,
            workspaceRoot,
            startedAt: Date.now(),
          };
        } catch {
          try {
            await SandboxInstance.delete(sandboxName);
          } catch (deleteError) {
            const deleteFailure = classifyBlaxelError(deleteError);
            if (deleteFailure.code !== "blaxel_sandbox_not_found") {
              return deleteFailure;
            }
          }
          params = {
            ...params,
            lifecycleIntent: targetLifecycleIntent,
          };
        }
      }
    } catch (error) {
      const failed = classifyBlaxelError(error);
      if (failed.code !== "blaxel_sandbox_not_found") return failed;
    }
    const sandbox = await SandboxInstance.createIfNotExists(
      buildSandboxCreateSpec(params, config),
    );
    if (typeof sandbox?.wait === "function") {
      await sandbox.wait({ maxWait: 120_000, interval: 2_000 });
    }
    const createdState = sandboxStateFrom(sandbox);
    if (isBlaxelWorkspaceSandboxTerminalState(createdState)) {
      return terminalBlaxelSandboxFailure(createdState);
    }
    if (isBlaxelWorkspaceSandboxProvisioningState(createdState)) {
      return provisioningBlaxelSandboxFailure(createdState);
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

export async function listBlaxelWorkspaceSandboxes(): Promise<BlaxelWorkspaceInventoryListResult> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  try {
    const raw = await loadedCore.mod.SandboxInstance.list();
    const items = extractListItems(raw);
    return {
      ok: true,
      providerId: "blaxel",
      kind: "sandbox",
      rawCount: items.length,
      resources: items.flatMap((item) => {
        const sanitized = sanitizeInventoryResource(item, "sandbox");
        return sanitized ? [sanitized] : [];
      }),
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function listBlaxelWorkspaceVolumes(): Promise<BlaxelWorkspaceInventoryListResult> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  try {
    const raw = await loadedCore.mod.VolumeInstance.list();
    const items = extractListItems(raw);
    return {
      ok: true,
      providerId: "blaxel",
      kind: "volume",
      rawCount: items.length,
      resources: items.flatMap((item) => {
        const sanitized = sanitizeInventoryResource(item, "volume");
        return sanitized ? [sanitized] : [];
      }),
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function readBlaxelWorkspaceVolumeQuotaSnapshot():
  Promise<BlaxelWorkspaceVolumeQuotaSnapshot> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const volumes = await listBlaxelWorkspaceVolumes();
  if (!volumes.ok) return volumes;
  const providerVolumeLimit = loadedConfig.config.providerVolumeLimit;
  return {
    ok: true,
    providerId: "blaxel",
    providerVolumeCount: volumes.rawCount,
    providerVolumeLimit,
    providerVolumeSafetyBuffer: loadedConfig.config.providerVolumeSafetyBuffer,
    source:
      providerVolumeLimit === null
        ? "provider_inventory_no_limit"
        : "provider_inventory_configured_limit",
  };
}

export async function inspectBlaxelWorkspaceSandbox(params: {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
}): Promise<BlaxelWorkspaceSandboxInspectionResult> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  const sandboxName = normalizeString(params.sandboxName);
  const workspaceRoot =
    normalizeOptionalString(params.workspaceRoot) ?? loadedConfig.config.workspaceRoot;
  const projectVolumeId = normalizeOptionalString(params.volumeName);
  try {
    const sandbox = await loadedCore.mod.SandboxInstance.get(sandboxName);
    return {
      ok: true,
      providerId: "blaxel",
      sandboxName,
      providerSandboxId: sandboxIdFrom(sandbox, sandboxName),
      projectVolumeId,
      workspaceRoot,
      exists: true,
      state: sandboxStateFrom(sandbox),
      url: sandboxUrlFrom(sandbox),
      lifecycleState: resolveBlaxelSandboxLifecycleState({
        sandbox,
        config: loadedConfig.config,
      }),
    };
  } catch (error) {
    const failed = classifyBlaxelError(error);
    if (failed.code === "blaxel_sandbox_not_found") {
      return {
        ok: true,
        providerId: "blaxel",
        sandboxName,
        providerSandboxId: sandboxName,
        projectVolumeId,
        workspaceRoot,
        exists: false,
        state: "missing",
        missingReason: "not_found",
      };
    }
    return failed;
  }
}

export async function resolveBlaxelWorkspaceSandboxIfReady(params: {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
}): Promise<WorkspaceComputerProviderSession | WorkspaceComputerProviderFailure> {
  const loaded = await loadBlaxelWorkspaceSandboxForOperation(params);
  if (loaded.ok === false) return loaded;
  return {
    ok: true,
    providerId: "blaxel",
    providerSandboxId: loaded.providerSandboxId,
    projectVolumeId: loaded.projectVolumeId,
    workspaceRoot: loaded.workspaceRoot,
    startedAt: Date.now(),
  };
}

async function loadBlaxelWorkspaceSandboxForOperation(params: {
  sandboxName: string;
  volumeName?: string | null;
  workspaceRoot?: string | null;
  readyTimeoutMs?: number | null;
}): Promise<
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      projectVolumeId?: string | null;
      workspaceRoot: string;
      sandbox: any;
    }
  | WorkspaceComputerProviderFailure
> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  const sandboxName = normalizeString(params.sandboxName);
  const workspaceRoot =
    normalizeOptionalString(params.workspaceRoot) ?? loadedConfig.config.workspaceRoot;
  const ready = await loadReadyBlaxelWorkspaceSandbox({
    SandboxInstance: loadedCore.mod.SandboxInstance,
    sandboxName,
    timeoutMs: params.readyTimeoutMs,
  });
  if (ready.ok === false) return ready;
  return {
    ok: true,
    providerId: "blaxel",
    providerSandboxId: ready.providerSandboxId,
    projectVolumeId: normalizeOptionalString(params.volumeName),
    workspaceRoot,
    sandbox: ready.sandbox,
  };
}

export async function destroyBlaxelWorkspaceSandbox(params: {
  sandboxName: string;
}): Promise<{ ok: true; providerId: "blaxel"; providerSandboxId: string } | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
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

export async function destroyBlaxelWorkspaceVolume(params: {
  volumeName: string;
  timeoutMs?: number | null;
  intervalMs?: number | null;
}): Promise<{ ok: true; providerId: "blaxel"; projectVolumeId: string } | WorkspaceComputerProviderFailure> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (loadedConfig.ok === false) return loadedConfig;
  const loadedCore = await loadBlaxelCore();
  if (loadedCore.ok === false) return loadedCore;
  const volumeName = normalizeString(params.volumeName);
  const timeoutMs = normalizePositiveInteger(params.timeoutMs, 30_000);
  const intervalMs = normalizePositiveInteger(params.intervalMs, 2_000);
  const deadlineMs = Date.now() + timeoutMs;
  while (true) {
    try {
      await loadedCore.mod.VolumeInstance.delete(volumeName);
      return {
        ok: true,
        providerId: "blaxel",
        projectVolumeId: volumeName,
      };
    } catch (error) {
      const failed = classifyBlaxelError(error);
      if (failed.status === 404 || failed.code === "blaxel_sandbox_not_found") {
        return {
          ok: true,
          providerId: "blaxel",
          projectVolumeId: volumeName,
        };
      }
      if (!isTransientVolumeDeleteError(error) || Date.now() >= deadlineMs) {
        return failed;
      }
      await sleep(Math.min(intervalMs, Math.max(0, deadlineMs - Date.now())));
    }
  }
}

export async function releaseBlaxelWorkspaceSandboxIfIdle(params: {
  sandboxName: string;
}): Promise<
  | {
      ok: true;
      providerId: "blaxel";
      providerSandboxId: string;
      mode: "provider_auto_standby";
      releaseConfirmed: false;
      billableGraceSeconds: number;
      reason: "blaxel_auto_standby_after_connection_idle";
    }
  | WorkspaceComputerProviderFailure
> {
  return {
    ok: true,
    providerId: "blaxel",
    providerSandboxId: normalizeString(params.sandboxName),
    mode: "provider_auto_standby",
    releaseConfirmed: false,
    billableGraceSeconds: BLAXEL_AUTO_STANDBY_GRACE_SECONDS,
    reason: "blaxel_auto_standby_after_connection_idle",
  };
}

async function resolveGuardedBlaxelWorkspacePath(params: {
  sandbox: any;
  workspaceRoot: string;
  path: string;
  kind: BlaxelWorkspacePathGuardKind;
}): Promise<{ ok: true; path: string } | WorkspaceComputerProviderFailure> {
  const processName = `polynet-path-guard-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const result = await params.sandbox.process.exec({
      name: processName,
      command: buildBlaxelWorkspacePathGuardCommand({
        workspaceRoot: params.workspaceRoot,
        path: params.path,
        kind: params.kind,
      }),
      waitForCompletion: true,
      timeout: 15,
    });
    const providerCommandId = commandIdFrom(result, processName);
    let output = "";
    if (providerCommandId) {
      try {
        output = String(
          await params.sandbox.process.logs(providerCommandId, "stdout"),
        ).trim();
      } catch {
        output = "";
      }
    }
    if (output.startsWith("ok\t")) {
      const resolvedPath = normalizeOptionalString(output.slice(3));
      return resolvedPath
        ? { ok: true, path: resolvedPath }
        : blaxelWorkspacePathGuardFailure("unresolved");
    }
    return blaxelWorkspacePathGuardFailure(output || "unresolved");
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

async function executeBlaxelWorkspaceCommandOnce(
  params: BlaxelWorkspaceCommandSpec,
): Promise<BlaxelWorkspaceCommandResult> {
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  const sandboxName = normalizeString(params.sandboxName);
  try {
    const sandbox = resolved.sandbox;
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
    if (workingDir) {
      const guardedWorkingDir = await resolveGuardedBlaxelWorkspacePath({
        sandbox,
        workspaceRoot: resolved.workspaceRoot,
        path: workingDir,
        kind: "directory",
      });
      if (guardedWorkingDir.ok === false) return guardedWorkingDir;
      workingDir = guardedWorkingDir.path;
    }
    const commandEnv = normalizeCommandEnv(params.env);
    const result = await sandbox.process.exec({
      name: processName,
      command: params.command,
      ...(commandEnv ? { env: commandEnv } : null),
      ...(workingDir ? { workingDir } : null),
      waitForCompletion: params.waitForCompletion ?? true,
      ...(Array.isArray(params.waitForPorts) && params.waitForPorts.length > 0
        ? { waitForPorts: params.waitForPorts }
        : null),
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

export async function executeBlaxelWorkspaceCommand(
  params: BlaxelWorkspaceCommandSpec,
): Promise<BlaxelWorkspaceCommandResult> {
  const retryBudgetMs =
    typeof params.readyRetryMs === "number" && Number.isFinite(params.readyRetryMs)
      ? Math.max(0, Math.floor(params.readyRetryMs))
      : readNonNegativeIntegerEnv("BLAXEL_WORKSPACE_COMMAND_READY_RETRY_MS", 5_000);
  const deadlineMs = Date.now() + retryBudgetMs;
  let delayMs = 500;
  while (true) {
    const result = await executeBlaxelWorkspaceCommandOnce(params);
    if (result.ok || result.code !== "blaxel_sandbox_not_ready") return result;
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) return result;
    await sleep(Math.min(delayMs, remainingMs));
    delayMs = Math.min(delayMs * 2, 30_000);
  }
}

export async function readBlaxelWorkspaceProcess(params: {
  sandboxName: string;
  processName: string;
}): Promise<BlaxelWorkspaceProcessResult> {
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  const processName = normalizeString(params.processName);
  try {
    const sandbox = resolved.sandbox;
    let process: unknown;
    try {
      process = await sandbox.process.get(processName);
    } catch (error) {
      const failed = classifyBlaxelError(error);
      if (failed.code === "blaxel_sandbox_not_found") {
        return failure({
          status: 404,
          code: "blaxel_process_not_found",
          message: "Blaxel process not found.",
          details: failed.details,
        });
      }
      return failed;
    }
    let stdout: string | null = null;
    let stderr: string | null = null;
    let logs: string | null = null;
    try {
      stdout = await sandbox.process.logs(processName, "stdout");
    } catch {
      stdout = null;
    }
    try {
      stderr = await sandbox.process.logs(processName, "stderr");
    } catch {
      stderr = null;
    }
    try {
      logs = await sandbox.process.logs(processName, "all");
    } catch {
      logs = [stdout, stderr].filter(Boolean).join("\n") || null;
    }
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      providerProcessId: processName,
      status: statusFrom(process),
      exitCode: exitCodeFrom(process),
      stdout,
      stderr,
      logs,
      raw: process,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function stopBlaxelWorkspaceProcess(params: {
  sandboxName: string;
  processName: string;
}): Promise<BlaxelWorkspaceProcessStopResult> {
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  const processName = normalizeString(params.processName);
  try {
    const sandbox = resolved.sandbox;
    const stopped = await sandbox.process.kill(processName);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      providerProcessId: processName,
      raw: stopped,
    };
  } catch (error) {
    return classifyBlaxelError(error);
  }
}

export async function listBlaxelWorkspaceDirectory(params: {
  sandboxName: string;
  path?: string | null;
}): Promise<BlaxelWorkspaceDirectoryResult> {
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
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
    const sandbox = resolved.sandbox;
    const guardedDirectory = await resolveGuardedBlaxelWorkspacePath({
      sandbox,
      workspaceRoot: resolved.workspaceRoot,
      path: directoryPath,
      kind: "directory",
    });
    if (guardedDirectory.ok === false) return guardedDirectory;
    const entries = await sandbox.fs.ls(guardedDirectory.path);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: guardedDirectory.path,
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
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  let filePath: string;
  try {
    filePath = normalizeBlaxelWorkspacePath(params.path, resolved.workspaceRoot);
  } catch {
    return invalidWorkspacePathFailure();
  }
  try {
    const sandbox = resolved.sandbox;
    const guardedFile = await resolveGuardedBlaxelWorkspacePath({
      sandbox,
      workspaceRoot: resolved.workspaceRoot,
      path: filePath,
      kind: "file",
    });
    if (guardedFile.ok === false) return guardedFile;
    const content = await sandbox.fs.read(guardedFile.path);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: guardedFile.path,
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
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  let filePath: string;
  try {
    filePath = normalizeBlaxelWorkspacePath(params.path, resolved.workspaceRoot);
  } catch {
    return invalidWorkspacePathFailure();
  }
  try {
    const sandbox = resolved.sandbox;
    const guardedFile = await resolveGuardedBlaxelWorkspacePath({
      sandbox,
      workspaceRoot: resolved.workspaceRoot,
      path: filePath,
      kind: "writable_file",
    });
    if (guardedFile.ok === false) return guardedFile;
    await sandbox.fs.write(guardedFile.path, params.content);
    return {
      ok: true,
      providerId: "blaxel",
      providerSandboxId: resolved.providerSandboxId,
      path: guardedFile.path,
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
  const resolved = await loadBlaxelWorkspaceSandboxForOperation({
    sandboxName: params.sandboxName,
  });
  if (resolved.ok === false) return resolved;
  try {
    const sandbox = resolved.sandbox;
    const preview = await sandbox.previews.createIfNotExists({
      metadata: {
        name: normalizeBlaxelPreviewName(params.previewName, params.port),
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
