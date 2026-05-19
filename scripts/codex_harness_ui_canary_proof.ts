import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

const app = readText("apps/web/src/App.tsx");
const runtimeTurnHandlers = readText("convex/runtimeTurnHandlers.ts");
const turnRunner = readText("shared/useWebTurnRunnerController.ts");
const sendFlow = readText("shared/useWebSendFlowController.ts");
const webTurnCore = readText("shared/webTurnRunnerCore.ts");
const webSendCore = readText("shared/webSendFlowCore.ts");
const packageJson = readText("package.json");

assert.match(
  app,
  /workspace-codex-canary-toggle/,
  "operator UI should expose a narrow Codex primary canary toggle",
);

assert.match(
  app,
  /forceNonStreamingRuntimeTurn: useCodexPrimaryCanaryForNextTurn/,
  "workspace sends should pass the canary through as a one-turn non-streaming runtime override",
);

assert.match(
  app,
  /if \(useCodexPrimaryCanaryForNextTurn\) \{[\s\S]*setIsCodexPrimaryCanaryEnabled\(false\)/,
  "Codex canary should disarm after the next send",
);

assert.match(
  app,
  /function isStagingCodexPrimaryCanaryDebugAllowed\(\)[\s\S]*hostname === "polynet-staging\.vercel\.app"[\s\S]*return true/,
  "Codex canary debug access should be staging-only without depending on product operator roles",
);

assert.match(
  app,
  /hasCodexPrimaryCanaryAccess[\s\S]*hasOperatorDataPanelAccess \|\| isStagingCodexPrimaryCanaryDebugAllowed\(\)/,
  "Codex canary access should allow operator access or explicit staging debug access",
);

assert.match(
  app,
  /isCodexPrimaryCanaryEnabled[\s\S]*hasCodexPrimaryCanaryAccess[\s\S]*activePage === "workspace"[\s\S]*activeView === "home"/,
  "Codex canary sends should be gated to an allowed workspace home context",
);

assert.match(
  webTurnCore,
  /stream\?: boolean;/,
  "agent turn params should expose an explicit stream override",
);

assert.match(
  webSendCore,
  /stream\?: boolean;/,
  "send-flow runtime adapter contract should preserve the stream override",
);

assert.match(
  sendFlow,
  /forceNonStreamingRuntimeTurn\?: boolean;/,
  "send flow should use a specific canary option rather than changing default sends",
);

assert.match(
  sendFlow,
  /stream: opts\?\.forceNonStreamingRuntimeTurn === true \? false : undefined/,
  "canary sends should force exactly one non-streaming runtime turn",
);

assert.match(
  sendFlow,
  /codexPrimaryCanary: opts\?\.forceNonStreamingRuntimeTurn === true/,
  "canary sends should mark the runtime request as a Codex primary canary",
);

assert.match(
  turnRunner,
  /codex_primary_canary: params\.codexPrimaryCanary === true/,
  "web turn runner should pass the explicit Codex primary canary flag to the runtime",
);

assert.match(
  runtimeTurnHandlers,
  /const codexPrimaryCanaryRequested = input\.codex_primary_canary === true;/,
  "runtime should only use the explicit Codex primary canary flag",
);

assert.doesNotMatch(
  runtimeTurnHandlers,
  /POLYNET_CODEX_PRIMARY_CANARY_NON_STREAMING_FALLBACK|isStagingCodexPrimaryCanaryFallback/,
  "temporary staging fallback should be removed after the explicit canary flag is live",
);

assert.match(
  turnRunner,
  /const streamRuntimeTurn = params\.stream !== false;/,
  "web turn runner should default to streaming unless the canary explicitly disables it",
);

assert.match(
  turnRunner,
  /if \(!streamRuntimeTurn\) \{[\s\S]*await runtimeTurn\.json\(\)[\s\S]*await current\.loadThreadMessages\(threadId, session\)/,
  "non-streaming runtime turns should consume JSON and reload persisted messages",
);

assert.match(
  packageJson,
  /"check:codex-harness-ui-canary-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/codex_harness_ui_canary_proof\.ts"/,
  "package scripts should include the Codex UI canary proof",
);

console.log("codex_harness_ui_canary_proof: ok");
