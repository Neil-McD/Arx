import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMUNITY_CONTEXT_BUNDLE_V1,
  COMMUNITY_EVIDENCE_USED_CONTRACT_ID,
  COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
  COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX,
  buildCommunityEvidenceUsedV1,
  buildCommunityEvidenceUserMessage,
  buildCommunityContextDiagnostics,
  buildCommunityContextSystemPrompt,
  normalizeCompiledCommunityRows,
} from "../supabase/functions/agent_turn/community_context_bundle_v1.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    fail(`${message}: expected=${b} actual=${a}`);
  }
}

function extractConstString(source, pattern, missingMessage) {
  const match = source.match(pattern);
  if (!match || typeof match[1] !== "string" || match[1].trim() === "") {
    fail(missingMessage);
  }
  return match[1].trim();
}

function extractConstInteger(source, pattern, missingMessage) {
  const match = source.match(pattern);
  if (!match || typeof match[1] !== "string") {
    fail(missingMessage);
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    fail(missingMessage);
  }
  return parsed;
}

async function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function assertContractConstants(contract) {
  const limits = contract?.limits ?? {};
  const sourceTypes = contract?.source_types ?? {};
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.version, contract?.version, "contract version mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.queryMaxChars, limits.query_max_chars, "query_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit, limits.compiled_limit, "compiled_limit mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit, limits.chat_limit, "chat_limit mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit, limits.resource_limit, "resource_limit mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatSnippetMaxChars, limits.chat_snippet_max_chars, "chat_snippet_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatSenderMaxChars, limits.chat_sender_max_chars, "chat_sender_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceTitleMaxChars, limits.resource_title_max_chars, "resource_title_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceSnippetMaxChars, limits.resource_snippet_max_chars, "resource_snippet_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceUrlMaxChars, limits.resource_url_max_chars, "resource_url_max_chars mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.sourceTypes.chat, sourceTypes.chat, "chat source type mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.sourceTypes.resource, sourceTypes.resource, "resource source type mismatch");
  assertEqual(COMMUNITY_CONTEXT_BUNDLE_V1.sourceTypes.memory, sourceTypes.memory, "memory source type mismatch");
}

function assertFixture(fixture) {
  const normalized = normalizeCompiledCommunityRows(fixture.compiled_rows, fixture.community_id);
  const promptOutcome = buildCommunityContextSystemPrompt({
    communityId: fixture.community_id,
    chatItems: normalized.chatRows,
    resourceItems: normalized.resourceRows,
  });
  const diagnostics = buildCommunityContextDiagnostics(
    {
      compiledAttempted: true,
      compiledFetchOk: true,
      compiledItemsUsed: normalized.compiledItemsUsed,
      compileVersion: normalized.compileVersion,
      fallbackUsed: false,
      chatFetchOk: true,
      resourceFetchOk: true,
      retrievalLatencyMs: null,
      failureClass: null,
    },
    promptOutcome.chatItemsUsed,
    promptOutcome.resourceItemsUsed,
  );

  assertEqual(normalized.compileVersion, fixture.expected.compile_version, `[${fixture.name}] compile_version mismatch`);
  assertEqual(normalized.compiledItemsUsed, fixture.expected.compiled_items_used, `[${fixture.name}] compiled_items_used mismatch`);
  assertEqual(promptOutcome.chatItemsUsed, fixture.expected.chat_items_used, `[${fixture.name}] chat_items_used mismatch`);
  assertEqual(promptOutcome.resourceItemsUsed, fixture.expected.resource_items_used, `[${fixture.name}] resource_items_used mismatch`);
  assertEqual(promptOutcome.prompt, fixture.expected.prompt, `[${fixture.name}] prompt mismatch`);
  assertDeepEqual(diagnostics, fixture.expected.diagnostics, `[${fixture.name}] diagnostics mismatch`);
}

