import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatRuntimeDiagnosticSummary,
  parseRuntimeDiagnosticsFromText,
} from "../shared/runtimeDiagnostics.ts";
import { inferRuntimeToolFailureSemantics } from "../shared/runtimeToolFailureSemantics.ts";
import { summarizeRuntimeWorkingStateFromEvents } from "../shared/runtimeWorkingStateLedger.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

const tscOutput = [
  "src/App.tsx(12,34): error TS2322: Type 'string' is not assignable to type 'number'.",
  "src/lib/state.ts(4,9): warning TS6133: 'unused' is declared but its value is never read.",
].join("\n");

const tscDiagnostics = parseRuntimeDiagnosticsFromText({
  command: "npm run check:web-typecheck",
  outputText: tscOutput,
});
assert.equal(tscDiagnostics.length, 2);
assert.deepEqual(tscDiagnostics[0], {
  source: "typescript",
  severity: "error",
  message: "Type 'string' is not assignable to type 'number'.",
  file: "src/App.tsx",
  line: 12,
  column: 34,
  code: "TS2322",
  raw: "src/App.tsx(12,34): error TS2322: Type 'string' is not assignable to type 'number'.",
});
assert.equal(
  formatRuntimeDiagnosticSummary(tscDiagnostics[0]),
  "src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.",
);

const prettyDiagnostics = parseRuntimeDiagnosticsFromText({
  command: "tsc --noEmit",
  outputText:
    "apps/web/src/App.tsx:22:7 - error TS2552: Cannot find name 'foo'. Did you mean 'Foo'?",
});
assert.equal(prettyDiagnostics[0]?.file, "apps/web/src/App.tsx");
assert.equal(prettyDiagnostics[0]?.code, "TS2552");

const buildDiagnostics = parseRuntimeDiagnosticsFromText({
  command: "npm run build",
  outputText:
    "[vite]: Rollup failed to resolve import \"./missing\" from \"src/App.tsx\".",
});
assert.equal(buildDiagnostics.length, 1);
assert.equal(buildDiagnostics[0]?.source, "build");
assert.equal(buildDiagnostics[0]?.code, "module_resolution");
assert.equal(buildDiagnostics[0]?.file, "src/App.tsx");

const commandNotFound = inferRuntimeToolFailureSemantics({
  toolName: "bash",
  command: "vite --host 0.0.0.0",
  cwd: "/workspace",
  exitCode: 127,
  outputText: "bash: vite: command not found",
});
assert.equal(commandNotFound?.kind, "command_not_found");
assert.equal(commandNotFound?.failedExecutable, "vite");
assert.equal(commandNotFound?.summary, "Command not found: vite.");
assert.equal(commandNotFound?.diagnostic.code, "command_not_found");
assert.ok(
  commandNotFound?.suggestedRecovery.includes("package.json"),
  "command-not-found recovery points at package scripts/PATH truth",
);

const missingScript = inferRuntimeToolFailureSemantics({
  toolName: "bash",
  command: "npm run preview",
  exitCode: 1,
  outputText: "npm ERR! Missing script: \"preview\"",
});
assert.equal(missingScript?.kind, "missing_package_script");
assert.equal(missingScript?.summary, "Missing package script: preview.");

const readErrorWithZeroExit = inferRuntimeToolFailureSemantics({
  toolName: "read",
  exitCode: 0,
  errorMessage: "Read failed because the path was invalid.",
  outputText: "",
});
assert.equal(readErrorWithZeroExit?.kind, "tool_failure");
assert.equal(readErrorWithZeroExit?.summary, "Read failed because the path was invalid.");
assert.equal(readErrorWithZeroExit?.diagnostic.code, "tool_failure");
assert.equal(readErrorWithZeroExit?.diagnostic.source, "read");
assert.notEqual(readErrorWithZeroExit?.diagnostic.code, "nonzero_exit");
assert.notEqual(
  formatRuntimeDiagnosticSummary(readErrorWithZeroExit?.diagnostic),
  "shell nonzero_exit: read exited with code 0.",
);

