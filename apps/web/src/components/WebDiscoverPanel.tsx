import { useEffect, useState } from "react";

import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";

type DiscoverTab = "communities" | "apps" | "skills";

type DiscoverAppCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  auth: string;
  surface: string;
  category: string;
  heroNote: string;
  capabilities: [string, string, string];
  websiteUrl: string;
  docsUrl: string;
  icon: "github" | "supabase" | "vercel" | "linear" | "notion" | "slack" | "asana";
};

type DiscoverSkillCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  invocation: string;
  surface: string;
  category: string;
  icon: "research" | "summary" | "workflow" | "custom";
};

const DISCOVER_TABS: Array<{ id: DiscoverTab; label: string }> = [
  { id: "communities", label: "Communities" },
  { id: "apps", label: "Apps" },
  { id: "skills", label: "Skills" },
];

const DISCOVER_APP_CATALOG: DiscoverAppCatalogEntry[] = [
  {
    id: "github",
    name: "GitHub",
    tagline: "Issues, PRs, repos, and CI context",
    description:
      "Curated GitHub app template for community and later personal workflows. Best fit once the known-app connect path is wired.",
    auth: "Bearer token",
    surface: "Community first",
    category: "Curated",
    heroNote: "Best for triaging repos, pull requests, issues, and CI workflows.",
    capabilities: [
      "Inspect repos, issues, pull requests, and checks.",
      "Give agents shared software project context.",
      "Later support both personal and community software workflows.",
    ],
    websiteUrl: "https://github.com",
    docsUrl: "https://github.com/github/github-mcp-server",
    icon: "github",
  },
  {
    id: "supabase",
    name: "Supabase",
    tagline: "Hosted remote MCP and data tooling",
    description:
      "Good alpha reference for a direct hosted MCP endpoint. Useful for validating the simple manual custom-MCP path.",
    auth: "None or bearer",
    surface: "Community first",
    category: "Curated",
    heroNote: "Best current example of a hosted MCP app that already fits the alpha connector contract.",
    capabilities: [
      "Connect a real hosted remote MCP endpoint over HTTPS.",
      "Query Supabase-backed tools and data surfaces.",
      "Use as the clearest current reference for a truthful manual connect path.",
    ],
    websiteUrl: "https://supabase.com",
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    icon: "supabase",
  },
  {
    id: "vercel",
    name: "Vercel",
    tagline: "Deployments, logs, env, and project ops",
    description:
      "A strong known-app candidate once curated templates exist. Good example of where auth and app packaging should hide MCP details from normal users.",
    auth: "Bearer token",
    surface: "Community first",
    category: "Curated",
    heroNote: "Best for deployments, environment state, logs, and project operations.",
    capabilities: [
      "Inspect deployments, projects, logs, and environment state.",
      "Support platform and builder workflows once auth is handled cleanly.",
      "Hide MCP mechanics behind a real known-app template later.",
    ],
    websiteUrl: "https://vercel.com",
    docsUrl: "https://vercel.com/docs/agent-resources/vercel-mcp",
    icon: "vercel",
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Issues, projects, cycles, and team planning",
    description:
      "Strong near-term MCP candidate for product and execution workflows. Good fit for personal agents and community operating systems.",
    auth: "Bearer token",
    surface: "Personal or community",
    category: "Curated",
    heroNote: "Best for issue planning, cycles, execution, and product operating rhythms.",
    capabilities: [
      "Find issues, cycles, and project planning context.",
      "Give teams and personal agents a clean execution surface.",
      "Likely one of the easiest next real app templates under the current auth contract.",
    ],
    websiteUrl: "https://linear.app",
    docsUrl: "https://linear.app/docs/mcp",
    icon: "linear",
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Pages, docs, databases, and workspace context",
    description:
      "High-value knowledge surface for teams, but likely OAuth-heavy. Good catalog candidate even before the full connect path is wired.",
    auth: "OAuth or bearer",
    surface: "Personal or community",
    category: "Curated",
    heroNote: "Best for shared workspace context, docs, pages, and structured databases.",
    capabilities: [
      "Read workspace docs, pages, and structured knowledge.",
      "Give personal and community agents richer memory context.",
      "Stay as a catalog-first app until the auth path is fully honest.",
    ],
    websiteUrl: "https://www.notion.com",
    docsUrl: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    icon: "notion",
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Channels, threads, messages, and workspace signal",
    description:
      "Excellent collaboration surface for later workflows. Keep it in the catalog now, but treat connection as a later auth-heavy path.",
    auth: "OAuth",
    surface: "Personal or community",
    category: "Curated",
    heroNote: "Best for channel context, team communication, and operational signal.",
    capabilities: [
      "Read channels, threads, and collaboration context.",
      "Power later workflow triggers around team communication.",
      "Stay catalog-only until a safe auth path is in place.",
    ],
    websiteUrl: "https://slack.com",
    docsUrl: "https://slack.com/help/articles/48855576908307-Guide-to-the-Slack-MCP-server",
    icon: "slack",
  },
  {
    id: "asana",
    name: "Asana",
    tagline: "Projects, tasks, goals, and work tracking",
    description:
      "Strong planning and execution surface for teams. Good catalog candidate now, but likely needs a fuller auth flow before direct PolyNet connection is honest.",
    auth: "OAuth",
    surface: "Personal or community",
    category: "Curated",
    heroNote: "Best for tasks, projects, goals, and execution tracking across teams.",
    capabilities: [
      "Read task state, project progress, and planning context.",
      "Support personal and community execution workflows later.",
      "Stay catalog-first until the connection path can be made honest.",
    ],
    websiteUrl: "https://asana.com",
    docsUrl: "https://developers.asana.com/docs/using-asanas-mcp-server",
    icon: "asana",
  },
];

