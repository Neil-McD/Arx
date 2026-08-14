import type { RuntimePromptSection } from "./runtimePrompt.ts";

export const RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE =
  "runtime_provider_context_attested";
export const RUNTIME_PROVIDER_CONTEXT_ATTESTATION_SCHEMA =
  "runtime_provider_context_attestation_v1";
export const RUNTIME_PROVIDER_CONTEXT_CANONICALIZATION = "sorted_json_v1";
export const RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE =
  "runtime_provider_context_attestation_unavailable";
export const RUNTIME_PROVIDER_CONTEXT_ATTESTATION_MAX_CHARS = 64_000;

export type RuntimeProviderToolSchemaFormat =
  | "openai_compatible"
  | "responses_api";

export type RuntimeProviderContextAttestationV1 = {
  version: 1;
  schema: typeof RUNTIME_PROVIDER_CONTEXT_ATTESTATION_SCHEMA;
  canonicalization: typeof RUNTIME_PROVIDER_CONTEXT_CANONICALIZATION;
  surface: "member_agent_dock" | "community_funnel_builder";
  run_id: string;
  initial_attempt: 1;
  scope: {
    user_id: string;
    thread_id: string;
    community_id: string;
    community_context_version: number;
    funnel_slot: string | null;
  };
  model: {
    requested_model_id: string;
    inference_source: string;
    model_ref: string;
    max_output_tokens: number;
    tool_choice: "auto";
    parallel_tool_calls: boolean;
  };
  prompt_sections: RuntimePromptSection[];
  tool_schema_format: RuntimeProviderToolSchemaFormat;
  tool_names: string[];
  provider_request_sha256: string;
  context_manifest_sha256: string;
};

type JsonRecord = Record<string, unknown>;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const PROMPT_SECTION_KEYS = [
  "authority",
  "chars",
  "id",
  "layer",
  "owner",
  "reason",
  "rendered",
  "slot",
  "source",
] as const;
const ATTESTATION_KEYS = [
  "canonicalization",
  "context_manifest_sha256",
  "initial_attempt",
  "model",
  "prompt_sections",
  "provider_request_sha256",
  "run_id",
  "schema",
  "scope",
  "surface",
  "tool_names",
  "tool_schema_format",
  "version",
] as const;
const ATTESTATION_SCOPE_KEYS = [
  "community_context_version",
  "community_id",
  "funnel_slot",
  "thread_id",
  "user_id",
] as const;
const ATTESTATION_MODEL_KEYS = [
  "inference_source",
  "max_output_tokens",
  "model_ref",
  "parallel_tool_calls",
  "requested_model_id",
  "tool_choice",
] as const;

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function canonicalizeJsonValue(
  value: unknown,
  parents: Set<object>,
  arrayItem = false,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
  }
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return arrayItem ? null : undefined;
  }
  if (typeof value === "bigint") {
    throw new TypeError("runtime_provider_context_bigint_not_supported");
  }
  if (typeof value !== "object") {
    throw new TypeError("runtime_provider_context_json_value_invalid");
  }
  const objectValue = value as object;
  if (parents.has(objectValue)) {
    throw new TypeError("runtime_provider_context_circular_value");
  }
  parents.add(objectValue);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalizeJsonValue(item, parents, true));
    }
    const record = value as JsonRecord;
    const out: JsonRecord = {};
    for (const key of Object.keys(record).sort()) {
      const normalized = canonicalizeJsonValue(record[key], parents, false);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  } finally {
    parents.delete(objectValue);
  }
}

export function canonicalRuntimeProviderContextJson(value: unknown): string {
  const normalized = canonicalizeJsonValue(value, new Set<object>());
  if (normalized === undefined) {
    throw new TypeError("runtime_provider_context_json_root_invalid");
  }
  return JSON.stringify(normalized);
}

