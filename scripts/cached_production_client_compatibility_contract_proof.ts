import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { acceptsPreviousValidator } from "./cachedClientValidatorCompatibility";

const contract = JSON.parse(readFileSync("shared/contracts/cached_production_client_compatibility_v1.json", "utf8"));
assert.equal(contract.contract_id, "cached_production_client_compatibility_v1");
assert.match(contract.production_build_id, /^[a-f0-9]{40}$/);
const operations: string[] = contract.required_public_operations;
assert.ok(operations.length > 0);
assert.equal(new Set(operations).size, operations.length);
assert.deepEqual(Object.keys(contract.production_function_contracts).sort(), [...operations].sort());

const failures: string[] = [];
for (const operation of operations) {
  const [moduleName, exportName] = operation.split(":");
  assert.match(moduleName, /^[A-Za-z][A-Za-z0-9_]*$/);
  const module = await import(pathToFileURL(resolve("convex", `${moduleName}.ts`)).href);
  const fn = module[exportName];
  if (!fn?.isPublic || !fn?.exportArgs) {
    failures.push(`${operation}: missing public operation`);
    continue;
  }
  const previous = contract.production_function_contracts[operation];
  const functionType = fn.isQuery ? "Query" : fn.isMutation ? "Mutation" : "Action";
  if (functionType !== previous.functionType) failures.push(`${operation}: function type changed`);
  if (!acceptsPreviousValidator(JSON.parse(fn.exportArgs()), previous.args)) {
    failures.push(`${operation}: rejects previous argument shapes`);
  }
}
if (failures.length) {
  console.error(`BLOCKED: candidate compatibility with production ${contract.production_build_id}:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: candidate validators accept ${operations.length} operations from pinned production ${contract.production_build_id}. Handler behavior and live build freshness require separate checks.`);
}
