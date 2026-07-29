export type PlatformOperationJsonSchema =
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
      items?: PlatformOperationJsonSchema;
      anyOf?: PlatformOperationJsonSchema[];
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, PlatformOperationJsonSchema>;
    }
  | boolean
  | Record<string, unknown>;

export type PlatformOperationId =
  | "community.list"
  | "community.read"
  | "product_docs.search"
  | "product_docs.read";

export type PlatformOperationEffect = {
  domainState: "read" | "write";
  external: "none" | "reversible" | "irreversible";
  receipt: "none" | "write";
};

export type PlatformOperationNativeProjection = {
  name:
    | "polynet_list_communities"
    | "polynet_get_community"
    | "search_product_docs"
    | "get_product_doc";
  description: string;
  inputSchema: PlatformOperationJsonSchema;
  category: "community" | "docs";
  parallelSafe: boolean;
  requiresWorkspace: boolean;
  requiresCommunity: boolean;
};

export type PlatformOperationMcpProjection = {
  name:
    | "polynet_list_communities"
    | "polynet_get_community"
    | "polynet_product_docs_search"
    | "polynet_product_doc_read";
  title: string;
  description: string;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
  inputSchema: PlatformOperationJsonSchema;
  outputSchema: PlatformOperationJsonSchema;
};

export type PlatformOperationWorkerProjection = {
  enabled: boolean;
  billingPolicy: "free";
  requiredCommunityResourceLane: "none";
  requiredCommunityAuthority: "none";
};

export type PlatformOperationContract = {
  id: PlatformOperationId;
  version: 1;
  executor:
    | "communityRead.list"
    | "communityRead.read"
    | "productDocs.search"
    | "productDocs.read";
  authority: "none" | "authenticated_user";
  target: "platform" | "community";
  effects: PlatformOperationEffect;
  idempotency: "naturally_idempotent";
  retry: "safe";
  receipt: "none";
  projections: {
    native: PlatformOperationNativeProjection;
    mcp: PlatformOperationMcpProjection;
    worker: PlatformOperationWorkerProjection;
  };
};

export const PLATFORM_OPERATION_ACCESS_RELATION_VALUES = [
  "owner",
  "admin",
  "moderator",
  "member",
  "pending",
  "no_access",
] as const;

const COMMUNITY_SUMMARY_SCHEMA: PlatformOperationJsonSchema = {
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
      enum: [...PLATFORM_OPERATION_ACCESS_RELATION_VALUES],
    },
  },
};

const COMMUNITY_LIST_INPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scope: {
      type: "string",
      enum: ["joined", "discover"],
      description:
        "joined lists accessible member communities; discover lists public Published communities. Defaults to joined.",
    },
  },
};

const COMMUNITY_LIST_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["communities"],
  properties: {
    communities: {
      type: "array",
      items: COMMUNITY_SUMMARY_SCHEMA,
    },
  },
};

const COMMUNITY_READ_INPUT_SCHEMA: PlatformOperationJsonSchema = {
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
};

const COMMUNITY_READ_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
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
          enum: [...PLATFORM_OPERATION_ACCESS_RELATION_VALUES],
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
};

const PRODUCT_DOCS_SEARCH_NATIVE_INPUT_SCHEMA: PlatformOperationJsonSchema = {
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

const PRODUCT_DOCS_SEARCH_MCP_INPUT_SCHEMA: PlatformOperationJsonSchema = {
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
};

const PRODUCT_DOC_READ_NATIVE_INPUT_SCHEMA: PlatformOperationJsonSchema = {
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

const PRODUCT_DOC_READ_MCP_INPUT_SCHEMA: PlatformOperationJsonSchema = {
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
};

const PRODUCT_DOCS_SEARCH_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: ["product_docs"],
  properties: {
    product_docs: {
      type: "object",
      additionalProperties: true,
    },
  },
};

const PRODUCT_DOC_READ_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: ["product_doc"],
  properties: {
    product_doc: {
      type: "object",
      additionalProperties: true,
    },
  },
};

function readOperationBase(
  id: PlatformOperationId,
  executor: PlatformOperationContract["executor"],
  target: PlatformOperationContract["target"],
  authority: PlatformOperationContract["authority"] = "authenticated_user",
): Pick<
  PlatformOperationContract,
  | "id"
  | "version"
  | "executor"
  | "authority"
  | "target"
  | "effects"
  | "idempotency"
  | "retry"
  | "receipt"
> {
  return {
    id,
    version: 1,
    executor,
    authority,
    target,
    effects: {
      domainState: "read",
      external: "none",
      receipt: "none",
    },
    idempotency: "naturally_idempotent",
    retry: "safe",
    receipt: "none",
  };
}

