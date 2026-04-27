import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildWorkspaceRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";

function indexOfBlock(prompt: string, blockName: string): number {
  const index = prompt.indexOf(blockName);
  assert.notEqual(index, -1, `expected ${blockName} block`);
  return index;
}

const prompt = buildWorkspaceRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: ["read", "write", "bash"],
  harnessName: "chat_tools",
  projectLabel: "Prompt proof",
  projectDescription: "Prompt ordering test project",
  communityId: "community_1",
  communityName: "Prompt Community",
  communitySlug: "prompt-community",
  communityOneLiner: "A proof community.",
  communityAbout: "Used to prove prompt layout.",
  customCommunitySystemPrompt: "Prefer proof-grounded answers.",
  threadWorkingState: {
    version: 3,
    goal: "Improve the harness",
    status: "needs_verification",
    currentStep: "Verify the changed workspace files.",
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
      healthStatus: "healthy",
      healthSummary: "Process is running.",
      lastBrowserObservationSummary: "Preview iframe rendered a blank white page.",
      outputTail: "ready",
    },
  ],
  currentDateTimeIso: "2026-04-25T20:00:00.000Z",
  currentDateLabel: "April 25, 2026",
  currentTimeZone: "America/New_York",
});

const platformIndex = indexOfBlock(prompt, "PLATFORM_DOCTRINE");
const soulIndex = indexOfBlock(prompt, "AGENT_SOUL");
const explanationIndex = indexOfBlock(prompt, "EXPLANATION_CONTRACT");
const policyIndex = indexOfBlock(prompt, "AGENT_OPERATING_POLICY");
const communityIndex = indexOfBlock(prompt, "COMMUNITY_LENS");
const workspaceIndex = indexOfBlock(prompt, "WORKSPACE_CONTEXT");
const workingStateIndex = indexOfBlock(prompt, "THREAD_WORKING_STATE");
const processContextIndex = indexOfBlock(prompt, "WORKSPACE_PROCESS_CONTEXT");
const temporalIndex = indexOfBlock(prompt, "TEMPORAL_CONTEXT");

assert.ok(platformIndex < soulIndex, "platform doctrine should lead stable prompt");
assert.ok(soulIndex < explanationIndex, "agent behavior should stay in stable prompt");
assert.ok(explanationIndex < policyIndex, "explanation contract should precede operating policy");
assert.ok(policyIndex < communityIndex, "stable policy should precede semi-stable context");
assert.ok(communityIndex < workspaceIndex, "community identity should precede workspace identity");
assert.ok(workspaceIndex < workingStateIndex, "working state should be volatile after workspace identity");
assert.ok(workingStateIndex < processContextIndex, "process context should follow thread working state");
assert.ok(processContextIndex < temporalIndex, "temporal context should remain in volatile tail");
assert.equal(
  prompt.match(/THREAD_WORKING_STATE/g)?.length ?? 0,
  1,
  "working state should render once",
);
assert.match(prompt, /Verification: needed/);
assert.match(prompt, /Files touched: src\/App\.tsx, src\/main\.tsx/);
assert.match(prompt, /Last diagnostic: src\/App\.tsx:12:34 TS2322/);
assert.match(prompt, /WORKSPACE_PROCESS_CONTEXT/);
assert.match(prompt, /lifecycle=project_background/);
assert.match(prompt, /health=healthy/);
assert.match(prompt, /preview=blank; port=3000/);
assert.match(prompt, /browser_observation=Preview iframe rendered a blank white page/);
assert.match(prompt, /If the process is still running but preview is blank/);
assert.doesNotMatch(prompt, /WORKSPACE_RUNTIME_STATE/);
assert.doesNotMatch(prompt, /BACKGROUND_TERMINAL_STATE/);
assert.match(prompt, /Core value prop: the agent can be the product/);
assert.match(prompt, /Detailed product truth lives in product docs/);
assert.match(prompt, /You are the agent of Polynet: a sharp little intelligence/);
assert.match(prompt, /Use this lens as background context/);
assert.match(prompt, /Use community_search when community activity, archive memory, resources, or learned context matter/);
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
  "/Users/neilmcdevitt/code/arx/shared/runtimePrompt.ts",
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
  /Do not start the same long-running server command with both terminal_start and bash/,
  "terminal guidance should prevent duplicate long-running server launches",
);

console.log("runtime_prompt_layout_proof: ok");
