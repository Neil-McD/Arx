import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "convex/communityInteractionAttachmentMigration.ts"),
  "utf8",
);
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const residueMap = readFileSync(
  join(root, "docs/community-interaction-migration-residue-map.md"),
  "utf8",
);

assert.match(
  packageJson,
  /"check:community-interaction-attachment-migration-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_attachment_migration_contract_proof\.ts"/,
  "package scripts should expose the attachment migration proof",
);
assert.match(
  migration,
  /export const inspectLegacyAttachmentStatePageInternal = internalQuery\(/,
  "attachment migration audit must remain an internal read-only query",
);
assert.doesNotMatch(
  migration,
  /internalMutation|ctx\.db\.(?:insert|patch|replace|delete)/,
  "the first attachment migration slice must not mutate stored data",
);
assert.match(
  migration,
  /MAX_AUDIT_PAGE_SIZE = 50[\s\S]*maximumRowsRead: numItems[\s\S]*query\("communityInteractionLegacyChatLinks"\)[\s\S]*\.paginate\(boundedPaginationOpts\(args\.paginationOpts\)\)/,
  "legacy-link traversal must be paginated and bounded",
);
assert.match(
  migration,
  /readLegacyInteractionAttachmentPayloads\(message\)[\s\S]*normalizeInteractionAttachmentInputs\(rawLegacyAttachments\)/,
  "the audit must reuse canonical legacy attachment normalization",
);
assert.match(
  migration,
  /MAX_LEGACY_INTERACTION_ATTACHMENTS[\s\S]*query\("communityInteractionAttachments" as any\)[\s\S]*"by_root" : "by_reply"[\s\S]*\.take\(MAX_LEGACY_INTERACTION_ATTACHMENTS \+ 1\)/,
  "canonical attachment checks must use bounded target indexes",
);
for (const classification of [
  "missing_legacy_message",
  "invalid_target_link",
  "missing_canonical_target",
  "community_mismatch",
  "no_migratable_legacy_attachments",
  "canonical_attachment_overflow",
  "canonical_owned",
  "blocked_by_non_uploaded_canonical_rows",
  "pending_backfill",
]) {
  assert.ok(
    migration.includes(`"${classification}"`),
    `audit must report ${classification} explicitly`,
  );
}
assert.match(
  migration,
  /samples\.length < MAX_AUDIT_SAMPLES_PER_PAGE[\s\S]*link_id:[\s\S]*message_id:[\s\S]*target_id:/,
  "operator samples must stay bounded and identify only the affected migration rows",
);
for (const marker of [
  "communityInteractionAttachmentMigration:inspectLegacyAttachmentStatePageInternal",
  "bounded, read-only",
  "`pending_backfill`",
  "`blocked_by_non_uploaded_canonical_rows`",
]) {
  assert.ok(
    residueMap.includes(marker),
    `residue map must document attachment audit marker: ${marker}`,
  );
}

console.log("community_interaction_attachment_migration_contract_proof: ok");