function assertObservabilityFixture(fixture, observabilityContract) {
  const bundle = fixture?.bundle ?? {};
  const diagnostics = buildCommunityContextDiagnostics(
    {
      compiledAttempted: Boolean(bundle.compiled_attempted),
      compiledFetchOk: Boolean(bundle.compiled_fetch_ok),
      compiledItemsUsed: Number.isFinite(bundle.compiled_items_used) ? bundle.compiled_items_used : 0,
      compileVersion:
        bundle.compile_version === null || bundle.compile_version === undefined
          ? null
          : bundle.compile_version,
      fallbackUsed: Boolean(bundle.fallback_used),
      chatFetchOk: Boolean(bundle.chat_fetch_ok),
      resourceFetchOk: Boolean(bundle.resource_fetch_ok),
      retrievalLatencyMs:
        Number.isFinite(bundle.retrieval_latency_ms) && bundle.retrieval_latency_ms >= 0
          ? Math.floor(bundle.retrieval_latency_ms)
          : null,
      failureClass: typeof bundle.failure_class === "string" ? bundle.failure_class : null,
    },
    Number.isFinite(fixture?.chat_items_used) ? fixture.chat_items_used : 0,
    Number.isFinite(fixture?.resource_items_used) ? fixture.resource_items_used : 0,
  );

  if (
    Array.isArray(observabilityContract?.failure_classes)
    && !observabilityContract.failure_classes.includes(diagnostics.failure_class)
  ) {
    fail(
      `[${fixture.name}] failure_class ${JSON.stringify(
        diagnostics.failure_class,
      )} is not listed in community_context_observability_v1.json`,
    );
  }
  if (
    Array.isArray(observabilityContract?.quality_bands)
    && !observabilityContract.quality_bands.includes(diagnostics.quality_band)
  ) {
    fail(
      `[${fixture.name}] quality_band ${JSON.stringify(
        diagnostics.quality_band,
      )} is not listed in community_context_observability_v1.json`,
    );
  }

  assertDeepEqual(diagnostics, fixture.expected, `[${fixture.name}] observability diagnostics mismatch`);
}

async function readText(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.readFile(filePath, "utf8");
}

async function assertCommunityHarnessWireContract() {
  const wireContract = await readJson("shared/contracts/community_harness_wire_v1.json");
  const rustMain = await readText("src-tauri/src/main.rs");
  const rustCommunityContext = await readText("src-tauri/src/community_context.rs");
  const rustSource = `${rustMain}\n${rustCommunityContext}`;
  const tsIndex = await readText("supabase/functions/agent_turn/index.ts");

  const expectedPrefix = wireContract?.community_evidence_user_message_prefix;
  assertEqual(
    COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX,
    expectedPrefix,
    "community evidence user message prefix mismatch in TS helper",
  );
  assertEqual(
    buildCommunityEvidenceUserMessage("Community evidence (x)\n- item"),
    `${expectedPrefix}\nCommunity evidence (x)\n- item`,
    "community evidence user message builder mismatch in TS helper",
  );

  const rustPrefixMatch = rustSource.match(
    /const COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX: &str =\s*"([^"]+)";/m,
  );
  if (!rustPrefixMatch) {
    fail("Rust COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX constant not found");
  }
  assertEqual(
    rustPrefixMatch[1],
    expectedPrefix,
    "community evidence user message prefix mismatch in Rust runtime",
  );

  const rpcMap = wireContract?.rpcs ?? {};
  const requiredRpcKeys = [
    "active_community_system_prompt",
    "entitlement_check",
    "compiled_context_search",
    "chat_snippet_search",
    "resource_snippet_search",
    "memory_search",
    "memory_candidate_propose",
  ];
  for (const key of requiredRpcKeys) {
    if (typeof rpcMap[key] !== "string" || rpcMap[key].trim() === "") {
      fail(`community_harness_wire_v1.json is missing required RPC name: ${key}`);
    }
  }

  for (const key of requiredRpcKeys) {
    const rpcName = rpcMap[key];
    if (!rustSource.includes(rpcName)) {
      fail(`Rust runtime is missing RPC usage for ${key} (${rpcName})`);
    }
    if (!tsIndex.includes(rpcName)) {
      fail(`Cloud agent_turn is missing RPC usage for ${key} (${rpcName})`);
    }
  }
}

async function assertObservabilityContract() {
  const contract = await readJson("shared/contracts/community_context_observability_v1.json");
  assertEqual(
    COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
    contract?.id,
    "community context observability contract id mismatch",
  );
  const rustCommunityContext = await readText("src-tauri/src/community_context.rs");
  const rustObservabilityId = extractConstString(
    rustCommunityContext,
    /pub const COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID: &str = "([^"]+)";/m,
    "Rust COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID constant not found",
  );
  assertEqual(
    rustObservabilityId,
    contract?.id,
    "Rust community context observability contract id mismatch",
  );
  if (!Array.isArray(contract?.fields) || contract.fields.length === 0) {
    fail("community_context_observability_v1.json must define fields");
  }
  return contract;
}

