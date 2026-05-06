import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function main() {
  const operatorIntelligence = readText(
    new URL("../convex/operatorIntelligence.ts", import.meta.url),
  );
  const operatorDashboard = readText(
    new URL("../convex/operatorDashboard.ts", import.meta.url),
  );

  assert.ok(
    operatorIntelligence.includes("listOperatorDeveloperAppPolicyAuditInternal"),
    "operator intelligence must expose a developer app policy audit query",
  );
  assert.ok(
    operatorIntelligence.includes("resolveDiscoverAppCatalogConnectPolicy"),
    "developer app policy audit must use the server-authoritative catalog policy",
  );
  assert.ok(
    operatorIntelligence.includes('.query("developerApps")'),
    "developer app policy audit must scan developerApps",
  );
  assert.ok(
    operatorIntelligence.includes('.query("userPlatformAppMounts")') &&
      operatorIntelligence.includes('.query("communityAppMounts")'),
    "developer app policy audit must report user/community mount blast radius",
  );
  assert.ok(
    operatorDashboard.includes("listDeveloperAppPolicyAudit"),
    "operator dashboard must expose the read-only audit through an operator-gated query",
  );
  assert.ok(
    operatorDashboard.includes("requireOperatorAccess(ctx, args.authSubject)"),
    "developer app policy audit must require operator access",
  );
  assert.ok(
    !operatorIntelligence.includes("ctx.db.patch") &&
      !operatorIntelligence.includes("ctx.db.delete"),
    "developer app policy audit must remain read-only",
  );

  console.log(
    "PASS: developer app catalog policy audit is operator-gated and read-only.",
  );
}

main();
