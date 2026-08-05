import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { deriveCommunitySettingsAccessPresentation } from "../../../../shared/communityAccessResolution";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { CommunitySettingsPane } from "../../../../shared/appShellNavigation";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import { StripeSetupButton } from "./StripeSetupButton";
import { WebCommunityOnboardingWorkflowSection } from "./WebCommunityOnboardingWorkflowSection";

type CommunityPricingMode = "free" | "monthly" | "annual";

type ActiveCommunity = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  one_liner: string | null;
  about: string | null;
  lifecycle_status?: "active" | "archiving" | "archived";
  lifecycle_generation?: number;
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
  isResolvingCommunityAccess: boolean;
  communityAccessLoadError: string | null;
  onRetryCommunityAccess: () => void;
  canViewActiveCommunitySettings: boolean;
  communitySettingsLayer: CommunitySettingsLayer;
  activePane: CommunitySettingsPane;
  onSelectPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  onPreviewCommunityOnboarding: () => void;
  canManageCommunitySettings: boolean;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  communityPlatformFeeBps: number | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
  lifecycle: {
    isRequesting: boolean;
    error: string | null;
    clearError: () => void;
    requestArchive: () => Promise<unknown>;
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
    handleToggleCommunityMute: (value: boolean) => Promise<void> | void;
    handleLeaveCommunity: () => Promise<void> | void;
  };
};

type SharedSettingsProps = Pick<WebCommunitySettingsSectionProps, "state" | "actions">;

const COMMUNITY_SETTINGS_PANE_LABELS: Record<CommunitySettingsPane, string> = {
  community: "Community",
  workflows: "Workflows",
  danger: "Danger",
};

