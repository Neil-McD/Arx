import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PROJECT_CONTEXT_LINKS_MAX,
  PROJECT_CONTEXT_RENDER_INSTRUCTIONS_MAX_CHARS,
  PROJECT_CONTEXT_RENDER_LINKS_MAX,
  PROJECT_INSTRUCTIONS_MAX_CHARS,
  formatProjectContextLinksText,
  normalizeProjectInstructions,
  parseProjectContextLinksText,
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

function readExportedFunction(source: string, name: string): string {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing exported function ${name}`);
  const next = source.indexOf("\nexport ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const parsed = parseProjectContextLinksText(
  [
    "https://example.com",
    "Docs - https://example.com/docs",
    "Roadmap: https://example.com/roadmap",
  ].join("\n"),
);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.links.length, 3);
assert.deepEqual(parsed.links[0], { url: "https://example.com/" });
assert.deepEqual(parsed.links[1], {
  title: "Docs",
  url: "https://example.com/docs",
});
assert.deepEqual(parsed.links[2], {
  title: "Roadmap",
  url: "https://example.com/roadmap",
});
assert.equal(
  formatProjectContextLinksText(parsed.links),
  [
    "https://example.com/",
    "Docs - https://example.com/docs",
    "Roadmap - https://example.com/roadmap",
  ].join("\n"),
);

const invalidProtocol = parseProjectContextLinksText("Internal - ftp://example.com/file");
assert.equal(invalidProtocol.links.length, 0);
assert.match(invalidProtocol.errors[0] ?? "", /valid URL|http or https/);

const tooMany = parseProjectContextLinksText(
  Array.from({ length: PROJECT_CONTEXT_LINKS_MAX + 1 }, (_, index) => `https://example.com/${index}`).join("\n"),
);
assert.equal(tooMany.links.length, PROJECT_CONTEXT_LINKS_MAX);
assert.match(tooMany.errors[0] ?? "", /Only 20 links/);

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
const modal = read("apps/web/src/components/WebCreateProjectModal.tsx");
const modalHost = read("apps/web/src/components/WebProjectModalHost.tsx");
const controller = read("apps/web/src/controllers/useWebProjectUiController.ts");
const runtimeContextLoader = read("convex/runtimeTurnContext.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const gatewayUpdateMappedCloudProject = readExportedFunction(
  gateway,
  "updateMappedCloudProject",
);

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
assert.match(gateway, /contextLinks,/);
assert.match(gateway, /readProjectContextLinks/);
assert.match(
  gatewayUpdateMappedCloudProject,
  /\.\.\.\(typeof params\.instructions === "string" \? \{ instructions: params\.instructions \} : null\)/,
  "gateway update should preserve omitted instructions and clear only explicit empty strings",
);
assert.match(
  gatewayUpdateMappedCloudProject,
  /\.\.\.\(Array\.isArray\(params\.contextLinks\)[\s\S]*\? \{ contextLinks: normalizeProjectContextLinks\(params\.contextLinks\) \}[\s\S]*: null\)/,
  "gateway update should preserve omitted links and clear only explicit empty arrays",
);
assert.doesNotMatch(
  gatewayUpdateMappedCloudProject,
  /const contextLinks = Array\.isArray\(params\.contextLinks\)[\s\S]*: \[\]/,
  "gateway update must not coerce omitted contextLinks to an empty array",
);

assert.match(modal, /Project instructions/);
assert.match(modal, /Project links/);
assert.match(modal, /PROJECT_INSTRUCTIONS_MAX_CHARS/);
assert.match(modalHost, /projectInstructions=\{createModal\.projectInstructions\}/);
assert.match(modalHost, /projectLinksText=\{editModal\.projectLinksText\}/);
assert.match(controller, /parseProjectContextLinksText\(createProjectLinksText\)/);
assert.match(controller, /parseProjectContextLinksText\(editProjectLinksText\)/);
assert.match(controller, /instructions: createProjectInstructions\.trim\(\)/);
assert.match(controller, /contextLinks: parsedProjectLinks\.links/);

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
