import type { RetrievalToolName } from "./retrievalTools";
import { findPlatformOperationByNativeToolName } from "./platformOperationContract.ts";
import { validatePolynetSemanticRepositoryOperationInput } from "./communitySemanticRepository.ts";
import {
  POLYNET_CANONICAL_TOOL_DEFINITIONS,
  type PolynetCanonicalToolName,
} from "./polynetCanonicalToolContract.ts";
import { parsePolynetSemanticRepositoryPath } from "./polynetSemanticRepositoryContract.ts";

type JsonSchema =
  | {
      type?: string | string[];
      description?: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      minItems?: number;
      maxItems?: number;
      items?: JsonSchema;
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, JsonSchema>;
    }
  | boolean
  | Record<string, unknown>;

export type ToolRegistryEntry = {
  name: RetrievalToolName;
  description: string;
  inputSchema: JsonSchema;
};

type OpenAiFunctionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
    strict: boolean;
  };
};

export type ResponsesApiFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
};

function getPlatformNativeToolContract(name: RetrievalToolName): {
  description: string;
  inputSchema: JsonSchema;
} {
  const operation = findPlatformOperationByNativeToolName(name);
  if (!operation)
    throw new Error(`platform_operation_native_projection_missing:${name}`);
  return {
    description: operation.projections.native.description,
    inputSchema: operation.projections.native.inputSchema as JsonSchema,
  };
}

const SEARCH_PRODUCT_DOCS_TOOL = getPlatformNativeToolContract(
  "search_product_docs",
);
const GET_PRODUCT_DOC_TOOL = getPlatformNativeToolContract("get_product_doc");

function getPolynetCanonicalToolContract(
  name: PolynetCanonicalToolName,
): {
  description: string;
  inputSchema: JsonSchema;
} {
  const definition = POLYNET_CANONICAL_TOOL_DEFINITIONS[name];
  return {
    description: definition.description,
    inputSchema: definition.inputSchema as JsonSchema,
  };
}

const POLYNET_LIST_TOOL = getPolynetCanonicalToolContract("polynet_list");
const POLYNET_READ_TOOL = getPolynetCanonicalToolContract("polynet_read");
const POLYNET_SEARCH_TOOL = getPolynetCanonicalToolContract("polynet_search");
const POLYNET_WRITE_TOOL = getPolynetCanonicalToolContract("polynet_write");
const POLYNET_CALL_TOOL = getPolynetCanonicalToolContract("polynet_call");

const WEB_RESEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: {
      type: "string",
      enum: ["search", "open_page", "find_in_page"],
    },
    query: {
      type: "string",
      minLength: 1,
      maxLength: 512,
    },
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
    },
  },
};

const WEB_CRAWL_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url"],
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
    },
    strategy: {
      type: "string",
      enum: ["auto", "simple", "crawl"],
      description:
        "auto uses the configured platform crawler, simple reads one page, crawl requires the robust crawler provider.",
    },
    destination: {
      type: "string",
      enum: ["context", "active_community_sources"],
      description:
        "context returns bounded crawl output; active_community_sources saves crawled pages as source records for the active community.",
    },
    max_pages: {
      type: "integer",
      minimum: 1,
      maximum: 100,
    },
    max_depth: {
      type: "integer",
      minimum: 0,
      maximum: 4,
    },
    max_chars: {
      type: "integer",
      minimum: 1000,
      maximum: 80000,
      description:
        "Maximum total crawled text returned to the model when destination is context.",
    },
  },
};

const MEMBER_PROFILE_CONFIRM_FACTS_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["confirm_marker", "facts"],
  properties: {
    confirm_marker: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      description: "Stable marker for the member-approved interview batch.",
    },
    facts: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "body", "provenance"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "situation",
              "goal",
              "skill",
              "interest",
              "availability",
              "preference",
              "link",
            ],
          },
          body: {
            type: "string",
            minLength: 1,
            maxLength: 500,
          },
          provenance: {
            type: "string",
            enum: ["stated_interview", "form_answer"],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          evidence_ref: {
            type: "string",
            minLength: 1,
            maxLength: 180,
          },
        },
      },
    },
  },
};

const MEMBER_CONVERSATIONS_LIST_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 12,
    },
  },
};

const MEMBER_CONVERSATION_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["episode_id"],
  properties: {
    episode_id: {
      type: "string",
      minLength: 1,
      maxLength: 160,
    },
  },
};

