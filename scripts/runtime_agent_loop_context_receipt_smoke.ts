import assert from "node:assert/strict";
import {
  RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE,
  buildRuntimeContextIntegrityCheck,
} from "../shared/runtimeContextIntegrity.ts";
import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
  parseRuntimeProviderContextAttestation,
  type RuntimeProviderContextAttestationV1,
} from "../shared/runtimeProviderContextAttestation.ts";

process.env.OPENAI_API_KEY = "";

const { executeChatToolsAgentLoop } = await import("../convex/runtimeAgentLoop.ts");

type RuntimeEvent = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

const events: RuntimeEvent[] = [];
const queryCalls: Array<{ args: unknown }> = [];
const runId = "context_receipt_smoke_run";
const runRecord = {
  runId,
  threadId: "thread_context_receipt_smoke",
  communityId: "community_context_receipt_smoke",
  communityContextVersion: 7,
  executionMode: "agentic",
  harnessProfile: "authenticated_cloud_tools",
  capabilityFamilies: ["community_tools"],
  status: "running",
};
events.push(
  {
    eventType: "run_started",
    eventKey: "run_started",
    payload: {
      run_id: runId,
      community_id: "community_context_receipt_smoke",
      community_context_version: 7,
      execution_mode: "agentic",
      capability_families: ["community_tools"],
    },
  },
  {
    eventType: "runtime_context_resolved",
    eventKey: `${runId}:runtime_context_resolved:1`,
    payload: {
      run_id: runId,
      thread_id: "thread_context_receipt_smoke",
      community_id: "community_context_receipt_smoke",
      community_context_version: 7,
      capability_families: ["community_tools"],
      harness_profile: "authenticated_cloud_tools",
      invocation_surface: "member_agent_dock",
    },
  },
  {
    eventType: "tool_policy_resolved",
    eventKey: `${runId}:tool_policy_resolved:1`,
    payload: {
      run_id: runId,
      allowed_tool_names: ["polynet_list", "polynet_read"],
      capability_families: ["community_tools"],
      harness_profile: "authenticated_cloud_tools",
    },
  },
);

const ctx = {
  async runQuery(_functionRef: unknown, args: unknown): Promise<unknown> {
    queryCalls.push({ args });
    const record = args && typeof args === "object" ? args as Record<string, unknown> : null;
    if (
      record &&
      typeof record.ownerId === "string" &&
      typeof record.runId === "string" &&
      Object.keys(record).length === 2
    ) {
      return { ...runRecord, runId: record.runId, status: "running" };
    }
    return [];
  },
  async runMutation(): Promise<unknown> {
    return null;
  },
  async runAction(): Promise<unknown> {
    return { active: [], recent: [] };
  },
};

const loopParams = {
  ctx,
  req: new Request("https://polynet.local/runtime-context-receipt-smoke"),
  userId: "user_context_receipt_smoke",
  authSubject: "user:context-receipt-smoke",
  threadId: "thread_context_receipt_smoke",
  requestedModelId: "gpt-6-luna",
  inferenceSource: "platform",
  modelRef: "openai/gpt-6-luna",
  messages: [
    {
      role: "user",
      content: "Smoke test the runtime context receipt path.",
    },
  ],
  maxTokens: 64,
  runId,
  allowedToolNames: ["polynet_list", "polynet_read"] as const,
  invocationSurface: "member_agent_dock" as const,
  communityId: "community_context_receipt_smoke",
  communityName: "Context Receipt Smoke",
  communitySlug: "context-receipt-smoke",
  communityOneLiner: "A focused runtime context smoke fixture.",
  communityAbout: "This fixture proves prompt and manifest receipts are emitted from the real agent loop.",
  communitySystemPrompt: "Stay focused on context receipt verification.",
  communityContextVersion: 7,
  threadWorkingState: {
    version: 3,
    goal: "Verify runtime prompt and context receipts.",
    status: "in_progress",
    currentStep: "Enter the real agent loop and capture emitted events.",
  },
  appendRunEvent: async (event) => {
    events.push(event);
  },
  refreshRuntimeContextSnapshot: async () => {},
  touchRunHeartbeat: async () => {},
};
const providerBoundaryOrder: string[] = [];
let capturedAttestation: RuntimeProviderContextAttestationV1 | null = null;
const result = await executeChatToolsAgentLoop({
  ...loopParams,
  recordInitialProviderContextAttestation: async (attestation) => {
    providerBoundaryOrder.push("attestation");
    capturedAttestation = attestation;
    events.push({
      eventType: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
      eventKey: `${runId}:${RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE}:initial:1`,
      payload: attestation as unknown as Record<string, unknown>,
    });
    return { ok: true };
  },
  beforeProviderRequest: async () => {
    providerBoundaryOrder.push("provider_start");
  },
});

