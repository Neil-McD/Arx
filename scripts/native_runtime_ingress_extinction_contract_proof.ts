import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { resolvePolynetRuntimeEngine } from "../shared/runtimeEngine.ts";
import {
  resolveRuntimeInvocationSurfaceForThread,
} from "../shared/runtimeInvocationSurface.ts";

const root = new URL("../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function walkSourceFiles(directory: string): string[] {
  const absolute = new URL(directory, root).pathname;
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
        out.push(relative(new URL(".", root).pathname, path));
      }
    }
  };
  visit(absolute);
  return out.sort();
}

const runtimeSurfaces = read("shared/runtimeInvocationSurface.ts");
const runtimeEngines = read("shared/runtimeEngine.ts");
const resolution = read("convex/runtimeTurnResolution.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const runner = read("shared/useWebTurnRunnerController.ts");
const transport = read("shared/cloudRuntimeTransport.ts");
const runtimeRoutes = read("convex/httpRuntimeRoutes.ts");
const http = read("convex/http.ts");
const crons = read("convex/crons.ts");
const memberDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const funnelComposer = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const schema = read("convex/schema.ts");
const threads = read("convex/threads.ts");
const mcpRoutes = read("convex/httpMcp.ts");
const mcpSetup = read("shared/polynetMcpSetup.ts");
const daytonaActions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const daytonaPolicy = read("shared/daytonaRuntimePolicy.ts");
const harnessPolicy = read("shared/harnessToolPolicy.ts");
const packageJson = read("package.json");

assert.equal(
  resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: "member_agent_dock",
    threadKey: "member-agent:global:episode:1",
  }),
  "member_agent_dock",
);
assert.equal(
  resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: "community_funnel_builder",
    threadKey: "community-funnel:community_1",
  }),
  "community_funnel_builder",
);
for (const retired of [null, undefined, "", "workspace", "unknown"]) {
  assert.equal(
    resolveRuntimeInvocationSurfaceForThread({
      requestedSurface: retired,
      threadKey: "member-agent:global:episode:1",
    }),
    null,
  );
}
assert.equal(
  resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: "member_agent_dock",
    threadKey: "community-funnel:community_1",
  }),
  null,
  "surface identity must match thread identity",
);

const defaultEngine = resolvePolynetRuntimeEngine({
  requestedRuntimeEngine: null,
});
assert.deepEqual(defaultEngine, {
  ok: true,
  requestedRuntimeEngine: null,
  resolvedRuntimeEngine: "polynet",
  runtimeEngineSource: "default",
  engineId: "runtime_convex",
});
assert.equal(
  resolvePolynetRuntimeEngine({
    requestedRuntimeEngine: "polynet",
  }).ok,
  true,
);
assert.deepEqual(
  resolvePolynetRuntimeEngine({
    requestedRuntimeEngine: "codex",
  }),
  {
    ok: false,
    status: 400,
    code: "unsupported_runtime_engine",
    message: "The native Polynet runtime is the only supported runtime engine.",
    requestedRuntimeEngine: "codex",
    resolvedRuntimeEngine: null,
    runtimeEngineSource: "request",
    engineId: null,
  },
);

assert.doesNotMatch(
  runtimeSurfaces.match(/export type RuntimeInvocationSurface =[\s\S]*?;/)?.[0] ?? "",
  /workspace|codex/,
);
assert.match(
  runtimeEngines,
  /ACTIVE_WORKSPACE_RUNTIME_ENGINES = \[\s*RUNTIME_ENGINE_POLYNET,?\s*\]/,
);
assert.match(runtimeEngines, /return params\.engine === RUNTIME_ENGINE_POLYNET/);
assert.match(resolution, /code: "invalid_invocation_surface"/);
assert.match(resolution, /code: "unsupported_runtime_engine"/);
assert.match(resolution, /code: "agentic_runtime_required"/);
assert.match(resolution, /code: "governed_agent_tools_unavailable"/);
assert.doesNotMatch(resolution, /runtimeExecutionMode/);
assert.doesNotMatch(handlers, /runtimeExecutionMode/);
assert.match(handlers, /executionMode: "agentic"/);
assert.doesNotMatch(
  handlers,
  /capability_composed_chat_v1|legacy_project_workspace|composePlatformChatRuntimeSystemPrompt/,
);
assert.doesNotMatch(
  runtimePrompt,
  /composePlatformChatRuntimeSystemPrompt|composePlatformCommunityContextSystemPrompt|Active harness: chat\./,
);
assert.equal(
  existsSync(new URL("shared/communityContextEnvelope.ts", root)),
  false,
  "unused chat-only community context envelope must stay deleted",
);
assert.match(threads, /requestedExecutionMode !== "agentic"/);
assert.match(threads, /throw new Error\("unsupported_execution_mode"\)/);
assert.match(threads, /const executionMode = "agentic"/);
assert.match(
  threads,
  /Execution mode: \$\{args\.run\.executionMode \?\? "chat"\}/,
  "historical missing execution-mode records remain readable with their legacy interpretation",
);
assert.ok(
  resolution.indexOf('code: "invalid_invocation_surface"') <
    resolution.indexOf('setStage("messages")'),
  "invalid surfaces must fail before conversation or provider resolution",
);