async function assertCommunityEvidenceContract() {
  const contract = await readJson("shared/contracts/community_evidence_used_v1.json");
  assertEqual(contract?.id, COMMUNITY_EVIDENCE_USED_CONTRACT_ID, "community evidence contract id mismatch");
  assertEqual(contract?.version, 1, "community evidence contract version mismatch");

  const limits = contract?.limits ?? {};
  assertEqual(limits.chat_limit, 6, "community evidence chat_limit mismatch");
  assertEqual(limits.resource_limit, 5, "community evidence resource_limit mismatch");

  const rustMain = await readText("src-tauri/src/main.rs");
  const rustCommunityContext = await readText("src-tauri/src/community_context.rs");
  const webApp = await readText("apps/web/src/App.tsx");
  const desktopApp = await readText("src/App.tsx");
  const edge = await readText("supabase/functions/agent_turn/index.ts");
  const sharedEvidence = await readText("shared/communityEvidence.ts");

  if (!rustCommunityContext.includes("community_evidence_used_v1")) {
    fail("src-tauri/src/community_context.rs is missing community_evidence_used_v1 wiring");
  }
  if (!rustMain.includes("community_evidence_used_v1")) {
    fail("src-tauri/src/main.rs is missing community_evidence_used_v1 wiring");
  }
  if (!edge.includes("community_evidence_used_v1")) {
    fail("supabase/functions/agent_turn/index.ts is missing community_evidence_used_v1 wiring");
  }
  if (!edge.includes("buildCommunityEvidenceUsedV1(")) {
    fail("supabase/functions/agent_turn/index.ts must build evidence payload through shared helper");
  }
  if (edge.includes("community_context_used")) {
    fail("supabase/functions/agent_turn/index.ts must not emit legacy community_context_used payload");
  }
  if (sharedEvidence.includes("community_context_used")) {
    fail("shared/communityEvidence.ts must not parse legacy community_context_used payload");
  }
  if (!webApp.includes("extractCommunityEvidenceUsedV1")) {
    fail("apps/web/src/App.tsx is missing community evidence parser wiring");
  }
  if (!desktopApp.includes("extractCommunityEvidenceUsedV1")) {
    fail("src/App.tsx is missing community evidence parser wiring");
  }

  const sharedContractId = extractConstString(
    sharedEvidence,
    /export const COMMUNITY_EVIDENCE_USED_CONTRACT_ID = "([^"]+)";/m,
    "shared/communityEvidence.ts COMMUNITY_EVIDENCE_USED_CONTRACT_ID constant not found",
  );
  assertEqual(
    sharedContractId,
    contract?.id,
    "shared/communityEvidence.ts contract id mismatch",
  );

  const sharedChatLimit = extractConstInteger(
    sharedEvidence,
    /export const COMMUNITY_EVIDENCE_CHAT_LIMIT = (\d+);/m,
    "shared/communityEvidence.ts COMMUNITY_EVIDENCE_CHAT_LIMIT constant not found",
  );
  assertEqual(
    sharedChatLimit,
    limits.chat_limit,
    "shared/communityEvidence.ts chat limit mismatch",
  );

  const sharedResourceLimit = extractConstInteger(
    sharedEvidence,
    /export const COMMUNITY_EVIDENCE_RESOURCE_LIMIT = (\d+);/m,
    "shared/communityEvidence.ts COMMUNITY_EVIDENCE_RESOURCE_LIMIT constant not found",
  );
  assertEqual(
    sharedResourceLimit,
    limits.resource_limit,
    "shared/communityEvidence.ts resource limit mismatch",
  );

  const rustEvidenceContractId = extractConstString(
    rustCommunityContext,
    /pub const COMMUNITY_EVIDENCE_USED_CONTRACT_ID: &str = "([^"]+)";/m,
    "Rust COMMUNITY_EVIDENCE_USED_CONTRACT_ID constant not found",
  );
  assertEqual(
    rustEvidenceContractId,
    contract?.id,
    "Rust community evidence contract id mismatch",
  );
}

