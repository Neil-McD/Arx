import type { DeveloperAppAuthType } from "./communityAppMountTypes";

export type DiscoverAppConnectionKind = "known" | "custom";
export type DiscoverAppConnectionMode = "token" | "oauth" | "none" | "custom";
export type DiscoverAppAuthMethod = DiscoverAppConnectionMode;
export type DiscoverAppAdapterKind =
  | "remote_mcp_token"
  | "remote_mcp_no_auth"
  | "custom_remote_mcp"
  | "remote_mcp_oauth"
  | "backplane_mcp"
  | "direct_api"
  | "cli_sandbox"
  | "catalog_only";
export type DiscoverAppReadiness =
  | "ready_token"
  | "ready_oauth"
  | "ready_no_auth"
  | "custom_endpoint"
  | "oauth_planned"
  | "backplane_planned"
  | "api_planned"
  | "cli_sandbox_planned"
  | "catalog_only";
export type DiscoverAppValidationKind =
  | "mcp_initialize_tools_list"
  | "hosted_oauth_mcp_planned"
  | "backplane_mcp_planned"
  | "direct_api_adapter_planned"
  | "workspace_cli_planned"
  | "catalog_only";
export type DiscoverAppDefaultToolRisk = "read" | "write" | "sensitive";
export type DiscoverAppIdentityScope = "catalog_singleton" | "endpoint_instance";
export type DiscoverAppContextStrategy =
  | "manifest_only"
  | "search_then_fetch"
  | "structured_snapshot"
  | "artifact_reference";
export type DiscoverAppExecutionSurface =
  | "server_http"
  | "connector_backplane"
  | "sandbox_cli"
  | "catalog_only";

export type DiscoverAppResultPolicy = {
  maxToolCount: number;
  maxResultBytes: number;
  summarizeLargeResults: boolean;
};

export type DiscoverAppRuntimePolicy = {
  defaultToolRisk: DiscoverAppDefaultToolRisk;
  declaredIntents: string[];
};

export type DiscoverAppMcpRequestHeaders = Record<string, string>;

export type DiscoverAppToolPolicy = {
  defaultEnabledNamePrefixes?: string[];
  allowOnlyDefaultEnabled?: boolean;
  disabledNamePrefixes?: string[];
  disabledNameSegments?: string[];
  disabledReason: string;
};

export type DiscoverAppCredentialPolicy = {
  allowedSecretPrefixes?: string[];
  rejectedSecretPrefixes?: string[];
  rejectionMessage: string;
};

export type DiscoverAppOAuthClientConfig =
  | {
      mode: "dynamic_registration";
    }
  | {
      mode: "static_env";
      clientIdEnv: string;
      clientSecretEnv: string;
    };

export type DiscoverAppIntegrationProfile = {
  adapterKind: DiscoverAppAdapterKind;
  readiness: DiscoverAppReadiness;
  identityScope: DiscoverAppIdentityScope;
  authMode: DiscoverAppConnectionMode;
  validationKind: DiscoverAppValidationKind;
  contextStrategy: DiscoverAppContextStrategy;
  resultPolicy: DiscoverAppResultPolicy;
  runtimePolicy: DiscoverAppRuntimePolicy;
  toolPolicy?: DiscoverAppToolPolicy;
  credentialPolicy?: DiscoverAppCredentialPolicy;
  mcpRequestHeaders?: DiscoverAppMcpRequestHeaders;
  oauthClient?: DiscoverAppOAuthClientConfig;
};

export type DiscoverAppCatalogConnectPolicyErrorCode =
  | "catalog_app_not_found"
  | "catalog_app_not_ready"
  | "catalog_app_endpoint_mismatch"
  | "catalog_app_auth_mismatch"
  | "catalog_app_custom_endpoint_invalid"
  | "catalog_app_connection_invalid";

export type DiscoverAppCatalogConnectPolicyResult =
  | {
      ok: true;
      catalogAppId: string;
      name: string;
      endpointUrl: string;
      authType: DeveloperAppAuthType;
      identityScope: DiscoverAppIdentityScope;
    }
  | {
      ok: false;
      code: DiscoverAppCatalogConnectPolicyErrorCode;
      message: string;
    };

type DiscoverAppConnectionStrategy = {
  defaultMode: DiscoverAppConnectionMode;
  supportedModes: DiscoverAppConnectionMode[];
};

type DiscoverAppReadyTokenConnectTemplate = {
  connectionKind: "known";
  availability: "ready";
  authMethod: "token";
  connectionStrategy: DiscoverAppConnectionStrategy;
  endpointUrl: string;
  authType: Exclude<DeveloperAppAuthType, "none" | "oauth">;
  authLabel: string;
  secretLabel: string;
  tokenHelpUrl: string;
  tokenHelpLabel: string;
  note: string;
};

type DiscoverAppReadyOAuthConnectTemplate = {
  connectionKind: "known";
  availability: "ready";
  authMethod: "oauth";
  connectionStrategy: DiscoverAppConnectionStrategy;
  endpointUrl: string;
  authType: "oauth";
  authLabel: string;
  note: string;
};

type DiscoverAppReadyNoAuthConnectTemplate = {
  connectionKind: "known";
  availability: "ready";
  authMethod: "none";
  connectionStrategy: DiscoverAppConnectionStrategy;
  endpointUrl: string;
  authType: "none";
  authLabel: string;
  note: string;
};

type DiscoverAppCustomAuthOption = {
  value: DeveloperAppAuthType;
  label: string;
  secretLabel?: string;
};

type DiscoverAppReadyCustomConnectTemplate = {
  connectionKind: "custom";
  availability: "ready";
  authMethod: "custom";
  connectionStrategy: DiscoverAppConnectionStrategy;
  endpointUrl: null;
  authType: null;
  authLabel: string;
  note: string;
  endpointPlaceholder: string;
  supportedAuthTypes: DiscoverAppCustomAuthOption[];
};

type DiscoverAppLaterConnectTemplate = {
  connectionKind: DiscoverAppConnectionKind;
  availability: "later";
  authMethod: DiscoverAppAuthMethod;
  connectionStrategy: DiscoverAppConnectionStrategy;
  endpointUrl: string | null;
  authType: DeveloperAppAuthType | null;
  authLabel: string;
  note: string;
  secretLabel?: string;
};

export type DiscoverAppPersonalConnectTemplate =
  | DiscoverAppReadyTokenConnectTemplate
  | DiscoverAppReadyOAuthConnectTemplate
  | DiscoverAppReadyNoAuthConnectTemplate
  | DiscoverAppReadyCustomConnectTemplate
  | DiscoverAppLaterConnectTemplate;

export type DiscoverAppConnectRequirement =
  | {
      id: string;
      kind: "readonly";
      label: string;
      value: string;
    }
  | {
      id: string;
      kind: "secret";
      label: string;
      placeholder: string;
    }
  | {
      id: string;
      kind: "text";
      label: string;
      placeholder: string;
      value: string;
    }
  | {
      id: string;
      kind: "select";
      label: string;
      value: string;
      options: Array<{ value: string; label: string }>;
    };

export type DiscoverAppCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  supportLabel: string;
  supportNote: string;
  heroNote: string;
  capabilities: [string, string, string];
  websiteUrl: string;
  docsUrl: string;
  logoUrl: string | null;
  logoUrlDark?: string | null;
  relatedSkillCatalogId?: string;
  personalConnect: DiscoverAppPersonalConnectTemplate;
};

function buildDiscoverAppResultPolicy(args: {
  maxToolCount: number;
  maxResultBytes: number;
  summarizeLargeResults?: boolean;
}): DiscoverAppResultPolicy {
  return {
    maxToolCount: args.maxToolCount,
    maxResultBytes: args.maxResultBytes,
    summarizeLargeResults: args.summarizeLargeResults ?? true,
  };
}

function buildDiscoverAppRuntimePolicy(args: {
  defaultToolRisk: DiscoverAppDefaultToolRisk;
  declaredIntents: string[];
}): DiscoverAppRuntimePolicy {
  return {
    defaultToolRisk: args.defaultToolRisk,
    declaredIntents: args.declaredIntents,
  };
}

function buildMediaGenerationOAuthProfile(args: {
  declaredIntents: string[];
}): DiscoverAppIntegrationProfile {
  return {
    adapterKind: "remote_mcp_oauth",
    readiness: "oauth_planned",
    identityScope: "catalog_singleton",
    authMode: "oauth",
    validationKind: "hosted_oauth_mcp_planned",
    contextStrategy: "artifact_reference",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 16,
      maxResultBytes: 6_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: args.declaredIntents,
    }),
  };
}

const FORBIDDEN_PROFILE_MCP_HEADER_NAMES = new Set([
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "mcp-protocol-version",
  "mcp-session-id",
  "set-cookie",
  "x-api-key",
]);

function buildDiscoverAppMcpRequestHeaders(
  headers: DiscoverAppMcpRequestHeaders,
): DiscoverAppMcpRequestHeaders {
  const normalized: DiscoverAppMcpRequestHeaders = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim();
    const value = String(rawValue ?? "").trim();
    const lowerName = name.toLowerCase();
    if (!name || !/^[A-Za-z0-9-]+$/.test(name)) {
      throw new Error(`Invalid MCP profile header name: ${rawName}`);
    }
    if (FORBIDDEN_PROFILE_MCP_HEADER_NAMES.has(lowerName)) {
      throw new Error(`MCP profile header cannot set transport/auth header: ${name}`);
    }
    if (!value || /[\r\n]/.test(value) || value.length > 500) {
      throw new Error(`Invalid MCP profile header value for ${name}`);
    }
    normalized[name] = value;
  }
  return normalized;
}

