import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
  canonicalRuntimeProviderContextJson,
  parseRuntimeProviderContextAttestation,
  sha256RuntimeProviderContext,
} from "./runtimeProviderContextAttestation.ts";

export const RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE = "runtime_context_integrity_checked";

export type RuntimeContextIntegrityEventInput = {
  runId?: unknown;
  eventType?: unknown;
  eventKey?: unknown;
  payload?: unknown;
  seq?: unknown;
  createdAt?: unknown;
};

export type RuntimeContextIntegrityRunInput = {
  ownerId?: unknown;
  runId?: unknown;
  threadId?: unknown;
  communityId?: unknown;
  communityContextVersion?: unknown;
  modelId?: unknown;
  executionMode?: unknown;
  harnessProfile?: unknown;
  capabilityFamilies?: unknown;
};

export type RuntimeContextIntegrityCheckFlags = {
  run_id_matches: boolean;
  run_started_present: boolean;
  context_resolved_present: boolean;
  tool_policy_present: boolean;
  prompt_receipt_present: boolean;
  manifest_receipt_present: boolean;
  provider_context_attestation_required: boolean;
  provider_context_attestation_present: boolean;
  provider_context_attestation_valid: boolean;
  scope_matches_run: boolean;
  community_context_version_matches: boolean;
  capability_families_match_policy: boolean;
  tools_match_policy: boolean;
  prompt_sections_present: boolean;
  manifest_sections_present: boolean;
  manifest_matches_prompt_receipt: boolean;
};

export type RuntimeContextIntegrityVerdict = {
  version: 1;
  ok: boolean;
  failures: string[];
  warnings: string[];
  checked: RuntimeContextIntegrityCheckFlags;
  evidence: {
    run_id: string | null;
    event_count: number;
    required_event_types: string[];
    prompt_section_count: number;
    manifest_prompt_count: number;
    manifest_tool_count: number;
  };
};

const BASE_REQUIRED_EVENT_TYPES = [
  "run_started",
  "runtime_context_resolved",
  "tool_policy_resolved",
  "runtime_prompt_bundle_resolved",
  "runtime_context_manifest_resolved",
];

const REQUIRED_PROMPT_SECTION_IDS_V1 = [
  "platform_doctrine",
  "agent_soul",
  "user_agent_soul",
  "explanation_contract",
  "harness_operating_policy",
  "community_lens",
  "community_system_prompt",
  "community_resource_lane",
  "workspace_harness_context",
  "runtime_turn_context",
  "temporal_context",
  "harness_prompt_suffix",
];

const REQUIRED_PROMPT_SECTION_IDS_V2 = [
  "platform_doctrine",
  "explanation_contract",
  "harness_operating_policy",
  "community_lens",
  "community_lens_authority",
  "community_system_prompt",
  "community_resource_lane",
  "runtime_turn_context",
  "temporal_context",
  "platform_skill_overlay",
  "personal_skill_overlay",
  "ambiguous_skill_mentions",
  "community_skill_overlay",
];

// Version 3 (Oct 28): skills are gone; the resources architect section takes
// the place of the four skill sections. Version 2 receipts still verify above.
const REQUIRED_PROMPT_SECTION_IDS_V3 = [
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
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeId(value: unknown): string | null {
  return normalizeText(value);
}

function normalizeNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.sort();
}

function sameNullableText(...values: Array<unknown>): boolean {
  const normalized = values.map(normalizeId);
  const first = normalized[0] ?? null;
  return normalized.every((value) => value === first);
}

function sameNullableNumber(...values: Array<unknown>): boolean {
  const normalized = values.map(normalizeNumberOrNull);
  const first = normalized[0] ?? null;
  return normalized.every((value) => value === first);
}

