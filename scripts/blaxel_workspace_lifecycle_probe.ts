import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";

type ProbeResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  provider: "blaxel";
  volumeName: string;
  sandboxName: string;
  coldSandboxName: string;
  config: {
    image: string;
    memoryMb: number;
    region: string;
    volumeSizeMb: number;
    mountPath: string;
    serverPort: number;
    lifecycleIdleDelete: string;
    lifecycleMaxAgeDelete: string;
    standbyWaitMs: number;
    keepResources: boolean;
  };
  timingsMs: Record<string, number>;
  evidence: {
    sdkImportOk: boolean;
    volumeReady: boolean;
    sandboxReady: boolean;
    volumeFileRoundTripOk: boolean;
    tempFileRoundTripOk: boolean;
    namedProcessStarted: boolean;
    processLogsReadable: boolean;
    portFetchOk: boolean;
    postIdleVolumeFileOk: boolean;
    postIdleTempFileOk: boolean;
    postIdleProcessStillRunning: boolean;
    postIdlePortFetchOk: boolean;
    coldRestoreVolumeFileOk: boolean;
    coldRestoreTempFileAbsent: boolean;
    coldRestoreProcessAbsent: boolean;
    cleanupOk: boolean | null;
    sandboxStatus?: string;
    coldSandboxStatus?: string;
    volumeStatus?: string;
    processStatusBeforeIdle?: string;
    processStatusAfterIdle?: string;
    processStatusAfterColdRestore?: string;
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
  return legacyGb > 0 ? legacyGb * 1024 : 8192;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printAndExit(result: ProbeResult, exitCode: number): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const extras: Record<string, unknown> = {};
    for (const key of Object.keys(error as unknown as Record<string, unknown>)) {
      extras[key] = (error as unknown as Record<string, unknown>)[key];
    }
    const extraText = Object.keys(extras).length > 0 ? ` ${JSON.stringify(extras)}` : "";
    return `${error.name}: ${error.message}${extraText}`;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function buildBaseResult(): ProbeResult {
  const id = randomUUID().slice(0, 8);
  const resourceBase = safeResourceName(
    process.env.BLAXEL_WORKSPACE_PROBE_NAME || `polynet-blaxel-workspace-${id}`,
  );
  const volumeName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_PROBE_VOLUME_NAME || `${resourceBase}-vol`,
  );
  const sandboxName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_PROBE_SANDBOX_NAME || `${resourceBase}-hot`,
  );
  const coldSandboxName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_PROBE_COLD_SANDBOX_NAME || `${resourceBase}-cold`,
  );
  return {
    ok: false,
    provider: "blaxel",
    volumeName,
    sandboxName,
    coldSandboxName,
    config: {
      image: process.env.BLAXEL_WORKSPACE_PROBE_IMAGE || "blaxel/base-image:latest",
      memoryMb: readIntEnv("BLAXEL_WORKSPACE_PROBE_MEMORY_MB", 4096),
      region: process.env.BLAXEL_WORKSPACE_PROBE_REGION || "us-pdx-1",
      volumeSizeMb: readVolumeSizeMbEnv(),
      mountPath: process.env.BLAXEL_WORKSPACE_PROBE_MOUNT_PATH || "/workspace",
      serverPort: readIntEnv("BLAXEL_WORKSPACE_PROBE_SERVER_PORT", 32123),
      lifecycleIdleDelete: process.env.BLAXEL_WORKSPACE_PROBE_IDLE_DELETE || "1h",
      lifecycleMaxAgeDelete: process.env.BLAXEL_WORKSPACE_PROBE_MAX_AGE_DELETE || "2h",
      standbyWaitMs: readIntEnv("BLAXEL_WORKSPACE_PROBE_STANDBY_WAIT_MS", 90_000),
      keepResources,
    },
    timingsMs: {},
    evidence: {
      sdkImportOk: false,
      volumeReady: false,
      sandboxReady: false,
      volumeFileRoundTripOk: false,
      tempFileRoundTripOk: false,
      namedProcessStarted: false,
      processLogsReadable: false,
      portFetchOk: false,
      postIdleVolumeFileOk: false,
      postIdleTempFileOk: false,
      postIdleProcessStillRunning: false,
      postIdlePortFetchOk: false,
      coldRestoreVolumeFileOk: false,
      coldRestoreTempFileAbsent: false,
      coldRestoreProcessAbsent: false,
      cleanupOk: null,
      logs: [],
    },
    errors: [],
  };
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

