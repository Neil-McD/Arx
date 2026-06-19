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
  | "polynet_product_docs_search"
  | "polynet_product_doc_read"
  | "polynet_list_workspaces"
  | "polynet_open_workspace"
  | "polynet_get_workspace_context"
  | "polynet_workspace_memory_search"
  | "polynet_workspace_memory_read"
  | "polynet_workspace_record_outcome"
  | "polynet_workspace_resources_map"
  | "polynet_workspace_resources_list"
  | "polynet_workspace_resource_read"
  | "polynet_workspace_resources_search"
  | "polynet_workspace_builder_resources_map"
  | "polynet_workspace_builder_resources_list"
  | "polynet_workspace_builder_resource_read";

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

const MCP_ACCESS_RELATION_VALUES = [
  "owner",
  "admin",
  "moderator",
  "member",
  "pending",
  "no_access",
];

const MCP_AUTHORITY_LENS_VALUES = [
  "owner_builder",
  "owner",
  "admin_builder",
  "admin",
  "moderator",
  "member",
  "pending",
  "no_access",
];

const MCP_TOOLSET_VALUES = [
  "workspace_context",
  "accepted_memory",
  "raw_evidence_search",
  "member_resources",
  "builder_resources",
  "join_request_review",
  "community_admin",
  "owner_controls",
];

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
      enum: MCP_ACCESS_RELATION_VALUES,
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
      description: "Opaque external selector for this Polynet workspace context.",
    },
    workspace_type: { type: "string", enum: ["community"] },
    slug: { type: "string", minLength: 1, maxLength: 160 },
    name: { type: "string", minLength: 1, maxLength: 180 },
    one_liner: { type: ["string", "null"], maxLength: 280 },
    visibility: { type: "string", enum: ["published", "unlisted"] },
    entry_policy: { type: "string", enum: ["open", "approval", "paid_subscription"] },
    relation: {
      type: "string",
      enum: MCP_ACCESS_RELATION_VALUES,
    },
  },
};

