import assert from "node:assert/strict";
import process from "node:process";
import { verifyCodexBridgeOperatorToken } from "../convex/codexBridgeOperatorGate.ts";
import { CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME } from "../shared/codexBridgeContract.ts";
import { mintCodexBridgeOperatorToken } from "./codex_bridge_operator_token.ts";

const secret = "polynet-codex-bridge-operator-proof-secret";
process.env[CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME] = secret;

const base = {
  action: "codex_bridge_echo_smoke" as const,
  runId: "codex_bridge_echo_operator_scope_proof",
  projectId: "project_scope_123",
  threadId: "thread_scope_456",
  baseUrl: "https://polynet-staging.vercel.app/runtime",
};

const token = mintCodexBridgeOperatorToken({
  secret,
  ...base,
});

assert.equal(
  (
    await verifyCodexBridgeOperatorToken(token, {
      ...base,
      baseUrl: "https://polynet-staging.vercel.app/another-path",
    })
  ).ok,
  true,
  "same-origin base URL should verify",
);

for (const params of [
  { ...base, runId: "other_run" },
  { ...base, projectId: "other_project" },
  { ...base, threadId: "other_thread" },
  { ...base, action: "codex_bridge_codex_exec_smoke" as const },
  { ...base, baseUrl: "https://example.invalid/runtime" },
]) {
  const result = await verifyCodexBridgeOperatorToken(token, params);
  assert.equal(result.ok, false, `expected scope mismatch to fail: ${JSON.stringify(params)}`);
}

const tokenWithoutBaseUrl = mintCodexBridgeOperatorToken({
  secret,
  action: "codex_bridge_echo_smoke",
  runId: base.runId,
  projectId: base.projectId,
  threadId: base.threadId,
});

assert.equal(
  (
    await verifyCodexBridgeOperatorToken(tokenWithoutBaseUrl, {
      action: "codex_bridge_echo_smoke",
      runId: base.runId,
      projectId: base.projectId,
      threadId: base.threadId,
    })
  ).ok,
  true,
  "token without an explicit base URL should verify only without an explicit base URL",
);
assert.equal(
  (
    await verifyCodexBridgeOperatorToken(tokenWithoutBaseUrl, {
      action: "codex_bridge_echo_smoke",
      runId: base.runId,
      projectId: base.projectId,
      threadId: base.threadId,
      baseUrl: base.baseUrl,
    })
  ).ok,
  false,
  "token without an explicit base URL should not authorize an explicit callback origin",
);

assert.throws(
  () =>
    mintCodexBridgeOperatorToken({
      secret,
      action: "codex_bridge_echo_smoke",
      runId: base.runId,
      projectId: base.projectId,
      threadId: base.threadId,
      baseUrl: "file:///tmp/not-http",
    }),
  /operator_base_url_invalid/,
);

console.log("codex_bridge_operator_token_proof: ok");
