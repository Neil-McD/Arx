import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

import {
  ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS,
  ACCOUNT_LIFECYCLE_FIELD_OVERRIDES,
  ACCOUNT_LIFECYCLE_POLICY_VERSION,
  ACCOUNT_LIFECYCLE_SCHEMA_BASELINE,
  ACCOUNT_LIFECYCLE_TABLE_POLICIES,
  ACCOUNT_LIFECYCLE_UNINDEXED_EDGE_POLICIES,
} from "../convex/accountLifecyclePolicy.ts";

type SchemaEdge = {
  table: string;
  path: string;
  key: string;
};

type SchemaTable = {
  name: string;
  directUserEdges: SchemaEdge[];
  indexes: Array<{ name: string; fields: string[] }>;
  opaqueFields: string[];
  storageFields: string[];
  secretFields: string[];
};

const schemaPath = "convex/schema.ts";
const policyPath = "convex/accountLifecyclePolicy.ts";
const schemaSource = readFileSync(schemaPath, "utf8");
const policySource = readFileSync(policyPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, schemaSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function isVMethodCall(node: ts.Node, method: string, firstStringArg?: string): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "v") return false;
  if (node.expression.name.text !== method) return false;
  if (firstStringArg === undefined) return true;
  return ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === firstStringArg;
}

function containsValidatorCallExcludingObjects(node: ts.Node, method: string, firstStringArg?: string): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) return;
    if (isVMethodCall(current, "object")) return;
    if (isVMethodCall(current, method, firstStringArg)) {
      found = true;
      return;
    }
    current.forEachChild(visit);
  };
  visit(node);
  return found;
}

function nestedValidatorObjects(node: ts.Node): ts.ObjectLiteralExpression[] {
  const objects: ts.ObjectLiteralExpression[] = [];
  const visit = (current: ts.Node): void => {
    if (isVMethodCall(current, "object")) {
      const objectArg = current.arguments[0];
      if (objectArg && ts.isObjectLiteralExpression(objectArg)) objects.push(objectArg);
      return;
    }
    current.forEachChild(visit);
  };
  visit(node);
  return objects;
}

function collectValidatorFields(args: {
  table: string;
  object: ts.ObjectLiteralExpression;
  prefix?: string[];
  directUserEdges: SchemaEdge[];
  opaqueFields: string[];
  storageFields: string[];
  secretFields: string[];
}): void {
  const prefix = args.prefix ?? [];
  for (const property of args.object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const field = propertyNameText(property.name);
    const pathParts = [...prefix, field];
    const path = pathParts.join(".");
    const key = `${args.table}.${path}`;

    if (containsValidatorCallExcludingObjects(property.initializer, "id", "users")) {
      args.directUserEdges.push({ table: args.table, path, key });
    }
    if (field.endsWith("Json") || containsValidatorCallExcludingObjects(property.initializer, "any")) {
      args.opaqueFields.push(path);
    }
    if (containsValidatorCallExcludingObjects(property.initializer, "id", "_storage")) {
      args.storageFields.push(path);
    }
    if (/^(encryptedSecretHex|secretIvHex|clientSecretEncryptedHex|clientSecretIvHex)$/.test(field)) {
      args.secretFields.push(path);
    }

    for (const nestedObject of nestedValidatorObjects(property.initializer)) {
      collectValidatorFields({ ...args, object: nestedObject, prefix: pathParts });
    }
  }
}

function findDefineTableCall(node: ts.Expression): ts.CallExpression | null {
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "defineTable") return node;
    if (ts.isPropertyAccessExpression(node.expression)) return findDefineTableCall(node.expression.expression);
  }
  return null;
}

function collectIndexes(node: ts.Node): Array<{ name: string; fields: string[] }> {
  const indexes: Array<{ name: string; fields: string[] }> = [];
  const visit = (current: ts.Node): void => {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "index"
    ) {
      const nameArg = current.arguments[0];
      const fieldsArg = current.arguments[1];
      if (nameArg && ts.isStringLiteral(nameArg) && fieldsArg && ts.isArrayLiteralExpression(fieldsArg)) {
        indexes.push({
          name: nameArg.text,
          fields: fieldsArg.elements.filter(ts.isStringLiteral).map((field) => field.text),
        });
      }
    }
    current.forEachChild(visit);
  };
  visit(node);
  return indexes;
}