const WORKSPACE_AUTHORITY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relation", "authority_lens", "available_toolsets"],
  properties: {
    relation: {
      type: "string",
      enum: MCP_ACCESS_RELATION_VALUES,
      description: "MCP-facing community authority relation. Internal visitor state is projected as no_access.",
    },
    authority_lens: {
      type: "string",
      enum: MCP_AUTHORITY_LENS_VALUES,
      description: "Canonical authority lens derived from server-side access capabilities.",
    },
    available_toolsets: {
      type: "array",
      items: {
        type: "string",
        enum: MCP_TOOLSET_VALUES,
      },
      description: "Authority-enabled Polynet tool families for this workspace lens.",
    },
    unavailable_reason: {
      type: ["string", "null"],
      maxLength: 240,
      description: "Reason workspace toolsets are unavailable, when access is pending or missing.",
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
    title: "List Polynet Communities",
    description:
      "List the authenticated user's accessible Polynet communities with concise identity and access summaries.",
    annotations: {
      title: "List Polynet Communities",
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
    title: "Get Polynet Community",
    description:
      "Read one Polynet community's canonical identity, access relation, and capability summary by slug.",
    annotations: {
      title: "Get Polynet Community",
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
              enum: MCP_ACCESS_RELATION_VALUES,
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
    title: "Search Polynet Community Memory",
    description:
      "Search a Polynet community's recent live context and compiled archive memory by community slug.",
    annotations: {
      title: "Search Polynet Community Memory",
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
  polynet_product_docs_search: {
    name: "polynet_product_docs_search",
    title: "Search Polynet Product Docs",
    description:
      "Search canonical Polynet product documentation and return small ranked snippets with slugs for follow-up reads.",
    annotations: {
      title: "Search Polynet Product Docs",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          description: "Focused product documentation query.",
        },
        limit: {
          type: "number",
          description: "Maximum matching snippets to return, clamped by the server.",
        },
        section: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          description: "Optional documentation section filter.",
        },
        audience: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "Optional audience filter.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["product_docs"],
      properties: {
        product_docs: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_product_doc_read: {
    name: "polynet_product_doc_read",
    title: "Read Polynet Product Doc",
    description:
      "Read one canonical Polynet product documentation page, or one heading section from that page.",
    annotations: {
      title: "Read Polynet Product Doc",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug"],
      properties: {
        slug: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "Product documentation slug returned by product docs search.",
        },
        heading: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "Optional heading or heading slug to read from the page.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["product_doc"],
      properties: {
        product_doc: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_list_workspaces: {
    name: "polynet_list_workspaces",
    title: "List Polynet Workspaces",
    description:
      "List the authenticated user's accessible Polynet workspaces. In v0, workspaces are community contexts.",
    annotations: {
      title: "List Polynet Workspaces",
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
    title: "Open Polynet Workspace",
    description:
      "Open one accessible Polynet community workspace by slug and return a portable workspace context selector.",
    annotations: {
      title: "Open Polynet Workspace",
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
          required: ["authority"],
          properties: {
            authority: WORKSPACE_AUTHORITY_SCHEMA,
          },
        },
      },
    },
  },
  polynet_get_workspace_context: {
    name: "polynet_get_workspace_context",
    title: "Get Polynet Workspace Context",
    description:
      "Read bounded identity, access, and memory-orientation context for an opened Polynet workspace.",
    annotations: {
      title: "Get Polynet Workspace Context",
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
          required: ["authority"],
          properties: {
            authority: WORKSPACE_AUTHORITY_SCHEMA,
          },
        },
      },
    },
  },
  polynet_workspace_memory_search: {
    name: "polynet_workspace_memory_search",
    title: "Search Polynet Workspace Memory",
    description:
      "Search accepted community intelligence in an opened Polynet workspace. This returns learned memory, not raw archive evidence.",
    annotations: {
      title: "Search Polynet Workspace Memory",
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
    title: "Read Polynet Workspace Memory",
    description:
      "Read one accepted community memory node plus a bounded visibility-filtered subgraph bundle.",
    annotations: {
      title: "Read Polynet Workspace Memory",
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
    title: "Record Polynet Workspace Memory Outcome",
    description:
      "Record whether accepted community memory retrieved through an opened Polynet workspace worked, failed, or was mixed.",
    annotations: {
      title: "Record Polynet Workspace Memory Outcome",
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
  polynet_workspace_resources_map: {
    name: "polynet_workspace_resources_map",
    title: "Map Polynet Workspace Resources",
    description:
      "Map resource structure for an opened Polynet workspace. Members see live resources; builders may receive builder-visible structure and health according to server authority.",
    annotations: {
      title: "Map Polynet Workspace Resources",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        limit: {
          type: "number",
          description: "Maximum resources to include across the map, clamped by the server.",
        },
        per_module_limit: {
          type: "number",
          description: "Maximum resources to include per module, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resources"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_resources_list: {
    name: "polynet_workspace_resources_list",
    title: "List Polynet Workspace Resources",
    description:
      "List live member-visible resources in an opened Polynet workspace. This does not expose draft or builder-only resource state.",
    annotations: {
      title: "List Polynet Workspace Resources",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        path: {
          type: "string",
          minLength: 1,
          maxLength: 1024,
          description: "Optional resource directory path or directory URI. Defaults to the workspace resource root.",
        },
        limit: {
          type: "number",
          description: "Maximum directory entries to return, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resources"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_resource_read: {
    name: "polynet_workspace_resource_read",
    title: "Read Polynet Workspace Resource",
    description:
      "Read one live member-visible resource from an opened Polynet workspace by resource id, directory path, or directory URI.",
    annotations: {
      title: "Read Polynet Workspace Resource",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id", "ref"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        ref: {
          type: "string",
          minLength: 1,
          maxLength: 1024,
          description: "Resource id, readable directory path, or resource directory URI returned by resource listing/search.",
        },
        offset: {
          type: "number",
          description: "Content character offset, clamped by the server.",
        },
        limit: {
          type: "number",
          description: "Maximum content characters to return, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resource"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resource: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_resources_search: {
    name: "polynet_workspace_resources_search",
    title: "Search Polynet Workspace Resources",
    description:
      "Search live member-visible resources in an opened Polynet workspace. This does not search draft or builder-only resource state.",
    annotations: {
      title: "Search Polynet Workspace Resources",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id", "query"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        query: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          description: "Focused resource search query.",
        },
        limit: {
          type: "number",
          description: "Maximum matching resources to return, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resources"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_builder_resources_map: {
    name: "polynet_workspace_builder_resources_map",
    title: "Map Polynet Workspace Builder Resources",
    description:
      "Map builder-visible resource structure, draft/source state, and resource health for an opened Polynet workspace. This requires builder resource authority and does not mutate resources.",
    annotations: {
      title: "Map Polynet Workspace Builder Resources",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        limit: {
          type: "number",
          description: "Maximum resources to include across the map, clamped by the server.",
        },
        per_module_limit: {
          type: "number",
          description: "Maximum resources to include per module, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resources"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_builder_resources_list: {
    name: "polynet_workspace_builder_resources_list",
    title: "List Polynet Workspace Builder Resources",
    description:
      "List builder-visible resource directory state, including live/draft categories, pages, source inbox items, and health. This requires builder resource authority and does not mutate resources.",
    annotations: {
      title: "List Polynet Workspace Builder Resources",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        limit: {
          type: "number",
          description: "Maximum resources to include, clamped by the server.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resources"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  polynet_workspace_builder_resource_read: {
    name: "polynet_workspace_builder_resource_read",
    title: "Read Polynet Workspace Builder Resource",
    description:
      "Read one builder-visible resource, source, or category by semantic ref, resource id, module id, readable path, or resources URI. This requires builder resource authority and does not mutate resources.",
    annotations: {
      title: "Read Polynet Workspace Builder Resource",
      readOnlyHint: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["workspace_context_id", "ref"],
      properties: {
        workspace_context_id: WORKSPACE_CONTEXT_ID_SCHEMA,
        ref: {
          type: "string",
          minLength: 1,
          maxLength: 1024,
          description: "Category/module name, page/source title, resource id, module id, readable path, or resources URI.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["workspace", "resource"],
      properties: {
        workspace: WORKSPACE_SUMMARY_SCHEMA,
        resource: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
};

export const POLYNET_MCP_PROTOCOL_VERSION = "2025-11-25";
export const POLYNET_MCP_CODEX_PROTOCOL_VERSION = "2025-06-18";
export const POLYNET_MCP_COMPAT_PROTOCOL_VERSION = "2025-03-26";
export const POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  POLYNET_MCP_PROTOCOL_VERSION,
  POLYNET_MCP_CODEX_PROTOCOL_VERSION,
  POLYNET_MCP_COMPAT_PROTOCOL_VERSION,
] as const;

export function isSupportedPolynetMcpProtocolVersion(version: string): boolean {
  return POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(
    version as (typeof POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS)[number],
  );
}

export function getPolynetMcpToolDefinitions(): PolynetMcpToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

export function getPolynetMcpToolDefinition(
  name: string,
): PolynetMcpToolDefinition | null {
  return TOOL_DEFINITIONS[name as PolynetMcpToolName] ?? null;
}
