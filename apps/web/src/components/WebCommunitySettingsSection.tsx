import { useEffect } from "react";
import type { DragEvent } from "react";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";

type CommunityPricingMode = "free" | "monthly" | "yearly" | "both";

type ActiveCommunity = {
  name: string;
  slug: string;
  visibility: string;
  description: string | null;
};

type ActiveCommunityAccess = {
  effective_role?: string | null;
  entitlement_ends_at?: string | null;
  is_owner?: boolean;
} | null;

type BuilderBillingStatus = {
  has_payouts?: boolean | null;
} | null;

type WebCommunitySettingsSectionProps = {
  activeCommunity: ActiveCommunity | null;
  hasSession: boolean;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  isActiveCommunityOwner: boolean;
  openAuthGate: () => void;
  state: {
    isSettingsBannerDragOver: boolean;
    isProcessingCommunitySettingsBanner: boolean;
    isCommunityBannerFocusModalOpen: boolean;
    communitySettingsBannerUrl: string | null;
    communitySettingsBannerFocusX: number;
    communitySettingsBannerFocusY: number;
    communitySettingsBannerZoom: number;
    communitySettingsBannerUploadError: string | null;
    isSettingsAvatarDragOver: boolean;
    communitySettingsAvatarUrl: string | null;
    communitySettingsName: string;
    communitySettingsSlug: string;
    communitySettingsDescription: string;
    communitySettingsVisibility: string;
    communitySettingsPricingMode: CommunityPricingMode;
    communitySettingsPriceUsdMonthly: string;
    communitySettingsPriceUsdYearly: string;
    builderBillingStatus: BuilderBillingStatus;
    isStartingConnectOnboarding: boolean;
    communitySettingsError: string | null;
    isSavingCommunitySettings: boolean;
    activeCommunityAccess: ActiveCommunityAccess;
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
    setCommunitySettingsName: (value: string) => void;
    setCommunitySettingsSlug: (value: string) => void;
    slugifyCommunityName: (value: string) => string;
    setCommunitySettingsDescription: (value: string) => void;
    setCommunitySettingsVisibility: (value: string) => void;
    setCommunitySettingsPricingMode: (value: CommunityPricingMode) => void;
    setCommunitySettingsPriceUsdMonthly: (value: string) => void;
    setCommunitySettingsPriceUsdYearly: (value: string) => void;
    setCommunityPricingDirty: () => void;
    startConnectOnboarding: () => Promise<void> | void;
    handleSaveCommunitySettings: () => Promise<void> | void;
    openDeleteCommunityModal: () => void;
    formatChatTime: (value: string) => string;
    formatCommunityVisibilityLabel: (value: string) => string;
    handleToggleCommunityMute: (value: boolean) => Promise<void> | void;
    handleLeaveCommunity: () => Promise<void> | void;
  };
};

