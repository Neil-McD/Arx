import { useMemo, useState } from "react";

import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";

type DiscoverTab = "communities" | "apps";

type DiscoverAppCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  auth: string;
  surface: string;
  category: string;
  icon: "github" | "supabase" | "vercel" | "custom";
};

const DISCOVER_TABS: Array<{ id: DiscoverTab; label: string }> = [
  { id: "communities", label: "Communities" },
  { id: "apps", label: "Apps" },
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
    icon: "vercel",
  },
  {
    id: "custom-mcp",
    name: "Custom MCP",
    tagline: "Direct hosted endpoint for advanced builders",
    description:
      "Fallback path for builders who already have a real public HTTPS MCP endpoint. This stays the advanced manual path.",
    auth: "None, API key, or bearer",
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
    showMobileShell,
    discoverQuery,
    onChangeDiscoverQuery,
    isLoadingDiscover,
    onRefreshDiscover,
    discoverCommunitiesCount,
    discoverError,
    filteredDiscoverCommunities,
    formatPlanPrice,
    formatCommunityVisibilityLabel,
    isPublishedCommunityVisibility,
    onActivateCommunity,
  } = props;
  const [activeTab, setActiveTab] = useState<DiscoverTab>("communities");
  const activeTabIndex = DISCOVER_TABS.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(DISCOVER_TABS.length, activeTabIndex);
  const normalizedQuery = discoverQuery.trim().toLowerCase();
  const filteredApps = useMemo(() => {
    if (!normalizedQuery) return DISCOVER_APP_CATALOG;
    return DISCOVER_APP_CATALOG.filter((entry) =>
      [entry.name, entry.tagline, entry.description, entry.auth, entry.surface, entry.category]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const isAppsTab = activeTab === "apps";
  const heroTitle = isAppsTab ? "Discover apps" : "Discover communities";
  const heroSubtitle = isAppsTab
    ? "Browse the app catalog here. Community mounting still happens in AI Agent → Apps while we keep the control plane simple."
    : "Find focused crews to build, learn, and ship faster.";
  const searchPlaceholder = isAppsTab ? "Search apps…" : "Search communities…";

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
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="17" r="2.5" fill="currentColor" />
        <circle cx="17" cy="17" r="2.5" fill="currentColor" />
      </svg>
    );
  };

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
          {!showMobileShell ? (
            <div className="discover-controls">
              <input
                className="discover-search"
                type="text"
                placeholder={searchPlaceholder}
                value={discoverQuery}
                onChange={(event) => onChangeDiscoverQuery(event.target.value)}
              />
              {!isAppsTab ? (
                <button
                  className="discover-refresh"
                  type="button"
                  disabled={isLoadingDiscover}
                  onClick={onRefreshDiscover}
                >
                  {isLoadingDiscover ? "Refreshing…" : "Refresh"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="workspace-body chat-feed">
        <div className="chat-messages discover-scroll">
          <div className="discover-grid">
            {!isAppsTab && isLoadingDiscover && discoverCommunitiesCount === 0 ? (
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
            {!isAppsTab && !isLoadingDiscover && discoverError ? <div className="auth-error">{discoverError}</div> : null}
            {!isAppsTab && !isLoadingDiscover && !discoverError && filteredDiscoverCommunities.length === 0 ? (
              <div className="discover-empty">
                <div className="discover-empty-title">No communities yet.</div>
                <div className="discover-empty-text">Create one to make discovery meaningful.</div>
              </div>
            ) : null}
            {!isAppsTab
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
                <div className="discover-empty-title">No apps match that search.</div>
                <div className="discover-empty-text">
                  This is the catalog surface only for now. Community connection logic stays in AI Agent → Apps.
                </div>
              </div>
            ) : null}
            {isAppsTab
              ? filteredApps.map((app) => (
                  <div key={app.id} className="discover-card discover-app-card">
                    <div className="discover-app-card-body">
                      <div className="discover-app-card-header">
                        <div className={`discover-app-icon discover-app-icon-${app.icon}`}>
                          {renderAppIcon(app.icon)}
                        </div>
                        <div className="discover-app-meta">
                          <div className="discover-card-name-row">
                            <div className="discover-card-name">{app.name}</div>
                            <span className="discover-tag">{app.category}</span>
                          </div>
                          <div className="discover-app-tagline">{app.tagline}</div>
                        </div>
                      </div>
                      <div className="discover-card-desc">{app.description}</div>
                      <div className="discover-app-detail-grid">
                        <div className="discover-app-detail">
                          <span className="discover-app-detail-label">Auth</span>
                          <span>{app.auth}</span>
                        </div>
                        <div className="discover-app-detail">
                          <span className="discover-app-detail-label">Surface</span>
                          <span>{app.surface}</span>
                        </div>
                      </div>
                      <div className="discover-app-card-foot">
                        <div className="discover-app-route-note">
                          Community setup continues in AI Agent → Apps.
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>
      {showMobileShell ? (
        <div className="discover-bottom-bar">
          <div className="discover-controls">
            <input
              className="discover-search"
              type="text"
              placeholder={searchPlaceholder}
              value={discoverQuery}
              onChange={(event) => onChangeDiscoverQuery(event.target.value)}
            />
            {!isAppsTab ? (
              <button
                className="discover-refresh"
                type="button"
                disabled={isLoadingDiscover}
                onClick={onRefreshDiscover}
              >
                {isLoadingDiscover ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
