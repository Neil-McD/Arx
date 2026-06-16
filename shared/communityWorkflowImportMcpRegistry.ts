import type { DeveloperAppAuthType } from "./communityAppMountTypes.ts";

export type CommunityWorkflowImportMcpRegistryStatus =
  | "ready"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
  | "unsupported"
  | "unknown";

export type CommunityWorkflowImportMcpRegistryConnectionClass =
  | "hosted_remote"
  | "managed_runtime"
  | "local_only";

export type CommunityWorkflowImportMcpRegistrySetupKind =
  | "remote_ready"
  | "needs_user_auth"
  | "needs_nonsecret_config"
  | "needs_managed_runtime"
  | "not_portable";

export type CommunityWorkflowImportMcpRegistryAuthHeaderStrategy =
  | "none"
  | "authorization_bearer"
  | "x_api_key"
  | "oauth_bearer"
  | "provider_specific";

export type CommunityWorkflowImportMcpRegistryConfigParam = {
  key: string;
  required: boolean;
  secret: boolean;
  description: string;
};

export type CommunityWorkflowImportMcpRegistryEntry = {
  id: string;
  catalogAppId: string | null;
  name: string;
  aliases: string[];
  packageNames: string[];
  endpointHosts: string[];
  defaultEndpointUrl?: string | null;
  commandTokens: string[];
  reviewLogoUrl: string | null;
  docsUrls: string[];
  sourceUrls: string[];
  status: CommunityWorkflowImportMcpRegistryStatus;
  connectionClass: CommunityWorkflowImportMcpRegistryConnectionClass;
  setupKind: CommunityWorkflowImportMcpRegistrySetupKind;
  supportedTransports: string[];
  supportedAuthTypes: DeveloperAppAuthType[];
  defaultAuthType: DeveloperAppAuthType | null;
  oauthScopes?: string[];
  authHeaderStrategy: CommunityWorkflowImportMcpRegistryAuthHeaderStrategy;
  requiredSecretNames: string[];
  requiredConfigParams: string[];
  structuredConfigParams: CommunityWorkflowImportMcpRegistryConfigParam[];
  reason: string;
};

export type CommunityWorkflowImportMcpRegistryConnectPolicyResult =
  | {
      ok: true;
      mcpRegistryId: string;
      name: string;
      endpointUrl: string;
      authType: DeveloperAppAuthType;
    }
  | {
      ok: false;
      code:
        | "mcp_registry_entry_missing"
        | "mcp_registry_entry_not_remote"
        | "mcp_registry_endpoint_invalid"
        | "mcp_registry_endpoint_not_allowed"
        | "mcp_registry_auth_invalid";
      message: string;
    };