function findSchemaObject(): ts.ObjectLiteralExpression {
  let schemaObject: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "defineSchema" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      schemaObject = node.arguments[0];
      return;
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  assert.ok(schemaObject, "schema.ts must contain defineSchema({...})");
  return schemaObject;
}

function readSchemaTables(): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const property of findSchemaObject().properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const table = propertyNameText(property.name);
    const defineTableCall = findDefineTableCall(property.initializer);
    assert.ok(defineTableCall, `${table} must be declared through defineTable`);
    const validatorObject = defineTableCall.arguments[0];
    assert.ok(validatorObject && ts.isObjectLiteralExpression(validatorObject), `${table} must use an object validator`);

    const directUserEdges: SchemaEdge[] = [];
    const opaqueFields: string[] = [];
    const storageFields: string[] = [];
    const secretFields: string[] = [];
    collectValidatorFields({
      table,
      object: validatorObject,
      directUserEdges,
      opaqueFields,
      storageFields,
      secretFields,
    });
    tables.push({
      name: table,
      directUserEdges,
      indexes: collectIndexes(property.initializer),
      opaqueFields: [...new Set(opaqueFields)],
      storageFields: [...new Set(storageFields)],
      secretFields: [...new Set(secretFields)],
    });
  }
  return tables;
}

const tables = readSchemaTables();
const tableNames = tables.map((table) => table.name).sort();
const policyTableNames = Object.keys(ACCOUNT_LIFECYCLE_TABLE_POLICIES).sort();
const directUserEdges = tables.flatMap((table) => table.directUserEdges);
const directEdgeKeys = new Set(directUserEdges.map((edge) => edge.key));
const opaqueFields = tables.flatMap((table) => table.opaqueFields.map((field) => `${table.name}.${field}`));
const storageFields = tables.flatMap((table) => table.storageFields.map((field) => `${table.name}.${field}`));

assert.equal(ACCOUNT_LIFECYCLE_POLICY_VERSION, "account-lifecycle-v6", "policy version must change for semantic revisions");
assert.equal(tables.length, ACCOUNT_LIFECYCLE_SCHEMA_BASELINE.tableCount, "schema table count changed; review lifecycle coverage");
assert.equal(
  directUserEdges.length,
  ACCOUNT_LIFECYCLE_SCHEMA_BASELINE.directUserEdgeCount,
  "direct user-reference edge count changed; review lifecycle coverage",
);
assert.equal(
  opaqueFields.length,
  ACCOUNT_LIFECYCLE_SCHEMA_BASELINE.opaqueFieldCount,
  `opaque schema fields changed; review privacy handling: ${opaqueFields.join(", ")}`,
);
assert.equal(
  storageFields.length,
  ACCOUNT_LIFECYCLE_SCHEMA_BASELINE.storageFieldCount,
  `storage fields changed; review object lifecycle handling: ${storageFields.join(", ")}`,
);
assert.deepEqual(policyTableNames, tableNames, "every schema table must have exactly one lifecycle table policy");

for (const table of tables) {
  const policy = ACCOUNT_LIFECYCLE_TABLE_POLICIES[table.name];
  assert.ok(policy, `missing lifecycle policy for ${table.name}`);
  assert.ok(policy.proof.trim(), `${table.name} must name a behavioral proof`);
  assert.ok(policy.schemaRequirements.length > 0, `${table.name} must declare schema requirements, including explicit none`);
  if (table.opaqueFields.length > 0) {
    assert.notEqual(policy.opaqueData, "none", `${table.name} contains opaque fields and must declare privacy handling`);
  }
  if (table.storageFields.length > 0) {
    assert.notEqual(policy.storage, "none", `${table.name} contains storage IDs and must declare storage handling`);
  }
  if (table.secretFields.length > 0) {
    assert.notEqual(policy.externalEffect, "none", `${table.name} contains encrypted secrets and must declare provider revocation`);
  }
}

