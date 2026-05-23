import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateCommunityWikiArchitectProposal,
  type CommunityWikiArchitectProposalValidationInput,
} from "../shared/communityWikiArchitectProposal.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const validatorSource = read("shared/communityWikiArchitectProposal.ts");

assert.match(
  packageJson,
  /"check:community-wiki-architect-proposal-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_wiki_architect_proposal_contract_proof\.ts"/,
  "wiki architect proposal proof should be wired into package scripts",
);
assert.match(
  validatorSource,
  /getCommunityResourceBuilderModulePageKey/,
  "validator should use the shared module/page normalization key",
);
assert.match(
  validatorSource,
  /source_dependencies|source_dependencies_added/,
  "validator should reject plural lineage fields",
);

const baseInput: Omit<CommunityWikiArchitectProposalValidationInput, "proposal"> = {
  existingModules: [
    { id: "mod_start", name: "Start Here" },
    { id: "mod_playbooks", name: "Playbooks" },
  ],
  existingPages: [
    {
      id: "page_welcome",
      title: "Welcome",
      moduleName: "Start Here",
      status: "draft",
      updatedAt: 1000,
      sourceResourceId: null,
    },
    {
      id: "page_published",
      title: "Published Guide",
      moduleName: "Playbooks",
      status: "published",
      updatedAt: 2000,
      sourceResourceId: "src_1",
    },
    {
      id: "page_sourced_draft",
      title: "Sourced Draft",
      moduleName: "Playbooks",
      status: "draft",
      updatedAt: 3000,
      sourceResourceId: "src_1",
    },
    {
      id: "page_overview_start",
      title: "Overview",
      moduleName: "Start Here",
      status: "draft",
      updatedAt: 4000,
      sourceResourceId: null,
    },
    {
      id: "page_overview_playbooks",
      title: "Overview",
      moduleName: "Playbooks",
      status: "draft",
      updatedAt: 5000,
      sourceResourceId: null,
    },
  ],
  sourceInbox: [
    { id: "src_1", title: "Pricing Doc", status: "review" },
    { id: "src_2", title: "Outreach Notes", status: "review" },
    { id: "src_3", title: "Interview", status: "review" },
  ],
};

const validProposal = {
  run_type: "rerun",
  modules_created: [{ name: "Methodology", purpose: "Shared concepts and vocabulary for the community." }],
  modules_existing: ["Start Here", "Playbooks"],
  drafts_created: [
    {
      title: "Pricing Playbook",
      module: "Playbooks",
      purpose: "A practical path for using the pricing source material.",
      source_resource_id: "src_1",
    },
    {
      title: "First Steps",
      module: "Start Here",
      purpose: "The first actions a new member should take.",
      source_resource_id: null,
    },
  ],
  drafts_updated: [
    {
      resource_id: "page_welcome",
      expected_updated_at: 1000,
      title: "Welcome",
      change: "attached primary source",
      source_resource_id: "src_2",
    },
  ],
  pages_left_unchanged: [{ title: "Published Guide", module: "Playbooks", reason: "already covers this topic" }],
  proposed_changes_to_existing: [
    { title: "Published Guide", module: "Playbooks", status: "published", suggestion: "Move under Playbooks later." },
  ],
  sources_assigned: ["src_1", "src_2"],
  sources_unassigned: [{ id: "src_3", reason: "interesting but too weak for a standalone page" }],
  gaps: [{ title: "How we think", module: "Methodology", needed_source: "A builder principles note." }],
  deferred: [{ title: "Interview Notes", module: "Reference Library", reason: "lower leverage for first pass" }],
  recommended_next_uploads: ["Upload a short principles note."],
  needs_from_builder: [],
};

const validResult = validateCommunityWikiArchitectProposal({
  ...baseInput,
  proposal: validProposal,
});
assert.equal(validResult.ok, true, JSON.stringify(validResult.errors, null, 2));