const airtableForbidden = inferRuntimeToolFailureSemantics({
  toolName: "me__airtable_3__list_bases",
  errorCode: "user_platform_app_tool_failed",
  errorMessage: '{"error":"FORBIDDEN","message":"Forbidden"}',
  outputText: '{"error":"FORBIDDEN","message":"Forbidden"}',
  details: {
    user_platform_app: {
      app_name: "Airtable",
      tool_name: "list_bases",
      namespaced_tool_name: "airtable__list_bases",
      risk_level: "read",
    },
  },
});
assert.equal(airtableForbidden?.kind, "app_permission_denied");
assert.equal(
  airtableForbidden?.summary,
  "Airtable tool list_bases was rejected by the provider because of permissions or scopes.",
);
assert.equal(airtableForbidden?.appName, "Airtable");
assert.equal(airtableForbidden?.appScope, "user_platform_app");
assert.equal(airtableForbidden?.appToolName, "list_bases");
assert.equal(airtableForbidden?.diagnostic.source, "connected_app:Airtable");
assert.ok(
  airtableForbidden?.suggestedRecovery.includes("workspace/resource permissions"),
  "permission recovery should point at app/provider permissions instead of generic runtime failure",
);

const linearBadCursor = inferRuntimeToolFailureSemantics({
  toolName: "me__linear_4__list_issue_labels",
  errorCode: "user_platform_app_tool_failed",
  errorMessage: "Invalid input: expected cursor to be a string.",
  outputText: "expected cursor to be a string",
  details: {
    user_platform_app: {
      app_name: "Linear",
      tool_name: "list_issue_labels",
      namespaced_tool_name: "linear__list_issue_labels",
      risk_level: "read",
    },
  },
});
assert.equal(linearBadCursor?.kind, "app_invalid_arguments");
assert.equal(
  linearBadCursor?.summary,
  "Linear tool list_issue_labels failed because the tool arguments were invalid.",
);
assert.ok(
  linearBadCursor?.suggestedRecovery.includes("tool schema"),
  "invalid argument recovery should tell the agent to correct arguments, not reconnect the app",
);

const notionExpiredAuth = inferRuntimeToolFailureSemantics({
  toolName: "me__notion_1__search",
  errorCode: "user_platform_app_tool_failed",
  errorMessage: "401 Unauthorized: access token expired",
  details: {
    user_platform_app: {
      app_name: "Notion",
      tool_name: "search",
      namespaced_tool_name: "notion__search",
      risk_level: "read",
    },
  },
});
assert.equal(notionExpiredAuth?.kind, "app_auth_required");
assert.ok(
  notionExpiredAuth?.suggestedRecovery.includes("reconnect"),
  "auth failures should point at setup/reconnect",
);

const githubRateLimited = inferRuntimeToolFailureSemantics({
  toolName: "me__github_1__search_repos",
  errorCode: "user_platform_app_tool_failed",
  errorMessage: "429 Too Many Requests: rate limit exceeded",
  details: {
    user_platform_app: {
      app_name: "GitHub",
      tool_name: "search_repos",
      namespaced_tool_name: "github__search_repos",
      risk_level: "read",
    },
  },
});
assert.equal(githubRateLimited?.kind, "app_rate_limited");
assert.ok(
  githubRateLimited?.suggestedRecovery.includes("Back off"),
  "rate limits should not encourage tight retry loops",
);

const unknownMountedAppFailure = inferRuntimeToolFailureSemantics({
  toolName: "me__unknown_1__read",
  errorCode: "user_platform_app_tool_failed",
  errorMessage: "Unexpected provider failure.",
});
assert.equal(unknownMountedAppFailure?.kind, "app_tool_failure");
assert.equal(unknownMountedAppFailure?.appName, "Unknown");

