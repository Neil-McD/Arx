import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { resolvePolynetRuntimeEngine } from "../shared/runtimeEngine.ts";
import { resolveRuntimeInvocationSurfaceForThread } from "../shared/runtimeInvocationSurface.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sourceCorpus(directory: string): string {
  const chunks: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if ([".ts", ".tsx"].includes(extname(entry.name))) chunks.push(read(child));
    }
  };
  visit(directory);
  return chunks.join("\n");
}

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
  null,
);
assert.equal(
  resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: "workspace",
    threadKey: "member-agent:global:episode:1",
  }),
  null,
);
assert.deepEqual(resolvePolynetRuntimeEngine({ requestedRuntimeEngine: null }), {
  ok: true,
  requestedRuntimeEngine: null,
  resolvedRuntimeEngine: "polynet",
  runtimeEngineSource: "default",
  engineId: "runtime_convex",
});

for (const path of [
  "convex/daytonaCodexRuntimeTargetActions.ts",
  "convex/daytonaCodexRuntimeTargets.ts",
  "convex/runtimeExecutionSession.ts",
  "convex/workspaceRuntimeSession.ts",
  "convex/workspaceRuntimeTools.ts",
  "convex/workspaceTerminals.ts",
  "shared/runtimeCodexPromptProjection.ts",
  "services/polynet-codex-worker",
]) {
  assert.equal(existsSync(path), false, `${path} must remain deleted`);
}

const handlers = read("convex/runtimeTurnHandlers.ts");
const resolution = read("convex/runtimeTurnResolution.ts");
const generatedApi = read("convex/_generated/api.d.ts");
const packageJson = read("package.json");
const web = sourceCorpus("apps/web/src");
const schema = read("convex/schema.ts");

assert.doesNotMatch(handlers, /runtimeExecutionMode|polynetCodexWorker|legacy_project_workspace/);
assert.match(resolution, /code: "invalid_invocation_surface"/);
assert.match(resolution, /code: "unsupported_runtime_engine"/);
assert.doesNotMatch(read("shared/runtimeEngine.ts"), /codex|workspace/i);
assert.doesNotMatch(
  generatedApi,
  /workspaceTerminals|daytonaCodexRuntimeTarget|getCloudRuntimeRunDaytonaPreviewSession|getCloudRuntimeRunComputerUseLiveSession/,
);
assert.doesNotMatch(
  web,
  /threads:(?:getCloudRuntimeRunDaytonaPreviewSession|getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot)/,
);
assert.doesNotMatch(packageJson, /@daytona\/sdk|polynet-codex-worker/);
assert.doesNotMatch(
  schema,
  /daytonaCodexRuntimeTargets: defineTable|polynetCodexWorkerCapacityLeases: defineTable/,
  "the schema must not retain dead provider-runtime tables",
);
assert.match(read("convex/httpMcp.ts"), /path: "\/runtime\/mcp"/);

console.log("native_runtime_ingress_extinction_contract_proof: ok");