// Profiles describe integration intent. Runtime enforcement still lives in the harness policy layer.
export const DISCOVER_APP_INTEGRATION_PROFILE_OVERRIDES = {
  github: {
    adapterKind: "remote_mcp_token",
    readiness: "ready_token",
    identityScope: "catalog_singleton",
    authMode: "token",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 40,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: [
        "repo_context_read",
        "issue_read",
        "pull_request_read",
        "user_context_read",
      ],
    }),
    mcpRequestHeaders: buildDiscoverAppMcpRequestHeaders({
      "X-MCP-Readonly": "true",
      "X-MCP-Toolsets": "repos,issues,pull_requests,users",
    }),
  },
  supabase: {
    adapterKind: "remote_mcp_token",
    readiness: "ready_token",
    identityScope: "catalog_singleton",
    authMode: "token",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "structured_snapshot",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 24,
      maxResultBytes: 8_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: ["project_context", "schema_inspection", "data_query"],
    }),
  },
  linear: {
    adapterKind: "remote_mcp_token",
    readiness: "ready_token",
    identityScope: "catalog_singleton",
    authMode: "token",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 32,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "write",
      declaredIntents: ["issue_search", "issue_update", "project_context"],
    }),
  },
  vercel: {
    adapterKind: "remote_mcp_oauth",
    readiness: "oauth_planned",
    identityScope: "catalog_singleton",
    authMode: "oauth",
    validationKind: "hosted_oauth_mcp_planned",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 40,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: [
        "deployment_read",
        "project_context",
        "log_inspection",
      ],
    }),
    oauthClient: {
      mode: "dynamic_registration",
    },
  },
  notion: {
    adapterKind: "remote_mcp_oauth",
    readiness: "ready_oauth",
    identityScope: "catalog_singleton",
    authMode: "oauth",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 24,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "write",
      declaredIntents: ["page_search", "page_fetch", "database_context"],
    }),
    oauthClient: {
      mode: "dynamic_registration",
    },
  },
  asana: {
    adapterKind: "remote_mcp_oauth",
    readiness: "oauth_planned",
    identityScope: "catalog_singleton",
    authMode: "oauth",
    validationKind: "hosted_oauth_mcp_planned",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 32,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "write",
      declaredIntents: ["task_search", "task_update", "project_context"],
    }),
    oauthClient: {
      mode: "static_env",
      clientIdEnv: "ASANA_MCP_CLIENT_ID",
      clientSecretEnv: "ASANA_MCP_CLIENT_SECRET",
    },
  },
  heygen: buildMediaGenerationOAuthProfile({
    declaredIntents: [
      "avatar_video_generate",
      "video_translate",
      "media_job_poll",
      "artifact_export",
    ],
  }),
  higgsfield: buildMediaGenerationOAuthProfile({
    declaredIntents: [
      "image_generate",
      "video_generate",
      "generation_history",
      "asset_reference",
      "credit_metered_generation",
    ],
  }),
  hyperframes: {
    adapterKind: "cli_sandbox",
    readiness: "cli_sandbox_planned",
    identityScope: "catalog_singleton",
    authMode: "custom",
    validationKind: "workspace_cli_planned",
    contextStrategy: "artifact_reference",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 8,
      maxResultBytes: 4_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: [
        "html_video_compose",
        "video_preview",
        "video_render",
        "artifact_export",
      ],
    }),
  },
  airtable: {
    adapterKind: "remote_mcp_token",
    readiness: "ready_token",
    identityScope: "catalog_singleton",
    authMode: "token",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 32,
      maxResultBytes: 12_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "write",
      declaredIntents: ["record_search", "record_update", "base_context"],
    }),
  },
  stripe: {
    adapterKind: "remote_mcp_token",
    readiness: "ready_token",
    identityScope: "catalog_singleton",
    authMode: "token",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 32,
      maxResultBytes: 10_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "sensitive",
      declaredIntents: [
        "stripe_account_read",
        "customer_context_read",
        "subscription_context_read",
        "invoice_context_read",
        "payment_context_read",
        "stripe_docs_search",
      ],
    }),
    toolPolicy: {
      allowOnlyDefaultEnabled: true,
      defaultEnabledNamePrefixes: [
        "get_",
        "list_",
        "query_",
        "read_",
        "retrieve_",
        "search_",
      ],
      disabledNamePrefixes: [
        "approve_",
        "cancel_",
        "capture_",
        "close_",
        "confirm_",
        "create_",
        "delete_",
        "expire_",
        "finalize_",
        "pay_",
        "refund_",
        "reverse_",
        "submit_",
        "update_",
        "void_",
      ],
      disabledNameSegments: [
        "approve",
        "cancel",
        "capture",
        "close",
        "confirm",
        "create",
        "delete",
        "expire",
        "finalize",
        "pay",
        "reverse",
        "submit",
        "update",
        "void",
      ],
      disabledReason:
        "Stripe MCP mutation tools are disabled until Polynet has explicit per-tool approval and provider permission controls.",
    },
    credentialPolicy: {
      allowedSecretPrefixes: ["rk_test_", "rk_live_"],
      rejectedSecretPrefixes: ["sk_test_", "sk_live_", "pk_test_", "pk_live_"],
      rejectionMessage:
        "Use a Stripe restricted API key that starts with rk_test_ or rk_live_. Secret and publishable keys are not accepted for Polynet's Stripe MCP harness.",
    },
  },
  shopify: {
    adapterKind: "custom_remote_mcp",
    readiness: "custom_endpoint",
    identityScope: "endpoint_instance",
    authMode: "custom",
    validationKind: "mcp_initialize_tools_list",
    contextStrategy: "search_then_fetch",
    resultPolicy: buildDiscoverAppResultPolicy({
      maxToolCount: 24,
      maxResultBytes: 10_000,
    }),
    runtimePolicy: buildDiscoverAppRuntimePolicy({
      defaultToolRisk: "write",
      declaredIntents: ["storefront_context", "cart_update", "checkout_handoff"],
    }),
  },
} satisfies Partial<Record<string, DiscoverAppIntegrationProfile>>;

const DISCOVER_APP_INTEGRATION_PROFILE_BY_ID: Partial<
  Record<string, DiscoverAppIntegrationProfile>
> = DISCOVER_APP_INTEGRATION_PROFILE_OVERRIDES;

type PlannedDiscoverAppProfileKind =
  | "remote_mcp_oauth"
  | "backplane_mcp"
  | "direct_api"
  | "cli_sandbox"
  | "catalog_only";

const DISCOVER_APP_PLANNED_PROFILE_KINDS = {
  "google-drive": "backplane_mcp",
  "google-sheets": "backplane_mcp",
  "google-calendar": "backplane_mcp",
  figma: "remote_mcp_oauth",
  canva: "remote_mcp_oauth",
  youtube: "direct_api",
  zapier: "backplane_mcp",
  gohighlevel: "direct_api",
  salesforce: "remote_mcp_oauth",
  hubspot: "remote_mcp_oauth",
  jira: "backplane_mcp",
  gmail: "backplane_mcp",
  "google-docs": "backplane_mcp",
  "google-slides": "backplane_mcp",
  "microsoft-outlook": "backplane_mcp",
  "microsoft-teams": "backplane_mcp",
  "microsoft-onedrive": "backplane_mcp",
  "microsoft-sharepoint": "backplane_mcp",
  intercom: "backplane_mcp",
  zendesk: "backplane_mcp",
  n8n: "backplane_mcp",
  make: "backplane_mcp",
  remotion: "cli_sandbox",
  slack: "remote_mcp_oauth",
  discord: "backplane_mcp",
} satisfies Record<string, PlannedDiscoverAppProfileKind>;

const DISCOVER_APP_PLANNED_PROFILE_KIND_BY_ID: Partial<
  Record<string, PlannedDiscoverAppProfileKind>
> = DISCOVER_APP_PLANNED_PROFILE_KINDS;

function buildPlannedDiscoverAppResultPolicy(
  kind: PlannedDiscoverAppProfileKind,
): DiscoverAppResultPolicy {
  switch (kind) {
    case "remote_mcp_oauth":
      return buildDiscoverAppResultPolicy({
        maxToolCount: 32,
        maxResultBytes: 12_000,
      });
    case "backplane_mcp":
      return buildDiscoverAppResultPolicy({
        maxToolCount: 24,
        maxResultBytes: 8_000,
      });
    case "direct_api":
      return buildDiscoverAppResultPolicy({
        maxToolCount: 12,
        maxResultBytes: 6_000,
      });
    case "cli_sandbox":
      return buildDiscoverAppResultPolicy({
        maxToolCount: 8,
        maxResultBytes: 4_000,
      });
    case "catalog_only":
      return buildDiscoverAppResultPolicy({
        maxToolCount: 0,
        maxResultBytes: 0,
        summarizeLargeResults: false,
      });
  }
}

function buildPlannedDiscoverAppIntegrationProfile(
  kind: PlannedDiscoverAppProfileKind,
): DiscoverAppIntegrationProfile {
  switch (kind) {
    case "remote_mcp_oauth":
      return {
        adapterKind: "remote_mcp_oauth",
        readiness: "oauth_planned",
        identityScope: "catalog_singleton",
        authMode: "oauth",
        validationKind: "hosted_oauth_mcp_planned",
        contextStrategy: "search_then_fetch",
        resultPolicy: buildPlannedDiscoverAppResultPolicy(kind),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "write",
          declaredIntents: ["provider_search", "provider_fetch", "provider_write"],
        }),
      };
    case "backplane_mcp":
      return {
        adapterKind: "backplane_mcp",
        readiness: "backplane_planned",
        identityScope: "catalog_singleton",
        authMode: "oauth",
        validationKind: "backplane_mcp_planned",
        contextStrategy: "search_then_fetch",
        resultPolicy: buildPlannedDiscoverAppResultPolicy(kind),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "sensitive",
          declaredIntents: ["record_search", "record_update", "workflow_trigger"],
        }),
      };
    case "direct_api":
      return {
        adapterKind: "direct_api",
        readiness: "api_planned",
        identityScope: "catalog_singleton",
        authMode: "oauth",
        validationKind: "direct_api_adapter_planned",
        contextStrategy: "structured_snapshot",
        resultPolicy: buildPlannedDiscoverAppResultPolicy(kind),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "write",
          declaredIntents: ["structured_fetch", "structured_update"],
        }),
      };
    case "cli_sandbox":
      return {
        adapterKind: "cli_sandbox",
        readiness: "cli_sandbox_planned",
        identityScope: "catalog_singleton",
        authMode: "custom",
        validationKind: "workspace_cli_planned",
        contextStrategy: "artifact_reference",
        resultPolicy: buildPlannedDiscoverAppResultPolicy(kind),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "sensitive",
          declaredIntents: ["artifact_generate", "artifact_inspect", "artifact_export"],
        }),
      };
    case "catalog_only":
      return {
        adapterKind: "catalog_only",
        readiness: "catalog_only",
        identityScope: "catalog_singleton",
        authMode: "custom",
        validationKind: "catalog_only",
        contextStrategy: "manifest_only",
        resultPolicy: buildPlannedDiscoverAppResultPolicy(kind),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "read",
          declaredIntents: ["catalog_reference"],
        }),
      };
    default:
      return {
        adapterKind: "catalog_only",
        readiness: "catalog_only",
        identityScope: "catalog_singleton",
        authMode: "custom",
        validationKind: "catalog_only",
        contextStrategy: "manifest_only",
        resultPolicy: buildPlannedDiscoverAppResultPolicy("catalog_only"),
        runtimePolicy: buildDiscoverAppRuntimePolicy({
          defaultToolRisk: "read",
          declaredIntents: ["catalog_reference"],
        }),
      };
  }
}

