import assert from "node:assert/strict";

import {
  buildRuntimeContextFragmentsFromParts,
  compactRuntimeContextFragmentsForSnapshot,
  renderRuntimeContextFragmentsForPrompt,
} from "../shared/runtimeContextFragments.ts";

const hugeBearerToken = `Bearer ${"a".repeat(1_600)}`;
const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature";
const apiKey = "sk-testsecret1234567890";

const fragments = buildRuntimeContextFragmentsFromParts({
  threadWorkingState: {
    version: 3,
    goal: "Redact runtime context.",
    status: "blocked",
    currentStep: "Inspect the provider failure.",
    lastDiagnostic: `Authorization: ${hugeBearerToken} api_key=${apiKey} jwt=${jwt}`,
    verificationStatus: "failed",
    filesTouched: [],
    filesChanged: [],
    verifiedFindings: [],
    recentActions: [],
    blocker: "Provider returned a secret-bearing error.",
  },
  runtimeStop: {
    status: "error",
    reason: "provider_failed",
    errorCode: "provider_error",
    errorMessage: hugeBearerToken,
  },
});

const stopFragment = fragments.find((fragment) => fragment.kind === "runtime_stop");
assert.ok(stopFragment, "runtime stop fragment should be built");
assert.equal(
  stopFragment.redaction.applied,
  true,
  "runtime stop fragment should record redaction",
);
assert.equal(
  stopFragment.budget.truncated,
  false,
  "huge bearer token should be redacted before budget truncation is calculated",
);

const rendered = renderRuntimeContextFragmentsForPrompt(fragments) ?? "";
const snapshot = compactRuntimeContextFragmentsForSnapshot(fragments);
const snapshotText = JSON.stringify(snapshot);
const snapshotStopFragment = snapshot.find((fragment) => fragment.kind === "runtime_stop");
assert.equal(
  snapshotStopFragment?.redaction.applied,
  true,
  "snapshot compaction should preserve redaction audit metadata",
);
assert.ok(
  snapshotStopFragment?.redaction.rules.includes("bearer"),
  "snapshot compaction should preserve redaction rules",
);

for (const text of [rendered, snapshotText]) {
  assert.doesNotMatch(text, /sk-testsecret1234567890/, "API key must not render");
  assert.doesNotMatch(text, /eyJhbGciOiJIUzI1NiJ9/, "JWT must not render");
  assert.doesNotMatch(text, new RegExp("a".repeat(80)), "bearer token body must not render");
  assert.match(text, /\[redacted/, "redacted marker should remain auditable");
}

console.log("runtime_context_fragments_redaction_proof: ok");
