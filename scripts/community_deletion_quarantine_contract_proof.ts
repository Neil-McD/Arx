import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const lifecycle = read("convex/communityLifecycle.ts");
const facade = read("convex/community.ts");
const cognitionCleanup = read("convex/communityCognitionCleanup.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const controller = read("apps/web/src/controllers/useWebCommunityUiController.ts");
const modalHost = read("apps/web/src/components/WebCommunityModalHost.tsx");
const settings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const app = read("apps/web/src/App.tsx");
const baseCss = read("apps/web/src/base.css");
const blocker = "community_delete_lifecycle_migration_blocked";

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} must remain exported for cached clients`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const deleteMutation = exportedConstBlock(lifecycle, "deleteCommunity");

assert.match(deleteMutation, /resolveUserIdForAuthenticatedRequest/);
assert.match(deleteMutation, /requireCommunityOwner/);
assert.match(deleteMutation, /throw new ConvexError/);
assert.equal(
  (lifecycle.match(new RegExp(blocker, "g")) ?? []).length,
  1,
  "the backend must expose one deterministic community-deletion quarantine code",
);

for (const forbidden of [
  /\.collect\(/,
  /ctx\.db\.delete/,
  /ctx\.db\.patch/,
  /ctx\.db\.insert/,
  /ctx\.storage/,
  /ctx\.scheduler/,
  /ctx\.runMutation/,
  /ctx\.runAction/,
  /drainDeletedCommunityCognitionInternal/,
]) {
  assert.doesNotMatch(
    deleteMutation,
    forbidden,
    `the public deletion quarantine must contain no destructive or effectful executor: ${forbidden}`,
  );
}

assert.match(facade, /deleteCommunity as deleteCommunityImpl/);
assert.match(facade, /export const deleteCommunity = deleteCommunityImpl/);

assert.doesNotMatch(gateway, /export async function deleteCloudCommunity</);
assert.doesNotMatch(controller, /useCommunityDeleteController|openDeleteCommunityModal|deleteModal|isDeletingCommunity/);
assert.doesNotMatch(modalHost, /WebDeleteCommunityModal|deleteModal/);
assert.doesNotMatch(app, /openDeleteCommunityModal/);
assert.doesNotMatch(settings, /openDeleteCommunityModal|Permanently delete this community|>\s*Delete community\s*</);
assert.match(settings, /Community deletion is temporarily paused/);
assert.match(settings, /No community data will be changed from this screen/);
assert.doesNotMatch(baseCss, /delete-community-(?:btn|modal)/);
assert.equal(
  existsSync("shared/useCommunityDeleteController.ts"),
  false,
  "the first-party deletion controller must be removed",
);
assert.equal(
  existsSync("apps/web/src/components/WebDeleteCommunityModal.tsx"),
  false,
  "the first-party deletion modal must be removed",
);

assert.match(
  cognitionCleanup,
  /export const drainDeletedCommunityCognitionInternal = internalMutation/,
  "the bounded internal drain must remain for already-scheduled historical cleanup",
);
assert.doesNotMatch(
  lifecycle,
  /drainDeletedCommunityCognitionInternal|COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE/,
  "current public deletion must not create new cognition cleanup schedules",
);

console.log(
  "PASS: community deletion is an owner-gated, zero-effect quarantine with no first-party executor.",
);
