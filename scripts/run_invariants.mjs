// Runs the curated set of high-signal security, auth, billing, Convex integrity,
// and runtime behavioral invariant checks in parallel.
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const CONCURRENCY = 8;

const INVARIANT_CHECKS = [
  // Backend & architecture integrity
  "check:no-orphan-modules",
  "check:no-missing-module-refs",
  "check:no-uncalled-functions",
  "check:convex-client-operation-integrity-proof",
  "check:forbidden-patterns",
  "check:canonical-media-guard",
  "check:one-community-lens",
  "check:one-agent-identity",

  // Security, auth, privacy, SSRF & MCP boundaries
  "check:convex-verified-identity-guard",
  "check:auth-env-contract-guard",
  "check:auth-bootstrap-public-identity-guard",
  "check:auth-billing-public-identity-guard",
  "check:community-public-identity-guard",
  "check:purchase-token-hygiene-proof",
  "check:frontend-privacy-hygiene-proof",
  "check:polynet-workspace-mcp-auth-proof",
  "check:polynet-harness-isolation-contract-proof",
  "check:web-research-local-url-policy-proof",
  "check:community-source-url-policy-proof",
  "check:web-route-access-boundary-proof",
  "check:community-tab-access-normalization-proof",
  "check:community-capability-contract-proof",

  // Money, audit & inference authority
  "check:stripe-customer-idempotency-proof",
  "check:critical-audit-events-proof",
  "check:single-inference-provider",
  "check:provider-cost-accounting-proof",

  // Runtime & community-agent harness behavioral proofs
  "check:community-semantic-repository-proof",
  "check:community-lineage-ontology-proof",
  "check:community-interaction-evidence-spine-proof",
  "check:community-resource-evidence-spine-proof",
  "check:chat-block-markdown-proof",
  "check:chat-inline-markdown-proof",
  "check:smooth-streaming-text-proof",
  "check:mobile-reading-mode-policy-proof",
  "check:community-events-recurrence-proof",
  "check:runtime-tool-loop-proof",
  "check:runtime-tool-policy-proof",
  "check:runtime-responses-tool-schema-proof",
  "check:runtime-working-state-ledger-proof",
  "check:runtime-diagnostics-proof",
  "check:runtime-community-context-receipt-proof",
  "check:runtime-persisted-history-pagination-proof",
  "check:runtime-context-integrity-proof",
  "check:runtime-context-fragments-budget-proof",
  "check:runtime-context-fragments-ordering-proof",
  "check:runtime-context-fragments-redaction-proof",
  "check:runtime-context-fragments-continuity-proof",
  "check:native-tool-provider-parser-proof",
  "check:runtime-context-manifest-proof",
  "check:runtime-agent-loop-context-receipt-smoke",
  "check:runtime-prompt-bundle-proof",
];

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("npm", ["run", "-s", name], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) =>
      resolve({ name, ok: code === 0, output, ms: Date.now() - started }),
    );
  });
}

const startedAt = Date.now();
const queue = [...INVARIANT_CHECKS];
const results = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) results.push(await run(queue.shift()));
  }),
);

const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  console.log(
    `FAIL ${result.name}\n${result.output.split("\n").filter(Boolean).slice(-20).join("\n")}\n`,
  );
}
const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `invariants: ${results.length - failed.length}/${results.length} passed in ${elapsedSec}s`,
);
process.exit(failed.length ? 1 : 0);
