import { useEffect, useState, type ComponentProps } from "react";
import type { DragEvent } from "react";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { deriveCommunitySettingsAccessPresentation } from "../../../../shared/communityAccessResolution";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  listCommunitySettingsPanesForAccess,
  normalizeCommunitySettingsPaneForAccess,
  type CommunitySettingsPane,
} from "../../../../shared/appShellNavigation";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import { StripeSetupButton } from "./StripeSetupButton";
import { WebCommunityOnboardingWorkflowSection } from "./WebCommunityOnboardingWorkflowSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import {
  platformTabId,
  platformTabPanelId,
  WebPlatformRadioGroup,
  WebPlatformTabList,
} from "./WebPlatformChoiceControls";

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
  isResolvingCommunityAccess: boolean;
  communityAccessLoadError: string | null;
  onRetryCommunityAccess: () => void;
  canViewActiveCommunitySettings: boolean;
  communitySettingsLayer: CommunitySettingsLayer;
  activePane: CommunitySettingsPane;
  onSelectPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  onPreviewCommunityOnboarding: () => void;
  canManageCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  aiAgentProps: ComponentProps<typeof WebCommunityAiAgentSection>;
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
    isLoadingCommunitySettings: boolean;
    isCommunitySettingsReady: boolean;
    communitySettingsConflict: boolean;
    communitySettingsError: string | null;
    isSavingCommunitySettings: boolean;
    communityMemberMuted: boolean;
    isLoadingCommunityMemberSettings: boolean;
    isLeavingCommunity: boolean;
    communityMemberSettingsError: string | null;
    isArchivingCommunity: boolean;
    communityArchiveError: string | null;
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
    handleCancelCommunitySettings: () => void;
    handleReloadLatestCommunitySettings: () => Promise<void> | void;
    handleSaveCommunitySettings: () => Promise<void> | void;
    handleToggleCommunityMute: (value: boolean) => Promise<void> | void;
    handleLeaveCommunity: () => Promise<void> | void;
    handleArchiveCommunity: () => Promise<void> | void;
  };
};

type SharedSettingsProps = Pick<WebCommunitySettingsSectionProps, "state" | "actions">;

const COMMUNITY_SETTINGS_PANE_LABELS: Record<CommunitySettingsPane, string> = {
  community: "General",
  workflows: "Workflows",
  agent: "Agent",
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
  const tabs = panes.map((pane) => ({
    id: pane,
    label: COMMUNITY_SETTINGS_PANE_LABELS[pane],
  }));

  return (
    <WebPlatformTabList
      tabs={tabs}
      activeTab={activePane}
      onSelectTab={(pane, { source }) => {
        if (activePane !== pane) {
          onSelectPane(pane, source === "keyboard" ? { replace: true } : undefined);
        }
      }}
      idPrefix="community-settings"
      ariaLabel="Community settings sections"
      className="platform-switcher platform-switcher-compact community-settings-pane-switcher"
      style={switcherStyle}
    />
  );
}

function CommunityDangerSettingsSection({
  activeCommunity,
  state,
  actions,
}: SharedSettingsProps & { activeCommunity: ActiveCommunity }) {
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);

  useEffect(() => {
    setIsConfirmingArchive(false);
  }, [activeCommunity.id]);

  return (
    <div className="settings-section">
      <div className="settings-section-title">Archive community</div>
      <div className="settings-section-desc">
        Archive freezes this community, removes member access, and stops its active
        subscriptions. Its content and settings are preserved. Restoring it later
        requires Builder at $79/month.
      </div>
      {state.communityArchiveError ? (
        <div className="auth-error">{state.communityArchiveError}</div>
      ) : null}
      {isConfirmingArchive ? (
        <div className="auth-actions">
          <button
            className="secondary"
            type="button"
            disabled={state.isArchivingCommunity}
            onClick={() => setIsConfirmingArchive(false)}
          >
            Cancel
          </button>
          <button
            className="danger"
            type="button"
            disabled={state.isArchivingCommunity}
            onClick={() => void actions.handleArchiveCommunity()}
          >
            {state.isArchivingCommunity ? "Archiving…" : "Confirm archive"}
          </button>
        </div>
      ) : (
        <button
          className="settings-primary-action"
          type="button"
          disabled={state.isArchivingCommunity}
          onClick={() => setIsConfirmingArchive(true)}
        >
          Archive community
        </button>
      )}
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
    <div className="settings-section community-settings-identity-section">
      <div className="settings-section-title">Identity &amp; Media</div>
      <div
        className={`create-community-banner community-settings-banner${state.isSettingsBannerDragOver ? " drag-over" : ""}`}
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
          Change banner
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
      <div className="community-settings-identity-row">
        <div className="create-community-avatar-row community-settings-avatar-block">
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
              Change avatar
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
                  Adjust
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
        <div className="community-settings-identity-fields">
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
      </div>
    </div>
  );
}

