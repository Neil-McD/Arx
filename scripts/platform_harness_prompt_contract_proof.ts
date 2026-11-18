import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { LENS_TOOLS, talkToolNames } from "../shared/lens.ts";
import { getToolDefinition } from "../shared/toolRegistry.ts";
import {
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngine,
  getRuntimeEngineAccessLevel,
} from "../shared/runtimeEngine.ts";

const read = (path: string) => readFileSync(path, "utf8");
// Every signed-in member's private talk has the same tools, from its lens;
// no plan, tier or capability family changes them.
assert.equal(existsSync("shared/canonicalGateEngine.ts"), false, "capability families stay deleted");
// Reading and the web for everyone; acting is one named tool per action, by
// the person's role in the community and nothing else (shared/lens.ts).
assert.deepEqual([...LENS_TOOLS.member_private], ["polynet_list", "polynet_read", "polynet_search", "web_research"]);
assert.deepEqual([...LENS_TOOLS.builder_private], [...LENS_TOOLS.member_private]);
assert.equal(talkToolNames({ lens: "member_private", relation: "member" }).includes("polynet_post"), true);
assert.equal(talkToolNames({ lens: "member_private", relation: "member" }).includes("polynet_create_event"), false);
assert.equal(talkToolNames({ lens: "builder_private", relation: "owner" }).includes("polynet_create_event"), true);
for (const general of ["polynet_write", "polynet_call"]) {
  assert.equal(talkToolNames({ lens: "builder_private", relation: "owner" }).includes(general), false, `${general} is given to no AI`);
}
assert.equal(getRuntimeEngineAccessLevel(RUNTIME_ENGINE_POLYNET), "included");
assert.equal(canUseRuntimeEngine({ engine: RUNTIME_ENGINE_POLYNET }), true);

const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts") + read("convex/agentTools.ts");
const docs = read("docs/auth-money-access-matrix.md");

assert.doesNotMatch(runtimePrompt, /RuntimeAccountPlan|Account plan:|Premium-only|Billing to upgrade/);
assert.match(
  runtimePrompt,
  /- events\/ : what is coming up\. Say times from starts_at_zoned\./,
  "the guide must say event times as the server zoned them instead of calculating them from UTC",
);
assert.match(
  getToolDefinition("polynet_list").description,
  /With a next_cursor there is more[\s\S]*use total_count for "how many"/,
  "the guide must distinguish a bounded member page from the complete authorized roster",
);
assert.doesNotMatch(runtimeAgentLoop, /reserveCreditsInternal|settleCreditsInternal/);
assert.match(
  runtimeAgentLoop,
  /authorizeFounderPaidToolFundingSession[\s\S]*settleFounderPaidToolFundingSession/,
);
assert.match(docs, /One backend resolver composes them/);
assert.match(docs, /Each active Builder cycle includes up to `\$20` raw GPT 5\.6 Luna model cost/);

console.log("platform_harness_prompt_contract_proof: ok");
