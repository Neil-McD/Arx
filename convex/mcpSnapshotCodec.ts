import { normalizeString } from "./appCore";

export type StoredMcpToolRiskLevel = "read" | "write" | "sensitive";
export type StoredMcpToolInputSchemaKind =
  | "object"
  | "boolean"
  | "missing"
  | "invalid";

export type StoredMcpToolRecord = {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema_json: string | null;
  input_schema_kind: StoredMcpToolInputSchemaKind;
  risk_level: StoredMcpToolRiskLevel;
};

export type DecodedStoredMcpToolRecord = StoredMcpToolRecord & {
  input_schema: Record<string, unknown> | boolean;
};

type StoredMcpToolLike = {
  tool_name?: unknown;
  namespaced_tool_name?: unknown;
  description?: unknown;
  input_schema_json?: unknown;
  input_schema_kind?: unknown;
  input_schema?: unknown;
  risk_level?: unknown;
};

const DEFAULT_TOOL_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: true,
  properties: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeStoredMcpToolRiskLevel(
  value: unknown,
): StoredMcpToolRiskLevel {
  return value === "write" || value === "sensitive" ? value : "read";
}

export function encodeMcpToolInputSchemaForStorage(value: unknown): Pick<
  StoredMcpToolRecord,
  "input_schema_json" | "input_schema_kind"
> {
  if (typeof value === "boolean") {
    return {
      input_schema_json: JSON.stringify(value),
      input_schema_kind: "boolean",
    };
  }
  if (isPlainObject(value)) {
    try {
      return {
        input_schema_json: JSON.stringify(value),
        input_schema_kind: "object",
      };
    } catch {
      return {
        input_schema_json: null,
        input_schema_kind: "invalid",
      };
    }
  }
  if (value === undefined || value === null) {
    return {
      input_schema_json: null,
      input_schema_kind: "missing",
    };
  }
  return {
    input_schema_json: null,
    input_schema_kind: "invalid",
  };
}

function parseStoredMcpToolInputSchema(
  value: unknown,
): Record<string, unknown> | boolean | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "boolean") return parsed;
    if (isPlainObject(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function decodeStoredMcpToolInputSchema(
  rawTool: StoredMcpToolLike | null,
): Record<string, unknown> | boolean {
  const encoded = parseStoredMcpToolInputSchema(rawTool?.input_schema_json);
  if (encoded !== null) return encoded;
  if (typeof rawTool?.input_schema === "boolean") return rawTool.input_schema;
  if (isPlainObject(rawTool?.input_schema)) return rawTool.input_schema;
  return DEFAULT_TOOL_INPUT_SCHEMA;
}

export function encodeMcpToolForStorage(params: {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: StoredMcpToolRiskLevel;
}): StoredMcpToolRecord {
  return {
    tool_name: params.tool_name,
    namespaced_tool_name: params.namespaced_tool_name,
    description: params.description,
    ...encodeMcpToolInputSchemaForStorage(params.input_schema),
    risk_level: params.risk_level,
  };
}

export function normalizeStoredSnapshotTools(
  rawTools: unknown,
): DecodedStoredMcpToolRecord[] {
  if (!Array.isArray(rawTools)) return [];
  const tools: DecodedStoredMcpToolRecord[] = [];
  const seen = new Set<string>();
  for (const rawTool of rawTools) {
    if (!isPlainObject(rawTool)) continue;
    const tool = rawTool as StoredMcpToolLike;
    const toolName = normalizeString(tool.tool_name, 200);
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    tools.push({
      tool_name: toolName,
      namespaced_tool_name:
        normalizeString(tool.namespaced_tool_name, 240) || toolName,
      description: normalizeString(tool.description, 2_000) || null,
      input_schema_json:
        normalizeString(tool.input_schema_json, 200_000) || null,
      input_schema_kind:
        tool.input_schema_kind === "object" ||
        tool.input_schema_kind === "boolean" ||
        tool.input_schema_kind === "missing" ||
        tool.input_schema_kind === "invalid"
          ? tool.input_schema_kind
          : tool.input_schema !== undefined
            ? "object"
            : "missing",
      input_schema: decodeStoredMcpToolInputSchema(tool),
      risk_level: normalizeStoredMcpToolRiskLevel(tool.risk_level),
    });
  }
  return tools;
}