const validThinFirstRun = validateCommunityWikiArchitectProposal({
  existingModules: [],
  existingPages: [],
  sourceInbox: [],
  proposal: {
    run_type: "first",
    modules_created: [{ name: "Start Here", purpose: "Orient new members before the wiki has sources." }],
    modules_existing: [],
    drafts_created: [
      {
        title: "Welcome",
        module: "Start Here",
        purpose: "A simple orientation page for new members.",
        source_resource_id: null,
      },
    ],
    drafts_updated: [],
    pages_left_unchanged: [],
    proposed_changes_to_existing: [],
    sources_assigned: [],
    sources_unassigned: [],
    gaps: [],
    deferred: [],
    recommended_next_uploads: [],
    needs_from_builder: ["Add community context before deeper scaffolding."],
  },
});
assert.equal(validThinFirstRun.ok, true, JSON.stringify(validThinFirstRun.errors, null, 2));

function expectInvalid(proposal: unknown, expectedPath: string, expectedMessagePattern: RegExp): void {
  const result = validateCommunityWikiArchitectProposal({
    ...baseInput,
    proposal,
  });
  assert.equal(result.ok, false, "expected proposal to be invalid");
  assert.ok(
    result.errors.some(
      (error) => error.path === expectedPath && expectedMessagePattern.test(error.message),
    ),
    `expected error at ${expectedPath} matching ${expectedMessagePattern}, got ${JSON.stringify(result.errors)}`,
  );
}

expectInvalid(null, "$", /JSON object/);

expectInvalid(
  {
    ...validProposal,
    drafts_created: undefined,
  },
  "$.drafts_created",
  /Expected an array/,
);

expectInvalid(
  { ...validProposal, run_type: "first" },
  "$.run_type",
  /cannot be first/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: Array.from({ length: 13 }, (_, index) => ({
      title: `Draft ${index}`,
      module: "Playbooks",
      purpose: "A valid purpose.",
      source_resource_id: "src_1",
    })),
  },
  "$.drafts_created",
  /at most 12/,
);

expectInvalid(
  {
    ...validProposal,
    modules_created: [{ name: "Methodology", purpose: "One" }, { name: " methodology ", purpose: "Two" }],
  },
  "$.modules_created[1].name",
  /Duplicate/,
);

expectInvalid(
  {
    ...validProposal,
    modules_created: [{ name: " Start Here ", purpose: "Already exists." }],
  },
  "$.modules_created[0].name",
  /already exists/,
);

expectInvalid(
  {
    ...validProposal,
    modules_existing: ["Does Not Exist"],
  },
  "$.modules_existing[0]",
  /does not exist/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Unsupported Page",
        module: "Unknown Module",
        purpose: "A valid purpose.",
        source_resource_id: "src_1",
      },
    ],
  },
  "$.drafts_created[0].module",
  /existing or proposed module/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Published Guide",
        module: "Playbooks",
        purpose: "A valid purpose.",
        source_resource_id: "src_1",
      },
    ],
  },
  "$.drafts_created[0].title",
  /already exists/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Unbacked Page",
        module: "Playbooks",
        purpose: "A valid purpose.",
        source_resource_id: null,
      },
    ],
  },
  "$.drafts_created[0].source_resource_id",
  /scaffold-whitelist/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Bad Source",
        module: "Playbooks",
        purpose: "A valid purpose.",
        source_resource_id: "src_missing",
      },
    ],
  },
  "$.drafts_created[0].source_resource_id",
  /does not exist/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Body Leak",
        module: "Playbooks",
        purpose: "A valid purpose.",
        source_resource_id: "src_1",
        body_md: "Do not allow body text.",
      },
    ],
  },
  "$.drafts_created[0].body_md",
  /must not include/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_created: [
      {
        title: "Plural Lineage",
        module: "Playbooks",
        purpose: "A valid purpose.",
        source_dependencies: ["src_1"],
      },
    ],
  },
  "$.drafts_created[0].source_dependencies",
  /singular source_resource_id/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_updated: [
      {
        resource_id: "page_published",
        expected_updated_at: 2000,
        title: "Published Guide",
        change: "attached primary source",
        source_resource_id: "src_2",
      },
    ],
  },
  "$.drafts_updated[0].resource_id",
  /existing draft/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_updated: [
      {
        resource_id: "page_welcome",
        expected_updated_at: 999,
        title: "Welcome",
        change: "attached primary source",
        source_resource_id: "src_2",
      },
    ],
  },
  "$.drafts_updated[0].expected_updated_at",
  /must match/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_updated: [
      {
        resource_id: "page_welcome",
        expected_updated_at: 1000,
        title: "Wrong Title",
        change: "attached primary source",
        source_resource_id: "src_2",
      },
    ],
  },
  "$.drafts_updated[0].title",
  /must match the target page/,
);

