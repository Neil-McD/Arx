import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const promptSource = read("shared/communityWikiArchitectPrompt.ts");

assert.match(
  packageJson,
  /"check:community-wiki-architect-prompt-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_wiki_architect_prompt_contract_proof\.ts"/,
  "wiki architect prompt proof should be wired into package scripts",
);

assert.match(
  promptSource,
  /export const COMMUNITY_WIKI_ARCHITECT_MAX_DRAFTS = 12/,
  "architect draft budget should be explicit",
);
assert.match(
  promptSource,
  /COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES/,
  "architect defaults should reuse builder default modules",
);
assert.match(
  promptSource,
  /COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES/,
  "architect scaffold whitelist should reuse builder scaffold titles",
);

for (const moduleName of ["Start Here", "Methodology", "Playbooks"] as const) {
  assert.match(promptSource, new RegExp(moduleName), `prompt should mention ${moduleName}`);
}

assert.match(
  promptSource,
  /COMMUNITY_WIKI_ARCHITECT_SCAFFOLD_ONLY_TITLES\.map/,
  "prompt should render every scaffold-only title from the shared whitelist",
);

assert.match(
  promptSource,
  /You do NOT write page bodies/,
  "architect must not write page bodies",
);
assert.match(
  promptSource,
  /You do NOT summarize sources/,
  "architect must not summarize source material",
);
assert.match(
  promptSource,
  /TARGET END STATE[\s\S]*not a pile of source material in Unsorted[\s\S]*Every visible ready source without assigned_pages must be[\s\S]*accounted for/,
  "architect prompt should define the organized Resources end state",
);
assert.match(
  promptSource,
  /Use deferred for future page ideas, not as a replacement for source-id[\s\S]*accounting/,
  "architect prompt should keep exact source accounting in source-id fields",
);
assert.match(
  promptSource,
  /Return a proposed changeset only/,
  "architect should return proposals only",
);
assert.match(
  promptSource,
  /Do not write resources/,
  "architect should not write before builder approval",
);
assert.match(
  promptSource,
  /Do not call write_resource or edit_resource/,
  "architect prompt should block direct write tool use",
);
assert.match(
  promptSource,
  /builder confirms before writes are committed/,
  "builder approval must be required before writes",
);
assert.match(
  promptSource,
  /New page proposals are drafts inside their parent module/,
  "new page proposals must be draft-only",
);
assert.match(
  promptSource,
  /You may not set module_status to "live"/,
  "architect must not make modules live",
);
assert.match(
  promptSource,
  /You may not edit a page inside a live module without builder confirmation/,
  "architect must not edit live module pages without builder confirmation",
);
assert.match(
  promptSource,
  /source_resource_id: one source-inbox id, or null only if the page is on the scaffold-only whitelist/,
  "single-source lineage rule should be explicit",
);
assert.match(
  promptSource,
  /Any other page without source_resource_id must be filed as a gap/,
  "non-whitelisted source-free pages should become gaps",
);
assert.match(
  promptSource,
  /PolyNet currently stores one primary source per draft page/,
  "architect prompt should match the current singular sourceResourceId data model",
);
assert.match(
  promptSource,
  /choose the strongest primary source for source_resource_id/,
  "architect should choose a primary source when multiple sources fit",
);
assert.match(
  promptSource,
  /THIN-CONTEXT RULE/,
  "thin-context fallback should be present",
);
assert.match(
  promptSource,
  /CONTEXT WINDOW RULE/,
  "truncated context guardrail should be present",
);
assert.match(
  promptSource,
  /pages_truncated[\s\S]*do NOT propose new draft pages[\s\S]*sources_omitted[\s\S]*may still propose drafts[\s\S]*visible source IDs[\s\S]*visible_source_ids/,
  "architect should block writes on truncated pages while allowing bounded visible-source drafts",
);
assert.match(
  promptSource,
  /Prefer unassigned visible source-inbox items before already-assigned source-inbox items/,
  "architect should prefer unused visible sources when budgeting draft proposals",
);
assert.match(
  promptSource,
  /single\s+"Start Here"\s+module with one\s+"Welcome"\s+page/,
  "thin-context fallback should be small",
);
assert.match(
  promptSource,
  /thin community profile should block only[\s\S]*source-less guessing[\s\S]*organize source-backed drafts/,
  "thin profile should not block source-backed organization",
);
assert.match(
  promptSource,
  /classification heuristics[\s\S]*Start Here[\s\S]*Methodology[\s\S]*Playbooks[\s\S]*Reference Library/,
  "architect prompt should define module classification heuristics",
);
assert.match(
  promptSource,
  /sources_assigned must contain only sources you used in drafts_created or drafts_updated/,
  "architect prompt should prevent silent assigned source claims",
);
assert.match(
  promptSource,
  /Propose at most \$\{COMMUNITY_WIKI_ARCHITECT_MAX_DRAFTS\} draft pages per run/,
  "prompt should enforce the draft budget through the shared constant",
);
assert.match(
  promptSource,
  /Return a single JSON object/,
  "prompt should require a single JSON object",
);

for (const outputKey of [
  "run_type",
  "modules_created",
  "modules_existing",
  "drafts_created",
  "drafts_updated",
  "pages_left_unchanged",
  "proposed_changes_to_existing",
  "sources_assigned",
  "sources_unassigned",
  "gaps",
  "deferred",
  "recommended_next_uploads",
  "needs_from_builder",
] as const) {
  assert.match(promptSource, new RegExp(`"${outputKey}"`), `review summary should include ${outputKey}`);
}

for (const nestedKey of [
  "source_resource_id",
  "resource_id",
  "expected_updated_at",
  "module",
] as const) {
  assert.match(promptSource, new RegExp(`"${nestedKey}"`), `review summary should include ${nestedKey}`);
}

assert.doesNotMatch(
  promptSource,
  /source_dependencies|source_dependencies_added/,
  "architect proposal should not expose plural source dependency fields while DB lineage is singular",
);

assert.doesNotMatch(
  promptSource,
  /Apply via write_resource|Apply via write|Apply via edit_resource|Apply via edit/,
  "prompt should not contain the old direct-apply instruction",
);

console.log("community_wiki_architect_prompt_contract_proof: ok");
