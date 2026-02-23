import type { DragEvent } from "react";
import { communityInitials } from "../../shared/messageMetadataUi";
import type { CommunityPricingMode } from "../../shared/communityTypes";

type DesktopCommunitySettingsTabProps = {
  showSettings: boolean;
  activeCommunity: {
    name: string;
    slug: string;
    description?: string | null;
    visibility?: string | null;
  } | null;
  hasSession: boolean;
  canViewSettings: boolean;
  canManageMembers: boolean;
  isActiveCommunityOwner: boolean;
  activeCommunityAccess: {
    effective_role?: string | null;
    entitlement_ends_at?: string | null;
    is_owner?: boolean | null;
  } | null;

  isSettingsBannerDragOver: boolean;
  isSettingsAvatarDragOver: boolean;
  isProcessingCommunitySettingsBanner: boolean;
  communitySettingsBannerUrl: string | null;
  communitySettingsBannerUploadError: string | null;
  communitySettingsAvatarUrl: string | null;
  communitySettingsName: string;
  communitySettingsSlug: string;
  communitySettingsDescription: string;
  communitySettingsVisibility: string;
  communitySettingsPricingMode: CommunityPricingMode;
  communitySettingsPriceUsdMonthly: string;
  communitySettingsPriceUsdYearly: string;
  communitySettingsError: string | null;
  isSavingCommunitySettings: boolean;
  communityMemberMuted: boolean;
  isLoadingCommunityMemberSettings: boolean;
  isLeavingCommunity: boolean;
  communityMemberSettingsError: string | null;
  hasPayouts: boolean;
  isStartingConnectOnboarding: boolean;

  onSetIsSettingsBannerDragOver: (value: boolean) => void;
  onSetIsSettingsAvatarDragOver: (value: boolean) => void;
  onSettingsBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onSettingsAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onCommunityBannerUpload: (file: File | null) => Promise<void> | void;
  onCommunityAvatarUpload: (file: File | null) => Promise<void> | void;
  onSetCommunitySettingsBannerUrl: (value: string | null) => void;
  onSetCommunitySettingsBannerUploadError: (value: string | null) => void;
  onSetCommunitySettingsAvatarUrl: (value: string | null) => void;
  onSetCommunitySettingsName: (value: string) => void;
  onSetCommunitySettingsSlug: (value: string) => void;
  onSetCommunitySettingsDescription: (value: string) => void;
  onSetCommunitySettingsVisibility: (value: string) => void;
  onSetCommunitySettingsPricingMode: (value: CommunityPricingMode) => void;
  onSetCommunitySettingsPriceUsdMonthly: (value: string) => void;
  onSetCommunitySettingsPriceUsdYearly: (value: string) => void;
  onMarkCommunitySettingsDirty: () => void;
  onMarkCommunityPricingDirty: () => void;
  onStartConnectOnboarding: () => Promise<void> | void;
  onSaveCommunitySettings: () => Promise<void> | void;
  onOpenDeleteCommunityModal: () => void;
  onToggleCommunityMute: (next: boolean) => Promise<void> | void;
  onLeaveCommunity: () => Promise<void> | void;
  formatChatTime: (value: string) => string;
  slugifyCommunityName: (value: string) => string;
};

