import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const account = read("convex/account.ts");
const accountGateway = read("shared/cloudAccountGateway.ts");
const quarantineContract = read(
  "docs/destructive-lifecycle-quarantine-contract-v1.md",
);
const quarantineCode = "account_delete_lifecycle_migration_blocked";

assert.match(
  account,
  /export const deleteOwnAccount = mutation\(\{/,
  "the cached-client account deletion identity must remain present",
);
assert.match(
  account,
  /args:\s*\{\s*authSubject: v\.optional\(v\.string\(\)\),?\s*\}/,
  "the cached-client account deletion arguments must remain compatible",
);
assert.match(
  accountGateway,
  /client\.mutation\("account:deleteOwnAccount" as any,\s*\{\s*authSubject,\s*\}\)/,
  "the current client must continue using the cached public mutation identity",
);
assert.match(
  account,
  /await resolveAuthenticatedActor\(\{[\s\S]*?authSubject: args\.authSubject \?\? null,[\s\S]*?\}\);[\s\S]*?throw new ConvexError\(\{/,
  "account deletion must authenticate an existing actor before returning the quarantine error",
);
assert.doesNotMatch(
  account,
  /ensureAuthenticatedActor/,
  "a deletion attempt must never create or relink an account as an authentication side effect",
);
assert.equal(
  account.match(new RegExp(quarantineCode, "g"))?.length,
  1,
  "account deletion must use one stable quarantine code",
);
assert.match(
  account,
  /code: ACCOUNT_DELETION_QUARANTINE_CODE,\s*reason: ACCOUNT_DELETION_QUARANTINE_CODE,/,
  "the quarantine must expose structured client-visible code and reason fields",
);
assert.equal(
  account.match(/export const /g)?.length,
  1,
  "the account module must expose only the retained cached-client mutation",
);
assert.doesNotMatch(
  account,
  /ctx\.(?:db|storage|scheduler)|\.(?:insert|patch|replace|delete)\(|runMutation|runAction|recordCriticalAudit|fetch\(|Date\.now|Math\.random/,
  "quarantined account deletion must have no database, storage, scheduler, provider, audit, or nondeterministic effects",
);
assert.ok(
  quarantineContract.includes(quarantineCode) &&
    quarantineContract.includes("community_delete_lifecycle_migration_blocked") &&
    quarantineContract.includes("## Zero-effect invariant"),
  "the active documentation must record both stable quarantine codes and the zero-effect invariant",
);

console.log(
  "PASS: account deletion preserves the cached ABI and fails closed with zero effects.",
);