export const COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY: CommunityWorkflowImportMcpRegistryEntry[] =
  [
    {
      id: "github",
      catalogAppId: "github",
      name: "GitHub",
      aliases: [
        "github",
        "github mcp",
        "github mcp server",
        "github copilot",
        "githubcopilot",
        "modelcontextprotocol server github",
        "modelcontextprotocol-server-github",
      ],
      packageNames: [
        "@modelcontextprotocol/server-github",
        "github-mcp-server",
      ],
      endpointHosts: ["api.githubcopilot.com"],
      defaultEndpointUrl: "https://api.githubcopilot.com/mcp/readonly",
      commandTokens: ["github-mcp-server"],
      reviewLogoUrl: "/app-logos/github.svg",
      docsUrls: ["https://github.com/github/github-mcp-server"],
      sourceUrls: ["https://github.com/github/github-mcp-server"],
      status: "ready",
      connectionClass: "hosted_remote",
      setupKind: "needs_user_auth",
      supportedTransports: ["streamable_http", "http"],
      supportedAuthTypes: ["oauth", "bearer"],
      defaultAuthType: "oauth",
      authHeaderStrategy: "oauth_bearer",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "toolsets",
          required: false,
          secret: false,
          description: "Optional GitHub MCP toolset restriction.",
        },
        {
          key: "read_only",
          required: false,
          secret: false,
          description: "Whether the imported workflow intended read-only GitHub access.",
        },
      ],
      reason:
        "GitHub has a vetted remote MCP identity. PolyNet should prefer OAuth when available and use scoped bearer tokens only as a fallback.",
    },
    {
      id: "supabase",
      catalogAppId: "supabase",
      name: "Supabase",
      aliases: ["supabase", "supabase mcp", "supabase mcp server"],
      packageNames: ["@supabase/mcp-server-supabase"],
      endpointHosts: ["mcp.supabase.com"],
      defaultEndpointUrl: "https://mcp.supabase.com/mcp",
      commandTokens: ["supabase-mcp-server"],
      reviewLogoUrl: "/app-logos/supabase.svg",
      docsUrls: ["https://supabase.com/docs/guides/getting-started/mcp"],
      sourceUrls: [],
      status: "ready",
      connectionClass: "hosted_remote",
      setupKind: "needs_user_auth",
      supportedTransports: ["streamable_http", "http"],
      supportedAuthTypes: ["oauth", "bearer"],
      defaultAuthType: "oauth",
      authHeaderStrategy: "oauth_bearer",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "project_ref",
          required: false,
          secret: false,
          description: "Optional Supabase project ref imported from the source harness.",
        },
        {
          key: "read_only",
          required: false,
          secret: false,
          description: "Whether the source harness configured the Supabase MCP in read-only mode.",
        },
      ],
      reason:
        "Supabase has a vetted remote MCP identity. PolyNet should preserve project/read-only config and use OAuth or a scoped access token.",
    },
    {
      id: "vercel",
      catalogAppId: "vercel",
      name: "Vercel",
      aliases: ["vercel", "vercel mcp", "vercel mcp server"],
      packageNames: [],
      endpointHosts: ["mcp.vercel.com"],
      defaultEndpointUrl: "https://mcp.vercel.com",
      commandTokens: [],
      reviewLogoUrl: "/app-logos/vercel.svg",
      docsUrls: ["https://vercel.com/docs/agent-resources/vercel-mcp"],
      sourceUrls: [],
      status: "needs_auth",
      connectionClass: "hosted_remote",
      setupKind: "needs_user_auth",
      supportedTransports: ["streamable_http", "http"],
      supportedAuthTypes: ["oauth"],
      defaultAuthType: "oauth",
      oauthScopes: ["openid", "email", "profile", "offline_access"],
      authHeaderStrategy: "oauth_bearer",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "team_id",
          required: false,
          secret: false,
          description: "Optional Vercel team scope selected after authentication.",
        },
        {
          key: "project_id",
          required: false,
          secret: false,
          description: "Optional Vercel project scope selected after authentication.",
        },
      ],
      reason:
        "Vercel is recognized as a hosted OAuth MCP. It should stage for OAuth setup until PolyNet exposes the full setup path.",
    },
    {
      id: "context7",
      catalogAppId: null,
      name: "Context7",
      aliases: [
        "context7",
        "context7 mcp",
        "context7 mcp server",
        "upstash context7",
      ],
      packageNames: ["@upstash/context7-mcp"],
      endpointHosts: ["mcp.context7.com"],
      defaultEndpointUrl: "https://mcp.context7.com/mcp",
      commandTokens: ["context7", "context7-mcp"],
      reviewLogoUrl: "/app-logos/context7.svg",
      docsUrls: [],
      sourceUrls: [],
      status: "ready",
      connectionClass: "hosted_remote",
      setupKind: "remote_ready",
      supportedTransports: ["streamable_http", "stdio"],
      supportedAuthTypes: ["none", "api_key", "bearer"],
      defaultAuthType: "none",
      authHeaderStrategy: "provider_specific",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [],
      reason:
        "Context7 is recognized as a hosted remote MCP that can expose documentation tools without required user authentication. API key or bearer auth can be added later for higher limits.",
    },
    {
      id: "fly",
      catalogAppId: null,
      name: "Fly",
      aliases: [
        "fly",
        "fly.io",
        "fly mcp",
        "fly mcp server",
        "flydotio",
        "flyctl",
      ],
      packageNames: [],
      endpointHosts: [],
      defaultEndpointUrl: null,
      commandTokens: ["flyctl"],
      reviewLogoUrl: "/app-logos/fly-light.svg",
      docsUrls: [],
      sourceUrls: [],
      status: "needs_runtime",
      connectionClass: "managed_runtime",
      setupKind: "needs_managed_runtime",
      supportedTransports: ["stdio"],
      supportedAuthTypes: ["bearer"],
      defaultAuthType: null,
      authHeaderStrategy: "authorization_bearer",
      requiredSecretNames: ["FLY_ACCESS_TOKEN"],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "org",
          required: false,
          secret: false,
          description: "Optional Fly organization context for the managed runtime.",
        },
        {
          key: "app",
          required: false,
          secret: false,
          description: "Optional Fly app context for the managed runtime.",
        },
      ],
      reason:
        "Fly was detected as a local CLI/runtime MCP shape, which cannot be copied into PolyNet as a remote hosted mount yet.",
    },
    {
      id: "convex",
      catalogAppId: null,
      name: "Convex",
      aliases: [
        "convex",
        "convex_dev",
        "convex prod obs",
        "convex_prod_obs",
        "convex mcp",
      ],
      packageNames: ["convex"],
      endpointHosts: [],
      defaultEndpointUrl: null,
      commandTokens: ["convex", "convex mcp"],
      reviewLogoUrl: null,
      docsUrls: ["https://docs.convex.dev"],
      sourceUrls: [],
      status: "needs_runtime",
      connectionClass: "managed_runtime",
      setupKind: "needs_managed_runtime",
      supportedTransports: ["stdio"],
      supportedAuthTypes: ["none", "bearer"],
      defaultAuthType: null,
      authHeaderStrategy: "provider_specific",
      requiredSecretNames: [],
      requiredConfigParams: ["project_dir", "deployment"],
      structuredConfigParams: [
        {
          key: "project_dir",
          required: true,
          secret: false,
          description: "Project path or managed runtime workspace that the Convex MCP should operate on.",
        },
        {
          key: "deployment",
          required: false,
          secret: false,
          description: "Optional Convex deployment or environment target.",
        },
        {
          key: "disabled_tools",
          required: false,
          secret: false,
          description: "Optional tool denylist copied from the source harness safety configuration.",
        },
      ],
      reason:
        "Convex was detected as a project-bound CLI MCP shape. PolyNet can attach it for setup tracking, but it needs a managed runtime/config path before tools can be live.",
    },
    {
      id: "workos_docs",
      catalogAppId: null,
      name: "WorkOS Docs",
      aliases: [
        "workos",
        "workos docs",
        "workos_docs",
        "workos mcp",
        "workos docs mcp",
      ],
      packageNames: ["@workos/mcp-docs-server"],
      endpointHosts: [],
      defaultEndpointUrl: null,
      commandTokens: ["workos", "mcp-docs-server"],
      reviewLogoUrl: null,
      docsUrls: ["https://workos.com/docs"],
      sourceUrls: [],
      status: "needs_runtime",
      connectionClass: "managed_runtime",
      setupKind: "needs_managed_runtime",
      supportedTransports: ["stdio"],
      supportedAuthTypes: ["none"],
      defaultAuthType: null,
      authHeaderStrategy: "none",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [],
      reason:
        "WorkOS Docs was detected as a local stdio docs MCP. PolyNet can attach it for setup tracking, but it needs a hosted/runtime adapter before tools can be live.",
    },
    {
      id: "posthog",
      catalogAppId: null,
      name: "PostHog",
      aliases: ["posthog", "posthog mcp", "posthog mcp server"],
      packageNames: [],
      endpointHosts: ["mcp.posthog.com"],
      defaultEndpointUrl: "https://mcp.posthog.com",
      commandTokens: ["posthog"],
      reviewLogoUrl: "/app-logos/posthog.svg",
      docsUrls: ["https://posthog.com/docs"],
      sourceUrls: [],
      status: "needs_auth",
      connectionClass: "hosted_remote",
      setupKind: "needs_user_auth",
      supportedTransports: ["streamable_http", "http", "stdio"],
      supportedAuthTypes: ["oauth", "bearer", "api_key"],
      defaultAuthType: "oauth",
      authHeaderStrategy: "oauth_bearer",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "features",
          required: false,
          secret: false,
          description: "Optional PostHog MCP feature filter copied from the source URL.",
        },
        {
          key: "project_id",
          required: false,
          secret: false,
          description: "Optional PostHog project scope selected after setup.",
        },
      ],
      reason:
        "PostHog is recognized as a hosted OAuth MCP and should stage for user authentication, preserving feature filters from the import.",
    },
    {
      id: "sentry",
      catalogAppId: null,
      name: "Sentry",
      aliases: ["sentry", "sentry mcp", "sentry mcp server"],
      packageNames: [],
      endpointHosts: ["mcp.sentry.dev"],
      defaultEndpointUrl: "https://mcp.sentry.dev",
      commandTokens: ["sentry"],
      reviewLogoUrl: "/app-logos/sentry.svg",
      docsUrls: ["https://docs.sentry.io"],
      sourceUrls: [],
      status: "needs_auth",
      connectionClass: "hosted_remote",
      setupKind: "needs_user_auth",
      supportedTransports: ["streamable_http", "http", "stdio"],
      supportedAuthTypes: ["oauth"],
      defaultAuthType: "oauth",
      oauthScopes: ["org:read", "project:write", "team:write", "event:write"],
      authHeaderStrategy: "oauth_bearer",
      requiredSecretNames: [],
      requiredConfigParams: [],
      structuredConfigParams: [
        {
          key: "organization_slug",
          required: false,
          secret: false,
          description: "Optional Sentry organization scope selected after authentication.",
        },
        {
          key: "project_slug",
          required: false,
          secret: false,
          description: "Optional Sentry project scope selected after authentication.",
        },
      ],
      reason:
        "Sentry is recognized as a hosted OAuth MCP and should stage for user authentication before tools can be live.",
    },
    {
      id: "computer_use",
      catalogAppId: null,
      name: "Computer Use",
      aliases: [
        "computer-use",
        "computer use",
        "desktop automation",
        "computer-use mcp",
      ],
      packageNames: [],
      endpointHosts: [],
      defaultEndpointUrl: null,
      commandTokens: ["computer-use"],
      reviewLogoUrl: null,
      docsUrls: [],
      sourceUrls: [],
      status: "needs_runtime",
      connectionClass: "local_only",
      setupKind: "not_portable",
      supportedTransports: ["stdio"],
      supportedAuthTypes: ["none"],
      defaultAuthType: null,
      authHeaderStrategy: "none",
      requiredSecretNames: [],
      requiredConfigParams: ["runtime"],
      structuredConfigParams: [
        {
          key: "runtime",
          required: true,
          secret: false,
          description: "Local desktop runtime bridge required by the source harness.",
        },
      ],
      reason:
        "Computer Use is a local desktop/runtime capability. PolyNet can attach it for setup tracking, but it needs a managed runtime before tools can be live.",
    },
    {
      id: "node_repl",
      catalogAppId: null,
      name: "Node REPL",
      aliases: ["node_repl", "node repl", "node-repl"],
      packageNames: [],
      endpointHosts: [],
      defaultEndpointUrl: null,
      commandTokens: ["node-repl", "node_repl"],
      reviewLogoUrl: null,
      docsUrls: [],
      sourceUrls: [],
      status: "needs_runtime",
      connectionClass: "managed_runtime",
      setupKind: "needs_managed_runtime",
      supportedTransports: ["stdio"],
      supportedAuthTypes: ["none"],
      defaultAuthType: null,
      authHeaderStrategy: "none",
      requiredSecretNames: [],
      requiredConfigParams: ["runtime"],
      structuredConfigParams: [
        {
          key: "runtime",
          required: true,
          secret: false,
          description: "Managed Node execution runtime required before this MCP can be live.",
        },
      ],
      reason:
        "Node REPL is a local runtime capability. PolyNet can attach it for setup tracking, but it needs a managed runtime before tools can be live.",
    },
  ];

function normalizeRegistryKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEndpointHost(value: unknown): string {
  try {
    const raw = String(value ?? "").trim();
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.hostname.trim().toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeRegistryEndpointUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSupportedRegistryAuthType(
  value: unknown,
): value is DeveloperAppAuthType {
  return (
    value === "none" ||
    value === "api_key" ||
    value === "bearer" ||
    value === "oauth"
  );
}

export function findCommunityWorkflowImportMcpRegistryEntryById(
  mcpRegistryId: unknown,
): CommunityWorkflowImportMcpRegistryEntry | null {
  const id = normalizeRegistryKey(mcpRegistryId);
  if (!id) return null;
  return (
    COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY.find(
      (entry) => normalizeRegistryKey(entry.id) === id,
    ) ?? null
  );
}

export function resolveCommunityWorkflowImportMcpRegistryConnectPolicy(args: {
  mcpRegistryId?: unknown;
  name?: unknown;
  endpointUrl: unknown;
  authType: unknown;
}): CommunityWorkflowImportMcpRegistryConnectPolicyResult {
  const entry = findCommunityWorkflowImportMcpRegistryEntryById(
    args.mcpRegistryId,
  );
  if (!entry) {
    return {
      ok: false,
      code: "mcp_registry_entry_missing",
      message: "This imported MCP is not in the reviewed PolyNet registry.",
    };
  }
  const supportsRemote = entry.supportedTransports.some(
    (transport) => transport === "http" || transport === "streamable_http",
  );
  if (
    !supportsRemote ||
    entry.status === "needs_runtime" ||
    entry.status === "unsupported" ||
    entry.status === "unknown"
  ) {
    return {
      ok: false,
      code: "mcp_registry_entry_not_remote",
      message:
        "This imported MCP needs managed runtime support before it can be connected.",
    };
  }
  const endpointUrl = normalizeRegistryEndpointUrl(args.endpointUrl);
  const endpointHost = normalizeEndpointHost(endpointUrl);
  if (!endpointUrl || !endpointHost) {
    return {
      ok: false,
      code: "mcp_registry_endpoint_invalid",
      message: "Use a valid HTTPS MCP endpoint.",
    };
  }
  const allowedHosts = entry.endpointHosts.map(normalizeEndpointHost).filter(Boolean);
  if (
    allowedHosts.length === 0 ||
    !allowedHosts.some((host) => endpointHost === host)
  ) {
    return {
      ok: false,
      code: "mcp_registry_endpoint_not_allowed",
      message:
        "This endpoint is not yet reviewed for the imported MCP registry entry.",
    };
  }
  if (!isSupportedRegistryAuthType(args.authType)) {
    return {
      ok: false,
      code: "mcp_registry_auth_invalid",
      message: "Use a supported auth mode for this MCP setup.",
    };
  }
  if (!entry.supportedAuthTypes.includes(args.authType)) {
    return {
      ok: false,
      code: "mcp_registry_auth_invalid",
      message: `${entry.name} does not support ${args.authType} setup in PolyNet yet.`,
    };
  }
  if (
    args.authType === "none" &&
    (entry.status === "needs_auth" || entry.requiredSecretNames.length > 0)
  ) {
    return {
      ok: false,
      code: "mcp_registry_auth_invalid",
      message: "This MCP setup requires an API key or bearer token.",
    };
  }
  return {
    ok: true,
    mcpRegistryId: entry.id,
    name: String(args.name ?? "").trim() || entry.name,
    endpointUrl,
    authType: args.authType,
  };
}
