import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";

export type DiscoverAppConnectionKind = "known" | "custom";
export type DiscoverAppConnectionMode = "token" | "oauth" | "none" | "custom";
export type DiscoverAppAuthMethod = DiscoverAppConnectionMode;

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
  authType: Exclude<DeveloperAppAuthType, "none">;
  authLabel: string;
  secretLabel: string;
  tokenHelpUrl: string;
  tokenHelpLabel: string;
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
  personalConnect: DiscoverAppPersonalConnectTemplate;
};

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
      name: hostLabel,
      endpoint_url: endpointUrl,
      auth_type: authType,
      description: args.description,
      secret: authType === "none" ? undefined : args.secret,
    };
  }
  return {
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
      return `Paste your ${app.personalConnect.secretLabel} to connect ${app.name} now. OAuth support will come later.`;
    }
    return `Paste your ${app.personalConnect.secretLabel} to connect ${app.name} to your personal platform tools.`;
  }
  return `Review the connection requirements, then connect ${app.name} to your personal platform tools.`;
}

export const DISCOVER_APP_CATALOG: DiscoverAppCatalogEntry[] = [
  {
    id: "github",
    name: "GitHub",
    tagline: "Issues, PRs, repos, and CI context",
    description:
      "Curated GitHub app template for software context, triage, and later shared operating workflows.",
    supportLabel: "Catalog only for now",
    supportNote:
      "Keep GitHub as a known app in the catalog, but do not imply a direct personal connection path until its generic remote MCP setup is explicitly verified for PolyNet.",
    heroNote:
      "Best for triaging repos, pull requests, issues, and CI workflows.",
    capabilities: [
      "Inspect repos, issues, pull requests, and checks.",
      "Give agents shared software project context.",
      "Later support both personal and community software workflows.",
    ],
    websiteUrl: "https://github.com",
    docsUrl: "https://github.com/github/github-mcp-server",
    logoUrl: "/app-logos/github.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "token",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "token"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Bearer token",
      secretLabel: "GitHub token",
      note:
        "GitHub stays catalog-first until the generic hosted MCP path is verified end to end for PolyNet.",
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
        "Connects into your baseline platform tools and stays available even when no community lens is active.",
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    tagline: "Deployments, logs, env, and project ops",
    description:
      "High-value platform operations surface, but the cleanest path still depends on a fuller auth story than the current alpha connector contract provides.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Keep Vercel in the catalog as a known app, but treat direct personal connection as later work until the auth path is fully honest.",
    heroNote:
      "Best for deployments, environment state, logs, and project operations.",
    capabilities: [
      "Inspect deployments, projects, logs, and environment state.",
      "Support platform and builder workflows once auth is handled cleanly.",
      "Hide MCP mechanics behind a real known-app template later.",
    ],
    websiteUrl: "https://vercel.com",
    docsUrl: "https://vercel.com/docs/agent-resources/vercel-mcp",
    logoUrl: "/app-logos/vercel.svg",
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
      authLabel: "OAuth or managed auth",
      note:
        "Vercel belongs in the known-app catalog, but not in the live personal connect path yet.",
    },
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Issues, projects, cycles, and team planning",
    description:
      "Strong near-term MCP candidate for execution workflows and one of the best current fits for personal platform-level app mounts.",
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
        "Connects into your baseline platform tools so it stays active with or without a community lens.",
    },
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Pages, docs, databases, and workspace context",
    description:
      "High-value knowledge surface for teams and personal work, but it is better treated as catalog-first until a richer auth path exists.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Notion is a strong app page candidate now, but it should not pretend to be one-click connectable under the current alpha connector contract.",
    heroNote:
      "Best for shared workspace context, docs, pages, and structured databases.",
    capabilities: [
      "Read workspace docs, pages, and structured knowledge.",
      "Give personal and community agents richer memory context.",
      "Stay catalog-first until the auth path is fully honest.",
    ],
    websiteUrl: "https://www.notion.com",
    docsUrl: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    logoUrl: "/app-logos/notion.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth"],
      },
      endpointUrl: "https://mcp.notion.com/mcp",
      authType: null,
      authLabel: "OAuth or managed auth",
      note:
        "Notion needs a richer auth flow before personal connection is honest in PolyNet.",
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
    id: "asana",
    name: "Asana",
    tagline: "Projects, tasks, goals, and work tracking",
    description:
      "Strong planning and execution surface for teams, but it still needs a fuller auth path before direct personal connection is honest.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Asana is a good catalog and detail-page candidate now, but direct connection should wait for a richer auth flow.",
    heroNote:
      "Best for tasks, projects, goals, and execution tracking across teams.",
    capabilities: [
      "Read task state, project progress, and planning context.",
      "Support personal and community execution workflows later.",
      "Stay catalog-first until the connection path can be made honest.",
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
        "Asana should stay informational until PolyNet supports the right auth path for it.",
    },
  },
];