const eventSource = readText("convex/runtimeToolCallEvents.ts");
assert.ok(
  eventSource.includes('eventType: "runtime_diagnostics_detected"'),
  "runtime diagnostics are emitted as their own runtime event",
);
assert.ok(
  eventSource.includes("parseRuntimeDiagnosticsFromText"),
  "runtime tool finish path parses diagnostics",
);
assert.ok(
  eventSource.includes("inferRuntimeToolFailureSemantics"),
  "runtime tool finish path persists semantic shell failures",
);
assert.ok(
  eventSource.includes("failure_semantics"),
  "runtime tool finish event carries failure semantics",
);
assert.ok(
  eventSource.includes("app_name: failureSemantics.appName"),
  "runtime tool finish event persists connected-app failure identity",
);

const appendedEvents = [
  {
    eventType: "tool_call_finished",
    payload: {
      run_id: "run_123",
      tool_call_id: "runtime_tools:run_123:chat_tools:2",
      provider_call_id: "call_123",
      tool_name: "bash",
      args: {
        command: "npm run check:web-typecheck",
      },
      status: "error",
      error_code: "command_failed",
      error_message: "Command failed.",
      diagnostics: tscDiagnostics,
      diagnostic_count: tscDiagnostics.length,
      top_diagnostic_summary: formatRuntimeDiagnosticSummary(tscDiagnostics[0]),
    },
  },
  {
    eventType: "runtime_diagnostics_detected",
    payload: {
      run_id: "run_123",
      tool_call_id: "runtime_tools:run_123:chat_tools:2",
      provider_call_id: "call_123",
      tool_name: "bash",
      command: "npm run check:web-typecheck",
      diagnostic_source: "typescript",
      diagnostic_count: tscDiagnostics.length,
      diagnostics: tscDiagnostics,
      top_diagnostic_summary: formatRuntimeDiagnosticSummary(tscDiagnostics[0]),
    },
  },
];

assert.equal(appendedEvents.length, 2);
assert.equal(appendedEvents[0]?.eventType, "tool_call_finished");
assert.equal(appendedEvents[1]?.eventType, "runtime_diagnostics_detected");
assert.equal(appendedEvents[0]?.payload.diagnostic_count, 2);
assert.equal(appendedEvents[1]?.payload.top_diagnostic_summary, "src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.");

const workingState = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Fix the app",
  runStatus: "error",
  events: appendedEvents,
  nowMs: 1,
});
assert.equal(workingState.status, "blocked");
assert.equal(
  workingState.blocker,
  "Verification failed: src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.",
);
assert.equal(
  workingState.nextAction,
  "Fix src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.",
);
assert.ok(
  workingState.verifiedFindings.some((finding) =>
    finding.includes("Found diagnostic: src/App.tsx:12:34 TS2322"),
  ),
);

const commandNotFoundState = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Run the app",
  runStatus: "error",
  events: [
    {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "bash",
        status: "error",
        args: { command: "vite --host 0.0.0.0" },
        failure_semantics: {
          kind: "command_not_found",
          summary: "Command not found: vite.",
          suggested_recovery:
            "Inspect package.json and the sandbox PATH, then use an available script/binary or install the missing command before retrying.",
        },
        diagnostics: [commandNotFound?.diagnostic],
        top_diagnostic_summary: formatRuntimeDiagnosticSummary(commandNotFound?.diagnostic),
      },
    },
  ],
  nowMs: 2,
});
assert.equal(commandNotFoundState.status, "blocked");
assert.equal(
  commandNotFoundState.lastDiagnostic,
  "shell command_not_found: Command not found: vite.",
);
assert.equal(
  commandNotFoundState.nextAction,
  "Inspect package.json and the sandbox PATH, then use an available script/binary or install the missing command before retrying.",
);
assert.ok(
  !commandNotFoundState.nextAction?.includes("narrower or alternate path"),
  "semantic shell failures should not fall back to misleading path retry guidance",
);

console.log("runtime_diagnostics_proof: ok");
