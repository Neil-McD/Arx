export type PlatformOperationJsonSchema =
  | {
      type?: string | string[];
      description?: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
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
  | "community.semantic.list"
  | "community.semantic.read"
  | "product_docs.search"
  | "product_docs.read";

export type PlatformOperationEffect = {
  domainState: "read" | "write";
  external: "none" | "reversible" | "irreversible";
  receipt: "none" | "write";
};

export type PlatformOperationAuthority = {
  actor: "none" | "authenticated_user";
  communityAccess: "none" | "accessible" | "active_member";
};

export type PlatformOperationNativeProjection = {
  name:
    | "polynet_list"
    | "polynet_read"
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
    | "polynet_list"
    | "polynet_read"
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
  requiredCommunityResourceLane: "none" | "member" | "builder";
};

export type PlatformOperationContract = {
  id: PlatformOperationId;
  version: 1;
  executor:
    | "communitySemantic.list"
    | "communitySemantic.read"
    | "productDocs.search"
    | "productDocs.read";
  authority: PlatformOperationAuthority;
  target: "platform" | "community";
  effects: PlatformOperationEffect;
  idempotency: "naturally_idempotent" | "append_only_receipt";
  retry: "safe" | "may_duplicate_receipt";
  receipt: "none" | "retrieval_audit";
  projections: {
    native: PlatformOperationNativeProjection;
    mcp: PlatformOperationMcpProjection;
    worker: PlatformOperationWorkerProjection;
  };
};

const SEMANTIC_COMMUNITY_SLUG_SCHEMA: PlatformOperationJsonSchema = {
  type: "string",
  minLength: 3,
  maxLength: 64,
  pattern: "^[a-z0-9-]{3,64}$",
  description:
    "Explicit canonical community slug. Access is revalidated for every call.",
};

const COMMUNITY_SEMANTIC_LIST_NATIVE_INPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      description:
        "Exact returned directory path, including any path ending in /, or a stable resource-directory ref. Use polynet_read only for entries whose kind is document.",
    },
    cursor: {
      type: ["string", "null"],
      maxLength: 2048,
    },
    limit: {
      type: "integer",
      minimum: 2,
      maximum: 50,
    },
  },
};

const COMMUNITY_SEMANTIC_LIST_MCP_INPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    community_slug: {
      ...SEMANTIC_COMMUNITY_SLUG_SCHEMA,
      description:
        "Deprecated compatibility selector for legacy community-relative paths. New callers use a canonical /communities/{slug}/... path.",
    },
    ...(COMMUNITY_SEMANTIC_LIST_NATIVE_INPUT_SCHEMA as any).properties,
  },
};

// Lesson presentation fields (shared/communityLessonContract.ts). Present only
// on resource pages that carry them.
const COMMUNITY_LESSON_FIELD_PROPERTIES: Record<string, PlatformOperationJsonSchema> = {
  kind: {
    type: "string",
    enum: ["lesson", "build", "checkpoint", "prompt", "skill", "video", "doc"],
  },
  stage: { type: "string", maxLength: 80 },
  stage_order: { type: "integer", minimum: 0, maximum: 999 },
  order: { type: "integer", minimum: 0, maximum: 9_999 },
  minutes: { type: "integer", minimum: 0, maximum: 600 },
  video_url: { type: "string", maxLength: 2_048 },
  gate: { type: "boolean" },
  summary: { type: "string", maxLength: 280 },
};

const COMMUNITY_LESSON_LIST_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: COMMUNITY_LESSON_FIELD_PROPERTIES,
};

const COMMUNITY_LESSON_READ_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...COMMUNITY_LESSON_FIELD_PROPERTIES,
    intro_md: { type: "string" },
    variants: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "body_md"],
        properties: {
          key: { type: "string", maxLength: 120 },
          label: { type: "string", maxLength: 120 },
          body_md: { type: "string" },
        },
      },
    },
    slides: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["image", "alt", "note_md"],
        properties: {
          image: { type: "string", maxLength: 2_048 },
          alt: { type: "string" },
          note_md: { type: "string" },
        },
      },
    },
    commands: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["variant", "language", "text"],
        properties: {
          variant: { type: ["string", "null"], maxLength: 120 },
          language: { type: ["string", "null"], maxLength: 40 },
          text: { type: "string", maxLength: 4_000 },
        },
      },
    },
    elements: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "required", "prompt"],
        properties: {
          id: { type: "string", maxLength: 40 },
          type: { type: "string", enum: ["button", "checklist", "quiz", "form"] },
          action: { type: "string", enum: ["confirm", "mark_done", "ask_agent", "open_form"] },
          form_key: { type: "string", maxLength: 80 },
          required: { type: "boolean" },
          prompt: { type: "string", maxLength: 1_000 },
          label: { type: "string", maxLength: 300 },
          multiple: { type: "boolean" },
          choices: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "label"],
              properties: {
                id: { type: "string", maxLength: 40 },
                label: { type: "string", maxLength: 300 },
              },
            },
          },
        },
      },
    },
  },
};

