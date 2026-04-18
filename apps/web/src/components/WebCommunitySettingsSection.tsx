import { useEffect } from "react";
import type { DragEvent } from "react";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

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
            <img src={state.communitySettingsAvatarUrl} alt="Community avatar preview" draggable={false} />
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
          {state.communitySettingsAvatarUrl ? (
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

function CommunityMonetizationConfigSection({ state, actions }: SharedSettingsProps) {
  const pricingOptions = [
    { key: "free", label: "Free" },
    { key: "monthly", label: "Monthly" },
    { key: "annual", label: "Annual" },
  ] as Array<{ key: CommunityPricingMode; label: string }>;
  const pricingSwitcherStyle = buildPlatformSwitcherStyle(
    pricingOptions.length,
    pricingOptions.findIndex((opt) => opt.key === state.communitySettingsPricingMode),
  );

  return (
    <div className="settings-section">
      <div className="settings-section-title">Access & Pricing</div>
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
            onChange={(event) => {
              actions.setCommunitySettingsPriceUsdAnnual(event.target.value);
              actions.setCommunityPricingDirty();
              actions.markCommunitySettingsDirty();
            }}
          />
          <span className="create-community-hint">Billed annually.</span>
        </label>
      ) : null}
      <div className="settings-section-desc" style={{ marginTop: 12 }}>
        Billing operations, payouts, and revenue reporting are not managed from this tab yet.
      </div>
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
    state,
    actions,
  } = props;
  const isMemberSettingsLayer = communitySettingsLayer === "member";
  const canLeaveCommunity = communitySettingsLayer !== "owner";

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
            <CommunityBrandingSettingsSection
              activeCommunity={activeCommunity}
              state={state}
              actions={actions}
            />
            <CommunityProfileSettingsSection state={state} actions={actions} />
            <CommunityMonetizationConfigSection state={state} actions={actions} />
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