export const PLATFORM_OPERATION_CONTRACTS = [
  {
    ...readOperationBase("community.list", "communityRead.list", "platform"),
    projections: {
      native: {
        name: "polynet_list_communities",
        description:
          "List concise Polynet community identity and access summaries. Defaults to the authenticated user's joined communities; discover returns public Published communities.",
        inputSchema: COMMUNITY_LIST_INPUT_SCHEMA,
        category: "community",
        parallelSafe: true,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_list_communities",
        title: "List Polynet Communities",
        description:
          "List concise Polynet community identity and access summaries. Defaults to the authenticated user's joined communities; discover returns public Published communities.",
        annotations: {
          title: "List Polynet Communities",
          readOnlyHint: true,
        },
        inputSchema: COMMUNITY_LIST_INPUT_SCHEMA,
        outputSchema: COMMUNITY_LIST_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: false,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
        requiredCommunityAuthority: "none",
      },
    },
  },
  {
    ...readOperationBase("community.read", "communityRead.read", "community"),
    projections: {
      native: {
        name: "polynet_get_community",
        description:
          "Read one Polynet community's canonical identity, access relation, and capability summary by slug.",
        inputSchema: COMMUNITY_READ_INPUT_SCHEMA,
        category: "community",
        parallelSafe: true,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_get_community",
        title: "Get Polynet Community",
        description:
          "Read one Polynet community's canonical identity, access relation, and capability summary by slug.",
        annotations: {
          title: "Get Polynet Community",
          readOnlyHint: true,
        },
        inputSchema: COMMUNITY_READ_INPUT_SCHEMA,
        outputSchema: COMMUNITY_READ_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: false,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
        requiredCommunityAuthority: "none",
      },
    },
  },
  {
    ...readOperationBase("product_docs.search", "productDocs.search", "platform", "none"),
    projections: {
      native: {
        name: "search_product_docs",
        description:
          "Search canonical Polynet product documentation and return small ranked snippets with slugs for follow-up lookup.",
        inputSchema: PRODUCT_DOCS_SEARCH_NATIVE_INPUT_SCHEMA,
        category: "docs",
        parallelSafe: true,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_product_docs_search",
        title: "Search Polynet Product Docs",
        description:
          "Search canonical Polynet product documentation and return small ranked snippets with slugs for follow-up reads.",
        annotations: {
          title: "Search Polynet Product Docs",
          readOnlyHint: true,
        },
        inputSchema: PRODUCT_DOCS_SEARCH_MCP_INPUT_SCHEMA,
        outputSchema: PRODUCT_DOCS_SEARCH_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: true,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
        requiredCommunityAuthority: "none",
      },
    },
  },
  {
    ...readOperationBase("product_docs.read", "productDocs.read", "platform", "none"),
    projections: {
      native: {
        name: "get_product_doc",
        description:
          "Read one canonical Polynet product documentation page, or one heading section from that page.",
        inputSchema: PRODUCT_DOC_READ_NATIVE_INPUT_SCHEMA,
        category: "docs",
        parallelSafe: true,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_product_doc_read",
        title: "Read Polynet Product Doc",
        description:
          "Read one canonical Polynet product documentation page, or one heading section from that page.",
        annotations: {
          title: "Read Polynet Product Doc",
          readOnlyHint: true,
        },
        inputSchema: PRODUCT_DOC_READ_MCP_INPUT_SCHEMA,
        outputSchema: PRODUCT_DOC_READ_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: true,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
        requiredCommunityAuthority: "none",
      },
    },
  },
] as const satisfies readonly PlatformOperationContract[];

export function getPlatformOperationContract(
  operationId: PlatformOperationId,
): PlatformOperationContract {
  const contract = PLATFORM_OPERATION_CONTRACTS.find(
    (candidate) => candidate.id === operationId,
  );
  if (!contract) throw new Error(`platform_operation_contract_missing:${operationId}`);
  return contract;
}

export function findPlatformOperationByNativeToolName(
  toolName: string,
): PlatformOperationContract | null {
  return (
    PLATFORM_OPERATION_CONTRACTS.find(
      (contract) => contract.projections.native.name === toolName,
    ) ?? null
  );
}

export function findPlatformOperationByMcpToolName(
  toolName: string,
): PlatformOperationContract | null {
  return (
    PLATFORM_OPERATION_CONTRACTS.find(
      (contract) => contract.projections.mcp.name === toolName,
    ) ?? null
  );
}
