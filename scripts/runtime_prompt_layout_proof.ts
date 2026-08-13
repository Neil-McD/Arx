import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildPlatformHarnessRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import {
  buildRuntimeRecentToolAttemptsFromEvents,
  buildRuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket.ts";

function indexOfBlock(prompt: string, blockName: string): number {
  const index = prompt.indexOf(blockName);
  assert.notEqual(index, -1, `expected ${blockName} block`);
  return index;
}

const longCommunityAbout = [
  "Used to prove prompt layout.",
  "This sentence should appear in the compact about excerpt.",
  "Long community about detail. ".repeat(80),
  "FULL_ABOUT_TAIL_SHOULD_NOT_RENDER",
].join(" ");

const prompt = buildPlatformHarnessRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: [
    "polynet_list",
    "polynet_read",
    "community_resources_read",
    "community_resources_search",
    "community_memory_search",
    "community_memory_read",
    "community_search",
    "read",
    "write",
    "bash",
  ],
  harnessName: "chat_tools",
  projectLabel: "Prompt proof",
  projectDescription: "Prompt ordering test project",
  communityId: "community_1",
  communityName: "Prompt Community",
  communitySlug: "prompt-community",
  communityOneLiner: "A proof community.",
  communityAbout: longCommunityAbout,
  communitySystemPrompt: "Prefer proof-grounded answers.",
  agentName: "James",
  agentSoul: "Keep proofs tight.",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    projectContext: {
      label: "Prompt proof",
      description: "Prompt ordering test project",
      instructions: "Prefer the project README before making structural claims.",
      links: [{ title: "Docs", url: "https://example.com/docs" }],
    },
    threadWorkingState: {
      version: 3,
      goal: "Improve the harness",
      status: "needs_verification",
      currentStep: "Verify the changed workspace files.",
      plan: ["Inspect the app", "Patch the issue", "Verify the build"],
      completedSteps: ["Inspected src/App.tsx."],
      decisions: ["Use the runtime turn packet as the canonical prompt source."],
      openQuestions: ["Does the preview show visible content?"],
      focusFiles: ["src/App.tsx"],
      lastResult: "Changed src/App.tsx; verification is still needed.",
      verificationStatus: "needed",
      filesTouched: ["src/App.tsx", "src/main.tsx"],
      filesChanged: ["src/App.tsx"],
      verifiedFindings: ["Inspected src/App.tsx."],
      recentActions: ["Edited src/App.tsx."],
      lastDiagnostic: "src/App.tsx:12:34 TS2322: Example diagnostic.",
      nextAction: "Run npm run build.",
    },
    activeBackgroundTerminals: [
      {
        id: "terminal_1",
        status: "running",
        lifecycleOwner: "project_background",
        command: "npm run dev",
        cwd: ".",
        previewPort: 3000,
        previewPath: "/",
        previewStatus: "blank",
        previewTransportStatus: "loaded",
        previewInspectionStatus: "same_origin_dom",
        previewRenderStatus: "blank_suspected",
        healthStatus: "healthy",
        healthSummary: "Process is running.",
        lastBrowserObservationSummary: "Preview iframe rendered a blank white page.",
        outputTail: "ready",
      },
    ],
    recentBackgroundProcessEvents: [
      {
        terminalId: "terminal_failed_1",
        status: "failed",
        completionReason: "failed",
        command: "npm run dev",
        cwd: ".",
        previewPort: 3000,
        previewStatus: "server_exited",
        healthSummary: "Process failed with exit code 127.",
        exitCode: 127,
        outputTail: "sh: vite: not found",
        finishedAt: 1_774_000_000_000,
        completionRecordedAt: 1_774_000_000_000,
      },
    ],
    recentToolAttempts: [
      {
        toolCallId: "runtime_tools:run_1:chat_tools:4",
        providerCallId: "call_4",
        toolName: "bash",
        status: "error",
        commandOrTarget: "npm run build",
        cwd: ".",
        exitCode: 127,
        errorCode: "shell_nonzero_exit",
        errorMessage: "Command exited with code 127.",
        outputPreview: "sh: vite: not found",
        failureSummary: "The shell command failed because vite was not found.",
        suggestedRecovery: "Inspect package scripts and node_modules/.bin before retrying.",
      },
      {
        toolCallId: "runtime_tools:run_1:chat_tools:5",
        providerCallId: "call_5",
        toolName: "computer_open_url",
        status: "error",
        commandOrTarget: "http://localhost:3000/",
        errorCode: "navigation_blocked",
        errorMessage: "The sandbox browser could not reach localhost.",
        outputPreview: "curl: (7) Failed to connect to localhost port 3000",
      },
    ],
  }),
  currentDateTimeIso: "2026-04-25T20:00:00.000Z",
  currentDateLabel: "April 25, 2026",
  currentTimeZone: "America/New_York",
});

