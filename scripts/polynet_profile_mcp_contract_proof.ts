import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POLYNET_PROFILE_CONFIRM_MAX_FACTS,
  buildPolynetProfileFactBatchKey,
  normalizePolynetProfileConfirmInput,
} from "../shared/polynetProfileMcpContract.ts";
import {
  memberFactVisibleToLens,
  type MemberFactLike,
} from "../shared/memberOntology.ts";
import { getPolynetMcpToolDefinition } from "../shared/polynetMcp.ts";
import {
  parsePolynetSemanticRepositoryPath,
} from "../shared/polynetSemanticRepositoryContract.ts";

const root = process.cwd();
const read = (path: string): string =>
  readFileSync(join(root, path), "utf8");

const normalized = normalizePolynetProfileConfirmInput({
  confirm_marker: " profile-setup-2026-07-17 ",
  facts: [
    { kind: "goal", body: "  Build   a member-led research community. " },
    { kind: "skill", body: "Community design" },
  ],
});
assert.deepEqual(normalized, {
  ok: true,
  input: {
    confirmMarker: "profile-setup-2026-07-17",
    facts: [
      { kind: "goal", body: "Build a member-led research community." },
      { kind: "skill", body: "Community design" },
    ],
  },
});
assert.equal(
  normalizePolynetProfileConfirmInput({
    confirm_marker: "x",
    facts: Array.from(
      { length: POLYNET_PROFILE_CONFIRM_MAX_FACTS + 1 },
      (_, index) => ({ kind: "goal", body: `Goal ${index}` }),
    ),
  }).ok,
  false,
);
const approvedBatch = [
  { kind: "goal", body: "Ship the alpha" },
  { kind: "skill", body: "Community design" },
];
assert.equal(
  buildPolynetProfileFactBatchKey(approvedBatch),
  buildPolynetProfileFactBatchKey([...approvedBatch].reverse()),
);

const approvedPlatformFact: MemberFactLike = {
  communityId: null,
  kind: "goal",
  body: "Ship the alpha",
  provenance: "stated_interview",
  consentState: "approved",
};
assert.equal(
  memberFactVisibleToLens(approvedPlatformFact, { kind: "external_profile" }),
  true,
);
assert.equal(
  memberFactVisibleToLens(
    { ...approvedPlatformFact, communityId: "community-a" },
    { kind: "external_profile" },
  ),
  false,
);
assert.equal(
  memberFactVisibleToLens(
    { ...approvedPlatformFact, consentState: "pending" },
    { kind: "external_profile" },
  ),
  false,
);

const mcp = read("shared/polynetMcp.ts");
const http = read("convex/httpMcp.ts");
const setup = read("shared/polynetMcpSetup.ts");
const executor = read("convex/polynetCanonicalExecutor.ts");
const ontology = read("convex/memberOntology.ts");

assert.equal(getPolynetMcpToolDefinition("polynet_get_my_profile"), null);
assert.equal(
  getPolynetMcpToolDefinition("polynet_confirm_my_profile_facts"),
  null,
);
for (const source of [mcp, http, setup]) {
  assert.doesNotMatch(
    source,
    /polynet_get_my_profile|polynet_confirm_my_profile_facts/,
    "retired profile-specific MCP tools must not remain public or appear in setup",
  );
}
assert.match(setup, /polynet_list/);
assert.match(setup, /path: \\"\/\\"/);
assert.deepEqual(parsePolynetSemanticRepositoryPath("/users/me/profile.md"), {
  ok: true,
  kind: "user_profile",
  path: "/users/me/profile.md",
  userSelector: "me",
});
assert.match(executor, /community\.semantic\.read/);

console.log("polynet_profile_mcp_contract_proof: ok");