export function WebCommunitySettingsSection(props: WebCommunitySettingsSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canViewActiveCommunitySettings,
    canManageMembersActiveCommunity,
    isActiveCommunityOwner,
    openAuthGate,
    state,
    actions,
  } = props;

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
            onClick={openAuthGate}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : !canViewActiveCommunitySettings ? (
        <div className="chat-empty">Join this community to view settings.</div>
      ) : canManageMembersActiveCommunity ? (
        <>
          <div className="create-community-form community-settings-form">
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
                {state.communitySettingsBannerUrl && (
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
                )}
                {state.isProcessingCommunitySettingsBanner && (
                  <div className="create-upload-status">Processing banner…</div>
                )}
                {state.communitySettingsBannerUploadError && (
                  <div className="auth-error">{state.communitySettingsBannerUploadError}</div>
                )}
              </div>
              <div className="create-community-avatar-row">
                <div
                  className={`create-community-avatar${state.isSettingsAvatarDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    actions.setIsSettingsAvatarDragOver(true);
                  }}
                  onDragLeave={() => actions.setIsSettingsAvatarDragOver(false)}
                  onDrop={actions.handleSettingsAvatarDrop}
                >
                  {state.communitySettingsAvatarUrl ? (
                    <img src={state.communitySettingsAvatarUrl} alt="Community avatar preview" />
                  ) : (
                    <span>
                      {actions.communityInitials(
                        state.communitySettingsName || activeCommunity?.name || "Community",
                      )}
                    </span>
                  )}
                </div>
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
                  {state.communitySettingsAvatarUrl && (
                    <button
                      className="create-avatar-remove"
                      type="button"
                      onClick={() => {
                        actions.setCommunitySettingsAvatarUrl(null);
                        actions.markCommunitySettingsDirty();
                      }}
                    >
                      Remove
                    </button>
                  )}
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
                  {`arx.com/c/${state.communitySettingsSlug.trim() || "your-community"}`}
                </span>
              </label>
            </div>

            <div className="settings-section">
              <label className="create-community-field">
                <span>Description</span>
                <textarea
                  placeholder="Optional description for your community page"
                  rows={3}
                  value={state.communitySettingsDescription}
                  onChange={(event) => {
                    actions.setCommunitySettingsDescription(event.target.value);
                    actions.markCommunitySettingsDirty();
                  }}
                />
              </label>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">Access</div>
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
                    ? "Discoverable. Anyone can preview chat and join to participate."
                    : "Not listed in discovery. Share the link when you're ready."}
                </span>
              </label>
              <div className="create-community-field">
                <span>Pricing</span>
                <div className="analytics-range-toggle" role="tablist" aria-label="Pricing options">
                  {(
                    [
                      { key: "free", label: "Free" },
                      { key: "monthly", label: "Monthly" },
                      { key: "yearly", label: "Annual" },
                      { key: "both", label: "Both" },
                    ] as Array<{ key: CommunityPricingMode; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`analytics-range-btn${
                        state.communitySettingsPricingMode === opt.key ? " active" : ""
                      }`}
                      onClick={() => {
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
                  Choose what billing options members see at checkout.
                </span>
              </div>
              {(state.communitySettingsPricingMode === "monthly" ||
                state.communitySettingsPricingMode === "both") && (
                <label className="create-community-field">
                  <span>Monthly price (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="29"
                    value={state.communitySettingsPriceUsdMonthly}
                    onChange={(event) => {
                      actions.setCommunitySettingsPriceUsdMonthly(event.target.value);
                      actions.setCommunityPricingDirty();
                      actions.markCommunitySettingsDirty();
                    }}
                  />
                  <span className="create-community-hint">Billed monthly.</span>
                </label>
              )}
              {(state.communitySettingsPricingMode === "yearly" ||
                state.communitySettingsPricingMode === "both") && (
                <label className="create-community-field">
                  <span>Annual price (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="290"
                    value={state.communitySettingsPriceUsdYearly}
                    onChange={(event) => {
                      actions.setCommunitySettingsPriceUsdYearly(event.target.value);
                      actions.setCommunityPricingDirty();
                      actions.markCommunitySettingsDirty();
                    }}
                  />
                  <span className="create-community-hint">Billed yearly.</span>
                </label>
              )}
              <div className="create-community-field">
                <span>Payouts</span>
                <div className="auth-actions" style={{ paddingLeft: 0 }}>
                  {state.builderBillingStatus?.has_payouts ? (
                    <button type="button" className="secondary" disabled>
                      Payouts connected
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void actions.startConnectOnboarding()}
                      disabled={state.isStartingConnectOnboarding}
                      className="stripe-connect-btn"
                    >
                      <svg
                        className="stripe-connect-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect x="2" y="2" width="20" height="20" rx="6" fill="#635BFF" />
                        <path
                          fill="#FFFFFF"
                          d="M14.85 9.14c-.84-.44-1.82-.66-2.78-.66-1.44 0-2.24.54-2.24 1.25 0 .78.84 1.12 2.35 1.46 2.2.5 3.34 1.24 3.34 2.9 0 1.76-1.5 2.95-4.03 2.95-1.38 0-2.66-.34-3.64-.93l.66-1.56c.98.58 2.04.88 3.06.88 1.5 0 2.34-.54 2.34-1.37 0-.78-.74-1.16-2.36-1.52-2.18-.5-3.33-1.24-3.33-2.87 0-1.66 1.5-2.87 3.9-2.87 1.3 0 2.5.28 3.48.74l-.7 1.6z"
                        />
                      </svg>
                      <span>{state.isStartingConnectOnboarding ? "Opening…" : "Connect with Stripe"}</span>
                    </button>
                  )}
                </div>
                <span className="create-community-hint">
                  Connect Stripe to receive payouts from paid memberships.
                </span>
              </div>
            </div>

            {state.communitySettingsError && <div className="auth-error">{state.communitySettingsError}</div>}
            <div className="create-community-actions">
              <button
                onClick={() => void actions.handleSaveCommunitySettings()}
                disabled={state.isSavingCommunitySettings || state.isProcessingCommunitySettingsBanner}
              >
                {state.isSavingCommunitySettings
                  ? "Saving..."
                  : state.isProcessingCommunitySettingsBanner
                    ? "Processing banner…"
                    : "Save changes"}
              </button>
            </div>
            {isActiveCommunityOwner && (
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
            )}
          </div>
        </>
      ) : (
        <>
          <div className="panel-title">Community</div>
          <div className="settings-section">
            <div className="settings-section-title">Access</div>
            <div className="settings-section-desc">
              Your role and entitlement status for this community.
            </div>
            <div className="model-list analytics-kpis">
              {[
                {
                  label: "Role",
                  value: state.activeCommunityAccess?.effective_role
                    ? state.activeCommunityAccess.effective_role
                    : "member",
                },
                {
                  label: "Entitlement ends",
                  value: state.activeCommunityAccess?.entitlement_ends_at
                    ? actions.formatChatTime(state.activeCommunityAccess.entitlement_ends_at)
                    : "—",
                },
              ].map((row) => (
                <div key={row.label} className="model-toggle analytics-kpi">
                  <span>{row.label}</span>
                  <span className="analytics-kpi-value">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="model-note">
              Only owners and admins can edit community details right now.
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">About</div>
            <div className="model-list analytics-kpis">
              {[
                { label: "Name", value: activeCommunity.name },
                { label: "Slug", value: activeCommunity.slug },
                { label: "Visibility", value: actions.formatCommunityVisibilityLabel(activeCommunity.visibility) },
              ].map((row) => (
                <div key={row.label} className="model-toggle analytics-kpi">
                  <span>{row.label}</span>
                  <span className="analytics-kpi-value">{row.value}</span>
                </div>
              ))}
            </div>
            {activeCommunity.description && (
              <div className="model-note">{activeCommunity.description}</div>
            )}
          </div>
          <div className="settings-section">
            <div className="settings-section-title">You</div>
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
            {!state.activeCommunityAccess?.is_owner && (
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
            )}
            {state.communityMemberSettingsError && (
              <div className="auth-error" style={{ marginTop: 10 }}>
                {state.communityMemberSettingsError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