const platformIndex = indexOfBlock(prompt, "PLATFORM_DOCTRINE");
const soulIndex = indexOfBlock(prompt, "AGENT_SOUL");
const explanationIndex = indexOfBlock(prompt, "EXPLANATION_CONTRACT");
const policyIndex = indexOfBlock(prompt, "AGENT_OPERATING_POLICY");
const communityIndex = indexOfBlock(prompt, "COMMUNITY_LENS");
const platformHarnessContextIndex = indexOfBlock(prompt, "PLATFORM_HARNESS_CONTEXT");
const projectContextIndex = indexOfBlock(prompt, "PROJECT_CONTEXT");
const workingStateIndex = indexOfBlock(prompt, "THREAD_WORKING_STATE");
const processContextIndex = indexOfBlock(prompt, "WORKSPACE_PROCESS_CONTEXT");
const recentProcessEventsIndex = indexOfBlock(prompt, "RECENT_BACKGROUND_PROCESS_EVENTS");
const recentToolAttemptsIndex = indexOfBlock(prompt, "RECENT_TOOL_ATTEMPTS");
const temporalIndex = indexOfBlock(prompt, "TEMPORAL_CONTEXT");

assert.ok(platformIndex < soulIndex, "platform doctrine should lead stable prompt");
assert.ok(soulIndex < explanationIndex, "agent behavior should stay in stable prompt");
assert.ok(explanationIndex < policyIndex, "explanation contract should precede operating policy");
assert.ok(policyIndex < communityIndex, "stable policy should precede semi-stable context");
assert.ok(communityIndex < platformHarnessContextIndex, "community identity should precede platform harness context");
assert.ok(platformHarnessContextIndex < projectContextIndex, "project context should be volatile after platform harness context");
assert.ok(projectContextIndex < workingStateIndex, "working state should follow project context");
assert.ok(workingStateIndex < processContextIndex, "process context should follow thread working state");
assert.ok(processContextIndex < recentProcessEventsIndex, "recent process events should follow process context");
assert.ok(recentProcessEventsIndex < recentToolAttemptsIndex, "tool attempts should follow process lifecycle events");
assert.ok(recentToolAttemptsIndex < temporalIndex, "temporal context should remain in volatile tail");
assert.equal(
  prompt.match(/THREAD_WORKING_STATE/g)?.length ?? 0,
  1,
  "working state should render once",
);
assert.equal(
  prompt.match(/PROJECT_CONTEXT/g)?.length ?? 0,
  1,
  "project context should render once",
);
assert.match(prompt, /Project: Prompt proof/);
assert.match(prompt, /PROJECT_INSTRUCTIONS/);
assert.match(prompt, /Prefer the project README before making structural claims/);
assert.match(prompt, /PROJECT_LINKS/);
assert.match(prompt, /Docs: https:\/\/example\.com\/docs/);
assert.match(prompt, /Verification: needed/);
assert.match(prompt, /Plan: Inspect the app \| Patch the issue \| Verify the build/);
assert.match(prompt, /Completed steps: Inspected src\/App\.tsx/);
assert.match(prompt, /Decisions: Use the runtime turn packet as the canonical prompt source/);
assert.match(prompt, /Open questions: Does the preview show visible content\?/);
assert.match(prompt, /Focus files: src\/App\.tsx/);
assert.match(prompt, /Files touched: src\/App\.tsx, src\/main\.tsx/);
assert.match(prompt, /Last diagnostic: src\/App\.tsx:12:34 TS2322/);
assert.match(prompt, /WORKSPACE_PROCESS_CONTEXT/);
assert.match(prompt, /lifecycle=project_background/);
assert.match(prompt, /health=healthy/);
assert.match(prompt, /preview_process=blank; port=3000/);
assert.doesNotMatch(prompt, /; preview=blank/);
assert.match(prompt, /transport=loaded/);
assert.match(prompt, /inspection=same_origin_dom/);
assert.match(prompt, /render=blank_suspected/);
assert.match(prompt, /preview_diagnosis=blank_suspected/);
assert.match(prompt, /recommended_preview_debug_action=Keep the healthy server running/);
assert.match(prompt, /browser_observation=Preview iframe rendered a blank white page/);
assert.match(prompt, /terminal health, preview transport\/render probe, browser\/computer observation/);
assert.match(prompt, /preview_process as process\/transport availability only/);
assert.match(prompt, /If the process is still running but render is blank_suspected/);
assert.match(prompt, /RECENT_BACKGROUND_PROCESS_EVENTS/);
assert.match(prompt, /terminal_failed_1: failed; command=npm run dev; reason=failed/);
assert.match(prompt, /preview=server_exited/);
assert.match(prompt, /output=sh: vite: not found/);
assert.match(prompt, /A completed preview server invalidates older live-preview assumptions/);
assert.match(prompt, /RECENT_TOOL_ATTEMPTS/);
assert.match(prompt, /bash error; target=npm run build; cwd=\.; exit=127/);
assert.match(prompt, /error_code=shell_nonzero_exit/);
assert.match(prompt, /output=sh: vite: not found/);
assert.match(prompt, /computer_open_url error; target=http:\/\/localhost:3000\//);
assert.match(prompt, /Do not say exact failed tool calls are unavailable when they are listed here/);
assert.doesNotMatch(prompt, /WORKSPACE_RUNTIME_STATE/);
assert.doesNotMatch(prompt, /BACKGROUND_TERMINAL_STATE/);
assert.match(prompt, /Polynet helps builders create, deploy, and monetize AI agents, communities, and apps/);
assert.match(prompt, /For exact product truth, setup flows, roles, access, billing, memory/);
assert.match(prompt, /Configured agent name: James/);
assert.match(prompt, /When the member asks your name, answer with the configured agent name/);
assert.match(prompt, /You are the member's Polynet agent: a sharp little intelligence/);
assert.match(prompt, /Keep proofs tight/);
assert.match(prompt, /Use this lens as background context/);
assert.match(prompt, /Use polynet_list with path \/ to inspect the platform repository root/);
assert.match(prompt, /Use polynet_list with path \/communities\/ to list communities the signed-in member can currently access/);
assert.match(prompt, /Use polynet_read with path \/communities\/prompt-community\/community\.md when the answer depends on the active community's full identity/);
assert.match(prompt, /For active-community Resources, references, knowledge, category contents, and pages/);
assert.match(prompt, /use the semantic polynet_list\/polynet_read path before product documentation tools/);
assert.match(prompt, /community_resources_read only when a justified batch read/);
assert.match(prompt, /Use community_memory_search for what the active community has learned and accepted/);
assert.match(prompt, /cite the memory title and status/);
assert.match(prompt, /Use community_search for broad raw recent community activity evidence beyond the canonical resource directory/);
assert.match(prompt, /Accepted community memory is distinct from raw chat and resource evidence/);
assert.match(prompt, /channels\/general\/ for bounded recent community activity and \/communities\/prompt-community\/events\/ for bounded current and upcoming events/);
assert.match(prompt, /Use polynet_search only when you have a specific non-empty topic/);
assert.match(prompt, /About excerpt: Used to prove prompt layout/);
assert.match(prompt, /The about excerpt is not a complete knowledge base/);
assert.doesNotMatch(prompt, /About: Used to prove prompt layout/);
assert.doesNotMatch(prompt, /FULL_ABOUT_TAIL_SHOULD_NOT_RENDER/);
assert.doesNotMatch(
  prompt,
  /When community_search returns recent_context/,
  "community lens should not duplicate detailed community_search result handling",
);
assert.doesNotMatch(
  prompt,
  /## Core Mechanism/,
  "runtime prompt should not inline long product-doc doctrine now that docs tools exist",
);
assert.doesNotMatch(
  prompt,
  /Examples of signal include:/,
  "runtime prompt should avoid duplicating product docs content",
);

const runtimePromptSource = readFileSync(
  "shared/runtimePrompt.ts",
  "utf8",
);
const runtimeTurnContextPacketSource = readFileSync(
  "shared/runtimeTurnContextPacket.ts",
  "utf8",
);
const runtimeContextFragmentsSource = readFileSync(
  "shared/runtimeContextFragments.ts",
  "utf8",
);
const runtimeAgentLoopSource = readFileSync(
  "convex/runtimeAgentLoop.ts",
  "utf8",
);
const runtimeTurnContextLoaderSource = readFileSync(
  "convex/runtimeTurnContext.ts",
  "utf8",
);
assert.match(
  runtimePromptSource,
  /const stablePromptBlocks = \[/,
  "prompt source should name stable blocks explicitly",
);
assert.match(
  runtimePromptSource,
  /const semiStablePromptBlocks = \[/,
  "prompt source should name semi-stable blocks explicitly",
);
assert.match(
  runtimePromptSource,
  /const volatilePromptBlocks = \[/,
  "prompt source should name volatile blocks explicitly",
);
assert.match(
  runtimePromptSource,
  /renderRuntimeTurnContextForPrompt\(params\.runtimeTurnContext\)/,
  "prompt source should render canonical runtime turn context packet",
);
assert.doesNotMatch(
  runtimePromptSource,
  /threadWorkingState\?: ThreadWorkingStatePrompt/,
  "platform harness runtime prompt should not accept direct working-state params outside the canonical packet",
);
assert.doesNotMatch(
  runtimePromptSource,
  /activeBackgroundTerminals\?: RuntimeWorkspaceTerminalPrompt/,
  "platform harness runtime prompt should not accept direct terminal params outside the canonical packet",
);
assert.match(
  runtimeTurnContextPacketSource,
  /export function mapRuntimeWorkspaceTerminalPrompt/,
  "terminal ledger mapping should live in the canonical context packet helper",
);
assert.match(
  runtimeTurnContextPacketSource,
  /deriveRuntimePreviewDiagnosis/,
  "canonical context packet should derive preview diagnosis from terminal ledger fields",
);
assert.match(
  runtimePromptSource,
  /terminal health, preview probe, browser\/computer observation, then app diagnosis/,
  "operating policy should enforce the preview debug evidence order",
);
assert.match(
  runtimeTurnContextPacketSource,
  /export type RuntimeTurnContextSnapshotV1/,
  "runtime context snapshot should be typed next to the canonical packet",
);
assert.match(
  runtimeTurnContextPacketSource,
  /recentToolAttempts: RuntimeRecentToolAttemptPrompt\[\]/,
  "runtime context packet should carry recent tool attempts",
);
assert.match(
  runtimeTurnContextPacketSource,
  /recentBackgroundProcessEvents: RuntimeBackgroundProcessEventPrompt\[\]/,
  "runtime context packet should carry recent background process lifecycle events",
);
assert.match(
  runtimeTurnContextPacketSource,
  /fragments\?: RuntimeContextFragmentV1\[\]/,
  "runtime context packet should carry canonical context fragments",
);
assert.match(
  runtimeTurnContextPacketSource,
  /projectContext\?: RuntimeProjectContextPrompt \| null/,
  "runtime context packet should carry resolved project context",
);
assert.match(
  runtimeTurnContextPacketSource,
  /fragments: buildRuntimeContextFragmentsFromParts\(\{/,
  "runtime context packet builder should emit canonical context fragments",
);
assert.match(
  runtimeContextFragmentsSource,
  /project_context:v1/,
  "runtime context fragments should render auditable project context",
);
assert.match(
  runtimeTurnContextPacketSource,
  /renderRuntimeContextFragmentsForPrompt\(fragments\)/,
  "runtime context packet prompt renderer should delegate to fragments",
);
assert.match(
  runtimeContextFragmentsSource,
  /RECENT_BACKGROUND_PROCESS_EVENTS/,
  "runtime context fragments should render recent process lifecycle events",
);
assert.match(
  runtimeContextFragmentsSource,
  /ACTION_LEDGER/,
  "runtime context fragments should render deterministic action ledger context",
);
assert.match(
  runtimeContextFragmentsSource,
  /redactRuntimeContextText/,
  "runtime context fragments should own prompt-context redaction",
);
assert.match(
  runtimeTurnContextPacketSource,
  /export function buildRuntimeTurnContextSnapshot/,
  "runtime context snapshot should be built from the canonical packet",
);
assert.match(
  runtimeTurnContextPacketSource,
  /buildRuntimeRecentToolAttemptsFromEvents/,
  "runtime context packet should normalize recent tool attempts from run events",
);
assert.match(
  runtimeAgentLoopSource,
  /loadRuntimeTurnContextPacketForRun\(\{/,
  "normal runtime prompt path should use the canonical context loader",
);
assert.doesNotMatch(
  runtimeAgentLoopSource,
  /mapRuntimeWorkspaceTerminalPrompt/,
  "normal runtime path should not manually map terminal rows for prompt context",
);
assert.match(
  runtimeTurnContextLoaderSource,
  /buildRuntimeTurnContextPacket\(\{/,
  "canonical context loader should be the server-side packet builder",
);
assert.match(
  runtimeTurnContextLoaderSource,
  /loadRuntimeProjectContext/,
  "canonical context loader should load project context server-side",
);
assert.match(
  runtimeTurnContextLoaderSource,
  /listRecentRuntimeToolFinishedEventsByOwnerThreadIdInternal/,
  "canonical context loader should include recent finished tool calls across thread runs",
);
assert.match(
  runtimeTurnContextLoaderSource,
  /export async function loadActiveRuntimeTurnState/,
  "canonical context loader should expose active turn state",
);
assert.match(
  runtimeTurnContextLoaderSource,
  /getActiveRuntimeTurnStateInternal/,
  "active turn state should load through the runtime run authority",
);
assert.match(
  runtimePromptSource,
  /Do not start the same long-running server command with both terminal_start and bash/,
  "terminal guidance should prevent duplicate long-running server launches",
);

console.log("runtime_prompt_layout_proof: ok");