function CommunityLifecycleSettingsSection({
  activeCommunity,
  lifecycle,
}: {
  activeCommunity: ActiveCommunity;
  lifecycle: WebCommunitySettingsSectionProps["lifecycle"];
}) {
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const canConfirm =
    confirmationName === activeCommunity.name &&
    !lifecycle.isRequesting;

  useEffect(() => {
    setIsConfirmingArchive(false);
    setConfirmationName("");
    lifecycle.clearError();
  }, [activeCommunity.id]);

  return (
    <div className="settings-section community-lifecycle-settings-section">
      <div className="settings-section-title">Community lifecycle</div>
      <div className="settings-section-desc">
        Archiving immediately closes this community, stops its usage and billing
        activity, and preserves its content. Restoration is not available yet.
      </div>
      <div className="community-lifecycle-settings-state">
        <span>Status</span>
        <strong>{activeCommunity.lifecycle_status ?? "active"}</strong>
      </div>
      {!isConfirmingArchive ? (
        <button
          type="button"
          className="danger archive-community-btn"
          disabled={lifecycle.isRequesting}
          onClick={() => {
            lifecycle.clearError();
            setConfirmationName("");
            setIsConfirmingArchive(true);
          }}
        >
          Archive community
        </button>
      ) : (
        <div className="community-archive-confirmation">
          <strong>Archive {activeCommunity.name}?</strong>
          <p>
            Members lose access immediately and active subscriptions and pending
            checkouts are canceled. This does not delete community content.
          </p>
          <label className="create-community-field">
            <span>Type {activeCommunity.name} to confirm</span>
            <input
              type="text"
              value={confirmationName}
              autoComplete="off"
              disabled={lifecycle.isRequesting}
              onChange={(event) => {
                setConfirmationName(event.target.value);
                lifecycle.clearError();
              }}
            />
          </label>
          <div className="community-archive-confirmation-actions">
            <button
              type="button"
              className="secondary"
              disabled={lifecycle.isRequesting}
              onClick={() => {
                lifecycle.clearError();
                setConfirmationName("");
                setIsConfirmingArchive(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger archive-community-btn"
              disabled={!canConfirm}
              onClick={() => void lifecycle.requestArchive()}
            >
              {lifecycle.isRequesting
                ? "Starting archive…"
                : "Archive community"}
            </button>
          </div>
        </div>
      )}
      {lifecycle.error ? (
        <div className="auth-error community-archive-error">
          {lifecycle.error}
        </div>
      ) : null}
    </div>
  );
}

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
        <StableFramedMedia
          className="create-community-banner-media"
          imageUrl={state.communitySettingsBannerUrl}
          frame={{
            focusX: state.communitySettingsBannerFocusX,
            focusY: state.communitySettingsBannerFocusY,
            zoom: state.communitySettingsBannerZoom,
          }}
          alt="Community banner preview"
          loading="eager"
          fetchPriority="high"
          fallback={<div className="create-community-banner-placeholder">Banner preview</div>}
        />
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
  communityPlatformFeeBps,
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
  communityPlatformFeeBps: number | null;
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
    platformFeeBpsOverride: communityPlatformFeeBps,
  });
  const canReceiveCommunityRevenue = stripeConnectPresentation.isReady;
  const canMonetizeCommunities = Number(
    communityPlatformFeeBps ?? accountCommerceStatus?.platform_fee_bps ?? 0,
  ) > 0;
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
    isResolvingCommunityAccess,
    communityAccessLoadError,
    onRetryCommunityAccess,
    canViewActiveCommunitySettings,
    communitySettingsLayer,
    activePane,
    onSelectPane,
    canManageCommunitySettings,
    requireSignIn,
    accountCommerceStatus,
    communityPlatformFeeBps,
    accountCommerceError,
    startStripeConnectOnboarding,
    isStartingStripeConnectOnboarding,
    lifecycle,
    state,
    actions,
  } = props;
  const isOwnerSettingsLayer = communitySettingsLayer === "owner";
  const managerSettingsPanes: CommunitySettingsPane[] = [
    "community",
    "workflows",
  ];
  const ownerSettingsPanes: CommunitySettingsPane[] = [
    ...managerSettingsPanes,
    "danger",
  ];
  const availableSettingsPanes = canManageCommunitySettings
    ? isOwnerSettingsLayer
      ? ownerSettingsPanes
      : managerSettingsPanes
    : [];
  const selectedSettingsPane = availableSettingsPanes.includes(activePane)
    ? activePane
    : availableSettingsPanes[0] ?? "community";
  const availableSettingsPaneKey = availableSettingsPanes.join("|");
  const accessPresentationState = deriveCommunitySettingsAccessPresentation({
    hasActiveCommunity: Boolean(activeCommunity),
    hasAuthenticatedPresentation: hasSession,
    isResolvingAccess: isResolvingCommunityAccess,
    accessLoadError: communityAccessLoadError,
    canView: canViewActiveCommunitySettings,
  });
  const resolvedActiveCommunity = activeCommunity as ActiveCommunity;

  useEffect(() => {
    if (accessPresentationState !== "allowed") return;
    if (!availableSettingsPanes.includes(activePane) && activePane !== "community") {
      onSelectPane("community", { replace: true });
    }
  }, [
    accessPresentationState,
    activePane,
    availableSettingsPaneKey,
    onSelectPane,
  ]);

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
      {accessPresentationState === "select_community" ? (
        <div className="chat-empty">Select a community to view settings.</div>
      ) : accessPresentationState === "sign_in" ? (
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
      ) : accessPresentationState === "resolving" ? (
        <div className="chat-empty">Loading community settings...</div>
      ) : accessPresentationState === "failed" ? (
        <div className="chat-empty">
          <div>{communityAccessLoadError}</div>
          <button
            className="secondary"
            type="button"
            onClick={onRetryCommunityAccess}
            style={{ marginTop: 12 }}
          >
            Retry
          </button>
        </div>
      ) : accessPresentationState === "denied" ? (
        <div className="chat-empty">You do not have access to this community's settings.</div>
      ) : !canManageCommunitySettings ? (
        <CommunityMemberSettingsSection
          activeCommunity={resolvedActiveCommunity}
          state={state}
          actions={actions}
        />
      ) : canManageCommunitySettings ? (
        <>
          <div className="create-community-form community-settings-form">
            <CommunitySettingsPaneSwitcher
              activePane={selectedSettingsPane}
              panes={availableSettingsPanes}
              onSelectPane={onSelectPane}
            />
            {selectedSettingsPane === "community" ? (
              <>
                {isOwnerSettingsLayer ? (
                  <CommunityBrandingSettingsSection
                    activeCommunity={resolvedActiveCommunity}
                    state={state}
                    actions={actions}
                  />
                ) : null}
                <CommunityProfileSettingsSection state={state} actions={actions} />
                <CommunityMonetizationConfigSection
                  activeCommunity={resolvedActiveCommunity}
                  accountCommerceStatus={accountCommerceStatus}
                  communityPlatformFeeBps={communityPlatformFeeBps}
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
            {selectedSettingsPane === "workflows" ? (
              <WebCommunityOnboardingWorkflowSection
                session={props.session}
                ensureSession={props.ensureSession}
                communityId={resolvedActiveCommunity.id}
                communityName={resolvedActiveCommunity.name}
                communityAvatarUrl={resolvedActiveCommunity.avatar_url}
                communityAvatarFocusX={resolvedActiveCommunity.avatar_focus_x}
                communityAvatarFocusY={resolvedActiveCommunity.avatar_focus_y}
                communityAvatarZoom={resolvedActiveCommunity.avatar_zoom}
                onPreview={props.onPreviewCommunityOnboarding}
              />
            ) : null}
            {selectedSettingsPane === "danger" && isOwnerSettingsLayer ? (
              <CommunityLifecycleSettingsSection
                activeCommunity={resolvedActiveCommunity}
                lifecycle={lifecycle}
              />
            ) : null}
          </div>
        </>
      ) : (
        <div className="chat-empty">Community settings are unavailable.</div>
      )}
    </div>
  );
}
