"use node";

import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  DAYTONA_CODEX_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES,
  DAYTONA_CODEX_MAX_HUMAN_SAVE_RETENTION_MINUTES,
  DAYTONA_CODEX_REMOTE_ROOT,
  DAYTONA_CODEX_WORKER_PORT,
  DAYTONA_CODEX_WORKSPACE_ROOT,
  DAYTONA_RUNTIME_POLICY,
  defaultDaytonaProviderEphemeralForLifecycleMode,
} from "../shared/daytonaCodexRuntimePolicy";
import { mintPreviewProxySessionToken } from "./previewProxySessionToken";
import { normalizeWorkspacePreviewPort } from "../shared/workspacePreviewPort";

type JsonRecord = Record<string, unknown>;

type DaytonaClient = {
  create(params?: JsonRecord, options?: JsonRecord): Promise<DaytonaSandbox>;
  get(sandboxIdOrName: string): Promise<DaytonaSandbox>;
  delete?(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
};

type DaytonaSandbox = {
  id: string;
  name?: string;
  state?: string;
  computerUse?: {
    start?(): Promise<unknown>;
    stop?(): Promise<unknown>;
    getStatus?(): Promise<unknown>;
    display?: {
      getWindows?(): Promise<unknown>;
      getInfo?(): Promise<unknown>;
    };
    screenshot?: {
      takeCompressed?(options?: JsonRecord): Promise<unknown>;
      takeFullScreen?(showCursor?: boolean): Promise<unknown>;
    };
  };
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<{
      exitCode: number;
      result?: string;
      artifacts?: {
        stdout?: string;
      };
    }>;
  };
  start?(timeout?: number): Promise<void>;
  stop?(timeout?: number, force?: boolean): Promise<void>;
  waitUntilStarted?(timeout?: number): Promise<void>;
  getSignedPreviewUrl?(
    port: number,
    expiresInSeconds?: number,
  ): Promise<
    | string
    | {
        url?: string;
        token?: string;
      }
  >;
  getPreviewLink?(port: number): Promise<{
    url?: string;
    token?: string;
  }>;
  delete?(timeout?: number): Promise<void>;
};

const WORKER_PORT = DAYTONA_CODEX_WORKER_PORT;
const DEFAULT_REMOTE_ROOT = DAYTONA_CODEX_REMOTE_ROOT;
const DEFAULT_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;
const SANITIZED_ERROR_MAX_CHARS = 4000;
const MAX_COMPUTER_USE_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS = 2;
const DAYTONA_COMPUTER_USE_READY_WAIT_MS = 1500;
const DAYTONA_COMPUTER_USE_RETRY_WAIT_MS = 1250;
const DEFAULT_HUMAN_SAVE_RETENTION_MINUTES =
  DAYTONA_CODEX_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES;
const MAX_HUMAN_SAVE_RETENTION_MINUTES =
  DAYTONA_CODEX_MAX_HUMAN_SAVE_RETENTION_MINUTES;

type DaytonaTargetLifecycleConfig = {
  snapshotId: string | null;
  targetRegion: string | null;
  autoStopMinutes: number;
  autoArchiveMinutes: number;
  autoDeleteMinutes: number;
  publicPreview: boolean;
  providerEphemeral: boolean;
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
};

type DaytonaTargetLifecycleMode =
  | "prepared_staging_reuse"
  | "thread_ephemeral"
  | "per_turn_ephemeral";

type DaytonaTargetTiming = {
  target_claim_ms: number;
  sandbox_create_or_get_ms: number;
  sandbox_start_ms: number;
  worker_start_ms: number;
  worker_http_ready_ms: number;
  worker_health_ready_mode: "cached" | "http" | "codex";
  codex_app_server_init_ms: number | null;
  preview_url_ms: number;
  target_ready_persist_ms: number;
  target_ready_total_ms: number;
  cached_target_ready: boolean;
};

type DaytonaProviderTeardownTiming = {
  provider_teardown_ms: number;
};

type DaytonaWorkspaceScanResult = {
  ok: boolean;
  changeState: "clean" | "dirty" | "scan_failed";
  meaningfulFileCount: number;
  meaningfulFilePreview: string[];
  outputPreview: string | null;
};

type DaytonaComputerUse = NonNullable<DaytonaSandbox["computerUse"]>;

function readEnv(name: string): string {
  try {
    return String(process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}

function readFirstEnv(names: string[]): string {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return "";
}

function readIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readHumanSaveRetentionMs(): number {
  const minutes = readBoundedIntegerEnv(
    "POLYNET_DAYTONA_HUMAN_SAVE_RETENTION_MINUTES",
    DEFAULT_HUMAN_SAVE_RETENTION_MINUTES,
    1,
    MAX_HUMAN_SAVE_RETENTION_MINUTES,
  );
  return minutes * 60_000;
}

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readIntegerEnv(name, fallback);
  return Math.min(max, Math.max(min, value));
}

function readNumberEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(readEnv(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalNonNegativeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const raw = readEnv(name).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandOutput(result: { result?: string; artifacts?: { stdout?: string } }): string {
  return String(result.result ?? "") || String(result.artifacts?.stdout ?? "");
}

function sanitizeDaytonaRuntimeError(value: unknown): string {
  let text =
    value instanceof Error ? value.message : String(value ?? "daytona_runtime_error");
  const secretValues = [
    readEnv("DAYTONA_API_KEY"),
    readEnv("DAYTONA_JWT_TOKEN"),
    readFirstEnv(["DAYTONA_ORGANIZATION_ID", "DAYTONA_ORG_ID"]),
    readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN"),
    readEnv("POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET"),
    readEnv("OPENAI_API_KEY"),
    readEnv("POLYNET_CODEX_BRIDGE_OPENAI_API_KEY"),
  ].filter((entry) => entry.length >= 8);
  for (const secret of secretValues) {
    text = text.split(secret).join("[redacted-secret]");
  }
  text = text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [redacted-token]")
    .replace(/\b(dtn|sk|sk-proj|sk-ant|sk-or-v1|xai|bl)_[A-Za-z0-9._~+/=-]{12,}/gi, "[redacted-key]")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)=('[^']*'|"[^"]*"|\S+)/g, "$1=[redacted]")
    .replace(/https:\/\/[A-Za-z0-9.-]*proxy\.daytona\.works[^\s'")]+/gi, "[redacted-daytona-preview-url]")
    .replace(/https:\/\/[^\s'")]*[?&](?:token|signature|sig|auth|access_token)=[^\s'")]+/gi, "[redacted-signed-url]")
    .replace(/(Authorization:\s*)[^\n\r]+/gi, "$1[redacted]")
    .replace(/(worker_log=)[\s\S]+/i, "$1[redacted-log]");
  return text.slice(0, SANITIZED_ERROR_MAX_CHARS);
}

function daytonaRuntimeErrorCode(value: unknown): string {
  const sanitized = sanitizeDaytonaRuntimeError(value);
  return String(sanitized.split(/\s|\n/)[0] || "daytona_direct_target_failed").slice(0, 120);
}

function normalizeUrl(value: unknown): string | null {
  const normalized = String(value ?? "").trim().replace(/\/+$/, "");
  if (!normalized || !/^https?:\/\//i.test(normalized)) return null;
  return normalized;
}

function normalizeComputerOpenUrl(value: unknown):
  | { ok: true; url: string; isLocalPreview: boolean }
  | { ok: false; code: string; message: string } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      code: "computer_open_url_missing",
      message: "computer_open_url requires a URL.",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      code: "computer_open_url_invalid",
      message: "computer_open_url requires a valid HTTP(S) URL.",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      code: "computer_open_url_scheme_not_allowed",
      message: "Only HTTP(S) URLs can be opened in the Daytona computer.",
    };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: "computer_open_url_credentials_not_allowed",
      message: "URLs with embedded credentials are not allowed.",
    };
  }
  const hostname = parsed.hostname.toLowerCase();
  const isLocalPreview =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]";
  if (hostname === "0.0.0.0") {
    parsed.hostname = "localhost";
  }
  if (!isLocalPreview && !readBooleanEnv("POLYNET_DAYTONA_ALLOW_EXTERNAL_COMPUTER_URLS")) {
    return {
      ok: false,
      code: "computer_open_url_external_not_allowed",
      message:
        "Only localhost workspace preview URLs are enabled for Daytona computer inspection.",
    };
  }
  return {
    ok: true,
    url: parsed.toString(),
    isLocalPreview,
  };
}

function buildDaytonaComputerOpenUrlCommand(url: string): string {
  return [
    "set -eu",
    `URL=${shellQuote(url)}`,
    `DISPLAY_VALUE="${"${DISPLAY:-}"}"`,
    'if [ -z "$DISPLAY_VALUE" ]; then',
    "  DISPLAY_VALUE=\"$(pgrep -a Xvfb 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^:[0-9]+$/) { print $i; exit } }' || true)\"",
    "fi",
    'if [ -z "$DISPLAY_VALUE" ]; then DISPLAY_VALUE=:0; fi',
    'export DISPLAY="$DISPLAY_VALUE"',
    'export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-daytona}"',
    'mkdir -p "$XDG_RUNTIME_DIR" /tmp/polynet-computer-browser-profile',
    'chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true',
    'BROWSER=""',
    "for candidate in chromium chromium-browser google-chrome google-chrome-stable firefox xdg-open; do",
    '  if command -v "$candidate" >/dev/null 2>&1; then BROWSER="$candidate"; break; fi',
    "done",
    'if [ -z "$BROWSER" ]; then echo "no_supported_browser_found" >&2; exit 127; fi',
    'case "$BROWSER" in',
    "  chromium*|google-chrome*)",
    '    nohup "$BROWSER" --no-sandbox --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-features=Translate --user-data-dir=/tmp/polynet-computer-browser-profile --new-window "$URL" >/tmp/polynet-computer-browser.log 2>&1 &',
    "    ;;",
    "  firefox)",
    '    nohup "$BROWSER" --new-window "$URL" >/tmp/polynet-computer-browser.log 2>&1 &',
    "    ;;",
    "  *)",
    '    nohup "$BROWSER" "$URL" >/tmp/polynet-computer-browser.log 2>&1 &',
    "    ;;",
    "esac",
    "sleep 2",
    'echo "opened_url"',
    'echo "display=$DISPLAY_VALUE"',
    'echo "browser=$BROWSER"',
  ].join("\n");
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDaytonaComputerUseBridgeError(value: unknown): boolean {
  const message = sanitizeDaytonaRuntimeError(value).toLowerCase();
  return (
    /connection is shut down/.test(message) ||
    /connection.*(?:closed|reset|terminated|refused)/.test(message) ||
    /socket hang up/.test(message) ||
    /\beconnreset\b|\betimedout\b|\btimeout\b/.test(message) ||
    /temporarily unavailable|service unavailable|gateway timeout/.test(message) ||
    /\b(?:502|503|504)\b/.test(message)
  );
}

async function readDaytonaComputerUseStatus(
  computerUse: DaytonaComputerUse,
): Promise<JsonRecord | null> {
  if (typeof computerUse.getStatus !== "function") return null;
  return asRecord(await computerUse.getStatus());
}

async function startDaytonaComputerUseWithReadiness(computerUse: DaytonaComputerUse): Promise<{
  status: JsonRecord | null;
  attempts: number;
}> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS; attempt += 1) {
    try {
      await computerUse.start?.();
      await sleepMs(DAYTONA_COMPUTER_USE_READY_WAIT_MS);
      return {
        status: await readDaytonaComputerUseStatus(computerUse),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (
        attempt >= DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS ||
        !isRetryableDaytonaComputerUseBridgeError(error)
      ) {
        throw error;
      }
      await sleepMs(DAYTONA_COMPUTER_USE_RETRY_WAIT_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "computer_use_failed"));
}

async function runRetryableDaytonaComputerUseOperation<T>(
  operation: (attempt: number) => Promise<T>,
): Promise<{ result: T; attempts: number }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS; attempt += 1) {
    try {
      return {
        result: await operation(attempt),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (
        attempt >= DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS ||
        !isRetryableDaytonaComputerUseBridgeError(error)
      ) {
        throw error;
      }
      await sleepMs(DAYTONA_COMPUTER_USE_RETRY_WAIT_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "computer_use_failed"));
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findNestedNumberField(value: unknown, field: string, depth = 0): number | null {
  if (depth > 4) return null;
  const record = asRecord(value);
  if (!record) return null;
  const direct = readNumberValue(record[field]);
  if (direct !== null) return direct;
  for (const nested of Object.values(record)) {
    const found = findNestedNumberField(nested, field, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function decodeScreenshotString(value: string): {
  bytes: Uint8Array;
  mimeType: string;
} | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dataUrlMatch = /^data:([^;,]+)?;base64,(.+)$/s.exec(trimmed);
  const mimeType = dataUrlMatch?.[1]?.trim() || "image/jpeg";
  const base64 = (dataUrlMatch?.[2] ?? trimmed)
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (base64.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength <= 0) return null;
  return { bytes, mimeType };
}

function extractScreenshotImage(value: unknown, depth = 0): {
  bytes: Uint8Array;
  mimeType: string;
  resultKeys: string[];
  width: number | null;
  height: number | null;
  sizeBytes: number;
} | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") {
    const decoded = decodeScreenshotString(value);
    if (!decoded) return null;
    return {
      ...decoded,
      resultKeys: [],
      width: null,
      height: null,
      sizeBytes: decoded.bytes.byteLength,
    };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      bytes: value,
      mimeType: "image/jpeg",
      resultKeys: [],
      width: null,
      height: null,
      sizeBytes: value.byteLength,
    };
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const image = extractScreenshotImage(entry, depth + 1);
      if (image) return image;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const resultKeys = Object.keys(record).sort();
  for (const key of ["screenshot", "image", "data", "base64", "content", "buffer"]) {
    const image = extractScreenshotImage(record[key], depth + 1);
    if (image) {
      return {
        ...image,
        resultKeys: image.resultKeys.length > 0 ? image.resultKeys : resultKeys,
        width: image.width ?? findNestedNumberField(value, "width"),
        height: image.height ?? findNestedNumberField(value, "height"),
        sizeBytes:
          findNestedNumberField(value, "sizeBytes") ??
          findNestedNumberField(value, "size_bytes") ??
          image.sizeBytes,
      };
    }
  }
  for (const nested of Object.values(record)) {
    const image = extractScreenshotImage(nested, depth + 1);
    if (image) {
      return {
        ...image,
        resultKeys: image.resultKeys.length > 0 ? image.resultKeys : resultKeys,
        width: image.width ?? findNestedNumberField(value, "width"),
        height: image.height ?? findNestedNumberField(value, "height"),
        sizeBytes:
          findNestedNumberField(value, "sizeBytes") ??
          findNestedNumberField(value, "size_bytes") ??
          image.sizeBytes,
      };
    }
  }
  return null;
}

function normalizeDaytonaAppPreviewPort(value: unknown): number {
  const port = normalizeWorkspacePreviewPort(value);
  if (port === null) {
    throw new Error("daytona_preview_port_invalid");
  }
  return port;
}

function isDaytonaSandboxUnavailableForPreviewState(value: unknown): boolean {
  const state = String(value ?? "").trim().toLowerCase();
  return (
    state === "stopping" ||
    state === "stopped" ||
    state === "archiving" ||
    state === "archived" ||
    state === "pausing" ||
    state === "paused" ||
    state === "destroying" ||
    state === "destroyed" ||
    state === "error" ||
    state === "build_failed"
  );
}

function normalizeDaytonaWorkspaceRelativePath(
  value: unknown,
  fallback = ".",
): string {
  const candidate = String(value ?? "").trim().replaceAll("\\", "/");
  if (!candidate) return fallback;
  if (candidate.startsWith("/")) throw new Error("path_outside_workspace");
  const parts = candidate
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("path_outside_workspace");
  }
  const segments =
    parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  return segments.length > 0 ? segments.join("/") : fallback;
}

function readDaytonaWorkspaceReadLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(400, Math.max(1, Math.floor(parsed)));
}

function readDaytonaWorkspaceReadOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeDaytonaPreviewPath(value: unknown): string | null {
  const path = String(value ?? "").trim();
  if (!path) return null;
  if (path.includes("://") || path.startsWith("//")) {
    throw new Error("invalid_preview_path");
  }
  return path.startsWith("/") ? path.slice(0, 1024) : `/${path.slice(0, 1023)}`;
}

function normalizeDaytonaPreviewLabel(value: unknown, port: number): string {
  return String(value ?? "").trim().slice(0, 120) || `Daytona app :${port}`;
}

function normalizeSandboxName(value: string): string {
  const suffix =
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || randomBytes(6).toString("hex");
  return `polynet-codex-${suffix}-${Date.now()}`;
}

function buildDaytonaConfig(): JsonRecord {
  const config: JsonRecord = {};
  const apiKey = readEnv("DAYTONA_API_KEY");
  const apiUrl = readEnv("DAYTONA_API_URL");
  const target = readEnv("DAYTONA_TARGET");
  const jwtToken = readEnv("DAYTONA_JWT_TOKEN");
  const organizationId = readFirstEnv(["DAYTONA_ORGANIZATION_ID", "DAYTONA_ORG_ID"]);
  if (apiKey) config.apiKey = apiKey;
  if (apiUrl) config.apiUrl = apiUrl;
  if (target) config.target = target;
  if (jwtToken) config.jwtToken = jwtToken;
  if (organizationId) config.organizationId = organizationId;
  return config;
}

function readDaytonaProviderEphemeralForLifecycleMode(
  lifecycleMode: DaytonaTargetLifecycleMode,
): boolean {
  return readBooleanEnv(
    "POLYNET_DAYTONA_DIRECT_EPHEMERAL",
    defaultDaytonaProviderEphemeralForLifecycleMode(lifecycleMode),
  );
}

function buildDaytonaTargetLifecycleConfig(
  lifecycleMode: DaytonaTargetLifecycleMode,
): DaytonaTargetLifecycleConfig {
  const policy = DAYTONA_RUNTIME_POLICY.daytonaSandbox;
  return {
    snapshotId: readEnv("DAYTONA_SNAPSHOT") || null,
    targetRegion: readEnv("DAYTONA_TARGET") || null,
    autoStopMinutes: readIntegerEnv(
      "POLYNET_DAYTONA_DIRECT_AUTO_STOP_MINUTES",
      policy.autoStopIntervalMinutes,
    ),
    autoArchiveMinutes: readIntegerEnv(
      "POLYNET_DAYTONA_DIRECT_AUTO_ARCHIVE_MINUTES",
      policy.autoArchiveIntervalMinutes,
    ),
    autoDeleteMinutes: readIntegerEnv(
      "POLYNET_DAYTONA_DIRECT_AUTO_DELETE_MINUTES",
      policy.autoDeleteIntervalMinutes,
    ),
    publicPreview: readBooleanEnv(
      "POLYNET_DAYTONA_DIRECT_PUBLIC_PREVIEW",
      policy.publicPreview,
    ),
    providerEphemeral: readDaytonaProviderEphemeralForLifecycleMode(lifecycleMode),
    resources: {
      cpu: readNumberEnv("POLYNET_DAYTONA_DIRECT_CPU", policy.defaultResources.cpu),
      memory: readNumberEnv("POLYNET_DAYTONA_DIRECT_MEMORY", policy.defaultResources.memory),
      disk: readNumberEnv("POLYNET_DAYTONA_DIRECT_DISK", policy.defaultResources.disk),
    },
  };
}

function readConfiguredReusableSandboxId(): string {
  return readEnv("POLYNET_DAYTONA_DIRECT_SANDBOX_ID");
}

function readDaytonaTargetLifecycleMode(): DaytonaTargetLifecycleMode {
  if (readConfiguredReusableSandboxId()) return "prepared_staging_reuse";
  const explicit = readEnv("POLYNET_DAYTONA_DIRECT_LIFECYCLE_MODE");
  if (explicit === "per_turn_ephemeral") return "per_turn_ephemeral";
  if (explicit === "thread_ephemeral") return "thread_ephemeral";
  return "per_turn_ephemeral";
}

function normalizeDaytonaTargetLifecycleMode(
  value: unknown,
  sandboxId: string | null,
): DaytonaTargetLifecycleMode {
  if (
    value === "prepared_staging_reuse" ||
    value === "thread_ephemeral" ||
    value === "per_turn_ephemeral"
  ) {
    return value;
  }
  const configuredSandboxId = readConfiguredReusableSandboxId();
  if (configuredSandboxId && sandboxId === configuredSandboxId) return "prepared_staging_reuse";
  return "per_turn_ephemeral";
}

function isDaytonaNotFoundError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /not found|\b404\b/i.test(message);
}

function isActivePreviewLease(target: JsonRecord | null, nowMs: number): boolean {
  if (!target) return false;
  if (String(target.previewLeaseState ?? "") !== "active") return false;
  if (Number(target.previewLeaseExpiresAt ?? 0) <= nowMs) return false;
  const ports = Array.isArray(target.activePreviewPorts) ? target.activePreviewPorts : [];
  return ports.some((port) => Number.isFinite(Number(port)) && Number(port) > 0);
}

function resolveHumanSaveRetentionExpiresAt(target: JsonRecord | null, nowMs: number): number {
  const existingExpiresAt = Number(target?.workspaceRetentionExpiresAt ?? 0);
  if (
    String(target?.workspaceRetentionState ?? "") === "human_save_pending" &&
    Number.isFinite(existingExpiresAt) &&
    existingExpiresAt > nowMs
  ) {
    return existingExpiresAt;
  }
  return nowMs + readHumanSaveRetentionMs();
}

function hasDaytonaCredentials(): boolean {
  return Boolean(readEnv("DAYTONA_API_KEY") || readEnv("DAYTONA_JWT_TOKEN"));
}

async function loadDaytona(): Promise<{ Daytona: new (config?: JsonRecord) => DaytonaClient }> {
  return (await import("@daytona/sdk")) as {
    Daytona: new (config?: JsonRecord) => DaytonaClient;
  };
}

async function runRemote(
  sandbox: DaytonaSandbox,
  command: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutSeconds?: number;
    allowFailure?: boolean;
  },
): Promise<{
  exitCode: number;
  output: string;
}> {
  const result = await sandbox.process.executeCommand(
    command,
    options?.cwd,
    options?.env,
    options?.timeoutSeconds ?? 60,
  );
  const output = commandOutput(result);
  if (!options?.allowFailure && result.exitCode !== 0) {
    throw new Error(
      [
        "daytona_direct_command_failed",
        `exit_code=${result.exitCode}`,
        `command=${command.slice(0, 260)}`,
        `output=${output.slice(0, 3000)}`,
      ].join("\n"),
    );
  }
  return { exitCode: result.exitCode, output };
}