const TOOL_REGISTRY: Record<RetrievalToolName, ToolRegistryEntry> = {
  search_product_docs: {
    name: "search_product_docs",
    ...SEARCH_PRODUCT_DOCS_TOOL,
  },
  get_product_doc: {
    name: "get_product_doc",
    ...GET_PRODUCT_DOC_TOOL,
  },
  polynet_list: {
    name: "polynet_list",
    ...POLYNET_LIST_TOOL,
  },
  polynet_read: {
    name: "polynet_read",
    ...POLYNET_READ_TOOL,
  },
  polynet_search: {
    name: "polynet_search",
    ...POLYNET_SEARCH_TOOL,
  },
  polynet_write: {
    name: "polynet_write",
    ...POLYNET_WRITE_TOOL,
  },
  polynet_call: {
    name: "polynet_call",
    ...POLYNET_CALL_TOOL,
  },
  member_conversations_list: {
    name: "member_conversations_list",
    description:
      "List the signed-in member's recent private Polynet agent conversation episodes across community lenses. Returns bounded metadata and lens provenance only; use member_conversation_read for relevant transcript evidence.",
    inputSchema: MEMBER_CONVERSATIONS_LIST_TOOL_SCHEMA,
  },
  member_conversation_read: {
    name: "member_conversation_read",
    description:
      "Read a bounded user-and-assistant transcript window with lens provenance from one of the signed-in member's private Polynet agent conversation episodes.",
    inputSchema: MEMBER_CONVERSATION_READ_TOOL_SCHEMA,
  },
  member_profile_confirm_facts: {
    name: "member_profile_confirm_facts",
    description:
      "Write member-approved onboarding interview facts to the active member profile ontology for the active community lens.",
    inputSchema: MEMBER_PROFILE_CONFIRM_FACTS_TOOL_SCHEMA,
  },
  web_research: {
    name: "web_research",
    description:
      "Research the live web by searching documentation, opening a page, or finding text within a page.",
    inputSchema: WEB_RESEARCH_TOOL_SCHEMA,
  },
  web_crawl: {
    name: "web_crawl",
    description:
      "Crawl a provided site, wiki, docs, or course URL with bounded same-origin crawling. Use active_community_sources to save crawled pages as source records for the active community.",
    inputSchema: WEB_CRAWL_TOOL_SCHEMA,
  },
};

export function getToolDefinition(name: RetrievalToolName): ToolRegistryEntry {
  return TOOL_REGISTRY[name];
}

export function getToolDefinitions(
  names: readonly RetrievalToolName[],
): ToolRegistryEntry[] {
  return names.map((name) => getToolDefinition(name));
}

// polynet_call's input is a union of per-operation inputs (form answers, funnel
// content, references) that the canonical executor validates exactly. Strict
// schema mode cannot represent it: OpenAI then returns an empty, incomplete
// response for every turn that offers the tool. It is sent non-strict; every
// other tool stays strict.
const SERVER_VALIDATED_TOOL_NAMES: ReadonlySet<RetrievalToolName> = new Set(["polynet_call"]);

export function isServerValidatedTool(name: RetrievalToolName): boolean {
  return SERVER_VALIDATED_TOOL_NAMES.has(name);
}

export function buildOpenAiFunctionTools(
  names: readonly RetrievalToolName[],
): OpenAiFunctionTool[] {
  return getToolDefinitions(names).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: !isServerValidatedTool(tool.name),
    },
  }));
}

function isSchemaRecord(value: JsonSchema): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSchemaTypeList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function withNullableType(value: JsonSchema): JsonSchema {
  if (!isSchemaRecord(value)) return value;
  const typeList = normalizeSchemaTypeList(value.type);
  if (typeList.length > 0) {
    return {
      ...value,
      type: typeList.includes("null") ? typeList : [...typeList, "null"],
    };
  }
  if (
    value.properties &&
    typeof value.properties === "object" &&
    !Array.isArray(value.properties)
  ) {
    return {
      ...value,
      type: ["object", "null"],
    };
  }
  if ("items" in value) {
    return {
      ...value,
      type: ["array", "null"],
    };
  }
  return value;
}

function looseToolSchemaShouldDefaultProperties(
  schema: Record<string, unknown>,
): boolean {
  const typeList = normalizeSchemaTypeList(schema.type);
  if (typeList.includes("object")) return true;
  return (
    "properties" in schema ||
    "required" in schema ||
    "additionalProperties" in schema ||
    "patternProperties" in schema ||
    "propertyNames" in schema
  );
}