export function DesktopCommunitySettingsTab(props: DesktopCommunitySettingsTabProps) {
  const {
    showSettings,
    activeCommunity,
    hasSession,
    canViewSettings,
    canManageMembers,
    isActiveCommunityOwner,
    activeCommunityAccess,
    isSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    isProcessingCommunitySettingsBanner,
    communitySettingsBannerUrl,
    communitySettingsBannerUploadError,
    communitySettingsAvatarUrl,
    communitySettingsName,
    communitySettingsSlug,
    communitySettingsDescription,
    communitySettingsVisibility,
    communitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdYearly,
    communitySettingsError,
    isSavingCommunitySettings,
    communityMemberMuted,
    isLoadingCommunityMemberSettings,
    isLeavingCommunity,
    communityMemberSettingsError,
    hasPayouts,
    isStartingConnectOnboarding,
    onSetIsSettingsBannerDragOver,
    onSetIsSettingsAvatarDragOver,
    onSettingsBannerDrop,
    onSettingsAvatarDrop,
    onCommunityBannerUpload,
    onCommunityAvatarUpload,
    onSetCommunitySettingsBannerUrl,
    onSetCommunitySettingsBannerUploadError,
    onSetCommunitySettingsAvatarUrl,
    onSetCommunitySettingsName,
    onSetCommunitySettingsSlug,
    onSetCommunitySettingsDescription,
    onSetCommunitySettingsVisibility,
    onSetCommunitySettingsPricingMode,
    onSetCommunitySettingsPriceUsdMonthly,
    onSetCommunitySettingsPriceUsdYearly,
    onMarkCommunitySettingsDirty,
    onMarkCommunityPricingDirty,
    onStartConnectOnboarding,
    onSaveCommunitySettings,
    onOpenDeleteCommunityModal,
    onToggleCommunityMute,
    onLeaveCommunity,
    formatChatTime,
    slugifyCommunityName,
  } = props;

  if (!showSettings) return null;

  return (
    <div className="settings-panel community-settings-panel">
      {!activeCommunity ? (
        <div className="chat-empty">Select a community to view settings.</div>
      ) : !hasSession ? (
        <div className="chat-empty">Sign in to view community settings.</div>
      ) : !canViewSettings ? (
        <div className="chat-empty">Join this community to view settings.</div>
      ) : canManageMembers ? (
        <>
          <div className="create-community-form community-settings-form">
            <div className="settings-section">
              <div className="settings-section-title">Branding</div>
              <div
                className={`create-community-banner${isSettingsBannerDragOver ? " drag-over" : ""}`}
                aria-busy={isProcessingCommunitySettingsBanner || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  onSetIsSettingsBannerDragOver(true);
                }}
                onDragLeave={() => onSetIsSettingsBannerDragOver(false)}
                onDrop={onSettingsBannerDrop}
              >
                {communitySettingsBannerUrl ? (
                  <img src={communitySettingsBannerUrl} alt="Community banner preview" />
                ) : (
                  <div className="create-community-banner-placeholder">Banner preview</div>
                )}
                <label className={`create-banner-btn${isProcessingCommunitySettingsBanner ? " disabled" : ""}`}>
                  Upload banner
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isProcessingCommunitySettingsBanner}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void onCommunityBannerUpload(file);
                    }}
                  />
                </label>
                {communitySettingsBannerUrl && (
                  <button
                    className="create-banner-remove"
                    type="button"
                    disabled={isProcessingCommunitySettingsBanner}
                    onClick={() => {
                      onSetCommunitySettingsBannerUrl(null);
                      onSetCommunitySettingsBannerUploadError(null);
                      onMarkCommunitySettingsDirty();
                    }}
                  >
                    Remove
                  </button>
                )}
                {isProcessingCommunitySettingsBanner && (
                  <div className="create-upload-status">Processing banner…</div>
                )}
                {communitySettingsBannerUploadError && (
                  <div className="auth-error">{communitySettingsBannerUploadError}</div>
                )}
              </div>
              <div className="create-community-avatar-row">
                <div
                  className={`create-community-avatar${isSettingsAvatarDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    onSetIsSettingsAvatarDragOver(true);
                  }}
                  onDragLeave={() => onSetIsSettingsAvatarDragOver(false)}
                  onDrop={onSettingsAvatarDrop}
                >
                  {communitySettingsAvatarUrl ? (
                    <img src={communitySettingsAvatarUrl} alt="Community avatar preview" />
                  ) : (
                    <span>{communityInitials(communitySettingsName || activeCommunity?.name || "Community")}</span>
                  )}
                </div>
                <div className="create-community-avatar-actions">
                  <label className="create-avatar-btn">
                    Upload avatar
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void onCommunityAvatarUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {communitySettingsAvatarUrl && (
                    <button
                      className="create-avatar-remove"
                      type="button"
                      onClick={() => {
                        onSetCommunitySettingsAvatarUrl(null);
                        onMarkCommunitySettingsDirty();
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
                  value={communitySettingsName}
                  onChange={(event) => {
                    onSetCommunitySettingsName(event.target.value);
                    onMarkCommunitySettingsDirty();
                  }}
                />
              </label>
              <label className="create-community-field">
                <span>Slug</span>
                <input
                  type="text"
                  placeholder="your-community"
                  value={communitySettingsSlug}
                  maxLength={32}
                  onChange={(event) => {
                    onSetCommunitySettingsSlug(slugifyCommunityName(event.target.value));
                    onMarkCommunitySettingsDirty();
                  }}
                />
                <span className="create-community-hint">
                  {`arx.com/c/${communitySettingsSlug.trim() || "your-community"}`}
                </span>
              </label>
            </div>

            <div className="settings-section">
              <label className="create-community-field">
                <span>Description</span>
                <textarea
                  placeholder="Optional description for your community page"
                  rows={3}
                  value={communitySettingsDescription}
                  onChange={(event) => {
                    onSetCommunitySettingsDescription(event.target.value);
                    onMarkCommunitySettingsDirty();
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
                  value={communitySettingsVisibility}
                  onChange={(event) => {
                    onSetCommunitySettingsVisibility(event.target.value);
                    onMarkCommunitySettingsDirty();
                  }}
                >
                  <option value="published">Published</option>
                  <option value="unlisted">Unlisted</option>
                </select>
                <span className="create-community-hint">
                  {communitySettingsVisibility === "published"
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
                      className={`analytics-range-btn${communitySettingsPricingMode === opt.key ? " active" : ""}`}
                      onClick={() => {
                        onSetCommunitySettingsPricingMode(opt.key);
                        onMarkCommunityPricingDirty();
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
              {(communitySettingsPricingMode === "monthly" || communitySettingsPricingMode === "both") && (
                <label className="create-community-field">
                  <span>Monthly price (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="29"
                    value={communitySettingsPriceUsdMonthly}
                    onChange={(event) => {
                      onSetCommunitySettingsPriceUsdMonthly(event.target.value);
                      onMarkCommunityPricingDirty();
                    }}
                  />
                  <span className="create-community-hint">Billed monthly.</span>
                </label>
              )}
              {(communitySettingsPricingMode === "yearly" || communitySettingsPricingMode === "both") && (
                <label className="create-community-field">
                  <span>Annual price (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="290"
                    value={communitySettingsPriceUsdYearly}
                    onChange={(event) => {
                      onSetCommunitySettingsPriceUsdYearly(event.target.value);
                      onMarkCommunityPricingDirty();
                    }}
                  />
                  <span className="create-community-hint">Billed yearly.</span>
                </label>
              )}
              <div className="create-community-field">
                <span>Payouts</span>
                <div className="auth-actions" style={{ paddingLeft: 0 }}>
                  {hasPayouts ? (
                    <button type="button" className="secondary" disabled>
                      Payouts connected
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onStartConnectOnboarding()}
                      disabled={isStartingConnectOnboarding}
                      className="stripe-connect-btn"
                    >
                      <svg className="stripe-connect-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <rect x="2" y="2" width="20" height="20" rx="6" fill="#635BFF" />
                        <path
                          fill="#FFFFFF"
                          d="M14.85 9.14c-.84-.44-1.82-.66-2.78-.66-1.44 0-2.24.54-2.24 1.25 0 .78.84 1.12 2.35 1.46 2.2.5 3.34 1.24 3.34 2.9 0 1.76-1.5 2.95-4.03 2.95-1.38 0-2.66-.34-3.64-.93l.66-1.56c.98.58 2.04.88 3.06.88 1.5 0 2.34-.54 2.34-1.37 0-.78-.74-1.16-2.36-1.52-2.18-.5-3.33-1.24-3.33-2.87 0-1.66 1.5-2.87 3.9-2.87 1.3 0 2.5.28 3.48.74l-.7 1.6z"
                        />
                      </svg>
                      <span>{isStartingConnectOnboarding ? "Opening…" : "Connect with Stripe"}</span>
                    </button>
                  )}
                </div>
                <span className="create-community-hint">
                  Connect Stripe to receive payouts from paid memberships.
                </span>
              </div>
            </div>

            {communitySettingsError && <div className="auth-error">{communitySettingsError}</div>}
            <div className="create-community-actions">
              <button
                onClick={() => void onSaveCommunitySettings()}
                disabled={isSavingCommunitySettings || isProcessingCommunitySettingsBanner}
              >
                {isSavingCommunitySettings
                  ? "Saving..."
                  : isProcessingCommunitySettingsBanner
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
                  onClick={onOpenDeleteCommunityModal}
                  disabled={isSavingCommunitySettings || isProcessingCommunitySettingsBanner}
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
                  value: activeCommunityAccess?.effective_role
                    ? activeCommunityAccess.effective_role
                    : "member",
                },
                {
                  label: "Entitlement ends",
                  value: activeCommunityAccess?.entitlement_ends_at
                    ? formatChatTime(activeCommunityAccess.entitlement_ends_at)
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
                { label: "Visibility", value: activeCommunity.visibility },
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
                  checked={communityMemberMuted}
                  disabled={isLoadingCommunityMemberSettings || isLeavingCommunity}
                  onChange={(event) => void onToggleCommunityMute(event.target.checked)}
                />
              </label>
            </div>
            <div className="model-note">
              Muted communities won't send notifications (when notifications ship).
            </div>
            {!activeCommunityAccess?.is_owner && (
              <div className="create-community-actions" style={{ marginTop: 12 }}>
                <button
                  className="danger"
                  type="button"
                  disabled={isLeavingCommunity || isLoadingCommunityMemberSettings}
                  onClick={() => void onLeaveCommunity()}
                >
                  {isLeavingCommunity ? "Leaving…" : "Leave community"}
                </button>
              </div>
            )}
            {communityMemberSettingsError && (
              <div className="auth-error" style={{ marginTop: 10 }}>
                {communityMemberSettingsError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
