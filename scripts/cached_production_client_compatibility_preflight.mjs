import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const contract = JSON.parse(
  readFileSync(
    "shared/contracts/cached_production_client_compatibility_v1.json",
    "utf8",
  ),
);

function functionSpec(args) {
  const result = spawnSync("npx", ["convex", "function-spec", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "function_spec_failed"),
    );
  }
  return JSON.parse(result.stdout).functions.filter((entry) => entry.identifier);
}

function operationMap(functions) {
  return new Map(
    functions.map((entry) => [
      String(entry.identifier).replace(/\.js:/, ":"),
      entry,
    ]),
  );
}

function valueEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertOldArgsAccepted(oldArgs, candidateArgs, operation) {
  assert.equal(oldArgs?.type, "object", `${operation} old args must be object`);
  assert.equal(
    candidateArgs?.type,
    "object",
    `${operation} staged args must be object`,
  );
  const oldFields = oldArgs.value ?? {};
  const candidateFields = candidateArgs.value ?? {};
  for (const [field, oldDefinition] of Object.entries(oldFields)) {
    const candidateDefinition = candidateFields[field];
    assert.ok(candidateDefinition, `${operation} lost argument ${field}`);
    assert.equal(
      valueEqual(oldDefinition.fieldType, candidateDefinition.fieldType),
      true,
      `${operation} changed validator for ${field}`,
    );
    if (oldDefinition.optional) {
      assert.equal(
        candidateDefinition.optional,
        true,
        `${operation} made optional argument ${field} required`,
      );
    }
  }
  for (const [field, candidateDefinition] of Object.entries(candidateFields)) {
    if (oldFields[field]) continue;
    assert.equal(
      candidateDefinition.optional,
      true,
      `${operation} added required argument ${field}`,
    );
  }
}

const versionResponse = await fetch(
  new URL("/version.json", contract.production_origin),
);
assert.equal(versionResponse.ok, true, "production version marker unavailable");
const version = await versionResponse.json();
assert.equal(
  version.buildId,
  contract.production_build_id,
  "production web build moved; refresh the cached-client manifest deliberately",
);

const production = operationMap(functionSpec(["--prod"]));
const staging = operationMap(
  functionSpec(["--deployment", contract.staging_deployment]),
);

for (const operation of contract.required_public_operations) {
  const oldEntry = production.get(operation);
  const stagedEntry = staging.get(operation);
  assert.ok(oldEntry, `${operation} missing from pinned production backend`);
  assert.ok(stagedEntry, `${operation} missing from staging`);
  assert.equal(
    stagedEntry.functionType,
    oldEntry.functionType,
    `${operation} changed function type`,
  );
  assertOldArgsAccepted(oldEntry.args, stagedEntry.args, operation);
}

console.log(
  `PASS: staging accepts all ${contract.required_public_operations.length} calls from cached production build ${contract.production_build_id.slice(0, 8)}`,
);
