import { useEffect, useMemo, useState, type ComponentProps } from "react";

import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type {
  ConnectUserPlatformAppResult,
  ConnectUserPlatformAppInput,
  UserPlatformMountedApp,
  UserPlatformAppValidationReport,
} from "../../../../shared/userPlatformAppMountTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";
import {
  buildDiscoverAppConnectionStrategyLabel,
  buildDiscoverAppPersonalConnectInput,
  buildDiscoverAppPersonalConnectModalCopy,
  buildDiscoverAppPersonalConnectRequirements,
  buildDiscoverAppSupportedModesLabel,
  DISCOVER_APP_CATALOG,
  isDiscoverAppPersonallyConnectable,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

type DiscoverTab = "communities" | "apps" | "skills";

type DiscoverSkillCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  invocation: string;
  surface: string;
  category: string;
  icon: "research" | "summary" | "workflow" | "custom";
  heroNote: string;
  detailBullets: string[];
  installInput: CreateSkillPackageInput | null;
};

const DISCOVER_TABS: Array<{ id: DiscoverTab; label: string }> = [
  { id: "communities", label: "Communities" },
  { id: "apps", label: "Apps" },
  { id: "skills", label: "Skills" },
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
    heroNote:
      "A reusable operator for surveying a topic quickly, extracting signal, and leaving you with a structured next-step brief.",
    detailBullets: [
      "Scans a topic from multiple angles before forming conclusions.",
      "Turns noisy input into a compact signal summary and follow-up list.",
      "Works best when you want fast synthesis instead of open-ended brainstorming.",
    ],
    installInput: {
      name: "Weekly Research",
      description:
        "Scan, synthesize, and surface signal from a topic before deciding what matters next.",
      instructions_md: `Use this skill when the user wants a fast research pass on a topic, market, company, trend, or decision.\n\nOperating rules:\n1. Start by reducing the topic into the fewest important dimensions.\n2. Separate facts, signals, risks, and open questions.\n3. Prefer synthesis over raw dump.\n4. End with a concise summary and clear next steps.\n5. Stay practical and decision-useful.`,
    },
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
    heroNote:
      "A compression skill for turning long threads, notes, or updates into a concise executive readout with clear decisions and risks.",
    detailBullets: [
      "Compresses long discussions into high-signal board-level bullets.",
      "Surfaces decisions, risks, blockers, and next actions explicitly.",
      "Useful when you need leadership-ready summaries instead of full transcripts.",
    ],
    installInput: {
      name: "Board Summary",
      description:
        "Turn long discussions into concise executive bullets with decisions, risks, and next actions.",
      instructions_md: `Use this skill when the user wants an executive-level summary of a long discussion, status update, or planning thread.\n\nOperating rules:\n1. Compress aggressively without losing decisions.\n2. Separate decisions, risks, blockers, and next actions.\n3. Prefer bullet clarity over prose.\n4. Keep the output brief, concrete, and leadership-ready.\n5. Do not pad or restate obvious context.`,
    },
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
    heroNote:
      "A reusable planning skill for converting a goal into a tight sequence of steps, checks, and handoff points.",
    detailBullets: [
      "Breaks goals down into clean operational steps.",
      "Makes dependencies, risks, and stop-rules explicit.",
      "Useful when a task is vague and needs a pragmatic execution plan.",
    ],
    installInput: {
      name: "Workflow Builder",
      description:
        "Compose repeatable operating patterns and step-based execution workflows.",
      instructions_md: `Use this skill when the user wants to turn a broad goal into a practical workflow.\n\nOperating rules:\n1. Reduce the problem to the fewest real moving parts.\n2. Turn the work into a concrete execution sequence.\n3. Call out blockers, assumptions, and proof steps.\n4. Prefer the smallest viable workflow over exhaustive planning.\n5. End with a crisp recommended path forward.`,
    },
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
    heroNote:
      "The manual path for when the curated set is close but not quite right and you need a skill package tailored to your own operating style.",
    detailBullets: [
      "Create your own named personal skill package.",
      "Define the exact reusable instructions you want available at runtime.",
      "Best when a curated skill is close but you need a custom behavior contract.",
    ],
    installInput: null,
  },
];

function createConnectAttemptId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `connect-${Date.now()}`;
}