expectInvalid(
  {
    ...validProposal,
    drafts_updated: [
      {
        resource_id: "page_sourced_draft",
        expected_updated_at: 3000,
        title: "Sourced Draft",
        change: "attached primary source",
        source_resource_id: "src_2",
      },
    ],
  },
  "$.drafts_updated[0].resource_id",
  /already has source_resource_id/,
);

expectInvalid(
  {
    ...validProposal,
    sources_assigned: ["src_1"],
  },
  "$.sources_assigned",
  /src_2.*missing/,
);

expectInvalid(
  {
    ...validProposal,
    sources_unassigned: [{ id: "src_1", reason: "contradiction" }],
  },
  "$.sources_unassigned[0].id",
  /both assigned and unassigned/,
);

expectInvalid(
  {
    ...validProposal,
    pages_left_unchanged: [{ title: "Missing Page", module: "Playbooks", reason: "claimed unchanged" }],
  },
  "$.pages_left_unchanged[0].title",
  /does not exist/,
);

expectInvalid(
  {
    ...validProposal,
    pages_left_unchanged: [{ title: "Published Guide", reason: "claimed unchanged" }],
  },
  "$.pages_left_unchanged[0].module",
  /module is required/i,
);

expectInvalid(
  {
    ...validProposal,
    pages_left_unchanged: [{ title: "Overview", module: "Methodology", reason: "wrong module" }],
  },
  "$.pages_left_unchanged[0].title",
  /does not exist in that module/,
);

expectInvalid(
  {
    ...validProposal,
    proposed_changes_to_existing: [
      { title: "Missing Page", module: "Playbooks", status: "published", suggestion: "Move it later." },
    ],
  },
  "$.proposed_changes_to_existing[0].title",
  /does not exist/,
);

expectInvalid(
  {
    ...validProposal,
    proposed_changes_to_existing: [
      { title: "Published Guide", status: "published", suggestion: "Move it later." },
    ],
  },
  "$.proposed_changes_to_existing[0].module",
  /Module is required/,
);

expectInvalid(
  {
    ...validProposal,
    proposed_changes_to_existing: [
      { title: "Overview", module: "Methodology", status: "draft", suggestion: "Move it later." },
    ],
  },
  "$.proposed_changes_to_existing[0].title",
  /does not exist in that module/,
);

expectInvalid(
  {
    ...validProposal,
    gaps: ["bad gap shape"],
  },
  "$.gaps[0]",
  /Expected an object/,
);

expectInvalid(
  {
    ...validProposal,
    gaps: [{ title: "Unsupported Gap", module: "Reference Library", needed_source: "A source." }],
  },
  "$.gaps[0].module",
  /existing or proposed module/,
);

expectInvalid(
  {
    ...validProposal,
    recommended_next_uploads: [{ bad: "shape" }],
  },
  "$.recommended_next_uploads[0]",
  /non-empty string/,
);

console.log("community_wiki_architect_proposal_contract_proof: ok");