async function assertCommunityEvidenceFixtures() {
  const fixtures = await readJson("shared/contracts/community_evidence_used_v1.fixtures.json");
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    fail("community evidence fixtures must be a non-empty array");
  }

  for (const fixture of fixtures) {
    const actual = buildCommunityEvidenceUsedV1(fixture?.chat_rows ?? [], fixture?.resource_rows ?? []);
    assertDeepEqual(
      actual,
      fixture?.expected ?? null,
      `[${fixture?.name ?? "community_evidence_fixture"}] evidence payload mismatch`,
    );
    if (actual) {
      assertEqual(
        actual.contract_id,
        COMMUNITY_EVIDENCE_USED_CONTRACT_ID,
        `[${fixture?.name ?? "community_evidence_fixture"}] contract_id mismatch`,
      );
    }
  }

  return fixtures.length;
}

async function assertObservabilityPayloadWiring(observabilityContract) {
  const rustMain = await readText("src-tauri/src/main.rs");
  const rustCommunityContext = await readText("src-tauri/src/community_context.rs");
  const rustSource = `${rustMain}\n${rustCommunityContext}`;
  const tsIndex = await readText("supabase/functions/agent_turn/index.ts");
  const tsBundle = await readText("supabase/functions/agent_turn/community_context_bundle_v1.mjs");
  const fields = Array.isArray(observabilityContract?.fields)
    ? observabilityContract.fields.filter((field) => typeof field === "string" && field.trim() !== "")
    : [];

  if (fields.length === 0) {
    fail("observability contract has no fields");
  }

  for (const field of fields) {
    if (
      !tsBundle.includes(`${field}:`)
      && !tsBundle.includes(`${field},`)
      && !tsBundle.includes(`"${field}"`)
      && !tsBundle.includes(`'${field}'`)
    ) {
      fail(`community_context_bundle_v1.mjs is missing observability field ${field}`);
    }
    if (
      !rustSource.includes(`community_context_diagnostics.get("${field}")`)
      && !rustSource.includes(`diagnostics.get("${field}")`)
    ) {
      fail(`Rust memory_retrieval wiring is missing observability field ${field}`);
    }
  }

  if (!tsIndex.includes("community_context_diagnostics")) {
    fail("cloud agent_turn is missing community_context_diagnostics payload wiring");
  }
}

