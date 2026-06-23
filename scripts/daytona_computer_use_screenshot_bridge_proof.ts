import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const daytonaActions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const threads = read("convex/threads.ts");
const cloudThreadsRead = read("shared/cloudThreadsRead.ts");
const runtimeExecutionSession = read("convex/runtimeExecutionSession.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const workerTool = read("convex/polynetCodexWorkerTool.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const daytonaCodexConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const packageJson = read("package.json");
const daytonaScreenshotActionStart = daytonaActions.indexOf(
  "export const captureDaytonaComputerUseScreenshotInternal",
);
const daytonaScreenshotActionEnd = daytonaActions.indexOf(
  "export const teardownAndRecordDaytonaCodexRuntimeTargetInternal",
  daytonaScreenshotActionStart,
);
const daytonaScreenshotAction =
  daytonaScreenshotActionStart >= 0 && daytonaScreenshotActionEnd > daytonaScreenshotActionStart
    ? daytonaActions.slice(daytonaScreenshotActionStart, daytonaScreenshotActionEnd)
    : "";
const daytonaOpenUrlActionStart = daytonaActions.indexOf(
  "export const openDaytonaComputerUseUrlInternal",
);
const daytonaOpenUrlActionEnd = daytonaActions.indexOf(
  "export const teardownAndRecordDaytonaCodexRuntimeTargetInternal",
  daytonaOpenUrlActionStart,
);
const daytonaOpenUrlAction =
  daytonaOpenUrlActionStart >= 0 && daytonaOpenUrlActionEnd > daytonaOpenUrlActionStart
    ? daytonaActions.slice(daytonaOpenUrlActionStart, daytonaOpenUrlActionEnd)
    : "";

assert.match(
  packageJson,
  /"check:daytona-computer-use-screenshot-bridge-proof"/,
  "package scripts must expose the Daytona screenshot bridge proof",
);

assert.match(
  daytonaActions,
  /captureDaytonaComputerUseScreenshotInternal = internalAction/,
  "Daytona screenshot bridge must be implemented as a provider-side internal action",
);

assert.match(
  daytonaActions,
  /openDaytonaComputerUseUrlInternal = internalAction/,
  "Daytona open-url bridge must be implemented as a provider-side internal action",
);

assert.match(
  daytonaActions,
  /normalizeComputerOpenUrl[\s\S]*computer_open_url_external_not_allowed/,
  "Daytona open-url bridge must validate URLs and default to local preview URLs",
);

assert.match(
  daytonaActions,
  /isRetryableDaytonaComputerUseBridgeError[\s\S]*connection is shut down[\s\S]*DAYTONA_COMPUTER_USE_MAX_READY_ATTEMPTS/,
  "Daytona Computer Use bridge must classify connection-shutdown readiness failures as bounded retryable provider errors",
);

assert.match(
  daytonaActions,
  /startDaytonaComputerUseWithReadiness[\s\S]*computerUse\.start\?\.\(\)[\s\S]*readDaytonaComputerUseStatus/,
  "Daytona Computer Use bridge must start Computer Use through a readiness helper before browser or screenshot work",
);

assert.match(
  daytonaOpenUrlAction,
  /runRetryableDaytonaComputerUseOperation[\s\S]*startDaytonaComputerUseWithReadiness/,
  "Daytona open-url bridge must retry transient Computer Use readiness failures before launching the browser",
);

assert.doesNotMatch(
  daytonaOpenUrlAction,
  /computerUse\.stop\(\)/,
  "Daytona open-url bridge must not stop Computer Use before the screenshot tool can observe the page",
);

assert.match(
  daytonaOpenUrlAction,
  /sandbox\.process\.executeCommand\(\s*buildDaytonaComputerOpenUrlCommand/,
  "Daytona open-url bridge must launch the visible browser through the sandbox process API",
);

assert.match(
  daytonaScreenshotAction,
  /runRetryableDaytonaComputerUseOperation[\s\S]*startDaytonaComputerUseWithReadiness/,
  "Daytona screenshot bridge must retry transient Computer Use readiness failures before capture",
);

assert.match(
  daytonaScreenshotAction,
  /computerUse!\.stop\(\)/,
  "Daytona screenshot bridge must stop Computer Use after the capture",
);

assert.match(
  daytonaActions,
  /takeCompressed[\s\S]*takeFullScreen/,
  "Daytona screenshot bridge must prefer compressed screenshot and support full-screen fallback",
);

assert.match(
  daytonaActions,
  /ctx\.storage\.store\(\s*new Blob/,
  "Daytona screenshot bridge must store the screenshot in Convex storage",
);

assert.match(
  daytonaActions,
  /MAX_COMPUTER_USE_SCREENSHOT_BYTES/,
  "Daytona screenshot bridge must cap screenshot payload size before storage",
);

assert.doesNotMatch(
  daytonaScreenshotAction,
  /appendCloudRuntimeRunEvent|eventType: "tool_call_finished"/,
  "Daytona provider bridge must not append tool events; the runtime tool loop owns tool_call_finished",
);

assert.match(
  runtimeExecutionSession,
  /computerToolName === "computer_screenshot"[\s\S]*captureDaytonaComputerUseScreenshotInternal/,
  "runtime execution session must route computer_screenshot to the Daytona screenshot bridge",
);

assert.match(
  runtimeExecutionSession,
  /computerToolName === "computer_open_url"[\s\S]*openDaytonaComputerUseUrlInternal/,
  "runtime execution session must route computer_open_url to the Daytona open-url bridge",
);

assert.match(
  runtimeExecutionSession,
  /buildToolObservationMessage\([\s\S]*imageUrl: frameUrl/,
  "runtime execution session must return the screenshot as model-visible observation content",
);

assert.match(
  runtimeExecutionSession,
  /computerToolName === "computer_screenshot"[\s\S]*observationContent/,
  "runtime execution session must return screenshot observationContent through the normal tool result",
);

assert.doesNotMatch(
  daytonaActions,
  /frame_base64|screenshot_base64|raw_screenshot|provider_preview_url/,
  "Daytona screenshot bridge must not persist raw screenshot payloads or provider preview URLs",
);

assert.doesNotMatch(
  daytonaOpenUrlAction,
  /frame_base64|screenshot_base64|raw_screenshot|provider_preview_url/,
  "Daytona open-url bridge must not persist raw screenshot payloads or provider preview URLs",
);

assert.match(
  threads,
  /captureCloudRuntimeRunComputerUseScreenshot = action/,
  "public screenshot bridge must be exposed through an authenticated thread action",
);

assert.match(
  threads,
  /resolveOwnerIdForAuthenticatedRequest[\s\S]*getRuntimeRunByOwnerRunIdInternal[\s\S]*captureDaytonaComputerUseScreenshotInternal/,
  "public screenshot bridge must validate owner/run before invoking Daytona",
);

assert.match(
  cloudThreadsRead,
  /captureConvexCloudRuntimeRunComputerUseScreenshot/,
  "browser/shared client must expose the screenshot bridge helper",
);

assert.match(
  cloudThreadsRead,
  /threads:captureCloudRuntimeRunComputerUseScreenshot/,
  "shared helper must call the authenticated Convex action",
);

assert.match(
  worker,
  /buildComputerScreenshotDynamicToolSpec[\s\S]*name: CODEX_COMPUTER_SCREENSHOT_TOOL_NAME[\s\S]*inputImage/,
  "Daytona Codex worker must advertise computer_screenshot as a model-visible dynamic tool and return an image observation",
);

assert.match(
  worker,
  /buildComputerOpenUrlDynamicToolSpec[\s\S]*name: CODEX_COMPUTER_OPEN_URL_TOOL_NAME[\s\S]*required: \["url"\]/,
  "Daytona Codex worker must advertise computer_open_url as a model-visible dynamic tool",
);

assert.match(
  worker,
  /formatComputerUseFailureText[\s\S]*not ready after retry[\s\S]*preview panel/,
  "Daytona Codex worker must present transient Computer Use failures as clean visual-inspection unavailability",
);

assert.match(
  worker,
  /toolName === CODEX_COMPUTER_SCREENSHOT_TOOL_NAME[\s\S]*handleComputerScreenshotCall/,
  "Daytona Codex worker must route computer_screenshot dynamic tool calls",
);

assert.match(
  worker,
  /toolName === CODEX_COMPUTER_OPEN_URL_TOOL_NAME[\s\S]*handleComputerOpenUrlCall/,
  "Daytona Codex worker must route computer_open_url dynamic tool calls",
);

assert.match(
  workerTool,
  /requestedToolName === "computer_screenshot"[\s\S]*captureDaytonaComputerUseScreenshotInternal/,
  "worker tool endpoint must dispatch computer_screenshot through the Daytona screenshot bridge",
);

assert.match(
  workerTool,
  /requestedToolName === "computer_open_url"[\s\S]*openDaytonaComputerUseUrlInternal/,
  "worker tool endpoint must dispatch computer_open_url through the Daytona open-url bridge",
);

assert.match(
  runtimeTurnHandlers,
  /workerRuntimeToolBridgeRequired = true[\s\S]*resolveCodexHarnessToolPolicy\(\{[\s\S]*workspaceServeAvailable: workerRuntimeToolBridgeRequired[\s\S]*computerAdaptersAvailable: workerRuntimeToolBridgeRequired[\s\S]*workerPlatformTools\.length > 0 \|\| workerRuntimeToolBridgeRequired[\s\S]*buildPolynetCodexWorkerToolTarget[\s\S]*runtime_tool_names: codexHarnessToolPolicy\.runtimeAdapterToolNames/,
  "Daytona worker turns must mint the tool bridge even when no PolyNet platform tools are projected",
);

assert.match(
  daytonaCodexConfig,
  /workspace_serve[\s\S]*computer_open_url[\s\S]*computer_screenshot/,
  "Daytona Codex instructions must teach the serve/open/screenshot preview inspection loop",
);

console.log("daytona_computer_use_screenshot_bridge_proof: ok");