async function runRemoteBash(
  sandbox: DaytonaSandbox,
  script: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutSeconds?: number;
    allowFailure?: boolean;
  },
) {
  return await runRemote(sandbox, `bash -lc ${shellQuote(script)}`, options);
}

function parseWorkspaceScanOutput(output: string, exitCode: number): DaytonaWorkspaceScanResult {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const countLine = lines.find((line) => line.startsWith("meaningful_file_count="));
  const count = Number.parseInt(String(countLine ?? "").split("=")[1] ?? "", 10);
  const markerIndex = lines.indexOf("meaningful_file_preview:");
  const preview =
    markerIndex >= 0
      ? lines
          .slice(markerIndex + 1)
          .map((line) => line.replace(/^\.?\//, ""))
          .filter(Boolean)
          .slice(0, 20)
      : [];
  if (exitCode !== 0 || !Number.isFinite(count)) {
    return {
      ok: false,
      changeState: "scan_failed",
      meaningfulFileCount: 0,
      meaningfulFilePreview: preview,
      outputPreview: output.slice(0, 2000),
    };
  }
  return {
    ok: true,
    changeState: count > 0 ? "dirty" : "clean",
    meaningfulFileCount: Math.max(0, count),
    meaningfulFilePreview: preview,
    outputPreview: output.slice(0, 2000),
  };
}

async function scanDaytonaWorkspaceForMeaningfulFiles(params: {
  sandbox: DaytonaSandbox;
  workspaceRoot: string;
}): Promise<DaytonaWorkspaceScanResult> {
  const script = [
    "set -euo pipefail",
    "tmp_file=\"$(mktemp)\"",
    "trap 'rm -f \"$tmp_file\"' EXIT",
    "if ! test -d .; then echo 'meaningful_file_count=0'; echo 'meaningful_file_preview:'; exit 0; fi",
    [
      "find .",
      "\\(",
      "-name '.git'",
      "-o -name 'node_modules'",
      "-o -name 'dist'",
      "-o -name 'build'",
      "-o -name '.next'",
      "-o -name '.vite'",
      "-o -name '.cache'",
      "-o -name 'coverage'",
      "-o -name 'tmp'",
      "-o -name 'logs'",
      "\\) -prune",
      "-o -type f -print > \"$tmp_file\"",
    ].join(" "),
    "count=\"$(wc -l < \"$tmp_file\" | tr -d ' ')\"",
    "echo \"meaningful_file_count=${count:-0}\"",
    "echo 'meaningful_file_preview:'",
    "sed 's#^./##' \"$tmp_file\" | head -20",
  ].join("\n");
  const result = await runRemoteBash(params.sandbox, script, {
    cwd: params.workspaceRoot,
    timeoutSeconds: 30,
    allowFailure: true,
  });
  return parseWorkspaceScanOutput(result.output, result.exitCode);
}

async function deleteDaytonaSandbox(params: {
  daytona: DaytonaClient;
  sandbox: DaytonaSandbox;
  timeoutSeconds: number;
}): Promise<void> {
  if (typeof params.sandbox.delete === "function") {
    await params.sandbox.delete(params.timeoutSeconds);
    return;
  }
  if (typeof params.daytona.delete === "function") {
    await params.daytona.delete(params.sandbox, params.timeoutSeconds);
    return;
  }
  throw new Error("daytona_direct_provider_delete_unsupported");
}

function buildWorkerEnv(params: {
  sandboxId: string;
  authToken: string;
  remoteRoot: string;
}): Record<string, string> {
  const workspaceRoot = readEnv("POLYNET_DAYTONA_WORKSPACE_ROOT") || DEFAULT_WORKSPACE_ROOT;
  const env: Record<string, string> = {
    POLYNET_CODEX_WORKSPACE_HOST: "daytona",
    POLYNET_DAYTONA_WORKSPACE_ROOT: workspaceRoot,
    POLYNET_CODEX_WORKER_AGENT_CWD: workspaceRoot,
    POLYNET_CODEX_WORKER_HOST: "127.0.0.1",
    POLYNET_CODEX_WORKER_PORT: String(WORKER_PORT),
    POLYNET_CODEX_WORKER_AUTH_TOKEN: params.authToken,
    POLYNET_CODEX_WORKER_CODEX_BIN:
      readEnv("POLYNET_CODEX_WORKER_CODEX_BIN") ||
      `${params.remoteRoot}/node_modules/.bin/codex`,
    POLYNET_CODEX_WORKER_MODEL:
      readEnv("POLYNET_CODEX_WORKER_MODEL") ||
      DAYTONA_RUNTIME_POLICY.nativeCodex.defaultModelId,
    POLYNET_DEPLOYMENT_KIND: readEnv("POLYNET_DEPLOYMENT_KIND") || "staging",
    CONVEX_DEPLOYMENT: readEnv("CONVEX_DEPLOYMENT") || "dev:quick-porcupine-949",
    DAYTONA_SANDBOX_ID: params.sandboxId,
  };
  const previewPattern = readEnv("POLYNET_DAYTONA_PREVIEW_URL_PATTERN");
  if (previewPattern) env.POLYNET_DAYTONA_PREVIEW_URL_PATTERN = previewPattern;
  return env;
}

function envBlock(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
}

async function createOrGetSandbox(params: {
  daytona: DaytonaClient;
  runId: string;
  ownerId: string;
  threadId: string;
  projectId: string | null;
  lifecycle: DaytonaTargetLifecycleConfig;
  existingSandboxId?: string | null;
}): Promise<DaytonaSandbox> {
  const existingSandboxId = readConfiguredReusableSandboxId();
  if (existingSandboxId) return await params.daytona.get(existingSandboxId);
  if (params.existingSandboxId) {
    try {
      return await params.daytona.get(params.existingSandboxId);
    } catch (error) {
      if (!isDaytonaNotFoundError(error)) throw error;
    }
  }

  const snapshot = params.lifecycle.snapshotId;
  if (!snapshot && !readBooleanEnv("POLYNET_DAYTONA_DIRECT_ALLOW_EMPTY_SANDBOX", false)) {
    throw new Error("daytona_direct_snapshot_required");
  }

  const labels: Record<string, string> = {
    app: "polynet",
    purpose: "codex-runtime-direct",
    environment: readEnv("POLYNET_DEPLOYMENT_KIND") || "staging",
    run_id: params.runId.slice(0, 96),
    owner_id: params.ownerId.slice(0, 96),
    thread_id: params.threadId.slice(0, 96),
  };
  if (params.projectId) labels.project_id = params.projectId.slice(0, 96);

  return await params.daytona.create(
    {
      language: "typescript",
      name: normalizeSandboxName(params.runId),
      labels,
      public: params.lifecycle.publicPreview,
      ephemeral: params.lifecycle.providerEphemeral,
      autoStopInterval: params.lifecycle.autoStopMinutes,
      autoArchiveInterval: params.lifecycle.autoArchiveMinutes,
      autoDeleteInterval: params.lifecycle.providerEphemeral
        ? 0
        : params.lifecycle.autoDeleteMinutes,
      ...(snapshot ? { snapshot } : { resources: params.lifecycle.resources }),
    },
    {
      timeout: readIntegerEnv("POLYNET_DAYTONA_DIRECT_CREATE_TIMEOUT_SECONDS", 180),
    },
  );
}

async function ensureSandboxStarted(sandbox: DaytonaSandbox, timeoutSeconds: number): Promise<void> {
  if (sandbox.state !== "started" && typeof sandbox.start === "function") {
    await sandbox.start(timeoutSeconds);
    return;
  }
  await sandbox.waitUntilStarted?.(timeoutSeconds);
}

async function startWorker(params: {
  sandbox: DaytonaSandbox;
  authToken: string;
}): Promise<JsonRecord> {
  const remoteRoot = readEnv("POLYNET_DAYTONA_DIRECT_REMOTE_ROOT") || DEFAULT_REMOTE_ROOT;
  const workerLog = readEnv("POLYNET_DAYTONA_DIRECT_WORKER_LOG") || "/tmp/polynet-codex-worker.log";
  const workerPid = readEnv("POLYNET_DAYTONA_DIRECT_WORKER_PID") || "/tmp/polynet-codex-worker.pid";
  const workerEnv = buildWorkerEnv({
    sandboxId: params.sandbox.id,
    authToken: params.authToken,
    remoteRoot,
  });
  const defaultStartCommand = [
    "set -euo pipefail",
    "test -f package.json || { echo 'daytona_snapshot_runtime_incomplete:package_json_missing' >&2; exit 42; }",
    "test -d node_modules || { echo 'daytona_snapshot_runtime_incomplete:node_modules_missing' >&2; exit 42; }",
    "test -x node_modules/.bin/codex || { echo 'daytona_snapshot_runtime_incomplete:codex_cli_missing' >&2; exit 42; }",
    "test -f scripts/run_polynet_codex_worker_service_local.sh || { echo 'daytona_snapshot_runtime_incomplete:worker_runner_missing' >&2; exit 42; }",
    `mkdir -p ${shellQuote(workerEnv.POLYNET_DAYTONA_WORKSPACE_ROOT)}`,
    `if test -f ${shellQuote(workerPid)}; then kill "$(cat ${shellQuote(workerPid)})" 2>/dev/null || true; fi`,
    `nohup env ${envBlock(workerEnv)} bash scripts/run_polynet_codex_worker_service_local.sh > ${shellQuote(
      workerLog,
    )} 2>&1 & echo $! > ${shellQuote(workerPid)}`,
    `test -s ${shellQuote(workerPid)}`,
  ].join("\n");

  await runRemoteBash(params.sandbox, defaultStartCommand, {
    cwd: remoteRoot,
    timeoutSeconds: readIntegerEnv("POLYNET_DAYTONA_DIRECT_WORKER_START_TIMEOUT_SECONDS", 900),
  });

  return await checkWorkerHealth({
    sandbox: params.sandbox,
    authToken: params.authToken,
    timeoutMs: readIntegerEnv("POLYNET_DAYTONA_DIRECT_WORKER_HEALTH_TIMEOUT_SECONDS", 120) * 1000,
    pollMs: readBoundedIntegerEnv(
      "POLYNET_DAYTONA_DIRECT_WORKER_HEALTH_POLL_MS",
      250,
      100,
      1500,
    ),
    workerLog,
  });
}

async function checkWorkerHealth(params: {
  sandbox: DaytonaSandbox;
  authToken: string;
  timeoutMs: number;
  pollMs: number;
  workerLog: string;
}): Promise<JsonRecord> {
  const startedAt = Date.now();
  let lastOutput = "";
  while (Date.now() - startedAt < params.timeoutMs) {
    const result = await runRemote(
      params.sandbox,
      `curl -sS -H ${shellQuote(`Authorization: Bearer ${params.authToken}`)} http://127.0.0.1:${WORKER_PORT}/healthz || true`,
      { timeoutSeconds: 10, allowFailure: true },
    );
    lastOutput = result.output.trim();
    if (lastOutput.startsWith("{")) {
      const parsed = JSON.parse(lastOutput) as JsonRecord;
      if (parsed.worker_http_ready === true || parsed.ok === true) return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, params.pollMs));
  }
  const logs = await runRemote(
    params.sandbox,
    `tail -240 ${shellQuote(params.workerLog)} 2>/dev/null || true`,
    { timeoutSeconds: 10, allowFailure: true },
  );
  throw new Error(
    [
      "daytona_direct_worker_health_timeout",
      `last_health=${lastOutput.slice(0, 2000)}`,
      `worker_log=${logs.output.slice(0, 6000)}`,
    ].join("\n"),
  );
}

export const ensureDaytonaCodexRuntimeTargetInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
  },
  handler: async (ctx, args): Promise<{
    ok: true;
    targetId: string;
    sandboxId: string;
    sandboxName: string | null;
    workerUrl: string;
    authToken: string;
    signedPreviewExpiresAt: number;
    workerPort: number;
    snapshotId: string | null;
    targetRegion: string | null;
    autoStopMinutes: number;
    autoArchiveMinutes: number;
    autoDeleteMinutes: number;
    lifecycleMode: DaytonaTargetLifecycleMode;
    providerEphemeral: boolean;
    workspaceRoot: string;
    timing: DaytonaTargetTiming;
  }> => {
    if (!hasDaytonaCredentials()) {
      throw new Error("daytona_direct_credentials_missing");
    }
    const targetStartedAtMs = Date.now();
    const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
    if (!authToken) {
      throw new Error("polynet_codex_worker_auth_token_missing");
    }
    const lifecycleMode = readDaytonaTargetLifecycleMode();
    const lifecycle = buildDaytonaTargetLifecycleConfig(lifecycleMode);
    const workspaceRoot = readEnv("POLYNET_DAYTONA_WORKSPACE_ROOT") || DEFAULT_WORKSPACE_ROOT;

    const targetClaimStartedAtMs = Date.now();
    const claimed = (await ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .claimDaytonaCodexRuntimeTargetInternal as any,
      {
        ownerId: args.ownerId,
        threadId: args.threadId,
        runId: args.runId,
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(lifecycle.snapshotId ? { snapshotId: lifecycle.snapshotId } : {}),
        ...(lifecycle.targetRegion ? { targetRegion: lifecycle.targetRegion } : {}),
        lifecycleMode,
        providerEphemeral: lifecycle.providerEphemeral,
        workspaceRoot,
        autoStopMinutes: lifecycle.autoStopMinutes,
        autoArchiveMinutes: lifecycle.autoArchiveMinutes,
        autoDeleteMinutes: lifecycle.autoDeleteMinutes,
        nowMs: Date.now(),
      },
    )) as {
      targetId: string;
      ready?: boolean;
      target?: JsonRecord | null;
    };
    const timing: DaytonaTargetTiming = {
      target_claim_ms: elapsedMs(targetClaimStartedAtMs),
      sandbox_create_or_get_ms: 0,
      sandbox_start_ms: 0,
      worker_start_ms: 0,
      worker_http_ready_ms: 0,
      worker_health_ready_mode: "cached",
      codex_app_server_init_ms: null,
      preview_url_ms: 0,
      target_ready_persist_ms: 0,
      target_ready_total_ms: 0,
      cached_target_ready: false,
    };

    if (claimed.ready && claimed.target) {
      timing.cached_target_ready = true;
      timing.target_ready_total_ms = elapsedMs(targetStartedAtMs);
      return {
        ok: true,
        targetId: claimed.targetId,
        sandboxId: String(claimed.target.sandboxId ?? ""),
        sandboxName: String(claimed.target.sandboxName ?? "") || null,
        workerUrl: String(claimed.target.workerUrl ?? ""),
        authToken,
        workspaceRoot: String(claimed.target.workspaceRoot ?? workspaceRoot),
        signedPreviewExpiresAt: Number(claimed.target.signedPreviewExpiresAt ?? 0),
        workerPort: Number(claimed.target.workerPort ?? WORKER_PORT),
        snapshotId:
          String(claimed.target.snapshotId ?? lifecycle.snapshotId ?? "").trim() || null,
        targetRegion:
          String(claimed.target.targetRegion ?? lifecycle.targetRegion ?? "").trim() || null,
        autoStopMinutes: readPositiveNumber(
          claimed.target.autoStopMinutes,
          lifecycle.autoStopMinutes,
        ),
        autoArchiveMinutes: readPositiveNumber(
          claimed.target.autoArchiveMinutes,
          lifecycle.autoArchiveMinutes,
        ),
        autoDeleteMinutes: readPositiveNumber(
          claimed.target.autoDeleteMinutes,
          lifecycle.autoDeleteMinutes,
        ),
        lifecycleMode: normalizeDaytonaTargetLifecycleMode(
          claimed.target.lifecycleMode,
          String(claimed.target.sandboxId ?? "") || null,
        ),
        providerEphemeral:
          typeof claimed.target.providerEphemeral === "boolean"
            ? claimed.target.providerEphemeral
            : lifecycle.providerEphemeral,
        timing,
      };
    }

    try {
      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      const sandboxCreateOrGetStartedAtMs = Date.now();
      const sandbox = await createOrGetSandbox({
        daytona,
        runId: args.runId,
        ownerId: String(args.ownerId),
        threadId: String(args.threadId),
        projectId: args.projectId ? String(args.projectId) : null,
        lifecycle,
        existingSandboxId:
          lifecycleMode === "thread_ephemeral"
            ? String(claimed.target?.sandboxId ?? "").trim() || null
            : null,
      });
      timing.sandbox_create_or_get_ms = elapsedMs(sandboxCreateOrGetStartedAtMs);
      const sandboxStartStartedAtMs = Date.now();
      await ensureSandboxStarted(
        sandbox,
        readIntegerEnv("POLYNET_DAYTONA_DIRECT_START_TIMEOUT_SECONDS", 180),
      );
      timing.sandbox_start_ms = elapsedMs(sandboxStartStartedAtMs);
      const previewSeconds = readIntegerEnv("POLYNET_DAYTONA_DIRECT_PREVIEW_SECONDS", 7200);
      const workerStartStartedAtMs = Date.now();
      const previewUrlStartedAtMs = Date.now();
      const [workerHealth, preview] = await Promise.all([
        startWorker({ sandbox, authToken }).finally(() => {
          timing.worker_start_ms = elapsedMs(workerStartStartedAtMs);
          timing.worker_http_ready_ms = timing.worker_start_ms;
        }),
        Promise.resolve(sandbox.getSignedPreviewUrl?.(WORKER_PORT, previewSeconds)).finally(() => {
          timing.preview_url_ms = elapsedMs(previewUrlStartedAtMs);
        }),
      ]);
      const codexHealth =
        workerHealth.codex && typeof workerHealth.codex === "object" && !Array.isArray(workerHealth.codex)
          ? (workerHealth.codex as JsonRecord)
          : null;
      timing.codex_app_server_init_ms = readOptionalNonNegativeNumber(codexHealth?.init_latency_ms);
      timing.worker_health_ready_mode = codexHealth?.initialized === true ? "codex" : "http";
      const workerUrl = normalizeUrl(
        typeof preview === "string" ? preview : preview?.url,
      );
      if (!workerUrl) throw new Error("daytona_direct_preview_url_missing");
      const signedPreviewExpiresAt = Date.now() + previewSeconds * 1000;
      const readyPersistStartedAtMs = Date.now();
      const ready = (await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetReadyInternal as any,
        {
          targetId: claimed.targetId,
          sandboxId: sandbox.id,
          ...(sandbox.name ? { sandboxName: sandbox.name } : {}),
          sandboxState: "started",
          workerUrl,
          signedPreviewExpiresAt,
          lastHealthAt: Date.now(),
          nowMs: Date.now(),
        },
      )) as JsonRecord;
      timing.target_ready_persist_ms = elapsedMs(readyPersistStartedAtMs);
      timing.target_ready_total_ms = elapsedMs(targetStartedAtMs);
      return {
        ok: true,
        targetId: claimed.targetId,
        sandboxId: sandbox.id,
        sandboxName: String(ready?.sandboxName ?? sandbox.name ?? "") || null,
        workerUrl,
        authToken,
        signedPreviewExpiresAt,
        workerPort: WORKER_PORT,
        snapshotId: lifecycle.snapshotId,
        targetRegion: lifecycle.targetRegion,
        autoStopMinutes: lifecycle.autoStopMinutes,
        autoArchiveMinutes: lifecycle.autoArchiveMinutes,
        autoDeleteMinutes: lifecycle.autoDeleteMinutes,
        lifecycleMode,
        providerEphemeral: lifecycle.providerEphemeral,
        workspaceRoot,
        timing,
      };
    } catch (error) {
      const message = sanitizeDaytonaRuntimeError(error);
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetErrorInternal as any,
        {
          targetId: claimed.targetId,
          errorCode: daytonaRuntimeErrorCode(error),
          errorMessage: message,
          nowMs: Date.now(),
        },
      );
      throw new Error(message);
    }
  },
});

