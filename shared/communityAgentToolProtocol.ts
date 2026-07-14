type JsonSchema =
  | {
      type?: string | string[];
      description?: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, JsonSchema>;
    }
  | boolean
  | Record<string, unknown>;

export type CommunityAgentToolName = "list" | "read" | "search" | "note" | "write";

export const CANONICAL_COMMUNITY_AGENT_KEY = "community_agent" as const;

export const COMMUNITY_AGENT_TOOL_NAMES = ["list", "read", "search", "note", "write"] as const;

export type CommunityAgentFunctionTool = {
  type: "function";
  name: CommunityAgentToolName;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
};

// Strict function calling requires every property to be listed in `required`;
// optionality is expressed as a nullable type instead. The parse layer treats
// null as "not provided" for all of these.
const LIMIT_SCHEMA: JsonSchema = {
  type: ["integer", "null"],
  minimum: 1,
  maximum: 100,
};

const NODE_TYPE_SCHEMA: JsonSchema = {
  type: ["string", "null"],
  enum: [
    "playbook",
    "insight",
    "example",
    "warning_failure",
    "decision_judgment",
    "open_question",
    null,
  ],
};

const TOOL_DEFINITIONS: Record<CommunityAgentToolName, CommunityAgentFunctionTool> = {
  list: {
    type: "function",
    name: "list",
    description: "List entries in the community agent filesystem. Only /compiler and /directory paths are available.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path", "limit"],
      properties: {
        path: {
          type: ["string", "null"],
          maxLength: 1024,
        },
        limit: LIMIT_SCHEMA,
      },
    },
  },
  read: {
    type: "function",
    name: "read",
    description: "Read one file from the community agent filesystem.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: {
          type: "string",
          minLength: 1,
          maxLength: 1024,
        },
      },
    },
  },
  search: {
    type: "function",
    name: "search",
    description: "Search compiler and directory state for bounded community-agent inspection.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "limit"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 512,
        },
        limit: LIMIT_SCHEMA,
      },
    },
  },
  note: {
    type: "function",
    name: "note",
    description: "Append a note to this cycle's shared ledger. Notes are how roles hand context to each other; they never touch the directory.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["note"],
      properties: {
        note: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
        },
      },
    },
  },
  write: {
    type: "function",
    name: "write",
    description: "Atomically validate and retain one compiler digest item as community memory. Strong evidence becomes promising memory; incomplete or higher-risk evidence remains forming memory.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "payload"],
      properties: {
        operation: {
          type: "string",
          enum: ["retain_compiler_digest_item"],
        },
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["digestId", "itemIndex", "nodeType"],
          properties: {
            digestId: {
              type: ["string", "null"],
              minLength: 1,
              maxLength: 128,
            },
            itemIndex: {
              type: ["integer", "null"],
              minimum: 0,
              maximum: 100,
            },
            nodeType: NODE_TYPE_SCHEMA,
          },
        },
      },
    },
  },
};

function boundedString(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function boundedLimit(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(100, parsed));
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function requireNonEmptyString(raw: unknown, field: string, maxLength: number): string {
  const value = boundedString(raw, maxLength);
  if (!value) throw new Error(`community_agent_tool_${field}_required`);
  return value;
}

function normalizeNodeType(raw: unknown): string | undefined {
  const value = boundedString(raw, 80);
  if (!value) return undefined;
  const allowed = new Set([
    "playbook",
    "insight",
    "example",
    "warning_failure",
    "decision_judgment",
    "open_question",
  ]);
  if (!allowed.has(value)) throw new Error("community_agent_tool_node_type_invalid");
  return value;
}

// Role-filtered builder: pass a role's tool allowlist and only those schemas
// are sent to the model. Authority by absence — a role that cannot write never
// sees the write tool at all. No argument returns the complete current set.
export function buildCommunityAgentFunctionTools(
  toolNames?: readonly CommunityAgentToolName[],
): CommunityAgentFunctionTool[] {
  const names = toolNames && toolNames.length > 0 ? toolNames : COMMUNITY_AGENT_TOOL_NAMES;
  return names.map((name) => TOOL_DEFINITIONS[name]);
}

export function normalizeCommunityAgentToolArguments(
  toolName: CommunityAgentToolName,
  rawArgs: Record<string, unknown>,
): Record<string, unknown> {
  const args = payloadObject(rawArgs);
  if (toolName === "list") {
    return {
      path: boundedString(args.path ?? "/", 1024) || "/",
      limit: boundedLimit(args.limit),
    };
  }
  if (toolName === "read") {
    return {
      path: requireNonEmptyString(args.path, "path", 1024),
    };
  }
  if (toolName === "search") {
    return {
      query: requireNonEmptyString(args.query, "query", 512),
      limit: boundedLimit(args.limit),
    };
  }
  if (toolName === "note") {
    return {
      note: requireNonEmptyString(args.note, "note", 2000),
    };
  }
  if (toolName === "write") {
    const operation = requireNonEmptyString(args.operation, "operation", 120);
    if (operation !== "retain_compiler_digest_item") {
      throw new Error("community_agent_tool_operation_invalid");
    }
    const payload = payloadObject(args.payload);
    const itemIndex = Math.floor(Number(payload.itemIndex));
    if (!Number.isFinite(itemIndex) || itemIndex < 0 || itemIndex > 100) {
      throw new Error("community_agent_tool_item_index_invalid");
    }
    const normalizedPayload: Record<string, unknown> = {
      digestId: requireNonEmptyString(payload.digestId, "digest_id", 128),
      itemIndex,
    };
    const nodeType = normalizeNodeType(payload.nodeType);
    if (nodeType) normalizedPayload.nodeType = nodeType;
    return {
      operation,
      payload: normalizedPayload,
    };
  }
  throw new Error("community_agent_tool_unknown");
}
