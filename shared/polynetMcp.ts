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
  | "polynet_community_search"
  | "polynet_list_workspaces"
  | "polynet_open_workspace"
  | "polynet_get_workspace_context"
  | "polynet_workspace_memory_search"
  | "polynet_workspace_memory_read"
  | "polynet_workspace_record_outcome";

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

const WORKSPACE_SUMMARY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspace_context_id", "workspace_type", "slug", "name", "relation"],
  properties: {
    workspace_context_id: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Opaque external selector for this PolyNet workspace context.",
    },
    workspace_type: { type: "string", enum: ["community"] },
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

const WORKSPACE_CONTEXT_ID_SCHEMA: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  description: "Workspace context selector returned by polynet_open_workspace.",
};

const COMMUNITY_MEMORY_TYPE_SCHEMA: JsonSchema = {
  type: "string",
  enum: [
    "playbook",
    "insight",
    "example",
    "warning_failure",
    "decision_judgment",
    "open_question",
  ],
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
  polynet_list_workspaces: {
    name: "polynet_list_workspaces",
    title: "List PolyNet Workspaces",
    description:
      "List the authenticated user's accessible PolyNet workspaces. In v0, workspaces are community contexts.",
    annotations: {
      title: "List PolyNet Workspaces",
      readOnlyHint: true,
    },
    inputSchema: EMPTY_OBJECT_SCHEMA,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspaces"],
      properties: {
        workspaces: {
          type: "array",
          items: WORKSPACE_SUMMARY_SCHEMA,
        },
      },
    },
  },
  polynet_open_workspace: {
    name: "polynet_open_workspace",
    title: "Open PolyNet Workspace",
    description:
      "Open one accessible PolyNet community workspace by slug and return a portable workspace context selector.",
    annotations: {
      title: "Open PolyNet Workspace",
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
      additionalProperties: true,
      required: ["workspace"],
      properties: {
        workspace: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_get_workspace_context: {
    name: "polynet_get_workspace_context",
    title: "Get PolyNet Workspace Context",
    description:
      "Read bounded identity, access, and memory-orientation context for an opened PolyNet workspace.",
    annotations: {
      title: "Get PolyNet Workspace Context",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace"],
      properties: {
        workspace: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_memory_search: {
    name: "polynet_workspace_memory_search",
    title: "Search PolyNet Workspace Memory",
    description:
      "Search accepted community intelligence in an opened PolyNet workspace. This returns learned memory, not raw archive evidence.",
    annotations: {
      title: "Search PolyNet Workspace Memory",
      readOnlyHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        query: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          description: "Optional focused topic or question to search in accepted community memory.",
        },
        types: {
          type: "array",
          maxItems: 6,
          items: COMMUNITY_MEMORY_TYPE_SCHEMA,
        },
        limit: {
          type: "number",
          description: "Maximum memory entries to return, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "memory"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        memory: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_memory_read: {
    name: "polynet_workspace_memory_read",
    title: "Read PolyNet Workspace Memory",
    description:
      "Read one accepted community memory node plus a bounded visibility-filtered subgraph bundle.",
    annotations: {
      title: "Read PolyNet Workspace Memory",
      readOnlyHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id", "node_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        node_id: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Accepted community memory node id returned by memory search.",
        },
        retrieval_log_id: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Optional retrieval log id returned by memory search.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "memory"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        memory: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_record_outcome: {
    name: "polynet_workspace_record_outcome",
    title: "Record PolyNet Workspace Memory Outcome",
    description:
      "Record whether accepted community memory retrieved through an opened PolyNet workspace worked, failed, or was mixed.",
    annotations: {
      title: "Record PolyNet Workspace Memory Outcome",
      destructiveHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id", "retrieval_log_id", "result_status"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        retrieval_log_id: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Retrieval log id returned by memory search or read.",
        },
        node_id: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Optional memory node id the outcome applies to.",
        },
        result_status: {
          type: "string",
          enum: ["worked", "failed", "mixed"],
        },
        notes: {
          type: "string",
          maxLength: 1000,
          description: "Optional concise outcome note.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "outcome"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        outcome: {
          type: "object",
          additionalProperties: true,
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
