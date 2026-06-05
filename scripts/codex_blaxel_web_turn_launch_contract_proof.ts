import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, needle: string, message: string): void {
  assert.ok(source.includes(needle), message);
}

function assertOrderWithin(source: string, startNeedle: string, orderedNeedles: string[], message: string): void {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${message}: missing ${startNeedle}`);
  let cursor = start;
  for (const needle of orderedNeedles) {
    const index = source.indexOf(needle, cursor + 1);
    assert.notEqual(index, -1, `${message}: missing ${needle}`);
    assert.ok(index > cursor, `${message}: expected ${needle} after prior invariant`);
    cursor = index;
  }
}

function listFilesRecursive(dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relativePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(relativePath));
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

const gateway = read("shared/cloudCodexRuntimeGateway.ts");
assertIncludes(gateway, "bootstrapGatewayAuthContext", "gateway must use authenticated Convex context");
assertIncludes(gateway, '"threads:getCloudThreadByThreadKey"', "gateway must resolve public thread key to Convex thread id");
assertIncludes(
  gateway,
  '"blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn"',
  "gateway must call the productized Codex Blaxel action",
);
assertIncludes(gateway, "destroyAfterRun: params.destroyAfterRun !== false", "web launch must default to destroying sandboxes");
assertIncludes(gateway, "CODEX_BLAXEL_DEFAULT_MODEL_ID", "gateway must expose the Codex runtime model identity");

const controller = read("shared/useWebTurnRunnerController.ts");
assertIncludes(controller, "VITE_ENABLE_CODEX_BLAXEL_WEB_TURNS", "Codex web launch must be staging-flagged");
assertIncludes(controller, 'params.requestedFundingSource === "user_chatgpt"', "Codex web launch must be user ChatGPT funded");
assertIncludes(controller, 'params.inferenceSource === "chatgpt"', "Codex web launch must require ChatGPT inference source");
assertIncludes(controller, "runCloudCodexBlaxelRuntimeTurn", "turn runner must call Codex Blaxel gateway");
assertIncludes(controller, 'engine_id: "codex_blaxel_app_server"', "streaming state must identify Codex Blaxel runtime");
assertIncludes(controller, 'streamTransport: "recovery"', "Codex web launch must use recovery polling, not a new SSE stream");
assertIncludes(controller, "readLatestUserMessageText", "Codex prompt must come from the latest user message");
assertIncludes(controller, "isCodexBlaxelProviderConnectionFailure", "provider-connection failures must keep existing modal semantics");
assertOrderWithin(
  controller,
  "const shouldUseCodexBlaxel =",
  [
    "await ensureCloudThreadRecordForRuntime(session, threadId);",
    'streamTransport: "recovery"',
    "await runCloudCodexBlaxelRuntimeTurn({",
    "await recoverRuntimeTurnFromPersistedState({",
    "let baseUrl: string;",
    "return invokeCloudRuntimeTurn({",
  ],
  "Codex branch must run before the legacy runtime_turn transport and keep non-Codex fallback intact",
);

const lifecycle = read("apps/web/src/controllers/useWebRuntimeRunLifecycle.ts");
assertIncludes(lifecycle, 'value.streamTransport !== "sse"', "recovery polling must poll non-SSE runs");
assertIncludes(lifecycle, "readAssistantTextDelta", "recovery polling must render assistant text deltas");
assertIncludes(lifecycle, "listConvexCloudRuntimeRunEvents", "recovery polling must read persisted runtime events");

const projection = read("apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx");
assertIncludes(projection, "params.runtimeEventsByRunId[message.run_id] ?? []", "persisted messages must attach hydrated runtime events");
assertIncludes(projection, "params.activeThreadStreamingState.runtimeEvents", "active streaming state must feed existing timeline");

const componentFiles = listFilesRecursive("apps/web/src/components");
for (const file of componentFiles) {
  assert.ok(
    !/Codex.*Timeline|Timeline.*Codex/.test(file),
    `Codex web launch must reuse existing runtime timeline, found ${file}`,
  );
}

const packageJson = read("package.json");
assertIncludes(
  packageJson,
  "check:codex-blaxel-web-turn-launch-contract",
  "package scripts must expose Codex web turn launch proof",
);

console.log("codex_blaxel_web_turn_launch_contract_proof: ok");
