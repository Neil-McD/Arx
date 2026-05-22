export type CommunityWorkflowImportMcpRegistryStatus =
  | "ready"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
  | "unsupported"
  | "unknown";

export type CommunityWorkflowImportMcpRegistryEntry = {
  id: string;
  catalogAppId: string | null;
  name: string;
  aliases: string[];
  packageNames: string[];
  endpointHosts: string[];
  commandTokens: string[];
  reviewLogoUrl: string | null;
  docsUrls: string[];
  sourceUrls: string[];
  status: CommunityWorkflowImportMcpRegistryStatus;
  supportedTransports: string[];
  requiredSecretNames: string[];
  requiredConfigParams: string[];
  reason: string;
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
      commandTokens: ["github-mcp-server"],
      reviewLogoUrl: null,
      docsUrls: ["https://github.com/github/github-mcp-server"],
      sourceUrls: ["https://github.com/github/github-mcp-server"],
      status: "ready",
      supportedTransports: ["streamable_http", "http"],
      requiredSecretNames: [],
      requiredConfigParams: [],
      reason: "GitHub has a vetted PolyNet catalog connection profile.",
    },
    {
      id: "supabase",
      catalogAppId: "supabase",
      name: "Supabase",
      aliases: ["supabase", "supabase mcp", "supabase mcp server"],
      packageNames: ["@supabase/mcp-server-supabase"],
      endpointHosts: ["mcp.supabase.com"],
      commandTokens: ["supabase-mcp-server"],
      reviewLogoUrl: null,
      docsUrls: ["https://supabase.com/docs/guides/getting-started/mcp"],
      sourceUrls: [],
      status: "ready",
      supportedTransports: ["streamable_http", "http"],
      requiredSecretNames: [],
      requiredConfigParams: [],
      reason: "Supabase has a vetted PolyNet catalog connection profile.",
    },
    {
      id: "vercel",
      catalogAppId: "vercel",
      name: "Vercel",
      aliases: ["vercel", "vercel mcp", "vercel mcp server"],
      packageNames: [],
      endpointHosts: ["mcp.vercel.com"],
      commandTokens: [],
      reviewLogoUrl: null,
      docsUrls: ["https://vercel.com/docs/agent-resources/vercel-mcp"],
      sourceUrls: [],
      status: "needs_auth",
      supportedTransports: ["streamable_http", "http"],
      requiredSecretNames: [],
      requiredConfigParams: [],
      reason:
        "Vercel is recognized, but PolyNet does not yet have a ready catalog auth profile for automatic mounting.",
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
      commandTokens: ["context7", "context7-mcp"],
      reviewLogoUrl: "/app-logos/context7.svg",
      docsUrls: [],
      sourceUrls: [],
      status: "needs_config",
      supportedTransports: ["streamable_http", "stdio"],
      requiredSecretNames: [],
      requiredConfigParams: [],
      reason:
        "Context7 is recognized for review, but it does not yet have a vetted PolyNet catalog mount profile.",
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
      commandTokens: ["flyctl"],
      reviewLogoUrl: "/app-logos/fly-light.svg",
      docsUrls: [],
      sourceUrls: [],
      status: "needs_runtime",
      supportedTransports: ["stdio"],
      requiredSecretNames: [],
      requiredConfigParams: [],
      reason:
        "Fly was detected as a local CLI/runtime MCP shape, which cannot be copied into PolyNet as a remote hosted mount yet.",
    },
  ];
