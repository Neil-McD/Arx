import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const inspector = read("convex/workspaceInspector.ts");
const packageJson = read("package.json");

assert.match(
  schema,
  /workspaceFilePreviewSnapshots: defineTable\(\{[\s\S]*projectId: v\.id\("cloudProjects"\)[\s\S]*ownerId: v\.id\("users"\)[\s\S]*path: v\.string\(\)[\s\S]*previewKind: v\.union\(v\.literal\("text"\), v\.literal\("directory"\), v\.literal\("unsupported"\)\)[\s\S]*checkedAt: v\.number\(\)[\s\S]*\.index\("by_project_path", \["projectId", "path"\]\)/,
  "workspace file previews must have a project/path keyed Convex cache",
);

assert.match(
  inspector,
  /getWorkspaceFilePreviewSnapshotInternal[\s\S]*query\("workspaceFilePreviewSnapshots"\)[\s\S]*withIndex\("by_project_path"[\s\S]*String\(snapshot\.ownerId\) !== String\(args\.ownerId\)/,
  "file preview cache reads must be scoped by project/path and owner",
);

assert.match(
  inspector,
  /upsertWorkspaceFilePreviewSnapshotInternal[\s\S]*query\("workspaceFilePreviewSnapshots"\)[\s\S]*withIndex\("by_project_path"[\s\S]*ctx\.db\.patch\(existing\._id[\s\S]*ctx\.db\.insert\("workspaceFilePreviewSnapshots"/,
  "file preview cache writes must upsert a single row per project/path",
);

const readActionIndex = inspector.indexOf("export const readWorkspaceFilePreview = action");
const providerReadIndex = inspector.indexOf("async function readBlaxelInspectorFilePreview");
assert.ok(readActionIndex > providerReadIndex, "file preview action must be below provider reader");
const readAction = inspector.slice(readActionIndex);

assert.match(
  readAction,
  /resolveInspectorProject\([\s\S]*getWorkspaceFilePreviewSnapshotInternal[\s\S]*workspaceDirectorySnapshotInvalidatedAt[\s\S]*if \(!stale\) return normalizeCachedWorkspaceFilePreviewSnapshot\(cached\)[\s\S]*readBlaxelInspectorFilePreview/,
  "file preview action must check cache and project-level invalidation before waking Blaxel",
);

assert.ok(
  readAction.indexOf("getWorkspaceFilePreviewSnapshotInternal") <
    readAction.indexOf("readBlaxelInspectorFilePreview"),
  "cache lookup must happen before provider file preview read",
);

const providerReader = inspector.slice(providerReadIndex, readActionIndex);
assert.match(
  providerReader,
  /upsertWorkspaceFilePreviewSnapshotInternal[\s\S]*previewKind:\s*preview\.previewKind === "text"[\s\S]*readBlaxelWorkspaceFile/,
  "fresh provider previews must cache text-capable reads",
);

assert.match(
  providerReader,
  /cachePreview\(\{[\s\S]*previewKind: "unsupported"[\s\S]*\}\)/,
  "fresh provider previews must cache unsupported responses",
);

assert.match(
  providerReader,
  /cachePreview\(\{[\s\S]*previewKind: "text"[\s\S]*\}\)/,
  "fresh provider previews must cache text responses",
);

assert.match(
  inspector,
  /normalizeCachedWorkspaceFilePreviewSnapshot[\s\S]*previewKind === "text"[\s\S]*previewKind === "directory"[\s\S]*previewKind: "unsupported"/,
  "cached preview rows must normalize back into the same preview response shapes",
);

assert.match(
  packageJson,
  /"check:workspace-file-preview-cache-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_file_preview_cache_proof\.ts"/,
  "package.json must expose the file preview cache proof",
);

console.log("workspace_file_preview_cache_proof: ok");