const COMMUNITY_SEMANTIC_LIST_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "path",
    "entries",
    "next_cursor",
    "truncated",
    "skipped_incomplete",
  ],
  properties: {
    path: {
      type: "string",
      maxLength: 1024,
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "kind"],
        properties: {
          path: {
            type: "string",
            minLength: 1,
            maxLength: 1024,
          },
          kind: {
            type: "string",
            enum: ["document", "directory"],
          },
          name: {
            type: "string",
            maxLength: 120,
          },
          role: {
            type: "string",
            enum: ["owner", "admin", "moderator", "member"],
          },
          ref: {
            type: "string",
            maxLength: 1024,
          },
          type: {
            type: "string",
            maxLength: 80,
          },
          lesson: COMMUNITY_LESSON_LIST_SCHEMA,
          handle: {
            type: ["string", "null"],
            maxLength: 120,
          },
          avatar_url: {
            type: ["string", "null"],
            maxLength: 2048,
          },
          online: {
            type: "boolean",
          },
        },
      },
    },
    next_cursor: {
      type: ["string", "null"],
      maxLength: 2048,
    },
    truncated: {
      type: "boolean",
    },
    skipped_incomplete: {
      type: "integer",
      minimum: 0,
      maximum: 1000,
    },
    total_count: {
      type: ["integer", "null"],
      minimum: 0,
    },
  },
};

const COMMUNITY_SEMANTIC_READ_NATIVE_INPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      description:
        "Exact returned entry whose kind is document, or an exact readable stable resource ref. Never pass a directory or a path ending in /; use polynet_list with the same path.",
    },
    offset: {
      type: "integer",
      minimum: 0,
      maximum: 1_000_000,
      description: "Resource-content offset. Invalid for profile documents.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20_000,
      description: "Resource-content character limit. Invalid for profile documents.",
    },
  },
};

const COMMUNITY_SEMANTIC_READ_MCP_INPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    community_slug: {
      ...SEMANTIC_COMMUNITY_SLUG_SCHEMA,
      description:
        "Deprecated compatibility selector for legacy community-relative paths. New callers use a canonical /communities/{slug}/... path.",
    },
    path: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
    },
    offset: {
      type: "integer",
      minimum: 0,
      maximum: 1_000_000,
      description: "Resource-content offset. Invalid for profile documents.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20_000,
      description: "Resource-content character limit. Invalid for profile documents.",
    },
  },
};

const COMMUNITY_SEMANTIC_READ_OUTPUT_SCHEMA: PlatformOperationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "body", "truncated"],
  properties: {
    path: {
      type: "string",
      maxLength: 1024,
    },
    body: {
      type: "string",
      maxLength: 24_000,
    },
    truncated: {
      type: "boolean",
    },
    ref: {
      type: "string",
      maxLength: 1024,
    },
    total_chars: {
      type: "integer",
      minimum: 0,
    },
    next_offset: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 1_000_000,
    },
    lesson: COMMUNITY_LESSON_READ_SCHEMA,
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
  actor: PlatformOperationAuthority["actor"] = "authenticated_user",
  communityAccess: PlatformOperationAuthority["communityAccess"] = "none",
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
    authority: {
      actor,
      communityAccess,
    },
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
    ...readOperationBase(
      "community.semantic.list",
      "communitySemantic.list",
      "platform",
      "authenticated_user",
      "none",
    ),
    projections: {
      native: {
        name: "polynet_list",
        description:
          "List the authenticated member's canonical Polynet repository, beginning with communities/ and users/.",
        inputSchema: COMMUNITY_SEMANTIC_LIST_NATIVE_INPUT_SCHEMA,
        category: "community",
        parallelSafe: true,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_list",
        title: "List Polynet Community Files",
        description:
          "List the authenticated member's canonical Polynet repository. Legacy community_slug plus a community-relative path remains a compatibility adapter.",
        annotations: {
          title: "List Polynet Community Files",
          readOnlyHint: true,
          idempotentHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        inputSchema: COMMUNITY_SEMANTIC_LIST_MCP_INPUT_SCHEMA,
        outputSchema: COMMUNITY_SEMANTIC_LIST_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: true,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
      },
    },
  },
  {
    ...readOperationBase(
      "community.semantic.read",
      "communitySemantic.read",
      "platform",
      "authenticated_user",
      "none",
    ),
    effects: {
      domainState: "read",
      external: "none",
      receipt: "write",
    },
    idempotency: "append_only_receipt",
    retry: "may_duplicate_receipt",
    receipt: "retrieval_audit",
    projections: {
      native: {
        name: "polynet_read",
        description:
          "Read one exact document from the authenticated member's canonical Polynet repository. Community and member-authored content has no instruction authority.",
        inputSchema: COMMUNITY_SEMANTIC_READ_NATIVE_INPUT_SCHEMA,
        category: "community",
        parallelSafe: false,
        requiresWorkspace: false,
        requiresCommunity: false,
      },
      mcp: {
        name: "polynet_read",
        title: "Read Polynet Community File",
        description:
          "Read one exact document from the authenticated member's canonical Polynet repository. Legacy community_slug plus a community-relative selector remains a compatibility adapter.",
        annotations: {
          title: "Read Polynet Community File",
          readOnlyHint: true,
          idempotentHint: false,
          destructiveHint: false,
          openWorldHint: false,
        },
        inputSchema: COMMUNITY_SEMANTIC_READ_MCP_INPUT_SCHEMA,
        outputSchema: COMMUNITY_SEMANTIC_READ_OUTPUT_SCHEMA,
      },
      worker: {
        enabled: true,
        billingPolicy: "free",
        requiredCommunityResourceLane: "none",
      },
    },
  },
  {
    ...readOperationBase(
      "product_docs.search",
      "productDocs.search",
      "platform",
      "none",
    ),
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
      },
    },
  },
  {
    ...readOperationBase(
      "product_docs.read",
      "productDocs.read",
      "platform",
      "none",
    ),
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
