import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import {
  WORKSPACE_COMPUTER_LIFECYCLE_POLICY,
  type WorkspaceComputerLifecycleIntent,
} from "../shared/workspaceComputerProvider.ts";

type ExpirationPolicy = {
  type?: string;
  value?: string;
  action?: string;
};

type ProbeResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  provider: "blaxel";
  volumeName: string;
  sandboxName: string;
  config: {
    image: string;
    memoryMb: number;
    region: string;
    volumeSizeMb: number;
    mountPath: string;
    serverPort: number;
    keepResources: boolean;
  };
  timingsMs: Record<string, number>;
  evidence: {
    sdkImportOk: boolean;
    volumeReady: boolean;
    sandboxReady: boolean;
    initialFileInspectionPolicyOk: boolean;
    namedProcessStarted: boolean;
    processLogsReadableBeforeUpgrade: boolean;
    volumeFileReadableBeforeUpgrade: boolean;
    agentLifecycleUpdateOk: boolean;
    agentMetadataUpdateOk: boolean;
    agentPolicyHasNoMaxAge: boolean;
    processSurvivedAgentUpgrade: boolean;
    volumeFileSurvivedAgentUpgrade: boolean;
    interactiveLifecycleRestoreOk: boolean;
    interactiveMetadataUpdateOk: boolean;
    interactivePolicyHasMaxAge: boolean;
    cleanupOk: boolean | null;
    initialLifecyclePolicies: ExpirationPolicy[];
    agentLifecyclePolicies: ExpirationPolicy[];
    interactiveLifecyclePolicies: ExpirationPolicy[];
    initialLifecycleIntent?: string;
    agentLifecycleIntent?: string;
    interactiveLifecycleIntent?: string;
    processStatusBeforeUpgrade?: string;
    processStatusAfterAgentUpgrade?: string;
    logs: string[];
  };
  errors: string[];
};

const args = new Set(process.argv.slice(2));
const requireLive = args.has("--require-live");
const allowCliAuth = args.has("--allow-cli-auth");
const keepResources = args.has("--keep-resources");

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readVolumeSizeMbEnv(): number {
  const explicitMb = readIntEnv("BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_MB", 0);
  if (explicitMb > 0) return explicitMb;
  const legacyGb = readIntEnv("BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_GB", 0);
  return legacyGb > 0 ? legacyGb * 1024 : 2048;
}

function safeResourceName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function printAndExit(result: ProbeResult, exitCode: number): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return [
      safeText(error.name),
      safeText(error.message),
    ].filter(Boolean).join(": ") || "provider_error";
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return (
      [
        safeText(record.name),
        safeText(record.message),
        safeText(record.error),
        safeText(record.code),
      ].filter(Boolean).join(": ") ||
      Object.prototype.toString.call(error)
    );
  }
  return safeText(error) ?? "provider_error";
}

function isNotFoundError(error: unknown): boolean {
  return /404|not found|not_found|does not exist/i.test(describeError(error));
}

function isTransientVolumeAttachmentError(error: unknown): boolean {
  return /409|conflict|attach|attached|detaching|in use|busy/i.test(describeError(error));
}

async function retryTransient<T>(params: {
  timeoutMs: number;
  intervalMs: number;
  isRetryable: (error: unknown) => boolean;
  action: () => Promise<T>;
}): Promise<T> {
  const deadlineMs = Date.now() + params.timeoutMs;
  let lastError: unknown = null;
  while (Date.now() <= deadlineMs) {
    try {
      return await params.action();
    } catch (error) {
      lastError = error;
      if (!params.isRetryable(error)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(params.intervalMs, Math.max(0, deadlineMs - Date.now()))),
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function timed<T>(
  result: ProbeResult,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    result.timingsMs[key] = elapsedMs(startedAt);
  }
}

function buildBaseResult(): ProbeResult {
  const id = randomUUID().slice(0, 8);
  const resourceBase = safeResourceName(
    process.env.BLAXEL_WORKSPACE_UPGRADE_PROBE_NAME ||
      `polynet-blaxel-upgrade-${id}`,
  );
  const volumeName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_UPGRADE_PROBE_VOLUME_NAME ||
      `${resourceBase}-vol`,
  );
  const sandboxName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_UPGRADE_PROBE_SANDBOX_NAME ||
      `${resourceBase}-sbx`,
  );
  return {
    ok: false,
    provider: "blaxel",
    volumeName,
    sandboxName,
    config: {
      image: process.env.BLAXEL_WORKSPACE_PROBE_IMAGE || "blaxel/base-image:latest",
      memoryMb: readIntEnv("BLAXEL_WORKSPACE_PROBE_MEMORY_MB", 4096),
      region: process.env.BLAXEL_WORKSPACE_PROBE_REGION || "us-pdx-1",
      volumeSizeMb: readVolumeSizeMbEnv(),
      mountPath: process.env.BLAXEL_WORKSPACE_PROBE_MOUNT_PATH || "/workspace",
      serverPort: readIntEnv("BLAXEL_WORKSPACE_PROBE_SERVER_PORT", 32124),
      keepResources,
    },
    timingsMs: {},
    evidence: {
      sdkImportOk: false,
      volumeReady: false,
      sandboxReady: false,
      initialFileInspectionPolicyOk: false,
      namedProcessStarted: false,
      processLogsReadableBeforeUpgrade: false,
      volumeFileReadableBeforeUpgrade: false,
      agentLifecycleUpdateOk: false,
      agentMetadataUpdateOk: false,
      agentPolicyHasNoMaxAge: false,
      processSurvivedAgentUpgrade: false,
      volumeFileSurvivedAgentUpgrade: false,
      interactiveLifecycleRestoreOk: false,
      interactiveMetadataUpdateOk: false,
      interactivePolicyHasMaxAge: false,
      cleanupOk: null,
      initialLifecyclePolicies: [],
      agentLifecyclePolicies: [],
      interactiveLifecyclePolicies: [],
      logs: [],
    },
    errors: [],
  };
}