assert.equal(result.ok, false, "smoke should stop at provider execution after prompt assembly");
assert.equal(
  result.code,
  "provider_inference_misconfigured",
  "smoke should fail only because provider inference is intentionally disabled",
);
assert.deepEqual(
  providerBoundaryOrder,
  ["attestation", "provider_start"],
  "mandatory evidence must persist before provider start",
);
assert.ok(
  capturedAttestation &&
    parseRuntimeProviderContextAttestation(capturedAttestation),
  "member runtime should build a valid provider-context attestation",
);

let failedProviderStartCount = 0;
const originalConsoleError = console.error;
let failedAttestationResult: Awaited<
  ReturnType<typeof executeChatToolsAgentLoop>
>;
try {
  console.error = () => {};
  failedAttestationResult = await executeChatToolsAgentLoop({
    ...loopParams,
    runId: "context_receipt_failure_smoke_run",
    appendRunEvent: async () => {},
    recordInitialProviderContextAttestation: async () => ({
      ok: false,
      errorCode: "forced_write_failure",
    }),
    beforeProviderRequest: async () => {
      failedProviderStartCount += 1;
    },
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(failedAttestationResult.ok, false);
assert.equal(
  failedAttestationResult.code,
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
);
assert.equal(
  failedProviderStartCount,
  0,
  "failed mandatory evidence must make provider start unreachable",
);

let lifecycleProviderResultCount = 0;
await assert.rejects(
  executeChatToolsAgentLoop({
    ...loopParams,
    runId: "provider_lifecycle_failure_smoke_run",
    appendRunEvent: async () => {},
    recordInitialProviderContextAttestation: async () => ({ ok: true }),
    beforeProviderRequest: async () => {
      throw new Error("founder_usage_exhausted");
    },
    observeProviderResult: () => {
      lifecycleProviderResultCount += 1;
    },
  }),
  (error: unknown) =>
    error instanceof Error && error.message === "founder_usage_exhausted",
  "pre-provider lifecycle failures must escape unchanged for role-level mapping",
);
assert.equal(
  lifecycleProviderResultCount,
  0,
  "a pre-provider lifecycle failure must not be observed as a provider result",
);

const promptReceipt = events.find((event) => event.eventType === "runtime_prompt_bundle_resolved");
const manifestReceipt = events.find((event) => event.eventType === "runtime_context_manifest_resolved");
assert.ok(promptReceipt, "agent loop should emit runtime prompt bundle receipt");
assert.ok(manifestReceipt, "agent loop should emit runtime context manifest receipt");
assert.ok(
  events.findIndex((event) => event.eventType === "runtime_prompt_bundle_resolved") <
    events.findIndex((event) => event.eventType === "runtime_context_manifest_resolved"),
  "prompt receipt should be emitted before manifest receipt",
);
assert.equal(promptReceipt.eventKey, `${runId}:runtime_prompt_bundle_resolved:1`);
assert.equal(manifestReceipt.eventKey, `${runId}:runtime_context_manifest_resolved:1`);

const promptPayload = promptReceipt.payload as {
  version?: unknown;
  sections?: Array<{ id?: unknown; layer?: unknown; owner?: unknown; chars?: unknown; rendered?: unknown }>;
  base_prompt_chars?: unknown;
  system_prompt_chars?: unknown;
};
assert.equal(promptPayload.version, 3);
assert.ok(Number(promptPayload.base_prompt_chars) > 0, "prompt receipt should report rendered prompt chars");
assert.ok(Number(promptPayload.system_prompt_chars) > 0, "prompt receipt should report full system prompt chars");
const sectionIds = new Set((promptPayload.sections ?? []).map((section) => String(section.id ?? "")));
for (const sectionId of [
  "platform_doctrine",
  "explanation_contract",
  "harness_operating_policy",
  "community_lens",
  "community_lens_authority",
  "community_system_prompt",
  "community_resource_lane",
  "runtime_turn_context",
  "temporal_context",
  "resources_architect",
]) {
  assert.ok(sectionIds.has(sectionId), `prompt receipt should include ${sectionId}`);
}

const manifest = (manifestReceipt.payload as { manifest?: any }).manifest;
assert.equal(manifest?.version, 2);
assert.equal(manifest?.scope?.userId, "user_context_receipt_smoke");
assert.equal(manifest?.scope?.threadId, "thread_context_receipt_smoke");
assert.equal(manifest?.scope?.communityId, "community_context_receipt_smoke");
assert.equal(manifest?.scope?.communityContextVersion, 7);
assert.equal(manifest?.scope?.harnessName, "chat_tools");
assert.equal(manifest?.scope?.inferenceSource, "platform");
assert.equal(manifest?.request?.latestUserText, "Smoke test the runtime context receipt path.");
assert.equal(manifest?.request?.conversationMessageCount, 1);
assert.ok(manifest?.summary?.promptCount > 0, "manifest should enumerate prompt inputs");
assert.ok(manifest?.summary?.toolCount > 0, "manifest should enumerate active tools");
assert.ok(manifest?.summary?.runtimeStateCount > 0, "manifest should enumerate runtime state");
assert.deepEqual(
  new Set(manifest?.prompts?.map((prompt: any) => prompt.id)),
  new Set(
    (promptPayload.sections ?? [])
      .filter((section) => section.rendered === true)
      .map((section) => section.id),
  ),
);
assert.equal(
  manifest?.runtimeState?.find((state: any) => state.id === "member_identity_context")?.status,
  "empty",
  "member receipts should explicitly record that private identity projection was empty",
);
assert.ok(
  queryCalls.length > 0,
  "smoke should exercise the runtime loop's Convex query boundary",
);

const integrityVerdict = await buildRuntimeContextIntegrityCheck({
  run: runRecord,
  events,
});
assert.equal(integrityVerdict.checked.provider_context_attestation_required, true);
assert.equal(integrityVerdict.checked.provider_context_attestation_present, true);
assert.equal(integrityVerdict.checked.provider_context_attestation_valid, true);
const corruptedManifestDigestVerdict = await buildRuntimeContextIntegrityCheck({
  run: runRecord,
  events: events.map((event) =>
    event.eventType === RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE
      ? {
          ...event,
          payload: {
            ...event.payload,
            context_manifest_sha256: "b".repeat(64),
          },
        }
      : event,
  ),
});
assert.equal(corruptedManifestDigestVerdict.ok, false);
assert.equal(
  corruptedManifestDigestVerdict.checked.provider_context_attestation_valid,
  false,
);
assert.ok(
  corruptedManifestDigestVerdict.failures.includes(
    "provider_context_attestation_invalid",
  ),
  "a well-formed but incorrect manifest digest must fail integrity",
);
const missingAttestationVerdict = await buildRuntimeContextIntegrityCheck({
  run: runRecord,
  events: events.filter(
    (event) =>
      event.eventType !== RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
  ),
});
assert.equal(missingAttestationVerdict.ok, false);
assert.ok(
  missingAttestationVerdict.failures.includes(
    `missing_event:${RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE}`,
  ),
);
events.push({
  eventType: RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE,
  eventKey: `${runId}:${RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE}:1`,
  payload: {
    run_id: runId,
    ...integrityVerdict,
  },
});
const integrityReceipt = events.find((event) => event.eventType === RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE);
assert.ok(integrityReceipt, "runtime context integrity receipt should be appended");
assert.equal((integrityReceipt.payload as { ok?: unknown }).ok, true);
assert.ok(
  events.findIndex((event) => event.eventType === "runtime_context_manifest_resolved") <
    events.findIndex((event) => event.eventType === RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE),
  "integrity receipt should be emitted after manifest receipt",
);

console.log("runtime_agent_loop_context_receipt_smoke: ok");