const DISCOVER_SKILL_CATALOG: DiscoverSkillCatalogEntry[] = [
  {
    id: "weekly-research",
    name: "Weekly Research",
    tagline: "Scan, synthesize, and surface signal",
    description:
      "Reusable research behavior for scouting trends, extracting signal, and organizing follow-up questions.",
    invocation: "$weekly-research",
    surface: "Community first",
    category: "Curated",
    icon: "research",
  },
  {
    id: "board-summary",
    name: "Board Summary",
    tagline: "Executive compression for updates",
    description:
      "Turns long discussions into concise executive bullets with decisions, risks, and next actions.",
    invocation: "$board-summary",
    surface: "Community first",
    category: "Curated",
    icon: "summary",
  },
  {
    id: "workflow-builder",
    name: "Workflow Builder",
    tagline: "Compose repeatable operating patterns",
    description:
      "A reusable skill package for turning goals into step-based execution workflows.",
    invocation: "$workflow-builder",
    surface: "Personal or community",
    category: "Curated",
    icon: "workflow",
  },
  {
    id: "custom-skill",
    name: "Custom Skill",
    tagline: "Author your own reusable behavior package",
    description:
      "Fallback path for creating and attaching your own skills when the curated set does not fit the workflow.",
    invocation: "Name-derived",
    surface: "Advanced",
    category: "Manual",
    icon: "custom",
  },
];

type WebDiscoverPanelProps = {
  showMobileShell: boolean;
  discoverQuery: string;
  onChangeDiscoverQuery: (value: string) => void;
  isLoadingDiscover: boolean;
  onRefreshDiscover: () => void;
  discoverCommunitiesCount: number;
  discoverError: string | null;
  filteredDiscoverCommunities: DiscoverCommunitySnapshot[];
  formatPlanPrice: (plan: DiscoverCommunitySnapshot["active_plan"]) => string;
  formatCommunityVisibilityLabel: (visibility: DiscoverCommunitySnapshot["visibility"]) => string;
  isPublishedCommunityVisibility: (visibility: DiscoverCommunitySnapshot["visibility"]) => boolean;
  onActivateCommunity: (slug: string) => void;
};

