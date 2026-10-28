import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE,
  buildRuntimeContextIntegrityCheck,
} from "../shared/runtimeContextIntegrity.ts";
import { appendRuntimeContextIntegrityCheckBestEffort } from "../convex/runtimeContextIntegrity.ts";

const requiredPromptSections = [
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
].map((id) => ({
  id,
  layer: id === "runtime_turn_context" || id === "temporal_context" ? "volatile" : "stable",
  owner: "runtime",
  rendered: id !== "user_agent_soul" && id !== "community_system_prompt",
  chars: 10,
  source: "fixture",
}));

const run = {
  runId: "run_integrity_1",
  threadId: "thread_1",
  projectId: "project_1",
  communityId: "community_1",
  communityContextVersion: 3,
  executionMode: "agentic",
  harnessProfile: "authenticated_cloud_tools",
  capabilityFamilies: ["product_docs", "community_tools", "sandbox_tools", "workspace_tools"],
};

const baseEvents = [
  {
    eventType: "run_started",
    payload: {
      run_id: "run_integrity_1",
      project_id: "project_1",
      community_id: "community_1",
      community_context_version: 3,
      execution_mode: "agentic",
      capability_families: ["product_docs", "community_tools", "sandbox_tools", "workspace_tools"],
    },
  },
  {
    eventType: "runtime_context_resolved",
    payload: {
      run_id: "run_integrity_1",
      thread_id: "thread_1",
      project_id: "project_1",
      community_id: "community_1",
      community_context_version: 3,
      capability_families: ["product_docs", "community_tools", "sandbox_tools", "workspace_tools"],
      harness_profile: "authenticated_cloud_tools",
    },
  },
  {
    eventType: "tool_policy_resolved",
    payload: {
      run_id: "run_integrity_1",
      allowed_tool_names: [
        "search_product_docs",
        "get_product_doc",
        "polynet_list",
        "polynet_read",
        "read",
      ],
      capability_families: ["product_docs", "community_tools", "sandbox_tools", "workspace_tools"],
      harness_profile: "authenticated_cloud_tools",
    },
  },
  {
    eventType: "runtime_prompt_bundle_resolved",
    payload: {
      run_id: "run_integrity_1",
      base_prompt_chars: 1000,
      system_prompt_chars: 1100,
      sections: requiredPromptSections,
    },
  },
  {
    eventType: "runtime_context_manifest_resolved",
    payload: {
      run_id: "run_integrity_1",
      manifest: {
        version: 1,
        scope: {
          userId: "user_1",
          threadId: "thread_1",
          projectId: "project_1",
          communityId: "community_1",
          communityContextVersion: 3,
          harnessName: "chat_tools",
          inferenceSource: "chatgpt",
        },
        prompts: [
          { id: "platform_doctrine" },
          { id: "agent_soul" },
          { id: "explanation_contract" },
          { id: "harness_operating_policy" },
          { id: "community_lens" },
          { id: "workspace_project_context" },
          { id: "community_resource_lane:builder" },
        ],
        resources: [{ id: "product_docs" }],
        tools: [
          { name: "search_product_docs" },
          { name: "get_product_doc" },
          { name: "polynet_list" },
          { name: "polynet_read" },
          { name: "read" },
          { name: "polynet_search" },
        ],
        runtimeState: [{ id: "runtime_turn_envelope" }],
        exclusions: [],
        summary: {
          promptCount: 7,
          resourceCount: 1,
          toolCount: 6,
          runtimeStateCount: 1,
          exclusionCount: 0,
          fixedToolCount: 6,
          mountedToolCount: 0,
        },
      },
    },
  },
];

const okVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents,
});
assert.equal(okVerdict.ok, true);
assert.deepEqual(okVerdict.failures, []);
assert.equal(okVerdict.checked.run_id_matches, true);
assert.equal(okVerdict.checked.scope_matches_run, true);
assert.equal(okVerdict.checked.community_context_version_matches, true);
assert.equal(okVerdict.checked.capability_families_match_policy, true);
assert.equal(okVerdict.checked.tools_match_policy, true);
assert.equal(okVerdict.checked.prompt_sections_present, true);
assert.equal(okVerdict.checked.manifest_sections_present, true);
assert.equal(okVerdict.checked.manifest_matches_prompt_receipt, true);
assert.ok(okVerdict.warnings.includes("manifest_has_additional_effective_tools"));

const missingPromptVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents.filter((event) => event.eventType !== "runtime_prompt_bundle_resolved"),
});
assert.equal(missingPromptVerdict.ok, false);
assert.ok(missingPromptVerdict.failures.includes("missing_event:runtime_prompt_bundle_resolved"));

const versionMismatchVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents.map((event) =>
    event.eventType === "runtime_context_manifest_resolved"
      ? {
          ...event,
          payload: {
            ...event.payload,
            manifest: {
              ...(event.payload as any).manifest,
              scope: {
                ...(event.payload as any).manifest.scope,
                communityContextVersion: 4,
              },
            },
          },
        }
      : event,
  ),
});
assert.equal(versionMismatchVerdict.ok, false);
assert.ok(versionMismatchVerdict.failures.includes("community_context_version_mismatch"));

const missingToolVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents.map((event) =>
    event.eventType === "runtime_context_manifest_resolved"
      ? {
          ...event,
          payload: {
            ...event.payload,
            manifest: {
              ...(event.payload as any).manifest,
              tools: [{ name: "search_product_docs" }],
              summary: {
                ...(event.payload as any).manifest.summary,
                toolCount: 1,
              },
            },
          },
        }
      : event,
  ),
});
assert.equal(missingToolVerdict.ok, false);
assert.ok(missingToolVerdict.failures.includes("tool_policy_missing_from_manifest"));

const runIdMismatchVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents.map((event) =>
    event.eventType === "runtime_prompt_bundle_resolved"
      ? {
          ...event,
          payload: {
            ...event.payload,
            run_id: "wrong_run_id",
          },
        }
      : event,
  ),
});
assert.equal(runIdMismatchVerdict.ok, false);
assert.ok(runIdMismatchVerdict.failures.includes("run_id_mismatch"));

const unknownManifestPromptVerdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: baseEvents.map((event) =>
    event.eventType === "runtime_context_manifest_resolved"
      ? {
          ...event,
          payload: {
            ...event.payload,
            manifest: {
              ...(event.payload as any).manifest,
              prompts: [
                ...(event.payload as any).manifest.prompts,
                { id: "unknown_injected_prompt" },
              ],
              summary: {
                ...(event.payload as any).manifest.summary,
                promptCount: (event.payload as any).manifest.summary.promptCount + 1,
              },
            },
          },
        }
      : event,
  ),
});
assert.equal(unknownManifestPromptVerdict.ok, false);
assert.ok(
  unknownManifestPromptVerdict.failures.includes(
    "manifest_prompt_not_accounted_for:unknown_injected_prompt",
  ),
);

const v2SectionIds = [
  "platform_doctrine", "explanation_contract",
  "harness_operating_policy", "community_lens", "community_lens_authority",
  "community_system_prompt", "community_resource_lane",
  "runtime_turn_context", "temporal_context", "platform_skill_overlay",
  "personal_skill_overlay", "ambiguous_skill_mentions", "community_skill_overlay",
];
const v2RenderedIds = v2SectionIds.filter((id) => ![
  "community_system_prompt", "personal_skill_overlay",
  "ambiguous_skill_mentions", "community_skill_overlay",
].includes(id));
const v2Events = baseEvents.map((event) => {
  if (event.eventType === "runtime_prompt_bundle_resolved") {
    return { ...event, payload: { ...event.payload, version: 2,
      sections: v2SectionIds.map((id) => ({ id, rendered: v2RenderedIds.includes(id) })) } };
  }
  if (event.eventType === "runtime_context_manifest_resolved") {
    return { ...event, payload: { ...event.payload, manifest: {
      ...(event.payload as any).manifest, version: 2,
      prompts: v2RenderedIds.map((id) => ({ id })),
      summary: { ...(event.payload as any).manifest.summary, promptCount: v2RenderedIds.length },
    } } };
  }
  return event;
});
const v2Verdict = await buildRuntimeContextIntegrityCheck({
  run,
  events: v2Events,
});
assert.equal(v2Verdict.ok, true);
assert.equal(v2Verdict.checked.manifest_matches_prompt_receipt, true);

const missingV2ManifestProjection = await buildRuntimeContextIntegrityCheck({
  run,
  events: v2Events.map((event) => event.eventType === "runtime_context_manifest_resolved"
    ? { ...event, payload: { ...event.payload, manifest: {
        ...(event.payload as any).manifest,
        prompts: (event.payload as any).manifest.prompts.slice(1),
        summary: { ...(event.payload as any).manifest.summary,
          promptCount: (event.payload as any).manifest.prompts.length - 1 },
      } } }
    : event),
});
assert.equal(missingV2ManifestProjection.ok, false);
assert.ok(missingV2ManifestProjection.failures.includes(
  "prompt_section_not_accounted_for:platform_doctrine",
));

