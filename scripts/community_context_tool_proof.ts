import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildActiveCommunityContextToolPayload,
} from "../shared/communityContextTool.ts";
import {
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
} from "../shared/toolRegistry.ts";

const root = process.cwd();

const longAbout = `${"About detail. ".repeat(220)}TAIL_SHOULD_NOT_RENDER`;

const payload = buildActiveCommunityContextToolPayload({
  community_id: "community_internal_id_should_not_render",
  community_name: `${"Name ".repeat(40)}NAME_TAIL_SHOULD_NOT_RENDER`,
  community_slug: `${"slug-".repeat(40)}SLUG_TAIL_SHOULD_NOT_RENDER`,
  community_one_liner: `${"One liner detail. ".repeat(30)}ONE_LINER_TAIL_SHOULD_NOT_RENDER`,
  community_about: longAbout,
});

const serialized = JSON.stringify(payload);

assert.equal(payload.ok, true);
assert.equal(
  "community_id" in payload.active_community,
  false,
  "tool payload should not expose internal community ids",
);
assert.equal(
  serialized.includes("community_internal_id_should_not_render"),
  false,
  "tool payload should ignore unknown internal id input",
);
assert.equal(
  payload.active_community.about_excerpt?.includes("TAIL_SHOULD_NOT_RENDER"),
  false,
  "about excerpt should be bounded",
);
assert.equal(
  "workflow_prompt_excerpt" in payload.active_community,
  false,
  "tool payload should not duplicate always-on workflow prompt context",
);

assert.deepEqual(
  normalizeToolArguments("get_active_community_context", {
    ignored: "extra input",
  }),
  {},
  "active community context tool should not accept model-selected input",
);

const tools = buildResponsesApiFunctionTools(["get_active_community_context"]);
assert.equal(tools.length, 1);
assert.equal(tools[0]?.strict, true);
assert.equal(tools[0]?.parameters.type, "object");
assert.equal(tools[0]?.parameters.additionalProperties, false);
assert.deepEqual(tools[0]?.parameters.properties, {});

const httpDaytona = readFileSync(join(root, "convex/httpDaytona.ts"), "utf8");
const runtimeTurnResolution = readFileSync(
  join(root, "convex/runtimeTurnResolution.ts"),
  "utf8",
);
assert.match(
  runtimeTurnResolution,
  /"get_active_community_context"[\s\S]*"community_search"[\s\S]*"community_write"/,
  "community_tools should expose context before search/write",
);
assert.match(
  httpDaytona,
  /toolName === "get_active_community_context"/,
  "runtime executor should handle active community context tool",
);
assert.match(
  httpDaytona,
  /resolveRuntimeCommunityPromptContextInternal/,
  "runtime executor should reuse server-authoritative community context resolver",
);
assert.match(
  httpDaytona,
  /get_active_community_context requires an active community context/,
  "runtime executor should fail closed without active community",
);

console.log("community_context_tool_proof: ok");