const LOOSE_SCHEMA_MAP_KEYS = new Set([
  "properties",
  "$defs",
  "definitions",
  "patternProperties",
  "dependentSchemas",
]);

const LOOSE_SCHEMA_ARRAY_KEYS = new Set([
  "anyOf",
  "allOf",
  "oneOf",
  "prefixItems",
]);

const LOOSE_SCHEMA_VALUE_KEYS = new Set([
  "items",
  "additionalProperties",
  "not",
  "if",
  "then",
  "else",
  "contains",
  "propertyNames",
  "unevaluatedProperties",
]);

export function sanitizeResponsesApiSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") return schema;
  if (!isSchemaRecord(schema)) return schema;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (
      key === "$schema" ||
      key === "$id" ||
      key === "$defs" ||
      key === "definitions"
    ) {
      continue;
    }
    if (
      key === "properties" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      next[key] = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(
          ([childKey, childValue]) => [
            childKey,
            sanitizeResponsesApiSchema(childValue),
          ],
        ),
      );
      continue;
    }
    if (key === "items") {
      next[key] = Array.isArray(value)
        ? value.map((entry) => sanitizeResponsesApiSchema(entry as JsonSchema))
        : sanitizeResponsesApiSchema(value as JsonSchema);
      continue;
    }
    if (
      (key === "anyOf" || key === "allOf" || key === "oneOf") &&
      Array.isArray(value)
    ) {
      next[key] = value.map((entry) =>
        sanitizeResponsesApiSchema(entry as JsonSchema),
      );
      continue;
    }
    if (
      (key === "not" || key === "if" || key === "then" || key === "else") &&
      value
    ) {
      next[key] = sanitizeResponsesApiSchema(value as JsonSchema);
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function sanitizeLooseToolSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") return schema;
  if (!isSchemaRecord(schema)) return schema;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "$id") continue;
    if (LOOSE_SCHEMA_MAP_KEYS.has(key)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        next[key] = value;
        continue;
      }
      next[key] = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(
          ([childKey, childValue]) => [
            childKey,
            sanitizeLooseToolSchema(childValue),
          ],
        ),
      );
      continue;
    }
    if (LOOSE_SCHEMA_ARRAY_KEYS.has(key)) {
      next[key] = Array.isArray(value)
        ? value.map((entry) => sanitizeLooseToolSchema(entry as JsonSchema))
        : value;
      continue;
    }
    if (LOOSE_SCHEMA_VALUE_KEYS.has(key)) {
      next[key] =
        typeof value === "boolean" || isSchemaRecord(value as JsonSchema)
          ? sanitizeLooseToolSchema(value as JsonSchema)
          : value;
      continue;
    }
    next[key] = value;
  }
  if (
    (!("properties" in next) || next.properties === null) &&
    looseToolSchemaShouldDefaultProperties(schema)
  ) {
    next.properties = {};
  }
  return next;
}

function hasStrictResponsesApiSchemaRisk(schema: JsonSchema): boolean {
  if (typeof schema === "boolean") return true;
  if (!isSchemaRecord(schema)) return false;
  const riskyKeys = [
    "$ref",
    "anyOf",
    "allOf",
    "oneOf",
    "not",
    "if",
    "then",
    "else",
    "patternProperties",
    "propertyNames",
    "unevaluatedProperties",
    "prefixItems",
    "contains",
    "dependentSchemas",
    "dependentRequired",
  ];
  for (const key of riskyKeys) {
    if (key in schema) return true;
  }
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  ) {
    for (const value of Object.values(
      schema.properties as Record<string, JsonSchema>,
    )) {
      if (hasStrictResponsesApiSchemaRisk(value)) return true;
    }
  }
  if ("items" in schema) {
    const items = schema.items;
    if (Array.isArray(items)) {
      if (
        items.some((entry) =>
          hasStrictResponsesApiSchemaRisk(entry as JsonSchema),
        )
      ) {
        return true;
      }
    } else if (hasStrictResponsesApiSchemaRisk(items as JsonSchema)) {
      return true;
    }
  }
  return false;
}

function buildStrictResponsesApiSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") return schema;
  if (!isSchemaRecord(schema)) return schema;
  const record = schema;
  const properties =
    record.properties &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
      ? (record.properties as Record<string, JsonSchema>)
      : null;

  if (properties) {
    const required = Array.isArray(record.required)
      ? record.required
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0)
      : [];
    const nextProperties: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(properties)) {
      const normalizedValue = buildStrictResponsesApiSchema(value);
      nextProperties[key] = required.includes(key)
        ? normalizedValue
        : withNullableType(normalizedValue);
    }
    const typeList = normalizeSchemaTypeList(record.type);
    const isNullableObject = typeList.includes("null");
    return {
      ...record,
      type: isNullableObject ? ["object", "null"] : "object",
      additionalProperties: false,
      properties: nextProperties,
      required: Object.keys(nextProperties),
    };
  }

  if ("items" in record) {
    return {
      ...record,
      items: Array.isArray(record.items)
        ? record.items.map((entry) =>
            buildStrictResponsesApiSchema(entry as JsonSchema),
          )
        : buildStrictResponsesApiSchema(record.items as JsonSchema),
    };
  }

  return record;
}

export function projectResponsesApiToolSchema(
  schema: JsonSchema,
  options?: {
    allowBestEffortFallback?: boolean;
  },
): {
  parameters: JsonSchema;
  strict: boolean;
} {
  const sanitized = sanitizeResponsesApiSchema(schema);
  const allowBestEffortFallback = options?.allowBestEffortFallback === true;
  if (allowBestEffortFallback && hasStrictResponsesApiSchemaRisk(sanitized)) {
    return {
      parameters: sanitized,
      strict: false,
    };
  }
  return {
    parameters: buildStrictResponsesApiSchema(sanitized),
    strict: true,
  };
}

export function buildResponsesApiFunctionTools(
  names: readonly RetrievalToolName[],
): ResponsesApiFunctionTool[] {
  return getToolDefinitions(names).map((tool) => {
    const projection = isServerValidatedTool(tool.name)
      ? { parameters: sanitizeResponsesApiSchema(tool.inputSchema), strict: false }
      : projectResponsesApiToolSchema(tool.inputSchema);
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: projection.parameters,
      strict: projection.strict,
    };
  });
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoundedInteger(
  value: unknown,
  fieldName: string,
  minValue: number,
  maxValue: number,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed))
    throw new Error(`${fieldName} must be a number.`);
  const integer = Math.floor(parsed);
  if (integer < minValue) {
    throw new Error(
      `${fieldName} must be greater than or equal to ${minValue}.`,
    );
  }
  return Math.min(integer, maxValue);
}

