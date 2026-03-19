import type { RetrievalToolName } from "./retrievalTools";

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
    strict: true;
  };
};

export type ResponsesApiFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: true;
};

const PATH_ONLY_TOOL_SCHEMA: JsonSchema = {
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
};

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

const COMMUNITY_SEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
  },
};

const COMMUNITY_WRITE_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["post_type", "title", "body", "evidence"],
  properties: {
    post_type: {
      type: "string",
      enum: ["observation", "recommendation", "action"],
    },
    title: {
      type: "string",
      maxLength: 180,
    },
    body: {
      type: "string",
      minLength: 1,
      maxLength: 12000,
    },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 180,
      },
    },
  },
};

const READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    offset: {
      type: "integer",
      minimum: 1,
      maximum: 1000000,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
    },
  },
};

const PATH_AND_PATTERN_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pattern"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    pattern: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
  },
};

const WRITE_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "content"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    content: {
      type: "string",
      maxLength: 200000,
    },
  },
};

const EDIT_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "old_text", "new_text"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    old_text: {
      type: "string",
      minLength: 1,
      maxLength: 100000,
    },
    new_text: {
      type: "string",
      maxLength: 100000,
    },
    replace_all: {
      type: "boolean",
    },
  },
};

const BASH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["command"],
  properties: {
    command: {
      type: "string",
      minLength: 1,
      maxLength: 20000,
    },
    cwd: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
  },
};

const TOOL_REGISTRY: Record<RetrievalToolName, ToolRegistryEntry> = {
  community_search: {
    name: "community_search",
    description: "Search the active community's recent context and archived memory for relevant chat, AI feed, resource, and PDF-linked knowledge.",
    inputSchema: COMMUNITY_SEARCH_TOOL_SCHEMA,
  },
  community_write: {
    name: "community_write",
    description: "Publish a grounded agent post into the active community live feed.",
    inputSchema: COMMUNITY_WRITE_TOOL_SCHEMA,
  },
  web_research: {
    name: "web_research",
    description: "Research the live web by searching documentation, opening a page, or finding text within a page.",
    inputSchema: WEB_RESEARCH_TOOL_SCHEMA,
  },
  list_dir: {
    name: "list_dir",
    description: "List files and directories under a project-bound workspace path.",
    inputSchema: PATH_ONLY_TOOL_SCHEMA,
  },
  read: {
    name: "read",
    description: "Read a UTF-8 text file or directory listing from a project-bound workspace path.",
    inputSchema: READ_TOOL_SCHEMA,
  },
  glob: {
    name: "glob",
    description: "Match workspace files or directories by glob pattern.",
    inputSchema: PATH_AND_PATTERN_TOOL_SCHEMA,
  },
  grep: {
    name: "grep",
    description: "Search workspace files for a text or regex pattern.",
    inputSchema: PATH_AND_PATTERN_TOOL_SCHEMA,
  },
  sha256: {
    name: "sha256",
    description: "Compute the SHA-256 digest of a workspace file.",
    inputSchema: PATH_ONLY_TOOL_SCHEMA,
  },
  write: {
    name: "write",
    description: "Write or overwrite a workspace file with the provided UTF-8 content.",
    inputSchema: WRITE_TOOL_SCHEMA,
  },
  edit: {
    name: "edit",
    description: "Edit a workspace file by replacing old_text with new_text.",
    inputSchema: EDIT_TOOL_SCHEMA,
  },
  bash: {
    name: "bash",
    description: "Run a shell command inside the bound project workspace.",
    inputSchema: BASH_TOOL_SCHEMA,
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

export function buildOpenAiFunctionTools(
  names: readonly RetrievalToolName[],
): OpenAiFunctionTool[] {
  return getToolDefinitions(names).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: true,
    },
  }));
}

function buildStrictResponsesApiSchema(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const record = schema as Record<string, unknown>;
  if (record.type !== "object") return schema;
  const properties =
    record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)
      ? (record.properties as Record<string, JsonSchema>)
      : null;
  if (!properties) return schema;

  const required = Array.isArray(record.required)
    ? record.required
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
    : [];

  const nextProperties: Record<string, JsonSchema> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!required.includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const propertyRecord = value as Record<string, unknown>;
      const propertyType = propertyRecord.type;
      if (typeof propertyType === "string") {
        nextProperties[key] = {
          ...propertyRecord,
          type: [propertyType, "null"],
        };
        continue;
      }
      if (Array.isArray(propertyType)) {
        const normalizedTypes = propertyType
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0);
        nextProperties[key] = {
          ...propertyRecord,
          type: normalizedTypes.includes("null") ? normalizedTypes : [...normalizedTypes, "null"],
        };
        continue;
      }
    }
    nextProperties[key] = value;
  }

  return {
    ...record,
    properties: nextProperties,
    required: Object.keys(properties),
  };
}