const webControllerCallers = walkSourceFiles("apps/web/src")
  .filter((path) => read(path).includes("useWebTurnRunnerController<"));
assert.deepEqual(webControllerCallers, [
  "apps/web/src/components/WebCommunityFunnelEditor.tsx",
  "apps/web/src/components/WebMemberAgentDock.tsx",
]);
assert.match(
  memberDock,
  /runtimeEngine: "polynet"[\s\S]*invocationSurface: "member_agent_dock"[\s\S]*requestedAgenticTools: true/,
);
assert.match(
  funnelComposer,
  /runtimeEngine: "polynet"[\s\S]*invocationSurface: "community_funnel_builder"[\s\S]*requestedAgenticTools: true/,
);
assert.match(runner, /invocation_surface: params\.invocationSurface/);
assert.match(runner, /runtime_engine: params\.runtimeEngine/);
assert.match(runner, /requested_agentic_tools: true/);
assert.doesNotMatch(runner, /\?\? "workspace"|runPublicTurn|invokeCloudPublicTurn/);

for (const source of [runtimeRoutes, runner, transport]) {
  assert.doesNotMatch(source, /public_turn|handlePublicTurnRequest|invokeCloudPublicTurn/);
}
assert.doesNotMatch(
  http,
  /POLYNET_CODEX_WORKER_(INGEST|TERMINAL|TOOL)_PATH|handlePolynetCodexWorker(Ingest|Terminal|Tool)/,
);
assert.doesNotMatch(crons, /sweep expired daytona codex runtime targets/);
assert.doesNotMatch(
  threads.match(/export const ensureCloudThread = mutation\([\s\S]*?\n\}\);/)?.[0] ?? "",
  /v\.literal\("codex"\)/,
);
assert.doesNotMatch(
  threads.match(/export const updateCloudThread = mutation\([\s\S]*?\n\}\);/)?.[0] ?? "",
  /v\.literal\("codex"\)/,
);

assert.match(
  schema,
  /runtimeEngine: v\.optional\(v\.union\(v\.literal\("polynet"\), v\.literal\("codex"\)\)\)/,
  "historical runtime rows remain readable",
);
assert.match(schema, /polynetCodexWorkerCapacityLeases: defineTable/);
assert.match(schema, /daytonaCodexRuntimeTargets: defineTable/);

for (const retiredPath of [
  "convex/polynetCodexWorkerBridge.ts",
  "convex/polynetCodexWorkerAdmission.ts",
  "convex/polynetCodexWorkerIngest.ts",
  "convex/polynetCodexWorkerTool.ts",
  "convex/polynetCodexWorkerRunToken.ts",
  "convex/polynetCodexWorkerTerminal.ts",
  "shared/runtimeCodexPromptProjection.ts",
  "shared/polynetCodexWorkerLimits.ts",
  "shared/daytonaCodexRuntimePolicy.ts",
  "services/polynet-codex-worker",
  "scripts/run_polynet_codex_worker_service_local.sh",
]) {
  assert.equal(existsSync(new URL(retiredPath, root)), false, `${retiredPath} must stay deleted`);
}
assert.doesNotMatch(handlers, /polynetCodexWorker|POLYNET_CODEX_WORKER/);
assert.doesNotMatch(
  daytonaActions,
  /startWorker\(|run_polynet_codex_worker_service_local|POLYNET_CODEX_WORKER_AUTH_TOKEN|getSignedPreviewUrl\?\.\(WORKER_PORT/,
);
assert.doesNotMatch(daytonaPolicy, /nativeCodex|workerPort|codexHome|CODEX/);
assert.doesNotMatch(harnessPolicy, /Codex|CODEX|codex/);
assert.doesNotMatch(
  packageJson,
  /polynet-codex-worker|runtime-codex-prompt|daytona-codex-runtime|daytona-codex-tool/,
);
assert.match(mcpRoutes, /path: "\/runtime\/mcp"/);
assert.match(mcpSetup, /codex mcp add/);
assert.match(mcpSetup, /codex mcp login/);

console.log("native runtime ingress extinction contract proof passed");