export function hasExplicitDiscoverAppIntegrationProfile(
  app: DiscoverAppCatalogEntry,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    DISCOVER_APP_INTEGRATION_PROFILE_BY_ID,
    app.id,
  );
}

export function hasPlannedDiscoverAppIntegrationProfileKind(
  app: DiscoverAppCatalogEntry,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    DISCOVER_APP_PLANNED_PROFILE_KIND_BY_ID,
    app.id,
  );
}

export function resolveDiscoverAppIntegrationProfile(
  app: DiscoverAppCatalogEntry,
): DiscoverAppIntegrationProfile {
  const override = DISCOVER_APP_INTEGRATION_PROFILE_BY_ID[app.id];
  if (override) return override;
  const plannedKind =
    DISCOVER_APP_PLANNED_PROFILE_KIND_BY_ID[app.id] ?? "catalog_only";
  return buildPlannedDiscoverAppIntegrationProfile(plannedKind);
}

export function resolveDiscoverAppOAuthClientConfig(
  app: DiscoverAppCatalogEntry,
): DiscoverAppOAuthClientConfig | null {
  const profile = resolveDiscoverAppIntegrationProfile(app);
  if (profile.adapterKind !== "remote_mcp_oauth" || profile.authMode !== "oauth") {
    return null;
  }
  return profile.oauthClient ?? { mode: "dynamic_registration" };
}

export function resolveDiscoverAppExecutionSurface(
  profile: Pick<DiscoverAppIntegrationProfile, "adapterKind">,
): DiscoverAppExecutionSurface {
  switch (profile.adapterKind) {
    case "backplane_mcp":
      return "connector_backplane";
    case "cli_sandbox":
      return "sandbox_cli";
    case "catalog_only":
      return "catalog_only";
    case "remote_mcp_token":
    case "remote_mcp_no_auth":
    case "custom_remote_mcp":
    case "remote_mcp_oauth":
    case "direct_api":
      return "server_http";
    default:
      return "catalog_only";
  }
}

function normalizeCatalogId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 120) : "";
}

function normalizeCatalogEndpointUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().slice(0, 1_000) : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeShopifyStorefrontMcpEndpoint(value: unknown): {
  endpointUrl: string;
  storeSubdomain: string;
} | null {
  const raw = typeof value === "string" ? value.trim().slice(0, 1_000) : "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const suffix = ".myshopify.com";
    const storeSubdomain = hostname.endsWith(suffix)
      ? hostname.slice(0, -suffix.length)
      : "";
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.port || url.search || url.hash) return null;
    if (!storeSubdomain || !/^[a-z0-9][a-z0-9-]*$/.test(storeSubdomain)) {
      return null;
    }
    if (url.pathname.replace(/\/+$/g, "") !== "/api/mcp") return null;
    url.hostname = hostname;
    url.pathname = "/api/mcp";
    return {
      endpointUrl: url.toString(),
      storeSubdomain,
    };
  } catch {
    return null;
  }
}

export function findDiscoverAppCatalogEntryById(
  catalogAppId: unknown,
): DiscoverAppCatalogEntry | null {
  const normalizedCatalogAppId = normalizeCatalogId(catalogAppId);
  if (!normalizedCatalogAppId) return null;
  return (
    DISCOVER_APP_CATALOG.find((app) => app.id === normalizedCatalogAppId) ??
    null
  );
}

export function getDiscoverAppIdentityScopeByCatalogId(
  catalogAppId: unknown,
): DiscoverAppIdentityScope | null {
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!app) return null;
  return resolveDiscoverAppIntegrationProfile(app).identityScope;
}

export function isDiscoverAppCatalogSingletonIdentity(
  catalogAppId: unknown,
): boolean {
  const normalizedCatalogAppId = normalizeCatalogId(catalogAppId);
  if (!normalizedCatalogAppId) return false;
  const scope = getDiscoverAppIdentityScopeByCatalogId(normalizedCatalogAppId);
  return scope === null || scope === "catalog_singleton";
}

function compareDiscoverAppRisk(
  left: DiscoverAppDefaultToolRisk,
  right: DiscoverAppDefaultToolRisk,
): number {
  const rank: Record<DiscoverAppDefaultToolRisk, number> = {
    read: 0,
    write: 1,
    sensitive: 2,
  };
  return rank[left] - rank[right];
}

function normalizeDiscoverAppToolRisk(value: unknown): DiscoverAppDefaultToolRisk {
  return value === "write" || value === "sensitive" ? value : "read";
}

export function applyDiscoverAppDefaultToolRiskFloor(
  catalogAppId: unknown,
  risk: unknown,
): DiscoverAppDefaultToolRisk {
  const normalizedRisk = normalizeDiscoverAppToolRisk(risk);
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!app) return normalizedRisk;
  const riskFloor = resolveDiscoverAppIntegrationProfile(app).runtimePolicy
    .defaultToolRisk;
  return compareDiscoverAppRisk(normalizedRisk, riskFloor) >= 0
    ? normalizedRisk
    : riskFloor;
}

export function resolveDiscoverAppResultPolicyForCatalogAppId(
  catalogAppId: unknown,
): DiscoverAppResultPolicy | null {
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!app) return null;
  return resolveDiscoverAppIntegrationProfile(app).resultPolicy;
}

export function resolveDiscoverAppMcpRequestHeadersForCatalogAppId(
  catalogAppId: unknown,
): DiscoverAppMcpRequestHeaders {
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!app) return {};
  return {
    ...(resolveDiscoverAppIntegrationProfile(app).mcpRequestHeaders ?? {}),
  };
}

export function applyDiscoverAppResultPolicyToText(
  catalogAppId: unknown,
  text: string,
): {
  outputText: string;
  truncated: boolean;
  maxResultBytes: number | null;
} {
  const policy = resolveDiscoverAppResultPolicyForCatalogAppId(catalogAppId);
  const maxResultBytes = policy?.maxResultBytes ?? null;
  if (!policy || typeof maxResultBytes !== "number" || maxResultBytes <= 0) {
    return { outputText: text, truncated: false, maxResultBytes };
  }
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  if (encoded.byteLength <= maxResultBytes) {
    return { outputText: text, truncated: false, maxResultBytes };
  }
  const suffix = "\n\n[Polynet truncated this app result to the catalog result limit.]";
  const suffixBytes = encoder.encode(suffix);
  const budget = Math.max(0, maxResultBytes - suffixBytes.byteLength);
  const outputText = `${new TextDecoder().decode(encoded.slice(0, budget))}${suffix}`;
  return { outputText, truncated: true, maxResultBytes };
}

function normalizeDiscoverAppToolName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function splitDiscoverAppToolNameSegments(value: string): string[] {
  return value.split(/[^a-z0-9]+/g).filter(Boolean);
}

function getDiscoverAppToolPolicy(
  catalogAppId: unknown,
): DiscoverAppToolPolicy | null {
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  return app ? resolveDiscoverAppIntegrationProfile(app).toolPolicy ?? null : null;
}

function getDiscoverAppCredentialPolicy(
  catalogAppId: unknown,
): DiscoverAppCredentialPolicy | null {
  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  return app ? resolveDiscoverAppIntegrationProfile(app).credentialPolicy ?? null : null;
}

function discoverAppToolNameMatchesPrefixes(
  toolName: string,
  prefixes: readonly string[] | undefined,
): boolean {
  if (!prefixes?.length) return false;
  return prefixes.some((prefix) => toolName.startsWith(prefix.toLowerCase()));
}

function discoverAppToolNameHasDisabledSegment(
  toolName: string,
  segments: readonly string[] | undefined,
): boolean {
  if (!segments?.length) return false;
  const disabled = new Set(segments.map((segment) => segment.toLowerCase()));
  return splitDiscoverAppToolNameSegments(toolName).some((segment) =>
    disabled.has(segment),
  );
}

export function getDiscoverAppDisabledToolReason(
  catalogAppId: unknown,
  toolName: unknown,
): string | null {
  const policy = getDiscoverAppToolPolicy(catalogAppId);
  if (!policy) return null;
  const normalizedToolName = normalizeDiscoverAppToolName(toolName);
  if (!normalizedToolName) return policy.disabledReason;
  if (
    discoverAppToolNameMatchesPrefixes(
      normalizedToolName,
      policy.disabledNamePrefixes,
    ) ||
    discoverAppToolNameHasDisabledSegment(
      normalizedToolName,
      policy.disabledNameSegments,
    )
  ) {
    return policy.disabledReason;
  }
  if (
    policy.allowOnlyDefaultEnabled &&
    policy.defaultEnabledNamePrefixes?.length &&
    !discoverAppToolNameMatchesPrefixes(
      normalizedToolName,
      policy.defaultEnabledNamePrefixes,
    )
  ) {
    return policy.disabledReason;
  }
  return null;
}

export function isDiscoverAppToolDisabledByPolicy(
  catalogAppId: unknown,
  toolName: unknown,
): boolean {
  return getDiscoverAppDisabledToolReason(catalogAppId, toolName) !== null;
}

export function filterDiscoverAppEnabledToolNames(
  catalogAppId: unknown,
  toolNames: readonly string[],
): string[] {
  return toolNames.filter(
    (toolName) => !isDiscoverAppToolDisabledByPolicy(catalogAppId, toolName),
  );
}

export function buildDiscoverAppDefaultEnabledToolNames(
  catalogAppId: unknown,
  tools: readonly { tool_name?: unknown }[],
): string[] {
  const policy = getDiscoverAppToolPolicy(catalogAppId);
  const names = tools
    .map((tool) => String(tool.tool_name ?? "").trim())
    .filter(Boolean);
  const allowed = filterDiscoverAppEnabledToolNames(catalogAppId, names);
  if (!policy?.defaultEnabledNamePrefixes?.length) return allowed;
  return allowed.filter((toolName) =>
    discoverAppToolNameMatchesPrefixes(
      normalizeDiscoverAppToolName(toolName),
      policy.defaultEnabledNamePrefixes,
    ),
  );
}