type WebDiscoverPanelProps = {
  showMobileShell: boolean;
  activeTab: DiscoverTab;
  onSelectTab: (tab: DiscoverTab) => void;
  hasSession: boolean;
  isAuthRecoveringSignedIn: boolean;
  onRequireAuth: () => void;
  isLoadingDiscover: boolean;
  onRefreshDiscover: () => void;
  discoverCommunitiesCount: number;
  discoverError: string | null;
  discoverCommunities: DiscoverCommunitySnapshot[];
  formatPlanPrice: (plan: DiscoverCommunitySnapshot["active_plan"]) => string;
  formatCommunityVisibilityLabel: (
    visibility: DiscoverCommunitySnapshot["visibility"],
  ) => string;
  isPublishedCommunityVisibility: (
    visibility: DiscoverCommunitySnapshot["visibility"],
  ) => boolean;
  userPlatformAppMounts: UserPlatformMountedApp[];
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  isConnectingUserPlatformApp: boolean;
  onConnectUserPlatformApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult> | ConnectUserPlatformAppResult;
  userPlatformSkills: UserPlatformInstalledSkill[];
  isLoadingUserPlatformSkills: boolean;
  userPlatformSkillError: string | null;
  userPlatformSkillMutationError: string | null;
  isCreatingUserPlatformSkill: boolean;
  onCreateUserPlatformSkill: (
    input: CreateSkillPackageInput,
  ) => Promise<boolean> | boolean;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
  onOpenIntegrationsSettings: () => void;
};

function renderValidationStageIcon(status: "ok" | "error" | "skipped") {
  if (status === "ok") return "✓";
  if (status === "error") return "!";
  return "•";
}

