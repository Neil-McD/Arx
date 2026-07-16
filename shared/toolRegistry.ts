import type { RetrievalToolName } from "./retrievalTools";
import {
  getPolynetMcpToolDefinition,
  type PolynetMcpToolName,
} from "./polynetMcp.ts";

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

function getPolynetToolContract(name: PolynetMcpToolName): {
  description: string;
  inputSchema: JsonSchema;
} {
  const definition = getPolynetMcpToolDefinition(name);
  if (!definition) throw new Error(`polynet_tool_contract_missing:${name}`);
  return {
    description: definition.description,
    inputSchema: definition.inputSchema as JsonSchema,
  };
}

const POLYNET_LIST_COMMUNITIES_TOOL = getPolynetToolContract(
  "polynet_list_communities",
);
const POLYNET_GET_COMMUNITY_TOOL = getPolynetToolContract(
  "polynet_get_community",
);

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
      description: "auto uses the configured platform crawler, simple reads one page, crawl requires the robust crawler provider.",
    },
    destination: {
      type: "string",
      enum: ["context", "active_community_sources"],
      description: "context returns bounded crawl output; active_community_sources saves crawled pages as source records for the active community.",
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
      description: "Maximum total crawled text returned to the model when destination is context.",
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

const COMMUNITY_MEMORY_SEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 512,
    },
    types: {
      type: "array",
      maxItems: 6,
      items: COMMUNITY_MEMORY_TYPE_SCHEMA,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 12,
    },
  },
};

const COMMUNITY_MEMORY_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["node_id"],
  properties: {
    node_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
    retrieval_log_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
  },
};

const COMMUNITY_CHAT_SEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
    },
  },
};

const COMMUNITY_CHAT_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ref"],
  properties: {
    ref: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      description: "A stable interaction:root:<id> or interaction:reply:<id> evidence ref returned by community_chat_search.",
    },
  },
};

const COMMUNITY_AI_FEED_SEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
    },
  },
};

const COMMUNITY_AI_FEED_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ref"],
  properties: {
    ref: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      description: "A stable ai_feed:<id> evidence ref returned by community_ai_feed_search.",
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

const COMMUNITY_RESOURCES_LIST_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
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

const COMMUNITY_RESOURCES_MAP_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 250,
      description: "Maximum total resources to include in the map.",
    },
    per_module_limit: {
      type: "integer",
      minimum: 1,
      maximum: 25,
      description: "Maximum resources to include per wiki category.",
    },
  },
};

const COMMUNITY_RESOURCE_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ref"],
  properties: {
    ref: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      description: "Resource id, resources:// directory URI, or readable resource path.",
    },
    offset: {
      type: "integer",
      minimum: 0,
      maximum: 1000000,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20000,
    },
  },
};

const COMMUNITY_RESOURCES_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["refs"],
  properties: {
    refs: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      description: "Resource ids, resources:// directory URIs, or readable resource paths.",
      items: {
        type: "string",
        minLength: 1,
        maxLength: 1024,
      },
    },
    max_chars: {
      type: "integer",
      minimum: 1,
      maximum: 50000,
      description: "Maximum total readable content characters returned across all resources.",
    },
    per_resource_chars: {
      type: "integer",
      minimum: 1,
      maximum: 20000,
      description: "Maximum readable content characters returned per resource.",
    },
  },
};

const COMMUNITY_RESOURCES_SEARCH_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
    },
  },
};

const COMMUNITY_RESOURCE_BUILDER_LIST_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 250,
    },
  },
};

const COMMUNITY_RESOURCE_BUILDER_READ_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ref"],
  properties: {
    ref: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      description: "Category/module name, page/source title, resource id, module id, resources:// URI, or readable resource path.",
    },
  },
};

const COMMUNITY_RESOURCE_BUILDER_CHANGESET_OPERATION_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["op"],
  properties: {
    op: {
      type: "string",
      enum: [
        "create_module",
        "edit_module",
        "create_page",
        "edit_page",
        "move_resource",
        "delete_page",
        "delete_category",
        "link_source_to_page",
      ],
      description: "Changeset operation kind.",
    },
    module_key: {
      type: "string",
      maxLength: 120,
      description: "Temporary key used to reference a wiki category created earlier in the same changeset. The field name stays module_key for the internal category container.",
    },
    module_id: {
      type: "string",
      maxLength: 160,
      description: "Existing resource category id. The field name stays module_id for the internal category container.",
    },
    resource_id: {
      type: "string",
      maxLength: 160,
      description: "Existing page/source resource id.",
    },
    page_resource_id: {
      type: "string",
      maxLength: 160,
      description: "Existing page resource id for source-link operations.",
    },
    source_resource_id: {
      type: "string",
      maxLength: 160,
      description: "Existing source resource id.",
    },
    expected_updated_at: {
      type: "integer",
      minimum: 0,
      maximum: 9999999999999,
      description: "Last-seen updated_at timestamp for optimistic concurrency.",
    },
    name: {
      type: "string",
      maxLength: 180,
      description: "Wiki category name.",
    },
    title: {
      type: "string",
      maxLength: 180,
      description: "Page title.",
    },
    description_md: {
      type: "string",
      maxLength: 1200,
      description: "Module description markdown.",
    },
    body_md: {
      type: "string",
      maxLength: 20000,
      description: "Page body markdown.",
    },
    module_status: {
      type: "string",
      enum: ["draft", "live"],
    },
    resource_status: {
      type: "string",
      enum: ["draft", "review", "processing", "failed"],
    },
    type: {
      type: "string",
      enum: ["post", "embed", "link", "file"],
    },
    url: {
      type: "string",
      maxLength: 2048,
    },
    pinned: {
      type: "boolean",
    },
  },
};

