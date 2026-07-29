import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

assert.equal(
  existsSync(join(root, "convex/thirdPartyMcpRetirement.ts")),
  false,
  "temporary third-party MCP retirement module must be removed",
);

const schema = read("convex/schema.ts");
const cleanup = read("convex/anonymousUserCleanup.ts");
for (const table of [
  "developerApps",
  "appConnections",
  "appOAuthStates",
  "appToolSnapshots",
  "communityAppMounts",
  "userPlatformAppMounts",
  "userPlatformAppMountSources",
]) {
  assert.doesNotMatch(
    schema,
    new RegExp(`\\b${table}: defineTable\\(`),
    `${table} must be removed from the schema`,
  );
}
assert.doesNotMatch(
  cleanup,
  /developerApps|appOAuthStates|userPlatformAppMounts|communityAppMounts/,
);

console.log("PASS: third-party MCP production retirement code and schema are gone");
