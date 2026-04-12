import type { NativeToolExecutionResult } from "../shared/nativeToolLoop";
import type { DaytonaConfig } from "./daytonaSandboxClient";
import { daytonaComputerUseRequest } from "./daytonaComputerUseTransport";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";

type DaytonaDesktopWindow = {
  id: string | null;
  title: string | null;
  appName: string | null;
  focused: boolean;
};

type DaytonaUrlReachabilityResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
      outputPreview: string | null;
    };

type ComputerUseObservationContent = NativeToolExecutionResult["observationContent"];

function shellQuote(value: string): string {
  return `'${String(value ?? "").replaceAll("'", `'\\''`)}'`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeDesktopKey(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "return") return "Enter";
  if (lower === "esc") return "Escape";
  if (lower === "spacebar") return "Space";
  if (lower === "del") return "Delete";
  if (lower === "cmd") return "Meta";
  if (lower === "control") return "Ctrl";
  return normalized;
}

function normalizeDesktopWindow(value: unknown): DaytonaDesktopWindow | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = readString(record.title) ?? readString(record.name);
  const id = readString(record.id) ?? readString(record.windowId) ?? readString(record.window_id);
  const appName = readString(record.appName) ?? readString(record.app_name) ?? readString(record.class);
  const focused = readBoolean(record.focused) || readBoolean(record.isFocused) || readBoolean(record.is_focused);
  if (!title && !id && !appName) return null;
  return { id, title, appName, focused };
}

function summarizeWindowTitles(windows: DaytonaDesktopWindow[]): string[] {
  const out: string[] = [];
  for (const window of windows) {
    const label = window.title ?? window.appName ?? window.id;
    if (!label) continue;
    if (out.includes(label)) continue;
    out.push(label.slice(0, 120));
    if (out.length >= 6) break;
  }
  return out;
}

function isLikelyBrowserWindow(window: DaytonaDesktopWindow): boolean {
  const haystack = `${window.title ?? ""} ${window.appName ?? ""}`.trim().toLowerCase();
  if (!haystack) return false;
  return (
    haystack.includes("firefox") ||
    haystack.includes("chrome") ||
    haystack.includes("chromium") ||
    haystack.includes("browser")
  );
}

function findLikelyBrowserWindow(windows: DaytonaDesktopWindow[]): DaytonaDesktopWindow | null {
  const focusedBrowser = windows.find((window) => window.focused && isLikelyBrowserWindow(window));
  if (focusedBrowser) return focusedBrowser;
  return windows.find((window) => isLikelyBrowserWindow(window)) ?? null;
}

function okToolResult(params: {
  outputText: string;
  details?: Record<string, unknown> | null;
  observationContent?: ComputerUseObservationContent;
}): NativeToolExecutionResult {
  return {
    status: "ok",
    exitCode: 0,
    outputText: params.outputText,
    errorCode: null,
    errorMessage: null,
    ...(params.details ? { details: params.details } : null),
    ...(params.observationContent !== undefined ? { observationContent: params.observationContent } : null),
  };
}

function errorToolResult(params: {
  errorCode: string;
  errorMessage: string;
  outputText?: string;
  details?: Record<string, unknown> | null;
  observationContent?: ComputerUseObservationContent;
}): NativeToolExecutionResult {
  return {
    status: "error",
    exitCode: null,
    outputText: params.outputText ?? "",
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    ...(params.details ? { details: params.details } : null),
    ...(params.observationContent !== undefined ? { observationContent: params.observationContent } : null),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDaytonaOpenWindows(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<DaytonaDesktopWindow[]> {
  const windows = await daytonaComputerUseRequest<{ windows?: unknown }>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: "/computeruse/display/windows",
    signal: params.signal,
  });
  if (!windows.ok) return [];
  const payloadRecord = asRecord(windows.payload);
  const rawWindows = Array.isArray(payloadRecord?.windows)
    ? payloadRecord?.windows
    : Array.isArray(windows.payload)
      ? windows.payload
      : [];
  const out: DaytonaDesktopWindow[] = [];
  for (const value of rawWindows) {
    const normalized = normalizeDesktopWindow(value);
    if (!normalized) continue;
    out.push(normalized);
  }
  return out;
}

async function launchSandboxBrowserWindow(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const command = [
    `for DISPLAY_ID in "$DISPLAY" :0 :1 :99; do`,
    `  [ -n "$DISPLAY_ID" ] || continue`,
    `  for BROWSER in firefox chromium chromium-browser google-chrome x-www-browser; do`,
    `    if command -v "$BROWSER" >/dev/null 2>&1; then`,
    `      DISPLAY="$DISPLAY_ID" "$BROWSER" --new-window about:blank >/tmp/polynet-browser-launch.log 2>&1 &`,
    `      sleep 1`,
    `      exit 0`,
    `    fi`,
    `  done`,
    `done`,
    `exit 1`,
  ].join("\n");
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command,
    timeoutSeconds: 20,
    allowNonZero: true,
    signal: params.signal,
  });
  return result.ok && result.exitCode === 0;
}

async function focusSandboxWindow(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  windowId: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const windowId = String(params.windowId ?? "").trim();
  if (!windowId) return false;
  const command = [
    `WINDOW_ID=${shellQuote(windowId)}`,
    `for DISPLAY_ID in "$DISPLAY" :0 :1 :99; do`,
    `  [ -n "$DISPLAY_ID" ] || continue`,
    `  if command -v xdotool >/dev/null 2>&1; then`,
    `    DISPLAY="$DISPLAY_ID" xdotool windowactivate --sync "$WINDOW_ID" >/dev/null 2>&1 && exit 0`,
    `  fi`,
    `  if command -v wmctrl >/dev/null 2>&1; then`,
    `    DISPLAY="$DISPLAY_ID" wmctrl -ia "$WINDOW_ID" >/dev/null 2>&1 && exit 0`,
    `  fi`,
    `done`,
    `exit 1`,
  ].join("\n");
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command,
    timeoutSeconds: 10,
    allowNonZero: true,
    signal: params.signal,
  });
  return result.ok && result.exitCode === 0;
}

async function pressDesktopKey(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  key: string;
  modifiers?: string[];
  signal?: AbortSignal;
}): Promise<boolean> {
  const key = normalizeDesktopKey(params.key);
  if (!key) return false;
  const pressed = await daytonaComputerUseRequest({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: "/computeruse/keyboard/key",
    body: {
      key,
      modifiers: params.modifiers ?? [],
    },
    signal: params.signal,
  });
  return pressed.ok;
}

async function typeDesktopText(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  text: string;
  delayMs?: number;
  signal?: AbortSignal;
}): Promise<boolean> {
  const typed = await daytonaComputerUseRequest({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: "/computeruse/keyboard/type",
    body: {
      text: params.text,
      delay: params.delayMs ?? 0,
    },
    signal: params.signal,
  });
  return typed.ok;
}

async function probeUrlReachability(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  url: string;
  signal?: AbortSignal;
}): Promise<DaytonaUrlReachabilityResult> {
  const url = String(params.url ?? "").trim();
  if (!url) {
    return {
      ok: false,
      code: "browser_navigation_failed",
      message: "No URL was provided for navigation.",
      outputPreview: null,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: true };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: true };
  }

  const probeCommand = [
    `TARGET_URL=${shellQuote(url)}`,
    `if command -v curl >/dev/null 2>&1; then`,
    `  curl -L -sS --max-time 8 --connect-timeout 5 -o /dev/null "$TARGET_URL"`,
    `  exit $?`,
    `fi`,
    `if command -v python3 >/dev/null 2>&1; then`,
    `  python3 - <<'PY'`,
    `import sys`,
    `import urllib.request`,
    `url = ${JSON.stringify(url)}`,
    `try:`,
    `    with urllib.request.urlopen(url, timeout=8) as response:`,
    `        response.read(1)`,
    `    raise SystemExit(0)`,
    `except Exception as exc:`,
    `    print(str(exc))`,
    `    raise SystemExit(1)`,
    `PY`,
    `  exit $?`,
    `fi`,
    `echo "No curl or python3 available for network probe."`,
    `exit 2`,
  ].join("\n");

  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: probeCommand,
    timeoutSeconds: 15,
    allowNonZero: true,
    signal: params.signal,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: "browser_navigation_probe_failed",
      message: result.message,
      outputPreview: readString(result.details?.output_preview) ?? null,
    };
  }
  if (result.exitCode === 0) return { ok: true };
  if (result.exitCode === 2) {
    return {
      ok: false,
      code: "browser_navigation_probe_unavailable",
      message: "No network probe tool is available in the sandbox.",
      outputPreview: result.stdout.trim() || null,
    };
  }
  return {
    ok: false,
    code: "browser_navigation_network_unreachable",
    message: `The sandbox browser could not reach ${url}.`,
    outputPreview: result.stdout.trim() || null,
  };
}

export async function openUrlInDaytonaBrowser(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  url: string;
  signal?: AbortSignal;
  captureObservationContent: (params: {
    summaryText: string;
    showCursor?: boolean;
    signal?: AbortSignal;
  }) => Promise<ComputerUseObservationContent>;
}): Promise<NativeToolExecutionResult> {
  const url = String(params.url ?? "").trim();
  const windowsBefore = await getDaytonaOpenWindows({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    signal: params.signal,
  });
  let browserWindow = findLikelyBrowserWindow(windowsBefore);
  if (!browserWindow) {
    await launchSandboxBrowserWindow({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      signal: params.signal,
    });
    await sleep(1_000);
  }
  const windowsAfterLaunch = await getDaytonaOpenWindows({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    signal: params.signal,
  });
  browserWindow = findLikelyBrowserWindow(windowsAfterLaunch) ?? browserWindow;
  if (!browserWindow) {
    return errorToolResult({
      errorCode: "browser_window_not_visible",
      errorMessage: "No visible browser window was found on the sandbox desktop. Open or focus the browser manually with computer_click first.",
      details: {
        computer_use: {
          action: "computer_open_url",
          window_titles_before: summarizeWindowTitles(windowsBefore),
          window_titles_after: summarizeWindowTitles(windowsAfterLaunch),
        },
      },
    });
  }
  if (browserWindow.id) {
    await focusSandboxWindow({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      windowId: browserWindow.id,
      signal: params.signal,
    });
    await sleep(250);
  }
  await pressDesktopKey({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    key: "l",
    modifiers: ["ctrl"],
    signal: params.signal,
  });
  await sleep(150);
  const typedUrl = await typeDesktopText({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    text: url,
    delayMs: 8,
    signal: params.signal,
  });
  if (!typedUrl) {
    return errorToolResult({
      errorCode: "browser_navigation_failed",
      errorMessage: "Could not type the URL into the visible browser window.",
    });
  }
  await sleep(150);
  await pressDesktopKey({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    key: "Enter",
    signal: params.signal,
  });
  await sleep(1_200);
  const windowsAfterNavigation = await getDaytonaOpenWindows({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    signal: params.signal,
  });
  const reachability = await probeUrlReachability({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    url,
    signal: params.signal,
  });
  const observationContent = await params.captureObservationContent({
    summaryText: reachability.ok
      ? `Opened ${url} in the sandbox browser. Use this screenshot as the latest visual state.`
      : `Attempted to open ${url}, but the browser appears blocked from reaching it. Use this screenshot as the latest visual state.`,
    showCursor: true,
    signal: params.signal,
  });
  const computerUseDetails = {
    action: "computer_open_url",
    window_titles_before: summarizeWindowTitles(windowsBefore),
    window_titles_after: summarizeWindowTitles(windowsAfterNavigation),
    browser_window_title: browserWindow.title ?? browserWindow.appName ?? null,
    network_probe_status: reachability.ok ? "reachable" : reachability.code,
    network_probe_message: reachability.ok ? null : reachability.message,
    network_probe_output: reachability.ok ? null : reachability.outputPreview,
  };
  if (!reachability.ok && reachability.code !== "browser_navigation_probe_unavailable") {
    return errorToolResult({
      outputText: reachability.outputPreview || "",
      errorCode: reachability.code,
      errorMessage: reachability.message,
      details: {
        computer_use: computerUseDetails,
      },
      observationContent,
    });
  }
  return okToolResult({
    outputText: `Opened ${url} in the sandbox browser.`,
    details: {
      computer_use: computerUseDetails,
    },
    observationContent,
  });
}