async function ensureDaytonaWorkspaceSandboxForRun(params: {
  ctx: any;
  ownerId: any;
  threadId: any;
  runId: string;
  projectId?: any;
}): Promise<{
  targetId: string;
  sandboxId: string;
  workspaceRoot: string;
  sandbox: DaytonaSandbox;
}> {
  const target = (await params.ctx.runAction(
    (internal as any).daytonaCodexRuntimeTargetActions
      .ensureDaytonaCodexRuntimeTargetInternal as any,
    {
      ownerId: params.ownerId,
      threadId: params.threadId,
      runId: params.runId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    },
  )) as JsonRecord;
  const sandboxId = String(target.sandboxId ?? "").trim();
  if (!sandboxId) throw new Error("daytona_sandbox_not_available");
  const { Daytona } = await loadDaytona();
  const daytona = new Daytona(buildDaytonaConfig());
  const sandbox = await daytona.get(sandboxId);
  await ensureSandboxStarted(
    sandbox,
    readIntegerEnv("POLYNET_DAYTONA_DIRECT_START_TIMEOUT_SECONDS", 180),
  );
  return {
    targetId: String(target.targetId ?? "").trim(),
    sandboxId,
    workspaceRoot: String(target.workspaceRoot ?? "").trim() || DEFAULT_WORKSPACE_ROOT,
    sandbox,
  };
}