const COMMUNITY_RESOURCE_BUILDER_STAGE_CHANGESET_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "operations"],
  properties: {
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      description: "Short explanation of the proposed resource refactor or draft work.",
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      description:
        "Proposed resource changes. Supported op values: create_module, edit_module, create_page, edit_page, move_resource, delete_page, delete_category, link_source_to_page.",
      items: COMMUNITY_RESOURCE_BUILDER_CHANGESET_OPERATION_TOOL_SCHEMA,
    },
  },
};

const COMMUNITY_RESOURCE_BUILDER_APPLY_CHANGESET_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["changeset_id"],
  properties: {
    changeset_id: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      description: "Previously staged community resource builder changeset id.",
    },
  },
};

const EMPTY_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const SEARCH_PRODUCT_DOCS_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 10,
    },
    section: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    audience: {
      type: "string",
      minLength: 1,
      maxLength: 40,
    },
  },
};

const GET_PRODUCT_DOC_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug"],
  properties: {
    slug: {
      type: "string",
      minLength: 1,
      maxLength: 160,
    },
    heading: {
      type: "string",
      minLength: 1,
      maxLength: 160,
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

const TERMINAL_START_TOOL_SCHEMA: JsonSchema = {
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
    preview_port: {
      type: "integer",
      minimum: 3000,
      maximum: 9999,
    },
    preview_path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    preview_label: {
      type: "string",
      minLength: 1,
      maxLength: 120,
    },
  },
};

const TERMINAL_SESSION_ID_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["terminal_session_id"],
  properties: {
    terminal_session_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
  },
};

const TERMINAL_STOP_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["terminal_session_id"],
  properties: {
    terminal_session_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description:
        "Legacy terminal session id, or active_daytona_preview when stopping the active Daytona app preview.",
    },
    preview_port: {
      type: "integer",
      minimum: 3000,
      maximum: 9999,
      description:
        "Optional Daytona preview port to stop when terminal_session_id is active_daytona_preview.",
    },
  },
};

const TERMINAL_WRITE_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["terminal_session_id", "input"],
  properties: {
    terminal_session_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
    input: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
    },
  },
};

const TERMINAL_LIST_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const COMPUTER_OPEN_URL_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url"],
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
    },
  },
};

const COMPUTER_SCREENSHOT_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const COMPUTER_CLICK_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    x: {
      type: "integer",
      minimum: 0,
      maximum: 10000,
    },
    y: {
      type: "integer",
      minimum: 0,
      maximum: 10000,
    },
    button: {
      type: "string",
      enum: ["left", "right", "middle"],
    },
    double: {
      type: "boolean",
    },
  },
};

const COMPUTER_TYPE_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
    },
    delay_ms: {
      type: "integer",
      minimum: 0,
      maximum: 1000,
    },
  },
};

const COMPUTER_KEYPRESS_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key"],
  properties: {
    key: {
      type: "string",
      minLength: 1,
      maxLength: 64,
    },
    modifiers: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "string",
        enum: ["ctrl", "alt", "meta", "shift"],
      },
    },
  },
};

const COMPUTER_SCROLL_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "direction"],
  properties: {
    x: {
      type: "integer",
      minimum: 0,
      maximum: 10000,
    },
    y: {
      type: "integer",
      minimum: 0,
      maximum: 10000,
    },
    direction: {
      type: "string",
      enum: ["up", "down"],
    },
    amount: {
      type: "integer",
      minimum: 1,
      maximum: 20,
    },
  },
};