const unindexedEdges = directUserEdges.filter((edge) => {
  const table = tables.find((candidate) => candidate.name === edge.table)!;
  return !table.indexes.some((index) => edge.path.indexOf(".") < 0 && index.fields[0] === edge.path);
});
const unindexedEdgeKeys = unindexedEdges.map((edge) => edge.key).sort();
const declaredUnindexedEdgeKeys = Object.keys(ACCOUNT_LIFECYCLE_UNINDEXED_EDGE_POLICIES).sort();
assert.deepEqual(
  declaredUnindexedEdgeKeys,
  unindexedEdgeKeys,
  "every direct user edge without a user-first index must declare index_required or a bounded parent_cascade",
);

for (const edge of unindexedEdges) {
  const lookup = ACCOUNT_LIFECYCLE_UNINDEXED_EDGE_POLICIES[edge.key];
  assert.ok(lookup, `missing lookup policy for ${edge.key}`);
  assert.ok(lookup.reason.trim(), `${edge.key} lookup exception must explain its bounded path`);
  if (lookup.lookup === "index_required") {
    const policy = ACCOUNT_LIFECYCLE_TABLE_POLICIES[edge.table];
    assert.ok(
      policy.schemaRequirements.includes("bounded_index"),
      `${edge.key} requires a new index but ${edge.table} does not declare bounded_index`,
    );
  } else {
    const parentTable = tables.find((table) => table.name === lookup.parentTable);
    assert.ok(parentTable, `${edge.key} parent cascade references missing table ${lookup.parentTable}`);
    const parentIndex = parentTable.indexes.find((index) => index.name === lookup.parentIndex);
    assert.ok(parentIndex, `${edge.key} parent cascade references missing index ${lookup.parentTable}.${lookup.parentIndex}`);
    assert.ok(
      parentTable.directUserEdges.some((parentEdge) => parentEdge.path === parentIndex.fields[0]),
      `${edge.key} parent index ${lookup.parentIndex} must begin with a direct user edge`,
    );
    const childTable = tables.find((table) => table.name === edge.table)!;
    const childIndex = childTable.indexes.find((index) => index.name === lookup.childIndex);
    assert.ok(childIndex, `${edge.key} parent cascade references missing child index ${edge.table}.${lookup.childIndex}`);
    assert.equal(
      childIndex.fields[0],
      lookup.childForeignKey,
      `${edge.key} child index ${lookup.childIndex} must begin with ${lookup.childForeignKey}`,
    );
  }
}

for (const edgeKey of Object.keys(ACCOUNT_LIFECYCLE_FIELD_OVERRIDES)) {
  assert.ok(directEdgeKeys.has(edgeKey), `stale field override ${edgeKey}`);
}

assert.ok(ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS.length >= 6, "executor blockers must remain explicit while deletion is quarantined");
assert.equal(
  new Set(ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS.map((blocker) => blocker.code)).size,
  ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS.length,
  "executor blocker codes must be unique",
);
for (const blocker of ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS) {
  assert.ok(blocker.code.trim(), "executor blocker codes must be non-empty");
  assert.ok(blocker.reason.trim(), `${blocker.code} must retain an explicit reason`);
}
assert.doesNotMatch(policySource, /\bctx\s*\./, "policy module must not execute through a Convex context");
assert.doesNotMatch(policySource, /\.\s*(?:delete|insert|patch|replace)\s*\(/, "policy module must not mutate data");
assert.doesNotMatch(policySource, /\b(?:runMutation|runAction|scheduler|fetch)\s*\(/, "policy module must not schedule or call external effects");

console.log(
  `PASS: account lifecycle policy covers ${tables.length} tables, ${directUserEdges.length} direct user edges, ` +
    `${unindexedEdges.length} unindexed edges, ${opaqueFields.length} opaque fields, and ${storageFields.length} storage fields.`,
);