export function normalizeToolArguments(
  toolName: RetrievalToolName,
  rawArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const args =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? rawArgs
      : {};
  if (toolName === "member_conversations_list") {
    const limit = normalizeBoundedInteger(
      args.limit,
      "member_conversations_list limit",
      1,
      12,
    );
    return limit ? { limit } : {};
  }
  if (toolName === "member_conversation_read") {
    const episodeId = normalizeString(args.episode_id ?? args.episodeId);
    if (!episodeId)
      throw new Error("member_conversation_read requires episode_id.");
    return { episodeId: episodeId.slice(0, 160) };
  }
  if (toolName === "polynet_list") {
    const validated = validatePolynetSemanticRepositoryOperationInput({
      operation: "list",
      path: args.path,
      cursor: args.cursor,
      limit: args.limit,
      offset: args.offset,
    });
    if (!validated.ok) throw new Error(validated.message);
    return {
      path: validated.path,
      ...("cursor" in validated && validated.cursor
        ? { cursor: validated.cursor }
        : {}),
      ...(validated.limit !== null ? { limit: validated.limit } : {}),
    };
  }
  if (toolName === "polynet_read") {
    const validated = validatePolynetSemanticRepositoryOperationInput({
      operation: "read",
      path: args.path,
      cursor: args.cursor,
      offset: args.offset,
      limit: args.limit,
    });
    if (!validated.ok) throw new Error(validated.message);
    return {
      path: validated.path,
      ...("offset" in validated && validated.offset !== null
        ? { offset: validated.offset }
        : {}),
      ...(validated.limit !== null ? { limit: validated.limit } : {}),
    };
  }
  if (toolName === "polynet_search") {
    const parsedPath = parsePolynetSemanticRepositoryPath(args.path);
    if (!parsedPath.ok) throw new Error(parsedPath.message);
    const query = normalizeString(args.query);
    if (!query) {
      throw new Error(
        "polynet_search requires a non-empty query. For broad inspection, use polynet_list on the same path and follow the returned paths.",
      );
    }
    if (
      args.types !== undefined &&
      args.types !== null &&
      !Array.isArray(args.types)
    ) {
      throw new Error("polynet_search types must be an array.");
    }
    const types = Array.isArray(args.types)
      ? [
          ...new Set(
            args.types
              .map((value) => normalizeString(value)?.toLowerCase() ?? "")
              .filter(Boolean),
          ),
        ].slice(0, 8)
      : [];
    const limit = normalizeBoundedInteger(
      args.limit,
      "polynet_search limit",
      1,
      20,
    );
    return {
      path: parsedPath.path,
      query: query.slice(0, 500),
      ...(types.length ? { types } : {}),
      ...(limit ? { limit } : {}),
    };
  }
  if (toolName === "polynet_write") {
    const parsedPath = parsePolynetSemanticRepositoryPath(args.path);
    if (!parsedPath.ok || parsedPath.kind !== "community") {
      throw new Error(
        parsedPath.ok
          ? "polynet_write requires a community repository path."
          : parsedPath.message,
      );
    }
    const mode = normalizeString(args.mode)?.toLowerCase();
    if (mode !== "create" && mode !== "append" && mode !== "update" && mode !== "delete") {
      throw new Error("polynet_write mode must be create, append, update, or delete.");
    }
    if (
      !args.content ||
      typeof args.content !== "object" ||
      Array.isArray(args.content)
    ) {
      throw new Error("polynet_write requires object content.");
    }
    const idempotencyKey = normalizeString(
      args.idempotency_key ?? args.idempotencyKey,
    );
    if (!idempotencyKey) {
      throw new Error("polynet_write requires idempotency_key.");
    }
    const expectedRevision = normalizeString(
      args.expected_revision ?? args.expectedRevision,
    );
    return {
      path: parsedPath.path,
      mode,
      content: args.content,
      ...(expectedRevision
        ? { expectedRevision: expectedRevision.slice(0, 256) }
        : {}),
      idempotencyKey: idempotencyKey.slice(0, 200),
    };
  }
  if (toolName === "polynet_call") {
    const operation = normalizeString(args.operation)?.toLowerCase();
    if (!operation || !/^[a-z0-9][a-z0-9._-]*$/.test(operation)) {
      throw new Error("polynet_call requires a canonical operation.");
    }
    const version = normalizeBoundedInteger(
      args.version,
      "polynet_call version",
      1,
      1,
    );
    if (version !== 1) throw new Error("polynet_call version must be 1.");
    if (
      !args.input ||
      typeof args.input !== "object" ||
      Array.isArray(args.input)
    ) {
      throw new Error("polynet_call requires object input.");
    }
    const idempotencyKey = normalizeString(
      args.idempotency_key ?? args.idempotencyKey,
    );
    if (!idempotencyKey) {
      throw new Error("polynet_call requires idempotency_key.");
    }
    const target = normalizeString(args.target);
    if (target) {
      const parsedTarget = parsePolynetSemanticRepositoryPath(target);
      if (!parsedTarget.ok) {
        throw new Error(
          "polynet_call target must be a canonical repository path.",
        );
      }
    }
    return {
      operation: operation.slice(0, 160),
      version,
      ...(target ? { target: target.slice(0, 1024) } : {}),
      input: args.input,
      idempotencyKey: idempotencyKey.slice(0, 200),
    };
  }
  if (toolName === "member_profile_confirm_facts") {
    const confirmMarker = normalizeString(
      args.confirm_marker ?? args.confirmMarker,
    );
    if (!confirmMarker)
      throw new Error("member_profile_confirm_facts requires confirm_marker.");
    if (!Array.isArray(args.facts)) {
      throw new Error("member_profile_confirm_facts requires facts.");
    }
    if (args.facts.length < 1) {
      throw new Error("member_profile_confirm_facts facts cannot be empty.");
    }
    if (args.facts.length > 12) {
      throw new Error(
        "member_profile_confirm_facts supports at most 12 facts.",
      );
    }
    const validKinds = new Set([
      "situation",
      "goal",
      "skill",
      "interest",
      "availability",
      "preference",
      "link",
    ]);
    const facts = args.facts.map((rawFact, index) => {
      if (!rawFact || typeof rawFact !== "object" || Array.isArray(rawFact)) {
        throw new Error(
          `member_profile_confirm_facts fact ${index + 1} must be an object.`,
        );
      }
      const fact = rawFact as Record<string, unknown>;
      const kind = normalizeString(fact.kind)?.toLowerCase() ?? "";
      if (!validKinds.has(kind)) {
        throw new Error(
          `member_profile_confirm_facts fact ${index + 1} has invalid kind.`,
        );
      }
      const provenance = normalizeString(fact.provenance)?.toLowerCase() ?? "";
      if (provenance !== "stated_interview" && provenance !== "form_answer") {
        throw new Error(
          "member_profile_confirm_facts only accepts stated_interview or form_answer provenance.",
        );
      }
      const body = normalizeString(fact.body);
      if (!body) {
        throw new Error(
          `member_profile_confirm_facts fact ${index + 1} requires body.`,
        );
      }
      const confidenceRaw = fact.confidence;
      const confidence =
        typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : null;
      const evidenceRef = normalizeString(
        fact.evidence_ref ?? fact.evidenceRef,
      );
      return {
        kind,
        body: body.slice(0, 500),
        provenance,
        ...(confidence !== null ? { confidence } : null),
        ...(evidenceRef ? { evidenceRef: evidenceRef.slice(0, 180) } : null),
      };
    });
    return {
      confirmMarker: confirmMarker.slice(0, 160),
      facts,
    };
  }
  if (toolName === "search_product_docs") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("search_product_docs requires query.");
    const limit = normalizeBoundedInteger(
      args.limit,
      "search_product_docs limit",
      1,
      10,
    );
    const section = normalizeString(args.section);
    const audience = normalizeString(args.audience);
    return {
      query: query.slice(0, 240),
      ...(limit ? { limit } : null),
      ...(section ? { section: section.slice(0, 80) } : null),
      ...(audience ? { audience: audience.slice(0, 40) } : null),
    };
  }
  if (toolName === "get_product_doc") {
    const slug = normalizeString(args.slug);
    if (!slug) throw new Error("get_product_doc requires slug.");
    const heading = normalizeString(args.heading);
    return {
      slug: slug.slice(0, 160),
      ...(heading ? { heading: heading.slice(0, 160) } : null),
    };
  }
  if (toolName === "web_research") {
    const action = normalizeString(args.action)?.toLowerCase();
    if (!action) throw new Error("web_research requires action.");
    if (action === "search") {
      const query = normalizeString(args.query);
      if (!query) throw new Error("web_research search requires query.");
      return {
        action: "search",
        query: query.slice(0, 512),
      };
    }
    if (action === "open_page") {
      const url = normalizeString(args.url);
      if (!url) throw new Error("web_research open_page requires url.");
      return {
        action: "open_page",
        url: url.slice(0, 2048),
      };
    }
    if (action === "find_in_page") {
      const url = normalizeString(args.url);
      const query = normalizeString(args.query);
      if (!url || !query) {
        throw new Error("web_research find_in_page requires url and query.");
      }
      return {
        action: "find_in_page",
        url: url.slice(0, 2048),
        query: query.slice(0, 512),
      };
    }
    throw new Error(
      "web_research action must be search, open_page, or find_in_page.",
    );
  }
  if (toolName === "web_crawl") {
    const url = normalizeString(args.url);
    if (!url) throw new Error("web_crawl requires url.");
    const rawStrategy = normalizeString(args.strategy)?.toLowerCase();
    const strategy =
      rawStrategy === "simple" ||
      rawStrategy === "crawl" ||
      rawStrategy === "auto"
        ? rawStrategy
        : "auto";
    const rawDestination = normalizeString(args.destination)?.toLowerCase();
    const destination =
      rawDestination === "active_community_sources"
        ? "active_community_sources"
        : "context";
    const maxPages = normalizeBoundedInteger(
      args.max_pages,
      "web_crawl max_pages",
      1,
      100,
    );
    const maxDepth = normalizeBoundedInteger(
      args.max_depth,
      "web_crawl max_depth",
      0,
      4,
    );
    const maxChars = normalizeBoundedInteger(
      args.max_chars,
      "web_crawl max_chars",
      1000,
      80000,
    );
    return {
      url: url.slice(0, 2048),
      strategy,
      destination,
      ...(maxPages ? { maxPages } : null),
      ...(maxDepth !== null ? { maxDepth } : null),
      ...(maxChars ? { maxChars } : null),
    };
  }
  return {};
}