const COMPUTER_STOP_TOOL_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const TOOL_REGISTRY: Record<RetrievalToolName, ToolRegistryEntry> = {
  search_product_docs: {
    name: "search_product_docs",
    description: "Search canonical Polynet product documentation and return small ranked snippets with slugs for follow-up lookup.",
    inputSchema: SEARCH_PRODUCT_DOCS_TOOL_SCHEMA,
  },
  get_product_doc: {
    name: "get_product_doc",
    description: "Read one canonical Polynet product documentation page, or one heading section from that page.",
    inputSchema: GET_PRODUCT_DOC_TOOL_SCHEMA,
  },
  get_active_community_context: {
    name: "get_active_community_context",
    description: "Read bounded profile context for the active community lens. The active community is server-selected from the thread context.",
    inputSchema: EMPTY_TOOL_SCHEMA,
  },
  member_conversations_list: {
    name: "member_conversations_list",
    description: "List the signed-in member's recent private Polynet agent conversation episodes across community lenses. Returns bounded metadata and lens provenance only; use member_conversation_read for relevant transcript evidence.",
    inputSchema: MEMBER_CONVERSATIONS_LIST_TOOL_SCHEMA,
  },
  member_conversation_read: {
    name: "member_conversation_read",
    description: "Read a bounded user-and-assistant transcript window with lens provenance from one of the signed-in member's private Polynet agent conversation episodes.",
    inputSchema: MEMBER_CONVERSATION_READ_TOOL_SCHEMA,
  },
  polynet_list_communities: {
    name: "polynet_list_communities",
    ...POLYNET_LIST_COMMUNITIES_TOOL,
  },
  polynet_get_community: {
    name: "polynet_get_community",
    ...POLYNET_GET_COMMUNITY_TOOL,
  },
  member_profile_confirm_facts: {
    name: "member_profile_confirm_facts",
    description: "Write member-approved onboarding interview facts to the active member profile ontology for the active community lens.",
    inputSchema: MEMBER_PROFILE_CONFIRM_FACTS_TOOL_SCHEMA,
  },
  community_resources_list: {
    name: "community_resources_list",
    description: "List the active community's live Resources wiki categories and pages. Use paths or resources:// directory URIs returned by this tool to navigate member-visible categories.",
    inputSchema: COMMUNITY_RESOURCES_LIST_TOOL_SCHEMA,
  },
  community_resources_map: {
    name: "community_resources_map",
    description: "Map the active community's member-visible Resources wiki structure in one call. Use the explicit manager-only builder tools for draft, source-inbox, or health state.",
    inputSchema: COMMUNITY_RESOURCES_MAP_TOOL_SCHEMA,
  },
  community_resources_read: {
    name: "community_resources_read",
    description: "Batch-read member-visible active community Resources by stable resource ref, resource id, resources:// URI, or readable path under a bounded character budget.",
    inputSchema: COMMUNITY_RESOURCES_READ_TOOL_SCHEMA,
  },
  community_resource_read: {
    name: "community_resource_read",
    description: "Read one member-visible resource from a live wiki category by stable resource ref, resource id, resources:// directory URI, or readable resource path.",
    inputSchema: COMMUNITY_RESOURCE_READ_TOOL_SCHEMA,
  },
  community_resources_search: {
    name: "community_resources_search",
    description: "Search the active community's live category pages and return resource paths, directory URIs, snippets, and metadata.",
    inputSchema: COMMUNITY_RESOURCES_SEARCH_TOOL_SCHEMA,
  },
  community_resource_builder_list: {
    name: "community_resource_builder_list",
    description: "Manager-only Resources Architect tool. List the active community's full Resources wiki builder directory, including live/draft categories, pages, and source inbox items.",
    inputSchema: COMMUNITY_RESOURCE_BUILDER_LIST_TOOL_SCHEMA,
  },
  community_resource_builder_read: {
    name: "community_resource_builder_read",
    description: "Manager-only Resources Architect tool. Read one resource or category by semantic ref: category/module name, page/source title, resource id, module id, resources:// URI, or readable path.",
    inputSchema: COMMUNITY_RESOURCE_BUILDER_READ_TOOL_SCHEMA,
  },
  community_resource_builder_stage_changeset: {
    name: "community_resource_builder_stage_changeset",
    description: "Manager-only Resources Architect tool. Validate and stage a proposed resource changeset without mutating categories or pages.",
    inputSchema: COMMUNITY_RESOURCE_BUILDER_STAGE_CHANGESET_TOOL_SCHEMA,
  },
  community_resource_builder_apply_changeset: {
    name: "community_resource_builder_apply_changeset",
    description: "Manager-only Resources Architect tool. Apply a previously staged resource changeset after the builder has explicitly approved it.",
    inputSchema: COMMUNITY_RESOURCE_BUILDER_APPLY_CHANGESET_TOOL_SCHEMA,
  },
  community_search: {
    name: "community_search",
    description: "Search the active community's raw recent activity and archive evidence across chat, AI feed, resources, and PDF-linked knowledge.",
    inputSchema: COMMUNITY_SEARCH_TOOL_SCHEMA,
  },
  community_memory_search: {
    name: "community_memory_search",
    description: "Search accepted community intelligence learned by the active community. Returns only promising, validated, or canonical memory plus a retrieval log id; it does not search raw archive evidence.",
    inputSchema: COMMUNITY_MEMORY_SEARCH_TOOL_SCHEMA,
  },
  community_memory_read: {
    name: "community_memory_read",
    description: "Read one accepted community memory node and a bounded visibility-filtered subgraph. Pass the retrieval log id from community_memory_search when available.",
    inputSchema: COMMUNITY_MEMORY_READ_TOOL_SCHEMA,
  },
  community_chat_search: {
    name: "community_chat_search",
    description: "Search authorized canonical chat interactions in the active community and return stable evidence refs. This reads raw evidence, not community-endorsed memory.",
    inputSchema: COMMUNITY_CHAT_SEARCH_TOOL_SCHEMA,
  },
  community_chat_read: {
    name: "community_chat_read",
    description: "Read one authorized canonical community chat interaction by a stable evidence ref returned from community_chat_search.",
    inputSchema: COMMUNITY_CHAT_READ_TOOL_SCHEMA,
  },
  community_ai_feed_search: {
    name: "community_ai_feed_search",
    description: "Search authorized canonical live AI Feed posts in the active community and return stable evidence refs. Retrieval relevance and community reaction signal are reported separately.",
    inputSchema: COMMUNITY_AI_FEED_SEARCH_TOOL_SCHEMA,
  },
  community_ai_feed_read: {
    name: "community_ai_feed_read",
    description: "Read one authorized canonical live AI Feed post by a stable evidence ref returned from community_ai_feed_search.",
    inputSchema: COMMUNITY_AI_FEED_READ_TOOL_SCHEMA,
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
  web_crawl: {
    name: "web_crawl",
    description: "Crawl a provided site, wiki, docs, or course URL with bounded same-origin crawling. Use active_community_sources to save crawled pages as source records for the active community.",
    inputSchema: WEB_CRAWL_TOOL_SCHEMA,
  },
  list_dir: {
    name: "list_dir",
    description: "List files and directories under a computer workspace path.",
    inputSchema: PATH_ONLY_TOOL_SCHEMA,
  },
  read: {
    name: "read",
    description: "Read a UTF-8 text file or directory listing from a computer workspace path.",
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
    description: "Run a shell command inside the bound computer workspace.",
    inputSchema: BASH_TOOL_SCHEMA,
  },
  terminal_start: {
    name: "terminal_start",
    description: "Start a persistent background terminal command inside the bound computer workspace.",
    inputSchema: TERMINAL_START_TOOL_SCHEMA,
  },
  terminal_read: {
    name: "terminal_read",
    description: "Check the current status and recent output tail of a background terminal.",
    inputSchema: TERMINAL_SESSION_ID_TOOL_SCHEMA,
  },
  terminal_write: {
    name: "terminal_write",
    description: "Send input to a running background terminal.",
    inputSchema: TERMINAL_WRITE_TOOL_SCHEMA,
  },
  terminal_stop: {
    name: "terminal_stop",
    description:
      "Stop a background terminal and release it when no longer needed. If the active app preview is Daytona-backed, use terminal_session_id active_daytona_preview.",
    inputSchema: TERMINAL_STOP_TOOL_SCHEMA,
  },
  computer_open_url: {
    name: "computer_open_url",
    description: "Open a URL in the sandbox desktop browser and return an updated visual observation.",
    inputSchema: COMPUTER_OPEN_URL_TOOL_SCHEMA,
  },
  computer_screenshot: {
    name: "computer_screenshot",
    description: "Capture the current sandbox desktop as a visual observation for the next tool decision.",
    inputSchema: COMPUTER_SCREENSHOT_TOOL_SCHEMA,
  },
  computer_click: {
    name: "computer_click",
    description: "Click inside the sandbox desktop at screen coordinates and return an updated visual observation.",
    inputSchema: COMPUTER_CLICK_TOOL_SCHEMA,
  },
  computer_type: {
    name: "computer_type",
    description: "Type text into the focused sandbox desktop input and return an updated visual observation.",
    inputSchema: COMPUTER_TYPE_TOOL_SCHEMA,
  },
  computer_keypress: {
    name: "computer_keypress",
    description: "Press a key with optional modifiers in the sandbox desktop and return an updated visual observation.",
    inputSchema: COMPUTER_KEYPRESS_TOOL_SCHEMA,
  },
  computer_scroll: {
    name: "computer_scroll",
    description: "Scroll at screen coordinates in the sandbox desktop and return an updated visual observation.",
    inputSchema: COMPUTER_SCROLL_TOOL_SCHEMA,
  },
  computer_stop: {
    name: "computer_stop",
    description: "Stop the sandbox desktop computer-use processes when they are no longer needed.",
    inputSchema: COMPUTER_STOP_TOOL_SCHEMA,
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
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([childKey, childValue]) => [
          childKey,
          sanitizeResponsesApiSchema(childValue),
        ]),
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
      next[key] = value.map((entry) => sanitizeResponsesApiSchema(entry as JsonSchema));
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

export function sanitizeMountedMcpToolSchema(schema: JsonSchema): JsonSchema {
  const sanitized = sanitizeLooseToolSchema(schema);
  if (!isSchemaRecord(sanitized)) return sanitized;
  if (!("properties" in sanitized) || sanitized.properties === null) {
    return {
      ...sanitized,
      properties: {},
    };
  }
  return sanitized;
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
      if (items.some((entry) => hasStrictResponsesApiSchemaRisk(entry as JsonSchema))) {
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
        ? record.items.map((entry) => buildStrictResponsesApiSchema(entry as JsonSchema))
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
    const projection = projectResponsesApiToolSchema(tool.inputSchema);
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

function normalizeBuilderChangesetOperationForTool(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const op = String(record.op ?? record.kind ?? "").trim().toLowerCase();
  const out: Record<string, unknown> = op ? { op: op.slice(0, 80) } : {};
  const copyString = (from: string, to = from, maxLength = 2000) => {
    const value = normalizeString(record[from]);
    if (value) out[to] = value.slice(0, maxLength);
  };
  const copyInteger = (from: string, to = from) => {
    const value = Math.floor(Number(record[from]));
    if (Number.isFinite(value) && value >= 0) out[to] = value;
  };

  if (op === "create_module") {
    copyString("module_key", "module_key", 120);
    copyString("name", "name", 180);
    copyString("description_md", "description_md", 1200);
    copyString("module_status", "module_status", 20);
    return out;
  }
  if (op === "edit_module") {
    copyString("module_id", "module_id", 160);
    copyInteger("expected_updated_at", "expected_updated_at");
    copyString("name", "name", 180);
    copyString("description_md", "description_md", 1200);
    copyString("module_status", "module_status", 20);
    return out;
  }
  if (op === "create_page") {
    copyString("module_id", "module_id", 160);
    copyString("module_key", "module_key", 120);
    copyString("title", "title", 180);
    copyString("body_md", "body_md", 20000);
    copyString("source_resource_id", "source_resource_id", 160);
    copyString("type", "type", 20);
    copyString("url", "url", 2048);
    copyString("resource_status", "resource_status", 20);
    if (typeof record.pinned === "boolean") out.pinned = record.pinned;
    return out;
  }
  if (op === "edit_page") {
    copyString("resource_id", "resource_id", 160);
    copyInteger("expected_updated_at", "expected_updated_at");
    copyString("module_id", "module_id", 160);
    copyString("title", "title", 180);
    copyString("body_md", "body_md", 20000);
    copyString("source_resource_id", "source_resource_id", 160);
    copyString("type", "type", 20);
    copyString("url", "url", 2048);
    copyString("resource_status", "resource_status", 20);
    if (typeof record.pinned === "boolean") out.pinned = record.pinned;
    return out;
  }
  if (op === "move_resource") {
    copyString("resource_id", "resource_id", 160);
    copyInteger("expected_updated_at", "expected_updated_at");
    copyString("module_id", "module_id", 160);
    return out;
  }
  if (op === "link_source_to_page") {
    copyString("page_resource_id", "page_resource_id", 160);
    copyInteger("expected_updated_at", "expected_updated_at");
    copyString("source_resource_id", "source_resource_id", 160);
    return out;
  }
  return out;
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
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a number.`);
  const integer = Math.floor(parsed);
  if (integer < minValue) {
    throw new Error(`${fieldName} must be greater than or equal to ${minValue}.`);
  }
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
  if (toolName === "community_memory_search") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("community_memory_search requires query.");
    if (args.types !== undefined && !Array.isArray(args.types)) {
      throw new Error("community_memory_search types must be an array.");
    }
    const allowedTypes = new Set([
      "playbook",
      "insight",
      "example",
      "warning_failure",
      "decision_judgment",
      "open_question",
    ]);
    const requestedTypes = Array.isArray(args.types)
      ? args.types
          .map((value) => normalizeString(value))
          .filter((value): value is string => Boolean(value))
      : [];
    const unsupportedType = requestedTypes.find((value) => !allowedTypes.has(value));
    if (unsupportedType) {
      throw new Error(`community_memory_search received unsupported memory type: ${unsupportedType}.`);
    }
    const types = [...new Set(requestedTypes)].slice(0, 6);
    const limit = normalizeBoundedInteger(args.limit, "community_memory_search limit", 1, 12);
    return {
      query: query.slice(0, 512),
      ...(types.length ? { types } : null),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_memory_read") {
    const nodeId = normalizeString(args.node_id ?? args.nodeId);
    if (!nodeId) throw new Error("community_memory_read requires node_id.");
    const retrievalLogId = normalizeString(args.retrieval_log_id ?? args.retrievalLogId);
    return {
      nodeId: nodeId.slice(0, 128),
      ...(retrievalLogId ? { retrievalLogId: retrievalLogId.slice(0, 128) } : null),
    };
  }
  if (toolName === "community_chat_search") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("community_chat_search requires query.");
    const limit = normalizeBoundedInteger(args.limit, "community_chat_search limit", 1, 20);
    return {
      query: query.slice(0, 240),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_chat_read") {
    const ref = normalizeString(args.ref);
    if (!ref || !/^interaction:(root|reply):[^\s:]+$/.test(ref)) {
      throw new Error("community_chat_read requires a valid interaction evidence ref.");
    }
    return { ref: ref.slice(0, 512) };
  }
  if (toolName === "community_ai_feed_search") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("community_ai_feed_search requires query.");
    const limit = normalizeBoundedInteger(args.limit, "community_ai_feed_search limit", 1, 20);
    return {
      query: query.slice(0, 240),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_ai_feed_read") {
    const ref = normalizeString(args.ref);
    if (!ref || !/^ai_feed:[^\s:]+$/.test(ref)) {
      throw new Error("community_ai_feed_read requires a valid AI Feed evidence ref.");
    }
    return { ref: ref.slice(0, 512) };
  }
  if (toolName === "member_conversations_list") {
    const limit = normalizeBoundedInteger(args.limit, "member_conversations_list limit", 1, 12);
    return limit ? { limit } : {};
  }
  if (toolName === "member_conversation_read") {
    const episodeId = normalizeString(args.episode_id ?? args.episodeId);
    if (!episodeId) throw new Error("member_conversation_read requires episode_id.");
    return { episodeId: episodeId.slice(0, 160) };
  }
  if (toolName === "polynet_list_communities") {
    const scope = normalizeString(args.scope)?.toLowerCase() ?? "joined";
    if (scope !== "joined" && scope !== "discover") {
      throw new Error("polynet_list_communities scope must be joined or discover.");
    }
    return { scope };
  }
  if (toolName === "polynet_get_community") {
    const communitySlug = normalizeString(args.community_slug ?? args.communitySlug)?.toLowerCase();
    if (!communitySlug || !/^[a-z0-9-]{3,64}$/.test(communitySlug)) {
      throw new Error("polynet_get_community requires a valid community_slug.");
    }
    return { communitySlug };
  }
  if (toolName === "community_resources_list") {
    const path = normalizeString(args.path);
    const limit = normalizeBoundedInteger(args.limit, "community_resources_list limit", 1, 100);
    return {
      ...(path ? { path: path.slice(0, 1024) } : null),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_resources_map") {
    const limit = normalizeBoundedInteger(args.limit, "community_resources_map limit", 1, 250);
    const perModuleLimit = normalizeBoundedInteger(
      args.per_module_limit,
      "community_resources_map per_module_limit",
      1,
      25,
    );
    return {
      ...(limit ? { limit } : null),
      ...(perModuleLimit ? { perModuleLimit } : null),
    };
  }
  if (toolName === "community_resources_read") {
    if (!Array.isArray(args.refs) || args.refs.length < 1) {
      throw new Error("community_resources_read requires refs.");
    }
    if (args.refs.length > 10) {
      throw new Error("community_resources_read supports at most 10 refs.");
    }
    const refs = args.refs
      .map((ref) => (normalizeString(ref) ?? "").slice(0, 1024))
      .filter(Boolean);
    if (refs.length < 1) {
      throw new Error("community_resources_read requires refs.");
    }
    const maxChars = normalizeBoundedInteger(args.max_chars, "community_resources_read max_chars", 1, 50000);
    const perResourceChars = normalizeBoundedInteger(
      args.per_resource_chars,
      "community_resources_read per_resource_chars",
      1,
      20000,
    );
    return {
      refs,
      ...(maxChars ? { maxChars } : null),
      ...(perResourceChars ? { perResourceChars } : null),
    };
  }
  if (toolName === "community_resource_read") {
    const ref = normalizeString(args.ref);
    if (!ref) throw new Error("community_resource_read requires ref.");
    const offset = normalizeBoundedInteger(args.offset, "community_resource_read offset", 0, 1000000);
    const limit = normalizeBoundedInteger(args.limit, "community_resource_read limit", 1, 20000);
    return {
      ref: ref.slice(0, 1024),
      ...(offset !== null ? { offset } : null),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_resources_search") {
    const query = normalizeString(args.query);
    if (!query) throw new Error("community_resources_search requires query.");
    const limit = normalizeBoundedInteger(args.limit, "community_resources_search limit", 1, 20);
    return {
      query: query.slice(0, 240),
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_resource_builder_list") {
    const limit = normalizeBoundedInteger(args.limit, "community_resource_builder_list limit", 1, 250);
    return {
      ...(limit ? { limit } : null),
    };
  }
  if (toolName === "community_resource_builder_read") {
    const ref = normalizeString(args.ref);
    if (ref) {
      return { ref: ref.slice(0, 1024) };
    }
    const targetType = normalizeString(args.target_type)?.toLowerCase() ?? null;
    const id = normalizeString(args.id);
    if (targetType === "resource" && id) {
      const normalizedId = id.slice(0, 160);
      return { ref: normalizedId, targetType: "resource", id: normalizedId, resourceId: normalizedId };
    }
    if (targetType === "module" && id) {
      const normalizedId = id.slice(0, 160);
      return { ref: normalizedId, targetType: "module", id: normalizedId, moduleId: normalizedId };
    }
    if (id) {
      return { ref: id.slice(0, 1024), id: id.slice(0, 160) };
    }
    const resourceId = normalizeString(args.resource_id);
    const moduleId = normalizeString(args.module_id);
    if (!resourceId && !moduleId) {
      throw new Error("community_resource_builder_read requires ref.");
    }
    if (resourceId && moduleId) {
      throw new Error("community_resource_builder_read accepts only one target id.");
    }
    return {
      ...(resourceId
        ? {
            ref: resourceId.slice(0, 160),
            targetType: "resource",
            id: resourceId.slice(0, 160),
            resourceId: resourceId.slice(0, 160),
          }
        : null),
      ...(moduleId
        ? {
            ref: moduleId.slice(0, 160),
            targetType: "module",
            id: moduleId.slice(0, 160),
            moduleId: moduleId.slice(0, 160),
          }
        : null),
    };
  }
  if (toolName === "community_resource_builder_stage_changeset") {
    const summary = normalizeString(args.summary);
    if (!summary) throw new Error("community_resource_builder_stage_changeset requires summary.");
    if (!Array.isArray(args.operations)) {
      throw new Error("community_resource_builder_stage_changeset requires operations.");
    }
    if (args.operations.length < 1) {
      throw new Error("community_resource_builder_stage_changeset operations cannot be empty.");
    }
    if (args.operations.length > 25) {
      throw new Error("community_resource_builder_stage_changeset supports at most 25 operations.");
    }
    return {
      summary: summary.slice(0, 2000),
      operations: args.operations.map((operation) =>
        normalizeBuilderChangesetOperationForTool(operation),
      ),
    };
  }
  if (toolName === "community_resource_builder_apply_changeset") {
    const changesetId = normalizeString(args.changeset_id);
    if (!changesetId) {
      throw new Error("community_resource_builder_apply_changeset requires changeset_id.");
    }
    return {
      changesetId: changesetId.slice(0, 160),
    };
  }
  if (toolName === "get_active_community_context") {
    return {};
  }
  if (toolName === "member_profile_confirm_facts") {
    const confirmMarker = normalizeString(args.confirm_marker ?? args.confirmMarker);
    if (!confirmMarker) throw new Error("member_profile_confirm_facts requires confirm_marker.");
    if (!Array.isArray(args.facts)) {
      throw new Error("member_profile_confirm_facts requires facts.");
    }
    if (args.facts.length < 1) {
      throw new Error("member_profile_confirm_facts facts cannot be empty.");
    }
    if (args.facts.length > 12) {
      throw new Error("member_profile_confirm_facts supports at most 12 facts.");
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
        throw new Error(`member_profile_confirm_facts fact ${index + 1} must be an object.`);
      }
      const fact = rawFact as Record<string, unknown>;
      const kind = normalizeString(fact.kind)?.toLowerCase() ?? "";
      if (!validKinds.has(kind)) {
        throw new Error(`member_profile_confirm_facts fact ${index + 1} has invalid kind.`);
      }
      const provenance = normalizeString(fact.provenance)?.toLowerCase() ?? "";
      if (provenance !== "stated_interview" && provenance !== "form_answer") {
        throw new Error(
          "member_profile_confirm_facts only accepts stated_interview or form_answer provenance.",
        );
      }
      const body = normalizeString(fact.body);
      if (!body) {
        throw new Error(`member_profile_confirm_facts fact ${index + 1} requires body.`);
      }
      const confidenceRaw = fact.confidence;
      const confidence =
        typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : null;
      const evidenceRef = normalizeString(fact.evidence_ref ?? fact.evidenceRef);
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
    const limit = normalizeBoundedInteger(args.limit, "search_product_docs limit", 1, 10);
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
  if (toolName === "web_crawl") {
    const url = normalizeString(args.url);
    if (!url) throw new Error("web_crawl requires url.");
    const rawStrategy = normalizeString(args.strategy)?.toLowerCase();
    const strategy =
      rawStrategy === "simple" || rawStrategy === "crawl" || rawStrategy === "auto"
        ? rawStrategy
        : "auto";
    const rawDestination = normalizeString(args.destination)?.toLowerCase();
    const destination =
      rawDestination === "active_community_sources"
        ? "active_community_sources"
        : "context";
    const maxPages = normalizeBoundedInteger(args.max_pages, "web_crawl max_pages", 1, 100);
    const maxDepth = normalizeBoundedInteger(args.max_depth, "web_crawl max_depth", 0, 4);
    const maxChars = normalizeBoundedInteger(args.max_chars, "web_crawl max_chars", 1000, 80000);
    return {
      url: url.slice(0, 2048),
      strategy,
      destination,
      ...(maxPages ? { maxPages } : null),
      ...(maxDepth !== null ? { maxDepth } : null),
      ...(maxChars ? { maxChars } : null),
    };
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
  if (toolName === "terminal_start") {
    const command = normalizeString(args.command);
    if (!command) throw new Error("terminal_start requires command.");
    const cwd = normalizeString(args.cwd);
    const previewPort = normalizePositiveInteger(args.preview_port, "preview_port", 9999);
    if (previewPort !== null && previewPort < 3000) {
      throw new Error("preview_port must be between 3000 and 9999.");
    }
    const previewPath = normalizeString(args.preview_path);
    if (previewPath && (previewPath.includes("://") || previewPath.startsWith("//"))) {
      throw new Error("preview_path must be a path, not a full URL.");
    }
    const previewLabel = normalizeString(args.preview_label);
    return {
      command: command.slice(0, 20000),
      ...(cwd ? { cwd: cwd.slice(0, 1024) } : null),
      ...(previewPort ? { preview_port: previewPort } : null),
      ...(previewPath ? { preview_path: previewPath.slice(0, 1024) } : null),
      ...(previewLabel ? { preview_label: previewLabel.slice(0, 120) } : null),
    };
  }
  if (toolName === "terminal_read" || toolName === "terminal_stop") {
    const terminalSessionId = normalizeString(args.terminal_session_id);
    if (!terminalSessionId) throw new Error(`${toolName} requires terminal_session_id.`);
    const previewPort =
      toolName === "terminal_stop"
        ? normalizePositiveInteger(args.preview_port, "preview_port", 9999)
        : null;
    if (previewPort !== null && previewPort < 3000) {
      throw new Error("preview_port must be between 3000 and 9999.");
    }
    return {
      terminal_session_id: terminalSessionId.slice(0, 128),
      ...(previewPort ? { preview_port: previewPort } : null),
    };
  }
  if (toolName === "terminal_write") {
    const terminalSessionId = normalizeString(args.terminal_session_id);
    if (!terminalSessionId) throw new Error("terminal_write requires terminal_session_id.");
    if (typeof args.input !== "string" || args.input.length === 0) {
      throw new Error("terminal_write requires input.");
    }
    return {
      terminal_session_id: terminalSessionId.slice(0, 128),
      input: args.input.slice(0, 4000),
    };
  }
  if (toolName === "computer_open_url") {
    const url = normalizeString(args.url);
    if (!url) throw new Error("computer_open_url requires url.");
    return {
      url: url.slice(0, 2048),
    };
  }
  if (toolName === "computer_screenshot" || toolName === "computer_stop") {
    return {};
  }
  if (toolName === "computer_click") {
    const x = normalizeBoundedInteger(args.x, "x", 0, 10_000);
    const y = normalizeBoundedInteger(args.y, "y", 0, 10_000);
    if (x === null || y === null) {
      throw new Error("computer_click requires x and y.");
    }
    const button = normalizeString(args.button)?.toLowerCase();
    if (button && button !== "left" && button !== "right" && button !== "middle") {
      throw new Error("computer_click button must be left, right, or middle.");
    }
    return {
      x,
      y,
      ...(button ? { button } : null),
      ...(args.double === true ? { double: true } : null),
    };
  }
  if (toolName === "computer_type") {
    const text = normalizeString(args.text);
    if (!text) throw new Error("computer_type requires text.");
    const delayMs = normalizeBoundedInteger(args.delay_ms, "delay_ms", 0, 1_000);
    return {
      text: text.slice(0, 4000),
      ...(delayMs !== null ? { delay_ms: delayMs } : null),
    };
  }
  if (toolName === "computer_keypress") {
    const key = normalizeString(args.key);
    if (!key) throw new Error("computer_keypress requires key.");
    const modifiers = Array.isArray(args.modifiers)
      ? args.modifiers
          .map((value) => normalizeString(value)?.toLowerCase())
          .filter(
            (value): value is string =>
              Boolean(value) &&
              (value === "ctrl" || value === "alt" || value === "meta" || value === "shift"),
          )
          .slice(0, 4)
      : [];
    return {
      key: key.slice(0, 64),
      ...(modifiers.length > 0 ? { modifiers } : null),
    };
  }
  if (toolName === "computer_scroll") {
    const x = normalizeBoundedInteger(args.x, "x", 0, 10_000);
    const y = normalizeBoundedInteger(args.y, "y", 0, 10_000);
    if (x === null || y === null) {
      throw new Error("computer_scroll requires x and y.");
    }
    const direction = normalizeString(args.direction)?.toLowerCase();
    if (direction !== "up" && direction !== "down") {
      throw new Error("computer_scroll direction must be up or down.");
    }
    const amount = normalizePositiveInteger(args.amount, "amount", 20);
    return {
      x,
      y,
      direction,
      ...(amount !== null ? { amount } : null),
    };
  }
  return {};
}
