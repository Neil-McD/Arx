import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import { formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { CommunitySettingsPane } from "../../../../shared/appShellNavigation";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { usePersonalAppSetupController } from "../controllers/usePersonalAppSetupController";
import {
  isDiscoverAppPersonallyConnectable,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";
import { findDiscoverCatalogEntryForAppIdentity } from "../lib/discoverCatalogMatching";
import { buildIntegrationSurfaceRowFromCommunityMount } from "../lib/integrationSurfaceRows";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import { StripeSetupButton } from "./StripeSetupButton";
import { PersonalAppSetupModal } from "./PersonalAppSetupModal";
import type {
  DeveloperAppAuthType,
  CommunityMountedApp,
} from "../../../../shared/communityAppMountTypes";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";
import type {
  BeginUserPlatformAppOAuthOptions,
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppInput,
  ConnectUserPlatformAppResult,
} from "../../../../shared/userPlatformAppMountTypes";
import { WebCommunityOnboardingWorkflowSection } from "./WebCommunityOnboardingWorkflowSection";

type CommunityPricingMode = "free" | "monthly" | "annual";

type ActiveCommunity = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebCommunitySettingsSectionProps = {
  activeCommunity: ActiveCommunity | null;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  hasSession: boolean;
  canViewActiveCommunitySettings: boolean;
  communitySettingsLayer: CommunitySettingsLayer;
  activePane: CommunitySettingsPane;
  onSelectPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  onPreviewCommunityOnboarding: () => void;
  canManageCommunitySettings: boolean;
  canDeleteCommunity: boolean;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
  communityIntegrations: {
    mounts: CommunityMountedApp[];
    effectiveMcpApps: EffectiveMcpApp[];
    isLoading: boolean;
    isLoadingEffectiveMcpApps: boolean;
    error: string | null;
    mutationError: string | null;
    updatingMountId: string | null;
    refreshingMountId: string | null;
    removingMountId: string | null;
    onUpdateMount: (
      communityAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => Promise<boolean> | boolean;
    onRefreshApp: (communityAppMountId: string) => Promise<boolean> | boolean;
    onUnmountApp: (communityAppMountId: string) => Promise<boolean> | boolean;
    isOptingIntoApp: boolean;
    refreshingPersonalMountId: string | null;
    reconnectingPersonalMountId: string | null;
    onOptInApp: (
      input: ConnectUserPlatformAppInput,
    ) => Promise<ConnectUserPlatformAppResult>;
    onBeginPersonalAppOAuth: (
      catalogAppId: string,
      options?: BeginUserPlatformAppOAuthOptions,
    ) => Promise<BeginUserPlatformAppOAuthResult>;
    onRefreshPersonalApp: (userPlatformAppMountId: string) => Promise<boolean> | boolean;
    onReconnectPersonalApp: (
      userPlatformAppMountId: string,
      secret: string,
    ) => Promise<boolean> | boolean;
    onSetupImportedMcpApp: (
      input: SetupImportedCommunityMcpFromSettingsInput,
    ) => Promise<boolean> | boolean;
  };
  state: {
    isSettingsBannerDragOver: boolean;
    isProcessingCommunitySettingsBanner: boolean;
    isCommunityAvatarFocusModalOpen: boolean;
    isCommunityBannerFocusModalOpen: boolean;
    communitySettingsAvatarFocusX: number;
    communitySettingsAvatarFocusY: number;
    communitySettingsAvatarZoom: number;
    communitySettingsBannerUrl: string | null;
    communitySettingsBannerFocusX: number;
    communitySettingsBannerFocusY: number;
    communitySettingsBannerZoom: number;
    communitySettingsBannerUploadError: string | null;
    isSettingsAvatarDragOver: boolean;
    communitySettingsAvatarUrl: string | null;
    communitySettingsName: string;
    communitySettingsSlug: string;
    communitySettingsOneLiner: string;
    communitySettingsAbout: string;
    communitySettingsVisibility: string;
    communitySettingsPricingMode: CommunityPricingMode;
    communitySettingsPriceUsdMonthly: string;
    communitySettingsPriceUsdAnnual: string;
    isCommunitySettingsDirty: boolean;
    communitySettingsError: string | null;
    isSavingCommunitySettings: boolean;
    communityMemberMuted: boolean;
    isLoadingCommunityMemberSettings: boolean;
    isLeavingCommunity: boolean;
    communityMemberSettingsError: string | null;
  };
  actions: {
    setIsSettingsBannerDragOver: (value: boolean) => void;
    handleSettingsBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
    handleCommunityBannerUpload: (file: File | null) => Promise<void> | void;
    setCommunitySettingsBannerUrl: (value: string | null) => void;
    setCommunitySettingsBannerFocusX: (value: number) => void;
    setCommunitySettingsBannerFocusY: (value: number) => void;
    setCommunitySettingsBannerZoom: (value: number) => void;
    setCommunitySettingsBannerUploadError: (value: string | null) => void;
    openCommunityBannerFocusModal: () => void;
    closeCommunityBannerFocusModal: () => void;
    markCommunitySettingsDirty: () => void;
    setIsSettingsAvatarDragOver: (value: boolean) => void;
    handleSettingsAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
    communityInitials: (value: string) => string;
    handleCommunityAvatarUpload: (file: File | null) => Promise<void> | void;
    setCommunitySettingsAvatarUrl: (value: string | null) => void;
    setCommunitySettingsAvatarFocusX: (value: number) => void;
    setCommunitySettingsAvatarFocusY: (value: number) => void;
    setCommunitySettingsAvatarZoom: (value: number) => void;
    openCommunityAvatarFocusModal: () => void;
    closeCommunityAvatarFocusModal: () => void;
    setCommunitySettingsName: (value: string) => void;
    setCommunitySettingsSlug: (value: string) => void;
    slugifyCommunityName: (value: string) => string;
    setCommunitySettingsOneLiner: (value: string) => void;
    setCommunitySettingsAbout: (value: string) => void;
    setCommunitySettingsVisibility: (value: string) => void;
    setCommunitySettingsPricingMode: (value: CommunityPricingMode) => void;
    setCommunitySettingsPriceUsdMonthly: (value: string) => void;
    setCommunitySettingsPriceUsdAnnual: (value: string) => void;
    setCommunityPricingDirty: () => void;
    handleSaveCommunitySettings: () => Promise<void> | void;
    openDeleteCommunityModal: () => void;
    handleToggleCommunityMute: (value: boolean) => Promise<void> | void;
    handleLeaveCommunity: () => Promise<void> | void;
  };
};

type SharedSettingsProps = Pick<WebCommunitySettingsSectionProps, "state" | "actions">;

type SetupImportedCommunityMcpFromSettingsInput = {
  community_app_mount_id: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  secret?: string;
};

function buildPersonalOptInInput(args: {
  mount: CommunityMountedApp;
  catalogEntry: DiscoverAppCatalogEntry | null;
}): ConnectUserPlatformAppInput {
  const authType =
    args.mount.app.auth_type === "none" ||
    args.mount.app.auth_type === "api_key" ||
    args.mount.app.auth_type === "bearer" ||
    args.mount.app.auth_type === "oauth"
      ? args.mount.app.auth_type
      : "bearer";
  return {
    catalog_app_id:
      args.mount.app.catalog_app_id ?? args.catalogEntry?.id ?? undefined,
    name: args.mount.app.name,
    endpoint_url: args.mount.app.endpoint_url,
    auth_type: authType,
    description: args.catalogEntry?.description,
  };
}

const COMMUNITY_SETTINGS_PANE_LABELS: Record<CommunitySettingsPane, string> = {
  community: "Community",
  workflows: "Workflows",
  integrations: "Integrations",
  danger: "Danger",
};

function CommunitySettingsPaneSwitcher({
  activePane,
  panes,
  onSelectPane,
}: {
  activePane: CommunitySettingsPane;
  panes: CommunitySettingsPane[];
  onSelectPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
}) {
  const switcherStyle = buildPlatformSwitcherStyle(
    panes.length,
    Math.max(0, panes.indexOf(activePane)),
  );

  return (
    <div
      className="platform-switcher platform-switcher-compact community-settings-pane-switcher"
      role="tablist"
      aria-label="Community settings sections"
      style={switcherStyle}
    >
      {panes.map((pane) => (
        <button
          key={pane}
          type="button"
          role="tab"
          aria-selected={activePane === pane}
          className={`platform-switcher-btn${activePane === pane ? " is-active" : ""}`}
          onClick={() => {
            if (activePane !== pane) onSelectPane(pane);
          }}
        >
          {COMMUNITY_SETTINGS_PANE_LABELS[pane]}
        </button>
      ))}
    </div>
  );
}

function CommunityIntegrationsSettingsSection({
  canManage,
  hasSession,
  requireSignIn,
  integrations,
}: {
  canManage: boolean;
  hasSession: boolean;
  requireSignIn: () => void;
  integrations: WebCommunitySettingsSectionProps["communityIntegrations"];
}) {
  const [optingInMountId, setOptingInMountId] = useState<string | null>(null);
  const [optInError, setOptInError] = useState<string | null>(null);
  const personalAppSetup = usePersonalAppSetupController({
    hasSession,
    requireSignIn,
    isConnecting: integrations.isOptingIntoApp,
    refreshingPersonalMountId: integrations.refreshingPersonalMountId,
    reconnectingPersonalMountId: integrations.reconnectingPersonalMountId,
    refreshingCommunityMountId: integrations.refreshingMountId,
    onConnectApp: integrations.onOptInApp,
    onBeginOAuth: integrations.onBeginPersonalAppOAuth,
    onRefreshApp: integrations.onRefreshPersonalApp,
    onReconnectApp: integrations.onReconnectPersonalApp,
    onSetupImportedCommunityMcpApp: integrations.onSetupImportedMcpApp,
  });

  const handleOptIn = async (
    mount: CommunityMountedApp,
    catalogEntry: DiscoverAppCatalogEntry | null,
  ) => {
    setOptInError(null);
    setOptingInMountId(mount.id);
    try {
      const result = await integrations.onOptInApp(
        buildPersonalOptInInput({ mount, catalogEntry }),
      );
      if (!result.mount) {
        setOptInError(
          result.error_message ??
            `Couldn't add ${mount.app.name} to your harness right now.`,
        );
      }
    } catch {
      setOptInError(`Couldn't add ${mount.app.name} to your harness right now.`);
    } finally {
      setOptingInMountId(null);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Community integrations</div>
      <div className="settings-section-desc">
        Members can add community apps to their own harness and use their own
        credentials when an app requires authentication.
      </div>
      {integrations.error ? (
        <div className="auth-error">Couldn&apos;t load community integrations.</div>
      ) : null}
      {integrations.mutationError ? (
        <div className="auth-error">{integrations.mutationError}</div>
      ) : null}
      {optInError ? <div className="auth-error">{optInError}</div> : null}
      {integrations.isLoading && integrations.mounts.length === 0 ? (
        <div className="model-note">Loading community integrations…</div>
      ) : null}
      {!integrations.isLoading && integrations.mounts.length === 0 ? (
        <div className="model-note">
          No apps have been added to this community yet.
        </div>
      ) : null}
      {integrations.mounts.length > 0 ? (
        <div className="integrations-app-list">
          {integrations.mounts.map((mount) => {
            const catalogEntry = findDiscoverCatalogEntryForAppIdentity(
              mount.app,
            );
            const isUpdating = integrations.updatingMountId === mount.id;
            const isRefreshing = integrations.refreshingMountId === mount.id;
            const isRemoving = integrations.removingMountId === mount.id;
            const isOptingIn =
              integrations.isOptingIntoApp || optingInMountId === mount.id;
            const isBusy = isUpdating || isRefreshing || isRemoving || isOptingIn;
            const row = buildIntegrationSurfaceRowFromCommunityMount(
              mount,
              integrations.effectiveMcpApps,
              {
                canToggle: canManage,
                isBusy,
                isResolvingCanonicalState: integrations.isLoadingEffectiveMcpApps,
              },
            );
            const effectiveApp = row.effectiveApp;
            const hasPersonalMount = effectiveApp?.has_personal_mount === true;
            const canSetupCatalog = Boolean(
              catalogEntry &&
                isDiscoverAppPersonallyConnectable(catalogEntry) &&
                !effectiveApp?.live_for_current_user &&
                (row.canSetup ||
                  (!hasPersonalMount && mount.app.auth_type !== "none")),
            );
            const canSetupImported = Boolean(
              canManage &&
                mount.app.mcp_registry_id &&
                !effectiveApp?.live_for_current_user &&
                (mount.app.setup_status === "needs_auth" ||
                  mount.app.setup_status === "needs_config"),
            );
            const canSetupPersonal = canSetupCatalog || canSetupImported;
            const canAddToMyHarness = Boolean(
              !hasPersonalMount &&
                !canSetupPersonal &&
                catalogEntry &&
                isDiscoverAppPersonallyConnectable(catalogEntry),
            );
            return (
              <div key={mount.id} className="integration-mounted-row">
                <div className="integration-mounted-top">
                  <div className="integration-mounted-identity">
                    <DiscoverCatalogLogo
                      name={row.name}
                      logoUrl={row.logoUrl}
                      logoUrlDark={row.logoUrlDark}
                    />
                    <div className="integration-mounted-main">
                      <div className="integration-mounted-title-row">
                        <strong>{row.name}</strong>
                        <span
                          className={`integration-state-indicator is-${row.stateTone}`}
                        >
                          <span aria-hidden="true" />
                          {row.stateLabel}
                        </span>
                        <span className="integration-status-pill">
                          {row.toolCountLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canManage || canAddToMyHarness || canSetupPersonal ? (
                    <div className="integration-mounted-rail">
                      {canSetupPersonal ? (
                        <button
                          type="button"
                          className="settings-cta integration-mounted-setup-action"
                          onClick={() => {
                            setOptInError(null);
                            personalAppSetup.open({
                              source: mount,
                              effectiveSource: effectiveApp,
                              catalogEntry,
                            });
                          }}
                          disabled={isBusy}
                        >
                          Set up
                        </button>
                      ) : null}
                      {canManage ? (
                        <label
                          className={`members-switch integration-mounted-switch${
                            isBusy ? " is-disabled" : ""
                          }`}
                          title={mount.enabled ? "Disable app" : "Enable app"}
                        >
                          <input
                            type="checkbox"
                            checked={mount.enabled}
                            disabled={isBusy}
                            aria-label={`${mount.enabled ? "Disable" : "Enable"} ${
                              mount.app.name
                            }`}
                            onChange={() =>
                              void integrations.onUpdateMount(mount.id, {
                                enabled: !mount.enabled,
                              })
                            }
                          />
                          <span className="members-switch-track">
                            <span className="members-switch-thumb" />
                          </span>
                        </label>
                      ) : null}
                      <div className="agent-capability-toolbar-actions">
                        {canAddToMyHarness ? (
                          <button
                            type="button"
                            onClick={() => void handleOptIn(mount, catalogEntry)}
                            disabled={isBusy}
                          >
                            {isOptingIn ? "Adding…" : "Add to my harness"}
                          </button>
                        ) : null}
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void integrations.onRefreshApp(mount.id)
                              }
                              disabled={isBusy}
                            >
                              {isRefreshing ? "Refreshing…" : "Refresh"}
                            </button>
                            <button
                              type="button"
                              className="agent-onboarding-reset"
                              onClick={() =>
                                void integrations.onUnmountApp(mount.id)
                              }
                              disabled={isBusy}
                            >
                              {isRemoving ? "Removing…" : "Remove"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {personalAppSetup.modalProps ? (
        <PersonalAppSetupModal
          modalTitleId="community-integration-setup-modal-title"
          {...personalAppSetup.modalProps}
        />
      ) : null}
    </div>
  );
}

function CommunityBrandingSettingsSection({
  activeCommunity,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
}) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">Branding</div>
      <div
        className={`create-community-banner${state.isSettingsBannerDragOver ? " drag-over" : ""}`}
        aria-busy={state.isProcessingCommunitySettingsBanner || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          actions.setIsSettingsBannerDragOver(true);
        }}
        onDragLeave={() => actions.setIsSettingsBannerDragOver(false)}
        onDrop={actions.handleSettingsBannerDrop}
      >
        <div className="create-community-banner-media">
          {state.communitySettingsBannerUrl ? (
            <img
              src={state.communitySettingsBannerUrl}
              alt="Community banner preview"
              draggable={false}
              style={getCommunityBannerImageStyle({
                focusX: state.communitySettingsBannerFocusX,
                focusY: state.communitySettingsBannerFocusY,
                zoom: state.communitySettingsBannerZoom,
              })}
            />
          ) : (
            <div className="create-community-banner-placeholder">Banner preview</div>
          )}
        </div>
        <label
          className={`create-banner-btn${state.isProcessingCommunitySettingsBanner ? " disabled" : ""}`}
        >
          Upload banner
          <input
            type="file"
            accept="image/*"
            disabled={state.isProcessingCommunitySettingsBanner}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void actions.handleCommunityBannerUpload(file);
            }}
          />
        </label>
        {state.communitySettingsBannerUrl ? (
          <div className="banner-branding-actions">
            <button
              className="create-banner-btn"
              type="button"
              disabled={state.isProcessingCommunitySettingsBanner}
              onClick={actions.openCommunityBannerFocusModal}
            >
              Adjust banner
            </button>
            <button
              className="create-banner-remove"
              type="button"
              disabled={state.isProcessingCommunitySettingsBanner}
              onClick={() => {
                actions.setCommunitySettingsBannerUrl(null);
                actions.setCommunitySettingsBannerFocusX(0.5);
                actions.setCommunitySettingsBannerFocusY(0.5);
                actions.setCommunitySettingsBannerZoom(1);
                actions.setCommunitySettingsBannerUploadError(null);
                actions.closeCommunityBannerFocusModal();
                actions.markCommunitySettingsDirty();
              }}
            >
              Remove
            </button>
          </div>
        ) : null}
        {state.isProcessingCommunitySettingsBanner ? (
          <div className="create-upload-status">Processing banner…</div>
        ) : null}
        {state.communitySettingsBannerUploadError ? (
          <div className="auth-error">{state.communitySettingsBannerUploadError}</div>
        ) : null}
      </div>
      <div className="create-community-avatar-row">
        <CommunityAvatar
          className={`create-community-avatar${state.isSettingsAvatarDragOver ? " drag-over" : ""}`}
          imageUrl={state.communitySettingsAvatarUrl}
          focusX={state.communitySettingsAvatarFocusX}
          focusY={state.communitySettingsAvatarFocusY}
          zoom={state.communitySettingsAvatarZoom}
          name={state.communitySettingsName || activeCommunity?.name || "Community"}
          alt="Community avatar preview"
          fallback={actions.communityInitials(
            state.communitySettingsName || activeCommunity?.name || "Community",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            actions.setIsSettingsAvatarDragOver(true);
          }}
          onDragLeave={() => actions.setIsSettingsAvatarDragOver(false)}
          onDrop={actions.handleSettingsAvatarDrop}
        />
        <div className="create-community-avatar-actions">
          <label className="create-avatar-btn">
            Upload avatar
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void actions.handleCommunityAvatarUpload(file);
              }}
            />
          </label>
          {state.communitySettingsAvatarUrl ? (
            <>
              <button
                className="create-avatar-btn"
                type="button"
                onClick={actions.openCommunityAvatarFocusModal}
              >
                Adjust avatar
              </button>
              <button
                className="create-avatar-remove"
                type="button"
                onClick={() => {
                  actions.setCommunitySettingsAvatarUrl(null);
                  actions.setCommunitySettingsAvatarFocusX(0.5);
                  actions.setCommunitySettingsAvatarFocusY(0.5);
                  actions.setCommunitySettingsAvatarZoom(1);
                  actions.closeCommunityAvatarFocusModal();
                  actions.markCommunitySettingsDirty();
                }}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      </div>
      <label className="create-community-field">
        <span>Name</span>
        <input
          type="text"
          placeholder="Community name"
          value={state.communitySettingsName}
          onChange={(event) => {
            actions.setCommunitySettingsName(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </label>
      <label className="create-community-field">
        <span>Slug</span>
        <input
          type="text"
          placeholder="your-community"
          value={state.communitySettingsSlug}
          maxLength={32}
          onChange={(event) => {
            actions.setCommunitySettingsSlug(actions.slugifyCommunityName(event.target.value));
            actions.markCommunitySettingsDirty();
          }}
        />
        <span className="create-community-hint">
          {`/c/${state.communitySettingsSlug.trim() || "your-community"}`}
        </span>
      </label>
    </div>
  );
}

function CommunityProfileSettingsSection({ state, actions }: SharedSettingsProps) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">Profile</div>
      <label className="create-community-field">
        <span>One-liner</span>
        <textarea
          placeholder="Short one-liner for the public funnel card"
          rows={3}
          value={state.communitySettingsOneLiner}
          onChange={(event) => {
            actions.setCommunitySettingsOneLiner(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </label>
      <label className="create-community-field">
        <span>About</span>
        <textarea
          placeholder="Long-form public description for who this community is for and what members get."
          rows={6}
          value={state.communitySettingsAbout}
          onChange={(event) => {
            actions.setCommunitySettingsAbout(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </label>
    </div>
  );
}

function CommunityMonetizationConfigSection({
  activeCommunity,
  accountCommerceStatus,
  accountCommerceError,
  startStripeConnectOnboarding,
  isStartingStripeConnectOnboarding,
  canManagePublishing,
  canManagePayoutAccount,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
  canManagePublishing: boolean;
  canManagePayoutAccount: boolean;
}) {
  const pricingOptions = [
    { key: "free", label: "Free" },
    { key: "monthly", label: "Monthly" },
    { key: "annual", label: "Annual" },
  ] as Array<{ key: CommunityPricingMode; label: string }>;
  const pricingSwitcherStyle = buildPlatformSwitcherStyle(
    pricingOptions.length,
    pricingOptions.findIndex((opt) => opt.key === state.communitySettingsPricingMode),
  );
  const stripeConnectPresentation = buildStripeConnectPresentation({
    accountCommerceStatus,
    surface: "community",
  });
  const canReceiveCommunityRevenue = stripeConnectPresentation.isReady;
  const canMonetizeCommunities = Number(accountCommerceStatus?.platform_fee_bps ?? 0) > 0;
  const needsStripeConnect = !canMonetizeCommunities || !canReceiveCommunityRevenue;
  const storedStripeConnectCountry = accountCommerceStatus?.stripe_connect.country ?? null;
  const [stripeConnectCountry, setStripeConnectCountry] = useState("");
  useEffect(() => {
    if (storedStripeConnectCountry) {
      setStripeConnectCountry(storedStripeConnectCountry);
    }
  }, [storedStripeConnectCountry]);
  const selectedStripeConnectCountry = stripeConnectCountry || storedStripeConnectCountry || "";
  const stripeConnectCountryLabel = formatStripeConnectCountry(selectedStripeConnectCountry);
  const needsStripeConnectCountry = !canReceiveCommunityRevenue && !selectedStripeConnectCountry;

  return (
    <div className="settings-section">
      <div className="settings-section-title">Access & Pricing</div>
      {canManagePublishing ? (
        <label className="create-community-field">
          <span>Visibility</span>
          <select
            className="select-styled"
            value={state.communitySettingsVisibility}
            onChange={(event) => {
              actions.setCommunitySettingsVisibility(event.target.value);
              actions.markCommunitySettingsDirty();
            }}
          >
            <option value="published">Published</option>
            <option value="unlisted">Unlisted</option>
          </select>
          <span className="create-community-hint">
            {state.communitySettingsVisibility === "published"
              ? "Discoverable. Anyone can join to participate."
              : "Not listed in discovery. Share the link when you're ready."}
          </span>
        </label>
      ) : null}
      <div className="create-community-field">
        <span>Pricing</span>
        <div
          className="platform-switcher platform-switcher-compact"
          role="tablist"
          aria-label="Pricing options"
          style={pricingSwitcherStyle}
        >
          {pricingOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`platform-switcher-btn${
                state.communitySettingsPricingMode === opt.key ? " active" : ""
              }`}
              disabled={opt.key !== "free" && needsStripeConnect}
              onClick={() => {
                if (opt.key !== "free" && needsStripeConnect) return;
                actions.setCommunitySettingsPricingMode(opt.key);
                actions.setCommunityPricingDirty();
                actions.markCommunitySettingsDirty();
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="create-community-hint">
          Configure the member-facing pricing shown on your funnel and checkout.
        </span>
      </div>
      {state.communitySettingsPricingMode === "monthly" ? (
        <label className="create-community-field">
          <span>Monthly price (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="29"
            value={state.communitySettingsPriceUsdMonthly}
            disabled={needsStripeConnect}
            onChange={(event) => {
              actions.setCommunitySettingsPriceUsdMonthly(event.target.value);
              actions.setCommunityPricingDirty();
              actions.markCommunitySettingsDirty();
            }}
          />
          <span className="create-community-hint">Billed monthly.</span>
        </label>
      ) : null}
      {state.communitySettingsPricingMode === "annual" ? (
        <label className="create-community-field">
          <span>Annual price (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="290"
            value={state.communitySettingsPriceUsdAnnual}
            disabled={needsStripeConnect}
            onChange={(event) => {
              actions.setCommunitySettingsPriceUsdAnnual(event.target.value);
              actions.setCommunityPricingDirty();
              actions.markCommunitySettingsDirty();
            }}
          />
          <span className="create-community-hint">Billed annually.</span>
        </label>
      ) : null}
      {!canMonetizeCommunities ? (
        <div className="settings-section-desc" style={{ marginTop: 12 }}>
          Community monetization is not available for this account yet.
        </div>
      ) : (
        <>
          <div className="settings-section-desc" style={{ marginTop: 12 }}>
            {stripeConnectPresentation.statusMessage}
          </div>
          {canReceiveCommunityRevenue ? null : stripeConnectPresentation.requirementsPreview.length > 0 ? (
            <div className="auth-status" style={{ marginTop: 8 }}>
              Stripe still needs: {stripeConnectPresentation.requirementsPreview.join(", ")}.
            </div>
          ) : null}
          {canManagePayoutAccount ? (
            <div className="create-community-actions" style={{ marginTop: 12 }}>
              {canReceiveCommunityRevenue && stripeConnectCountryLabel ? (
                <span className="auth-status">Country: {stripeConnectCountryLabel}</span>
              ) : (
                <StripeConnectCountrySelect
                  value={selectedStripeConnectCountry}
                  disabled={isStartingStripeConnectOnboarding}
                  onChange={setStripeConnectCountry}
                  style={{ margin: 0, minWidth: 220 }}
                />
              )}
              <StripeSetupButton
                label={
                  isStartingStripeConnectOnboarding
                    ? "Opening…"
                    : stripeConnectPresentation.connectCtaLabel
                }
                onClick={() =>
                  void startStripeConnectOnboarding({
                    context: "community",
                    communitySlug: activeCommunity.slug,
                    country: selectedStripeConnectCountry || null,
                  })
                }
                disabled={isStartingStripeConnectOnboarding || needsStripeConnectCountry}
              />
            </div>
          ) : canReceiveCommunityRevenue ? null : (
            <div className="auth-status" style={{ marginTop: 8 }}>
              The community owner must finish Stripe setup before paid access can be changed.
            </div>
          )}
          {accountCommerceError ? (
            <div className="auth-error" style={{ marginTop: 10 }}>
              {accountCommerceError}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CommunityDangerZoneSection({
  state,
  actions,
}: Pick<WebCommunitySettingsSectionProps, "state"> & Pick<WebCommunitySettingsSectionProps, "actions">) {
  return (
    <div className="settings-section" style={{ marginTop: 18 }}>
      <div className="settings-section-title">Danger zone</div>
      <div className="settings-section-desc">
        Permanently delete this community and all associated data.
      </div>
      <button
        type="button"
        className="danger delete-community-btn"
        onClick={actions.openDeleteCommunityModal}
        disabled={state.isSavingCommunitySettings || state.isProcessingCommunitySettingsBanner}
      >
        Delete community
      </button>
    </div>
  );
}

function CommunityMemberSettingsSection({
  activeCommunity,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
}) {
  return (
    <div className="create-community-form community-settings-form">
      <div className="settings-section">
        <div className="settings-section-title">Member settings</div>
        <div className="settings-section-desc">
          Manage how {activeCommunity.name} behaves for your account.
        </div>
        <label className="community-member-toggle" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={state.communityMemberMuted}
            disabled={state.isLoadingCommunityMemberSettings}
            onChange={(event) => void actions.handleToggleCommunityMute(event.target.checked)}
          />
          <span className="community-member-toggle-copy">
            <strong>{state.communityMemberMuted ? "Community muted" : "Mute community"}</strong>
            <span>
              {state.communityMemberMuted
                ? "This community is muted for your account."
                : "Reduce notifications and attention markers from this community."}
            </span>
          </span>
          <span className="community-member-switch" aria-hidden="true" />
        </label>
        {state.communityMemberSettingsError ? (
          <div className="auth-error" style={{ marginTop: 12 }}>
            {state.communityMemberSettingsError}
          </div>
        ) : null}
      </div>
      <div className="settings-section" style={{ marginTop: 18 }}>
        <div className="settings-section-title">Leave community</div>
        <div className="settings-section-desc">
          Leave this community and remove your member access.
        </div>
        <button
          type="button"
          className="danger delete-community-btn"
          onClick={() => void actions.handleLeaveCommunity()}
          disabled={state.isLeavingCommunity}
        >
          {state.isLeavingCommunity ? "Leaving..." : "Leave community"}
        </button>
      </div>
    </div>
  );
}

export function WebCommunitySettingsSection(props: WebCommunitySettingsSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canViewActiveCommunitySettings,
    communitySettingsLayer,
    activePane,
    onSelectPane,
    canManageCommunitySettings,
    canDeleteCommunity,
    requireSignIn,
    accountCommerceStatus,
    accountCommerceError,
    startStripeConnectOnboarding,
    isStartingStripeConnectOnboarding,
    communityIntegrations,
    state,
    actions,
  } = props;
  const isOwnerSettingsLayer = communitySettingsLayer === "owner";
  const ownerSettingsPanes: CommunitySettingsPane[] = canDeleteCommunity
    ? ["community", "workflows", "integrations", "danger"]
    : ["community", "workflows", "integrations"];
  const availableSettingsPanes = canManageCommunitySettings ? ownerSettingsPanes : [];
  const selectedSettingsPane = availableSettingsPanes.includes(activePane)
    ? activePane
    : availableSettingsPanes[0] ?? "community";
  const availableSettingsPaneKey = availableSettingsPanes.join("|");

  useEffect(() => {
    if (availableSettingsPanes.length > 0 && !availableSettingsPanes.includes(activePane)) {
      onSelectPane(availableSettingsPanes[0]!, { replace: true });
    }
  }, [activePane, availableSettingsPaneKey, onSelectPane]);

  useEffect(() => {
    if (!state.communitySettingsAvatarUrl && state.isCommunityAvatarFocusModalOpen) {
      actions.closeCommunityAvatarFocusModal();
    }
  }, [actions, state.communitySettingsAvatarUrl, state.isCommunityAvatarFocusModalOpen]);

  useEffect(() => {
    if (!state.communitySettingsBannerUrl && state.isCommunityBannerFocusModalOpen) {
      actions.closeCommunityBannerFocusModal();
    }
  }, [actions, state.communitySettingsBannerUrl, state.isCommunityBannerFocusModalOpen]);

  return (
    <div className="settings-panel community-settings-panel">
      {!activeCommunity ? (
        <div className="chat-empty">Select a community to view settings.</div>
      ) : !hasSession ? (
        <div className="chat-empty">
          <div>Sign in to view community settings.</div>
          <button
            className="secondary"
            type="button"
            onClick={requireSignIn}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : !canViewActiveCommunitySettings ? (
        <div className="chat-empty">You do not have access to this community's settings.</div>
      ) : !canManageCommunitySettings ? (
        <CommunityMemberSettingsSection
          activeCommunity={activeCommunity}
          state={state}
          actions={actions}
        />
      ) : canManageCommunitySettings ? (
        <>
          <div className="create-community-form community-settings-form">
            <CommunitySettingsPaneSwitcher
              activePane={selectedSettingsPane}
              panes={ownerSettingsPanes}
              onSelectPane={onSelectPane}
            />
            {selectedSettingsPane === "community" ? (
              <>
                {isOwnerSettingsLayer ? (
                  <CommunityBrandingSettingsSection
                    activeCommunity={activeCommunity}
                    state={state}
                    actions={actions}
                  />
                ) : null}
                <CommunityProfileSettingsSection state={state} actions={actions} />
                <CommunityMonetizationConfigSection
                  activeCommunity={activeCommunity}
                  accountCommerceStatus={accountCommerceStatus}
                  accountCommerceError={accountCommerceError}
                  startStripeConnectOnboarding={startStripeConnectOnboarding}
                  isStartingStripeConnectOnboarding={isStartingStripeConnectOnboarding}
                  canManagePublishing={isOwnerSettingsLayer}
                  canManagePayoutAccount={isOwnerSettingsLayer}
                  state={state}
                  actions={actions}
                />
                {state.communitySettingsError && <div className="auth-error">{state.communitySettingsError}</div>}
                <div className="create-community-actions">
                  <button
                    className={`platform-save-button${
                      state.isCommunitySettingsDirty ? " is-dirty" : " is-saved"
                    }`}
                    onClick={() => void actions.handleSaveCommunitySettings()}
                    disabled={
                      state.isSavingCommunitySettings ||
                      state.isProcessingCommunitySettingsBanner ||
                      !state.isCommunitySettingsDirty
                    }
                  >
                    {state.isSavingCommunitySettings
                      ? "Saving..."
                      : state.isProcessingCommunitySettingsBanner
                        ? "Processing banner…"
                        : state.isCommunitySettingsDirty
                          ? "Save changes"
                          : "Saved"}
                  </button>
                </div>
              </>
            ) : null}
            {selectedSettingsPane === "integrations" ? (
              <CommunityIntegrationsSettingsSection
                canManage={canManageCommunitySettings}
                hasSession={hasSession}
                requireSignIn={requireSignIn}
                integrations={communityIntegrations}
              />
            ) : null}
            {selectedSettingsPane === "workflows" ? (
              <WebCommunityOnboardingWorkflowSection
                session={props.session}
                ensureSession={props.ensureSession}
                communityId={activeCommunity.id}
                communityName={activeCommunity.name}
                communityAvatarUrl={activeCommunity.avatar_url}
                communityAvatarFocusX={activeCommunity.avatar_focus_x}
                communityAvatarFocusY={activeCommunity.avatar_focus_y}
                communityAvatarZoom={activeCommunity.avatar_zoom}
                onPreview={props.onPreviewCommunityOnboarding}
              />
            ) : null}
            {selectedSettingsPane === "danger" && canDeleteCommunity ? (
              <CommunityDangerZoneSection state={state} actions={actions} />
            ) : null}
          </div>
        </>
      ) : (
        <div className="chat-empty">Community settings are unavailable.</div>
      )}
    </div>
  );
}
