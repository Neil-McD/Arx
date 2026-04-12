import {
  buildToolObservationMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol";
import type { NativeToolExecutionResult } from "../shared/nativeToolLoop";
import {
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import {
  daytonaComputerUseRequest,
  ensureComputerUseStarted,
  getDaytonaComputerUseStatus,
} from "./daytonaComputerUseTransport";
import { openUrlInDaytonaBrowser } from "./daytonaBrowserNavigation";

const COMPUTER_USE_SCREENSHOT_SCALE = 1;
const COMPUTER_USE_SCREENSHOT_QUALITY = 55;
const COMPUTER_USE_POST_ACTION_SETTLE_MS = 400;

type DaytonaComputerToolName =
  | "computer_open_url"
  | "computer_screenshot"
  | "computer_click"
  | "computer_type"
  | "computer_keypress"
  | "computer_scroll"
  | "computer_stop";

type DaytonaScreenshotDto = {
  screenshot?: unknown;
};

type DaytonaMousePositionDto = {
  x?: unknown;
  y?: unknown;
};

type ComputerUseObservationContent = NativeToolExecutionResult["observationContent"];

function summarizeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return String(error ?? "Unknown computer use error.");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

async function getDaytonaMousePosition(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<{ x: number; y: number } | null> {
  const position = await daytonaComputerUseRequest<DaytonaMousePositionDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: "/computeruse/mouse/position",
    signal: params.signal,
  });
  if (!position.ok) return null;
  const x = Number(position.payload?.x);
  const y = Number(position.payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.floor(x), y: Math.floor(y) };
}

async function captureObservationMessage(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  summaryText: string;
  showCursor?: boolean;
  signal?: AbortSignal;
}): Promise<Extract<NativeToolAwareMessage, { role: "user" }>> {
  const showCursor = params.showCursor !== false;
  const screenshot = await daytonaComputerUseRequest<DaytonaScreenshotDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path:
      `/computeruse/screenshot/compressed?showCursor=${showCursor ? "true" : "false"}&format=jpeg&quality=${COMPUTER_USE_SCREENSHOT_QUALITY}&scale=${COMPUTER_USE_SCREENSHOT_SCALE}`,
    signal: params.signal,
    timeoutMs: 45_000,
  });
  if (!screenshot.ok) {
    throw new Error(screenshot.message);
  }
  const encoded = String(screenshot.payload?.screenshot ?? "").trim();
  if (!encoded) {
    throw new Error("Computer use screenshot capture returned no image data.");
  }
  return buildToolObservationMessage({
    summaryText: params.summaryText,
    imageUrl: `data:image/jpeg;base64,${encoded}`,
  });
}

async function captureObservationContent(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  summaryText: string;
  showCursor?: boolean;
  signal?: AbortSignal;
}): Promise<ComputerUseObservationContent> {
  const observation = await captureObservationMessage(params);
  return Array.isArray(observation.content) ? observation.content : null;
}

