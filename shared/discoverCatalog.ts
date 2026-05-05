import type { DeveloperAppAuthType } from "./communityAppMountTypes";

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
        "Connects into your personal harness and stays available across communities.",
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
        "OAuth is the recommended long-term path, but Airtable's PAT support fits the current manual bearer-token connector.",
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    tagline: "Customers, subscriptions, invoices, and payments",
    description:
      "Important billing and commerce context surface, but PolyNet billing authority must remain entitlement-driven and server-verified.",
    supportLabel: "Needs richer auth",
    supportNote:
      "Stripe hosts a remote OAuth MCP server and also supports a local restricted-key MCP server; PolyNet should not expose it as ready until hosted auth and permission scoping are explicit.",
    heroNote:
      "Best for commerce operations, customer context, invoices, and subscription support workflows.",
    capabilities: [
      "Inspect customers, invoices, products, subscriptions, and payments.",
      "Support builder commerce workflows without replacing PolyNet entitlement checks.",
      "Use restricted permissions and audit trails before enabling write operations.",
    ],
    websiteUrl: "https://stripe.com",
    docsUrl: "https://github.com/stripe/ai",
    logoUrl: "/app-logos/stripe.svg",
    personalConnect: {
      connectionKind: "known",
      availability: "later",
      authMethod: "oauth",
      connectionStrategy: {
        defaultMode: "oauth",
        supportedModes: ["oauth", "token"],
      },
      endpointUrl: "https://mcp.stripe.com",
      authType: null,
      authLabel: "OAuth or restricted key",
      secretLabel: "Stripe restricted key",
      note:
        "Catalog-first until PolyNet can separate Stripe MCP operations from PolyNet's own authoritative billing and entitlement contract.",
    },
  },
  {
    id: "shopify",
    name: "Shopify",
    tagline: "Storefront catalog, carts, policies, and checkout handoff",
    description:
      "Strong commerce surface for creator communities that sell products, merch, courses, templates, or member-facing store bundles.",
    supportLabel: "Custom endpoint ready",
    supportNote:
      "Shopify documents per-store Storefront MCP endpoints at https://{shop}.myshopify.com/api/mcp with no authentication required, though individual stores may restrict access.",
    heroNote:
      "Best for letting a community agent answer product questions and guide shoppers through a store catalog.",
    capabilities: [
      "Search a specific store's catalog and product policies.",
      "Create and update shopping carts through the storefront MCP surface.",
      "Support commerce recommendations without touching PolyNet billing authority.",
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
        "Paste the target store's Storefront MCP endpoint. Keep Shopify Admin operations out of this path until scoped write auth is explicit.",
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
    id: "hyperframes",
    name: "HyperFrames",
    tagline: "HTML, CSS, and JS video compositions",
    description:
      "Agent-oriented video authoring framework for composing videos as web documents and rendering them into production media.",
    supportLabel: "Skill path",
    supportNote:
      "HyperFrames currently looks more like an agent skill and local rendering toolchain than a normal hosted MCP server.",
    heroNote:
      "Best for builder communities that want agents to generate video from structured HTML scenes.",
    capabilities: [
      "Compose videos from HTML, CSS, and JavaScript.",
      "Render agent-authored scenes into MP4/WebM outputs.",
      "Pair with creative MCP apps when PolyNet supports local or sandboxed rendering tools.",
    ],
    websiteUrl: "https://hyperframes.heygen.com",
    docsUrl: "https://hyperframes.heygen.com",
    logoUrl: "/app-logos/hyperframes.svg",
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
      authLabel: "Skill or local toolchain",
      note:
        "Keep HyperFrames informational until PolyNet has a safe skill/runtime path for rendering, rather than pretending it is a hosted MCP endpoint.",
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