function expirationPoliciesForIntent(intent: WorkspaceComputerLifecycleIntent): ExpirationPolicy[] {
  const policy = WORKSPACE_COMPUTER_LIFECYCLE_POLICY[intent];
  return [
    { type: "ttl-idle", value: policy.idleDeleteAfter, action: "delete" },
    ...(policy.maxAgeDeleteAfter
      ? [{ type: "ttl-max-age", value: policy.maxAgeDeleteAfter, action: "delete" }]
      : []),
  ];
}

function metadataLabels(sandbox: any): Record<string, string> {
  const labels = sandbox?.metadata?.labels ?? sandbox?.labels ?? {};
  return labels && typeof labels === "object" && !Array.isArray(labels)
    ? Object.fromEntries(
        Object.entries(labels).map(([key, value]) => [key, String(value ?? "")]),
      )
    : {};
}

function lifecyclePolicies(sandbox: any): ExpirationPolicy[] {
  const policies =
    sandbox?.spec?.lifecycle?.expirationPolicies ??
    sandbox?.spec?.lifecycle?.expiration_policies ??
    sandbox?.lifecycle?.expirationPolicies ??
    [];
  return Array.isArray(policies) ? policies : [];
}

function hasPolicy(policies: ExpirationPolicy[], type: string, value?: string): boolean {
  return policies.some((policy) =>
    policy.type === type && (value === undefined || policy.value === value),
  );
}

function hasNoMaxAgePolicy(policies: ExpirationPolicy[]): boolean {
  return !policies.some((policy) => policy.type === "ttl-max-age");
}

async function deleteIfPresent(label: string, action: () => Promise<unknown>, errors: string[]) {
  try {
    await action();
  } catch (error) {
    if (!isNotFoundError(error)) {
      errors.push(`${label}_delete_failed: ${describeError(error)}`);
    }
  }
}