function CommunityProfileSettingsSection({ state, actions }: SharedSettingsProps) {
  return (
    <div className="settings-section community-settings-profile-section">
      <div className="settings-section-title">Public Profile</div>
      <label className="create-community-field">
        <span>One-liner</span>
        <textarea
          placeholder="Short one-liner for the public funnel card"
          rows={2}
          className="community-profile-one-liner"
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
          rows={4}
          className="community-profile-about"
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
  const platformFeePercent = Number(
    communityPlatformFeeBps ?? accountCommerceStatus?.platform_fee_bps ?? 0,
  ) / 100;
  const canMonetizeCommunities = platformFeePercent > 0;
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
    <div className="settings-section community-settings-access-section">
      <div className="settings-section-title">Access & Pricing</div>
      <div className="community-settings-access-controls">
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
                ? "Listed in Discover. Membership is still required."
                : "Hidden from Discover. Share its direct link."}
            </span>
          </label>
        ) : null}
        <div className="create-community-field">
          <span>Pricing</span>
          <WebPlatformRadioGroup
            options={pricingOptions.map((opt) => ({
              id: opt.key,
              label: opt.label,
              disabled: opt.key !== "free" && needsStripeConnect,
            }))}
            value={state.communitySettingsPricingMode}
            onSelectValue={(value) => {
              actions.setCommunitySettingsPricingMode(value);
              actions.markCommunitySettingsDirty();
            }}
            ariaLabel="Pricing options"
            className="platform-switcher platform-switcher-compact"
            style={pricingSwitcherStyle}
          />
          <span className="create-community-hint">Shown on your funnel and checkout.</span>
        </div>
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
      ) : canReceiveCommunityRevenue ? (
        canManagePayoutAccount ? (
          <div className="community-settings-payout-summary">
            <span className="auth-status">
              Stripe connected{stripeConnectCountryLabel ? ` · ${stripeConnectCountryLabel}` : ""}.
              {` Paid memberships: ${platformFeePercent.toFixed(1)}% Polynet fee, plus Stripe fees.`}
            </span>
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
              disabled={isStartingStripeConnectOnboarding}
            />
          </div>
        ) : null
      ) : (
        <>
          <div className="settings-section-desc community-settings-payout-message">
            {stripeConnectPresentation.statusMessage}
          </div>
          {stripeConnectPresentation.requirementsPreview.length > 0 ? (
            <div className="auth-status" style={{ marginTop: 8 }}>
              Stripe still needs: {stripeConnectPresentation.requirementsPreview.join(", ")}.
            </div>
          ) : null}
          {canManagePayoutAccount ? (
            <div className="create-community-actions" style={{ marginTop: 12 }}>
              <StripeConnectCountrySelect
                value={selectedStripeConnectCountry}
                disabled={isStartingStripeConnectOnboarding}
                onChange={setStripeConnectCountry}
                style={{ margin: 0, minWidth: 220 }}
              />
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
          ) : (
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
    canManageMembersActiveCommunity,
    aiAgentProps,
    requireSignIn,
    accountCommerceStatus,
    communityPlatformFeeBps,
    accountCommerceError,
    startStripeConnectOnboarding,
    isStartingStripeConnectOnboarding,
    state,
    actions,
  } = props;
  const isOwnerSettingsLayer = communitySettingsLayer === "owner";
  const settingsPaneAccess = {
    canViewSettings: canViewActiveCommunitySettings,
    canManageSettings: canManageCommunitySettings,
    canManageMembers: canManageMembersActiveCommunity,
    isOwner: isOwnerSettingsLayer,
  };
  const availableSettingsPanes = listCommunitySettingsPanesForAccess(settingsPaneAccess);
  const selectedSettingsPane = normalizeCommunitySettingsPaneForAccess(
    activePane,
    settingsPaneAccess,
  );
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
            <div
              id={platformTabPanelId("community-settings", selectedSettingsPane)}
              role="tabpanel"
              aria-labelledby={platformTabId("community-settings", selectedSettingsPane)}
              tabIndex={0}
              className="community-settings-pane-content"
            >
              {selectedSettingsPane === "community" && state.isLoadingCommunitySettings ? (
              <div className="chat-empty">Loading community settings...</div>
              ) : null}
              {selectedSettingsPane === "community" &&
              !state.isLoadingCommunitySettings &&
              !state.isCommunitySettingsReady ? (
                <div className="chat-empty">
                  <div>{state.communitySettingsError ?? "Community settings are unavailable."}</div>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void actions.handleReloadLatestCommunitySettings()}
                    style={{ marginTop: 12 }}
                  >
                    Try again
                  </button>
                </div>
              ) : null}
              {selectedSettingsPane === "community" &&
              !state.isLoadingCommunitySettings &&
              state.isCommunitySettingsReady ? (
              <div className="community-general-settings">
                <div
                  className={`community-general-settings-grid${isOwnerSettingsLayer ? "" : " without-branding"}`}
                >
                  {isOwnerSettingsLayer ? (
                    <CommunityBrandingSettingsSection
                      activeCommunity={resolvedActiveCommunity}
                      state={state}
                      actions={actions}
                    />
                  ) : null}
                  <div className="community-general-settings-secondary">
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
                  </div>
                </div>
                {state.communitySettingsError ? (
                  <div className="auth-error">
                    {state.communitySettingsError}
                    {state.communitySettingsConflict ? (
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void actions.handleReloadLatestCommunitySettings()}
                        disabled={state.isLoadingCommunitySettings}
                        style={{ marginLeft: 12 }}
                      >
                        Reload latest
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="create-community-actions community-general-settings-save">
                  <span className="community-general-settings-status" aria-live="polite">
                    {state.isSavingCommunitySettings
                      ? "Saving changes…"
                      : state.isCommunitySettingsDirty
                        ? "Unsaved changes"
                        : "All changes saved"}
                  </span>
                  {state.isCommunitySettingsDirty ||
                  state.isSavingCommunitySettings ||
                  state.isProcessingCommunitySettingsBanner ? (
                    <div className="community-general-settings-actions">
                      <button
                        className="community-general-settings-cancel"
                        type="button"
                        onClick={actions.handleCancelCommunitySettings}
                        disabled={
                          state.isSavingCommunitySettings ||
                          state.isProcessingCommunitySettingsBanner ||
                          state.communitySettingsConflict ||
                          !state.isCommunitySettingsDirty
                        }
                      >
                        Cancel
                      </button>
                      <button
                        className="platform-save-button is-dirty"
                        type="button"
                        onClick={() => void actions.handleSaveCommunitySettings()}
                        disabled={
                          state.isSavingCommunitySettings ||
                          state.isProcessingCommunitySettingsBanner ||
                          state.communitySettingsConflict ||
                          !state.isCommunitySettingsDirty
                        }
                      >
                        {state.isSavingCommunitySettings
                          ? "Saving..."
                          : state.isProcessingCommunitySettingsBanner
                            ? "Processing banner…"
                            : "Save changes"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
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
              {selectedSettingsPane === "agent" ? (
              <WebCommunityAiAgentSection {...aiAgentProps} embedded />
              ) : null}
              {selectedSettingsPane === "danger" && isOwnerSettingsLayer ? (
              <CommunityDangerSettingsSection
                activeCommunity={resolvedActiveCommunity}
                state={state}
                actions={actions}
              />
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="chat-empty">Community settings are unavailable.</div>
      )}
    </div>
  );
}