function sameStringSet(left: unknown, right: unknown): boolean {
  const leftValues = normalizeStringArray(left);
  const rightValues = normalizeStringArray(right);
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function isSubset(left: unknown, right: unknown): boolean {
  const rightValues = new Set(normalizeStringArray(right));
  return normalizeStringArray(left).every((value) => rightValues.has(value));
}

function eventPayload(
  eventsByType: Map<string, RuntimeContextIntegrityEventInput>,
  eventType: string,
): Record<string, unknown> | null {
  return asRecord(eventsByType.get(eventType)?.payload);
}

function promptSectionIds(promptPayload: Record<string, unknown> | null): Set<string> {
  const sections = Array.isArray(promptPayload?.sections) ? promptPayload!.sections : [];
  return new Set(
    sections
      .map((section) => normalizeText(asRecord(section)?.id))
      .filter((value): value is string => Boolean(value)),
  );
}

function renderedPromptSectionIds(
  promptPayload: Record<string, unknown> | null,
): Set<string> {
  const sections = Array.isArray(promptPayload?.sections) ? promptPayload!.sections : [];
  return new Set(
    sections
      .filter((section) => asRecord(section)?.rendered === true)
      .map((section) => normalizeText(asRecord(section)?.id))
      .filter((value): value is string => Boolean(value)),
  );
}

function manifestPromptIds(manifest: Record<string, unknown> | null): Set<string> {
  const prompts = Array.isArray(manifest?.prompts) ? manifest!.prompts : [];
  return new Set(
    prompts
      .map((prompt) => normalizeText(asRecord(prompt)?.id))
      .filter((value): value is string => Boolean(value)),
  );
}

function manifestToolNames(manifest: Record<string, unknown> | null): string[] {
  const tools = Array.isArray(manifest?.tools) ? manifest!.tools : [];
  return tools
    .map((tool) => normalizeText(asRecord(tool)?.name))
    .filter((value): value is string => Boolean(value));
}

function mappedManifestPromptHasPromptSection(params: {
  manifestPromptId: string;
  promptSectionIds: Set<string>;
}): boolean {
  if (params.promptSectionIds.has(params.manifestPromptId)) return true;
  if (params.manifestPromptId === "workspace_project_context") {
    return params.promptSectionIds.has("workspace_harness_context");
  }
  if (params.manifestPromptId.startsWith("community_resource_lane:")) {
    return params.promptSectionIds.has("community_resource_lane");
  }
  if (
    params.manifestPromptId.startsWith("platform_skill:") ||
    params.manifestPromptId.startsWith("personal_skill:") ||
    params.manifestPromptId.startsWith("community_skill:")
  ) {
    return params.promptSectionIds.has("harness_prompt_suffix");
  }
  if (params.manifestPromptId === "browser_demo_prompt") {
    return params.promptSectionIds.has("harness_prompt_suffix");
  }
  return false;
}

export async function buildRuntimeContextIntegrityCheck(params: {
  run?: RuntimeContextIntegrityRunInput | null;
  events: RuntimeContextIntegrityEventInput[];
}): Promise<RuntimeContextIntegrityVerdict> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const events = Array.isArray(params.events) ? params.events : [];
  const eventsByType = new Map<string, RuntimeContextIntegrityEventInput>();
  for (const event of events) {
    const eventType = normalizeText(event.eventType);
    if (!eventType || eventType === RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE) continue;
    if (!eventsByType.has(eventType)) eventsByType.set(eventType, event);
  }

  const runStarted = eventPayload(eventsByType, "run_started");
  const contextResolved = eventPayload(eventsByType, "runtime_context_resolved");
  const toolPolicy = eventPayload(eventsByType, "tool_policy_resolved");
  const promptReceipt = eventPayload(eventsByType, "runtime_prompt_bundle_resolved");
  const manifestReceipt = eventPayload(eventsByType, "runtime_context_manifest_resolved");
  const manifest = asRecord(manifestReceipt?.manifest);
  const manifestScope = asRecord(manifest?.scope);
  const manifestSummary = asRecord(manifest?.summary);
  const run = asRecord(params.run ?? null);
  const invocationSurface = normalizeText(contextResolved?.invocation_surface);
  const providerContextAttestationRequired = invocationSurface === "member_agent_dock";
  const requiredEventTypes = providerContextAttestationRequired
    ? [...BASE_REQUIRED_EVENT_TYPES, RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE]
    : BASE_REQUIRED_EVENT_TYPES;
  for (const eventType of requiredEventTypes) {
    if (!eventsByType.has(eventType)) failures.push(`missing_event:${eventType}`);
  }

  const runId = normalizeId(
    run?.runId ??
      runStarted?.run_id ??
      contextResolved?.run_id ??
      toolPolicy?.run_id ??
      promptReceipt?.run_id ??
      manifestReceipt?.run_id,
  );
  const runIdValues = [
    run?.runId,
    runStarted?.run_id,
    contextResolved?.run_id,
    toolPolicy?.run_id,
    promptReceipt?.run_id,
    manifestReceipt?.run_id,
  ]
    .map(normalizeId)
    .filter((value): value is string => Boolean(value));
  const runIdMatches =
    Boolean(runId) &&
    runIdValues.length > 0 &&
    runIdValues.every((value) => value === runId);
  if (!runIdMatches) failures.push("run_id_mismatch");

  const scopeMatchesRun =
    Boolean(run && runStarted && contextResolved && manifestScope) &&
    sameNullableText(run?.threadId, contextResolved?.thread_id, manifestScope?.threadId) &&
    sameNullableText(run?.communityId, runStarted?.community_id, contextResolved?.community_id, manifestScope?.communityId);
  if (!scopeMatchesRun) failures.push("scope_mismatch");

  const communityContextVersionMatches =
    Boolean(run && runStarted && contextResolved && manifestScope) &&
    sameNullableNumber(
      run?.communityContextVersion,
      runStarted?.community_context_version,
      contextResolved?.community_context_version,
      manifestScope?.communityContextVersion,
    );
  if (!communityContextVersionMatches) failures.push("community_context_version_mismatch");

  const capabilityFamiliesMatchPolicy =
    Boolean(run && contextResolved && toolPolicy) &&
    sameStringSet(run?.capabilityFamilies, contextResolved?.capability_families) &&
    sameStringSet(contextResolved?.capability_families, toolPolicy?.capability_families);
  if (!capabilityFamiliesMatchPolicy) failures.push("capability_families_mismatch");

  const allowedToolNames = normalizeStringArray(toolPolicy?.allowed_tool_names);
  const manifestTools = manifestToolNames(manifest);
  const toolsMatchPolicy =
    Boolean(toolPolicy && manifest) &&
    allowedToolNames.length > 0 &&
    isSubset(allowedToolNames, manifestTools);
  if (!toolsMatchPolicy) failures.push("tool_policy_missing_from_manifest");
  if (manifestTools.length > allowedToolNames.length) {
    warnings.push("manifest_has_additional_effective_tools");
  }

  const promptReceiptVersion = normalizeNumberOrNull(promptReceipt?.version) ?? 1;
  const manifestVersion = normalizeNumberOrNull(manifest?.version) ?? 1;
  const usesCanonicalPromptProjection =
    promptReceiptVersion >= 2 && manifestVersion >= 2;
  const sectionIds = promptSectionIds(promptReceipt);
  const requiredSectionIds = !usesCanonicalPromptProjection
    ? REQUIRED_PROMPT_SECTION_IDS_V1
    : promptReceiptVersion >= 3
      ? REQUIRED_PROMPT_SECTION_IDS_V3
      : REQUIRED_PROMPT_SECTION_IDS_V2;
  const missingSections = requiredSectionIds.filter((id) => !sectionIds.has(id));
  const promptSectionsPresent = Boolean(promptReceipt) && missingSections.length === 0;
  for (const sectionId of missingSections) failures.push(`missing_prompt_section:${sectionId}`);

  const prompts = Array.isArray(manifest?.prompts) ? manifest!.prompts : [];
  const tools = Array.isArray(manifest?.tools) ? manifest!.tools : [];
  const runtimeState = Array.isArray(manifest?.runtimeState) ? manifest!.runtimeState : [];
  const manifestSectionsPresent =
    Boolean(manifest) &&
    prompts.length > 0 &&
    tools.length > 0 &&
    runtimeState.length > 0 &&
    Number(manifestSummary?.promptCount) === prompts.length &&
    Number(manifestSummary?.toolCount) === tools.length &&
    Number(manifestSummary?.runtimeStateCount) === runtimeState.length;
  if (!manifestSectionsPresent) failures.push("manifest_sections_invalid");

  const mappedPromptIds = manifestPromptIds(manifest);
  const renderedSectionIds = renderedPromptSectionIds(promptReceipt);
  const missingManifestPromptMappings = usesCanonicalPromptProjection
    ? [...mappedPromptIds].filter((id) => !renderedSectionIds.has(id))
    : [...mappedPromptIds].filter((id) =>
        !mappedManifestPromptHasPromptSection({
          manifestPromptId: id,
          promptSectionIds: sectionIds,
        }),
      );
  const missingPromptSectionMappings = usesCanonicalPromptProjection
    ? [...renderedSectionIds].filter((id) => !mappedPromptIds.has(id))
    : [];
  const manifestMatchesPromptReceipt =
    Boolean(promptReceipt && manifest) &&
    missingManifestPromptMappings.length === 0 &&
    missingPromptSectionMappings.length === 0;
  for (const id of missingManifestPromptMappings) {
    failures.push(`manifest_prompt_not_accounted_for:${id}`);
  }
  for (const id of missingPromptSectionMappings) {
    failures.push(`prompt_section_not_accounted_for:${id}`);
  }

  const attestationEvent = eventsByType.get(
    RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
  );
  const attestation = parseRuntimeProviderContextAttestation(
    attestationEvent?.payload,
  );
  let providerContextAttestationValid = !providerContextAttestationRequired;
  if (attestation) {
    let promptSectionsMatch = false;
    let contextManifestDigestMatches = false;
    try {
      promptSectionsMatch =
        canonicalRuntimeProviderContextJson(attestation.prompt_sections) ===
        canonicalRuntimeProviderContextJson(promptReceipt?.sections);
      contextManifestDigestMatches =
        Boolean(manifest) &&
        attestation.context_manifest_sha256 ===
          (await sha256RuntimeProviderContext(manifest));
    } catch {
      promptSectionsMatch = false;
      contextManifestDigestMatches = false;
    }
    providerContextAttestationValid =
      attestation.surface === invocationSurface &&
      sameNullableText(attestation.run_id, runId) &&
      (!normalizeText(run?.ownerId) ||
        sameNullableText(attestation.scope.user_id, run?.ownerId)) &&
      sameNullableText(
        attestation.scope.thread_id,
        run?.threadId,
        contextResolved?.thread_id,
        manifestScope?.threadId,
      ) &&
      sameNullableText(
        attestation.scope.community_id,
        run?.communityId,
        contextResolved?.community_id,
        manifestScope?.communityId,
      ) &&
      sameNullableNumber(
        attestation.scope.community_context_version,
        run?.communityContextVersion,
        contextResolved?.community_context_version,
        manifestScope?.communityContextVersion,
      ) &&
      (!normalizeText(run?.modelId) ||
        sameNullableText(attestation.model.requested_model_id, run?.modelId)) &&
      sameNullableText(
        attestation.model.inference_source,
        manifestScope?.inferenceSource,
      ) &&
      sameStringSet(attestation.tool_names, manifestToolNames(manifest)) &&
      promptSectionsMatch &&
      contextManifestDigestMatches;
  }
  if (
    (providerContextAttestationRequired || attestationEvent) &&
    !providerContextAttestationValid
  ) {
    failures.push("provider_context_attestation_invalid");
  }

  const checked: RuntimeContextIntegrityCheckFlags = {
    run_id_matches: runIdMatches,
    run_started_present: eventsByType.has("run_started"),
    context_resolved_present: eventsByType.has("runtime_context_resolved"),
    tool_policy_present: eventsByType.has("tool_policy_resolved"),
    prompt_receipt_present: eventsByType.has("runtime_prompt_bundle_resolved"),
    manifest_receipt_present: eventsByType.has("runtime_context_manifest_resolved"),
    provider_context_attestation_required: providerContextAttestationRequired,
    provider_context_attestation_present: eventsByType.has(
      RUNTIME_PROVIDER_CONTEXT_ATTESTATION_EVENT_TYPE,
    ),
    provider_context_attestation_valid: providerContextAttestationValid,
    scope_matches_run: scopeMatchesRun,
    community_context_version_matches: communityContextVersionMatches,
    capability_families_match_policy: capabilityFamiliesMatchPolicy,
    tools_match_policy: toolsMatchPolicy,
    prompt_sections_present: promptSectionsPresent,
    manifest_sections_present: manifestSectionsPresent,
    manifest_matches_prompt_receipt: manifestMatchesPromptReceipt,
  };

  return {
    version: 1,
    ok: failures.length === 0,
    failures,
    warnings,
    checked,
    evidence: {
      run_id: runId,
      event_count: events.length,
      required_event_types: requiredEventTypes,
      prompt_section_count: sectionIds.size,
      manifest_prompt_count: prompts.length,
      manifest_tool_count: tools.length,
    },
  };
}