async function settleAndCaptureObservation(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  summaryText: string;
  showCursor?: boolean;
  settleMs?: number;
  signal?: AbortSignal;
}): Promise<ComputerUseObservationContent> {
  await sleep(params.settleMs ?? COMPUTER_USE_POST_ACTION_SETTLE_MS);
  return captureObservationContent(params);
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

export async function runDaytonaComputerUseTool(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  toolName: DaytonaComputerToolName;
  args: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<NativeToolExecutionResult> {
  try {
    if (params.toolName === "computer_stop") {
      const stopped = await daytonaComputerUseRequest({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        method: "POST",
        path: "/computeruse/stop",
        signal: params.signal,
      });
      if (!stopped.ok) return errorToolResult({ errorCode: stopped.code, errorMessage: stopped.message });
      return okToolResult({ outputText: "Stopped computer use." });
    }

    const started = await ensureComputerUseStarted({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      signal: params.signal,
    });
    if (!started.ok) return errorToolResult({ errorCode: started.code, errorMessage: started.message });

    if (params.toolName === "computer_screenshot") {
      const observationContent = await captureObservationContent({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        summaryText:
          "Current sandbox desktop screenshot. Use this visual state to decide the next computer action.",
        signal: params.signal,
      });
      return okToolResult({
        outputText: "Captured sandbox desktop screenshot.",
        observationContent,
      });
    }

    if (params.toolName === "computer_open_url") {
      return openUrlInDaytonaBrowser({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        url: String(params.args.url ?? "").trim(),
        signal: params.signal,
        captureObservationContent: ({ summaryText, showCursor, signal }) =>
          captureObservationContent({
          config: params.config,
          toolboxProxyUrl: params.toolboxProxyUrl,
          sandboxId: params.sandboxId,
          summaryText,
          showCursor,
          signal,
        }),
      });
    }

    if (params.toolName === "computer_click") {
      const x = Number(params.args.x ?? 0);
      const y = Number(params.args.y ?? 0);
      const button = String(params.args.button ?? "left").trim() || "left";
      const doubleClick = params.args.double === true;
      const clicked = await daytonaComputerUseRequest({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        method: "POST",
        path: "/computeruse/mouse/click",
        body: {
          x,
          y,
          button,
          double: doubleClick,
        },
        signal: params.signal,
      });
      if (!clicked.ok) return errorToolResult({ errorCode: clicked.code, errorMessage: clicked.message });
      await sleep(COMPUTER_USE_POST_ACTION_SETTLE_MS);
      const mousePosition = await getDaytonaMousePosition({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        signal: params.signal,
      });
      const observationContent = await captureObservationContent({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        summaryText: `Clicked at (${Math.floor(x)}, ${Math.floor(y)}) with the ${button} mouse button. Use this screenshot as the latest visual state.`,
        showCursor: true,
        signal: params.signal,
      });
      return okToolResult({
        outputText: `Clicked ${button}${doubleClick ? " twice" : ""} at (${Math.floor(x)}, ${Math.floor(y)}).`,
        details: {
          computer_use: {
            action: params.toolName,
            requested_x: Math.floor(x),
            requested_y: Math.floor(y),
            mouse_x: mousePosition?.x ?? null,
            mouse_y: mousePosition?.y ?? null,
          },
        },
        observationContent,
      });
    }

    if (params.toolName === "computer_type") {
      const text = String(params.args.text ?? "");
      const delayMs =
        typeof params.args.delay_ms === "number" ? Math.max(0, Math.floor(params.args.delay_ms)) : 0;
      const typed = await daytonaComputerUseRequest({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        method: "POST",
        path: "/computeruse/keyboard/type",
        body: {
          text,
          delay: delayMs,
        },
        signal: params.signal,
      });
      if (!typed.ok) return errorToolResult({ errorCode: typed.code, errorMessage: typed.message });
      const observationContent = await settleAndCaptureObservation({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        summaryText: "Typed text into the focused desktop surface. Use this screenshot as the latest visual state.",
        showCursor: true,
        signal: params.signal,
      });
      return okToolResult({
        outputText: `Typed ${text.length} character${text.length === 1 ? "" : "s"}.`,
        observationContent,
      });
    }

    if (params.toolName === "computer_keypress") {
      const key = normalizeDesktopKey(params.args.key);
      const modifiers = Array.isArray(params.args.modifiers)
        ? params.args.modifiers.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [];
      const pressed = await daytonaComputerUseRequest({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        method: "POST",
        path: "/computeruse/keyboard/key",
        body: {
          key,
          modifiers,
        },
        signal: params.signal,
      });
      if (!pressed.ok) return errorToolResult({ errorCode: pressed.code, errorMessage: pressed.message });
      const observationContent = await settleAndCaptureObservation({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        summaryText: `Pressed ${modifiers.length > 0 ? `${modifiers.join("+")}+` : ""}${key}. Use this screenshot as the latest visual state.`,
        showCursor: true,
        signal: params.signal,
      });
      return okToolResult({
        outputText: `Pressed ${modifiers.length > 0 ? `${modifiers.join("+")}+` : ""}${key}.`,
        observationContent,
      });
    }

    if (params.toolName === "computer_scroll") {
      const x = Number(params.args.x ?? 0);
      const y = Number(params.args.y ?? 0);
      const direction =
        String(params.args.direction ?? "").trim().toLowerCase() === "up" ? "up" : "down";
      const amount =
        typeof params.args.amount === "number" ? Math.max(1, Math.floor(params.args.amount)) : 1;
      const scrolled = await daytonaComputerUseRequest({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        method: "POST",
        path: "/computeruse/mouse/scroll",
        body: {
          x,
          y,
          direction,
          amount,
        },
        signal: params.signal,
      });
      if (!scrolled.ok) return errorToolResult({ errorCode: scrolled.code, errorMessage: scrolled.message });
      const observationContent = await settleAndCaptureObservation({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        summaryText: `Scrolled ${direction} at (${Math.floor(x)}, ${Math.floor(y)}). Use this screenshot as the latest visual state.`,
        showCursor: true,
        signal: params.signal,
      });
      return okToolResult({
        outputText: `Scrolled ${direction} at (${Math.floor(x)}, ${Math.floor(y)}) by ${amount}.`,
        observationContent,
      });
    }

    return errorToolResult({
      errorCode: "tool_not_allowed",
      errorMessage: `${params.toolName} is not a supported computer use tool.`,
    });
  } catch (error) {
    return errorToolResult({
      errorCode: "computer_use_failed",
      errorMessage: summarizeUnknownError(error),
    });
  }
}
