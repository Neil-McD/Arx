import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const convexCommunity = read("convex/community.ts");
const convexResources = read("convex/communityResources.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const resourceUiController = read("apps/web/src/controllers/useWebCommunityResourceUiController.ts");
const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const deleteModuleModal = read("apps/web/src/components/WebDeleteResourceModuleModal.tsx");

assert.match(
  convexResources,
  /export const deleteCommunityResourceModule = mutation\(/,
  "backend must export a real module delete mutation",
);

assert.match(
  convexResources,
  /requireCommunityManager[\s\S]*communityId: module\.communityId[\s\S]*query\("communityResources"[\s\S]*withIndex\("by_community_module"[\s\S]*moduleId", module\._id[\s\S]*ctx\.db\.patch\(resource\._id[\s\S]*moduleId: undefined[\s\S]*upsertArchiveDocumentForResource/,
  "module delete must require manager access, move resources out of the module, and refresh archive docs",
);

assert.match(
  convexResources,
  /if \(module\.bannerStorageId\) \{[\s\S]*maybeDeleteStorageAsset\(ctx, module\.bannerStorageId\);[\s\S]*ctx\.db\.delete\(module\._id/,
  "module delete must clean up module banner storage before deleting the module row",
);

assert.match(
  convexCommunity,
  /deleteCommunityResourceModule as deleteCommunityResourceModuleImpl[\s\S]*export const deleteCommunityResourceModule = deleteCommunityResourceModuleImpl;/,
  "community facade must expose module deletion to the existing gateway mutation name",
);

assert.match(
  gateway,
  /client\.mutation\("community:deleteCommunityResourceModule" as any/,
  "admin gateway must call the canonical module delete mutation",
);

assert.doesNotMatch(
  resourceUiController,
  /window\.confirm/,
  "module deletion must not use browser confirm dialogs",
);

assert.match(
  resourceUiController,
  /pendingDeleteResourceModuleId[\s\S]*moduleDeleteNameInput[\s\S]*moduleDeleteWordInput[\s\S]*resourceModuleDeleteModalProps/,
  "resource UI controller must own a canonical typed module delete confirmation state",
);

assert.match(
  deleteModuleModal,
  /moduleNameInput\.trim\(\) === normalizedModuleName[\s\S]*deleteInput\.trim\(\) === "delete"[\s\S]*disabled=\{isDeleting \|\| !canDelete\}/,
  "module delete modal must require the module name and delete confirmation before enabling deletion",
);

assert.match(
  secondaryPanels,
  /WebDeleteResourceModuleModal[\s\S]*resourceModuleDeleteModal/,
  "community secondary panels must render the canonical module delete modal",
);

console.log("community_resource_module_delete_contract_proof: ok");