export function buildResponsesApiFunctionTools(
  names: readonly RetrievalToolName[],
): ResponsesApiFunctionTool[] {
  return getToolDefinitions(names).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: buildStrictResponsesApiSchema(tool.inputSchema),
    strict: true,
  }));
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
  maxValue: number,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a number.`);
  const integer = Math.floor(parsed);
  if (integer < 1) throw new Error(`${fieldName} must be greater than or equal to 1.`);
  return Math.min(integer, maxValue);
}

export function normalizeToolArguments(
  toolName: RetrievalToolName,
  rawArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {};
  if (toolName === "list_dir") {
    const path = normalizeString(args.path);
    if (!path) throw new Error("list_dir requires path.");
    return { path: path.slice(0, 1024) };
  }
  if (toolName === "community_search") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("community_search requires query.");
    return { query: query.slice(0, 240) };
  }
  if (toolName === "community_write") {
    const body = normalizeString(args.body);
    if (!body) throw new Error("community_write requires body.");
    const title = normalizeString(args.title);
    if (!title) throw new Error("community_write requires title.");
    const evidence = Array.isArray(args.evidence)
      ? args.evidence
          .map((value) => normalizeString(value))
          .filter((value): value is string => Boolean(value))
          .slice(0, 4)
      : [];
    if (evidence.length === 0) throw new Error("community_write requires evidence.");
    const postType = normalizeString(args.post_type)?.toLowerCase();
    if (!postType || (postType !== "observation" && postType !== "recommendation" && postType !== "action")) {
      throw new Error("community_write requires post_type.");
    }
    return {
      post_type: postType,
      title: title.slice(0, 180),
      body: body.slice(0, 12000),
      evidence: evidence.map((value) => value.slice(0, 180)),
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
    throw new Error("web_research action must be search, open_page, or find_in_page.");
  }
  if (toolName === "read") {
    const path = normalizeString(args.path);
    if (!path) throw new Error("read requires path.");
    const offset = normalizePositiveInteger(args.offset, "read offset", 1_000_000);
    const limit = normalizePositiveInteger(args.limit, "read limit", 1_000);
    return {
      path: path.slice(0, 1024),
      ...(offset ? { offset } : null),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "glob" || toolName === "grep") {
    const pattern = normalizeString(args.pattern);
    if (!pattern) throw new Error(`${toolName} requires pattern.`);
    const path = normalizeString(args.path);
    return {
      pattern: pattern.slice(0, 1024),
      ...(path ? { path: path.slice(0, 1024) } : null),
    };
  }
  if (toolName === "sha256") {
    const path = normalizeString(args.path);
    if (!path) throw new Error("sha256 requires path.");
    return { path: path.slice(0, 1024) };
  }
  if (toolName === "write") {
    const path = normalizeString(args.path);
    if (!path) throw new Error("write requires path.");
    if (typeof args.content !== "string") throw new Error("write requires content.");
    return {
      path: path.slice(0, 1024),
      content: args.content.slice(0, 200000),
    };
  }
  if (toolName === "edit") {
    const path = normalizeString(args.path);
    if (!path) throw new Error("edit requires path.");
    if (typeof args.old_text !== "string" || args.old_text.length === 0) {
      throw new Error("edit requires old_text.");
    }
    if (typeof args.new_text !== "string") throw new Error("edit requires new_text.");
    return {
      path: path.slice(0, 1024),
      old_text: args.old_text.slice(0, 100000),
      new_text: args.new_text.slice(0, 100000),
      replace_all: args.replace_all === true,
    };
  }
  if (toolName === "bash") {
    const command = normalizeString(args.command);
    if (!command) throw new Error("bash requires command.");
    const cwd = normalizeString(args.cwd);
    return {
      command: command.slice(0, 20000),
      ...(cwd ? { cwd: cwd.slice(0, 1024) } : null),
    };
  }
  return {};
}
