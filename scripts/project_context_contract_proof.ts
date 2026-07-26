import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  PROJECT_CONTEXT_RENDER_INSTRUCTIONS_MAX_CHARS,
  PROJECT_CONTEXT_RENDER_LINKS_MAX,
  PROJECT_INSTRUCTIONS_MAX_CHARS,
  normalizeProjectInstructions,
  renderProjectContextForPrompt,
} from "../shared/projectContext.ts";
import { composePlatformChatRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import {
  buildRuntimeTurnContextPacket,
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForPrompt,
} from "../shared/runtimeTurnContextPacket.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.equal(normalizeProjectInstructions("  Keep this concise.  "), "Keep this concise.");
assert.throws(
  () => normalizeProjectInstructions("x".repeat(PROJECT_INSTRUCTIONS_MAX_CHARS + 1)),
  /project_context_value_too_long/,
);

const packet = buildRuntimeTurnContextPacket({
  projectContext: {
    label: "Project Alpha",
    description: "Durable project context.",
    instructions: "Use the attached project links before guessing.",
    links: [{ title: "Docs", url: "https://example.com/docs" }],
  },
});
const prompt = renderRuntimeTurnContextForPrompt(packet) ?? "";
assert.match(prompt, /PROJECT_CONTEXT/);
assert.match(prompt, /Project: Project Alpha/);
assert.match(prompt, /PROJECT_INSTRUCTIONS/);
assert.match(prompt, /Use the attached project links before guessing/);
assert.match(prompt, /PROJECT_LINKS/);
assert.match(prompt, /Docs: https:\/\/example\.com\/docs/);
const snapshot = buildRuntimeTurnContextSnapshot({ packet, capturedAt: 1 });
assert.equal(snapshot.projectContext?.label, "Project Alpha");
assert.ok(snapshot.fragments?.some((fragment) => fragment.kind === "project_context"));

const boundedPrompt = renderProjectContextForPrompt({
  label: "Bounded Project",
  instructions: "x".repeat(PROJECT_CONTEXT_RENDER_INSTRUCTIONS_MAX_CHARS + 200),
  links: Array.from({ length: PROJECT_CONTEXT_RENDER_LINKS_MAX + 2 }, (_, index) => ({
    title: `Link ${index + 1}`,
    url: `https://example.com/render-${index + 1}`,
  })),
}) ?? "";
assert.match(boundedPrompt, /PROJECT_CONTEXT/);
assert.match(boundedPrompt, /\[truncated\]/);
assert.match(boundedPrompt, /\[2 more links omitted\]/);
assert.match(boundedPrompt, /Link 10: https:\/\/example\.com\/render-10/);
assert.doesNotMatch(boundedPrompt, /Link 11: https:\/\/example\.com\/render-11/);

const plainChatProjectPrompt = composePlatformChatRuntimeSystemPrompt({
  agentName: "Polynet agent",
  projectContext: {
    label: "Plain Chat Project",
    description: "Project context should be mode-independent.",
    instructions: "Use project context in plain chat.",
    links: [{ title: "Plain Chat Spec", url: "https://example.com/plain-chat" }],
  },
  currentDateTimeIso: "2026-06-16T12:00:00.000Z",
  currentDateLabel: "Tuesday, June 16, 2026 at 12:00:00 PM UTC",
  currentTimeZone: "UTC",
});
assert.match(plainChatProjectPrompt, /PLATFORM_HARNESS_CONTEXT/);
assert.match(plainChatProjectPrompt, /PROJECT_CONTEXT/);
assert.match(plainChatProjectPrompt, /Project: Plain Chat Project/);
assert.match(plainChatProjectPrompt, /Use project context in plain chat/);
assert.match(plainChatProjectPrompt, /Plain Chat Spec: https:\/\/example\.com\/plain-chat/);
assert.ok(
  plainChatProjectPrompt.indexOf("PLATFORM_HARNESS_CONTEXT") <
    plainChatProjectPrompt.indexOf("PROJECT_CONTEXT"),
  "plain chat project context should render after harness context",
);
assert.ok(
  plainChatProjectPrompt.indexOf("PROJECT_CONTEXT") <
    plainChatProjectPrompt.indexOf("TEMPORAL_CONTEXT"),
  "plain chat project context should render before volatile temporal context",
);

const looseChatPrompt = composePlatformChatRuntimeSystemPrompt({
  agentName: "Polynet agent",
  projectContext: null,
  currentDateTimeIso: "2026-06-16T12:00:00.000Z",
  currentDateLabel: "Tuesday, June 16, 2026 at 12:00:00 PM UTC",
  currentTimeZone: "UTC",
});
assert.doesNotMatch(looseChatPrompt, /PROJECT_CONTEXT/);

const schema = read("convex/schema.ts");
const projects = read("convex/projects.ts");
const gateway = read("shared/cloudProjectsGateway.ts");
const projectContextSource = read("shared/projectContext.ts");
const runtimeContextLoader = read("convex/runtimeTurnContext.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");

assert.match(schema, /instructions: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /contextLinks: v\.optional\(v\.array\(v\.object\(\{/);
assert.match(projects, /normalizeProjectInstructions/);
assert.match(projects, /normalizeProjectContextLinks/);
assert.match(projects, /instructions: v\.optional\(v\.string\(\)\)/);
assert.match(projects, /contextLinks: v\.optional\(v\.array\(v\.object\(\{/);
assert.match(
  projects,
  /if \(typeof args\.instructions === "string"\)[\s\S]*patch\.instructions = normalizeProjectInstructions/,
  "project update should preserve omitted instructions and clear only explicit empty strings",
);
assert.match(
  projects,
  /if \(Array\.isArray\(args\.contextLinks\)\)[\s\S]*patch\.contextLinks = normalizeProjectContextLinks/,
  "project update should preserve omitted links and clear only explicit empty arrays",
);

assert.match(gateway, /instructions: string \| null/);
assert.match(gateway, /context_links: ProjectContextLink\[\]/);
assert.match(gateway, /readProjectContextLinks/);
assert.doesNotMatch(
  gateway,
  /ensureDefaultMappedCloudProject|createMappedCloudProject|updateMappedCloudProject|deleteMappedCloudProject|importCloudProjectZip/,
  "the browser gateway must remain read-only while project context stays a runtime persistence primitive",
);
assert.doesNotMatch(
  projectContextSource,
  /parseProjectContextLinksText|formatProjectContextLinksText/,
  "runtime project context must not retain text-area parsing helpers owned by the deleted browser editor",
);
for (const retiredPath of [
  "apps/web/src/components/WebCreateProjectModal.tsx",
  "apps/web/src/components/WebDeleteProjectModal.tsx",
  "apps/web/src/components/WebProjectModalHost.tsx",
  "apps/web/src/controllers/useWebProjectUiController.ts",
]) {
  assert.equal(
    existsSync(new URL(`../${retiredPath}`, import.meta.url)),
    false,
    `${retiredPath} must remain deleted`,
  );
}

assert.match(runtimeContextLoader, /loadRuntimeProjectContext/);
assert.match(runtimeContextLoader, /api\.projects\.getCloudProjectById/);
assert.match(runtimeContextLoader, /authSubject/);
assert.match(runtimeContextLoader, /projectContext,/);
assert.match(runtimePrompt, /projectContext\?: RuntimeProjectContextPrompt \| null/);
assert.match(runtimePrompt, /renderProjectContextForPrompt\(params\.projectContext \?\? null\)/);
assert.match(runtimeTurnHandlers, /loadRuntimeProjectContext\(\{/);
assert.match(runtimeTurnHandlers, /projectContext: runtimeProjectContext/);
assert.doesNotMatch(
  runtimeTurnHandlers,
  /const runtimeProjectContext = await loadRuntimeTurnContextPacketForRun/,
  "plain chat should not load the full runtime packet just to render project context",
);
assert.match(runtimeAgentLoop, /const projectContext = runtimeTurnContext\.projectContext \?\? null/);
assert.doesNotMatch(
  runtimeAgentLoop,
  /resolveWorkspaceProjectContext/,
  "runtime agent loop should use the server-loaded packet project context",
);

console.log("project_context_contract_proof: ok");