function buildDaytonaSafePathPrelude(relPath: string): string {
  return [
    "set -euo pipefail",
    'ROOT="$(pwd -P)"',
    `REL_PATH=${shellQuote(relPath)}`,
    'REAL_PATH="$(realpath -m -- "$REL_PATH")"',
    'case "$REAL_PATH" in "$ROOT"|"$ROOT"/*) ;; *) echo "path_outside_workspace" >&2; exit 42;; esac',
  ].join("\n");
}

function buildDaytonaSafeFilePrelude(relPath: string): string {
  return [
    buildDaytonaSafePathPrelude(relPath),
    'if [ -L "$REL_PATH" ]; then echo "workspace_symlink_refused" >&2; exit 43; fi',
  ].join("\n");
}

async function runDaytonaWorkspaceToolCommand(params: {
  sandbox: DaytonaSandbox;
  workspaceRoot: string;
  relPath?: string;
  script: string;
  timeoutSeconds?: number;
  allowFailure?: boolean;
}): Promise<{ exitCode: number; output: string }> {
  return await runRemoteBash(params.sandbox, params.script, {
    cwd: params.workspaceRoot,
    timeoutSeconds: params.timeoutSeconds ?? 60,
    allowFailure: params.allowFailure ?? true,
  });
}

export const executeDaytonaWorkspaceToolInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
    toolName: v.string(),
    normalizedArgs: v.any(),
  },
  handler: async (ctx, args): Promise<JsonRecord> => {
    try {
      const toolName = String(args.toolName ?? "").trim();
      const normalizedArgs = asRecord(args.normalizedArgs) ?? {};
      const target = await ensureDaytonaWorkspaceSandboxForRun({
        ctx,
        ownerId: args.ownerId,
        threadId: args.threadId,
        runId: args.runId,
        ...(args.projectId ? { projectId: args.projectId } : {}),
      });

      const basePayload = {
        provider_id: "daytona",
        target_run_id: args.runId,
        target_id: target.targetId || null,
        sandbox_id: target.sandboxId,
        workspace_root: target.workspaceRoot,
      };

      if (toolName === "list_dir") {
        const relPath = normalizeDaytonaWorkspaceRelativePath(normalizedArgs.path);
        const script = [
          buildDaytonaSafePathPrelude(relPath),
          'if [ ! -d "$REAL_PATH" ]; then echo "workspace_path_not_directory" >&2; exit 44; fi',
          'cd -- "$REAL_PATH"',
          "find . -mindepth 1 -maxdepth 2 -print",
          "| sed 's#^\\./##'",
          "| while IFS= read -r path; do",
          '  [ -n "$path" ] || continue;',
          '  if [ -d "$path" ]; then printf "dir\\t%s\\n" "$path";',
          '  elif [ -f "$path" ]; then printf "file\\t%s\\n" "$path"; fi;',
          "done",
          "| LC_ALL=C sort",
          "| head -n 200",
        ].join("\n");
        const result = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script,
          timeoutSeconds: 20,
        });
        if (result.exitCode !== 0) {
          return {
            ok: false,
            ...basePayload,
            code: "daytona_workspace_list_failed",
            message: `Failed to list Daytona workspace directory '${relPath}'.`,
            exit_code: result.exitCode,
            output_preview: result.output.slice(0, 2000),
          };
        }
        return {
          ok: true,
          ...basePayload,
          rel_path: relPath,
          output_text: result.output.trim() || "(empty directory)",
          exit_code: 0,
        };
      }

      if (toolName === "read") {
        const relPath = normalizeDaytonaWorkspaceRelativePath(normalizedArgs.path);
        const offset = readDaytonaWorkspaceReadOffset(normalizedArgs.offset);
        const limit = readDaytonaWorkspaceReadLimit(normalizedArgs.limit);
        const end = offset + limit - 1;
        const script = [
          buildDaytonaSafeFilePrelude(relPath),
          'if [ -d "$REAL_PATH" ]; then',
          '  cd -- "$REAL_PATH"',
          "  find . -mindepth 1 -maxdepth 2 -print | sed 's#^\\./##' | LC_ALL=C sort | head -n 200",
          "  exit 0",
          "fi",
          'if [ ! -f "$REAL_PATH" ]; then echo "workspace_path_not_found" >&2; exit 45; fi',
          `sed -n ${shellQuote(`${offset},${end}p`)} -- "$REAL_PATH"`,
        ].join("\n");
        const result = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script,
          timeoutSeconds: 20,
        });
        if (result.exitCode !== 0) {
          return {
            ok: false,
            ...basePayload,
            code: "daytona_workspace_read_failed",
            message: `Failed to read Daytona workspace path '${relPath}'.`,
            exit_code: result.exitCode,
            output_preview: result.output.slice(0, 2000),
          };
        }
        return {
          ok: true,
          ...basePayload,
          rel_path: relPath,
          output_text: result.output.trim() || "(empty file)",
          exit_code: 0,
        };
      }

      if (toolName === "glob" || toolName === "grep" || toolName === "sha256" || toolName === "bash") {
        const relPath = normalizeDaytonaWorkspaceRelativePath(
          toolName === "bash" ? normalizedArgs.cwd : normalizedArgs.path,
        );
        const pattern = String(normalizedArgs.pattern ?? "").trim();
        const command =
          toolName === "glob"
            ? [
                buildDaytonaSafePathPrelude(relPath),
                'cd -- "$REAL_PATH"',
                `find . -mindepth 1 \\( -type f -o -type d \\) -path ${shellQuote(`./${pattern}`)} -print`,
                "| sed 's#^\\./##'",
                "| LC_ALL=C sort",
                "| head -n 200",
              ].join("\n")
            : toolName === "grep"
              ? [
                  buildDaytonaSafePathPrelude(relPath),
                  'cd -- "$REAL_PATH"',
                  "if command -v rg >/dev/null 2>&1; then",
                  `  rg --no-heading --line-number --color never --max-count 200 ${shellQuote(pattern)} .`,
                  "else",
                  `  grep -Rns -m 200 -- ${shellQuote(pattern)} .`,
                  "fi",
                ].join("\n")
              : toolName === "sha256"
                ? [
                    buildDaytonaSafeFilePrelude(normalizeDaytonaWorkspaceRelativePath(normalizedArgs.path)),
                    'if [ ! -f "$REAL_PATH" ]; then echo "workspace_path_not_file" >&2; exit 45; fi',
                    `(sha256sum "$REAL_PATH" 2>/dev/null || shasum -a 256 "$REAL_PATH" 2>/dev/null) | awk '{print $1}'`,
                  ].join("\n")
                : [
                    buildDaytonaSafePathPrelude(relPath),
                    'cd -- "$REAL_PATH"',
                    String(normalizedArgs.command ?? ""),
                  ].join("\n");
        const result = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script: command,
          timeoutSeconds: toolName === "bash" ? 60 : 20,
        });
        if (result.exitCode !== 0 && !(toolName === "grep" && result.exitCode === 1)) {
          return {
            ok: false,
            ...basePayload,
            code: `daytona_workspace_${toolName}_failed`,
            message: `Daytona workspace ${toolName} failed.`,
            exit_code: result.exitCode,
            output_preview: result.output.slice(0, 2000),
          };
        }
        return {
          ok: true,
          ...basePayload,
          rel_path: relPath,
          output_text:
            toolName === "grep" && result.exitCode === 1
              ? "(no matches)"
              : result.output.trim() || (toolName === "glob" ? "(no matches)" : "(no output)"),
          exit_code: 0,
        };
      }

      if (toolName === "write") {
        const relPath = normalizeDaytonaWorkspaceRelativePath(normalizedArgs.path);
        if (relPath === ".") throw new Error("write_path_required");
        const content = String(normalizedArgs.content ?? "");
        const encoded = Buffer.from(content, "utf8").toString("base64");
        const script = [
          buildDaytonaSafeFilePrelude(relPath),
          'PARENT="$(dirname -- "$REL_PATH")"',
          'mkdir -p -- "$PARENT"',
          'REAL_PARENT="$(realpath -m -- "$PARENT")"',
          'case "$REAL_PARENT" in "$ROOT"|"$ROOT"/*) ;; *) echo "path_outside_workspace" >&2; exit 42;; esac',
          'EXISTED=0; [ -e "$REAL_PATH" ] && EXISTED=1',
          `base64 -d > "$REAL_PATH" <<'POLYNET_DAYTONA_FILE_EOF'\n${encoded}\nPOLYNET_DAYTONA_FILE_EOF`,
          `ACTUAL_SHA="$(sha256sum "$REAL_PATH" 2>/dev/null | awk '{print $1}')"`,
          `EXPECTED_SHA="$(printf %s ${shellQuote(encoded)} | base64 -d | sha256sum 2>/dev/null | awk '{print $1}')"`,
          '[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || { echo "write_verification_failed" >&2; exit 46; }',
          'BYTES="$(wc -c < "$REAL_PATH" | tr -d " ")"',
          'if [ "$EXISTED" = "1" ]; then printf "overwrote %s (%s bytes)\\n" "$REL_PATH" "$BYTES"; else printf "created %s (%s bytes)\\n" "$REL_PATH" "$BYTES"; fi',
        ].join("\n");
        const result = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script,
          timeoutSeconds: 30,
        });
        if (result.exitCode !== 0) {
          return {
            ok: false,
            ...basePayload,
            code: "daytona_workspace_write_failed",
            message: `Failed to write Daytona workspace file '${relPath}'.`,
            exit_code: result.exitCode,
            output_preview: result.output.slice(0, 2000),
          };
        }
        return {
          ok: true,
          ...basePayload,
          rel_path: relPath,
          output_text: result.output.trim() || `wrote ${relPath}`,
          exit_code: 0,
        };
      }

      if (toolName === "edit") {
        const relPath = normalizeDaytonaWorkspaceRelativePath(normalizedArgs.path);
        const oldText = String(normalizedArgs.old_text ?? "");
        const newText = String(normalizedArgs.new_text ?? "");
        const sourceResult = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script: [
            buildDaytonaSafeFilePrelude(relPath),
            'if [ ! -f "$REAL_PATH" ]; then echo "workspace_path_not_file" >&2; exit 45; fi',
            'cat -- "$REAL_PATH"',
          ].join("\n"),
          timeoutSeconds: 20,
        });
        if (sourceResult.exitCode !== 0) {
          return {
            ok: false,
            ...basePayload,
            code: "daytona_workspace_edit_failed",
            message: `Failed to read Daytona workspace file '${relPath}' for edit.`,
            exit_code: sourceResult.exitCode,
            output_preview: sourceResult.output.slice(0, 2000),
          };
        }
        const source = sourceResult.output;
        const matches = oldText ? source.split(oldText).length - 1 : 0;
        if (matches < 1) {
          return {
            ok: false,
            ...basePayload,
            code: "edit_target_not_found",
            message: "edit could not find old_text in the target file.",
            output_preview: source.slice(0, 2000),
          };
        }
        if (matches > 1 && normalizedArgs.replace_all !== true) {
          return {
            ok: false,
            ...basePayload,
            code: "edit_target_ambiguous",
            message: "edit found multiple matches for old_text. Use replace_all or narrow the selection.",
            output_preview: source.slice(0, 2000),
          };
        }
        const next =
          normalizedArgs.replace_all === true
            ? source.split(oldText).join(newText)
            : source.replace(oldText, newText);
        const encoded = Buffer.from(next, "utf8").toString("base64");
        const writeResult = await runDaytonaWorkspaceToolCommand({
          sandbox: target.sandbox,
          workspaceRoot: target.workspaceRoot,
          script: [
            buildDaytonaSafeFilePrelude(relPath),
            `base64 -d > "$REAL_PATH" <<'POLYNET_DAYTONA_FILE_EOF'\n${encoded}\nPOLYNET_DAYTONA_FILE_EOF`,
          ].join("\n"),
          timeoutSeconds: 30,
        });
        if (writeResult.exitCode !== 0) {
          return {
            ok: false,
            ...basePayload,
            code: "daytona_workspace_edit_failed",
            message: `Failed to write edited Daytona workspace file '${relPath}'.`,
            exit_code: writeResult.exitCode,
            output_preview: writeResult.output.slice(0, 2000),
          };
        }
        return {
          ok: true,
          ...basePayload,
          rel_path: relPath,
          output_text: `edited ${relPath} (${normalizedArgs.replace_all === true ? matches : 1} replacement${matches === 1 ? "" : "s"})`,
          exit_code: 0,
        };
      }

      return {
        ok: false,
        ...basePayload,
        code: "daytona_workspace_tool_not_supported",
        message: `${toolName} is not supported by the Daytona workspace tool executor.`,
      };
    } catch (error) {
      return {
        ok: false,
        code: daytonaRuntimeErrorCode(error),
        message: sanitizeDaytonaRuntimeError(error),
      };
    }
  },
});

export const startDaytonaAppPreviewInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
    command: v.string(),
    cwd: v.optional(v.string()),
    previewPort: v.number(),
    previewPath: v.optional(v.string()),
    previewLabel: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<JsonRecord> => {
    try {
      const command = String(args.command ?? "").trim();
      if (!command) {
        return {
          ok: false,
          code: "command_required",
          message: "terminal_start requires command.",
        };
      }
      const port = normalizeDaytonaAppPreviewPort(args.previewPort);
      const previewPath = normalizeDaytonaPreviewPath(args.previewPath);
      const previewLabel = normalizeDaytonaPreviewLabel(args.previewLabel, port);
      const relCwd = normalizeDaytonaWorkspaceRelativePath(args.cwd);
      const target = await ensureDaytonaWorkspaceSandboxForRun({
        ctx,
        ownerId: args.ownerId,
        threadId: args.threadId,
        runId: args.runId,
        ...(args.projectId ? { projectId: args.projectId } : {}),
      });
      const logPath = `/tmp/polynet-daytona-preview-${port}.log`;
      const pidPath = `/tmp/polynet-daytona-preview-${port}.pid`;
      const urlPath = previewPath ?? "/";
      const script = [
        buildDaytonaSafePathPrelude(relCwd),
        'if [ ! -d "$REAL_PATH" ]; then echo "workspace_cwd_not_directory" >&2; exit 44; fi',
        'cd -- "$REAL_PATH"',
        `APP_COMMAND=${shellQuote(command)}`,
        `APP_PORT=${port}`,
        `APP_PATH=${shellQuote(urlPath)}`,
        `LOG_PATH=${shellQuote(logPath)}`,
        `PID_PATH=${shellQuote(pidPath)}`,
        'if command -v fuser >/dev/null 2>&1; then fuser -k "$APP_PORT"/tcp >/dev/null 2>&1 || true; fi',
        'rm -f "$LOG_PATH" "$PID_PATH"',
        'setsid bash -lc "$APP_COMMAND" >"$LOG_PATH" 2>&1 &',
        'PID="$!"',
        'echo "$PID" > "$PID_PATH"',
        'READY=0',
        'for attempt in $(seq 1 20); do',
        '  if ! kill -0 "$PID" 2>/dev/null; then break; fi',
        '  if command -v curl >/dev/null 2>&1; then',
        '    if curl -fsS "http://127.0.0.1:${APP_PORT}${APP_PATH}" >/tmp/polynet-daytona-preview-probe.out 2>/tmp/polynet-daytona-preview-probe.err; then READY=1; break; fi',
        "  fi",
        "  sleep 0.5",
        "done",
        'if ! kill -0 "$PID" 2>/dev/null; then echo "process_exited"; tail -80 "$LOG_PATH" || true; exit 47; fi',
        'printf "terminal_session_id=%s\\n" "$PID"',
        'printf "preview_port=%s\\n" "$APP_PORT"',
        'printf "ready=%s\\n" "$READY"',
        'tail -80 "$LOG_PATH" || true',
      ].join("\n");
      const result = await runDaytonaWorkspaceToolCommand({
        sandbox: target.sandbox,
        workspaceRoot: target.workspaceRoot,
        script,
        timeoutSeconds: readIntegerEnv("POLYNET_DAYTONA_PREVIEW_START_TIMEOUT_SECONDS", 20),
      });
      const terminalSessionId =
        result.output.match(/terminal_session_id=(\d+)/)?.[1] ?? "";
      if (result.exitCode !== 0 || !terminalSessionId) {
        return {
          ok: false,
          provider_id: "daytona",
          target_run_id: args.runId,
          target_id: target.targetId || null,
          sandbox_id: target.sandboxId,
          code: "daytona_preview_start_failed",
          message: `Failed to start Daytona preview on port ${port}.`,
          exit_code: result.exitCode,
          output_tail: result.output.slice(-4000),
        };
      }
      return {
        ok: true,
        provider_id: "daytona",
        target_run_id: args.runId,
        target_id: target.targetId || null,
        sandbox_id: target.sandboxId,
        workspace_root: target.workspaceRoot,
        terminal_session_id: terminalSessionId,
        status: "running",
        command,
        cwd: relCwd,
        preview_port: port,
        preview_path: previewPath,
        preview_label: previewLabel,
        preview_status: "running",
        preview_transport_status: "pending",
        preview_inspection_status: "not_attempted",
        preview_render_status: "unknown",
        output_tail: result.output.slice(-4000),
      };
    } catch (error) {
      return {
        ok: false,
        code: daytonaRuntimeErrorCode(error),
        message: sanitizeDaytonaRuntimeError(error),
      };
    }
  },
});

export const resolveDaytonaCodexRuntimePreviewInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    port: v.number(),
    expiresInSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
    preview_proxy_token?: string;
    preview_port?: number;
    preview_path?: string | null;
    preview_label?: string | null;
    expires_at?: number;
    expires_in_seconds?: number;
    auth_mode?: "signed_url";
    preview_transport?: "polynet_preview_gateway";
  }> => {
    try {
      if (!hasDaytonaCredentials()) {
        return {
          ok: false,
          code: "daytona_direct_credentials_missing",
          message: "Daytona credentials are not configured.",
        };
      }
      const port = normalizeDaytonaAppPreviewPort(args.port);
      const expiresInSeconds = Math.max(
        60,
        Math.min(24 * 60 * 60, readPositiveNumber(args.expiresInSeconds, 2 * 60 * 60)),
      );
      const target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
        },
      )) as JsonRecord | null;
      if (!target) {
        return {
          ok: false,
          code: "daytona_runtime_target_not_found",
          message: "Daytona runtime target was not found for this run.",
        };
      }
      const sandboxId = String(target.sandboxId ?? "").trim();
      const sandboxState = String(target.sandboxState ?? "").trim();
      const providerTeardownState = String(target.providerTeardownState ?? "").trim();
      if (
        !sandboxId ||
        sandboxState === "deleted" ||
        sandboxState === "stopped" ||
        providerTeardownState === "deleted" ||
        providerTeardownState === "stopped"
      ) {
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
        };
      }
      const previewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);
      const previewLeaseActive =
        String(target.previewLeaseState ?? "") === "active" &&
        Number.isFinite(previewLeaseExpiresAt) &&
        previewLeaseExpiresAt > Date.now();
      const activePreviewPorts = normalizeActivePreviewPorts(target.activePreviewPorts);
      if (!previewLeaseActive || !activePreviewPorts.includes(port)) {
        return {
          ok: false,
          code: "daytona_preview_not_authorized",
          message: "This Daytona app preview is no longer active.",
        };
      }

      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      let sandbox: DaytonaSandbox;
      try {
        sandbox = await daytona.get(sandboxId);
      } catch (error) {
        if (!isDaytonaNotFoundError(error)) throw error;
        const nowMs = Date.now();
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            state: "deleted",
            reason: "preview_resolution:sandbox_missing",
            nowMs,
          },
        );
        await appendDaytonaPreviewStoppedEventBestEffort({
          ctx,
          ownerId: args.ownerId,
          runId: args.runId,
          target,
          reason: "preview_resolution:sandbox_missing",
          source: "preview_resolution_sandbox_missing",
          ports: activePreviewPorts,
          nowMs,
        });
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
        };
      }
      const providerSandboxState = String(sandbox.state ?? "").trim();
      if (isDaytonaSandboxUnavailableForPreviewState(providerSandboxState)) {
        const providerState =
          providerSandboxState === "destroyed" || providerSandboxState === "destroying"
            ? "deleted"
            : "stopped";
        const nowMs = Date.now();
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            state: providerState,
            reason: `preview_resolution:${providerSandboxState || "unavailable"}`,
            nowMs,
          },
        );
        await appendDaytonaPreviewStoppedEventBestEffort({
          ctx,
          ownerId: args.ownerId,
          runId: args.runId,
          target,
          reason: `preview_resolution:${providerSandboxState || "unavailable"}`,
          source: "preview_resolution_provider_state",
          ports: activePreviewPorts,
          nowMs,
        });
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
        };
      }
      const signedPreview =
        typeof sandbox.getSignedPreviewUrl === "function"
          ? await sandbox.getSignedPreviewUrl(port, expiresInSeconds)
          : null;
      const previewUrl = normalizeUrl(
        typeof signedPreview === "string" ? signedPreview : signedPreview?.url,
      );
      if (!previewUrl) {
        return {
          ok: false,
          code: "daytona_preview_url_missing",
          message: "Daytona did not return a preview URL for this app.",
        };
      }

      const expiresAt = Date.now() + expiresInSeconds * 1000;
      const minted = await mintPreviewProxySessionToken({
        kind: "workspace_preview",
        previewUrl,
        previewToken: null,
        expiresAtMs: expiresAt,
      });
      if (!minted.ok) {
        return {
          ok: false,
          code: minted.code,
          message: minted.message,
        };
      }

      return {
        ok: true,
        preview_proxy_token: minted.token,
        preview_port: port,
        preview_path: null,
        preview_label: `Daytona app :${port}`,
        expires_at: expiresAt,
        expires_in_seconds: expiresInSeconds,
        auth_mode: "signed_url",
        preview_transport: "polynet_preview_gateway",
      };
    } catch (error) {
      return {
        ok: false,
        code: daytonaRuntimeErrorCode(error),
        message: sanitizeDaytonaRuntimeError(error),
      };
    }
  },
});

export const teardownDaytonaCodexRuntimeTargetInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    state: "skipped" | "deleted" | "stopped" | "failed";
    lifecycleMode: DaytonaTargetLifecycleMode | null;
    sandboxId: string | null;
    reason: string;
    timing: DaytonaProviderTeardownTiming;
  }> => {
    const teardownStartedAtMs = Date.now();
    const timing = (): DaytonaProviderTeardownTiming => ({
      provider_teardown_ms: elapsedMs(teardownStartedAtMs),
    });
    const target = (await ctx.runQuery(
      (internal as any).daytonaCodexRuntimeTargets
        .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
      {
        ownerId: args.ownerId,
        runId: args.runId,
      },
    )) as JsonRecord | null;
    if (!target) {
      return {
        ok: true,
        state: "skipped",
        lifecycleMode: null,
        sandboxId: null,
        reason: "target_missing",
        timing: timing(),
      };
    }

    const nowMs = Date.now();
    const sandboxId = String(target.sandboxId ?? "").trim() || null;
    const lifecycleMode = normalizeDaytonaTargetLifecycleMode(target.lifecycleMode, sandboxId);
    if (lifecycleMode === "prepared_staging_reuse") {
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          workspaceChangeState: "unknown",
          workspaceRetentionState: "none",
          cleanupDecision: "skip_prepared_staging_reuse",
          nowMs,
        },
      );
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          state: "skipped",
          reason: `${args.reason}:${lifecycleMode}`,
          nowMs,
        },
      );
      return {
        ok: true,
        state: "skipped",
        lifecycleMode,
        sandboxId,
        reason: lifecycleMode,
        timing: timing(),
      };
    }

    if (!sandboxId) {
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          state: "failed",
          reason: `${args.reason}:sandbox_id_missing`,
          errorCode: "daytona_direct_sandbox_id_missing",
          errorMessage: "Cannot delete a per-turn Daytona sandbox without a sandbox id.",
          nowMs,
        },
      );
      return {
        ok: false,
        state: "failed",
        lifecycleMode,
        sandboxId,
        reason: "sandbox_id_missing",
        timing: timing(),
      };
    }

    await ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
      {
        ownerId: args.ownerId,
        runId: args.runId,
        state: "pending",
        reason: args.reason,
        nowMs,
      },
    );

    try {
      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      const sandbox = await daytona.get(sandboxId);
      const timeoutSeconds = readIntegerEnv("POLYNET_DAYTONA_DIRECT_TEARDOWN_TIMEOUT_SECONDS", 120);
      const workspaceRoot = String(target.workspaceRoot ?? "").trim() || DEFAULT_WORKSPACE_ROOT;
      const workspaceScan = await scanDaytonaWorkspaceForMeaningfulFiles({
        sandbox,
        workspaceRoot,
      });
      const decisionNowMs = Date.now();
      const previewLeaseActive = isActivePreviewLease(target, decisionNowMs);
      const previewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);

      if (previewLeaseActive) {
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            workspaceChangeState: workspaceScan.changeState,
            workspaceRetentionState: "none",
            ...(Number.isFinite(previewLeaseExpiresAt) && previewLeaseExpiresAt > decisionNowMs
              ? { cleanupEligibleAt: previewLeaseExpiresAt }
              : {}),
            workspaceMeaningfulFileCount: workspaceScan.meaningfulFileCount,
            workspaceMeaningfulFilePreview: workspaceScan.meaningfulFilePreview,
            cleanupDecision: "keep_running_active_preview",
            nowMs: Date.now(),
          },
        );
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            state: "skipped",
            reason: `${args.reason}:active_preview_lease`,
            nowMs: Date.now(),
          },
        );
        return {
          ok: true,
          state: "skipped",
          lifecycleMode,
          sandboxId,
          reason: "active_preview_lease",
          timing: timing(),
        };
      }

      await deleteDaytonaSandbox({ daytona, sandbox, timeoutSeconds });
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          workspaceChangeState: workspaceScan.changeState,
          workspaceRetentionState: "none",
          workspaceMeaningfulFileCount: workspaceScan.meaningfulFileCount,
          workspaceMeaningfulFilePreview: workspaceScan.meaningfulFilePreview,
          cleanupDecision: "delete_without_active_lease",
          nowMs: Date.now(),
        },
      );
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          state: "deleted",
          reason: `${args.reason}:delete_without_active_lease`,
          nowMs: Date.now(),
        },
      );
      await appendDaytonaPreviewStoppedEventBestEffort({
        ctx,
        ownerId: args.ownerId,
        runId: args.runId,
        target,
        reason: "delete_without_active_lease",
        source: "provider_teardown_deleted",
      });
      return {
        ok: true,
        state: "deleted",
        lifecycleMode,
        sandboxId,
        reason: "delete_without_active_lease",
        timing: timing(),
      };
    } catch (error) {
      if (isDaytonaNotFoundError(error)) {
        const nowMs = Date.now();
        const activePreviewPorts = normalizeActivePreviewPorts(target.activePreviewPorts);
        if (activePreviewPorts.length > 0) {
          await ctx.runMutation(
            (internal as any).daytonaCodexRuntimeTargets
              .markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal as any,
            {
              ownerId: args.ownerId,
              runId: args.runId,
              stoppedPreviewPorts: activePreviewPorts,
              nowMs,
            },
          );
        }
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            workspaceChangeState: "unknown",
            workspaceRetentionState: "none",
            cleanupDecision: "delete_without_active_lease",
            nowMs,
          },
        );
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            state: "deleted",
            reason: `${args.reason}:sandbox_missing`,
            nowMs,
          },
        );
        await appendDaytonaPreviewStoppedEventBestEffort({
          ctx,
          ownerId: args.ownerId,
          runId: args.runId,
          target,
          reason: "sandbox_missing",
          source: "provider_teardown_missing",
          ports: activePreviewPorts,
          nowMs,
        });
        return {
          ok: true,
          state: "deleted",
          lifecycleMode,
          sandboxId,
          reason: "sandbox_missing",
          timing: timing(),
        };
      }
      const message = sanitizeDaytonaRuntimeError(error);
      const failedRetentionExpiresAt = Date.now() + readHumanSaveRetentionMs();
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          workspaceChangeState: "scan_failed",
          workspaceRetentionState: "human_save_pending",
          workspaceRetentionExpiresAt: failedRetentionExpiresAt,
          cleanupEligibleAt: failedRetentionExpiresAt,
          cleanupDecision: "cleanup_failed",
          nowMs: Date.now(),
        },
      );
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          state: "failed",
          reason: args.reason,
          errorCode: daytonaRuntimeErrorCode(error),
          errorMessage: message,
          nowMs: Date.now(),
        },
      );
      return {
        ok: false,
        state: "failed",
        lifecycleMode,
        sandboxId,
        reason: message,
        timing: timing(),
      };
    }
  },
});

async function appendTeardownRuntimeEventBestEffort(params: {
  ctx: any;
  ownerId: string;
  runId: string;
  target: JsonRecord | null;
  eventType: string;
  eventKey: string;
  payload: JsonRecord;
}): Promise<void> {
  const threadId = String(params.target?.threadId ?? "").trim();
  if (!threadId) return;
  try {
    await params.ctx.runMutation((internal as any).threads.appendCloudRuntimeRunEventInternal as any, {
      ownerId: params.ownerId,
      threadId,
      runId: params.runId,
      eventType: params.eventType,
      eventKey: params.eventKey,
      payload: params.payload,
      nowMs: Date.now(),
    });
  } catch {
    // Best effort; Daytona provider cleanup must not fail because audit append failed.
  }
}

async function appendDaytonaPreviewStoppedEventBestEffort(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  target: JsonRecord | null;
  reason: string;
  source: string;
  ports?: readonly number[];
  nowMs?: number;
}): Promise<number[]> {
  const ports = normalizeActivePreviewPorts(
    params.ports ?? params.target?.activePreviewPorts,
  );
  if (ports.length === 0) return [];
  const nowMs = params.nowMs ?? Date.now();
  try {
    await params.ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal as any,
      {
        ownerId: params.ownerId,
        runId: params.runId,
        stoppedPreviewPorts: ports,
        nowMs,
      },
    );
  } catch {
    // Best effort; preview UI cleanup should not block provider cleanup.
  }
  await appendTeardownRuntimeEventBestEffort({
    ctx: params.ctx,
    ownerId: String(params.ownerId),
    runId: params.runId,
    target: params.target,
    eventType: "workspace_preview_stopped",
    eventKey: `${params.runId}:workspace_preview_stopped:${params.source}:${ports.join("-")}`,
    payload: {
      run_id: params.runId,
      provider: "daytona",
      transport: "daytona_direct",
      target_run_id: params.runId,
      target_id: String(params.target?._id ?? "") || null,
      sandbox_id: String(params.target?.sandboxId ?? "").trim() || null,
      preview_ports: ports,
      stopped_preview_ports: ports,
      reason: params.reason,
      source: params.source,
    },
  });
  return ports;
}

function shouldSkipExpiredTargetCleanup(target: JsonRecord, nowMs: number): string | null {
  const sandboxId = String(target.sandboxId ?? "").trim();
  const lifecycleMode = normalizeDaytonaTargetLifecycleMode(target.lifecycleMode, sandboxId);
  if (lifecycleMode === "prepared_staging_reuse") return "prepared_staging_reuse";
  if (String(target.workerState ?? "") !== "released") return "target_not_released";
  if (String(target.leaseRunId ?? "").trim()) return "target_has_active_lease";
  if (isActivePreviewLease(target, nowMs)) return "active_preview_lease";
  return null;
}

function normalizeActivePreviewPorts(rawPorts: unknown): number[] {
  if (!Array.isArray(rawPorts)) return [];
  const ports = new Set<number>();
  for (const rawPort of rawPorts) {
    try {
      const port = normalizeWorkspacePreviewPort(rawPort);
      if (port !== null) ports.add(port);
    } catch {
      // Ignore malformed worker evidence; cleanup should still progress.
    }
  }
  return Array.from(ports);
}

function normalizeDaytonaPreviewProcessId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const integer = Math.floor(parsed);
  return integer > 1 ? integer : null;
}

function buildStopDaytonaAppPreviewCommand(params: {
  ports: readonly number[];
  processIds: readonly number[];
}): string {
  const ports = Array.from(new Set(params.ports)).filter((port) => port > 0);
  const processIds = Array.from(new Set(params.processIds)).filter((pid) => pid > 1);
  return [
    "set +e",
    `PIDS=${shellQuote(processIds.join(" "))}`,
    `PORTS=${shellQuote(ports.join(" "))}`,
    'for pid in $PIDS; do',
    '  if kill -0 "$pid" 2>/dev/null; then',
    '    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true',
    "  fi",
    "done",
    "sleep 0.3",
    'for port in $PORTS; do',
    '  if command -v lsof >/dev/null 2>&1; then',
    '    for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do',
    '      kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true',
    "    done",
    "  fi",
    '  if command -v fuser >/dev/null 2>&1; then',
    '    fuser -k "$port"/tcp >/dev/null 2>&1 || true',
    "  fi",
    "done",
    "sleep 0.3",
    'for pid in $PIDS; do',
    '  if kill -0 "$pid" 2>/dev/null; then',
    '    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true',
    "  fi",
    "done",
    'printf "stopped_daytona_preview ports=%s pids=%s\\n" "$PORTS" "$PIDS"',
    "exit 0",
  ].join("\n");
}

function daytonaTeardownReasonForWorkerStatus(status: string): string {
  if (status === "ok") return "turn_finished";
  if (status === "cancelled") return "user_cancelled";
  return "turn_failed";
}

async function deleteExpiredHumanSaveRetentionTarget(params: {
  ctx: any;
  target: JsonRecord;
  nowMs: number;
  reason: string;
}): Promise<{ ok: boolean; state: string; reason: string; sandboxId: string | null }> {
  const ownerId = params.target.ownerId;
  const runId = String(params.target.runId ?? "").trim();
  const sandboxId = String(params.target.sandboxId ?? "").trim() || null;
  if (!ownerId || !runId) {
    return { ok: false, state: "failed", reason: "target_identity_missing", sandboxId };
  }
  const skipReason = shouldSkipExpiredTargetCleanup(params.target, params.nowMs);
  if (skipReason) {
    return { ok: true, state: "skipped", reason: skipReason, sandboxId };
  }

  const retentionExpiresAt = Number(params.target.workspaceRetentionExpiresAt ?? 0);
  if (
    String(params.target.workspaceRetentionState ?? "") !== "human_save_pending" ||
    !Number.isFinite(retentionExpiresAt) ||
    retentionExpiresAt <= 0 ||
    retentionExpiresAt > params.nowMs
  ) {
    return { ok: true, state: "skipped", reason: "retention_not_expired", sandboxId };
  }

  try {
    const timeoutSeconds = readIntegerEnv("POLYNET_DAYTONA_DIRECT_TEARDOWN_TIMEOUT_SECONDS", 120);
    const alreadyDeleted =
      String(params.target.providerTeardownState ?? "") === "deleted" ||
      String(params.target.sandboxState ?? "") === "deleted";
    if (sandboxId && !alreadyDeleted) {
      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      try {
        const sandbox = await daytona.get(sandboxId);
        await deleteDaytonaSandbox({ daytona, sandbox, timeoutSeconds });
      } catch (error) {
        if (!isDaytonaNotFoundError(error)) throw error;
      }
    }
    await params.ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetRetentionExpiredInternal as any,
      {
        ownerId,
        runId,
        nowMs: params.nowMs,
      },
    );
    await params.ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
      {
        ownerId,
        runId,
        state: "deleted",
        reason: params.reason,
        nowMs: params.nowMs,
      },
    );
    await appendDaytonaPreviewStoppedEventBestEffort({
      ctx: params.ctx,
      ownerId,
      runId,
      target: params.target,
      reason: params.reason,
      source: "expired_retention_deleted",
      nowMs: params.nowMs,
    });
    await appendTeardownRuntimeEventBestEffort({
      ctx: params.ctx,
      ownerId: String(ownerId),
      runId,
      target: params.target,
      eventType: "daytona_codex_runtime_provider_teardown_finished",
      eventKey: `${runId}:daytona_codex_runtime_provider_teardown_finished:${params.reason}`,
      payload: {
        run_id: runId,
        provider: "daytona",
        transport: "daytona_direct",
        target_id: String(params.target._id ?? "") || null,
        sandbox_id: sandboxId,
        ok: true,
        state: "deleted",
        lifecycle_mode: String(params.target.lifecycleMode ?? "") || null,
        reason: params.reason,
        sweeper: true,
      },
    });
    return { ok: true, state: "deleted", reason: params.reason, sandboxId };
  } catch (error) {
    const message = sanitizeDaytonaRuntimeError(error);
    const workspaceChangeState = ["unknown", "clean", "dirty", "scan_failed"].includes(
      String(params.target.workspaceChangeState ?? ""),
    )
      ? String(params.target.workspaceChangeState)
      : "scan_failed";
    await params.ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal as any,
      {
        ownerId,
        runId,
        workspaceChangeState,
        workspaceRetentionState: "human_save_pending",
        workspaceRetentionExpiresAt: retentionExpiresAt,
        cleanupEligibleAt: params.nowMs,
        cleanupDecision: "cleanup_failed",
        nowMs: params.nowMs,
      },
    );
    await params.ctx.runMutation(
      (internal as any).daytonaCodexRuntimeTargets
        .markDaytonaCodexRuntimeTargetProviderTeardownInternal as any,
      {
        ownerId,
        runId,
        state: "failed",
        reason: params.reason,
        errorCode: daytonaRuntimeErrorCode(error),
        errorMessage: message,
        nowMs: params.nowMs,
      },
    );
    return { ok: false, state: "failed", reason: message, sandboxId };
  }
}