export function validateDiscoverAppSecretForCatalogAppId(
  catalogAppId: unknown,
  secret: unknown,
): { ok: true } | { ok: false; message: string } {
  const policy = getDiscoverAppCredentialPolicy(catalogAppId);
  if (!policy) return { ok: true };
  const normalizedSecret = String(secret ?? "").trim();
  if (!normalizedSecret) return { ok: true };
  const rejected = policy.rejectedSecretPrefixes?.some((prefix) =>
    normalizedSecret.startsWith(prefix),
  );
  if (rejected) return { ok: false, message: policy.rejectionMessage };
  if (policy.allowedSecretPrefixes?.length) {
    const allowed = policy.allowedSecretPrefixes.some((prefix) =>
      normalizedSecret.startsWith(prefix),
    );
    if (!allowed) return { ok: false, message: policy.rejectionMessage };
  }
  return { ok: true };
}

export function resolveDiscoverAppCatalogConnectPolicy(args: {
  catalogAppId?: unknown;
  name?: unknown;
  endpointUrl: unknown;
  authType: DeveloperAppAuthType;
}): DiscoverAppCatalogConnectPolicyResult {
  const catalogAppId = normalizeCatalogId(args.catalogAppId);
  if (!catalogAppId) {
    return {
      ok: false,
      code: "catalog_app_connection_invalid",
      message:
        "Custom MCP endpoints need a reviewed catalog entry before Polynet can connect to them.",
    };
  }

  const app = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!app) {
    return {
      ok: false,
      code: "catalog_app_not_found",
      message: "This catalog app is not available for direct connection.",
    };
  }
  if (!isDiscoverAppPersonallyConnectable(app)) {
    return {
      ok: false,
      code: "catalog_app_not_ready",
      message: `${app.name} is not ready for direct connection yet.`,
    };
  }

  const profile = resolveDiscoverAppIntegrationProfile(app);
  if (app.personalConnect.connectionKind === "known") {
    const expectedEndpointUrl = normalizeCatalogEndpointUrl(
      app.personalConnect.endpointUrl,
    );
    const endpointUrl = normalizeCatalogEndpointUrl(args.endpointUrl);
    if (!endpointUrl || endpointUrl !== expectedEndpointUrl) {
      return {
        ok: false,
        code: "catalog_app_endpoint_mismatch",
        message: `${app.name} must use its vetted catalog endpoint.`,
      };
    }
    if (args.authType !== app.personalConnect.authType) {
      return {
        ok: false,
        code: "catalog_app_auth_mismatch",
        message: `${app.name} must use its vetted catalog auth mode.`,
      };
    }
    return {
      ok: true,
      catalogAppId: app.id,
      name: app.name,
      endpointUrl: expectedEndpointUrl,
      authType: app.personalConnect.authType,
      identityScope: profile.identityScope,
    };
  }

  if (app.id !== "shopify") {
    return {
      ok: false,
      code: "catalog_app_connection_invalid",
      message: `${app.name} does not have a vetted custom endpoint policy.`,
    };
  }
  if (
    !app.personalConnect.supportedAuthTypes.some(
      (option) => option.value === args.authType,
    )
  ) {
    return {
      ok: false,
      code: "catalog_app_auth_mismatch",
      message: `${app.name} must use one of its supported auth modes.`,
    };
  }
  const shopifyEndpoint = normalizeShopifyStorefrontMcpEndpoint(args.endpointUrl);
  if (!shopifyEndpoint) {
    return {
      ok: false,
      code: "catalog_app_custom_endpoint_invalid",
      message:
        "Use a Shopify Storefront MCP endpoint like https://your-store.myshopify.com/api/mcp.",
    };
  }
  return {
    ok: true,
    catalogAppId: app.id,
    name: `${shopifyEndpoint.storeSubdomain} Shopify`,
    endpointUrl: shopifyEndpoint.endpointUrl,
    authType: args.authType,
    identityScope: profile.identityScope,
  };
}

export function buildDiscoverAppIntegrationReadinessLabel(
  app: DiscoverAppCatalogEntry,
): string {
  const profile = resolveDiscoverAppIntegrationProfile(app);
  switch (profile.readiness) {
    case "ready_token":
      return "Ready with token";
    case "ready_oauth":
      return "Ready with OAuth";
    case "ready_no_auth":
      return "Ready without auth";
    case "custom_endpoint":
      return "Ready with custom endpoint";
    case "oauth_planned":
      return "OAuth planned";
    case "backplane_planned":
      return "Backplane planned";
    case "api_planned":
      return "API adapter planned";
    case "cli_sandbox_planned":
      return "Workspace CLI skill";
    case "catalog_only":
      return "Catalog only";
    default:
      return "Catalog only";
  }
}

export function buildDiscoverAppAdapterLabel(
  app: DiscoverAppCatalogEntry,
): string {
  const profile = resolveDiscoverAppIntegrationProfile(app);
  switch (profile.adapterKind) {
    case "remote_mcp_token":
      return "Remote MCP + token";
    case "remote_mcp_no_auth":
      return "Remote MCP without auth";
    case "custom_remote_mcp":
      return "Custom remote MCP";
    case "remote_mcp_oauth":
      return "Remote MCP + OAuth";
    case "backplane_mcp":
      return "Connector backplane";
    case "direct_api":
      return "Direct API adapter";
    case "cli_sandbox":
      return "Sandboxed CLI";
    case "catalog_only":
      return "Catalog only";
    default:
      return "Catalog only";
  }
}

export function formatDiscoverAppConnectionModeLabel(
  mode: DiscoverAppConnectionMode,
): string {
  switch (mode) {
    case "token":
      return "Token";
    case "oauth":
      return "OAuth";
    case "none":
      return "No auth";
    case "custom":
      return "Custom endpoint";
    default:
      return "Connection";
  }
}

export function buildDiscoverAppConnectionStrategyLabel(
  app: DiscoverAppCatalogEntry,
): string {
  const { defaultMode, supportedModes } = app.personalConnect.connectionStrategy;
  if (app.personalConnect.connectionKind === "custom") {
    return "Custom endpoint";
  }
  const liveMode =
    app.personalConnect.availability === "ready" ? app.personalConnect.authMethod : null;
  if (liveMode && liveMode !== defaultMode) {
    return `${formatDiscoverAppConnectionModeLabel(liveMode)} now · ${formatDiscoverAppConnectionModeLabel(defaultMode)} later`;
  }
  if (supportedModes.length === 1) {
    return formatDiscoverAppConnectionModeLabel(defaultMode);
  }
  if (defaultMode === "oauth" && supportedModes.includes("token")) {
    return "OAuth first · token fallback";
  }
  if (defaultMode === "token" && supportedModes.includes("oauth")) {
    return "Token first · OAuth also supported";
  }
  return supportedModes
    .map((mode) => formatDiscoverAppConnectionModeLabel(mode))
    .join(" · ");
}

export function buildDiscoverAppSupportedModesLabel(
  app: DiscoverAppCatalogEntry,
): string {
  return app.personalConnect.connectionStrategy.supportedModes
    .map((mode) => formatDiscoverAppConnectionModeLabel(mode))
    .join(" · ");
}

export function isDiscoverAppPersonallyConnectable(
  app: DiscoverAppCatalogEntry,
): app is DiscoverAppCatalogEntry & {
  personalConnect:
    | DiscoverAppReadyTokenConnectTemplate
    | DiscoverAppReadyOAuthConnectTemplate
    | DiscoverAppReadyNoAuthConnectTemplate
    | DiscoverAppReadyCustomConnectTemplate;
} {
  return app.personalConnect.availability === "ready";
}

