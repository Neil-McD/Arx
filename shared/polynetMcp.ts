type JsonSchema =
  | {
      type?: string | string[];
      title?: string;
      description?: string;
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, JsonSchema>;
      items?: JsonSchema;
      enum?: string[];
      minLength?: number;
      maxLength?: number;
      minItems?: number;
      maxItems?: number;
    }
  | boolean;

export type PolynetMcpToolName =
  | "polynet_list_communities"
  | "polynet_get_community"
  | "polynet_community_search";

export type PolynetMcpToolDefinition = {
  name: PolynetMcpToolName;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const COMMUNITY_SUMMARY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "name", "relation", "visibility", "entry_policy"],
  properties: {
    slug: { type: "string", minLength: 1, maxLength: 160 },
    name: { type: "string", minLength: 1, maxLength: 180 },
    one_liner: { type: ["string", "null"], maxLength: 280 },
    visibility: { type: "string", enum: ["published", "unlisted"] },
    entry_policy: { type: "string", enum: ["open", "approval", "paid_subscription"] },
    relation: {
      type: "string",
      enum: ["owner", "admin", "moderator", "member", "pending", "visitor"],
    },
  },
};

const TOOL_DEFINITIONS: Record<PolynetMcpToolName, PolynetMcpToolDefinition> = {
  polynet_list_communities: {
    name: "polynet_list_communities",
    title: "List PolyNet Communities",
    description:
      "List the authenticated user's accessible PolyNet communities with concise identity and access summaries.",
    annotations: {
      title: "List PolyNet Communities",
      readOnlyHint: true,
    },
    inputSchema: EMPTY_OBJECT_SCHEMA,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["communities"],
      properties: {
        communities: {
          type: "array",
          items: COMMUNITY_SUMMARY_SCHEMA,
        },
      },
    },
  },
  polynet_get_community: {
    name: "polynet_get_community",
    title: "Get PolyNet Community",
    description:
      "Read one PolyNet community's canonical identity, access relation, and capability summary by slug.",
    annotations: {
      title: "Get PolyNet Community",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["community_slug"],
      properties: {
        community_slug: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "The canonical community slug.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["community"],
      properties: {
        community: {
          type: "object",
          additionalProperties: false,
          required: [
            "slug",
            "name",
            "relation",
            "visibility",
            "entry_policy",
            "is_entitled",
            "capabilities",
          ],
          properties: {
            slug: { type: "string", minLength: 1, maxLength: 160 },
            name: { type: "string", minLength: 1, maxLength: 180 },
            one_liner: { type: ["string", "null"], maxLength: 280 },
            about: { type: ["string", "null"], maxLength: 4000 },
            visibility: { type: "string", enum: ["published", "unlisted"] },
            entry_policy: { type: "string", enum: ["open", "approval", "paid_subscription"] },
            relation: {
              type: "string",
              enum: ["owner", "admin", "moderator", "member", "pending", "visitor"],
            },
            is_entitled: { type: "boolean" },
            capabilities: {
              type: "object",
              additionalProperties: false,
              required: [
                "can_view",
                "can_enter_community",
                "can_read_chat",
                "can_post_chat",
                "can_post_message",
                "can_manage_resources",
                "can_moderate_content",
                "can_manage_members",
                "can_review_join_requests",
                "can_manage_pricing",
                "can_manage_branding",
                "can_manage_publishing",
                "can_manage_payouts",
              ],
              properties: {
                can_view: { type: "boolean" },
                can_enter_community: { type: "boolean" },
                can_read_chat: { type: "boolean" },
                can_post_chat: { type: "boolean" },
                can_post_message: { type: "boolean" },
                can_manage_resources: { type: "boolean" },
                can_moderate_content: { type: "boolean" },
                can_manage_members: { type: "boolean" },
                can_review_join_requests: { type: "boolean" },
                can_manage_pricing: { type: "boolean" },
                can_manage_branding: { type: "boolean" },
                can_manage_publishing: { type: "boolean" },
                can_manage_payouts: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
  polynet_community_search: {
    name: "polynet_community_search",
    title: "Search PolyNet Community Memory",
    description:
      "Search a PolyNet community's recent live context and compiled archive memory by community slug.",
    annotations: {
      title: "Search PolyNet Community Memory",
      readOnlyHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["community_slug", "query"],
      properties: {
        community_slug: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "The canonical community slug.",
        },
        query: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          description: "A focused question or topic to search within the community's knowledge.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["community", "query", "recent_context", "archive_context"],
      properties: {
        community: {
          type: "object",
          additionalProperties: false,
          required: ["slug", "name"],
          properties: {
            slug: { type: "string" },
            name: { type: "string" },
          },
        },
        query: { type: "string" },
        recent_context: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        archive_context: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
};

export const POLYNET_MCP_PROTOCOL_VERSION = "2025-11-25";
export const POLYNET_MCP_COMPAT_PROTOCOL_VERSION = "2025-03-26";

export function getPolynetMcpToolDefinitions(): PolynetMcpToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

export function getPolynetMcpToolDefinition(
  name: string,
): PolynetMcpToolDefinition | null {
  return TOOL_DEFINITIONS[name as PolynetMcpToolName] ?? null;
}
