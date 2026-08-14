import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeFailureFinalAnswer } from "../shared/runtimeFailureFinalizer.ts";

assert.deepEqual(
  buildRuntimeFailureFinalAnswer({
    partialContent: "I verified the latest two discussions.",
    status: "error",
    errorCode: "provider_timeout",
  }),
  {
    content: "I verified the latest two discussions.",
    usedFallback: false,
  },
);
assert.deepEqual(
  buildRuntimeFailureFinalAnswer({
    status: "error",
    errorCode: "provider_timeout",
    errorMessage: "The provider timed out.",
  }),
  {
    content:
      "I hit a runtime stop before I could finish. Runtime note: The provider timed out.",
    usedFallback: true,
  },
);
assert.deepEqual(
  buildRuntimeFailureFinalAnswer({ status: "cancelled" }),
  {
    content: "I stopped before I could finish.",
    usedFallback: true,
  },
);

const handler = readFileSync("convex/runtimeTurnHandlers.ts", "utf8");
const finalizer = readFileSync("shared/runtimeFailureFinalizer.ts", "utf8");
assert.match(handler, /buildRuntimeFailureFinalAnswer/);
assert.match(handler, /loadRuntimeTurnContextPacketForRun/);
assert.doesNotMatch(
  finalizer,
  /RuntimeWorkspaceTerminalPrompt|activeBackgroundTerminals|preview_process|background process/,
);

console.log("runtime_failure_finalization_proof: ok");
