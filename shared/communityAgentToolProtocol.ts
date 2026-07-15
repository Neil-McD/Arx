import {
  COMMUNITY_MEMORY_DECISION_DISPOSITIONS,
  COMMUNITY_MEMORY_NODE_TYPES,
  normalizeCommunityMemoryDecision,
} from "./communityMemoryDecisionContract";

type JsonSchema =
  | {
      type?: string | string[];
      description?: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      minItems?: number;
      maxItems?: number;
      items?: JsonSchema;
      anyOf?: JsonSchema[];
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, JsonSchema>;
    }
  | boolean
  | Record<string, unknown>;

export type CommunityAgentToolName = "list" | "read" | "search" | "write";

export const CANONICAL_COMMUNITY_AGENT_KEY = "community_agent" as const;

export const COMMUNITY_AGENT_TOOL_NAMES = ["list", "read", "search", "write"] as const;

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
  enum: [...COMMUNITY_MEMORY_NODE_TYPES, null],
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
  write: {
    type: "function",
    name: "write",
    description: "Atomically settle versioned compiler work as retained memory, evidence carried into existing memory, or an explicit low-signal no-op.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "payload"],
      properties: {
        operation: {
          type: "string",
          enum: ["settle_compiler_digest_items"],
        },
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["digestId", "decisions"],
          properties: {
            digestId: {
              type: ["string", "null"],
              minLength: 1,
              maxLength: 128,
            },
            decisions: {
              type: "array",
              minItems: 1,
              maxItems: 96,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "workKey",
                  "disposition",
                  "nodeType",
                  "title",
                  "bodyMd",
                  "appliesWhen",
                  "doesNotApplyWhen",
                  "confidence",
                  "existingNodeId",
                  "reason",
                ],
                properties: {
                  workKey: { type: "string", minLength: 1, maxLength: 128 },
                  disposition: {
                    type: "string",
                    enum: [...COMMUNITY_MEMORY_DECISION_DISPOSITIONS],
                  },
                  nodeType: NODE_TYPE_SCHEMA,
                  title: { type: ["string", "null"], maxLength: 240 },
                  bodyMd: { type: ["string", "null"], maxLength: 12_000 },
                  appliesWhen: { type: ["string", "null"], maxLength: 4_000 },
                  doesNotApplyWhen: { type: ["string", "null"], maxLength: 4_000 },
                  confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
                  existingNodeId: { type: ["string", "null"], maxLength: 128 },
                  reason: { type: "string", minLength: 1, maxLength: 1_000 },
                },
              },
            },
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

// The role supplies its bounded tool list; no argument returns the complete
// current set for compatibility with direct internal runs.
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
  if (toolName === "write") {
    const operation = requireNonEmptyString(args.operation, "operation", 120);
    if (operation !== "settle_compiler_digest_items") {
      throw new Error("community_agent_tool_operation_invalid");
    }
    const payload = payloadObject(args.payload);
    if (!Array.isArray(payload.decisions) || payload.decisions.length === 0 || payload.decisions.length > 96) {
      throw new Error("community_agent_tool_decisions_invalid");
    }
    const decisions = payload.decisions.map((decision) =>
      normalizeCommunityMemoryDecision(payloadObject(decision)),
    );
    if (new Set(decisions.map((decision) => decision.workKey)).size !== decisions.length) {
      throw new Error("community_agent_tool_decision_work_key_duplicate");
    }
    return {
      operation,
      payload: {
        digestId: requireNonEmptyString(payload.digestId, "digest_id", 128),
        decisions,
      },
    };
  }
  throw new Error("community_agent_tool_unknown");
}
