import assert from "node:assert/strict";

import {
  buildResponsesApiFunctionTools,
  projectResponsesApiToolSchema,
} from "../shared/toolRegistry.ts";
import { RETRIEVAL_TOOL_NAMES } from "../shared/retrievalTools.ts";

function assertStrictObjectSchema(
  value: unknown,
): asserts value is Record<string, unknown> {
  assert.equal(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    true,
    "expected an object schema",
  );
  const schema = value as Record<string, unknown>;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  const properties =
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : null;
  assert.ok(properties, "expected properties");
  const required = Array.isArray(schema.required)
    ? schema.required.map((entry) => String(entry ?? ""))
    : [];
  assert.deepEqual(required.sort(), Object.keys(properties).sort());
}

function assertNoLooseObjectSchemas(value: unknown, path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const schema = value as Record<string, unknown>;
  const rawType = schema.type;
  const types = Array.isArray(rawType)
    ? rawType.map(String)
    : [String(rawType ?? "")];
  if (types.includes("object") || "properties" in schema) {
    assert.equal(
      schema.additionalProperties,
      false,
      `${path} object schemas must set additionalProperties=false`,
    );
  }
  const properties = schema.properties;
  if (
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    for (const [key, child] of Object.entries(
      properties as Record<string, unknown>,
    )) {
      assertNoLooseObjectSchemas(child, `${path}.properties.${key}`);
    }
  }
  const items = schema.items;
  if (Array.isArray(items)) {
    items.forEach((child, index) =>
      assertNoLooseObjectSchemas(child, `${path}.items.${index}`),
    );
  } else {
    assertNoLooseObjectSchemas(items, `${path}.items`);
  }
}

function proveFixedToolSchemasAreStrictSafe() {
  const tools = buildResponsesApiFunctionTools(RETRIEVAL_TOOL_NAMES);
  assert.equal(tools.length, RETRIEVAL_TOOL_NAMES.length);
  for (const tool of tools) {
    assert.equal(tool.strict, true, `expected ${tool.name} to stay strict`);
    assertStrictObjectSchema(tool.parameters);
    assertNoLooseObjectSchemas(tool.parameters, tool.name);
  }
}

function proveOptionalNestedObjectsBecomeNullableAndRequired() {
  const projection = projectResponsesApiToolSchema({
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string" },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string" },
        },
      },
    },
  });
  assert.equal(projection.strict, true);
  const schema = projection.parameters as Record<string, unknown>;
  const properties = schema.properties as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(schema.required, ["query", "options"]);
  assert.deepEqual(properties.options.type, ["object", "null"]);
  assert.deepEqual(properties.options.required, ["mode"]);
}

function proveBestEffortProjectionCanDowngrade() {
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
    { allowBestEffortFallback: true },
  );
  assert.equal(projection.strict, false);
  assert.equal(
    "$schema" in (projection.parameters as Record<string, unknown>),
    false,
  );
}

proveFixedToolSchemasAreStrictSafe();
proveOptionalNestedObjectsBecomeNullableAndRequired();
proveBestEffortProjectionCanDowngrade();

console.log("PASS: fixed Responses API tool schemas are projected safely");
