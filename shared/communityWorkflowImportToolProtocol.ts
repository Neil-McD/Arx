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
      additionalProperties?: boolean | JsonSchema;
      properties?: Record<string, JsonSchema>;
      items?: JsonSchema;
    }
  | boolean
  | Record<string, unknown>;

export type CommunityWorkflowImportToolName =
  | "read_import_context"
  | "search_import_candidates"
  | "write_import_ledger"
  | "finish_import_analysis";

export const COMMUNITY_WORKFLOW_IMPORT_TOOL_NAMES = [
  "read_import_context",
  "search_import_candidates",
  "write_import_ledger",
  "finish_import_analysis",
] as const;

export type CommunityWorkflowImportFunctionTool = {
  type: "function";
  name: CommunityWorkflowImportToolName;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
};

const LIMIT_SCHEMA: JsonSchema = {
  type: "integer",
  minimum: 1,
  maximum: 8,
};

const CONTEXT_SECTION_SCHEMA: JsonSchema = {
  type: "string",
  enum: [
    "all",
    "community",
    "harness_output",
    "ledger",
    "existing_integrations",
  ],
};

const CANDIDATE_KIND_SCHEMA: JsonSchema = {
  type: "string",
  enum: ["all", "mcp_server", "skill", "markdown", "repository"],
};

const LEDGER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true,
};

const TOOL_DEFINITIONS: Record<
  CommunityWorkflowImportToolName,
  CommunityWorkflowImportFunctionTool
> = {
  read_import_context: {
    type: "function",
    name: "read_import_context",
    description:
      "Read bounded context for the workflow import draft. Raw harness output is only available through this internal tool.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        section: CONTEXT_SECTION_SCHEMA,
      },
    },
  },
  search_import_candidates: {
    type: "function",
    name: "search_import_candidates",
    description:
      "Search the pasted harness output, current ledger, and PolyNet app catalog for MCP, skill, markdown, or repository candidates.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 512,
        },
        kind: CANDIDATE_KIND_SCHEMA,
        limit: LIMIT_SCHEMA,
      },
    },
  },
  write_import_ledger: {
    type: "function",
    name: "write_import_ledger",
    description:
      "Write the current workflow import ledger. This records analysis only and does not attach MCP servers, skills, or repositories.",
    strict: false,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["ledger"],
      properties: {
        ledger: LEDGER_SCHEMA,
        note: {
          type: "string",
          maxLength: 500,
        },
      },
    },
  },
  finish_import_analysis: {
    type: "function",
    name: "finish_import_analysis",
    description:
      "Finish the import analysis as ready for builder review or failed. This still does not apply integrations.",
    strict: false,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["status", "summary"],
      properties: {
        status: {
          type: "string",
          enum: ["ready_for_review", "failed"],
        },
        ledger: LEDGER_SCHEMA,
        summary: {
          type: "string",
          minLength: 1,
          maxLength: 1200,
        },
        errorMessage: {
          type: "string",
          maxLength: 500,
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
  return Math.max(1, Math.min(8, parsed));
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function requirePayloadObject(raw: unknown, field: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`workflow_import_tool_${field}_object_required`);
  }
  return raw as Record<string, unknown>;
}

function requireNonEmptyString(raw: unknown, field: string, maxLength: number): string {
  const value = boundedString(raw, maxLength);
  if (!value) throw new Error(`workflow_import_tool_${field}_required`);
  return value;
}

function normalizeSection(raw: unknown): string {
  const value = boundedString(raw, 80) || "all";
  const allowed = new Set([
    "all",
    "community",
    "harness_output",
    "ledger",
    "existing_integrations",
  ]);
  if (!allowed.has(value)) throw new Error("workflow_import_tool_section_invalid");
  return value;
}

function normalizeCandidateKind(raw: unknown): string {
  const value = boundedString(raw, 80) || "all";
  const allowed = new Set(["all", "mcp_server", "skill", "markdown", "repository"]);
  if (!allowed.has(value)) throw new Error("workflow_import_tool_kind_invalid");
  return value;
}

function normalizeFinishStatus(raw: unknown): "ready_for_review" | "failed" {
  const value = boundedString(raw, 80);
  if (value === "ready_for_review" || value === "failed") return value;
  throw new Error("workflow_import_tool_status_invalid");
}

export function buildCommunityWorkflowImportFunctionTools(): CommunityWorkflowImportFunctionTool[] {
  return COMMUNITY_WORKFLOW_IMPORT_TOOL_NAMES.map((name) => TOOL_DEFINITIONS[name]);
}

export function normalizeCommunityWorkflowImportToolArguments(
  toolName: CommunityWorkflowImportToolName,
  rawArgs: Record<string, unknown>,
): Record<string, unknown> {
  const args = payloadObject(rawArgs);
  if (toolName === "read_import_context") {
    return {
      section: normalizeSection(args.section),
    };
  }
  if (toolName === "search_import_candidates") {
    return {
      query: requireNonEmptyString(args.query, "query", 512),
      kind: normalizeCandidateKind(args.kind),
      limit: boundedLimit(args.limit),
    };
  }
  if (toolName === "write_import_ledger") {
    return {
      ledger: requirePayloadObject(args.ledger, "ledger"),
      note: boundedString(args.note, 500) || undefined,
    };
  }
  if (toolName === "finish_import_analysis") {
    const normalized: Record<string, unknown> = {
      status: normalizeFinishStatus(args.status),
      summary: requireNonEmptyString(args.summary, "summary", 1200),
    };
    if (args.ledger !== undefined) normalized.ledger = requirePayloadObject(args.ledger, "ledger");
    const errorMessage = boundedString(args.errorMessage, 500);
    if (errorMessage) normalized.errorMessage = errorMessage;
    return normalized;
  }
  throw new Error("workflow_import_tool_unknown");
}