async function assertCapabilityContractV3() {
  const contract = await readJson("shared/contracts/community_harness_capabilities_v3.json");
  assertEqual(contract?.id, "community_harness_capabilities_v3", "community capability v3 contract id mismatch");
  assertEqual(contract?.version, 3, "community capability v3 contract version mismatch");

  const statuses = Array.isArray(contract?.capability_status_values)
    ? contract.capability_status_values
    : [];
  const sideEffectClasses = Array.isArray(contract?.side_effect_classes)
    ? contract.side_effect_classes
    : [];
  const capabilities = Array.isArray(contract?.capabilities) ? contract.capabilities : [];
  if (capabilities.length < 3) {
    fail("community_harness_capabilities_v3.json must define at least 3 capabilities");
  }

  const names = new Set();
  for (const capability of capabilities) {
    const name = String(capability?.name ?? "").trim();
    if (!name) fail("community_harness_capabilities_v3 capability is missing name");
    if (names.has(name)) fail(`community_harness_capabilities_v3 duplicate capability name: ${name}`);
    names.add(name);

    const status = String(capability?.status ?? "").trim();
    if (!statuses.includes(status)) {
      fail(`community_harness_capabilities_v3 capability ${name} has unknown status ${status}`);
    }

    const sideEffectClass = String(capability?.side_effect_class ?? "").trim();
    if (!sideEffectClasses.includes(sideEffectClass)) {
      fail(
        `community_harness_capabilities_v3 capability ${name} has unknown side_effect_class ${sideEffectClass}`,
      );
    }

    if (!Array.isArray(capability?.surfaces) || capability.surfaces.length === 0) {
      fail(`community_harness_capabilities_v3 capability ${name} must define surfaces`);
    }
    if (
      !capability?.input_schema
      || String(capability.input_schema.type ?? "").trim() !== "object"
      || !Array.isArray(capability.input_schema.required)
      || capability.input_schema.required.length === 0
    ) {
      fail(`community_harness_capabilities_v3 capability ${name} must define object input_schema with required fields`);
    }
    if (!capability?.verification || String(capability.verification.rpc ?? "").trim() === "") {
      fail(`community_harness_capabilities_v3 capability ${name} must define verification.rpc`);
    }
    if (!capability?.idempotency || !Array.isArray(capability.idempotency.key_fields)) {
      fail(`community_harness_capabilities_v3 capability ${name} must define idempotency.key_fields`);
    }
    if (
      !capability?.slo
      || !Number.isInteger(capability.slo.timeout_ms)
      || capability.slo.timeout_ms <= 0
      || !Number.isInteger(capability.slo.max_attempts)
      || capability.slo.max_attempts <= 0
    ) {
      fail(`community_harness_capabilities_v3 capability ${name} must define valid slo`);
    }
  }

  const requiredActive = [
    "community_context_search",
    "community_memory_search",
    "community_memory_candidate_propose",
  ];
  for (const capabilityName of requiredActive) {
    const capability = capabilities.find((item) => item?.name === capabilityName);
    if (!capability || capability?.status !== "active") {
      fail(`community_harness_capabilities_v3 missing active capability ${capabilityName}`);
    }
  }

  const activeActions = capabilities.filter(
    (capability) => capability?.status === "active" && capability?.category === "action",
  );
  if (activeActions.length < 1) {
    fail("community_harness_capabilities_v3 must define at least 1 active action capability");
  }

  const desktopRuntimeTools = contract?.runtime_exposed_tools?.desktop;
  const webRuntimeTools = contract?.runtime_exposed_tools?.web;
  if (!Array.isArray(desktopRuntimeTools)) {
    fail("community_harness_capabilities_v3 runtime_exposed_tools.desktop must be an array");
  }
  if (!Array.isArray(webRuntimeTools)) {
    fail("community_harness_capabilities_v3 runtime_exposed_tools.web must be an array");
  }
  for (const toolName of requiredActive) {
    if (!desktopRuntimeTools.includes(toolName)) {
      fail(`community_harness_capabilities_v3 runtime_exposed_tools.desktop missing ${toolName}`);
    }
    if (!webRuntimeTools.includes(toolName)) {
      fail(`community_harness_capabilities_v3 runtime_exposed_tools.web missing ${toolName}`);
    }
  }
  assertDeepEqual(
    webRuntimeTools,
    desktopRuntimeTools,
    "community capability v3 runtime_exposed_tools.web/desktop mismatch",
  );

  const rustMain = await readText("src-tauri/src/main.rs");
  const rustCapabilityContractId = extractConstString(
    rustMain,
    /const COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID: &str = "([^"]+)";/m,
    "Rust COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID constant not found",
  );
  assertEqual(
    rustCapabilityContractId,
    contract?.id,
    "Rust community harness capability contract id mismatch",
  );
  if (!rustMain.includes("fn make_tool_schema_for_lane")) {
    fail("Rust runtime is missing lane-aware tool schema helper");
  }
  if (!rustMain.includes("community_harness_capabilities_v3")) {
    fail("Rust runtime is missing community harness capability v3 contract constant");
  }
  for (const toolName of desktopRuntimeTools) {
    if (!rustMain.includes(`\"${toolName}\"`)) {
      fail(`Rust runtime is missing community runtime tool ${toolName}`);
    }
  }
}

async function main() {
  const contract = await readJson("shared/contracts/community_context_bundle_v1.json");
  const fixtures = await readJson("shared/contracts/community_context_bundle_v1.fixtures.json");
  const evidenceFixturesCount = await assertCommunityEvidenceFixtures();
  const observabilityFixtures = await readJson(
    "shared/contracts/community_context_observability_v1.fixtures.json",
  );

  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    fail("fixtures must be a non-empty array");
  }
  if (!Array.isArray(observabilityFixtures) || observabilityFixtures.length === 0) {
    fail("observability fixtures must be a non-empty array");
  }

  assertContractConstants(contract);
  await assertCommunityEvidenceContract();
  const observabilityContract = await assertObservabilityContract();
  await assertObservabilityPayloadWiring(observabilityContract);
  await assertCapabilityContractV3();
  for (const fixture of fixtures) {
    assertFixture(fixture);
  }
  for (const fixture of observabilityFixtures) {
    assertObservabilityFixture(fixture, observabilityContract);
  }
  await assertCommunityHarnessWireContract();

  console.log(
    `PASS: community context parity fixtures (${fixtures.length}) + evidence fixtures (${evidenceFixturesCount}) + observability fixtures (${observabilityFixtures.length})`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
