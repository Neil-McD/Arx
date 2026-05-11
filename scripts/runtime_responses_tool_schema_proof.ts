import assert from "node:assert/strict";

import {
  buildResponsesApiFunctionTools,
  projectResponsesApiToolSchema,
} from "../shared/toolRegistry.ts";
import {
  buildMountedAppOpenAiTools,
  buildMountedAppResponsesTools,
} from "../convex/runtimeHarnessShaping.ts";
import { RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA } from "../convex/runtimeMountedToolExposure.ts";
import type { RuntimeMountedMcpTool } from "../convex/runtimeMcpManager.ts";

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
  const tools = buildResponsesApiFunctionTools([
    "search_product_docs",
    "get_product_doc",
    "get_active_community_context",
    "read",
    "web_research",
    "bash",
  ]);
  assert.equal(tools.length, 6);
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

function proveMountedMcpResponsesToolsStayNonStrict() {
  const mountedTools: RuntimeMountedMcpTool[] = [
    {
      scope: "user",
      mount_id: "mount-1",
      runtime_tool_name: "me__linear_labels",
      developer_app_id: "app-1",
      catalog_app_id: "linear",
      app_name: "Linear",
      endpoint_url: "https://mcp.linear.app/mcp",
      auth_type: "oauth",
      tool_name: "list_issue_labels",
      namespaced_tool_name: "linear__list_issue_labels",
      description: "List labels",
      input_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        $defs: {
          Cursor: {
            type: "string",
          },
          Container: {
            type: "object",
            properties: null,
            additionalProperties: true,
          },
        },
        required: ["query"],
        properties: {
          query: { type: "string" },
          cursor: { $ref: "#/$defs/Cursor" },
          filters: { type: "object", additionalProperties: false },
          required: { type: "string" },
          literal_payload: {
            type: "object",
            properties: null,
            additionalProperties: true,
            enum: [{ required: ["enum literal"] }],
            const: { required: ["const literal"] },
            default: { required: ["default literal"] },
            examples: [{ required: ["example literal"] }],
            "x-provider-metadata": { required: ["provider literal"] },
          },
        },
      },
      risk_level: "read",
    },
  ];
  const [tool] = buildMountedAppResponsesTools(mountedTools);
  assert.equal(tool?.strict, false, "mounted MCP tools should not force strict schemas");
  const schema = tool?.parameters as Record<string, unknown>;
  assert.equal("$schema" in schema, false, "mounted MCP schema metadata should be stripped");
  assert.ok("$defs" in schema, "mounted MCP schemas should preserve $defs");
  const defs = schema.$defs as Record<string, Record<string, unknown>>;
  assert.deepEqual(
    defs.Container?.properties,
    {},
    "mounted MCP schema sanitizer should normalize null definition properties",
  );
  assert.deepEqual(schema.required, ["query"]);
  const responseProperties = schema.properties as Record<string, Record<string, unknown>>;
  assert.equal(responseProperties.cursor.$ref, "#/$defs/Cursor");
  assert.equal(responseProperties.required.type, "string");
  assert.equal(
    "properties" in responseProperties,
    false,
    "mounted MCP schema sanitizer should not treat properties maps as schemas",
  );
  assert.deepEqual(
    responseProperties.filters.properties,
    {},
    "mounted MCP schema sanitizer should normalize missing object properties",
  );
  const literalPayload = responseProperties.literal_payload as Record<string, unknown>;
  assert.deepEqual(
    literalPayload.properties,
    {},
    "mounted MCP schema sanitizer should normalize null object properties",
  );
  assert.deepEqual(
    literalPayload.enum,
    [{ required: ["enum literal"] }],
    "mounted MCP schema sanitizer should preserve enum values verbatim",
  );
  assert.deepEqual(
    literalPayload.const,
    { required: ["const literal"] },
    "mounted MCP schema sanitizer should preserve const values verbatim",
  );
  assert.deepEqual(
    literalPayload.default,
    { required: ["default literal"] },
    "mounted MCP schema sanitizer should preserve default values verbatim",
  );
  assert.deepEqual(
    literalPayload.examples,
    [{ required: ["example literal"] }],
    "mounted MCP schema sanitizer should preserve examples verbatim",
  );
  assert.deepEqual(
    literalPayload["x-provider-metadata"],
    { required: ["provider literal"] },
    "mounted MCP schema sanitizer should preserve unknown provider metadata verbatim",
  );

  const [openAiTool] = buildMountedAppOpenAiTools(mountedTools);
  assert.equal(
    openAiTool?.function.strict,
    false,
    "mounted MCP tools should stay non-strict on the OpenAI-compatible surface",
  );
  const openAiSchema = openAiTool?.function.parameters as Record<string, unknown>;
  assert.equal(
    "$schema" in openAiSchema,
    false,
    "mounted MCP OpenAI-compatible schema metadata should be stripped",
  );
  assert.ok("$defs" in openAiSchema, "mounted MCP OpenAI-compatible schemas should preserve $defs");
  const openAiProperties = openAiSchema.properties as Record<string, Record<string, unknown>>;
  assert.equal(openAiProperties.cursor.$ref, "#/$defs/Cursor");

  const missingPropertiesTool: RuntimeMountedMcpTool = {
    ...mountedTools[0]!,
    mount_id: "mount-2",
    runtime_tool_name: "me__empty_input",
    input_schema: {
      type: "object",
      additionalProperties: true,
    },
  };
  const [topLevelResponseTool] = buildMountedAppResponsesTools([missingPropertiesTool]);
  assert.deepEqual(
    (topLevelResponseTool?.parameters as Record<string, unknown>).properties,
    {},
    "mounted MCP schemas should default missing top-level properties",
  );
  const [topLevelOpenAiTool] = buildMountedAppOpenAiTools([missingPropertiesTool]);
  assert.deepEqual(
    (topLevelOpenAiTool?.function.parameters as Record<string, unknown>).properties,
    {},
    "mounted MCP OpenAI-compatible schemas should default missing top-level properties",
  );

  const refOnlyTool: RuntimeMountedMcpTool = {
    ...mountedTools[0]!,
    mount_id: "mount-3",
    runtime_tool_name: "me__ref_input",
    input_schema: {
      $ref: "#/$defs/Input",
      $defs: {
        Input: {
          type: "object",
          additionalProperties: false,
        },
      },
    },
  };
  const [refOnlyResponsesTool] = buildMountedAppResponsesTools([refOnlyTool]);
  const refOnlySchema = refOnlyResponsesTool?.parameters as Record<string, unknown>;
  assert.equal(refOnlySchema.$ref, "#/$defs/Input");
  assert.deepEqual(
    refOnlySchema.properties,
    {},
    "mounted MCP schemas should default top-level properties even for ref-only schemas",
  );
}

proveFixedToolSchemasAreStrictSafe();
proveResolverSchemaIsStrictSafe();
proveOptionalNestedObjectsBecomeNullableAndRequired();
proveMountedToolFallbackCanDowngrade();
proveMountedMcpResponsesToolsStayNonStrict();

console.log("PASS: responses provider tool schemas are projected safely");
