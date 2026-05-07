import { useEffect, useMemo, useState } from "react";

import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";
import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type {
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppInput,
  ConnectUserPlatformAppResult,
} from "../../../../shared/userPlatformAppMountTypes";
import {
  buildDiscoverAppPersonalConnectInput,
  buildDiscoverAppPersonalConnectModalCopy,
  buildDiscoverAppPersonalConnectRequirements,
  DISCOVER_APP_CATALOG,
  isDiscoverAppPersonallyConnectable,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebIntegrationsSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  openDiscoverApps: () => void;
  openDiscoverSkills: () => void;
  shouldOpenCreateSkillComposer: boolean;
  onConsumeCreateSkillComposerOpen: () => void;
  effectiveMcpApps: EffectiveMcpApp[];
  isLoadingEffectiveMcpApps: boolean;
  effectiveMcpAppsError: string | null;
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  isConnectingUserPlatformApp: boolean;
  updatingUserPlatformAppMountId: string | null;
  refreshingUserPlatformAppMountId: string | null;
  reconnectingUserPlatformAppMountId: string | null;
  removingUserPlatformAppMountId: string | null;
  onConnectUserPlatformApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult>;
  onBeginUserPlatformAppOAuth: (
    catalogAppId: string,
  ) => Promise<BeginUserPlatformAppOAuthResult>;
  onUpdateUserPlatformAppMount: (
    userPlatformAppMountId: string,
    patch: {
      enabled?: boolean;
      enabledTools?: string[];
    },
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onRefreshUserPlatformApp: (
    userPlatformAppMountId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onReconnectUserPlatformApp: (
    userPlatformAppMountId: string,
    secret: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onUnmountUserPlatformApp: (
    userPlatformAppMountId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  userPlatformSkills: UserPlatformInstalledSkill[];
  isLoadingUserPlatformSkills: boolean;
  userPlatformSkillError: string | null;
  userPlatformSkillMutationError: string | null;
  isCreatingUserPlatformSkill: boolean;
  updatingUserPlatformSkillInstallId: string | null;
  removingUserPlatformSkillInstallId: string | null;
  onCreateUserPlatformSkill: (
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onSaveUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onUpdateUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    patch: {
      enabled?: boolean;
    },
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onDeleteUserPlatformSkill: (
    userPlatformSkillInstallId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
};

function buildInitialSkillDraft(): CreateSkillPackageInput {
  return {
    name: "",
    description: "",
    instructions_md: "",
  };
}

function buildSkillDraftFromInstall(
  install: UserPlatformInstalledSkill,
): CreateSkillPackageInput {
  return {
    name: install.skill.name,
    description: install.skill.description ?? "",
    instructions_md: install.skill.instructionsMd,
  };
}

function pluralizeTools(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

function buildEffectiveHarnessSummary(apps: EffectiveMcpApp[]): string {
  const liveCount = apps.filter((app) => app.live_for_current_user).length;
  const setupCount = apps.filter(
    (app) => !app.live_for_current_user && app.credential_state === "needs_personal_setup",
  ).length;
  const notLiveCount = apps.length - liveCount;
  const scopeLabel = `${apps.length} harness apps`;
  if (apps.length === 0) return "No apps are connected to your harness yet.";
  if (notLiveCount === 0) return `${scopeLabel}. ${liveCount} live.`;
  if (setupCount === notLiveCount) {
    return `${scopeLabel}. ${liveCount} live, ${setupCount} need setup.`;
  }
  return `${scopeLabel}. ${liveCount} live, ${notLiveCount} not live.`;
}

function buildEffectiveAppStateLabel(app: EffectiveMcpApp): string {
  if (app.live_for_current_user) return "Live";
  switch (app.credential_state) {
    case "needs_personal_setup":
      return "Setup needed";
    case "not_live":
    default:
      return "Not live";
  }
}

function buildEffectiveAppStateClassName(app: EffectiveMcpApp): string {
  if (app.live_for_current_user) return " is-live";
  if (app.credential_state === "needs_personal_setup") return " is-setup";
  return " is-not-live";
}

function buildEffectiveAppStatusLabel(app: EffectiveMcpApp): string {
  if (!app.live_for_current_user) {
    return `${buildEffectiveAppStateLabel(app)} · ${pluralizeTools(app.effective_tool_count)}`;
  }
  return `${pluralizeTools(app.effective_tool_count)} active`;
}

function buildEffectiveAppDetail(app: EffectiveMcpApp): string {
  if (app.live_for_current_user && app.is_attached_to_community && app.has_personal_mount) {
    return `${pluralizeTools(app.effective_tool_count)} available through your personal harness.`;
  }
  if (app.live_for_current_user) {
    return `${pluralizeTools(app.effective_tool_count)} available in your personal harness.`;
  }
  if (app.credential_state === "needs_personal_setup" && app.is_attached_to_community) {
    return `${app.app.name} is added by this community, but needs your personal connection before tools go live for you.`;
  }
  return `${buildEffectiveAppStateLabel(app)} in your harness.`;
}

function findCatalogEntryForApp(app: EffectiveMcpApp["app"]) {
  const byCatalogId =
    typeof app.catalog_app_id === "string" && app.catalog_app_id.trim()
      ? DISCOVER_APP_CATALOG.find((entry) => entry.id === app.catalog_app_id) ??
        null
      : null;
  if (byCatalogId) return byCatalogId;
  const byEndpoint = DISCOVER_APP_CATALOG.find((entry) => {
    if (entry.personalConnect.connectionKind !== "known") return false;
    return (
      entry.personalConnect.endpointUrl === app.endpoint_url &&
      entry.personalConnect.authType === app.auth_type
    );
  });
  if (byEndpoint) return byEndpoint;
  const normalizedSlug = app.slug.trim().toLowerCase();
  const normalizedName = app.name.trim().toLowerCase();
  return (
    DISCOVER_APP_CATALOG.find(
      (entry) =>
        entry.id === normalizedSlug ||
        entry.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

function isDeveloperAppAuthType(value: string): value is DeveloperAppAuthType {
  return (
    value === "none" ||
    value === "api_key" ||
    value === "bearer" ||
    value === "oauth"
  );
}

function resolveInitialSetupAuthType(
  app: EffectiveMcpApp,
  catalogEntry: DiscoverAppCatalogEntry,
): DeveloperAppAuthType {
  if (!isDiscoverAppPersonallyConnectable(catalogEntry)) return "bearer";
  if (catalogEntry.personalConnect.connectionKind === "custom") {
    const currentAuthType = app.app.auth_type;
    if (
      isDeveloperAppAuthType(currentAuthType) &&
      catalogEntry.personalConnect.supportedAuthTypes.some(
        (option) => option.value === currentAuthType,
      )
    ) {
      return currentAuthType;
    }
    return catalogEntry.personalConnect.supportedAuthTypes[0]?.value ?? "none";
  }
  return catalogEntry.personalConnect.authType;
}

function setupRequiresSecret(
  catalogEntry: DiscoverAppCatalogEntry,
  authType: DeveloperAppAuthType,
): boolean {
  if (!isDiscoverAppPersonallyConnectable(catalogEntry)) return false;
  if (catalogEntry.personalConnect.connectionKind === "custom") {
    return authType !== "none";
  }
  return catalogEntry.personalConnect.authMethod === "token";
}

function normalizeSetupIdentityPart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function setupTargetsExistingPersonalMount(
  app: EffectiveMcpApp,
  connectInput: ConnectUserPlatformAppInput,
): boolean {
  const personalMount = app.personal_mount;
  if (!personalMount) return false;
  return (
    normalizeSetupIdentityPart(personalMount.app.endpoint_url) ===
      normalizeSetupIdentityPart(connectInput.endpoint_url) &&
    normalizeSetupIdentityPart(personalMount.app.auth_type) ===
      normalizeSetupIdentityPart(connectInput.auth_type)
  );
}

export function WebIntegrationsSettingsSection(
  props: WebIntegrationsSettingsSectionProps,
) {
  const {
    session,
    requireSignIn,
    openDiscoverApps,
    openDiscoverSkills,
    shouldOpenCreateSkillComposer,
    onConsumeCreateSkillComposerOpen,
    effectiveMcpApps,
    isLoadingEffectiveMcpApps,
    effectiveMcpAppsError,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    isConnectingUserPlatformApp,
    updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId,
    reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId,
    onConnectUserPlatformApp,
    onBeginUserPlatformAppOAuth,
    onUpdateUserPlatformAppMount,
    onRefreshUserPlatformApp,
    onReconnectUserPlatformApp,
    onUnmountUserPlatformApp,
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    userPlatformSkillMutationError,
    isCreatingUserPlatformSkill,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
    onCreateUserPlatformSkill,
    onSaveUserPlatformSkill,
    onUpdateUserPlatformSkill,
    onDeleteUserPlatformSkill,
  } = props;

  const [reconnectDraftMountId, setReconnectDraftMountId] = useState<
    string | null
  >(null);
  const [openMountMenuId, setOpenMountMenuId] = useState<string | null>(null);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<CreateSkillPackageInput>(
    buildInitialSkillDraft,
  );
  const [editingUserPlatformSkillInstallId, setEditingUserPlatformSkillInstallId] =
    useState<string | null>(null);
  const [editingSkillDraft, setEditingSkillDraft] =
    useState<CreateSkillPackageInput>(buildInitialSkillDraft);
  const [reconnectSecret, setReconnectSecret] = useState("");
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [setupAppIdentityKey, setSetupAppIdentityKey] = useState<string | null>(
    null,
  );
  const [setupEndpoint, setSetupEndpoint] = useState("");
  const [setupAuthType, setSetupAuthType] =
    useState<DeveloperAppAuthType>("bearer");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);

  const busyMountIds = useMemo(
    () =>
      new Set(
        [
          updatingUserPlatformAppMountId,
          refreshingUserPlatformAppMountId,
          reconnectingUserPlatformAppMountId,
          removingUserPlatformAppMountId,
        ].filter(Boolean) as string[],
      ),
    [
      reconnectingUserPlatformAppMountId,
      refreshingUserPlatformAppMountId,
      removingUserPlatformAppMountId,
      updatingUserPlatformAppMountId,
    ],
  );

  const visibleEffectiveMcpApps = useMemo(
    () =>
      [...effectiveMcpApps].sort((left, right) =>
        left.app.name.localeCompare(right.app.name),
      ),
    [effectiveMcpApps],
  );
  const setupEffectiveApp = useMemo(
    () =>
      setupAppIdentityKey
        ? visibleEffectiveMcpApps.find(
            (app) => app.app_identity_key === setupAppIdentityKey,
          ) ?? null
        : null,
    [setupAppIdentityKey, visibleEffectiveMcpApps],
  );
  const setupCatalogEntry = setupEffectiveApp
    ? findCatalogEntryForApp(setupEffectiveApp.app)
    : null;
  const setupRequirements =
    setupCatalogEntry && isDiscoverAppPersonallyConnectable(setupCatalogEntry)
      ? buildDiscoverAppPersonalConnectRequirements(setupCatalogEntry, {
          endpointUrl: setupEndpoint,
          authType: setupAuthType,
        })
      : [];
  const setupModalCopy = setupCatalogEntry
    ? buildDiscoverAppPersonalConnectModalCopy(setupCatalogEntry)
    : null;
  const isSetupOauth =
    setupCatalogEntry &&
    isDiscoverAppPersonallyConnectable(setupCatalogEntry) &&
    setupCatalogEntry.personalConnect.connectionKind === "known" &&
    setupCatalogEntry.personalConnect.authMethod === "oauth";
  const isSettingUpApp = isConnectingUserPlatformApp || Boolean(
    setupEffectiveApp?.personal_mount?.source_mount_id &&
      reconnectingUserPlatformAppMountId ===
        setupEffectiveApp.personal_mount.source_mount_id,
  );

  useEffect(() => {
    if (!openMountMenuId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-integration-menu-root="true"]')
      ) {
        return;
      }
      setOpenMountMenuId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openMountMenuId]);

  useEffect(() => {
    if (!shouldOpenCreateSkillComposer) return;
    setEditingUserPlatformSkillInstallId(null);
    setEditingSkillDraft(buildInitialSkillDraft());
    setSkillDraft(buildInitialSkillDraft());
    setIsCreateSkillOpen(true);
    onConsumeCreateSkillComposerOpen();
  }, [onConsumeCreateSkillComposerOpen, shouldOpenCreateSkillComposer]);

  const handleCreatePersonalSkill = async () => {
    const ok = await onCreateUserPlatformSkill(skillDraft);
    if (!ok) return;
    setSkillDraft(buildInitialSkillDraft());
    setIsCreateSkillOpen(false);
  };

  const handleSavePersonalSkill = async () => {
    if (!editingUserPlatformSkillInstallId) return;
    const ok = await onSaveUserPlatformSkill(
      editingUserPlatformSkillInstallId,
      editingSkillDraft,
    );
    if (!ok) return;
    setEditingUserPlatformSkillInstallId(null);
    setEditingSkillDraft(buildInitialSkillDraft());
  };

  const closeSetupModal = () => {
    setSetupAppIdentityKey(null);
    setSetupEndpoint("");
    setSetupAuthType("bearer");
    setSetupSecret("");
    setSetupError(null);
  };

  const openSetupModalForApp = (
    app: EffectiveMcpApp,
    catalogEntry: DiscoverAppCatalogEntry | null,
  ) => {
    if (!session) {
      requireSignIn();
      return;
    }
    if (!catalogEntry || !isDiscoverAppPersonallyConnectable(catalogEntry)) {
      openDiscoverApps();
      return;
    }
    const initialAuthType = resolveInitialSetupAuthType(app, catalogEntry);
    const initialEndpoint =
      catalogEntry.personalConnect.connectionKind === "custom"
        ? app.app.endpoint_url
        : catalogEntry.personalConnect.endpointUrl;
    setOpenMountMenuId(null);
    setReconnectDraftMountId(null);
    setReconnectSecret("");
    setReconnectError(null);
    setSetupAppIdentityKey(app.app_identity_key);
    setSetupEndpoint(initialEndpoint);
    setSetupAuthType(initialAuthType);
    setSetupSecret("");
    setSetupError(null);
  };

  const handleConfirmSetup = async () => {
    if (!setupEffectiveApp || !setupCatalogEntry) return;
    setSetupError(null);
    if (!isDiscoverAppPersonallyConnectable(setupCatalogEntry)) {
      setSetupError("This app is not ready for setup yet.");
      return;
    }
    if (isSetupOauth) {
      const result = await onBeginUserPlatformAppOAuth(setupCatalogEntry.id);
      if (!result.ok) {
        setSetupError(
          result.error_message ??
            `Couldn't start ${setupCatalogEntry.name} authentication.`,
        );
      }
      return;
    }

    const trimmedSecret = setupSecret.trim();
    if (setupRequiresSecret(setupCatalogEntry, setupAuthType) && !trimmedSecret) {
      setSetupError(`Paste your ${setupCatalogEntry.name} token to continue.`);
      return;
    }

    const connectInput = buildDiscoverAppPersonalConnectInput(setupCatalogEntry, {
      endpointUrl: setupEndpoint,
      authType: setupAuthType,
      description: setupCatalogEntry.description,
      secret: trimmedSecret || undefined,
    });
    if (!connectInput) {
      setSetupError("This app is not ready for this setup path.");
      return;
    }

    const existingMountId = setupEffectiveApp.personal_mount?.source_mount_id ?? null;
    const targetsExistingPersonalMount =
      existingMountId !== null &&
      setupTargetsExistingPersonalMount(setupEffectiveApp, connectInput);
    if (
      existingMountId &&
      targetsExistingPersonalMount &&
      connectInput.auth_type !== "none" &&
      connectInput.auth_type !== "oauth"
    ) {
      const ok = await onReconnectUserPlatformApp(existingMountId, trimmedSecret);
      if (!ok) {
        setSetupError(
          `Couldn't finish setting up ${setupCatalogEntry.name}. Check the token and try again.`,
        );
        return;
      }
      closeSetupModal();
      return;
    }

    if (
      existingMountId &&
      targetsExistingPersonalMount &&
      connectInput.auth_type === "none"
    ) {
      const ok = await onRefreshUserPlatformApp(existingMountId);
      if (!ok) {
        setSetupError(
          `Couldn't refresh ${setupCatalogEntry.name}. Try again from this setup modal.`,
        );
        return;
      }
      closeSetupModal();
      return;
    }

    const result = await onConnectUserPlatformApp(connectInput);
    if (!result.ok && !result.mount) {
      setSetupError(
        result.error_message ??
          `Couldn't set up ${setupCatalogEntry.name}. Check the requirements and try again.`,
      );
      return;
    }
    closeSetupModal();
  };

  return (
    <>
      <div className="integrations-header">
        <div className="panel-title">Integrations</div>
        <button
          type="button"
          className="settings-cta integrations-header-action"
          onClick={session ? openDiscoverApps : requireSignIn}
        >
          {session ? "Connect apps" : "Sign in to connect"}
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" />
          </svg>
          Active harness apps
        </div>
        <div className="settings-section-desc">
          Your personal harness is the executable MCP source. Community
          apps resolve to the same app state when present.
        </div>
        {session ? (
          <div className="model-note">
            {isLoadingEffectiveMcpApps && effectiveMcpApps.length === 0
              ? "Loading harness status..."
              : effectiveMcpAppsError
                ? "Could not load unified harness status yet."
                : buildEffectiveHarnessSummary(effectiveMcpApps)}
          </div>
        ) : null}
        {!session ? (
          <div className="model-note">
            Sign in to connect personal apps to your harness.
          </div>
        ) : null}
        {session && (userPlatformAppMountError || effectiveMcpAppsError) ? (
          <div className="auth-error">
            Couldn&apos;t load your active harness apps right now. Try refreshing
            the page.
          </div>
        ) : null}
        {session && userPlatformAppMutationError ? (
          <div className="auth-error">{userPlatformAppMutationError}</div>
        ) : null}
        {session ? (
          <div className="integrations-app-list">
            {(isLoadingUserPlatformAppMounts || isLoadingEffectiveMcpApps) &&
            visibleEffectiveMcpApps.length === 0 ? (
              <div className="model-note">Loading your active harness apps…</div>
            ) : null}
            {!isLoadingUserPlatformAppMounts &&
            !isLoadingEffectiveMcpApps &&
            visibleEffectiveMcpApps.length === 0 ? (
              <div className="model-note">
                No apps are connected to your harness yet. Use `Connect apps` to
                browse the catalog.
              </div>
            ) : null}
            {visibleEffectiveMcpApps.map((effectiveApp) => {
              const personalMount = effectiveApp.personal_mount;
              const communityMount = effectiveApp.community_mount;
              const actionMount = personalMount;
              const sourceMountId = actionMount?.source_mount_id ?? null;
              const canManagePersonal = Boolean(actionMount && sourceMountId);
              const canReconnect = Boolean(
                actionMount && sourceMountId && effectiveApp.app.auth_type !== "none",
              );
              const isBusy = Boolean(sourceMountId && busyMountIds.has(sourceMountId));
              const isReconnectDraftOpen =
                reconnectDraftMountId === effectiveApp.app_identity_key;
              const isReconnecting =
                sourceMountId !== null &&
                reconnectingUserPlatformAppMountId === sourceMountId;
              const isMenuOpen = openMountMenuId === effectiveApp.app_identity_key;
              const catalogEntry = findCatalogEntryForApp(effectiveApp.app);
              const canSetupPersonal =
                effectiveApp.primary_action === "setup_personal" &&
                Boolean(
                  catalogEntry &&
                    isDiscoverAppPersonallyConnectable(catalogEntry),
                );
              return (
                <div
                  key={effectiveApp.app_identity_key}
                  className="integration-mounted-row"
                >
                  <div className="integration-mounted-top">
                    <div className="integration-mounted-identity">
                      <DiscoverCatalogLogo
                        name={effectiveApp.app.name}
                        logoUrl={catalogEntry?.logoUrl}
                        logoUrlDark={catalogEntry?.logoUrlDark}
                      />
                      <div className="integration-mounted-main">
                        <div className="integration-mounted-title-row">
                          <strong>{effectiveApp.app.name}</strong>
                          <span
                            className={`integration-state-indicator${buildEffectiveAppStateClassName(
                              effectiveApp,
                            )}`}
                          >
                            <span aria-hidden="true" />
                            {buildEffectiveAppStateLabel(effectiveApp)}
                          </span>
                          <span className="integration-status-pill">
                            {buildEffectiveAppStatusLabel(effectiveApp)}
                          </span>
                          <span className="integration-status-pill">
                            {effectiveApp.is_attached_to_community
                              ? effectiveApp.has_personal_mount
                                ? "Personal + community"
                                : "Community"
                              : "Personal"}
                          </span>
                        </div>
                        <div className="integration-mounted-meta">
                          {effectiveApp.app.endpoint_url}
                        </div>
                        <div className="integration-mounted-detail">
                          {buildEffectiveAppDetail(effectiveApp)}
                        </div>
                      </div>
                    </div>
                    {canManagePersonal && sourceMountId ? (
                      <div className="integration-mounted-rail">
                        {canSetupPersonal ? (
                          <button
                            type="button"
                            className="settings-cta integration-mounted-setup-action"
                            disabled={isBusy || isConnectingUserPlatformApp}
                            onClick={() =>
                              openSetupModalForApp(effectiveApp, catalogEntry)
                            }
                          >
                            Set up
                          </button>
                        ) : null}
                        <label
                          className={`members-switch integration-mounted-switch${
                            isBusy ? " is-disabled" : ""
                          }`}
                          title={
                            actionMount?.enabled ? "Disable app" : "Enable app"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(actionMount?.enabled)}
                            disabled={isBusy}
                            aria-label={`${
                              actionMount?.enabled ? "Disable" : "Enable"
                            } ${effectiveApp.app.name}`}
                            onChange={() =>
                              void onUpdateUserPlatformAppMount(sourceMountId, {
                                enabled: !actionMount?.enabled,
                              })
                            }
                          />
                          <span className="members-switch-track">
                            <span className="members-switch-thumb" />
                          </span>
                        </label>
                        <div
                          className="integration-mounted-menu-shell"
                          data-integration-menu-root="true"
                        >
                          <button
                            type="button"
                            className="integration-mounted-menu-trigger"
                            aria-expanded={isMenuOpen}
                            aria-label={`${effectiveApp.app.name} options`}
                            disabled={isBusy}
                            onClick={() =>
                              setOpenMountMenuId((current) =>
                                current === effectiveApp.app_identity_key
                                  ? null
                                  : effectiveApp.app_identity_key,
                              )
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="5" cy="12" r="1.8" />
                              <circle cx="12" cy="12" r="1.8" />
                              <circle cx="19" cy="12" r="1.8" />
                            </svg>
                          </button>
                          {isMenuOpen ? (
                            <div
                              className="integration-mounted-menu"
                              role="menu"
                              aria-label={`${effectiveApp.app.name} actions`}
                            >
                              <button
                                type="button"
                                className="integration-mounted-menu-item"
                                disabled={isBusy}
                                onClick={() => {
                                  setOpenMountMenuId(null);
                                  void onRefreshUserPlatformApp(sourceMountId);
                                }}
                              >
                                {refreshingUserPlatformAppMountId === sourceMountId
                                  ? "Refreshing…"
                                  : "Refresh"}
                              </button>
                              {canReconnect ? (
                                <button
                                  type="button"
                                  className="integration-mounted-menu-item"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setOpenMountMenuId(null);
                                    if (isReconnectDraftOpen) {
                                      setReconnectDraftMountId(null);
                                      setReconnectSecret("");
                                      setReconnectError(null);
                                      return;
                                    }
                                    setReconnectDraftMountId(
                                      effectiveApp.app_identity_key,
                                    );
                                    setReconnectSecret("");
                                    setReconnectError(null);
                                  }}
                                >
                                  {isReconnectDraftOpen ? "Cancel reconnect" : "Reconnect"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="integration-mounted-menu-item danger"
                                disabled={isBusy}
                                onClick={() => {
                                  setOpenMountMenuId(null);
                                  void onUnmountUserPlatformApp(sourceMountId);
                                }}
                              >
                                {removingUserPlatformAppMountId === sourceMountId
                                  ? "Removing…"
                                  : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="integration-mounted-rail">
                        {canSetupPersonal ? (
                          <button
                            type="button"
                            className="settings-cta integration-mounted-setup-action"
                            disabled={isConnectingUserPlatformApp}
                            onClick={() =>
                              openSetupModalForApp(effectiveApp, catalogEntry)
                            }
                          >
                            Set up
                          </button>
                        ) : (
                          <span className="integration-status-pill">
                            {communityMount
                              ? "Added by community"
                              : "Open Discover to set up"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {isReconnectDraftOpen ? (
                    <div className="integration-reconnect-panel">
                      <label className="integration-reconnect-field">
                        <span className="agent-capability-field-label">
                          Paste a fresh token
                        </span>
                        <input
                          className="agent-editor-inline-label-input"
                          type="password"
                          value={reconnectSecret}
                          onChange={(event) => {
                            setReconnectSecret(event.target.value);
                            if (reconnectError) setReconnectError(null);
                          }}
                          placeholder={`Paste your ${effectiveApp.app.name} token`}
                        />
                      </label>
                      {reconnectError ? (
                        <div className="auth-error">{reconnectError}</div>
                      ) : null}
                      <div className="integration-reconnect-actions">
                        <button
                          type="button"
                          className="settings-cta"
                          disabled={isReconnecting}
                          onClick={async () => {
                            if (!reconnectSecret.trim()) {
                              setReconnectError(
                                `Paste a fresh ${effectiveApp.app.name} token to reconnect this app.`,
                              );
                              return;
                            }
                            if (!sourceMountId) return;
                            const ok = await onReconnectUserPlatformApp(
                              sourceMountId,
                              reconnectSecret.trim(),
                            );
                            if (!ok) return;
                            setReconnectDraftMountId(null);
                            setReconnectSecret("");
                            setReconnectError(null);
                          }}
                        >
                          {isReconnecting ? "Reconnecting…" : "Confirm reconnect"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {setupEffectiveApp &&
      setupCatalogEntry &&
      isDiscoverAppPersonallyConnectable(setupCatalogEntry) ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (isSettingUpApp) return;
            closeSetupModal();
          }}
        >
          <div
            className="modal discover-connect-modal integration-setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-setup-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" id="integration-setup-modal-title">
                Set up {setupCatalogEntry.name}
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                disabled={isSettingUpApp}
                onClick={closeSetupModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body discover-connect-modal-body">
              {setupModalCopy ? (
                <div className="discover-connect-modal-copy">
                  {setupModalCopy}
                </div>
              ) : null}
              <div className="agent-capability-field-grid discover-connect-grid">
                {setupRequirements.map((requirement) =>
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
                        value={setupEndpoint}
                        onChange={(event) => {
                          setSetupEndpoint(event.target.value);
                          if (setupError) setSetupError(null);
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
                        value={setupAuthType}
                        onChange={(event) => {
                          setSetupAuthType(event.target.value as DeveloperAppAuthType);
                          setSetupSecret("");
                          if (setupError) setSetupError(null);
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
                        value={setupSecret}
                        onChange={(event) => {
                          setSetupSecret(event.target.value);
                          if (setupError) setSetupError(null);
                        }}
                        placeholder={requirement.placeholder}
                      />
                      {setupCatalogEntry.personalConnect.connectionKind === "known" &&
                      setupCatalogEntry.personalConnect.authMethod === "token" ? (
                        <a
                          className="discover-connect-help-link"
                          href={setupCatalogEntry.personalConnect.tokenHelpUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {setupCatalogEntry.personalConnect.tokenHelpLabel}
                          <span aria-hidden="true">↗</span>
                        </a>
                      ) : null}
                    </label>
                  ),
                )}
              </div>
              {setupError ? <div className="auth-error">{setupError}</div> : null}
            </div>
            <div className="modal-footer discover-connect-modal-footer">
              <button
                type="button"
                className="settings-cta"
                onClick={closeSetupModal}
                disabled={isSettingUpApp}
              >
                Cancel
              </button>
              <button
                type="button"
                className="platform-save-button is-dirty"
                onClick={() => void handleConfirmSetup()}
                disabled={isSettingUpApp}
              >
                {isSettingUpApp
                  ? isSetupOauth
                    ? "Starting…"
                    : "Setting up…"
                  : isSetupOauth
                    ? "Continue"
                    : "Set up"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M7 7h10v10H7z" />
            <path d="M4 12h3m10 0h3M12 4v3m0 10v3" />
          </svg>
          My skills
        </div>
        <div className="settings-section-desc">
          Personal reusable skills become part of your baseline runtime guidance
          for personal threads. Community lenses use the skills attached to that
          community.
        </div>
        {!session ? (
          <div className="model-note">
            Sign in to create personal skills for your workspace.
          </div>
        ) : (
          <>
            <div className="agent-capability-toolbar">
              <button
                type="button"
                onClick={session ? openDiscoverSkills : requireSignIn}
                disabled={isCreatingUserPlatformSkill}
              >
                Browse skills
              </button>
              <button
                type="button"
                onClick={() => setIsCreateSkillOpen((prev) => !prev)}
                disabled={isCreatingUserPlatformSkill}
              >
                {isCreateSkillOpen ? "Close" : "Create custom skill"}
              </button>
            </div>

            {isCreateSkillOpen ? (
              <div className="agent-capability-card community-skill-create-card">
                <div className="agent-capability-card-header">
                  <div className="agent-canvas-target-kicker">
                    Create personal skill package
                  </div>
                </div>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">Skill name</span>
                  <input
                    className="agent-editor-inline-label-input"
                    value={skillDraft.name}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Weekly research"
                  />
                </label>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    Optional description
                  </span>
                  <textarea
                    className="agent-editor-inline-prompt-input community-skill-description-input"
                    rows={3}
                    value={skillDraft.description ?? ""}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What this skill should help you do."
                  />
                </label>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    Skill instructions
                  </span>
                  <textarea
                    className="agent-editor-inline-prompt-input community-skill-instructions-input"
                    rows={10}
                    value={skillDraft.instructions_md}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        instructions_md: event.target.value,
                      }))
                    }
                    placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
                  />
                </label>

                <div className="agent-capability-toolbar">
                  <div className="model-note">
                    Personal skills are applied only when you explicitly mention
                    them, like <code>$weekly-research</code>.
                  </div>
                  <div className="agent-capability-toolbar-actions">
                    <button
                      type="button"
                      onClick={() => setIsCreateSkillOpen(false)}
                      disabled={isCreatingUserPlatformSkill}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="platform-save-button is-dirty"
                      onClick={() => void handleCreatePersonalSkill()}
                      disabled={isCreatingUserPlatformSkill}
                    >
                      {isCreatingUserPlatformSkill ? "Creating…" : "Create skill"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {userPlatformSkillError ? (
              <div className="auth-error">{userPlatformSkillError}</div>
            ) : null}
            {userPlatformSkillMutationError ? (
              <div className="auth-error">{userPlatformSkillMutationError}</div>
            ) : null}

            {isLoadingUserPlatformSkills ? (
              <div className="model-note">Loading your skills…</div>
            ) : userPlatformSkills.length === 0 ? (
              <div className="model-note">
                No personal skills yet. Browse Skills from Discover to add a
                curated skill, or create a custom one here.
              </div>
            ) : (
              <div className="agent-capability-list" role="list" aria-label="Personal skills">
                {userPlatformSkills.map((install) => {
                  const isUpdating =
                    updatingUserPlatformSkillInstallId === install.id;
                  const isRemoving =
                    removingUserPlatformSkillInstallId === install.id;
                  const isEditing =
                    editingUserPlatformSkillInstallId === install.id;
                  return (
                    <div key={install.id} className="agent-capability-card" role="listitem">
                      <div className="agent-capability-card-header">
                        <div>
                          <div className="agent-capability-card-title-row">
                            <div className="settings-section-subtitle">
                              {install.skill.name}
                            </div>
                            <span
                              className={`community-app-status-badge${
                                install.enabled ? "" : " is-muted"
                              }`}
                            >
                              {install.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="model-note">
                            ${install.skill.mentionToken}
                            {install.skill.description
                              ? ` · ${install.skill.description}`
                              : ""}
                          </div>
                        </div>
                        <div className="agent-capability-toolbar-actions">
                          <button
                            type="button"
                            disabled={isUpdating || isRemoving}
                            onClick={() => {
                              if (isEditing) {
                                setEditingUserPlatformSkillInstallId(null);
                                setEditingSkillDraft(buildInitialSkillDraft());
                                return;
                              }
                              setEditingUserPlatformSkillInstallId(install.id);
                              setEditingSkillDraft(buildSkillDraftFromInstall(install));
                            }}
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                          <label
                            className={`members-switch${
                              isUpdating || isRemoving ? " is-disabled" : ""
                            }`}
                            title={
                              install.enabled ? "Disable skill" : "Enable skill"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={install.enabled}
                              disabled={isUpdating || isRemoving}
                              aria-label={`${
                                install.enabled ? "Disable" : "Enable"
                              } ${install.skill.name}`}
                              onChange={() =>
                                void onUpdateUserPlatformSkill(install.id, {
                                  enabled: !install.enabled,
                                })
                              }
                            />
                            <span className="members-switch-track">
                              <span className="members-switch-thumb" />
                            </span>
                          </label>
                          <button
                            type="button"
                            className="danger"
                            disabled={isUpdating || isRemoving}
                            onClick={() => void onDeleteUserPlatformSkill(install.id)}
                          >
                            {isRemoving ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>

                      <div className="agent-capability-metadata">
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Scope
                          </span>
                          <span className="agent-capability-metadata-value">
                            Personal baseline
                          </span>
                        </div>
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Invocation
                          </span>
                          <span className="agent-capability-metadata-value">
                            Explicit <code>${install.skill.mentionToken}</code>
                          </span>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="agent-capability-card community-skill-create-card">
                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Skill name
                            </span>
                            <input
                              className="agent-editor-inline-label-input"
                              value={editingSkillDraft.name}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                              placeholder="Weekly research"
                            />
                          </label>

                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Optional description
                            </span>
                            <textarea
                              className="agent-editor-inline-prompt-input community-skill-description-input"
                              rows={3}
                              value={editingSkillDraft.description ?? ""}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  description: event.target.value,
                                }))
                              }
                              placeholder="What this skill should help you do."
                            />
                          </label>

                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Skill instructions
                            </span>
                            <textarea
                              className="agent-editor-inline-prompt-input community-skill-instructions-input"
                              rows={10}
                              value={editingSkillDraft.instructions_md}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  instructions_md: event.target.value,
                                }))
                              }
                              placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
                            />
                          </label>

                          <div className="agent-capability-toolbar">
                            <div className="model-note">
                              Editing this skill updates the canonical package
                              and any community attachments that use it.
                            </div>
                            <div className="agent-capability-toolbar-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserPlatformSkillInstallId(null);
                                  setEditingSkillDraft(buildInitialSkillDraft());
                                }}
                                disabled={isUpdating || isRemoving}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="platform-save-button is-dirty"
                                onClick={() => void handleSavePersonalSkill()}
                                disabled={isUpdating || isRemoving}
                              >
                                {isUpdating ? "Saving…" : "Save skill"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
