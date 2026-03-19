import type { DragEvent } from "react";
import { hasArchitectAccess } from "../../../../shared/builderBilling";

type CommunityRecordForModal = {
  id: string;
};

type BuilderBillingStatusForModal = {
  builder_tier?: string | null;
  max_communities?: number | null;
} | null;

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  hasSession: boolean;
  communities: CommunityRecordForModal[];
  communityRoleById: Record<string, string | undefined>;
  builderBillingStatus: BuilderBillingStatusForModal;
  isCreateBannerDragOver: boolean;
  isCreateAvatarDragOver: boolean;
  createCommunityBannerUrl: string | null;
  createCommunityAvatarUrl: string | null;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityVisibility: "published" | "unlisted";
  createCommunityError: string | null;
  builderBillingError: string | null;
  isCreatingCommunity: boolean;
  communityInitials: (value: string) => string;
  onClose: () => void;
  onPrimaryAction: () => Promise<void> | void;
  onSetBannerDragOver: (value: boolean) => void;
  onSetAvatarDragOver: (value: boolean) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUploadBanner: (file: File | null) => Promise<void> | void;
  onUploadAvatar: (file: File | null) => Promise<void> | void;
  onRemoveBanner: () => void;
  onRemoveAvatar: () => void;
  onChangeName: (value: string) => void;
  onChangeOneLiner: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
  onChangeVisibility: (value: "published" | "unlisted") => void;
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  const {
    isOpen,
    hasSession,
    communities,
    communityRoleById,
    builderBillingStatus,
    isCreateBannerDragOver,
    isCreateAvatarDragOver,
    createCommunityBannerUrl,
    createCommunityAvatarUrl,
    createCommunityName,
    createCommunityOneLiner,
    createCommunitySlug,
    createCommunityVisibility,
    createCommunityError,
    builderBillingError,
    isCreatingCommunity,
    communityInitials,
    onClose,
    onPrimaryAction,
    onSetBannerDragOver,
    onSetAvatarDragOver,
    onBannerDrop,
    onAvatarDrop,
    onUploadBanner,
    onUploadAvatar,
    onRemoveBanner,
    onRemoveAvatar,
    onChangeName,
    onChangeOneLiner,
    onChangeSlug,
    onChangeSlugEdited,
    onChangeVisibility,
  } = props;

  if (!isOpen) return null;

  const ownedCount = communities.reduce(
    (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
    0,
  );
  const tier = builderBillingStatus?.builder_tier ?? "unknown";
  const max = builderBillingStatus?.max_communities ?? 0;
  const hasArchitectTier = hasArchitectAccess(tier);
  const needsPlan = Boolean(hasSession && !hasArchitectTier);
  const limitReached = Boolean(hasSession && hasArchitectTier && max > 0 && ownedCount >= max);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-community-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="create-community-heading">
            <div className="modal-title">Create community</div>
            <div className="create-community-subtitle">
              Start with the identity and access basics. You can refine the funnel and AI agent after.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="create-community-form">
            <div className="create-community-layout">
              <div className="create-community-branding">
                <div
                  className={`create-community-banner${isCreateBannerDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    onSetBannerDragOver(true);
                  }}
                  onDragLeave={() => onSetBannerDragOver(false)}
                  onDrop={onBannerDrop}
                >
                  <div className="create-community-banner-media">
                    {createCommunityBannerUrl ? (
                      <img src={createCommunityBannerUrl} alt="Community banner preview" draggable={false} />
                    ) : (
                      <div className="create-community-banner-placeholder">Banner preview</div>
                    )}
                  </div>
                </div>
                <div className="create-community-branding-actions">
                  <label className="create-banner-btn">
                    Upload banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        void onUploadBanner(file);
                      }}
                    />
                  </label>
                  {createCommunityBannerUrl ? (
                    <button className="create-banner-remove" type="button" onClick={onRemoveBanner}>
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="create-community-avatar-shell">
                  <div
                    className={`create-community-avatar${isCreateAvatarDragOver ? " drag-over" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      onSetAvatarDragOver(true);
                    }}
                    onDragLeave={() => onSetAvatarDragOver(false)}
                    onDrop={onAvatarDrop}
                  >
                    {createCommunityAvatarUrl ? (
                      <img src={createCommunityAvatarUrl} alt="Community avatar preview" draggable={false} />
                    ) : (
                      <span>{communityInitials(createCommunityName || "Community")}</span>
                    )}
                  </div>
                  <div className="create-community-avatar-actions">
                    <label className="create-avatar-btn">
                      Upload avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => void onUploadAvatar(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {createCommunityAvatarUrl ? (
                      <button className="create-avatar-remove" type="button" onClick={onRemoveAvatar}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="create-community-details">
                <label className="create-community-field">
                  <span>Name</span>
                  <input
                    type="text"
                    placeholder="Community name"
                    value={createCommunityName}
                    onChange={(event) => onChangeName(event.target.value)}
                  />
                </label>
                <label className="create-community-field">
                  <span>One-liner</span>
                  <textarea
                    placeholder="One-liner about who this is for"
                    rows={3}
                    value={createCommunityOneLiner}
                    onChange={(event) => onChangeOneLiner(event.target.value)}
                  />
                </label>
                <div className="create-community-detail-grid">
                  <label className="create-community-field">
                    <span>Slug</span>
                    <input
                      type="text"
                      placeholder="your-community"
                      value={createCommunitySlug}
                      onChange={(event) => {
                        onChangeSlug(event.target.value);
                        onChangeSlugEdited(true);
                      }}
                    />
                    <span className="create-community-hint">Lowercase letters, numbers, and dashes.</span>
                  </label>
                  <label className="create-community-field">
                    <span>Visibility</span>
                    <select
                      className="select-styled"
                      value={createCommunityVisibility}
                      onChange={(event) => onChangeVisibility(event.target.value as "published" | "unlisted")}
                    >
                      <option value="published">Published</option>
                      <option value="unlisted">Unlisted</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            {createCommunityError && <div className="auth-error">{createCommunityError}</div>}
            {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="create-community-actions">
            {!hasSession ? (
              <button className="create-community-primary" type="button" onClick={() => void onPrimaryAction()}>
                Sign in to create
              </button>
            ) : (
              <button
                className="create-community-primary"
                type="button"
                onClick={() => void onPrimaryAction()}
                disabled={isCreatingCommunity || createCommunityName.trim().length === 0}
              >
                {isCreatingCommunity
                  ? "Creating..."
                  : needsPlan
                    ? "Upgrade to Architect"
                    : limitReached
                      ? "Upgrade plan"
                      : "Create community"}
              </button>
            )}
            <button className="create-community-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