function renderInfoLink(href: string, label: string) {
  return (
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
}

function buildMountStatusLabel(mount: UserPlatformMountedApp): string {
  const count = mount.enabled_tools.length;
  const toolLabel = count === 1 ? "tool" : "tools";
  const connectionStatus = String(
    mount.connection.connection_status ?? "",
  ).trim();
  if (connectionStatus === "connected") {
    return `${count} ${toolLabel} are active in your platform layer.`;
  }
  if (connectionStatus) {
    return `${count} ${toolLabel} are mounted, but the connection status is ${connectionStatus.replace(
      /_/g,
      " ",
    )}.`;
  }
  return `${count} ${toolLabel} are mounted in your platform layer.`;
}

function findMatchingPersonalMount(
  app: DiscoverAppCatalogEntry,
  mounts: UserPlatformMountedApp[],
): UserPlatformMountedApp | null {
  const catalogKnownMountKeys = DISCOVER_APP_CATALOG.filter(
    (entry) =>
      entry.personalConnect.connectionKind === "known" &&
      entry.personalConnect.endpointUrl &&
      entry.personalConnect.authType,
  ).map(
    (entry) =>
      `${entry.personalConnect.endpointUrl}::${entry.personalConnect.authType}`,
  );
  if (!isDiscoverAppPersonallyConnectable(app)) {
    return null;
  }
  if (app.personalConnect.connectionKind === "custom") {
    return (
      mounts.find(
        (mount) =>
          !catalogKnownMountKeys.includes(
            `${mount.app.endpoint_url}::${mount.app.auth_type}`,
          ),
      ) ?? null
    );
  }
  return (
    mounts.find(
      (mount) =>
        mount.app.endpoint_url === app.personalConnect.endpointUrl &&
        mount.app.auth_type === app.personalConnect.authType,
    ) ?? null
  );
}

function readSkillInvocationToken(invocation: string): string | null {
  const trimmed = invocation.trim();
  if (!trimmed.startsWith("$")) return null;
  const token = trimmed.slice(1).trim().toLowerCase();
  return token || null;
}

function findMatchingPersonalSkillInstall(
  skill: DiscoverSkillCatalogEntry,
  installs: UserPlatformInstalledSkill[],
): UserPlatformInstalledSkill | null {
  const token = readSkillInvocationToken(skill.invocation);
  if (!token) return null;
  return (
    installs.find(
      (install) =>
        String(install.skill.mentionToken ?? "").trim().toLowerCase() === token,
    ) ?? null
  );
}

function buildDiscoverCommunityCardProps(args: {
  community: DiscoverCommunitySnapshot;
  formatPlanPrice: (
    plan: DiscoverCommunitySnapshot["active_plan"],
  ) => string;
  formatCommunityVisibilityLabel: (
    visibility: DiscoverCommunitySnapshot["visibility"],
  ) => string;
  isPublishedCommunityVisibility: (
    visibility: DiscoverCommunitySnapshot["visibility"],
  ) => boolean;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
}): ComponentProps<typeof DiscoverCommunityCard> {
  const { community } = args;
  return {
    name: community.name,
    slug: community.slug,
    oneLiner: community.one_liner ?? "",
    avatarUrl: community.avatar_url,
    bannerUrl: community.banner_url,
    bannerFocusX: community.banner_focus_x,
    bannerFocusY: community.banner_focus_y,
    bannerZoom: community.banner_zoom,
    priceLabel: args.formatPlanPrice(community.active_plan),
    visibilityClass: community.visibility,
    visibilityLabel: args.formatCommunityVisibilityLabel(community.visibility),
    isPublishedVisibility: args.isPublishedCommunityVisibility(
      community.visibility,
    ),
    clickable: true,
    ariaLabel: `Open ${community.name}`,
    onActivate: () => args.onActivateCommunity(community),
  };
}

export function WebDiscoverPanel(props: WebDiscoverPanelProps) {
  const {
    activeTab,
    onSelectTab,
    onRequireAuth,
    hasSession,
    isAuthRecoveringSignedIn,
    isLoadingDiscover,
    discoverCommunitiesCount,
    discoverError,
    discoverCommunities,
    formatPlanPrice,
    formatCommunityVisibilityLabel,
    isPublishedCommunityVisibility,
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    isConnectingUserPlatformApp,
    onConnectUserPlatformApp,
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    userPlatformSkillMutationError,
    isCreatingUserPlatformSkill,
    onCreateUserPlatformSkill,
    onActivateCommunity,
    onOpenIntegrationsSettings,
  } = props;
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [personalConnectEndpoint, setPersonalConnectEndpoint] = useState("");
  const [personalConnectAuthType, setPersonalConnectAuthType] =
    useState<DeveloperAppAuthType>("bearer");
  const [personalConnectSecret, setPersonalConnectSecret] = useState("");
  const [personalConnectError, setPersonalConnectError] = useState<string | null>(
    null,
  );
  const [isPersonalConnectModalOpen, setIsPersonalConnectModalOpen] =
    useState(false);
  const [personalConnectResult, setPersonalConnectResult] = useState<
    "passed" | "failed" | null
  >(null);
  const [personalConnectValidationReport, setPersonalConnectValidationReport] =
    useState<UserPlatformAppValidationReport | null>(null);
  const [selectedSkillActionError, setSelectedSkillActionError] = useState<
    string | null
  >(null);

  const activeTabIndex = DISCOVER_TABS.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(
    DISCOVER_TABS.length,
    activeTabIndex,
  );
  const filteredApps = DISCOVER_APP_CATALOG;
  const filteredSkills = DISCOVER_SKILL_CATALOG;
  const selectedApp = selectedAppId
    ? DISCOVER_APP_CATALOG.find((entry) => entry.id === selectedAppId) ?? null
    : null;
  const selectedSkill = selectedSkillId
    ? DISCOVER_SKILL_CATALOG.find((entry) => entry.id === selectedSkillId) ?? null
    : null;
  const isReadyForPersonalConnection =
    selectedApp ? isDiscoverAppPersonallyConnectable(selectedApp) : false;
  const personalConnectLoadError =
    isReadyForPersonalConnection && userPlatformAppMountError
      ? "Couldn't load your personal apps right now. Try refreshing the page."
      : null;
  const personalConnectMutationError =
    isReadyForPersonalConnection &&
    userPlatformAppMutationError &&
    !personalConnectError
      ? userPlatformAppMutationError
      : null;

  const selectedPersonalMount = useMemo(() => {
    if (!selectedApp) return null;
    return findMatchingPersonalMount(selectedApp, userPlatformAppMounts);
  }, [selectedApp, userPlatformAppMounts]);
  const selectedPersonalSkillInstall = useMemo(() => {
    if (!selectedSkill) return null;
    return findMatchingPersonalSkillInstall(selectedSkill, userPlatformSkills);
  }, [selectedSkill, userPlatformSkills]);

  const isAppsTab = activeTab === "apps";
  const isSkillsTab = activeTab === "skills";

  useEffect(() => {
    if (!isAppsTab && selectedAppId) {
      setSelectedAppId(null);
    }
  }, [isAppsTab, selectedAppId]);

  useEffect(() => {
    if (!isSkillsTab && selectedSkillId) {
      setSelectedSkillId(null);
      setSelectedSkillActionError(null);
    }
  }, [isSkillsTab, selectedSkillId]);

  useEffect(() => {
    if (
      selectedApp &&
      isDiscoverAppPersonallyConnectable(selectedApp) &&
      selectedApp.personalConnect.connectionKind === "custom"
    ) {
      setPersonalConnectAuthType(
        selectedApp.personalConnect.supportedAuthTypes[0]?.value ?? "none",
      );
    } else {
      setPersonalConnectAuthType("bearer");
    }
    setPersonalConnectEndpoint("");
    setPersonalConnectSecret("");
    setPersonalConnectError(null);
    setPersonalConnectResult(null);
    setPersonalConnectValidationReport(null);
    setIsPersonalConnectModalOpen(false);
  }, [selectedApp]);

  useEffect(() => {
    setSelectedSkillActionError(null);
  }, [selectedSkillId]);

  const heroTitle = selectedApp
    ? selectedApp.name
    : selectedSkill
      ? selectedSkill.name
    : isAppsTab
      ? "Discover apps"
      : isSkillsTab
        ? "Discover skills"
        : "Discover communities";
  const heroSubtitle = selectedApp
    ? selectedApp.tagline
    : selectedSkill
      ? selectedSkill.tagline
    : isAppsTab
      ? "Browse trusted apps and verified integrations."
      : isSkillsTab
        ? "Browse reusable skill packages here."
        : "Find focused crews to build, learn, and ship faster.";
  const selectedAppActionLabel = selectedApp
    ? selectedPersonalMount
      ? "Manage"
      : isDiscoverAppPersonallyConnectable(selectedApp)
        ? "Connect"
        : null
    : null;
  const selectedSkillActionLabel = selectedSkill
    ? selectedPersonalSkillInstall
      ? "Manage"
      : selectedSkill.installInput
        ? "Add skill"
        : "Create skill"
    : null;
  const personalConnectModalCopy = selectedApp
    ? buildDiscoverAppPersonalConnectModalCopy(selectedApp)
    : null;
  const personalConnectRequirements = selectedApp
    ? buildDiscoverAppPersonalConnectRequirements(selectedApp, {
        endpointUrl: personalConnectEndpoint,
        authType: personalConnectAuthType,
      })
    : [];

  const handleUsePersonally = async (
    app: DiscoverAppCatalogEntry,
  ): Promise<void> => {
    if (!isDiscoverAppPersonallyConnectable(app)) return;
    if (isAuthRecoveringSignedIn) return;
    if (!hasSession) {
      onRequireAuth();
      return;
    }
    if (selectedPersonalMount) return;
    if (
      app.personalConnect.connectionKind === "known" &&
      app.personalConnect.authMethod === "token" &&
      !personalConnectSecret.trim()
    ) {
      setPersonalConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError(
        `Paste your ${app.personalConnect.secretLabel} to connect ${app.name}.`,
      );
      return;
    }
    if (
      app.personalConnect.connectionKind === "custom" &&
      !personalConnectEndpoint.trim()
    ) {
      setPersonalConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError("Paste the MCP endpoint before connecting it.");
      return;
    }
    if (
      app.personalConnect.connectionKind === "custom" &&
      personalConnectAuthType !== "none" &&
      !personalConnectSecret.trim()
    ) {
      setPersonalConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError("Paste the secret required for this MCP connection.");
      return;
    }
    const connectInput = buildDiscoverAppPersonalConnectInput(app, {
      endpointUrl: personalConnectEndpoint,
      authType: personalConnectAuthType,
      description: app.description,
      secret: personalConnectSecret.trim() || undefined,
    });
    if (!connectInput) {
      setPersonalConnectResult("failed");
      setPersonalConnectError("This app is not ready for direct connection yet.");
      return;
    }
    setPersonalConnectError(null);
    setPersonalConnectResult(null);
    setPersonalConnectValidationReport(null);
    const result = await onConnectUserPlatformApp({
      ...connectInput,
      connect_attempt_id: createConnectAttemptId(),
    });
    setPersonalConnectValidationReport(result.validation_report);
    if (result.ok) {
      setPersonalConnectResult("passed");
      setPersonalConnectSecret("");
      return;
    }
    setPersonalConnectResult("failed");
    setPersonalConnectError((current) =>
      current ??
      result.error_message ??
      `Couldn't connect ${app.name}. Check the requirements and try again.`,
    );
  };

  const handleAddSkill = async (
    skill: DiscoverSkillCatalogEntry,
  ): Promise<void> => {
    if (isAuthRecoveringSignedIn) return;
    if (isLoadingUserPlatformSkills) return;
    if (!hasSession) {
      onRequireAuth();
      return;
    }
    const existingInstall = findMatchingPersonalSkillInstall(
      skill,
      userPlatformSkills,
    );
    if (existingInstall || !skill.installInput) {
      onOpenIntegrationsSettings();
      return;
    }
    setSelectedSkillActionError(null);
    const ok = await onCreateUserPlatformSkill(skill.installInput);
    if (!ok) {
      setSelectedSkillActionError(
        `Couldn't add ${skill.name} right now. Check the error and try again.`,
      );
      return;
    }
    onOpenIntegrationsSettings();
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
                className={`platform-switcher-btn community-ai-agent-tab discover-tab${
                  activeTab === tab.id ? " is-active" : ""
                }`}
                aria-selected={activeTab === tab.id}
                onClick={() => onSelectTab(tab.id)}
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
                <DiscoverCatalogLogo
                  name={selectedApp.name}
                  logoUrl={selectedApp.logoUrl}
                  logoUrlDark={selectedApp.logoUrlDark}
                  size="detail"
                />
                <div className="discover-app-detail-meta">
                  <div className="discover-app-detail-heading-row">
                    <div className="discover-app-detail-name">
                      {selectedApp.name}
                    </div>
                    {selectedAppActionLabel ? (
                      <button
                        type="button"
                        className="settings-cta discover-app-detail-action"
                        onClick={() => {
                          if (selectedPersonalMount) {
                            onOpenIntegrationsSettings();
                            return;
                          }
                          setIsPersonalConnectModalOpen(true);
                          setPersonalConnectError(null);
                          setPersonalConnectResult(null);
                        }}
                      >
                        {selectedAppActionLabel}
                      </button>
                    ) : null}
                  </div>
                  <div className="discover-app-detail-tagline">
                    {selectedApp.tagline}
                  </div>
                  <div className="discover-card-desc">
                    {selectedApp.description}
                  </div>
                </div>
              </div>

              <div className="discover-app-spotlight">{selectedApp.heroNote}</div>

              <section className="discover-card discover-app-detail-section">
                <div className="model-note discover-connect-note">
                  {selectedApp.personalConnect.note}
                </div>
                {personalConnectLoadError ? (
                  <div className="auth-error">{personalConnectLoadError}</div>
                ) : null}
                {personalConnectMutationError ? (
                  <div className="auth-error">
                    {personalConnectMutationError}
                  </div>
                ) : null}
                {selectedPersonalMount ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Connected
                    </div>
                    <div className="discover-connect-status-body">
                      {buildMountStatusLabel(selectedPersonalMount)}
                    </div>
                  </div>
                ) : !isDiscoverAppPersonallyConnectable(selectedApp) ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Connect path coming soon
                    </div>
                    <div className="discover-connect-status-body">
                      {selectedApp.supportNote}
                    </div>
                  </div>
                ) : (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Ready to connect
                    </div>
                    <div className="discover-connect-status-body">
                      Use `Connect` to open the requirements modal and add {selectedApp.name} to your baseline platform tools.
                    </div>
                  </div>
                )}
              </section>

              <section className="discover-card discover-app-detail-section">
                <div className="discover-detail-section-title">
                  What you can do
                </div>
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
                    <div className="discover-info-label">Support</div>
                    <div className="discover-info-value">
                      {selectedApp.supportLabel}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Connection</div>
                    <div className="discover-info-value">
                      {buildDiscoverAppConnectionStrategyLabel(selectedApp)}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Supports</div>
                    <div className="discover-info-value">
                      {buildDiscoverAppSupportedModesLabel(selectedApp)}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Auth now</div>
                    <div className="discover-info-value">
                      {selectedApp.personalConnect.authLabel}
                    </div>
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
          ) : isSkillsTab && selectedSkill ? (
            <div className="discover-app-detail-page">
              <div className="discover-breadcrumb">
                <button
                  type="button"
                  className="discover-breadcrumb-button"
                  onClick={() => {
                    setSelectedSkillId(null);
                    setSelectedSkillActionError(null);
                  }}
                >
                  Skills
                </button>
                <span className="discover-breadcrumb-separator">›</span>
                <span>{selectedSkill.name}</span>
              </div>

              <div className="discover-app-detail-header">
                <div
                  className={`discover-app-icon discover-app-icon-${selectedSkill.icon} discover-app-icon-detail`}
                >
                  {renderSkillIcon(selectedSkill.icon)}
                </div>
                <div className="discover-app-detail-meta">
                  <div className="discover-app-detail-heading-row">
                    <div className="discover-app-detail-name">
                      {selectedSkill.name}
                    </div>
                    {selectedSkillActionLabel ? (
                      <button
                        type="button"
                        className="settings-cta discover-app-detail-action"
                        onClick={() => void handleAddSkill(selectedSkill)}
                        disabled={
                          isCreatingUserPlatformSkill || isLoadingUserPlatformSkills
                        }
                      >
                        {selectedPersonalSkillInstall
                          ? selectedSkillActionLabel
                          : isCreatingUserPlatformSkill
                            ? "Adding…"
                            : selectedSkillActionLabel}
                      </button>
                    ) : null}
                  </div>
                  <div className="discover-app-detail-tagline">
                    {selectedSkill.tagline}
                  </div>
                  <div className="discover-card-desc">
                    {selectedSkill.description}
                  </div>
                </div>
              </div>

              <div className="discover-app-spotlight">
                {selectedSkill.heroNote}
              </div>

              <section className="discover-card discover-app-detail-section">
                {hasSession && userPlatformSkillError ? (
                  <div className="auth-error">{userPlatformSkillError}</div>
                ) : null}
                {hasSession && userPlatformSkillMutationError ? (
                  <div className="auth-error">{userPlatformSkillMutationError}</div>
                ) : null}
                {selectedSkillActionError ? (
                  <div className="auth-error">{selectedSkillActionError}</div>
                ) : null}
                {!hasSession ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Sign in required
                    </div>
                    <div className="discover-connect-status-body">
                      Sign in first, then add this skill to your personal
                      skills layer.
                    </div>
                  </div>
                ) : selectedPersonalSkillInstall ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">Added</div>
                    <div className="discover-connect-status-body">
                      This skill is already in your personal skills and can be
                      managed from Integrations.
                    </div>
                  </div>
                ) : selectedSkill.installInput ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Ready to add
                    </div>
                    <div className="discover-connect-status-body">
                      Add this curated skill and it will appear in Settings{" "}
                      {">"} Integrations {">"} My skills.
                    </div>
                  </div>
                ) : (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Manual skill
                    </div>
                    <div className="discover-connect-status-body">
                      This is the custom path. Open Integrations to create your
                      own personal skill package.
                    </div>
                  </div>
                )}
              </section>

              <section className="discover-card discover-app-detail-section">
                <div className="discover-detail-section-title">
                  What it does
                </div>
                <ul className="discover-detail-list">
                  {selectedSkill.detailBullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="discover-card discover-app-detail-section">
                <div className="discover-detail-section-title">Information</div>
                <div className="discover-info-grid">
                  <div className="discover-info-row">
                    <div className="discover-info-label">Invocation</div>
                    <div className="discover-info-value">
                      {selectedSkill.invocation}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Scope</div>
                    <div className="discover-info-value">
                      {selectedSkill.surface}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Category</div>
                    <div className="discover-info-value">
                      {selectedSkill.category}
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Destination</div>
                    <div className="discover-info-value">
                      Settings {">"} Integrations {">"} My skills
                    </div>
                  </div>
                  <div className="discover-info-row">
                    <div className="discover-info-label">Status</div>
                    <div className="discover-info-value">
                      {hasSession
                        ? isLoadingUserPlatformSkills
                          ? "Checking…"
                          : selectedPersonalSkillInstall
                            ? "Added to your personal layer"
                            : selectedSkill.installInput
                              ? "Available to add"
                              : "Create manually"
                        : "Sign in to add"}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="discover-grid">
              {!isAppsTab && !isSkillsTab && isLoadingDiscover ? (
                <div className="chat-loading">Loading communities…</div>
              ) : null}
              {!isAppsTab && !isSkillsTab && discoverError ? (
                <div className="auth-error">{discoverError}</div>
              ) : null}
              {!isAppsTab && !isSkillsTab
                ? discoverCommunities.map((community) => {
                    const cardProps = buildDiscoverCommunityCardProps({
                      community,
                      formatPlanPrice,
                      formatCommunityVisibilityLabel,
                      isPublishedCommunityVisibility,
                      onActivateCommunity,
                    });
                    return (
                      <DiscoverCommunityCard
                        key={community.slug}
                        {...cardProps}
                      />
                    );
                  })
                : null}
              {!isAppsTab && !isSkillsTab && !isLoadingDiscover && !discoverError
                ? (
                    discoverCommunities.length === 0 ? (
                      <div className="discover-empty">
                        <div className="discover-empty-title">
                          No communities yet
                        </div>
                        <div className="discover-empty-text">
                          {discoverCommunitiesCount === 0
                            ? "The community graph is empty right now."
                            : "No communities match the current filter."}
                        </div>
                      </div>
                    ) : null
                  )
                : null}
              {isAppsTab ? (
                <div className="discover-app-list" role="list" aria-label="App catalog">
                  {filteredApps.length === 0 ? (
                    <div className="discover-empty">
                      <div className="discover-empty-title">
                        No apps in the catalog yet.
                      </div>
                      <div className="discover-empty-text">
                        Trusted app integrations will appear here as the
                        catalog expands.
                      </div>
                    </div>
                  ) : null}
                  {filteredApps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="discover-app-row-button"
                      role="listitem"
                      onClick={() => setSelectedAppId(app.id)}
                      aria-label={`Open ${app.name}`}
                    >
                      <DiscoverCatalogLogo
                        name={app.name}
                        logoUrl={app.logoUrl}
                        logoUrlDark={app.logoUrlDark}
                      />
                      <div className="discover-app-row-copy">
                        <div className="discover-app-row-name">{app.name}</div>
                        <div className="discover-app-row-tagline">
                          {app.tagline}
                        </div>
                      </div>
                      <span className="discover-app-action">
                        {findMatchingPersonalMount(app, userPlatformAppMounts)
                          ? "Manage"
                          : isDiscoverAppPersonallyConnectable(app)
                            ? "Connect"
                            : "Catalog"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {isSkillsTab
                ? filteredSkills.map((skill) => {
                    const matchingInstall = findMatchingPersonalSkillInstall(
                      skill,
                      userPlatformSkills,
                    );
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className="discover-card discover-app-card discover-skill-card-button"
                        onClick={() => {
                          setSelectedSkillId(skill.id);
                          setSelectedSkillActionError(null);
                        }}
                        aria-label={`Open ${skill.name}`}
                      >
                        <div className="discover-app-card-body">
                          <div className="discover-app-card-header">
                            <div
                              className={`discover-app-icon discover-app-icon-${skill.icon}`}
                            >
                              {renderSkillIcon(skill.icon)}
                            </div>
                            <div className="discover-app-meta">
                              <div className="discover-card-name-row">
                                <div className="discover-card-name">
                                  {skill.name}
                                </div>
                              </div>
                              <div className="discover-app-tagline">
                                {skill.tagline}
                              </div>
                            </div>
                          </div>
                          <div className="discover-card-desc">
                            {skill.description}
                          </div>
                        </div>
                        <span className="discover-app-action">
                          {matchingInstall
                            ? "Manage"
                            : skill.installInput
                              ? "Add skill"
                              : "Create"}
                        </span>
                      </button>
                    );
                  })
                : null}
              {isSkillsTab && filteredSkills.length === 0 ? (
                <div className="discover-empty">
                  <div className="discover-empty-title">
                    No skills in the catalog yet.
                  </div>
                  <div className="discover-empty-text">
                    Browse reusable skill packages here.
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {selectedApp &&
      isDiscoverAppPersonallyConnectable(selectedApp) &&
      isPersonalConnectModalOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (isConnectingUserPlatformApp) return;
            setIsPersonalConnectModalOpen(false);
            setPersonalConnectResult(null);
            setPersonalConnectValidationReport(null);
            setPersonalConnectError(null);
          }}
        >
          <div
            className="modal discover-connect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-connect-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" id="discover-connect-modal-title">
                Connect {selectedApp.name}
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => {
                  setIsPersonalConnectModalOpen(false);
                  setPersonalConnectResult(null);
                  setPersonalConnectValidationReport(null);
                  setPersonalConnectError(null);
                }}
                disabled={isConnectingUserPlatformApp}
              >
                ×
              </button>
            </div>
            <div className="modal-body discover-connect-modal-body">
              {personalConnectModalCopy ? (
                <div className="discover-connect-modal-copy">
                  {personalConnectModalCopy}
                </div>
              ) : null}
              <div className="agent-capability-field-grid discover-connect-grid">
                    {personalConnectRequirements.map((requirement) =>
                      requirement.kind === "readonly" ? (
                        <label
                          key={requirement.id}
                          className="agent-capability-field"
                        >
                          <span className="agent-capability-field-label">
                            {requirement.label}
                          </span>
                          <input
                            className="agent-editor-inline-label-input"
                            value={requirement.value}
                            readOnly
                          />
                        </label>
                      ) : requirement.kind === "text" ? (
                        <label
                          key={requirement.id}
                          className="agent-capability-field discover-connect-secret-field"
                        >
                          <span className="agent-capability-field-label">
                            {requirement.label}
                          </span>
                          <input
                            className="agent-editor-inline-label-input"
                            value={requirement.value}
                            onChange={(event) => {
                              setPersonalConnectEndpoint(event.target.value);
                              if (personalConnectError) {
                                setPersonalConnectError(null);
                              }
                              if (personalConnectResult) {
                                setPersonalConnectResult(null);
                              }
                              if (personalConnectValidationReport) {
                                setPersonalConnectValidationReport(null);
                              }
                            }}
                            placeholder={requirement.placeholder}
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                          />
                        </label>
                      ) : requirement.kind === "select" ? (
                        <label
                          key={requirement.id}
                          className="agent-capability-field"
                        >
                          <span className="agent-capability-field-label">
                            {requirement.label}
                          </span>
                          <select
                            className="agent-capability-select"
                            value={personalConnectAuthType}
                            onChange={(event) => {
                              setPersonalConnectAuthType(
                                event.target.value as DeveloperAppAuthType,
                              );
                              setPersonalConnectSecret("");
                              if (personalConnectError) {
                                setPersonalConnectError(null);
                              }
                              if (personalConnectResult) {
                                setPersonalConnectResult(null);
                              }
                              if (personalConnectValidationReport) {
                                setPersonalConnectValidationReport(null);
                              }
                            }}
                          >
                            {requirement.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label
                          key={requirement.id}
                          className="agent-capability-field discover-connect-secret-field"
                        >
                          <span className="agent-capability-field-label">
                            {requirement.label}
                          </span>
                          <input
                            className="agent-editor-inline-label-input"
                            type="password"
                            value={personalConnectSecret}
                            onChange={(event) => {
                              setPersonalConnectSecret(event.target.value);
                              if (personalConnectError) {
                                setPersonalConnectError(null);
                              }
                              if (personalConnectResult) {
                                setPersonalConnectResult(null);
                              }
                              if (personalConnectValidationReport) {
                                setPersonalConnectValidationReport(null);
                              }
                            }}
                            placeholder={requirement.placeholder}
                          />
                          {selectedApp.personalConnect.connectionKind === "known" &&
                          selectedApp.personalConnect.authMethod === "token" ? (
                            <a
                              className="discover-connect-help-link"
                              href={selectedApp.personalConnect.tokenHelpUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {selectedApp.personalConnect.tokenHelpLabel}
                              <span aria-hidden="true">↗</span>
                            </a>
                          ) : null}
                        </label>
                      ),
                    )}
              </div>
              {personalConnectLoadError ? (
                <div className="auth-error">{personalConnectLoadError}</div>
              ) : null}
              {personalConnectMutationError ? (
                <div className="auth-error">{personalConnectMutationError}</div>
              ) : null}
              {personalConnectError ? (
                <div className="auth-error">{personalConnectError}</div>
              ) : null}
              {personalConnectValidationReport ? (
                <div
                  className={`discover-connect-status${
                    personalConnectResult === "passed"
                      ? " is-success"
                      : personalConnectResult === "failed"
                        ? " is-error"
                        : ""
                  }`}
                >
                  <div className="discover-connect-status-title">
                    {personalConnectResult === "passed"
                      ? "Connection verified"
                      : "Validation failed"}
                  </div>
                  <div className="discover-connect-status-body">
                    {personalConnectResult === "passed"
                      ? `${selectedApp.name} is now mounted into your personal platform layer.`
                      : personalConnectValidationReport.validation_error ??
                        `We couldn't connect ${selectedApp.name}. Check the validation stages below.`}
                  </div>
                  <div className="discover-connect-stage-list" role="list" aria-label="Validation stages">
                    {personalConnectValidationReport.stages.map((stage) => (
                      <div
                        key={stage.id}
                        className={`discover-connect-stage discover-connect-stage-${stage.status}`}
                        role="listitem"
                      >
                        <span className="discover-connect-stage-icon" aria-hidden="true">
                          {renderValidationStageIcon(stage.status)}
                        </span>
                        <span className="discover-connect-stage-copy">
                          <span className="discover-connect-stage-label">{stage.label}</span>
                          {stage.detail ? (
                            <span className="discover-connect-stage-detail">{stage.detail}</span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : personalConnectResult === "passed" || selectedPersonalMount ? (
                <div
                  className="discover-connect-status is-success"
                >
                  <div className="discover-connect-status-title">
                    Connected
                  </div>
                  <div className="discover-connect-status-body">
                    {`${selectedApp.name} is now mounted into your personal platform layer.`}
                  </div>
                </div>
              ) : personalConnectResult === "failed" ? (
                <div
                  className="discover-connect-status is-error"
                >
                  <div className="discover-connect-status-title">
                    Failed
                  </div>
                  <div className="discover-connect-status-body">
                    {`We couldn't connect ${selectedApp.name}. Check the requirements and try again.`}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-footer discover-connect-modal-footer">
              <button
                type="button"
                className="settings-cta"
                  onClick={() => {
                    setIsPersonalConnectModalOpen(false);
                    setPersonalConnectResult(null);
                    setPersonalConnectValidationReport(null);
                    setPersonalConnectError(null);
                  }}
                disabled={isConnectingUserPlatformApp}
              >
                {personalConnectResult === "passed" || selectedPersonalMount
                  ? "Done"
                  : "Cancel"}
              </button>
              {personalConnectResult === "passed" || selectedPersonalMount ? (
                <button
                  type="button"
                  className="platform-save-button is-dirty"
                  onClick={() => {
                    setIsPersonalConnectModalOpen(false);
                    onOpenIntegrationsSettings();
                  }}
                >
                  Manage
                </button>
              ) : (
                <button
                  type="button"
                  className="platform-save-button is-dirty"
                  onClick={() => void handleUsePersonally(selectedApp)}
                  disabled={
                    isAuthRecoveringSignedIn ||
                    isConnectingUserPlatformApp ||
                    isLoadingUserPlatformAppMounts
                  }
                >
                  {isAuthRecoveringSignedIn
                    ? "Restoring account…"
                    : isConnectingUserPlatformApp
                    ? "Connecting…"
                    : hasSession
                      ? "Connect"
                      : "Sign in to connect"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