// Version 3 receipts (skills removed): the resources architect section replaces
// the four skill sections, and a v3 receipt without it fails.
const v3SectionIds = [
  ...v2SectionIds.filter((id) => !id.endsWith("_skill_overlay") && id !== "ambiguous_skill_mentions"),
  "resources_architect",
];
const v3RenderedIds = v3SectionIds.filter((id) => !["community_system_prompt", "resources_architect"].includes(id));
const v3EventsFor = (sectionIds: string[]) => v2Events.map((event) => {
  if (event.eventType === "runtime_prompt_bundle_resolved") {
    return { ...event, payload: { ...event.payload, version: 3,
      sections: sectionIds.map((id) => ({ id, rendered: v3RenderedIds.includes(id) })) } };
  }
  if (event.eventType === "runtime_context_manifest_resolved") {
    return { ...event, payload: { ...event.payload, manifest: {
      ...(event.payload as any).manifest,
      prompts: v3RenderedIds.map((id) => ({ id })),
      summary: { ...(event.payload as any).manifest.summary, promptCount: v3RenderedIds.length },
    } } };
  }
  return event;
});
const v3Verdict = await buildRuntimeContextIntegrityCheck({ run, events: v3EventsFor(v3SectionIds) });
assert.equal(v3Verdict.ok, true, JSON.stringify(v3Verdict.failures));
const v3MissingArchitect = await buildRuntimeContextIntegrityCheck({
  run,
  events: v3EventsFor(v3SectionIds.filter((id) => id !== "resources_architect")),
});
assert.equal(v3MissingArchitect.ok, false);
assert.ok(v3MissingArchitect.failures.includes("missing_prompt_section:resources_architect"));

const handlerSource = readFileSync("convex/runtimeTurnHandlers.ts", "utf8");
assert.match(
  handlerSource,
  /appendRuntimeContextIntegrityCheckBestEffort/,
  "runtime handler should import the backend integrity adapter",
);
assert.match(
  handlerSource,
  /appendContextIntegrityCheckBestEffortForRun/,
  "runtime handler should define a per-run integrity check helper",
);
assert.match(
  handlerSource,
  /streamAppendRunEvent[\s\S]*executeChatToolsAgentLoop[\s\S]*await appendContextIntegrityCheckBestEffortForRun\(\)/,
  "streaming agentic path should append integrity internally after the loop returns",
);
assert.match(
  handlerSource,
  /executeChatToolsAgentLoop\(\{[\s\S]*appendRunEvent: async \(event\): Promise<void>[\s\S]*await appendContextIntegrityCheckBestEffortForRun\(\)/,
  "non-streaming agentic path should append integrity after the loop returns",
);

const adapterSource = readFileSync("convex/runtimeContextIntegrity.ts", "utf8");
assert.match(adapterSource, /getRuntimeRunByOwnerRunIdInternal/);
assert.match(adapterSource, /listRuntimeRunEventsByOwnerRunIdInternal/);
assert.match(adapterSource, /RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE/);

const adapterQueryArgs: unknown[] = [];
const appendedAdapterEvents: Array<{
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}> = [];
const adapterVerdict = await appendRuntimeContextIntegrityCheckBestEffort({
  ctx: {
    async runQuery(_functionRef: unknown, args: unknown): Promise<unknown> {
      adapterQueryArgs.push(args);
      return adapterQueryArgs.length === 1 ? run : baseEvents;
    },
  },
  ownerId: "user_1" as any,
  runId: run.runId,
  appendRunEvent: async (event) => {
    appendedAdapterEvents.push(event);
    return event;
  },
});
assert.equal(adapterVerdict?.ok, true);
assert.equal(adapterQueryArgs.length, 2);
assert.equal(appendedAdapterEvents.length, 1);
assert.equal(appendedAdapterEvents[0]?.eventType, RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE);
assert.equal(
  appendedAdapterEvents[0]?.eventKey,
  `${run.runId}:${RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE}:1`,
);
assert.equal(appendedAdapterEvents[0]?.payload?.run_id, run.runId);
assert.equal(appendedAdapterEvents[0]?.payload?.ok, true);

console.log("runtime_context_integrity_proof: ok");
