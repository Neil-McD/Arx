import { useEffect, useMemo, useState, type ComponentProps } from "react";

import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type {
  CommunityMountedApp,
  ConnectCommunityAppInput,
} from "../../../../shared/communityAppMountTypes";
import type {
  CommunityAttachedSkill,
  SkillPackageSummary,
} from "../../../../shared/communitySkillTypes";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { DiscoverTab } from "../../../../shared/appShellNavigation";
import type {
  ConnectUserPlatformAppResult,
  ConnectUserPlatformAppInput,
  UserPlatformMountedApp,
  UserPlatformAppValidationReport,
} from "../../../../shared/userPlatformAppMountTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import { DiscoverCommunityCard } from "../../../../shared/DiscoverCommunityCard";
import {
  findMatchingDiscoverSkillInstall,
  type DiscoverSkillCatalogEntry,
} from "../lib/discoverSkillCatalog";
import {
  buildDiscoverAppConnectionStrategyLabel,
  buildDiscoverAppPersonalConnectInput,
  buildDiscoverAppPersonalConnectModalCopy,
  buildDiscoverAppPersonalConnectRequirements,
  buildDiscoverAppSupportedModesLabel,
  isDiscoverAppPersonallyConnectable,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

const DISCOVER_TABS: Array<{ id: DiscoverTab; label: string }> = [
  { id: "communities", label: "Communities" },
  { id: "apps", label: "Apps" },
  { id: "skills", label: "Skills" },
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
  selectedAppId: string | null;
  selectedSkillId: string | null;
  onSelectTab: (tab: DiscoverTab) => void;
  onSelectApp: (appId: string | null) => void;
  onSelectSkill: (skillId: string | null) => void;
  hasSession: boolean;
  isAuthRecoveringSignedIn: boolean;
  onRequireAuth: () => void;
  isLoadingDiscover: boolean;
  discoverCommunitiesCount: number;
  discoverError: string | null;
  discoverCommunities: DiscoverCommunitySnapshot[];
  discoverApps: DiscoverAppCatalogEntry[];
  discoverSkills: DiscoverSkillCatalogEntry[];
  formatPlanPrice: (plan: DiscoverCommunitySnapshot["active_plan"]) => string;
  userPlatformAppMounts: UserPlatformMountedApp[];
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  isConnectingUserPlatformApp: boolean;
  onConnectUserPlatformApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult> | ConnectUserPlatformAppResult;
  manageableCommunityTargetName: string | null;
  communityAppMounts: CommunityMountedApp[];
  isLoadingCommunityAppMounts: boolean;
  communityAppMountError: string | null;
  communityAppMutationError: string | null;
  isConnectingCommunityApp: boolean;
  onConnectCommunityApp: (
    input: ConnectCommunityAppInput,
  ) => Promise<boolean> | boolean;
  userPlatformSkills: UserPlatformInstalledSkill[];
  isLoadingUserPlatformSkills: boolean;
  userPlatformSkillError: string | null;
  userPlatformSkillMutationError: string | null;
  isCreatingUserPlatformSkill: boolean;
  onCreateUserPlatformSkill: (
    input: CreateSkillPackageInput,
  ) => Promise<boolean> | boolean;
  communitySkillAttachments: CommunityAttachedSkill[];
  ownedSkillPackages: SkillPackageSummary[];
  isLoadingCommunitySkillAttachments: boolean;
  isLoadingOwnedSkillPackages: boolean;
  communitySkillAttachmentError: string | null;
  ownedSkillPackagesError: string | null;
  communitySkillMutationError: string | null;
  isCreatingCommunitySkill: boolean;
  attachingCommunitySkillPackageId: string | null;
  onCreateCommunitySkill: (
    input: CreateSkillPackageInput,
  ) => Promise<boolean> | boolean;
  onAttachSkillPackageToCommunity: (
    skillPackageId: string,
  ) => Promise<boolean> | boolean;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
  onOpenIntegrationsSettings: () => void;
  onOpenCreateUserPlatformSkill: () => void;
  onOpenActiveCommunityAiAgentApps: () => void;
  onOpenActiveCommunityAiAgentSkills: () => void;
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

function buildCommunityMountStatusLabel(mount: CommunityMountedApp): string {
  const count = mount.enabled_tools.length;
  const toolLabel = count === 1 ? "tool" : "tools";
  const connectionStatus = String(
    mount.connection.connection_status ?? "",
  ).trim();
  if (connectionStatus === "connected") {
    return `${count} ${toolLabel} are active in this community lens.`;
  }
  if (connectionStatus) {
    return `${count} ${toolLabel} are mounted, but the connection status is ${connectionStatus.replace(
      /_/g,
      " ",
    )}.`;
  }
  return `${count} ${toolLabel} are mounted in this community lens.`;
}

function findMatchingPersonalMount(
  app: DiscoverAppCatalogEntry,
  catalogApps: DiscoverAppCatalogEntry[],
  mounts: UserPlatformMountedApp[],
): UserPlatformMountedApp | null {
  const byCatalogId =
    app.personalConnect.connectionKind === "known"
      ? mounts.find((mount) => mount.app.catalog_app_id === app.id) ?? null
      : null;
  if (byCatalogId) return byCatalogId;
  const catalogKnownMountKeys = catalogApps.filter(
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

function findMatchingCommunityMount(
  app: DiscoverAppCatalogEntry,
  catalogApps: DiscoverAppCatalogEntry[],
  mounts: CommunityMountedApp[],
): CommunityMountedApp | null {
  const byCatalogId =
    app.personalConnect.connectionKind === "known"
      ? mounts.find((mount) => mount.app.catalog_app_id === app.id) ?? null
      : null;
  if (byCatalogId) return byCatalogId;
  const catalogKnownMountKeys = catalogApps.filter(
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

function readDiscoverSkillInvocationToken(invocation: string): string | null {
  const trimmed = invocation.trim();
  if (!trimmed.startsWith("$")) return null;
  const token = trimmed.slice(1).trim().toLowerCase();
  return token || null;
}

function findMatchingOwnedSkillPackage(
  skill: DiscoverSkillCatalogEntry,
  packages: SkillPackageSummary[],
): SkillPackageSummary | null {
  if (skill.catalogSkillId) {
    const catalogMatch =
      packages.find((skillPackage) => skillPackage.catalogSkillId === skill.catalogSkillId) ??
      null;
    if (catalogMatch) return catalogMatch;
  }
  const token = readDiscoverSkillInvocationToken(skill.invocation);
  if (!token) return null;
  return (
    packages.find(
      (skillPackage) =>
        String(skillPackage.mentionToken ?? "").trim().toLowerCase() === token,
    ) ?? null
  );
}

function findMatchingCommunitySkillAttachment(
  skill: DiscoverSkillCatalogEntry,
  attachments: CommunityAttachedSkill[],
): CommunityAttachedSkill | null {
  const matchingPackage = findMatchingOwnedSkillPackage(
    skill,
    attachments.map((attachment) => attachment.skill),
  );
  if (!matchingPackage) return null;
  return (
    attachments.find((attachment) => attachment.skill.id === matchingPackage.id) ?? null
  );
}

function buildDiscoverCommunityCardProps(args: {
  community: DiscoverCommunitySnapshot;
  formatPlanPrice: (
    plan: DiscoverCommunitySnapshot["active_plan"],
  ) => string;
  onActivateCommunity: (community: DiscoverCommunitySnapshot) => void;
}): ComponentProps<typeof DiscoverCommunityCard> {
  const { community } = args;
  return {
    name: community.name,
    slug: community.slug,
    oneLiner: community.one_liner ?? "",
    avatarUrl: community.avatar_url,
    avatarFocusX: community.avatar_focus_x,
    avatarFocusY: community.avatar_focus_y,
    avatarZoom: community.avatar_zoom,
    bannerUrl: community.banner_url,
    bannerFocusX: community.banner_focus_x,
    bannerFocusY: community.banner_focus_y,
    bannerZoom: community.banner_zoom,
    priceLabel: args.formatPlanPrice(community.active_plan),
    clickable: true,
    ariaLabel: `Open ${community.name}`,
    onActivate: () => args.onActivateCommunity(community),
  };
}

export function WebDiscoverPanel(props: WebDiscoverPanelProps) {
  const {
    activeTab,
    selectedAppId,
    selectedSkillId,
    onSelectTab,
    onSelectApp,
    onSelectSkill,
    onRequireAuth,
    hasSession,
    isAuthRecoveringSignedIn,
    isLoadingDiscover,
    discoverCommunitiesCount,
    discoverError,
    discoverCommunities,
    discoverApps,
    discoverSkills,
    formatPlanPrice,
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    isConnectingUserPlatformApp,
    onConnectUserPlatformApp,
    manageableCommunityTargetName,
    communityAppMounts,
    isLoadingCommunityAppMounts,
    communityAppMountError,
    communityAppMutationError,
    isConnectingCommunityApp,
    onConnectCommunityApp,
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    userPlatformSkillMutationError,
    isCreatingUserPlatformSkill,
    onCreateUserPlatformSkill,
    communitySkillAttachments,
    ownedSkillPackages,
    isLoadingCommunitySkillAttachments,
    isLoadingOwnedSkillPackages,
    communitySkillAttachmentError,
    ownedSkillPackagesError,
    communitySkillMutationError,
    isCreatingCommunitySkill,
    attachingCommunitySkillPackageId,
    onCreateCommunitySkill,
    onAttachSkillPackageToCommunity,
    onActivateCommunity,
    onOpenIntegrationsSettings,
    onOpenCreateUserPlatformSkill,
    onOpenActiveCommunityAiAgentApps,
    onOpenActiveCommunityAiAgentSkills,
  } = props;
  const [personalConnectEndpoint, setPersonalConnectEndpoint] = useState("");
  const [personalConnectAuthType, setPersonalConnectAuthType] =
    useState<DeveloperAppAuthType>("bearer");
  const [personalConnectSecret, setPersonalConnectSecret] = useState("");
  const [personalConnectError, setPersonalConnectError] = useState<string | null>(
    null,
  );
  const [appConnectTarget, setAppConnectTarget] = useState<
    "personal" | "community"
  >("personal");
  const [isPersonalConnectModalOpen, setIsPersonalConnectModalOpen] =
    useState(false);
  const [personalConnectResult, setPersonalConnectResult] = useState<
    "passed" | "failed" | null
  >(null);
  const [personalConnectValidationReport, setPersonalConnectValidationReport] =
    useState<UserPlatformAppValidationReport | null>(null);
  const [communityConnectResult, setCommunityConnectResult] = useState<
    "passed" | "failed" | null
  >(null);
  const [selectedSkillActionError, setSelectedSkillActionError] = useState<
    string | null
  >(null);

  const activeTabIndex = DISCOVER_TABS.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(
    DISCOVER_TABS.length,
    activeTabIndex,
  );
  const filteredApps = discoverApps;
  const filteredSkills = discoverSkills;
  const selectedApp = selectedAppId
    ? discoverApps.find((entry) => entry.id === selectedAppId) ?? null
    : null;
  const selectedSkill = selectedSkillId
    ? discoverSkills.find((entry) => entry.id === selectedSkillId) ?? null
    : null;
  const isDetailView = Boolean(selectedApp || selectedSkill);
  const shouldShowHeroCopy = !isDetailView;
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
    return findMatchingPersonalMount(selectedApp, discoverApps, userPlatformAppMounts);
  }, [discoverApps, selectedApp, userPlatformAppMounts]);
  const selectedCommunityMount = useMemo(() => {
    if (!selectedApp) return null;
    return findMatchingCommunityMount(selectedApp, discoverApps, communityAppMounts);
  }, [communityAppMounts, discoverApps, selectedApp]);
  const selectedPersonalSkillInstall = useMemo(() => {
    if (!selectedSkill) return null;
    return findMatchingDiscoverSkillInstall(selectedSkill, userPlatformSkills);
  }, [selectedSkill, userPlatformSkills]);
  const selectedOwnedSkillPackage = useMemo(() => {
    if (!selectedSkill) return null;
    return findMatchingOwnedSkillPackage(selectedSkill, ownedSkillPackages);
  }, [ownedSkillPackages, selectedSkill]);
  const selectedCommunitySkillAttachment = useMemo(() => {
    if (!selectedSkill) return null;
    return findMatchingCommunitySkillAttachment(
      selectedSkill,
      communitySkillAttachments,
    );
  }, [communitySkillAttachments, selectedSkill]);
  const hasManageableCommunityTarget = Boolean(
    String(manageableCommunityTargetName ?? "").trim(),
  );

  const isAppsTab = activeTab === "apps";
  const isSkillsTab = activeTab === "skills";

  useEffect(() => {
    if (!isAppsTab && selectedAppId) {
      onSelectApp(null);
    }
  }, [isAppsTab, onSelectApp, selectedAppId]);

  useEffect(() => {
    if (!isSkillsTab && selectedSkillId) {
      onSelectSkill(null);
      setSelectedSkillActionError(null);
    }
  }, [isSkillsTab, onSelectSkill, selectedSkillId]);

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
    setCommunityConnectResult(null);
    setAppConnectTarget("personal");
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
  const selectedAppPersonalActionLabel = selectedApp
    ? selectedPersonalMount
      ? "Manage"
      : isDiscoverAppPersonallyConnectable(selectedApp)
        ? "Add"
        : null
    : null;
  const selectedAppCommunityActionLabel =
    selectedApp && hasManageableCommunityTarget
      ? selectedCommunityMount
        ? `Manage ${manageableCommunityTargetName}`
        : isDiscoverAppPersonallyConnectable(selectedApp)
          ? `Add to ${manageableCommunityTargetName}`
          : null
      : null;
  const selectedSkillPersonalActionLabel = selectedSkill
    ? selectedPersonalSkillInstall
      ? "Manage"
      : selectedSkill.installInput
        ? "Add"
        : "Create custom skill"
    : null;
  const selectedSkillCommunityActionLabel =
    selectedSkill && hasManageableCommunityTarget
      ? selectedCommunitySkillAttachment
        ? `Manage ${manageableCommunityTargetName}`
        : selectedSkill.installInput
          ? `Add to ${manageableCommunityTargetName}`
          : `Create in ${manageableCommunityTargetName}`
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
  const communityTargetLabel =
    String(manageableCommunityTargetName ?? "").trim() || "this community";

  const resetAppConnectFeedback = () => {
    setPersonalConnectError(null);
    setPersonalConnectResult(null);
    setPersonalConnectValidationReport(null);
    setCommunityConnectResult(null);
  };

  const openAppConnectModal = (target: "personal" | "community") => {
    setAppConnectTarget(target);
    resetAppConnectFeedback();
    setIsPersonalConnectModalOpen(true);
  };

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
        `Paste your ${app.personalConnect.secretLabel} to add ${app.name}.`,
      );
      return;
    }
    if (
      app.personalConnect.connectionKind === "custom" &&
      !personalConnectEndpoint.trim()
    ) {
      setPersonalConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError("Paste the MCP endpoint before adding it.");
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
      setPersonalConnectError("This app is not ready for direct installation yet.");
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
      `Couldn't add ${app.name}. Check the requirements and try again.`,
    );
  };

  const handleUseInCommunity = async (
    app: DiscoverAppCatalogEntry,
  ): Promise<void> => {
    if (!isDiscoverAppPersonallyConnectable(app)) return;
    if (isAuthRecoveringSignedIn || isLoadingCommunityAppMounts) return;
    if (!hasSession) {
      onRequireAuth();
      return;
    }
    if (!hasManageableCommunityTarget) return;
    if (selectedCommunityMount) return;
    if (
      app.personalConnect.connectionKind === "known" &&
      app.personalConnect.authMethod === "token" &&
      !personalConnectSecret.trim()
    ) {
      setCommunityConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError(
        `Paste your ${app.personalConnect.secretLabel} to add ${app.name} to ${communityTargetLabel}.`,
      );
      return;
    }
    if (
      app.personalConnect.connectionKind === "custom" &&
      !personalConnectEndpoint.trim()
    ) {
      setCommunityConnectResult("failed");
      setPersonalConnectValidationReport(null);
      setPersonalConnectError("Paste the MCP endpoint before adding it.");
      return;
    }
    if (
      app.personalConnect.connectionKind === "custom" &&
      personalConnectAuthType !== "none" &&
      !personalConnectSecret.trim()
    ) {
      setCommunityConnectResult("failed");
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
      setCommunityConnectResult("failed");
      setPersonalConnectError("This app is not ready for direct installation yet.");
      return;
    }
    setPersonalConnectError(null);
    setPersonalConnectResult(null);
    setPersonalConnectValidationReport(null);
    const ok = await onConnectCommunityApp(connectInput);
    if (ok) {
      setCommunityConnectResult("passed");
      setPersonalConnectSecret("");
      return;
    }
    setCommunityConnectResult("failed");
    setPersonalConnectError((current) =>
      current ??
      `Couldn't add ${app.name} to ${communityTargetLabel}. Check the requirements and try again.`,
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
    const existingInstall = findMatchingDiscoverSkillInstall(
      skill,
      userPlatformSkills,
    );
    if (existingInstall) {
      onOpenIntegrationsSettings();
      return;
    }
    if (!skill.installInput) {
      onOpenCreateUserPlatformSkill();
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

  const handleAddSkillToCommunity = async (
    skill: DiscoverSkillCatalogEntry,
  ): Promise<void> => {
    if (isAuthRecoveringSignedIn) return;
    if (
      isLoadingCommunitySkillAttachments ||
      isLoadingOwnedSkillPackages
    ) {
      return;
    }
    if (!hasSession) {
      onRequireAuth();
      return;
    }
    if (!hasManageableCommunityTarget) return;
    if (selectedCommunitySkillAttachment) {
      onOpenActiveCommunityAiAgentSkills();
      return;
    }
    if (!skill.installInput) {
      onOpenActiveCommunityAiAgentSkills();
      return;
    }
    setSelectedSkillActionError(null);
    const ok = selectedOwnedSkillPackage
      ? await onAttachSkillPackageToCommunity(selectedOwnedSkillPackage.id)
      : await onCreateCommunitySkill(skill.installInput);
    if (!ok) {
      setSelectedSkillActionError(
        `Couldn't add ${skill.name} to ${communityTargetLabel} right now. Check the error and try again.`,
      );
      return;
    }
    onOpenActiveCommunityAiAgentSkills();
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
        {shouldShowHeroCopy ? (
          <div className="discover-hero-copy">
            <div className="discover-title">{heroTitle}</div>
            <div className="discover-subtitle">{heroSubtitle}</div>
          </div>
        ) : selectedApp ? (
          <div className="discover-breadcrumb discover-hero-breadcrumb">
            <button
              type="button"
              className="discover-breadcrumb-button"
              onClick={() => onSelectApp(null)}
            >
              Apps
            </button>
            <span className="discover-breadcrumb-separator">›</span>
            <span>{selectedApp.name}</span>
          </div>
        ) : selectedSkill ? (
          <div className="discover-breadcrumb discover-hero-breadcrumb">
            <button
              type="button"
              className="discover-breadcrumb-button"
              onClick={() => {
                onSelectSkill(null);
                setSelectedSkillActionError(null);
              }}
            >
              Skills
            </button>
            <span className="discover-breadcrumb-separator">›</span>
            <span>{selectedSkill.name}</span>
          </div>
        ) : null}
        {!isDetailView ? (
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
        ) : null}
      </div>
      <div className="workspace-body chat-feed">
        <div className="chat-messages discover-scroll">
          {isAppsTab && selectedApp ? (
            <div className="discover-app-detail-page">
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
                    <div className="agent-capability-toolbar-actions">
                      {selectedAppPersonalActionLabel ? (
                        <button
                          type="button"
                          className="settings-cta discover-app-detail-action"
                          onClick={() => {
                            if (selectedPersonalMount) {
                              onOpenIntegrationsSettings();
                              return;
                            }
                            openAppConnectModal("personal");
                          }}
                        >
                          {selectedAppPersonalActionLabel}
                        </button>
                      ) : null}
                      {selectedAppCommunityActionLabel ? (
                        <button
                          type="button"
                          className="settings-cta discover-app-detail-action"
                          onClick={() => {
                            if (selectedCommunityMount) {
                              onOpenActiveCommunityAiAgentApps();
                              return;
                            }
                            openAppConnectModal("community");
                          }}
                          disabled={isLoadingCommunityAppMounts}
                        >
                          {isLoadingCommunityAppMounts && !selectedCommunityMount
                            ? "Checking…"
                            : selectedAppCommunityActionLabel}
                        </button>
                      ) : null}
                    </div>
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
                      Added to you
                    </div>
                    <div className="discover-connect-status-body">
                      {buildMountStatusLabel(selectedPersonalMount)}
                    </div>
                  </div>
                ) : !isDiscoverAppPersonallyConnectable(selectedApp) ? (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">Add path coming soon</div>
                    <div className="discover-connect-status-body">
                      {selectedApp.supportNote}
                    </div>
                  </div>
                ) : (
                  <div className="discover-connect-status">
                    <div className="discover-connect-status-title">Ready to add</div>
                    <div className="discover-connect-status-body">
                      Use `Add` to open the requirements modal and mount {selectedApp.name} into your baseline platform tools.
                    </div>
                  </div>
                )}
                {hasManageableCommunityTarget ? (
                  selectedCommunityMount ? (
                    <div className="discover-connect-status">
                    <div className="discover-connect-status-title">
                      Added to {communityTargetLabel}
                    </div>
                    <div className="discover-connect-status-body">
                      {buildCommunityMountStatusLabel(selectedCommunityMount)}
                    </div>
                  </div>
                  ) : isLoadingCommunityAppMounts ? (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Checking {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        Loading the current community app mounts for this target.
                      </div>
                    </div>
                  ) : isDiscoverAppPersonallyConnectable(selectedApp) ? (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Ready to add to {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        Add this app directly to the active community lens without leaving Discover.
                      </div>
                    </div>
                  ) : null
                ) : null}
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
                    <div className="agent-capability-toolbar-actions">
                      {selectedSkillPersonalActionLabel ? (
                        <button
                          type="button"
                          className="settings-cta discover-app-detail-action"
                          onClick={() => void handleAddSkill(selectedSkill)}
                          disabled={
                            isCreatingUserPlatformSkill ||
                            isLoadingUserPlatformSkills
                          }
                        >
                          {selectedPersonalSkillInstall
                            ? selectedSkillPersonalActionLabel
                            : isCreatingUserPlatformSkill
                              ? "Adding…"
                              : selectedSkillPersonalActionLabel}
                        </button>
                      ) : null}
                      {selectedSkillCommunityActionLabel ? (
                        <button
                          type="button"
                          className="settings-cta discover-app-detail-action"
                          onClick={() => void handleAddSkillToCommunity(selectedSkill)}
                          disabled={
                            isLoadingCommunitySkillAttachments ||
                            isLoadingOwnedSkillPackages ||
                            isCreatingCommunitySkill ||
                            (selectedOwnedSkillPackage
                              ? attachingCommunitySkillPackageId ===
                                selectedOwnedSkillPackage.id
                              : false)
                          }
                        >
                          {selectedCommunitySkillAttachment
                            ? selectedSkillCommunityActionLabel
                            : isLoadingCommunitySkillAttachments ||
                                isLoadingOwnedSkillPackages
                              ? "Checking…"
                              : isCreatingCommunitySkill ||
                                  (selectedOwnedSkillPackage
                                    ? attachingCommunitySkillPackageId ===
                                      selectedOwnedSkillPackage.id
                                    : false)
                                ? "Adding…"
                                : selectedSkillCommunityActionLabel}
                        </button>
                      ) : null}
                    </div>
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
                {hasSession && hasManageableCommunityTarget && communitySkillAttachmentError ? (
                  <div className="auth-error">{communitySkillAttachmentError}</div>
                ) : null}
                {hasSession && hasManageableCommunityTarget && ownedSkillPackagesError ? (
                  <div className="auth-error">{ownedSkillPackagesError}</div>
                ) : null}
                {hasSession && hasManageableCommunityTarget && communitySkillMutationError ? (
                  <div className="auth-error">{communitySkillMutationError}</div>
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
                    <div className="discover-connect-status-title">Added to you</div>
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
                      This is the custom path. Open Integrations with the skill
                      creator already open.
                    </div>
                  </div>
                )}
                {hasManageableCommunityTarget ? (
                  selectedCommunitySkillAttachment ? (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Added to {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        This skill is attached to the active community lens and
                        can be managed from AI Agent {">"} Skills.
                      </div>
                    </div>
                  ) : isLoadingCommunitySkillAttachments || isLoadingOwnedSkillPackages ? (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Checking {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        Loading this community&apos;s attached skills and your reusable
                        skill packages.
                      </div>
                    </div>
                  ) : selectedSkill.installInput ? (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Ready to add to {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        Add this skill directly to the active community lens
                        without leaving Discover.
                      </div>
                    </div>
                  ) : (
                    <div className="discover-connect-status">
                      <div className="discover-connect-status-title">
                        Create in {communityTargetLabel}
                      </div>
                      <div className="discover-connect-status-body">
                        Open the active community&apos;s AI Agent skills editor to
                        create a custom skill and attach it there.
                      </div>
                    </div>
                  )
                ) : null}
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
                  {hasManageableCommunityTarget ? (
                    <div className="discover-info-row">
                      <div className="discover-info-label">Community</div>
                      <div className="discover-info-value">
                        AI Agent {">"} Skills for {communityTargetLabel}
                      </div>
                    </div>
                  ) : null}
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
                      onClick={() => onSelectApp(app.id)}
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
                      <span className="discover-app-action">View</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {isSkillsTab
                ? (
                    <div
                      className="discover-app-list discover-skill-list"
                      role="list"
                      aria-label="Skill catalog"
                    >
                      {filteredSkills.map((skill) => {
                        const matchingInstall = findMatchingDiscoverSkillInstall(
                          skill,
                          userPlatformSkills,
                        );
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            className="discover-app-row-button discover-skill-row-button"
                            role="listitem"
                            onClick={() => {
                              onSelectSkill(skill.id);
                              setSelectedSkillActionError(null);
                            }}
                            aria-label={`Open ${skill.name}`}
                          >
                            <div
                              className={`discover-app-icon discover-app-icon-${skill.icon} discover-skill-row-icon`}
                            >
                              {renderSkillIcon(skill.icon)}
                            </div>
                            <div className="discover-app-row-copy discover-skill-row-copy">
                              <div className="discover-skill-row-heading">
                                <div className="discover-app-row-name">
                                  {skill.name}
                                </div>
                                <span className="discover-skill-row-badge">
                                  {skill.kind === "custom" ? "Custom" : "Curated"}
                                </span>
                              </div>
                              <div className="discover-app-row-tagline">
                                {skill.tagline}
                              </div>
                              <div className="discover-skill-row-desc">
                                {skill.description}
                              </div>
                              <div className="discover-skill-row-meta">
                                <span className="discover-skill-row-token">
                                  {skill.installInput ? skill.invocation : "Name-derived token"}
                                </span>
                                <span>{skill.surface}</span>
                              </div>
                            </div>
                            <span
                              className={`discover-app-action${
                                matchingInstall ? " is-installed" : ""
                              }`}
                            >
                              {matchingInstall
                                ? "Manage"
                                : skill.installInput
                                  ? "Add"
                                  : "Create"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
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
            if (
              (appConnectTarget === "personal" && isConnectingUserPlatformApp) ||
              (appConnectTarget === "community" && isConnectingCommunityApp)
            ) {
              return;
            }
            setIsPersonalConnectModalOpen(false);
            resetAppConnectFeedback();
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
                {appConnectTarget === "community"
                  ? `Add ${selectedApp.name} to ${communityTargetLabel}`
                  : `Add ${selectedApp.name}`}
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => {
                  setIsPersonalConnectModalOpen(false);
                  resetAppConnectFeedback();
                }}
                disabled={
                  appConnectTarget === "personal"
                    ? isConnectingUserPlatformApp
                    : isConnectingCommunityApp
                }
              >
                ×
              </button>
            </div>
            <div className="modal-body discover-connect-modal-body">
              {(appConnectTarget === "community"
                ? selectedApp.personalConnect.connectionKind === "custom"
                  ? `Enter a remote MCP endpoint and auth details to add it to ${communityTargetLabel}.`
                  : selectedApp.personalConnect.authMethod === "token"
                    ? `Paste your ${selectedApp.personalConnect.secretLabel} to add ${selectedApp.name} to ${communityTargetLabel}.`
                    : `Review the connection requirements, then add ${selectedApp.name} to ${communityTargetLabel}.`
                : personalConnectModalCopy) ? (
                <div className="discover-connect-modal-copy">
                  {appConnectTarget === "community"
                    ? selectedApp.personalConnect.connectionKind === "custom"
                      ? `Enter a remote MCP endpoint and auth details to add it to ${communityTargetLabel}.`
                      : selectedApp.personalConnect.authMethod === "token"
                        ? `Paste your ${selectedApp.personalConnect.secretLabel} to add ${selectedApp.name} to ${communityTargetLabel}.`
                        : `Review the connection requirements, then add ${selectedApp.name} to ${communityTargetLabel}.`
                    : personalConnectModalCopy}
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
              {appConnectTarget === "personal" && personalConnectLoadError ? (
                <div className="auth-error">{personalConnectLoadError}</div>
              ) : null}
              {appConnectTarget === "personal" && personalConnectMutationError ? (
                <div className="auth-error">{personalConnectMutationError}</div>
              ) : null}
              {appConnectTarget === "community" && communityAppMutationError ? (
                <div className="auth-error">{communityAppMutationError}</div>
              ) : null}
              {personalConnectError ? (
                <div className="auth-error">{personalConnectError}</div>
              ) : null}
              {appConnectTarget === "personal" && personalConnectValidationReport ? (
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
              ) : appConnectTarget === "community" &&
                (communityConnectResult === "passed" || selectedCommunityMount) ? (
                <div className="discover-connect-status is-success">
                  <div className="discover-connect-status-title">Added</div>
                  <div className="discover-connect-status-body">
                    {`${selectedApp.name} is now mounted into ${communityTargetLabel}.`}
                  </div>
                </div>
              ) : appConnectTarget === "community" &&
                communityConnectResult === "failed" ? (
                <div className="discover-connect-status is-error">
                  <div className="discover-connect-status-title">Failed</div>
                  <div className="discover-connect-status-body">
                    {`We couldn't add ${selectedApp.name} to ${communityTargetLabel}. Check the requirements and try again.`}
                  </div>
                </div>
              ) : personalConnectResult === "passed" || selectedPersonalMount ? (
                <div
                  className="discover-connect-status is-success"
                >
                  <div className="discover-connect-status-title">
                    Added
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
                    {`We couldn't add ${selectedApp.name}. Check the requirements and try again.`}
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
                    resetAppConnectFeedback();
                  }}
                disabled={
                  appConnectTarget === "personal"
                    ? isConnectingUserPlatformApp
                    : isConnectingCommunityApp
                }
              >
                {(appConnectTarget === "personal"
                  ? personalConnectResult === "passed" || selectedPersonalMount
                  : communityConnectResult === "passed" || selectedCommunityMount)
                  ? "Done"
                  : "Cancel"}
              </button>
              {(appConnectTarget === "personal"
                ? personalConnectResult === "passed" || selectedPersonalMount
                : communityConnectResult === "passed" || selectedCommunityMount) ? (
                <button
                  type="button"
                  className="platform-save-button is-dirty"
                  onClick={() => {
                    setIsPersonalConnectModalOpen(false);
                    if (appConnectTarget === "community") {
                      onOpenActiveCommunityAiAgentApps();
                      return;
                    }
                    onOpenIntegrationsSettings();
                  }}
                >
                  Manage
                </button>
              ) : (
                <button
                  type="button"
                  className="platform-save-button is-dirty"
                  onClick={() =>
                    void (appConnectTarget === "community"
                      ? handleUseInCommunity(selectedApp)
                      : handleUsePersonally(selectedApp))
                  }
                  disabled={
                    isAuthRecoveringSignedIn ||
                    (appConnectTarget === "personal"
                      ? isConnectingUserPlatformApp ||
                        isLoadingUserPlatformAppMounts
                      : isConnectingCommunityApp || isLoadingCommunityAppMounts)
                  }
                >
                  {isAuthRecoveringSignedIn
                    ? "Restoring account…"
                    : appConnectTarget === "personal" && isConnectingUserPlatformApp
                      ? "Adding…"
                      : appConnectTarget === "community" && isConnectingCommunityApp
                        ? "Adding…"
                        : hasSession
                          ? appConnectTarget === "community"
                            ? `Add to ${communityTargetLabel}`
                            : "Add"
                          : "Sign in to add"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