export const sweepExpiredDaytonaCodexRuntimeTargetsInternal = internalAction({
  args: {
    targetId: v.optional(v.id("daytonaCodexRuntimeTargets")),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    nowMs: number;
    scanned: number;
    deleted: number;
    previewExpired: number;
    skipped: number;
    failed: number;
  }> => {
    const nowMs = args.nowMs ?? Date.now();
    const targetId = args.targetId ? String(args.targetId) : "";
    let expired: {
      expiredRetentionTargets?: JsonRecord[];
      expiredPreviewLeaseTargets?: JsonRecord[];
    };
    if (targetId) {
      const target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByIdInternal as any,
        {
          targetId: args.targetId,
        },
      )) as JsonRecord | null;
      const retentionExpiresAt = Number(target?.workspaceRetentionExpiresAt ?? 0);
      const previewLeaseExpiresAt = Number(target?.previewLeaseExpiresAt ?? 0);
      expired = {
        expiredRetentionTargets:
          target &&
          String(target.workspaceRetentionState ?? "") === "human_save_pending" &&
          Number.isFinite(retentionExpiresAt) &&
          retentionExpiresAt > 0 &&
          retentionExpiresAt <= nowMs
            ? [target]
            : [],
        expiredPreviewLeaseTargets:
          target &&
          String(target.previewLeaseState ?? "") === "active" &&
          Number.isFinite(previewLeaseExpiresAt) &&
          previewLeaseExpiresAt > 0 &&
          previewLeaseExpiresAt <= nowMs
            ? [target]
            : [],
      };
    } else {
      expired = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .listExpiredDaytonaCodexRuntimeTargetsInternal as any,
        {
          nowMs,
          ...(args.limit ? { limit: args.limit } : {}),
        },
      )) as {
        expiredRetentionTargets?: JsonRecord[];
        expiredPreviewLeaseTargets?: JsonRecord[];
      };
    }
    const processedTargetIds = new Set<string>();
    let scanned = 0;
    let deleted = 0;
    let previewExpired = 0;
    let skipped = 0;
    let failed = 0;

    for (const target of expired.expiredRetentionTargets ?? []) {
      scanned += 1;
      processedTargetIds.add(String(target._id ?? ""));
      const result = await deleteExpiredHumanSaveRetentionTarget({
        ctx,
        target,
        nowMs,
        reason: "expired_human_save_retention",
      });
      if (result.state === "deleted") deleted += 1;
      else if (result.state === "skipped") skipped += 1;
      else if (!result.ok) failed += 1;
    }

    for (const target of expired.expiredPreviewLeaseTargets ?? []) {
      const targetId = String(target._id ?? "");
      if (targetId && processedTargetIds.has(targetId)) continue;
      scanned += 1;
      const ownerId = target.ownerId;
      const runId = String(target.runId ?? "").trim();
      const sandboxId = String(target.sandboxId ?? "").trim();
      const skipReason = shouldSkipExpiredTargetCleanup(target, nowMs);
      if (!ownerId || !runId) {
        failed += 1;
        continue;
      }
      if (
        String(target.providerTeardownState ?? "") === "deleted" ||
        String(target.sandboxState ?? "") === "deleted"
      ) {
        skipped += 1;
        continue;
      }
      if (skipReason && skipReason !== "active_preview_lease") {
        skipped += 1;
        continue;
      }
      const previewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);
      if (!Number.isFinite(previewLeaseExpiresAt) || previewLeaseExpiresAt <= 0 || previewLeaseExpiresAt > nowMs) {
        skipped += 1;
        continue;
      }
      try {
        await ctx.runMutation(
          (internal as any).daytonaCodexRuntimeTargets
            .markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal as any,
          {
            ownerId,
            runId,
            nowMs,
          },
        );
        previewExpired += 1;
        const teardown = (await ctx.runAction(
          (internal as any).daytonaCodexRuntimeTargetActions
            .teardownAndRecordDaytonaCodexRuntimeTargetInternal as any,
          {
            ownerId,
            runId,
            reason: "preview_lease_expired",
          },
        )) as JsonRecord;
        if (teardown.ok !== true) failed += 1;
      } catch (error) {
        failed += 1;
        await appendTeardownRuntimeEventBestEffort({
          ctx,
          ownerId: String(ownerId),
          runId,
          target,
          eventType: "daytona_codex_runtime_provider_teardown_failed",
          eventKey: `${runId}:daytona_codex_runtime_provider_teardown_failed:preview_lease_expired`,
          payload: {
            run_id: runId,
            provider: "daytona",
            transport: "daytona_direct",
            target_id: targetId || null,
            sandbox_id: sandboxId || null,
            reason: "preview_lease_expired",
            message:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : String(error ?? "preview_lease_expired_cleanup_failed").slice(0, 1000),
            sweeper: true,
          },
        });
      }
    }

    return {
      ok: failed === 0,
      nowMs,
      scanned,
      deleted,
      previewExpired,
      skipped,
      failed,
    };
  },
});

export const stopDaytonaAppPreviewInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    previewPort: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
    target_run_id?: string;
    target_id?: string | null;
    sandbox_id?: string | null;
    stopped_preview_ports?: number[];
    stopped_process_ids?: number[];
    stop_output?: string | null;
    teardown_ok?: boolean;
    teardown_state?: string | null;
    teardown_reason?: string | null;
  }> => {
    try {
      if (!hasDaytonaCredentials()) {
        return {
          ok: false,
          code: "daytona_direct_credentials_missing",
          message: "Daytona credentials are not configured.",
        };
      }
      const target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
        },
      )) as JsonRecord | null;
      if (!target) {
        return {
          ok: false,
          code: "daytona_runtime_target_not_found",
          message: "Daytona runtime target was not found for this run.",
        };
      }
      const sandboxId = String(target.sandboxId ?? "").trim();
      let requestedPort: number | null = null;
      if (args.previewPort !== undefined) {
        requestedPort = normalizeDaytonaAppPreviewPort(args.previewPort);
      }
      const activePreviewPorts = normalizeActivePreviewPorts(target.activePreviewPorts);
      const ports =
        requestedPort !== null
          ? activePreviewPorts.includes(requestedPort)
            ? [requestedPort]
            : []
          : activePreviewPorts;
      const sandboxState = String(target.sandboxState ?? "").trim();
      const providerTeardownState = String(target.providerTeardownState ?? "").trim();
      if (
        !sandboxId ||
        sandboxState === "deleted" ||
        sandboxState === "stopped" ||
        providerTeardownState === "deleted" ||
        providerTeardownState === "stopped"
      ) {
        if (ports.length > 0) {
          const nowMs = Date.now();
          await ctx.runMutation(
            (internal as any).daytonaCodexRuntimeTargets
              .markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal as any,
            {
              ownerId: args.ownerId,
              runId: args.runId,
              stoppedPreviewPorts: ports,
              nowMs,
            },
          );
          await appendDaytonaPreviewStoppedEventBestEffort({
            ctx,
            ownerId: args.ownerId,
            runId: args.runId,
            target,
            reason: String(args.reason ?? "").trim() || "polynet_terminal_stop",
            source: "preview_stop_unavailable_sandbox",
            ports,
            nowMs,
          });
          return {
            ok: true,
            target_run_id: args.runId,
            target_id: String(target._id ?? "").trim() || null,
            sandbox_id: sandboxId || null,
            stopped_preview_ports: ports,
            stopped_process_ids: [],
            stop_output: "Daytona sandbox was already stopped; preview was removed.",
            teardown_ok: true,
            teardown_state:
              providerTeardownState === "deleted" || sandboxState === "deleted"
                ? "deleted"
                : "stopped",
            teardown_reason: "preview_stop_unavailable_sandbox",
          };
        }
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
          target_run_id: args.runId,
          target_id: String(target._id ?? "").trim() || null,
          sandbox_id: sandboxId || null,
        };
      }
      if (requestedPort !== null && !activePreviewPorts.includes(requestedPort)) {
        return {
          ok: false,
          code: "daytona_preview_port_not_active",
          message: `Daytona preview port ${requestedPort} is not active for this run.`,
          target_run_id: args.runId,
          target_id: String(target._id ?? "").trim() || null,
          sandbox_id: sandboxId,
          stopped_preview_ports: [],
          stopped_process_ids: [],
        };
      }
      if (ports.length === 0) {
        return {
          ok: true,
          target_run_id: args.runId,
          target_id: String(target._id ?? "").trim() || null,
          sandbox_id: sandboxId,
          stopped_preview_ports: [],
          stopped_process_ids: [],
          stop_output: "No active Daytona preview ports were recorded.",
          teardown_ok: true,
          teardown_state: "skipped",
          teardown_reason: "no_active_preview_ports",
        };
      }

      const processIds = new Set<number>();
      for (const port of ports) {
        const previewEvent = (await ctx.runQuery(
          (internal as any).threads.getDaytonaWorkspacePreviewReadyEventInternal as any,
          {
            ownerId: args.ownerId,
            runId: args.runId,
            port,
          },
        )) as JsonRecord | null;
        const payload = asRecord(previewEvent?.payload);
        const processId = normalizeDaytonaPreviewProcessId(
          payload?.terminal_session_id ?? payload?.process_id,
        );
        if (processId !== null) processIds.add(processId);
      }

      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      const sandbox = await daytona.get(sandboxId);
      const stopCommand = buildStopDaytonaAppPreviewCommand({
        ports,
        processIds: Array.from(processIds),
      });
      const stopped = await runRemoteBash(sandbox, stopCommand, {
        cwd: String(target.workspaceRoot ?? "").trim() || DEFAULT_WORKSPACE_ROOT,
        timeoutSeconds: readIntegerEnv("POLYNET_DAYTONA_PREVIEW_STOP_TIMEOUT_SECONDS", 20),
        allowFailure: true,
      });
      const nowMs = Date.now();
      await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          stoppedPreviewPorts: ports,
          nowMs,
        },
      );
      const teardown = (await ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .teardownAndRecordDaytonaCodexRuntimeTargetInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          reason: String(args.reason ?? "").trim() || "polynet_terminal_stop",
        },
      )) as JsonRecord;
      return {
        ok: true,
        target_run_id: args.runId,
        target_id: String(target._id ?? "").trim() || null,
        sandbox_id: sandboxId,
        stopped_preview_ports: ports,
        stopped_process_ids: Array.from(processIds),
        stop_output: stopped.output.slice(0, 2000) || null,
        teardown_ok: teardown.ok === true,
        teardown_state: String(teardown.state ?? "").trim() || null,
        teardown_reason: String(teardown.reason ?? "").trim() || null,
      };
    } catch (error) {
      return {
        ok: false,
        code: "daytona_preview_stop_failed",
        message: sanitizeDaytonaRuntimeError(error),
        target_run_id: args.runId,
      };
    }
  },
});

export const captureDaytonaComputerUseScreenshotInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
    frame_storage_id?: string;
    frame_url?: string | null;
    frame_mime_type?: string;
    frame_size_bytes?: number;
    screenshot_method?: "takeCompressed" | "takeFullScreen";
    screenshot_width?: number | null;
    screenshot_height?: number | null;
    status_keys?: string[];
    result_keys?: string[];
    summary?: string;
    capture_reason?: string | null;
    readiness_attempts?: number;
  }> => {
    try {
      const captureReason = String(args.reason ?? "").trim() || null;
      if (!hasDaytonaCredentials()) {
        return {
          ok: false,
          code: "daytona_direct_credentials_missing",
          message: "Daytona credentials are not configured.",
        };
      }
      const target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
        },
      )) as JsonRecord | null;
      if (!target) {
        return {
          ok: false,
          code: "daytona_runtime_target_not_found",
          message: "Daytona runtime target was not found for this run.",
        };
      }
      const threadId = String(target.threadId ?? "").trim();
      const sandboxId = String(target.sandboxId ?? "").trim();
      if (!threadId || !sandboxId || String(target.sandboxState ?? "").trim() === "deleted") {
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
        };
      }

      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      const sandbox = await daytona.get(sandboxId);
      if (!sandbox.computerUse || typeof sandbox.computerUse.start !== "function") {
        return {
          ok: false,
          code: "daytona_computer_use_unavailable",
          message: "Daytona Computer Use is not available for this sandbox.",
        };
      }

      let status: JsonRecord | null = null;
      let screenshotMethod: "takeCompressed" | "takeFullScreen" | null = null;
      let screenshotRaw: unknown = null;
      let screenshotUnavailable: JsonRecord | null = null;
      let readinessAttempts = 0;
      await runRetryableDaytonaComputerUseOperation(async () => {
        try {
          const readiness = await startDaytonaComputerUseWithReadiness(sandbox.computerUse!);
          status = readiness.status;
          readinessAttempts += readiness.attempts;
          if (typeof sandbox.computerUse!.screenshot?.takeCompressed === "function") {
            screenshotMethod = "takeCompressed";
            screenshotRaw = await sandbox.computerUse!.screenshot.takeCompressed({
              format: "jpeg",
              quality: 70,
              scale: 0.5,
              showCursor: false,
            });
          } else if (typeof sandbox.computerUse!.screenshot?.takeFullScreen === "function") {
            screenshotMethod = "takeFullScreen";
            screenshotRaw = await sandbox.computerUse!.screenshot.takeFullScreen(false);
          } else {
            screenshotUnavailable = {
              ok: false,
              code: "daytona_computer_use_screenshot_unavailable",
              message: "Daytona Computer Use did not expose a supported screenshot method.",
            };
            return { ok: false };
          }
          return { ok: true };
        } finally {
          if (typeof sandbox.computerUse!.stop === "function") {
            try {
              await sandbox.computerUse!.stop();
            } catch {
              // Best-effort cleanup only. A failed stop should not hide a valid screenshot.
            }
          }
        }
      });
      if (screenshotUnavailable) {
        return screenshotUnavailable;
      }

      const image = extractScreenshotImage(screenshotRaw);
      if (!image) {
        return {
          ok: false,
          code: "daytona_computer_use_screenshot_empty",
          message: "Daytona Computer Use returned no screenshot image data.",
          screenshot_method: screenshotMethod ?? undefined,
          status_keys: status ? Object.keys(status).sort() : [],
        };
      }

      const frameSizeBytes = Math.max(
        image.bytes.byteLength,
        Math.max(0, Math.floor(image.sizeBytes)),
      );
      if (frameSizeBytes > MAX_COMPUTER_USE_SCREENSHOT_BYTES) {
        return {
          ok: false,
          code: "daytona_computer_use_screenshot_too_large",
          message: "Daytona Computer Use screenshot exceeded the maximum allowed size.",
          screenshot_method: screenshotMethod ?? undefined,
          status_keys: status ? Object.keys(status).sort() : [],
          result_keys: image.resultKeys,
        };
      }

      const frameBytes = Uint8Array.from(image.bytes);
      const frameArrayBuffer = frameBytes.buffer.slice(
        frameBytes.byteOffset,
        frameBytes.byteOffset + frameBytes.byteLength,
      ) as ArrayBuffer;
      const frameStorageId = await ctx.storage.store(
        new Blob([frameArrayBuffer], { type: image.mimeType }),
      );
      const frameUrl = await ctx.storage.getUrl(frameStorageId);
      const summary = `Captured Daytona desktop screenshot (${frameSizeBytes} bytes).`;

      return {
        ok: true,
        frame_storage_id: String(frameStorageId),
        frame_url: frameUrl ?? null,
        frame_mime_type: image.mimeType,
        frame_size_bytes: frameSizeBytes,
        screenshot_method: screenshotMethod ?? undefined,
        screenshot_width: image.width,
        screenshot_height: image.height,
        status_keys: status ? Object.keys(status).sort() : [],
        result_keys: image.resultKeys,
        summary,
        capture_reason: captureReason,
        readiness_attempts: readinessAttempts,
      };
    } catch (error) {
      return {
        ok: false,
        code: daytonaRuntimeErrorCode(error),
        message: sanitizeDaytonaRuntimeError(error),
      };
    }
  },
});

export const openDaytonaComputerUseUrlInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    url: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
    summary?: string;
    command_exit_code?: number | null;
    command_stdout_preview?: string;
    command_stderr_preview?: string;
    display_keys?: string[];
    window_count?: number | null;
    capture_reason?: string | null;
    readiness_attempts?: number;
  }> => {
    try {
      const captureReason = String(args.reason ?? "").trim() || null;
      const normalizedUrl = normalizeComputerOpenUrl(args.url);
      if (!normalizedUrl.ok) return normalizedUrl;
      if (!hasDaytonaCredentials()) {
        return {
          ok: false,
          code: "daytona_direct_credentials_missing",
          message: "Daytona credentials are not configured.",
        };
      }
      const target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
        },
      )) as JsonRecord | null;
      if (!target) {
        return {
          ok: false,
          code: "daytona_runtime_target_not_found",
          message: "Daytona runtime target was not found for this run.",
        };
      }
      const threadId = String(target.threadId ?? "").trim();
      const sandboxId = String(target.sandboxId ?? "").trim();
      if (!threadId || !sandboxId || String(target.sandboxState ?? "").trim() === "deleted") {
        return {
          ok: false,
          code: "daytona_sandbox_not_available",
          message: "Daytona sandbox is no longer available for this run.",
        };
      }

      const { Daytona } = await loadDaytona();
      const daytona = new Daytona(buildDaytonaConfig());
      const sandbox = await daytona.get(sandboxId);
      if (!sandbox.computerUse || typeof sandbox.computerUse.start !== "function") {
        return {
          ok: false,
          code: "daytona_computer_use_unavailable",
          message: "Daytona Computer Use is not available for this sandbox.",
        };
      }

      let display: unknown = null;
      let output = "";
      let exitCode: number | null = null;
      let readinessAttempts = 0;
      await runRetryableDaytonaComputerUseOperation(async () => {
        const readiness = await startDaytonaComputerUseWithReadiness(sandbox.computerUse!);
        readinessAttempts += readiness.attempts;
        const result = await sandbox.process.executeCommand(
          buildDaytonaComputerOpenUrlCommand(normalizedUrl.url),
          DEFAULT_WORKSPACE_ROOT,
          {},
          20,
        );
        output = commandOutput(result);
        exitCode = Number.isFinite(result.exitCode) ? result.exitCode : null;
        if (exitCode !== 0) {
          if (isRetryableDaytonaComputerUseBridgeError(output)) {
            throw new Error(output || "Daytona computer browser launch failed.");
          }
          return { ok: false };
        }
        await sleepMs(DAYTONA_COMPUTER_USE_READY_WAIT_MS);
        try {
          if (typeof sandbox.computerUse!.display?.getWindows === "function") {
            display = await sandbox.computerUse!.display.getWindows();
          }
        } catch (error) {
          if (isRetryableDaytonaComputerUseBridgeError(error)) throw error;
          display = null;
        }
        return { ok: true };
      });
      if (exitCode !== 0) {
        return {
          ok: false,
          code: "daytona_computer_open_url_failed",
          message: sanitizeDaytonaRuntimeError(output || "Daytona computer browser launch failed."),
          command_exit_code: exitCode,
          command_stdout_preview: sanitizeDaytonaRuntimeError(output).slice(0, 1000),
          readiness_attempts: readinessAttempts,
        };
      }
      const displayRecord = asRecord(display);
      const windows = Array.isArray(displayRecord?.windows) ? displayRecord.windows : null;
      const summary = normalizedUrl.isLocalPreview
        ? "Opened localhost workspace preview in the Daytona computer browser."
        : "Opened URL in the Daytona computer browser.";

      return {
        ok: true,
        summary,
        command_exit_code: exitCode,
        command_stdout_preview: sanitizeDaytonaRuntimeError(output).slice(0, 1000),
        display_keys: displayRecord ? Object.keys(displayRecord).sort() : [],
        window_count: windows ? windows.length : null,
        capture_reason: captureReason,
        readiness_attempts: readinessAttempts,
      };
    } catch (error) {
      return {
        ok: false,
        code: daytonaRuntimeErrorCode(error),
        message: sanitizeDaytonaRuntimeError(error),
      };
    }
  },
});

export const finalizeDaytonaCodexRuntimeTargetFromWorkerIngestInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("cancelled")),
    activePreviewPorts: v.optional(v.array(v.number())),
    nowMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    finalized: boolean;
    reason: string;
    released?: boolean;
    scheduled?: boolean;
  }> => {
    const nowMs = args.nowMs ?? Date.now();
    let target: JsonRecord | null = null;
    try {
      target = (await ctx.runQuery(
        (internal as any).daytonaCodexRuntimeTargets
          .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
        },
      )) as JsonRecord | null;
    } catch (error) {
      return {
        ok: false,
        finalized: false,
        reason: `target_lookup_failed:${daytonaRuntimeErrorCode(error)}`,
      };
    }

    if (!target) {
      return { ok: true, finalized: false, reason: "target_missing" };
    }
    const providerTeardownState = String(target.providerTeardownState ?? "");
    const sandboxState = String(target.sandboxState ?? "");
    if (providerTeardownState === "deleted" || sandboxState === "deleted") {
      return { ok: true, finalized: false, reason: "target_already_deleted" };
    }

    const teardownReason = daytonaTeardownReasonForWorkerStatus(args.status);
    const activePreviewPorts = normalizeActivePreviewPorts(args.activePreviewPorts ?? []);
    let released = false;
    try {
      const release = (await ctx.runMutation(
        (internal as any).daytonaCodexRuntimeTargets
          .releaseDaytonaCodexRuntimeTargetInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          reason: teardownReason,
          activePreviewPorts,
          nowMs,
        },
      )) as JsonRecord;
      released = release.released === true;
    } catch (error) {
      await appendTeardownRuntimeEventBestEffort({
        ctx,
        ownerId: String(args.ownerId),
        runId: args.runId,
        target,
        eventType: "daytona_codex_runtime_provider_teardown_failed",
        eventKey: `${args.runId}:daytona_codex_runtime_provider_teardown_failed:durable_ingest_release`,
        payload: {
          run_id: args.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_id: String(target._id ?? "") || null,
          sandbox_id: String(target.sandboxId ?? "") || null,
          reason: teardownReason,
          cleanup_mode: "durable_ingest",
          failure_stage: "release",
          message: sanitizeDaytonaRuntimeError(error).slice(0, 1000),
        },
      });
      return {
        ok: false,
        finalized: false,
        reason: `release_failed:${daytonaRuntimeErrorCode(error)}`,
      };
    }

    try {
      await appendTeardownRuntimeEventBestEffort({
        ctx,
        ownerId: String(args.ownerId),
        runId: args.runId,
        target,
        eventType: "daytona_codex_runtime_provider_teardown_started",
        eventKey: `${args.runId}:daytona_codex_runtime_provider_teardown_started:durable_ingest`,
        payload: {
          run_id: args.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_id: String(target._id ?? "") || null,
          sandbox_id: String(target.sandboxId ?? "") || null,
          reason: teardownReason,
          cleanup_mode: "durable_ingest",
          active_preview_ports: activePreviewPorts,
        },
      });
      await ctx.scheduler.runAfter(
        0,
        (internal as any).daytonaCodexRuntimeTargetActions
          .teardownAndRecordDaytonaCodexRuntimeTargetInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          reason: teardownReason,
        },
      );
      return {
        ok: true,
        finalized: true,
        reason: teardownReason,
        released,
        scheduled: true,
      };
    } catch (error) {
      await appendTeardownRuntimeEventBestEffort({
        ctx,
        ownerId: String(args.ownerId),
        runId: args.runId,
        target,
        eventType: "daytona_codex_runtime_provider_teardown_failed",
        eventKey: `${args.runId}:daytona_codex_runtime_provider_teardown_failed:durable_ingest_schedule`,
        payload: {
          run_id: args.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_id: String(target._id ?? "") || null,
          sandbox_id: String(target.sandboxId ?? "") || null,
          reason: teardownReason,
          cleanup_mode: "durable_ingest",
          failure_stage: "schedule",
          message: sanitizeDaytonaRuntimeError(error).slice(0, 1000),
        },
      });
      return {
        ok: false,
        finalized: false,
        reason: `schedule_failed:${daytonaRuntimeErrorCode(error)}`,
        released,
        scheduled: false,
      };
    }
  },
});

export const teardownAndRecordDaytonaCodexRuntimeTargetInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const target = (await ctx.runQuery(
      (internal as any).daytonaCodexRuntimeTargets
        .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
      {
        ownerId: args.ownerId,
        runId: args.runId,
      },
    )) as JsonRecord | null;
    const targetId = String(target?._id ?? "").trim() || null;
    const targetSandboxId = String(target?.sandboxId ?? "").trim() || null;

    try {
      const teardown = (await ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .teardownDaytonaCodexRuntimeTargetInternal as any,
        {
          ownerId: args.ownerId,
          runId: args.runId,
          reason: args.reason,
        },
      )) as JsonRecord;
      await appendTeardownRuntimeEventBestEffort({
        ctx,
        ownerId: String(args.ownerId),
        runId: args.runId,
        target,
        eventType: "daytona_codex_runtime_provider_teardown_finished",
        eventKey: `${args.runId}:daytona_codex_runtime_provider_teardown_finished:1`,
        payload: {
          run_id: args.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_id: targetId,
          sandbox_id: String(teardown.sandboxId ?? targetSandboxId ?? "") || null,
          ok: teardown.ok === true,
          state: String(teardown.state ?? "") || null,
          lifecycle_mode: String(teardown.lifecycleMode ?? "") || null,
          reason: String(teardown.reason ?? "") || null,
          timing: teardown.timing ?? null,
        },
      });
      return { ok: teardown.ok === true };
    } catch (teardownError) {
      await appendTeardownRuntimeEventBestEffort({
        ctx,
        ownerId: String(args.ownerId),
        runId: args.runId,
        target,
        eventType: "daytona_codex_runtime_provider_teardown_failed",
        eventKey: `${args.runId}:daytona_codex_runtime_provider_teardown_failed:1`,
        payload: {
          run_id: args.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_id: targetId,
          sandbox_id: targetSandboxId,
          reason: args.reason,
          message:
            teardownError instanceof Error
              ? teardownError.message.slice(0, 1000)
              : String(teardownError ?? "teardown_failed").slice(0, 1000),
        },
      });
      return { ok: false };
    }
  },
});