export function buildDiscoverAppPersonalConnectRequirements(
  app: DiscoverAppCatalogEntry,
  args?: {
    endpointUrl?: string;
    authType?: DeveloperAppAuthType;
  },
): DiscoverAppConnectRequirement[] {
  if (!isDiscoverAppPersonallyConnectable(app)) return [];
  if (app.personalConnect.connectionKind === "custom") {
    const selectedAuthType = app.personalConnect.supportedAuthTypes.some(
      (option) => option.value === args?.authType,
    )
      ? (args?.authType as DeveloperAppAuthType)
      : app.personalConnect.supportedAuthTypes[0]?.value ?? "none";
    const selectedAuthOption =
      app.personalConnect.supportedAuthTypes.find(
        (option) => option.value === selectedAuthType,
      ) ?? null;
    const requirements: DiscoverAppConnectRequirement[] = [
      {
        id: "endpoint",
        kind: "text",
        label: "Endpoint",
        placeholder: app.personalConnect.endpointPlaceholder,
        value: args?.endpointUrl?.trim() ?? "",
      },
      {
        id: "auth",
        kind: "select",
        label: "Auth",
        value: selectedAuthType,
        options: app.personalConnect.supportedAuthTypes.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
    ];
    if (selectedAuthType !== "none") {
      requirements.push({
        id: "secret",
        kind: "secret",
        label: selectedAuthOption?.secretLabel ?? "Secret",
        placeholder: `Paste your ${selectedAuthOption?.secretLabel ?? "secret"}`,
      });
    }
    return requirements;
  }
  const requirements: DiscoverAppConnectRequirement[] = [
    {
      id: "endpoint",
      kind: "readonly",
      label: "Endpoint",
      value: app.personalConnect.endpointUrl,
    },
    {
      id: "auth",
      kind: "readonly",
      label: "Auth",
      value: app.personalConnect.authLabel,
    },
  ];
  if (app.personalConnect.authMethod === "token") {
    requirements.push({
      id: "secret",
      kind: "secret",
      label: app.personalConnect.secretLabel,
      placeholder: `Paste your ${app.personalConnect.secretLabel}`,
    });
  }
  return requirements;
}

export function buildDiscoverAppPersonalConnectInput(
  app: DiscoverAppCatalogEntry,
  args: {
    endpointUrl?: string;
    authType?: DeveloperAppAuthType;
    description?: string;
    secret?: string;
  },
  ): {
  catalog_app_id?: string;
  name: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  description?: string;
  secret?: string;
} | null {
  if (!isDiscoverAppPersonallyConnectable(app)) return null;
  if (app.personalConnect.connectionKind === "custom") {
    const endpointUrl = args.endpointUrl?.trim() ?? "";
    const authType = args.authType ?? null;
    if (!endpointUrl || !authType) return null;
    let hostLabel = "Custom MCP";
    try {
      const parsed = new URL(endpointUrl);
      const hostname = parsed.hostname.replace(/^www\./, "");
      if (hostname) {
        hostLabel = `${hostname} MCP`;
      }
    } catch {
      hostLabel = "Custom MCP";
    }
    return {
      catalog_app_id: app.id,
      name: hostLabel,
      endpoint_url: endpointUrl,
      auth_type: authType,
      description: args.description,
      secret: authType === "none" ? undefined : args.secret,
    };
  }
  return {
    catalog_app_id:
      app.personalConnect.connectionKind === "known" ? app.id : undefined,
    name: app.name,
    endpoint_url: app.personalConnect.endpointUrl,
    auth_type: app.personalConnect.authType,
    description: args.description,
    secret: app.personalConnect.authMethod === "token" ? args.secret : undefined,
  };
}

export function buildDiscoverAppPersonalConnectModalCopy(
  app: DiscoverAppCatalogEntry,
): string | null {
  if (!isDiscoverAppPersonallyConnectable(app)) return null;
  if (app.personalConnect.connectionKind === "custom") {
    return "Enter a remote MCP endpoint and auth details to connect it to your personal platform tools.";
  }
  if (app.personalConnect.authMethod === "token") {
    if (app.personalConnect.connectionStrategy.defaultMode === "oauth") {
      return `Add ${app.name} now. Paste your ${app.personalConnect.secretLabel} to make it live immediately; OAuth support will come later.`;
    }
    return `Add ${app.name} now. Paste your ${app.personalConnect.secretLabel} to make it live immediately.`;
  }
  if (app.personalConnect.authMethod === "oauth") {
    return `Connect ${app.name} with OAuth to make it live in your personal harness.`;
  }
  return `Review the connection requirements, then connect ${app.name} to your personal platform tools.`;
}

export const DISCOVER_APP_CATALOG: DiscoverAppCatalogEntry[] = [
  {
    id: "github",
    name: "GitHub",
    tagline: "Issues, PRs, repos, and CI context",
    description:
      "Read-only GitHub MCP access for repositories, issues, pull requests, users, and workflow context.",
    supportLabel: "Ready read-only",
    supportNote:
      "GitHub connects through its hosted remote MCP server in read-only mode using a personal token.",
    heroNote:
      "Best for reading repos, pull requests, issues, and users without enabling write tools.",
    capabilities: [
      "Inspect repositories, files, issues, pull requests, and users.",
      "Give agents software project context while keeping GitHub writes disabled.",
      "Use a user-owned token so each member controls their own repository access.",
    ],
    websiteUrl: "https://github.com",
    docsUrl: "https://github.com/github/github-mcp-server",
    logoUrl: "/app-logos/github.svg",
    logoUrlDark: "/app-logos/github-light.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "token",
        supportedModes: ["token"],
      },
      endpointUrl: "https://api.githubcopilot.com/mcp/readonly",
      authType: "bearer",
      authLabel: "Bearer token",
      secretLabel: "GitHub token",
      tokenHelpUrl: "https://github.com/settings/personal-access-tokens",
      tokenHelpLabel: "Create fine-grained token",
      note:
        "Use a fine-grained token with only the repository read permissions you want Polynet to access. The GitHub MCP endpoint is read-only.",
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    tagline: "Hosted remote MCP and data tooling",
    description:
      "Strong alpha reference for a direct hosted MCP endpoint and one of the clearest current fits for the manual bearer-token contract.",
    supportLabel: "Ready now",
    supportNote:
      "Supabase already exposes a hosted remote MCP surface that matches the current HTTPS + bearer-token connector model.",
    heroNote:
      "Best current example of a hosted MCP app that already fits the platform-level personal connect contract.",
    capabilities: [
      "Connect a real hosted remote MCP endpoint over HTTPS.",
      "Query Supabase-backed tools and data surfaces.",
      "Use it as the clearest current reference for a truthful manual connect path.",
    ],
    websiteUrl: "https://supabase.com",
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    logoUrl: "/app-logos/supabase.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "token"],
      },
      endpointUrl: "https://mcp.supabase.com/mcp",
      authType: "bearer",
      authLabel: "Bearer token",
      secretLabel: "Supabase access token",
      tokenHelpUrl: "https://supabase.com/dashboard/account/tokens",
      tokenHelpLabel: "Get access token",
      note:
        "Connects into your personal harness and stays available across communities.",
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    tagline: "Deployments, logs, env, and project ops",
    description:
      "OAuth remote MCP access for Vercel projects, deployments, logs, and documentation.",
    supportLabel: "Client approval needed",
    supportNote:
      "Vercel's hosted MCP server supports OAuth, but Polynet should not expose it until the client approval and operation-safety path is verified.",
    heroNote:
      "Best for deployments, environment state, logs, and project operations.",
    capabilities: [
      "Inspect deployments, projects, logs, and environment state.",
      "Search Vercel documentation and project context from the harness.",
      "Use OAuth later once Polynet's Vercel MCP client path is approved and gated.",
    ],
    websiteUrl: "https://vercel.com",
    docsUrl: "https://vercel.com/docs/agent-resources/vercel-mcp",
    logoUrl: "/app-logos/vercel.svg",
    logoUrlDark: "/app-logos/vercel-light.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.vercel.com",
      authType: null,
      authLabel: "OAuth",
      note:
        "Vercel stays catalog-first until client approval and operation safety are verified.",
    },
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Issues, projects, cycles, and team planning",
    description:
      "Strong near-term MCP candidate for execution workflows and one of the best current fits for personal harness app connections.",
    supportLabel: "Ready now",
    supportNote:
      "Linear exposes a remote MCP endpoint and bearer-token auth that align well with the current PolyNet connector contract.",
    heroNote:
      "Best for issue planning, cycles, execution, and product operating rhythms.",
    capabilities: [
      "Find issues, cycles, and project planning context.",
      "Give personal agents a clean execution surface across communities.",
      "One of the easiest next real app templates under the current auth contract.",
    ],
    websiteUrl: "https://linear.app",
    docsUrl: "https://linear.app/docs/mcp",
    logoUrl: "/app-logos/linear.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "token",
        supportedModes: ["token", "oauth"],
      },
      endpointUrl: "https://mcp.linear.app/mcp",
      authType: "bearer",
      authLabel: "Bearer token",
      secretLabel: "Linear personal API key",
      tokenHelpUrl: "https://linear.app/settings/account/security",
      tokenHelpLabel: "Get API key",
      note:
        "Connects into your personal harness and stays available across communities.",
    },
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Pages, docs, databases, and workspace context",
    description:
      "High-value knowledge surface for teams and personal work through Notion's hosted remote MCP endpoint.",
    supportLabel: "Ready with OAuth",
    supportNote:
      "Notion exposes a hosted remote MCP endpoint with OAuth, so members can connect their own workspace into the personal harness.",
    heroNote:
      "Best for shared workspace context, docs, pages, and structured databases.",
    capabilities: [
      "Read workspace docs, pages, and structured knowledge.",
      "Give personal and community agents richer memory context.",
      "Connect a user-owned Notion workspace through OAuth before it becomes live in the harness.",
    ],
    websiteUrl: "https://www.notion.com",
    docsUrl: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    logoUrl: "/app-logos/notion.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.notion.com/mcp",
      authType: "oauth",
      authLabel: "OAuth",
      note:
        "Connects to your personal harness through Notion OAuth. Community-added apps still require each member to authorize their own workspace.",
    },
  },
  {
    id: "google-drive",
    name: "Google Drive",
    tagline: "Docs, files, folders, and shared knowledge",
    description:
      "High-value community knowledge surface for founder docs, resources, transcripts, and shared operating files.",
    supportLabel: "Third-party MCP only",
    supportNote:
      "Google Workspace MCP coverage exists through third-party hosted and local servers, but PolyNet should wait for a vetted remote auth path before claiming direct support.",
    heroNote:
      "Best for bringing founder documents, community resources, and shared files into a community lens.",
    capabilities: [
      "Search and read shared files, docs, and folders.",
      "Give community agents a practical source of founder knowledge.",
      "Fold Drive content into community resources once auth and scoping are explicit.",
    ],
    websiteUrl: "https://workspace.google.com/products/drive/",
    docsUrl: "https://workspacemcp.com/",
    logoUrl: "/app-logos/google-drive.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed auth",
      note:
        "Keep Drive catalog-first until PolyNet has a vetted Google Workspace MCP connection path with clear per-user and per-community scoping.",
    },
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    tagline: "Spreadsheets, tables, and lightweight databases",
    description:
      "Useful for community rosters, lightweight CRMs, content calendars, analytics exports, and founder-operated planning sheets.",
    supportLabel: "Third-party MCP only",
    supportNote:
      "Google Sheets MCP servers exist through third-party and local implementations, but a first-party remote MCP path was not verified.",
    heroNote:
      "Best for turning founder-maintained spreadsheets into structured agent context.",
    capabilities: [
      "Read spreadsheet ranges and tabular operating data.",
      "Support lightweight community CRM and content planning workflows.",
      "Later attach Sheets as auditable community knowledge or workflow data.",
    ],
    websiteUrl: "https://workspace.google.com/products/sheets/",
    docsUrl: "https://workspacemcp.com/",
    logoUrl: "/app-logos/google-sheets.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed auth",
      note:
        "Sheets belongs in the catalog, but should not be made one-click connectable until the Google auth path is first-party or explicitly approved.",
    },
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    tagline: "Events, availability, reminders, and scheduling",
    description:
      "Useful for founder office hours, community events, coaching calls, launch calendars, and member-facing schedules.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Google Calendar MCP access is available through hosted connector backplanes such as Pipedream, but a first-party Google remote MCP path was not verified.",
    heroNote:
      "Best for turning community schedules and founder availability into agent-readable context.",
    capabilities: [
      "Read and create calendar events through a connected Google account.",
      "Coordinate office hours, launch schedules, and member sessions.",
      "Later support scheduling workflows once OAuth and per-community scoping are explicit.",
    ],
    websiteUrl: "https://workspace.google.com/products/calendar/",
    docsUrl: "https://mcp.pipedream.com/app/google_calendar",
    logoUrl: "/app-logos/google-calendar.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Calendar belongs in the catalog, but should wait for PolyNet's hosted OAuth MCP path or an approved connector backplane.",
    },
  },
  {
    id: "airtable",
    name: "Airtable",
    tagline: "Bases, records, interfaces, and lightweight CRM",
    description:
      "Strong founder-operator data surface for community directories, sponsor lists, content calendars, onboarding trackers, and simple CRM tables.",
    supportLabel: "Ready now",
    supportNote:
      "Airtable exposes an official remote MCP endpoint and supports bearer-style personal access tokens in addition to OAuth.",
    heroNote:
      "Best for structured community data that founders already maintain outside PolyNet.",
    capabilities: [
      "Search, create, and update records in accessible Airtable bases.",
      "Use existing Airtable permissions as the permission boundary.",
      "Attach structured founder operations data to personal or community agents.",
    ],
    websiteUrl: "https://www.airtable.com",
    docsUrl: "https://support.airtable.com/docs/using-the-airtable-mcp-server",
    logoUrl: "/app-logos/airtable.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "token"],
      },
      endpointUrl: "https://mcp.airtable.com/mcp",
      authType: "bearer",
      authLabel: "Bearer token",
      secretLabel: "Airtable personal access token",
      tokenHelpUrl: "https://airtable.com/create/tokens",
      tokenHelpLabel: "Create PAT",
      note:
        "OAuth is the long-term path, but Airtable's PAT support fits the current manual bearer-token connector.",
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    tagline: "Customers, subscriptions, invoices, and payments",
    description:
      "Important billing and commerce context surface, but PolyNet billing authority must remain entitlement-driven and server-verified.",
    supportLabel: "Ready with restricted key",
    supportNote:
      "Stripe's hosted remote MCP server accepts a restricted API key as a bearer token. Secret and publishable keys are rejected.",
    heroNote:
      "Best for commerce operations, customer context, invoices, and subscription support workflows.",
    capabilities: [
      "Inspect customers, invoices, products, subscriptions, and payments.",
      "Support creator commerce workflows without replacing PolyNet entitlement checks.",
      "Keep mutation-shaped Stripe MCP tools blocked until explicit per-tool approval exists.",
    ],
    websiteUrl: "https://stripe.com",
    docsUrl: "https://docs.stripe.com/mcp",
    logoUrl: "/app-logos/stripe.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "ready",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "token",
        supportedModes: ["token"],
      },
      endpointUrl: "https://mcp.stripe.com/",
      authType: "bearer",
      authLabel: "Bearer token",
      secretLabel: "Stripe restricted API key",
      tokenHelpUrl: "https://dashboard.stripe.com/apikeys",
      tokenHelpLabel: "Create restricted key",
      note:
        "Connects to Stripe through your own restricted API key. Secret and publishable keys are rejected, mutation-shaped Stripe tools stay blocked, and Stripe MCP does not become authoritative for PolyNet billing, entitlements, or payouts.",
    },
  },
  {
    id: "shopify",
    name: "Shopify",
    tagline: "Storefront carts, policies, and checkout handoff",
    description:
      "Strong commerce surface for creator communities that sell products, merch, courses, templates, or member-facing store bundles.",
    supportLabel: "Custom endpoint ready",
    supportNote:
      "This ready path accepts Shopify's standard per-store Storefront MCP endpoint at https://{shop}.myshopify.com/api/mcp. UCP catalog endpoints at /api/ucp/mcp need a separate reviewed profile before launch.",
    heroNote:
      "Best for letting a community agent guide shoppers through storefront cart, policy, and checkout handoff flows for a specific store.",
    capabilities: [
      "Use the standard Storefront MCP endpoint for store context and policy questions.",
      "Create and update shopping carts through the storefront MCP surface.",
      "Support commerce guidance without touching PolyNet billing authority or UCP catalog endpoints.",
    ],
    websiteUrl: "https://www.shopify.com",
    docsUrl: "https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront",
    logoUrl: "/app-logos/shopify.svg",
    personalConnect: {
      connectionKind: "custom",
      availability: "ready",
      authMethod: "custom",
      connectionStrategy: {
        defaultMode: "custom",
        supportedModes: ["custom"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Per-store MCP endpoint",
      endpointPlaceholder: "https://your-store.myshopify.com/api/mcp",
      supportedAuthTypes: [{ value: "none", label: "No auth" }],
      note:
        "Paste the target store's standard Storefront MCP endpoint. UCP catalog endpoints and Shopify Admin operations stay out of this path until scoped profiles are explicit.",
    },
  },
  {
    id: "figma",
    name: "Figma",
    tagline: "Design context, components, and canvas workflows",
    description:
      "Strong builder and design-system app for bringing design context into implementation and for later writing structured design work back to Figma.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Figma's remote MCP endpoint is official, but it depends on OAuth and supported-client access that the current PolyNet connector should not pretend to own yet.",
    heroNote:
      "Best for product communities, design systems, UI implementation, and builder workflows.",
    capabilities: [
      "Extract design context, components, variables, and selected frame details.",
      "Support design-to-code and code-to-canvas workflows.",
      "Keep design-system work aligned with real Figma files.",
    ],
    websiteUrl: "https://www.figma.com",
    docsUrl: "https://developers.figma.com/docs/figma-mcp-server/",
    logoUrl: "/app-logos/figma.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.figma.com/mcp",
      authType: null,
      authLabel: "OAuth",
      note:
        "Figma should stay catalog-first until PolyNet supports hosted OAuth MCP connections and the client allowlist path is confirmed.",
    },
  },
  {
    id: "canva",
    name: "Canva",
    tagline: "Design generation, brand assets, and exports",
    description:
      "Founder-friendly creative surface for social assets, community visuals, reports, decks, videos, and brand kits.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Canva provides a remote MCP endpoint, but access uses OAuth/DCR and may require integration allowlisting for platform providers.",
    heroNote:
      "Best for creator-facing design, branded community assets, and distribution materials.",
    capabilities: [
      "Create, edit, search, and export Canva designs.",
      "Access assets, brand kits, folders, comments, and design libraries.",
      "Support founder distribution assets once OAuth and user consent are wired.",
    ],
    websiteUrl: "https://www.canva.com",
    docsUrl: "https://www.canva.dev/docs/mcp/",
    logoUrl: "/app-logos/canva.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.canva.com/mcp",
      authType: null,
      authLabel: "OAuth",
      note:
        "Canva is high-value for creator UX, but the current manual connector does not support the required OAuth/DCR flow.",
    },
  },
  {
    id: "youtube",
    name: "YouTube",
    tagline: "Channels, videos, transcripts, and audience signal",
    description:
      "High-value founder funnel source for public videos, transcripts, channel context, and community education material.",
    supportLabel: "Provider decision needed",
    supportNote:
      "No first-party YouTube MCP endpoint was verified; usable paths appear to be Pipedream, community YouTube Data API servers, or a custom transcript-focused server.",
    heroNote:
      "Best for turning founder videos and public channel knowledge into community intelligence.",
    capabilities: [
      "Search videos, channels, playlists, and public metadata.",
      "Retrieve transcripts for summarization and community knowledge extraction.",
      "Later connect creator analytics only through explicit OAuth and scope controls.",
    ],
    websiteUrl: "https://www.youtube.com",
    docsUrl: "https://mcp.pipedream.com/app/youtube_data_api",
    logoUrl: "/app-logos/youtube.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "custom"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or custom endpoint",
      note:
        "YouTube should be catalog-first until we choose between Pipedream, a community server, or a PolyNet-owned transcript and channel-intelligence connector.",
    },
  },
  {
    id: "zapier",
    name: "Zapier",
    tagline: "Thousands of apps and automation actions",
    description:
      "Broad automation backplane for connecting community agents to existing Zapier-supported apps without adding every provider one at a time.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Zapier provides MCP server infrastructure and embeddable MCP docs, but each user still needs a Zapier account, server setup, and app-level authentication.",
    heroNote:
      "Best for long-tail automations once PolyNet can expose a governed connector backplane.",
    capabilities: [
      "Route agents into thousands of Zapier-supported app actions.",
      "Use Zapier-managed app authentication and action configuration.",
      "Cover long-tail integrations without making them first-party PolyNet surfaces.",
    ],
    websiteUrl: "https://zapier.com",
    docsUrl: "https://docs.zapier.com/mcp/quickstart",
    logoUrl: "/app-logos/zapier.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Zapier MCP server",
      note:
        "Zapier is strategically valuable, but PolyNet should integrate it as a governed backplane rather than a generic unbounded action surface.",
    },
  },
  {
    id: "gohighlevel",
    name: "GoHighLevel",
    tagline: "CRM, funnels, contacts, and agency operations",
    description:
      "High-fit operator surface for agencies, creator funnels, client follow-up, calendars, contacts, and revenue operations.",
    supportLabel: "Needs verification",
    supportNote:
      "HighLevel documents an MCP server, but PolyNet should verify the hosted endpoint, auth mode, and account scoping before marking it ready.",
    heroNote:
      "Best for agentic distribution businesses and community operators already running funnels and client workflows in HighLevel.",
    capabilities: [
      "Read and coordinate contacts, opportunities, conversations, and calendars.",
      "Support agency and creator follow-up workflows around community funnels.",
      "Keep write actions governed until account and location scopes are explicit.",
    ],
    websiteUrl: "https://www.gohighlevel.com",
    docsUrl:
      "https://help.gohighlevel.com/support/solutions/articles/155000005741-how-to-use-the-highlevel-mcp-server",
    logoUrl: "/app-logos/gohighlevel.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "token"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or API key",
      secretLabel: "HighLevel API key",
      note:
        "Catalog-first until the exact HighLevel MCP endpoint and per-location permission model are verified in PolyNet.",
    },
  },
  {
    id: "salesforce",
    name: "Salesforce",
    tagline: "CRM, accounts, opportunities, and Agentforce context",
    description:
      "Enterprise CRM surface for account intelligence, sales workflows, support context, and Agentforce-backed operations.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Salesforce offers hosted MCP server options, but org setup, OAuth, and enterprise permission boundaries need a deliberate auth path.",
    heroNote:
      "Best for enterprise teams that need community or agent workflows grounded in CRM truth.",
    capabilities: [
      "Read CRM records, accounts, contacts, opportunities, and support context.",
      "Support enterprise sales and customer-success workflows.",
      "Respect Salesforce org permissions, OAuth consent, and audit controls.",
    ],
    websiteUrl: "https://www.salesforce.com",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html",
    logoUrl: "/app-logos/salesforce.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Salesforce OAuth",
      note:
        "Salesforce should stay catalog-first until PolyNet supports hosted OAuth MCP connections and org-scoped consent.",
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    tagline: "CRM, marketing, deals, and customer context",
    description:
      "Strong CRM and marketing operations surface for founder funnels, lifecycle automation, deals, contacts, and customer context.",
    supportLabel: "Needs verification",
    supportNote:
      "HubSpot has MCP documentation, but PolyNet still needs to verify the exact hosted auth flow and scopes before direct connect.",
    heroNote:
      "Best for teams that want their agents to understand marketing, sales, and customer lifecycle state.",
    capabilities: [
      "Read contacts, companies, deals, tickets, and marketing context.",
      "Support funnel, lifecycle, and customer-success workflows.",
      "Use HubSpot app scopes as the permission boundary before enabling writes.",
    ],
    websiteUrl: "https://www.hubspot.com",
    docsUrl: "https://developers.hubspot.com/mcp",
    logoUrl: "/app-logos/hubspot.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "HubSpot OAuth",
      note:
        "HubSpot belongs in Discover now, but direct install should wait for a verified hosted OAuth MCP path.",
    },
  },
  {
    id: "jira",
    name: "Jira",
    tagline: "Issues, projects, incidents, and delivery workflows",
    description:
      "Project and engineering operations surface for teams that use Atlassian issues, boards, sprints, and service workflows.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Jira is a high-value catalog app, but the safest near-term path is a vetted hosted connector or OAuth backplane.",
    heroNote:
      "Best for software, product, and delivery communities that work from Jira.",
    capabilities: [
      "Read issues, projects, boards, sprints, and delivery status.",
      "Coordinate project planning and incident follow-up.",
      "Keep issue writes behind explicit scopes and approvals.",
    ],
    websiteUrl: "https://www.atlassian.com/software/jira",
    docsUrl: "https://mcp.pipedream.com/app/jira",
    logoUrl: "/app-logos/jira.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Jira should remain catalog-first until PolyNet chooses the Atlassian MCP/provider path and scopes it cleanly.",
    },
  },
  {
    id: "gmail",
    name: "Gmail",
    tagline: "Email, threads, labels, and inbox context",
    description:
      "Personal and operator communication surface for email triage, follow-up, customer conversations, and founder workflows.",
    supportLabel: "Google Workspace path",
    supportNote:
      "Gmail belongs with the Google Workspace family, but direct connection should wait for a vetted OAuth MCP path.",
    heroNote:
      "Best for turning inbox context into agent-readable follow-up and operating memory.",
    capabilities: [
      "Read and search email threads with explicit user consent.",
      "Summarize conversations, draft replies, and identify follow-up.",
      "Keep send actions gated behind approval and clear scopes.",
    ],
    websiteUrl: "https://workspace.google.com/products/gmail/",
    docsUrl: "https://workspacemcp.com/",
    logoUrl: "/app-logos/gmail.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Google OAuth",
      note:
        "Gmail is catalog-first until PolyNet has a vetted Google Workspace MCP flow with explicit email scopes.",
    },
  },
  {
    id: "google-docs",
    name: "Google Docs",
    tagline: "Documents, drafts, briefs, and shared knowledge",
    description:
      "Core Google Workspace document surface for founder docs, strategy briefs, notes, policies, and community knowledge.",
    supportLabel: "Google Workspace path",
    supportNote:
      "Google Docs should be grouped into a vetted Google Workspace OAuth/MCP path before direct install is enabled.",
    heroNote:
      "Best for bringing living documents and operating notes into community intelligence.",
    capabilities: [
      "Read, search, and summarize shared documents.",
      "Use docs as source material for community resources and agent context.",
      "Later support drafting and edits with explicit approval.",
    ],
    websiteUrl: "https://workspace.google.com/products/docs/",
    docsUrl: "https://workspacemcp.com/",
    logoUrl: "/app-logos/google-docs.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Google OAuth",
      note:
        "Docs belongs in Discover now, but direct connection should wait for Google Workspace scoping and consent.",
    },
  },
  {
    id: "google-slides",
    name: "Google Slides",
    tagline: "Decks, presentations, and visual briefs",
    description:
      "Useful for founder decks, community presentations, investor updates, workshops, and reusable visual material.",
    supportLabel: "Google Workspace path",
    supportNote:
      "Google Slides should wait for the same vetted Workspace connector path as Drive, Docs, Sheets, Calendar, and Gmail.",
    heroNote:
      "Best for turning community and founder knowledge into presentation workflows.",
    capabilities: [
      "Read presentation structure and slide content.",
      "Support deck summarization, planning, and export workflows.",
      "Later draft or update slides with explicit user approval.",
    ],
    websiteUrl: "https://workspace.google.com/products/slides/",
    docsUrl: "https://workspacemcp.com/",
    logoUrl: "/app-logos/google-slides.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Google OAuth",
      note:
        "Slides belongs in the catalog, but should use the eventual Google Workspace connector rather than a one-off path.",
    },
  },
  {
    id: "microsoft-outlook",
    name: "Microsoft Outlook",
    tagline: "Email, calendar, contacts, and follow-up",
    description:
      "Microsoft 365 communication surface for email, calendar context, customer follow-up, and operator workflows.",
    supportLabel: "Microsoft 365 path",
    supportNote:
      "Outlook should be added as catalog-first until PolyNet has a vetted Microsoft Graph/OAuth MCP connector.",
    heroNote:
      "Best for teams whose operating context lives in Microsoft 365.",
    capabilities: [
      "Read email and calendar context with explicit consent.",
      "Summarize threads, draft follow-up, and coordinate scheduling.",
      "Use Microsoft Graph scopes and approvals before enabling writes.",
    ],
    websiteUrl: "https://www.microsoft.com/microsoft-365/outlook/email-and-calendar-software-microsoft-outlook",
    docsUrl: "https://mcp.pipedream.com/app/microsoft_outlook",
    logoUrl: "/app-logos/microsoft-outlook.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Microsoft OAuth",
      note:
        "Outlook is catalog-first until PolyNet chooses a Microsoft 365 MCP path with clear Graph scopes.",
    },
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    tagline: "Chats, channels, meetings, and team signal",
    description:
      "Collaboration surface for Microsoft 365 teams, meetings, channels, and operational conversations.",
    supportLabel: "Microsoft 365 path",
    supportNote:
      "Teams needs a careful Microsoft Graph/OAuth and tenant-consent path before direct connection is honest.",
    heroNote:
      "Best for enterprise team context and meeting/channel workflows.",
    capabilities: [
      "Read channels, chats, meetings, and collaboration context.",
      "Summarize operational signal and follow-up across teams.",
      "Keep posting and moderation actions behind explicit approval.",
    ],
    websiteUrl: "https://www.microsoft.com/microsoft-teams/group-chat-software",
    docsUrl: "https://mcp.pipedream.com/app/microsoft_teams",
    logoUrl: "/app-logos/microsoft-teams.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Microsoft OAuth",
      note:
        "Teams belongs in Discover, but should wait for a scoped Microsoft 365 connector and tenant-aware permissions.",
    },
  },
  {
    id: "microsoft-onedrive",
    name: "OneDrive",
    tagline: "Files, folders, and Microsoft 365 documents",
    description:
      "Microsoft file storage surface for documents, shared folders, and team knowledge stored in OneDrive.",
    supportLabel: "Microsoft 365 path",
    supportNote:
      "OneDrive should share the same Microsoft Graph/OAuth connector path as Outlook, Teams, and SharePoint.",
    heroNote:
      "Best for Microsoft 365 file and document context.",
    capabilities: [
      "Search and read files, folders, and Microsoft documents.",
      "Ground community and personal agents in shared file context.",
      "Respect tenant, drive, and folder-level permissions.",
    ],
    websiteUrl: "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage",
    docsUrl: "https://mcp.pipedream.com/app/microsoft_onedrive",
    logoUrl: "/app-logos/microsoft-onedrive.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Microsoft OAuth",
      note:
        "OneDrive is catalog-first until Microsoft 365 file scopes are explicit and verified.",
    },
  },
  {
    id: "microsoft-sharepoint",
    name: "SharePoint",
    tagline: "Sites, files, intranet knowledge, and team content",
    description:
      "Enterprise knowledge surface for Microsoft 365 sites, shared files, intranet pages, and team content repositories.",
    supportLabel: "Microsoft 365 path",
    supportNote:
      "SharePoint needs tenant-aware Microsoft Graph permissions and should stay catalog-first for now.",
    heroNote:
      "Best for enterprise knowledge bases and shared operating documentation.",
    capabilities: [
      "Search and read SharePoint sites, pages, lists, and files.",
      "Bring intranet and team knowledge into agent context.",
      "Preserve tenant, site, and document permissions.",
    ],
    websiteUrl: "https://www.microsoft.com/microsoft-365/sharepoint/collaboration",
    docsUrl: "https://mcp.pipedream.com/app/microsoft_sharepoint",
    logoUrl: "/app-logos/microsoft-sharepoint.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Microsoft OAuth",
      note:
        "SharePoint is catalog-first until PolyNet has a tenant-aware Microsoft 365 MCP connector.",
    },
  },
  {
    id: "intercom",
    name: "Intercom",
    tagline: "Customer conversations, support, and product signal",
    description:
      "Customer communication surface for support conversations, product feedback, lifecycle messaging, and help-center context.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Intercom is a strong catalog app, but direct connection should wait for a vetted OAuth/provider path.",
    heroNote:
      "Best for customer-success and support intelligence around a community or product.",
    capabilities: [
      "Read customer conversations, tickets, and support context.",
      "Summarize product feedback and recurring customer issues.",
      "Keep outbound replies and automation actions approval-gated.",
    ],
    websiteUrl: "https://www.intercom.com",
    docsUrl: "https://mcp.pipedream.com/app/intercom",
    logoUrl: "/app-logos/intercom.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Intercom belongs in Discover now, but should wait for a trusted OAuth MCP path before direct install.",
    },
  },
  {
    id: "zendesk",
    name: "Zendesk",
    tagline: "Tickets, help center, support, and customer operations",
    description:
      "Support operations surface for tickets, help-center articles, customer context, and service workflows.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Zendesk should be catalog-first until PolyNet verifies a hosted MCP/provider path and safe write permissions.",
    heroNote:
      "Best for customer support teams and community operators with support queues.",
    capabilities: [
      "Read tickets, help-center content, users, and support context.",
      "Summarize recurring issues and route follow-up.",
      "Gate ticket updates and replies behind explicit approval.",
    ],
    websiteUrl: "https://www.zendesk.com",
    docsUrl: "https://mcp.pipedream.com/app/zendesk",
    logoUrl: "/app-logos/zendesk.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Zendesk is catalog-first until ticket write scopes and provider auth are verified.",
    },
  },
  {
    id: "n8n",
    name: "n8n",
    tagline: "Workflow automation, agents, and custom integrations",
    description:
      "Automation backplane for teams that want self-hosted or managed workflows around agents, apps, and business systems.",
    supportLabel: "Automation backplane",
    supportNote:
      "n8n is strategically useful, but PolyNet should treat it as a governed workflow backplane rather than a generic unbounded tool surface.",
    heroNote:
      "Best for custom automations where Zapier is too constrained or teams want more control.",
    capabilities: [
      "Trigger and coordinate custom workflows across many apps.",
      "Use n8n as an automation layer for community and operator processes.",
      "Keep workflow execution governed, observable, and approval-aware.",
    ],
    websiteUrl: "https://n8n.io",
    docsUrl: "https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.mcp/",
    logoUrl: "/app-logos/n8n.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "custom",
      connectionStrategy: {
        defaultMode: "custom",
        supportedModes: ["custom", "token"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Self-hosted or managed endpoint",
      secretLabel: "n8n credential",
      note:
        "n8n belongs in Discover, but PolyNet needs an explicit workflow execution contract before direct install.",
    },
  },
  {
    id: "make",
    name: "Make",
    tagline: "Visual automations, scenarios, and app workflows",
    description:
      "Visual automation platform for connecting app workflows, operational scenarios, and cross-tool business processes.",
    supportLabel: "Automation backplane",
    supportNote:
      "Make is useful as an automation backplane, but direct connection should wait for a verified MCP/provider path.",
    heroNote:
      "Best for visual workflow builders who want agents to coordinate app scenarios.",
    capabilities: [
      "Coordinate app workflows and scenario-based automations.",
      "Support long-tail integration coverage without first-party builds.",
      "Keep execution scoped through managed credentials and approvals.",
    ],
    websiteUrl: "https://www.make.com",
    docsUrl: "https://mcp.pipedream.com/app/make",
    logoUrl: "/app-logos/make.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Make should stay catalog-first until PolyNet chooses a trusted provider path and workflow approval model.",
    },
  },
  {
    id: "heygen",
    name: "HeyGen",
    tagline: "Avatar video, translation, and generated explainers",
    description:
      "Strong creative capability for founder education, multilingual community updates, onboarding videos, and avatar-based summaries.",
    supportLabel: "Needs richer auth",
    supportNote:
      "HeyGen documents MCP support with OAuth tied to a web plan; the current PolyNet manual token connector should not claim direct readiness.",
    heroNote:
      "Best for turning community knowledge and founder updates into generated video.",
    capabilities: [
      "Create, manage, and retrieve generated videos from agent workflows.",
      "Use account avatars, voices, and translation capabilities.",
      "Support community onboarding and recap videos after OAuth is wired.",
    ],
    websiteUrl: "https://www.heygen.com",
    docsUrl: "https://developers.heygen.com/",
    logoUrl: "/app-logos/heygen.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth",
      note:
        "HeyGen belongs in the creative catalog, but direct install should wait for hosted OAuth MCP support inside PolyNet.",
    },
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    tagline: "Agentic image, video, and creative asset generation",
    description:
      "Creative-generation MCP surface for producing images, videos, character assets, and campaign visuals from an agent workflow.",
    supportLabel: "Skill ready, MCP planned",
    supportNote:
      "Add the Higgsfield skill now for artifact-first creative planning. MCP/CLI execution stays planned until media-job polling, artifact references, and credit/cost controls are wired.",
    heroNote:
      "Best for creator and marketing communities that want image and video generation inside the harness.",
    capabilities: [
      "Generate images, videos, and character-driven creative assets from natural language briefs.",
      "Use previous generations and history as references for iterative creative work.",
      "Route outputs through artifact references instead of dumping binary media into chat context.",
    ],
    websiteUrl: "https://higgsfield.ai",
    docsUrl: "https://higgsfield.ai/mcp",
    logoUrl: null,
    relatedSkillCatalogId: "higgsfield",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.higgsfield.ai",
      authType: "oauth",
      authLabel: "OAuth",
      note:
        "Higgsfield should stay planned until PolyNet has an async media job contract, provider credit guardrails, and artifact storage/display flow.",
    },
  },
  {
    id: "hyperframes",
    name: "HyperFrames",
    tagline: "HTML, CSS, and JS video compositions",
    description:
      "Agent-oriented video authoring framework for composing videos as web documents and rendering them into production media.",
    supportLabel: "Workspace CLI skill",
    supportNote:
      "HyperFrames uses PolyNet's existing project workspace tools in Daytona when a workspace is active. It is not a hosted remote MCP connector.",
    heroNote:
      "Best for builder communities that want agents to generate video from structured HTML scenes.",
    capabilities: [
      "Compose videos from HTML, CSS, and JavaScript using agent-friendly project files.",
      "Use project workspace tools for npx hyperframes doctor, lint, inspect, preview, and render when workspace tools are active.",
      "Return preview and rendered media artifact references instead of raw process output.",
    ],
    websiteUrl: "https://hyperframes.heygen.com",
    docsUrl: "https://hyperframes.heygen.com/packages/cli",
    logoUrl: "/app-logos/hyperframes.svg",
    relatedSkillCatalogId: "hyperframes",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "custom",
      connectionStrategy: {
        defaultMode: "custom",
        supportedModes: ["custom"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Sandboxed CLI",
      note:
        "No separate app credentials are required. Add the HyperFrames skill, then use it in a project-bound thread where workspace tools can run the CLI in Daytona and return artifact references.",
    },
  },
  {
    id: "remotion",
    name: "Remotion",
    tagline: "React video generation and motion graphics",
    description:
      "Developer-native video framework with an official documentation MCP server and strong fit for technical video-generation workflows.",
    supportLabel: "Local MCP only",
    supportNote:
      "Remotion's documented MCP path uses a local npm server for documentation context, so it does not fit PolyNet's hosted remote connector yet.",
    heroNote:
      "Best for developer communities building programmable videos, explainers, and generated motion graphics.",
    capabilities: [
      "Expose Remotion documentation context to coding agents.",
      "Support React-based generated video workflows for technical builders.",
      "Later pair with a secure rendering worker instead of exposing local stdio tools to the web runtime.",
    ],
    websiteUrl: "https://www.remotion.dev",
    docsUrl: "https://www.remotion.dev/docs/ai/mcp",
    logoUrl: "/app-logos/remotion.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "custom",
      connectionStrategy: {
        defaultMode: "custom",
        supportedModes: ["custom"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Local stdio MCP",
      note:
        "Catalog only until PolyNet supports a bounded local/sandbox execution bridge; the web runtime must not execute local stdio tools.",
    },
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Channels, threads, messages, and workspace signal",
    description:
      "Excellent collaboration surface for later workflows, but the safe connection path is still auth-heavy enough that it should remain catalog-first for now.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Slack belongs in the known-app catalog now, but it should not claim a live personal connect path until the auth model is broader.",
    heroNote:
      "Best for channel context, team communication, and operational signal.",
    capabilities: [
      "Read channels, threads, and collaboration context.",
      "Power later workflow triggers around team communication.",
      "Stay catalog-only until a safe auth path is in place.",
    ],
    websiteUrl: "https://slack.com",
    docsUrl: "https://slack.com/help/articles/48855576908307-Guide-to-the-Slack-MCP-server",
    logoUrl: "/app-logos/slack.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth",
      note:
        "Slack should stay catalog-first until PolyNet supports the right auth and approval path.",
    },
  },
  {
    id: "discord",
    name: "Discord",
    tagline: "Servers, channels, messages, and community operations",
    description:
      "Important external community surface for creators whose audience already lives in Discord, but permission and moderation boundaries need a careful auth story.",
    supportLabel: "Backplane MCP",
    supportNote:
      "Discord MCP access appears strongest through connector backplanes such as Pipedream or community servers; no first-party Discord MCP endpoint was verified.",
    heroNote:
      "Best for reading community signal and coordinating Discord-based member workflows later.",
    capabilities: [
      "Read server/channel context through an approved connector.",
      "Coordinate announcements, member workflows, and community signal.",
      "Keep moderation and write operations gated behind explicit approval and scopes.",
    ],
    websiteUrl: "https://discord.com",
    docsUrl: "https://mcp.pipedream.com/app/discord",
    logoUrl: "/app-logos/discord.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "OAuth or managed connector",
      note:
        "Discord should stay catalog-first until PolyNet chooses a trusted connector and defines safe read/write moderation boundaries.",
    },
  },
  {
    id: "asana",
    name: "Asana",
    tagline: "Projects, tasks, goals, and work tracking",
    description:
      "Strong planning and execution surface for teams. It is the next static-client OAuth MCP target once Polynet's Asana OAuth client is configured.",
    supportLabel: "Needs OAuth client config",
    supportNote:
      "Asana's remote MCP server uses OAuth with a pre-registered client. Keep it catalog-only until the deployment has Asana client credentials configured.",
    heroNote:
      "Best for tasks, projects, goals, and execution tracking across teams.",
    capabilities: [
      "Read task state, project progress, and planning context.",
      "Support personal and community execution workflows once the OAuth client is configured.",
      "Use OAuth so each member can connect their own Asana workspace later.",
    ],
    websiteUrl: "https://asana.com",
    docsUrl: "https://developers.asana.com/docs/using-asanas-mcp-server",
    logoUrl: "/app-logos/asana.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.asana.com/v2/mcp",
      authType: null,
      authLabel: "OAuth",
      note:
        "Asana should stay informational until the Polynet deployment has a configured Asana OAuth client.",
    },
  },
];
