import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import { hasBuilderTierPaidAccess } from "../../../../shared/builderBilling";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { BuilderBillingStatus } from "../../../../shared/builderBillingStatusGateway";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { DISCOVER_APP_CATALOG } from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import { StripeSetupButton } from "./StripeSetupButton";
import type {
  CommunityMountedApp,
  DeveloperAppAuthType,
} from "../../../../shared/communityAppMountTypes";
import {
  buildMcpAppIdentityAliases,
  mcpAppIdentitySourcesOverlap,
  type EffectiveMcpApp,
} from "../../../../shared/effectiveMcpApps";
import type { ConnectUserPlatformAppResult } from "../../../../shared/userPlatformAppMountTypes";

type CommunityPricingMode = "free" | "monthly" | "annual";

type ActiveCommunity = {
  name: string;
  slug: string;
  visibility: string;
  one_liner: string | null;
  about: string | null;
};

type WebCommunitySettingsSectionProps = {
  activeCommunity: ActiveCommunity | null;
  hasSession: boolean;
  canViewActiveCommunitySettings: boolean;
  communitySettingsLayer: CommunitySettingsLayer;
  canManageCommunitySettings: boolean;
  canDeleteCommunity: boolean;
  requireSignIn: () => void;
  builderBillingStatus: BuilderBillingStatus | null;
  builderBillingError: string | null;
  startBuilderConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void> | void;
  isStartingBuilderConnectOnboarding: boolean;
  communityIntegrations: {
    mounts: CommunityMountedApp[];
    effectiveMcpApps: EffectiveMcpApp[];
    isLoading: boolean;
    error: string | null;
    mutationError: string | null;
    updatingMountId: string | null;
    refreshingMountId: string | null;
    removingMountId: string | null;
    onBrowseCatalog: () => void;
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
    onOptInApp: (input: {
      catalog_app_id?: string;
      name: string;
      endpoint_url: string;
      auth_type: DeveloperAppAuthType;
      description?: string;
    }) => Promise<ConnectUserPlatformAppResult>;
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

function pluralizeTools(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

function toStatusLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function findCatalogEntryForCommunityMount(mount: CommunityMountedApp) {
  const byEndpoint = DISCOVER_APP_CATALOG.find((entry) => {
    if (entry.personalConnect.connectionKind !== "known") return false;
    return (
      entry.personalConnect.endpointUrl === mount.app.endpoint_url &&
      entry.personalConnect.authType === mount.app.auth_type
    );
  });
  if (byEndpoint) return byEndpoint;
  const normalizedName = mount.app.name.trim().toLowerCase();
  return (
    DISCOVER_APP_CATALOG.find(
      (entry) => entry.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

function findEffectiveMcpAppForCommunityMount(
  mount: CommunityMountedApp,
  apps: EffectiveMcpApp[],
): EffectiveMcpApp | null {
  const aliases = new Set(buildMcpAppIdentityAliases(mount));
  return (
    apps.find((app) => aliases.has(app.app_identity_key)) ??
    apps.find((app) => mcpAppIdentitySourcesOverlap(app, mount)) ??
    null
  );
}

function buildCommunityAppNotLiveLabel(mount: CommunityMountedApp): string {
  switch (mount.not_live_reason) {
    case "needs_auth":
      return "Setup needed";
    case "validation_failed":
      return "Validation failed";
    case "no_tools_discovered":
      return "No tools discovered";
    case "missing_snapshot":
      return "Missing snapshot";
    case "disabled":
      return "Disabled";
    case "unknown":
    default:
      return "Not live";
  }
}

function buildCommunityAppStateLabel(mount: CommunityMountedApp): string {
  if (!mount.enabled) return "Disabled";
  if (mount.live_status !== "live") return buildCommunityAppNotLiveLabel(mount);
  if (
    mount.app.auth_type !== "none" &&
    mount.connection.connection_status !== "connected"
  ) {
    return "Reconnect required";
  }
  if (mount.app.status !== "valid") return "Validation failed";
  if (mount.enabled_tools.length === 0) return "No tools";
  return "Live";
}

function buildCommunityRecommendationStateLabel(args: {
  mount: CommunityMountedApp;
  effectiveApp: EffectiveMcpApp | null;
}): string {
  if (!args.mount.enabled) return "Disabled";
  if (args.effectiveApp?.live_for_current_user) return "Live";
  if (args.effectiveApp?.credential_state === "needs_personal_setup") {
    return "Setup needed";
  }
  return buildCommunityAppStateLabel(args.mount);
}

function buildCommunityRecommendationStateClassName(args: {
  mount: CommunityMountedApp;
  effectiveApp: EffectiveMcpApp | null;
}): string {
  const label = buildCommunityRecommendationStateLabel(args);
  if (label === "Live") return " is-live";
  if (label === "Disabled") return " is-disabled";
  if (label === "Setup needed" || label === "Reconnect required") {
    return " is-setup";
  }
  return " is-not-live";
}

function buildCommunityRecommendationStatusLabel(args: {
  mount: CommunityMountedApp;
  effectiveApp: EffectiveMcpApp | null;
}): string {
  if (args.effectiveApp?.live_for_current_user) {
    return `${pluralizeTools(args.effectiveApp.effective_tool_count)} active`;
  }
  const stateLabel = buildCommunityRecommendationStateLabel(args);
  const toolCount =
    args.effectiveApp?.effective_tool_count ?? args.mount.enabled_tools.length;
  if (stateLabel === "Disabled") return `Disabled · ${pluralizeTools(toolCount)}`;
  return `${stateLabel} · ${pluralizeTools(toolCount)}`;
}

function buildCommunityRecommendationDetail(args: {
  mount: CommunityMountedApp;
  effectiveApp: EffectiveMcpApp | null;
}): string {
  if (args.effectiveApp?.live_for_current_user) {
    return `${pluralizeTools(args.effectiveApp.effective_tool_count)} available through your personal harness for this community.`;
  }
  if (args.effectiveApp?.credential_state === "needs_personal_setup") {
    return `${args.mount.app.name} is recommended by this community. Connect it in your personal harness to use its tools.`;
  }
  return `Recommended by this community. Auth ${toStatusLabel(args.mount.app.auth_type)} · Connection ${toStatusLabel(args.mount.connection.connection_status)} · Validation ${toStatusLabel(args.mount.app.status)}`;
}

function buildPersonalOptInInput(args: {
  mount: CommunityMountedApp;
  catalogEntry: ReturnType<typeof findCatalogEntryForCommunityMount>;
}): {
  catalog_app_id?: string;
  name: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  description?: string;
} {
  const authType =
    args.mount.app.auth_type === "none" ||
    args.mount.app.auth_type === "api_key" ||
    args.mount.app.auth_type === "bearer"
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

function CommunityPersonalSettingsSection({
  state,
  actions,
  canLeaveCommunity,
  title = "Personal",
  description,
}: SharedSettingsProps & {
  canLeaveCommunity: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {description ? <div className="settings-section-desc">{description}</div> : null}
      <div className="model-list">
        <label className="model-toggle">
          <span>Mute community</span>
          <input
            type="checkbox"
            checked={state.communityMemberMuted}
            disabled={state.isLoadingCommunityMemberSettings || state.isLeavingCommunity}
            onChange={(event) => void actions.handleToggleCommunityMute(event.target.checked)}
          />
        </label>
      </div>
      <div className="model-note">
        Muted communities won't send notifications (when notifications ship).
      </div>
      {canLeaveCommunity ? (
        <div className="create-community-actions" style={{ marginTop: 12 }}>
          <button
            className="danger"
            type="button"
            disabled={state.isLeavingCommunity || state.isLoadingCommunityMemberSettings}
            onClick={() => void actions.handleLeaveCommunity()}
          >
            {state.isLeavingCommunity ? "Leaving…" : "Leave community"}
          </button>
        </div>
      ) : null}
      {state.communityMemberSettingsError ? (
        <div className="auth-error" style={{ marginTop: 10 }}>
          {state.communityMemberSettingsError}
        </div>
      ) : null}
    </div>
  );
}

function CommunityIntegrationsSettingsSection({
  canManage,
  integrations,
}: {
  canManage: boolean;
  integrations: WebCommunitySettingsSectionProps["communityIntegrations"];
}) {
  const [optingInMountId, setOptingInMountId] = useState<string | null>(null);
  const [optInError, setOptInError] = useState<string | null>(null);

  const handleOptIn = async (
    mount: CommunityMountedApp,
    catalogEntry: ReturnType<typeof findCatalogEntryForCommunityMount>,
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
        Members can add recommended apps to their own harness and use their own
        credentials when an app requires authentication.
      </div>
      {canManage ? (
        <div className="agent-capability-toolbar">
          <button
            type="button"
            className="settings-cta"
            onClick={integrations.onBrowseCatalog}
          >
            Browse apps
          </button>
        </div>
      ) : null}
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
          No apps are recommended for this community yet.
        </div>
      ) : null}
      {integrations.mounts.length > 0 ? (
        <div className="integrations-app-list">
          {integrations.mounts.map((mount) => {
            const catalogEntry = findCatalogEntryForCommunityMount(mount);
            const effectiveApp = findEffectiveMcpAppForCommunityMount(
              mount,
              integrations.effectiveMcpApps,
            );
            const enabledToolNames = mount.tools
              .filter((tool) => tool.enabled)
              .map((tool) => tool.tool_name);
            const isUpdating = integrations.updatingMountId === mount.id;
            const isRefreshing = integrations.refreshingMountId === mount.id;
            const isRemoving = integrations.removingMountId === mount.id;
            const isOptingIn =
              integrations.isOptingIntoApp || optingInMountId === mount.id;
            const isBusy = isUpdating || isRefreshing || isRemoving || isOptingIn;
            const hasPersonalMount = effectiveApp?.has_personal_mount === true;
            const stateLabel = buildCommunityRecommendationStateLabel({
              mount,
              effectiveApp,
            });
            const statusLabel = buildCommunityRecommendationStatusLabel({
              mount,
              effectiveApp,
            });
            return (
              <div key={mount.id} className="integration-mounted-row">
                <div className="integration-mounted-top">
                  <div className="integration-mounted-identity">
                    <DiscoverCatalogLogo
                      name={mount.app.name}
                      logoUrl={catalogEntry?.logoUrl}
                      logoUrlDark={catalogEntry?.logoUrlDark}
                    />
                    <div className="integration-mounted-main">
                      <div className="integration-mounted-title-row">
                        <strong>{mount.app.name}</strong>
                        <span
                          className={`integration-state-indicator${buildCommunityRecommendationStateClassName({
                            mount,
                            effectiveApp,
                          })}`}
                        >
                          <span aria-hidden="true" />
                          {stateLabel}
                        </span>
                        <span className="integration-status-pill">
                          {statusLabel}
                        </span>
                        <span className="integration-status-pill">
                          Recommended by community
                        </span>
                      </div>
                      <div className="integration-mounted-meta">
                        {mount.app.endpoint_url}
                      </div>
                      <div className="integration-mounted-detail">
                        {buildCommunityRecommendationDetail({
                          mount,
                          effectiveApp,
                        })}
                      </div>
                    </div>
                  </div>
                  {canManage || !hasPersonalMount ? (
                  <div className="integration-mounted-rail">
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
                      {!hasPersonalMount ? (
                        <button
                          type="button"
                          onClick={() => void handleOptIn(mount, catalogEntry)}
                          disabled={isBusy}
                        >
                          {isOptingIn ? "Adding…" : "Like"}
                        </button>
                      ) : null}
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void integrations.onRefreshApp(mount.id)}
                            disabled={isBusy}
                          >
                            {isRefreshing ? "Refreshing…" : "Refresh"}
                          </button>
                          <button
                            type="button"
                            className="agent-onboarding-reset"
                            onClick={() => void integrations.onUnmountApp(mount.id)}
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
                {mount.tools.length > 0 ? (
                  <div className="community-app-tool-list" role="list">
                    {mount.tools.map((tool) => {
                      const nextEnabledTools = tool.enabled
                        ? enabledToolNames.filter(
                            (toolName) => toolName !== tool.tool_name,
                          )
                        : [...enabledToolNames, tool.tool_name];
                      return (
                        <label
                          key={tool.namespaced_tool_name}
                          className="community-app-tool-row"
                          role="listitem"
                        >
                          <input
                            type="checkbox"
                            checked={tool.enabled}
                            disabled={!canManage || isBusy}
                            onChange={() =>
                              void integrations.onUpdateMount(mount.id, {
                                enabledTools: nextEnabledTools,
                              })
                            }
                          />
                          <div className="community-app-tool-copy">
                            <div className="community-app-tool-title-row">
                              <span className="community-app-tool-name">
                                {tool.tool_name}
                              </span>
                              <span className="community-app-tool-risk">
                                {toStatusLabel(tool.risk_level)}
                              </span>
                            </div>
                            {tool.description ? (
                              <div className="model-note">{tool.description}</div>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="model-note">
                    No tools have been discovered for this community attachment
                    yet.
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
  builderBillingStatus,
  builderBillingError,
  startBuilderConnectOnboarding,
  isStartingBuilderConnectOnboarding,
  canManagePublishing,
  canManagePayoutAccount,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
  builderBillingStatus: BuilderBillingStatus | null;
  builderBillingError: string | null;
  startBuilderConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void> | void;
  isStartingBuilderConnectOnboarding: boolean;
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
  const builderTier = builderBillingStatus?.builder_tier ?? "free";
  const stripeConnectPresentation = buildStripeConnectPresentation({
    builderBillingStatus,
    surface: "community",
  });
  const canAcceptCharges = stripeConnectPresentation.isReady;
  const needsStripeConnect = !hasBuilderTierPaidAccess(builderTier) || !canAcceptCharges;

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
      {!hasBuilderTierPaidAccess(builderTier) ? (
        <div className="settings-section-desc" style={{ marginTop: 12 }}>
          A paid creator plan is required before this community can charge for access.
        </div>
      ) : (
        <>
          <div className="settings-section-desc" style={{ marginTop: 12 }}>
            {stripeConnectPresentation.statusMessage}
          </div>
          {canAcceptCharges ? null : stripeConnectPresentation.requirementsPreview.length > 0 ? (
            <div className="auth-status" style={{ marginTop: 8 }}>
              Stripe still needs: {stripeConnectPresentation.requirementsPreview.join(", ")}.
            </div>
          ) : null}
          {canManagePayoutAccount ? (
            <div className="create-community-actions" style={{ marginTop: 12 }}>
              <StripeSetupButton
                label={
                  isStartingBuilderConnectOnboarding
                    ? "Opening…"
                    : stripeConnectPresentation.connectCtaLabel
                }
                onClick={() =>
                  void startBuilderConnectOnboarding({
                    context: "community",
                    communitySlug: activeCommunity.slug,
                  })
                }
                disabled={isStartingBuilderConnectOnboarding}
              />
            </div>
          ) : canAcceptCharges ? null : (
            <div className="auth-status" style={{ marginTop: 8 }}>
              The community owner must finish Stripe setup before paid access can be changed.
            </div>
          )}
          {builderBillingError ? (
            <div className="auth-error" style={{ marginTop: 10 }}>
              {builderBillingError}
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

export function WebCommunitySettingsSection(props: WebCommunitySettingsSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canViewActiveCommunitySettings,
    communitySettingsLayer,
    canManageCommunitySettings,
    canDeleteCommunity,
    requireSignIn,
    builderBillingStatus,
    builderBillingError,
    startBuilderConnectOnboarding,
    isStartingBuilderConnectOnboarding,
    communityIntegrations,
    state,
    actions,
  } = props;
  const isMemberSettingsLayer = communitySettingsLayer === "member";
  const isOwnerSettingsLayer = communitySettingsLayer === "owner";
  const canLeaveCommunity = communitySettingsLayer !== "owner";

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
        <div className="chat-empty">Join this community to view settings.</div>
      ) : canManageCommunitySettings ? (
        <>
          <div className="create-community-form community-settings-form">
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
              builderBillingStatus={builderBillingStatus}
              builderBillingError={builderBillingError}
              startBuilderConnectOnboarding={startBuilderConnectOnboarding}
              isStartingBuilderConnectOnboarding={isStartingBuilderConnectOnboarding}
              canManagePublishing={isOwnerSettingsLayer}
              canManagePayoutAccount={isOwnerSettingsLayer}
              state={state}
              actions={actions}
            />
            <CommunityIntegrationsSettingsSection
              canManage={canManageCommunitySettings}
              integrations={communityIntegrations}
            />
            <CommunityPersonalSettingsSection
              state={state}
              actions={actions}
              canLeaveCommunity={canLeaveCommunity}
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
            {canDeleteCommunity ? <CommunityDangerZoneSection state={state} actions={actions} /> : null}
          </div>
        </>
      ) : isMemberSettingsLayer ? (
        <>
          <div className="create-community-form community-settings-form">
            <CommunityIntegrationsSettingsSection
              canManage={false}
              integrations={communityIntegrations}
            />
            <CommunityPersonalSettingsSection
              state={state}
              actions={actions}
              canLeaveCommunity={canLeaveCommunity}
              title="Personal settings"
              description="Manage your relationship with this community."
            />
          </div>
        </>
      ) : (
        <div className="chat-empty">Community settings are unavailable.</div>
      )}
    </div>
  );
}
