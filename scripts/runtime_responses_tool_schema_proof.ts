import assert from "node:assert/strict";

import {
  buildResponsesApiFunctionTools,
  projectResponsesApiToolSchema,
} from "../shared/toolRegistry.ts";
import { RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA } from "../convex/runtimeMountedToolExposure.ts";

function assertStrictObjectSchema(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    true,
    "expected an object schema",
  );
  const schema = value as Record<string, unknown>;
  assert.equal(schema.type === "object", true, "expected type=object");
  assert.equal(
    schema.additionalProperties,
    false,
    "expected additionalProperties=false",
  );
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : null;
  assert.ok(properties, "expected properties");
  const required = Array.isArray(schema.required)
    ? schema.required.map((entry) => String(entry ?? ""))
    : [];
  assert.deepEqual(
    required.sort(),
    Object.keys(properties).sort(),
    "expected every property to be marked required",
  );
}

function proveFixedToolSchemasAreStrictSafe() {
  const tools = buildResponsesApiFunctionTools(["read", "web_research", "bash"]);
  assert.equal(tools.length, 3);
  for (const tool of tools) {
    assert.equal(tool.strict, true, `expected ${tool.name} to stay strict`);
    assertStrictObjectSchema(tool.parameters);
  }
}

function proveResolverSchemaIsStrictSafe() {
  const projection = projectResponsesApiToolSchema(RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA);
  assert.equal(projection.strict, true, "expected resolver to stay strict");
  assertStrictObjectSchema(projection.parameters);
}

function proveOptionalNestedObjectsBecomeNullableAndRequired() {
  const projection = projectResponsesApiToolSchema({
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
      },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
          },
        },
      },
    },
  });
  assert.equal(projection.strict, true);
  const schema = projection.parameters as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(schema.required, ["query", "options"]);
  assert.deepEqual(properties.options.type, ["object", "null"]);
  assert.deepEqual(properties.options.required, ["mode"]);
}

function proveMountedToolFallbackCanDowngrade() {
  const projection = projectResponsesApiToolSchema(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          oneOf: [{ type: "string" }, { type: "integer" }],
        },
      },
    } as Record<string, unknown>,
    {
      allowBestEffortFallback: true,
    },
  );
  assert.equal(projection.strict, false, "expected unsupported mounted schema to downgrade");
  const schema = projection.parameters as Record<string, unknown>;
  assert.equal("$schema" in schema, false, "expected $schema metadata to be stripped");
}

proveFixedToolSchemasAreStrictSafe();
proveResolverSchemaIsStrictSafe();
proveOptionalNestedObjectsBecomeNullableAndRequired();
proveMountedToolFallbackCanDowngrade();

console.log("PASS: responses provider tool schemas are projected safely");