async function deleteVolumeAfterDetach(params: {
  VolumeInstance: any;
  volumeName: string;
  errors: string[];
}) {
  try {
    await retryTransient({
      timeoutMs: 90_000,
      intervalMs: 3_000,
      isRetryable: isTransientVolumeAttachmentError,
      action: () => params.VolumeInstance.delete(params.volumeName),
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      params.errors.push(`volume_delete_failed: ${describeError(error)}`);
    }
  }
}

async function updateSandboxIntent(params: {
  SandboxInstance: any;
  sandboxName: string;
  intent: WorkspaceComputerLifecycleIntent;
}) {
  const lifecycle = { expirationPolicies: expirationPoliciesForIntent(params.intent) };
  const lifecycleUpdated = await params.SandboxInstance.updateLifecycle(
    params.sandboxName,
    lifecycle,
  );
  const labels = metadataLabels(lifecycleUpdated);
  return await params.SandboxInstance.updateMetadata(params.sandboxName, {
    labels: {
      ...labels,
      owner: "polynet",
      purpose: "workspace-lifecycle-upgrade-proof",
      lifecycle_intent: params.intent,
    },
  });
}

async function main() {
  const result = buildBaseResult();
  const hasEnvCredentials = Boolean(process.env.BL_WORKSPACE && process.env.BL_API_KEY);
  if (!hasEnvCredentials && !allowCliAuth) {
    result.skipped = true;
    result.reason =
      "missing_blaxel_credentials_set_BL_WORKSPACE_and_BL_API_KEY_or_pass_allow_cli_auth";
    printAndExit(result, requireLive ? 1 : 0);
  }

  let SandboxInstance: any;
  let VolumeInstance: any;
  try {
    const mod = await import("@blaxel/core");
    SandboxInstance = mod.SandboxInstance;
    VolumeInstance = mod.VolumeInstance;
    if (!SandboxInstance) throw new Error("@blaxel/core did not export SandboxInstance");
    if (!VolumeInstance) throw new Error("@blaxel/core did not export VolumeInstance");
    result.evidence.sdkImportOk = true;
  } catch (error) {
    result.reason = "blaxel_sdk_import_failed";
    result.errors.push(describeError(error));
    printAndExit(result, 1);
  }

  const marker = `polynet-blaxel-upgrade:${result.volumeName}:${Date.now()}`;
  const volumeMarkerPath = `${result.config.mountPath}/upgrade-marker.txt`;
  const processName = `polynet-upgrade-server-${randomUUID().slice(0, 8)}`;

  try {
    await timed(result, "createOrReuseVolume", async () =>
      VolumeInstance.createIfNotExists({
        name: result.volumeName,
        displayName: "PolyNet Blaxel workspace lifecycle upgrade probe",
        size: result.config.volumeSizeMb,
        region: result.config.region,
        labels: {
          owner: "polynet",
          purpose: "workspace-lifecycle-upgrade-proof",
        },
      }),
    );
    result.evidence.volumeReady = true;

    const sandbox = await timed(result, "createFileInspectionSandbox", async () => {
      const created = await SandboxInstance.createIfNotExists({
        name: result.sandboxName,
        image: result.config.image,
        memory: result.config.memoryMb,
        region: result.config.region,
        ports: [{ name: "upgrade-server", target: result.config.serverPort, protocol: "HTTP" }],
        volumes: [
          {
            name: result.volumeName,
            mountPath: result.config.mountPath,
            readOnly: false,
          },
        ],
        lifecycle: { expirationPolicies: expirationPoliciesForIntent("file_inspection") },
        labels: {
          owner: "polynet",
          purpose: "workspace-lifecycle-upgrade-proof",
          lifecycle_intent: "file_inspection",
        },
      });
      if (typeof created?.wait === "function") {
        await created.wait({ maxWait: 120_000, interval: 2_000 });
      }
      return created;
    });
    result.evidence.sandboxReady = true;
    result.evidence.initialLifecyclePolicies = lifecyclePolicies(sandbox);
    result.evidence.initialLifecycleIntent = metadataLabels(sandbox).lifecycle_intent;
    result.evidence.initialFileInspectionPolicyOk =
      result.evidence.initialLifecycleIntent === "file_inspection" &&
      hasPolicy(result.evidence.initialLifecyclePolicies, "ttl-idle", "30s") &&
      hasPolicy(result.evidence.initialLifecyclePolicies, "ttl-max-age", "1h");

    await timed(result, "writeVolumeFile", async () => {
      await sandbox.fs.write(volumeMarkerPath, marker);
    });
    const volumeReadBefore = await timed(result, "readVolumeFileBeforeUpgrade", async () =>
      sandbox.fs.read(volumeMarkerPath),
    );
    result.evidence.volumeFileReadableBeforeUpgrade =
      String(volumeReadBefore).includes(marker);

    await timed(result, "startNamedProcess", async () => {
      const started = await sandbox.process.exec({
        name: processName,
        command: `sh -lc ${shellQuote(
          [
            `cd ${shellQuote(result.config.mountPath)}`,
            `python3 -m http.server ${result.config.serverPort} --bind 0.0.0.0`,
          ].join(" && "),
        )}`,
        timeout: 0,
        waitForPorts: [result.config.serverPort],
      });
      result.evidence.processStatusBeforeUpgrade = String(started?.status ?? "");
      result.evidence.namedProcessStarted =
        result.evidence.processStatusBeforeUpgrade === "running";
    });

    const logsBeforeUpgrade = await timed(result, "readProcessLogsBeforeUpgrade", async () =>
      sandbox.process.logs(processName, "all"),
    );
    result.evidence.logs.push(String(logsBeforeUpgrade).slice(-1000));
    result.evidence.processLogsReadableBeforeUpgrade =
      typeof logsBeforeUpgrade === "string";

    const agentSandbox = await timed(result, "upgradeLifecycleToAgentRun", async () =>
      updateSandboxIntent({
        SandboxInstance,
        sandboxName: result.sandboxName,
        intent: "agent_run",
      }),
    );
    result.evidence.agentLifecyclePolicies = lifecyclePolicies(agentSandbox);
    result.evidence.agentLifecycleIntent = metadataLabels(agentSandbox).lifecycle_intent;
    result.evidence.agentLifecycleUpdateOk =
      hasPolicy(result.evidence.agentLifecyclePolicies, "ttl-idle", "30m") &&
      hasNoMaxAgePolicy(result.evidence.agentLifecyclePolicies);
    result.evidence.agentMetadataUpdateOk =
      result.evidence.agentLifecycleIntent === "agent_run";
    result.evidence.agentPolicyHasNoMaxAge =
      hasNoMaxAgePolicy(result.evidence.agentLifecyclePolicies);

    const processAfterAgentUpgrade = await timed(result, "getProcessAfterAgentUpgrade", async () =>
      agentSandbox.process.get(processName),
    );
    result.evidence.processStatusAfterAgentUpgrade = String(
      processAfterAgentUpgrade?.status ?? "",
    );
    result.evidence.processSurvivedAgentUpgrade =
      result.evidence.processStatusAfterAgentUpgrade === "running";

    const volumeReadAfterAgentUpgrade = await timed(
      result,
      "readVolumeFileAfterAgentUpgrade",
      async () => agentSandbox.fs.read(volumeMarkerPath),
    );
    result.evidence.volumeFileSurvivedAgentUpgrade =
      String(volumeReadAfterAgentUpgrade).includes(marker);

    const interactiveSandbox = await timed(result, "restoreLifecycleToInteractive", async () =>
      updateSandboxIntent({
        SandboxInstance,
        sandboxName: result.sandboxName,
        intent: "interactive",
      }),
    );
    result.evidence.interactiveLifecyclePolicies = lifecyclePolicies(interactiveSandbox);
    result.evidence.interactiveLifecycleIntent =
      metadataLabels(interactiveSandbox).lifecycle_intent;
    result.evidence.interactiveLifecycleRestoreOk =
      hasPolicy(result.evidence.interactiveLifecyclePolicies, "ttl-idle", "30m") &&
      hasPolicy(result.evidence.interactiveLifecyclePolicies, "ttl-max-age", "1h");
    result.evidence.interactiveMetadataUpdateOk =
      result.evidence.interactiveLifecycleIntent === "interactive";
    result.evidence.interactivePolicyHasMaxAge =
      hasPolicy(result.evidence.interactiveLifecyclePolicies, "ttl-max-age", "1h");

    result.ok =
      result.evidence.sdkImportOk &&
      result.evidence.volumeReady &&
      result.evidence.sandboxReady &&
      result.evidence.initialFileInspectionPolicyOk &&
      result.evidence.namedProcessStarted &&
      result.evidence.processLogsReadableBeforeUpgrade &&
      result.evidence.volumeFileReadableBeforeUpgrade &&
      result.evidence.agentLifecycleUpdateOk &&
      result.evidence.agentMetadataUpdateOk &&
      result.evidence.agentPolicyHasNoMaxAge &&
      result.evidence.processSurvivedAgentUpgrade &&
      result.evidence.volumeFileSurvivedAgentUpgrade &&
      result.evidence.interactiveLifecycleRestoreOk &&
      result.evidence.interactiveMetadataUpdateOk &&
      result.evidence.interactivePolicyHasMaxAge;
  } catch (error) {
    result.reason = "blaxel_workspace_lifecycle_upgrade_probe_failed";
    result.errors.push(describeError(error));
  } finally {
    if (!keepResources) {
      const cleanupStartedAt = performance.now();
      const cleanupErrors: string[] = [];
      await deleteIfPresent(
        "sandbox",
        () => SandboxInstance.delete(result.sandboxName),
        cleanupErrors,
      );
      await deleteVolumeAfterDetach({
        VolumeInstance,
        volumeName: result.volumeName,
        errors: cleanupErrors,
      });
      result.timingsMs.cleanup = elapsedMs(cleanupStartedAt);
      result.evidence.cleanupOk = cleanupErrors.length === 0;
      if (cleanupErrors.length > 0) {
        result.ok = false;
        result.reason = result.reason || "blaxel_workspace_lifecycle_upgrade_cleanup_failed";
        result.errors.push(...cleanupErrors);
      }
    }
  }

  printAndExit(result, result.ok ? 0 : 1);
}

main().catch((error) => {
  const result = buildBaseResult();
  result.reason = "unhandled_blaxel_workspace_lifecycle_upgrade_probe_error";
  result.errors.push(describeError(error));
  printAndExit(result, 1);
});