function readStatus(resource: any): string | undefined {
  return typeof resource?.status === "string" ? resource.status : undefined;
}

function closeSandboxConnection(sandbox: any) {
  const session = sandbox?.h2Session;
  try {
    if (typeof session?.close === "function") session.close();
    else if (typeof session?.destroy === "function") session.destroy();
  } catch {
    // Best effort. Reconnect behavior is part of the proof evidence.
  }
}

function isNotFoundError(error: unknown): boolean {
  const message = describeError(error);
  return /404|not found|not_found|does not exist/i.test(message);
}

function isTransientVolumeAttachmentError(error: unknown): boolean {
  const message = describeError(error);
  return /409|conflict|attach|attached|detaching|in use|busy/i.test(message);
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
      await sleep(Math.min(params.intervalMs, Math.max(0, deadlineMs - Date.now())));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
      params.errors.push(
        `volume_delete_failed: ${describeError(error)}`,
      );
    }
  }
}

async function fetchSandboxPortText(sandbox: any, port: number, path: string): Promise<string> {
  const response = await sandbox.fetch(port, path);
  if (!response.ok) {
    throw new Error(`port_fetch_failed:${response.status}:${await response.text()}`);
  }
  return await response.text();
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

  const marker = `polynet-blaxel-workspace:${result.volumeName}:${Date.now()}`;
  const processName = `polynet-dev-server-${randomUUID().slice(0, 8)}`;
  const volumeMarkerPath = `${result.config.mountPath}/volume-marker.txt`;
  const tempDir = `/tmp/polynet-blaxel-workspace-${randomUUID().slice(0, 8)}`;
  const tempMarkerPath = `${tempDir}/temp-marker.txt`;
  let sandbox: any | null = null;
  let coldSandbox: any | null = null;

  try {
    const volume = await timed(result, "createOrReuseVolume", async () =>
      VolumeInstance.createIfNotExists({
        name: result.volumeName,
        displayName: "PolyNet Blaxel workspace lifecycle probe",
        size: result.config.volumeSizeMb,
        region: result.config.region,
        labels: {
          owner: "polynet",
          purpose: "workspace-lifecycle-proof",
        },
      }),
    );
    result.evidence.volumeReady = true;
    result.evidence.volumeStatus = readStatus(volume);

    sandbox = await timed(result, "createOrReuseSandboxWithVolume", async () => {
      const created = await SandboxInstance.createIfNotExists({
        name: result.sandboxName,
        image: result.config.image,
        memory: result.config.memoryMb,
        region: result.config.region,
        ports: [{ name: "dev-server", target: result.config.serverPort, protocol: "HTTP" }],
        volumes: [
          {
            name: result.volumeName,
            mountPath: result.config.mountPath,
            readOnly: false,
          },
        ],
        lifecycle: {
          expirationPolicies: [
            { type: "ttl-idle", value: result.config.lifecycleIdleDelete, action: "delete" },
            { type: "ttl-max-age", value: result.config.lifecycleMaxAgeDelete, action: "delete" },
          ],
        },
        labels: {
          owner: "polynet",
          purpose: "workspace-lifecycle-proof",
          phase: "hot",
        },
      });
      if (typeof created?.wait === "function") {
        await created.wait({ maxWait: 120_000, interval: 2_000 });
      }
      return created;
    });
    result.evidence.sandboxReady = true;
    result.evidence.sandboxStatus = readStatus(sandbox);

    await timed(result, "writeVolumeFile", async () => {
      await sandbox.fs.write(volumeMarkerPath, marker);
    });
    const volumeRead = await timed(result, "readVolumeFile", async () =>
      sandbox.fs.read(volumeMarkerPath),
    );
    result.evidence.volumeFileRoundTripOk = String(volumeRead).includes(marker);

    await timed(result, "writeTempFile", async () => {
      await sandbox.process.exec({
        name: `write-temp-${randomUUID().slice(0, 8)}`,
        command: `sh -lc ${shellQuote(
          `mkdir -p ${shellQuote(tempDir)} && printf %s ${shellQuote(marker)} > ${shellQuote(tempMarkerPath)}`,
        )}`,
        waitForCompletion: true,
        timeout: 60,
      });
    });
    const tempRead = await timed(result, "readTempFile", async () =>
      sandbox.fs.read(tempMarkerPath),
    );
    result.evidence.tempFileRoundTripOk = String(tempRead).includes(marker);

    await timed(result, "startNamedDevServer", async () => {
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
      result.evidence.processStatusBeforeIdle = String(started?.status ?? "");
      result.evidence.namedProcessStarted =
        result.evidence.processStatusBeforeIdle === "running";
    });

    const logsBeforeIdle = await timed(result, "readProcessLogsBeforeIdle", async () =>
      sandbox.process.logs(processName, "all"),
    );
    result.evidence.logs.push(String(logsBeforeIdle).slice(-1000));
    result.evidence.processLogsReadable = typeof logsBeforeIdle === "string";

    const fetchedBeforeIdle = await timed(result, "fetchPortBeforeIdle", async () =>
      fetchSandboxPortText(sandbox, result.config.serverPort, "/volume-marker.txt"),
    );
    result.evidence.portFetchOk = fetchedBeforeIdle.includes(marker);

    closeSandboxConnection(sandbox);
    await timed(result, "idleStandbyWait", async () => {
      await sleep(result.config.standbyWaitMs);
    });

    sandbox = await timed(result, "reconnectSandboxAfterIdle", async () => {
      const reconnected = await SandboxInstance.get(result.sandboxName);
      if (typeof reconnected?.wait === "function") {
        await reconnected.wait({ maxWait: 120_000, interval: 2_000 });
      }
      return reconnected;
    });

    const postIdleVolumeRead = await timed(result, "postIdleReadVolumeFile", async () =>
      sandbox.fs.read(volumeMarkerPath),
    );
    result.evidence.postIdleVolumeFileOk = String(postIdleVolumeRead).includes(marker);

    const postIdleTempRead = await timed(result, "postIdleReadTempFile", async () =>
      sandbox.fs.read(tempMarkerPath),
    );
    result.evidence.postIdleTempFileOk = String(postIdleTempRead).includes(marker);

    const processAfterIdle = await timed(result, "postIdleGetProcess", async () =>
      sandbox.process.get(processName),
    );
    result.evidence.processStatusAfterIdle = String(processAfterIdle?.status ?? "");
    result.evidence.postIdleProcessStillRunning =
      result.evidence.processStatusAfterIdle === "running";

    const fetchedAfterIdle = await timed(result, "postIdleFetchPort", async () =>
      fetchSandboxPortText(sandbox, result.config.serverPort, "/volume-marker.txt"),
    );
    result.evidence.postIdlePortFetchOk = fetchedAfterIdle.includes(marker);

    await timed(result, "deleteHotSandboxForColdRestore", async () => {
      await sandbox.delete();
    });
    sandbox = null;

    coldSandbox = await timed(result, "coldRestoreSandboxFromVolume", async () => {
      const restored = await retryTransient({
        timeoutMs: 90_000,
        intervalMs: 3_000,
        isRetryable: isTransientVolumeAttachmentError,
        action: () =>
          SandboxInstance.createIfNotExists({
            name: result.coldSandboxName,
            image: result.config.image,
            memory: result.config.memoryMb,
            region: result.config.region,
            volumes: [
              {
                name: result.volumeName,
                mountPath: result.config.mountPath,
                readOnly: false,
              },
            ],
            lifecycle: {
              expirationPolicies: [
                { type: "ttl-idle", value: result.config.lifecycleIdleDelete, action: "delete" },
                { type: "ttl-max-age", value: result.config.lifecycleMaxAgeDelete, action: "delete" },
              ],
            },
            labels: {
              owner: "polynet",
              purpose: "workspace-lifecycle-proof",
              phase: "cold-restore",
            },
          }),
      });
      const restoredSandbox = restored as any;
      if (typeof restoredSandbox?.wait === "function") {
        await restoredSandbox.wait({ maxWait: 120_000, interval: 2_000 });
      }
      return restoredSandbox;
    });
    result.evidence.coldSandboxStatus = readStatus(coldSandbox);

    const coldVolumeRead = await timed(result, "coldRestoreReadVolumeFile", async () =>
      coldSandbox.fs.read(volumeMarkerPath),
    );
    result.evidence.coldRestoreVolumeFileOk = String(coldVolumeRead).includes(marker);

    try {
      await timed(result, "coldRestoreReadTempFile", async () =>
        coldSandbox.fs.read(tempMarkerPath),
      );
      result.evidence.coldRestoreTempFileAbsent = false;
    } catch (error) {
      result.evidence.coldRestoreTempFileAbsent = isNotFoundError(error);
      if (!result.evidence.coldRestoreTempFileAbsent) {
        throw error;
      }
    }

    try {
      const processAfterColdRestore = await timed(result, "coldRestoreGetProcess", async () =>
        coldSandbox.process.get(processName),
      );
      result.evidence.processStatusAfterColdRestore = String(
        processAfterColdRestore?.status ?? "",
      );
      result.evidence.coldRestoreProcessAbsent =
        result.evidence.processStatusAfterColdRestore !== "running";
    } catch (error) {
      result.evidence.coldRestoreProcessAbsent = isNotFoundError(error);
      if (!result.evidence.coldRestoreProcessAbsent) {
        throw error;
      }
    }

    result.ok =
      result.evidence.sdkImportOk &&
      result.evidence.volumeReady &&
      result.evidence.sandboxReady &&
      result.evidence.volumeFileRoundTripOk &&
      result.evidence.tempFileRoundTripOk &&
      result.evidence.namedProcessStarted &&
      result.evidence.processLogsReadable &&
      result.evidence.portFetchOk &&
      result.evidence.postIdleVolumeFileOk &&
      result.evidence.postIdleTempFileOk &&
      result.evidence.postIdleProcessStillRunning &&
      result.evidence.postIdlePortFetchOk &&
      result.evidence.coldRestoreVolumeFileOk &&
      result.evidence.coldRestoreTempFileAbsent &&
      result.evidence.coldRestoreProcessAbsent;
  } catch (error) {
    result.reason = "blaxel_workspace_lifecycle_probe_failed";
    result.errors.push(describeError(error));
  } finally {
    if (!keepResources) {
      const cleanupStartedAt = performance.now();
      const cleanupErrors: string[] = [];
      await deleteIfPresent("hot_sandbox", () => SandboxInstance.delete(result.sandboxName), cleanupErrors);
      await deleteIfPresent(
        "cold_sandbox",
        () => SandboxInstance.delete(result.coldSandboxName),
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
        result.reason = result.reason || "blaxel_workspace_lifecycle_cleanup_failed";
        result.errors.push(...cleanupErrors);
      }
    }
  }

  printAndExit(result, result.ok ? 0 : 1);
}

main().catch((error) => {
  const result = buildBaseResult();
  result.reason = "unhandled_blaxel_workspace_lifecycle_probe_error";
  result.errors.push(describeError(error));
  printAndExit(result, 1);
});
