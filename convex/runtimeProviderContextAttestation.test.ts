import { describe, expect, it } from "vitest";

import {
  buildRuntimeProviderContextAttestation,
  canonicalRuntimeProviderContextJson,
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_MAX_CHARS,
  parseRuntimeProviderContextAttestation,
} from "../shared/runtimeProviderContextAttestation";
import type { RuntimePromptSection } from "../shared/runtimePrompt";

const promptSections: RuntimePromptSection[] = [
  {
    id: "platform_doctrine",
    layer: "stable",
    slot: "instruction",
    owner: "platform",
    authority: "platform_policy",
    rendered: true,
    chars: 12,
    source: "fixture",
    reason: "test",
  },
];

function baseInput() {
  return {
    surface: "member_agent_dock" as const,
    runId: "run_attestation_1",
    userId: "user_1",
    threadId: "thread_1",
    communityId: "community_1",
    communityContextVersion: 4,
    funnelSlot: null,
    requestedModelId: "gpt-test",
    inferenceSource: "platform",
    modelRef: "openai/gpt-test",
    maxOutputTokens: 1024,
    toolChoice: "auto" as const,
    parallelToolCalls: true,
    messages: [
      { role: "system", content: "system truth" },
      { role: "user", content: "private request" },
    ],
    promptSections,
    contextManifest: { version: 2, scope: { communityId: "community_1" } },
    toolSchemaFormat: "responses_api" as const,
    toolNames: ["polynet_list", "polynet_read"],
    providerTools: [
      {
        type: "function",
        name: "polynet_list",
        parameters: { type: "object", properties: {} },
      },
    ],
  };
}

describe("runtime provider context attestation", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(
      canonicalRuntimeProviderContextJson({ b: 2, a: { d: 4, c: 3 } }),
    ).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("commits to the exact request without retaining private context", async () => {
    const receipt = await buildRuntimeProviderContextAttestation(baseInput());
    expect(parseRuntimeProviderContextAttestation(receipt)).toEqual(receipt);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("system truth");
    expect(serialized).not.toContain("private request");
    expect(serialized).not.toContain("parameters");
    expect(receipt.provider_request_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.context_manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the request commitment for message, model, or tools", async () => {
    const original = await buildRuntimeProviderContextAttestation(baseInput());
    const changedMessage = await buildRuntimeProviderContextAttestation({
      ...baseInput(),
      messages: [{ role: "user", content: "changed" }],
    });
    const changedModel = await buildRuntimeProviderContextAttestation({
      ...baseInput(),
      modelRef: "openai/gpt-other",
    });
    const changedTools = await buildRuntimeProviderContextAttestation({
      ...baseInput(),
      providerTools: [{ type: "function", name: "polynet_search" }],
    });
    expect(changedMessage.provider_request_sha256).not.toBe(
      original.provider_request_sha256,
    );
    expect(changedModel.provider_request_sha256).not.toBe(
      original.provider_request_sha256,
    );
    expect(changedTools.provider_request_sha256).not.toBe(
      original.provider_request_sha256,
    );
  });

  it("keeps receipt size independent from transcript size", async () => {
    const small = await buildRuntimeProviderContextAttestation(baseInput());
    const large = await buildRuntimeProviderContextAttestation({
      ...baseInput(),
      messages: [{ role: "user", content: "x".repeat(1_200_000) }],
    });
    expect(JSON.stringify(large).length).toBe(JSON.stringify(small).length);
    expect(JSON.stringify(large)).not.toContain("x".repeat(100));
  });

  it("rejects extra fields and invalid surface-specific scope", async () => {
    const receipt = await buildRuntimeProviderContextAttestation(baseInput());
    expect(
      parseRuntimeProviderContextAttestation({
        ...receipt,
        raw_messages: [{ role: "user", content: "must not persist" }],
      }),
    ).toBeNull();
    expect(
      parseRuntimeProviderContextAttestation({
        ...receipt,
        surface: "community_funnel_builder",
      }),
    ).toBeNull();
  });

  it("rejects receipts that exceed the bounded metadata envelope", async () => {
    const receipt = await buildRuntimeProviderContextAttestation(baseInput());
    expect(
      parseRuntimeProviderContextAttestation({
        ...receipt,
        prompt_sections: [
          {
            ...receipt.prompt_sections[0],
            reason: "x".repeat(RUNTIME_PROVIDER_CONTEXT_ATTESTATION_MAX_CHARS),
          },
        ],
      }),
    ).toBeNull();
  });
});