export async function sha256RuntimeProviderContext(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalRuntimeProviderContextJson(value),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function promptSectionIsValid(value: unknown): value is RuntimePromptSection {
  const section = asRecord(value);
  if (!section) return false;
  if (
    Object.keys(section).sort().join("|") !==
    [...PROMPT_SECTION_KEYS].sort().join("|")
  ) {
    return false;
  }
  const chars = Number(section.chars);
  return (
    Boolean(requiredText(section.id)) &&
    ["stable", "scoped", "volatile"].includes(String(section.layer ?? "")) &&
    ["instruction", "context"].includes(String(section.slot ?? "")) &&
    ["platform", "user", "community", "workspace", "runtime"].includes(
      String(section.owner ?? ""),
    ) &&
    [
      "platform_policy",
      "role_policy",
      "community_policy",
      "user_preference",
      "runtime_fact",
      "evidence",
    ].includes(String(section.authority ?? "")) &&
    typeof section.rendered === "boolean" &&
    Number.isSafeInteger(chars) &&
    chars >= 0 &&
    (section.rendered ? chars > 0 : chars === 0) &&
    typeof section.source === "string" &&
    typeof section.reason === "string" &&
    !("text" in section)
  );
}

export function parseRuntimeProviderContextAttestation(
  value: unknown,
): RuntimeProviderContextAttestationV1 | null {
  const receipt = asRecord(value);
  if (!receipt) return null;
  try {
    if (
      JSON.stringify(receipt).length >
      RUNTIME_PROVIDER_CONTEXT_ATTESTATION_MAX_CHARS
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const scope = asRecord(receipt.scope);
  const model = asRecord(receipt.model);
  const promptSections = receipt.prompt_sections;
  const toolNames = receipt.tool_names;
  if (
    !hasExactKeys(receipt, ATTESTATION_KEYS) ||
    receipt.version !== 1 ||
    receipt.schema !== RUNTIME_PROVIDER_CONTEXT_ATTESTATION_SCHEMA ||
    receipt.canonicalization !== RUNTIME_PROVIDER_CONTEXT_CANONICALIZATION ||
    !["member_agent_dock", "community_funnel_builder"].includes(
      String(receipt.surface ?? ""),
    ) ||
    !requiredText(receipt.run_id) ||
    receipt.initial_attempt !== 1 ||
    !scope ||
    !hasExactKeys(scope, ATTESTATION_SCOPE_KEYS) ||
    !model ||
    !hasExactKeys(model, ATTESTATION_MODEL_KEYS) ||
    !Array.isArray(promptSections) ||
    promptSections.length === 0 ||
    promptSections.length > 64 ||
    !promptSections.every(promptSectionIsValid) ||
    new Set(
      promptSections.map((section) =>
        String((section as RuntimePromptSection).id),
      ),
    ).size !== promptSections.length ||
    !Array.isArray(toolNames) ||
    toolNames.length === 0 ||
    toolNames.length > 256 ||
    toolNames.some((name) => requiredText(name) !== name) ||
    new Set(toolNames.map((name) => String(name))).size !== toolNames.length ||
    !["openai_compatible", "responses_api"].includes(
      String(receipt.tool_schema_format ?? ""),
    ) ||
    !SHA256_HEX_PATTERN.test(String(receipt.provider_request_sha256 ?? "")) ||
    !SHA256_HEX_PATTERN.test(String(receipt.context_manifest_sha256 ?? ""))
  ) {
    return null;
  }
  const communityContextVersion = Number(scope.community_context_version);
  const maxOutputTokens = Number(model.max_output_tokens);
  const funnelSlot = scope.funnel_slot;
  if (
    !requiredText(scope.user_id) ||
    !requiredText(scope.thread_id) ||
    !requiredText(scope.community_id) ||
    !Number.isSafeInteger(communityContextVersion) ||
    communityContextVersion < 0 ||
    !(funnelSlot === null || requiredText(funnelSlot)) ||
    !requiredText(model.requested_model_id) ||
    !requiredText(model.inference_source) ||
    !requiredText(model.model_ref) ||
    !Number.isSafeInteger(maxOutputTokens) ||
    maxOutputTokens <= 0 ||
    model.tool_choice !== "auto" ||
    typeof model.parallel_tool_calls !== "boolean"
  ) {
    return null;
  }
  const surface = String(
    receipt.surface,
  ) as RuntimeProviderContextAttestationV1["surface"];
  if (
    (surface === "community_funnel_builder" && !requiredText(funnelSlot)) ||
    (surface === "member_agent_dock" && funnelSlot !== null)
  ) {
    return null;
  }
  return receipt as RuntimeProviderContextAttestationV1;
}

export async function buildRuntimeProviderContextAttestation(params: {
  surface: RuntimeProviderContextAttestationV1["surface"];
  runId: string;
  userId: string;
  threadId: string;
  communityId: string;
  communityContextVersion: number;
  funnelSlot?: string | null;
  requestedModelId: string;
  inferenceSource: string;
  modelRef: string;
  maxOutputTokens: number;
  toolChoice: "auto";
  parallelToolCalls: boolean;
  messages: unknown[];
  promptSections: readonly RuntimePromptSection[];
  contextManifest: unknown;
  toolSchemaFormat: RuntimeProviderToolSchemaFormat;
  toolNames: readonly string[];
  providerTools: unknown[];
}): Promise<RuntimeProviderContextAttestationV1> {
  const model = {
    requested_model_id: params.requestedModelId,
    inference_source: params.inferenceSource,
    model_ref: params.modelRef,
    max_output_tokens: params.maxOutputTokens,
    tool_choice: params.toolChoice,
    parallel_tool_calls: params.parallelToolCalls,
  } as const;
  const providerRequest = {
    model,
    messages: params.messages,
    tools: {
      format: params.toolSchemaFormat,
      definitions: params.providerTools,
    },
  };
  const receipt: RuntimeProviderContextAttestationV1 = {
    version: 1,
    schema: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_SCHEMA,
    canonicalization: RUNTIME_PROVIDER_CONTEXT_CANONICALIZATION,
    surface: params.surface,
    run_id: String(params.runId ?? "").trim(),
    initial_attempt: 1,
    scope: {
      user_id: String(params.userId ?? "").trim(),
      thread_id: String(params.threadId ?? "").trim(),
      community_id: String(params.communityId ?? "").trim(),
      community_context_version: Math.max(
        0,
        Math.floor(params.communityContextVersion),
      ),
      funnel_slot:
        params.surface === "community_funnel_builder"
          ? String(params.funnelSlot ?? "").trim() || null
          : null,
    },
    model,
    prompt_sections: params.promptSections.map((section) => ({ ...section })),
    tool_schema_format: params.toolSchemaFormat,
    tool_names: [
      ...new Set(params.toolNames.map((name) => String(name).trim())),
    ].filter(Boolean),
    provider_request_sha256:
      await sha256RuntimeProviderContext(providerRequest),
    context_manifest_sha256: await sha256RuntimeProviderContext(
      params.contextManifest,
    ),
  };
  if (!parseRuntimeProviderContextAttestation(receipt)) {
    throw new Error("runtime_provider_context_attestation_invalid");
  }
  return receipt;
}