export function WebDiscoverPanel(props: WebDiscoverPanelProps) {
  const {
    discoverQuery,
    onChangeDiscoverQuery,
    isLoadingDiscover,
    discoverCommunitiesCount,
    discoverError,
    filteredDiscoverCommunities,
    formatPlanPrice,
    formatCommunityVisibilityLabel,
    isPublishedCommunityVisibility,
    onActivateCommunity,
  } = props;
  const [activeTab, setActiveTab] = useState<DiscoverTab>("communities");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const activeTabIndex = DISCOVER_TABS.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(DISCOVER_TABS.length, activeTabIndex);
  const filteredApps = DISCOVER_APP_CATALOG;
  const filteredSkills = DISCOVER_SKILL_CATALOG;
  const selectedApp = selectedAppId
    ? DISCOVER_APP_CATALOG.find((entry) => entry.id === selectedAppId) ?? null
    : null;

  useEffect(() => {
    if (discoverQuery) {
      onChangeDiscoverQuery("");
    }
  }, [discoverQuery, onChangeDiscoverQuery]);

  const isAppsTab = activeTab === "apps";
  const isSkillsTab = activeTab === "skills";
  useEffect(() => {
    if (!isAppsTab && selectedAppId) {
      setSelectedAppId(null);
    }
  }, [isAppsTab, selectedAppId]);

  const heroTitle = selectedApp
    ? selectedApp.name
    : isAppsTab
      ? "Discover apps"
      : isSkillsTab
        ? "Discover skills"
        : "Discover communities";
  const heroSubtitle = selectedApp
    ? selectedApp.tagline
    : isAppsTab
      ? "Browse the app catalog here."
      : isSkillsTab
        ? "Browse reusable skill packages here."
        : "Find focused crews to build, learn, and ship faster.";

  const renderAppIcon = (icon: DiscoverAppCatalogEntry["icon"]) => {
    if (icon === "github") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.58 2 12.22c0 4.51 2.87 8.33 6.84 9.68.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.15-4.56-5.13 0-1.13.39-2.05 1.03-2.77-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.06A9.3 9.3 0 0 1 12 6.88c.85 0 1.7.12 2.5.36 1.9-1.35 2.74-1.06 2.74-1.06.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.77 0 3.99-2.34 4.86-4.57 5.12.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z"
          />
        </svg>
      );
    }
    if (icon === "supabase") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M13.8 3.3c.47-.6 1.44-.26 1.44.5v9.54a2.4 2.4 0 0 1-.5 1.47l-4.51 5.86c-.47.61-1.45.28-1.45-.49v-9.5c0-.54.18-1.06.52-1.48l4.5-5.9Z"
          />
          <path
            fill="currentColor"
            opacity=".48"
            d="M10.2 6.06c.48-.6 1.44-.27 1.44.49v3.12l-2.4 3.16H6.7c-.97 0-1.52-1.12-.94-1.9l4.44-4.87Z"
          />
        </svg>
      );
    }
    if (icon === "vercel") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 4 21 20H3L12 4Z" />
        </svg>
      );
    }
    if (icon === "linear") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path fill="currentColor" d="M12 4a8 8 0 0 1 8 8h-8V4Z" />
        </svg>
      );
    }
    if (icon === "notion") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="M5 6.5 15.7 5l3.3 2.2v10.3L8.3 19 5 16.8V6.5Zm3.3 1.7v8.1m0-8.1 7.4-1.1m-7.4 1.1 7.4 8.5m0-9.6v8.5"
          />
        </svg>
      );
    }
    if (icon === "slack") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#E01E5A" d="M9.1 3.8A2.1 2.1 0 1 1 4.9 3.8a2.1 2.1 0 0 1 4.2 0v5.3H9A2.1 2.1 0 1 1 9 13.3H3.8a2.1 2.1 0 1 1 0-4.2h5.3V3.8Z" />
          <path fill="#36C5F0" d="M20.2 9.1a2.1 2.1 0 1 1 0 4.2h-5.3V13A2.1 2.1 0 1 1 10.7 13V7.8a2.1 2.1 0 1 1 4.2 0v5.3h5.3Z" />
          <path fill="#2EB67D" d="M14.9 20.2a2.1 2.1 0 1 1 4.2 0 2.1 2.1 0 0 1-4.2 0v-5.3h.1a2.1 2.1 0 1 1 0-4.2h5.2a2.1 2.1 0 1 1 0 4.2h-5.3v5.3Z" />
          <path fill="#ECB22E" d="M3.8 14.9a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2h5.3v.1a2.1 2.1 0 1 1 4.2 0v5.2a2.1 2.1 0 1 1-4.2 0v-5.3H3.8Z" />
        </svg>
      );
    }
    if (icon === "asana") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="9" r="3" fill="#F06A6A" />
          <circle cx="16" cy="9" r="3" fill="#F8C15A" />
          <circle cx="12" cy="15.5" r="3" fill="#8A7CFF" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="17" r="2.5" fill="currentColor" />
        <circle cx="17" cy="17" r="2.5" fill="currentColor" />
      </svg>
    );
  };

  const renderSkillIcon = (icon: DiscoverSkillCatalogEntry["icon"]) => {
    if (icon === "research") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 5a7 7 0 1 0 4.4 12.45L19 22m-9-7V9m0 0V7m0 2h6m-6 0H8"
          />
        </svg>
      );
    }
    if (icon === "summary") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 6h10M7 10h10M7 14h6M6 3h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z"
          />
        </svg>
      );
    }
    if (icon === "workflow") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 7h4v4H7zM13 13h4v4h-4zM11 9h2m0 0v2m0-2 2 2M9 13H7a2 2 0 0 0-2 2v2m8-8h2a2 2 0 0 1 2 2v0"
          />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="17" r="2.5" fill="currentColor" />
        <circle cx="17" cy="17" r="2.5" fill="currentColor" />
      </svg>
    );
  };

  const renderInfoLink = (href: string, label: string) => (
    <a
      className="discover-info-link"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
      <span aria-hidden="true">↗</span>
    </a>
  );

  return (
    <div className="community-panel discover-panel">
      <div className="discover-hero">
        <div className="discover-hero-copy">
          <div className="discover-title">{heroTitle}</div>
          <div className="discover-subtitle">{heroSubtitle}</div>
        </div>
        <div className="discover-hero-actions">
          <div
            className="platform-switcher platform-switcher-compact community-ai-agent-tablist discover-tablist"
            role="tablist"
            aria-label="Discover sections"
            style={tabSwitcherStyle}
          >
            {DISCOVER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`platform-switcher-btn community-ai-agent-tab discover-tab${activeTab === tab.id ? " is-active" : ""}`}
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="workspace-body chat-feed">
        <div className="chat-messages discover-scroll">
          {isAppsTab && selectedApp ? (
            <div className="discover-app-detail-page">
              <div className="discover-breadcrumb">
                <button
                  type="button"
                  className="discover-breadcrumb-button"
                  onClick={() => setSelectedAppId(null)}
                >
                  Apps
                </button>
                <span className="discover-breadcrumb-separator">›</span>
                <span>{selectedApp.name}</span>
              </div>

              <div className="discover-app-detail-header">
                <div className={`discover-app-icon discover-app-icon-${selectedApp.icon} discover-app-detail-icon`}>
                  {renderAppIcon(selectedApp.icon)}
                </div>
                <div className="discover-app-detail-meta">
                  <div className="discover-app-detail-name-row">
                    <div className="discover-app-detail-name">{selectedApp.name}</div>
                  </div>
                  <div className="discover-app-detail-tagline">{selectedApp.tagline}</div>
                  <div className="discover-card-desc">{selectedApp.description}</div>
                </div>
              </div>

              <div className="discover-app-spotlight">{selectedApp.heroNote}</div>

              <section className="discover-card discover-app-detail-section">
                <div className="discover-detail-section-title">What you can do</div>
                <ul className="discover-detail-list">
                  {selectedApp.capabilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="discover-card discover-app-detail-section">
                <div className="discover-detail-section-title">Information</div>
                <div className="discover-info-grid">
                  <div className="discover-info-row">
                    <div className="discover-info-label">Auth</div>
                    <div className="discover-info-value">{selectedApp.auth}</div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Surface</div>
                    <div className="discover-info-value">{selectedApp.surface}</div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Website</div>
                    <div className="discover-info-value">
                      {renderInfoLink(selectedApp.websiteUrl, "Open website")}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Docs</div>
                    <div className="discover-info-value">
                      {renderInfoLink(selectedApp.docsUrl, "Open docs")}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="discover-grid">
              {!isAppsTab && !isSkillsTab && isLoadingDiscover && discoverCommunitiesCount === 0 ? (
                <>
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={`discover-skeleton-${idx}`}
                      className="discover-card discover-card-skeleton"
                      aria-hidden="true"
                    >
                      <div className="discover-card-banner web-skeleton-block" />
                      <div className="discover-card-body">
                        <div className="discover-card-header">
                          <div className="discover-card-avatar web-skeleton-block" />
                          <div className="discover-card-meta">
                            <div className="discover-card-name-row">
                              <div className="web-skeleton-row discover-skeleton-name" />
                              <div className="web-skeleton-pill discover-skeleton-price" />
                              <div className="discover-visibility-icon discover-skeleton-visibility web-skeleton-block" />
                            </div>
                            <div className="web-skeleton-row discover-skeleton-slug" />
                          </div>
                        </div>
                        <div className="web-skeleton-row discover-skeleton-desc" />
                        <div className="web-skeleton-row discover-skeleton-desc discover-skeleton-desc-short" />
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              {!isAppsTab && !isSkillsTab && !isLoadingDiscover && discoverError ? <div className="auth-error">{discoverError}</div> : null}
              {!isAppsTab && !isSkillsTab && !isLoadingDiscover && !discoverError && filteredDiscoverCommunities.length === 0 ? (
                <div className="discover-empty">
                  <div className="discover-empty-title">No communities yet.</div>
                  <div className="discover-empty-text">Create one to make discovery meaningful.</div>
                </div>
              ) : null}
              {!isAppsTab && !isSkillsTab
                ? filteredDiscoverCommunities.map((community) => {
                    const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
                    const visibilityLabel = formatCommunityVisibilityLabel(community.visibility);
                    const visibilityClass = isPublishedCommunityVisibility(community.visibility)
                      ? "published"
                      : "unlisted";
                    const oneLiner =
                      community.one_liner && community.one_liner.trim().length > 0
                        ? community.one_liner
                        : "No one-liner yet.";
                    const canActivate = Boolean(community.slug);
                    return (
                      <DiscoverCommunityCard
                        key={community.slug}
                        name={community.name}
                        slug={community.slug}
                        oneLiner={oneLiner}
                        avatarUrl={community.avatar_url}
                        bannerUrl={community.banner_url}
                        bannerFocusX={community.banner_focus_x}
                        bannerFocusY={community.banner_focus_y}
                        bannerZoom={community.banner_zoom}
                        priceLabel={priceLabel}
                        visibilityClass={visibilityClass}
                        visibilityLabel={visibilityLabel}
                        isPublishedVisibility={isPublishedCommunityVisibility(community.visibility)}
                        clickable={canActivate}
                        ariaLabel={canActivate ? `View ${community.name}` : undefined}
                        onActivate={canActivate ? () => onActivateCommunity(community.slug) : undefined}
                      />
                    );
                  })
                : null}
              {isAppsTab && filteredApps.length === 0 ? (
                <div className="discover-empty">
                  <div className="discover-empty-title">No apps in the catalog yet.</div>
                  <div className="discover-empty-text">
                    This is the catalog surface only for now. Community connection logic stays in AI Agent → Apps.
                  </div>
                </div>
              ) : null}
              {isSkillsTab && filteredSkills.length === 0 ? (
                <div className="discover-empty">
                  <div className="discover-empty-title">No skills in the catalog yet.</div>
                  <div className="discover-empty-text">
                    This is the catalog surface only for now. Community attachment logic stays in AI Agent → Skills.
                  </div>
                </div>
              ) : null}
              {isAppsTab
                ? filteredApps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="discover-card discover-app-card discover-card-button"
                      onClick={() => setSelectedAppId(app.id)}
                      aria-label={`Open ${app.name}`}
                    >
                      <div className="discover-app-card-body">
                        <div className="discover-app-card-header">
                          <div className={`discover-app-icon discover-app-icon-${app.icon}`}>
                            {renderAppIcon(app.icon)}
                          </div>
                          <div className="discover-app-meta">
                            <div className="discover-card-name-row">
                              <div className="discover-card-name">{app.name}</div>
                            </div>
                            <div className="discover-app-tagline">{app.tagline}</div>
                          </div>
                        </div>
                        <div className="discover-card-desc">{app.description}</div>
                      </div>
                    </button>
                  ))
                : null}
              {isSkillsTab
                ? filteredSkills.map((skill) => (
                    <div key={skill.id} className="discover-card discover-app-card">
                      <div className="discover-app-card-body">
                        <div className="discover-app-card-header">
                          <div className={`discover-app-icon discover-app-icon-${skill.icon}`}>
                            {renderSkillIcon(skill.icon)}
                          </div>
                          <div className="discover-app-meta">
                            <div className="discover-card-name-row">
                              <div className="discover-card-name">{skill.name}</div>
                            </div>
                            <div className="discover-app-tagline">{skill.tagline}</div>
                          </div>
                        </div>
                        <div className="discover-card-desc">{skill.description}</div>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
