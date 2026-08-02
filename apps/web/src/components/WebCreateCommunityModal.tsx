import type { DragEvent } from "react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityBanner } from "../../../../shared/CommunityBanner";

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  hasSession: boolean;
  isCreateBannerDragOver: boolean;
  isCreateAvatarDragOver: boolean;
  createCommunityBannerUrl: string | null;
  createCommunityAvatarUrl: string | null;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityError: string | null;
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
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  const {
    isOpen,
    hasSession,
    isCreateBannerDragOver,
    isCreateAvatarDragOver,
    createCommunityBannerUrl,
    createCommunityAvatarUrl,
    createCommunityName,
    createCommunityOneLiner,
    createCommunitySlug,
    createCommunityError,
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
  } = props;

  if (!isOpen) return null;

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
                  <CommunityBanner
                    className="create-community-banner-media"
                    imageUrl={createCommunityBannerUrl}
                    focusX={0.5}
                    focusY={0.5}
                    zoom={1}
                    alt="Community banner preview"
                    fallback={<div className="create-community-banner-placeholder">Banner preview</div>}
                  />
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
                  <CommunityAvatar
                    className={`create-community-avatar${isCreateAvatarDragOver ? " drag-over" : ""}`}
                    imageUrl={createCommunityAvatarUrl}
                    focusX={0.5}
                    focusY={0.5}
                    zoom={1}
                    name={createCommunityName || "Community"}
                    alt="Community avatar preview"
                    fallback={communityInitials(createCommunityName || "Community")}
                    onDragOver={(event) => {
                      event.preventDefault();
                      onSetAvatarDragOver(true);
                    }}
                    onDragLeave={() => onSetAvatarDragOver(false)}
                    onDrop={onAvatarDrop}
                  />
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
                  <span className="create-community-hint">
                    Lowercase letters, numbers, and dashes. Your community starts as a private draft.
                  </span>
                </label>
              </div>
            </div>
            {createCommunityError && <div className="auth-error">{createCommunityError}</div>}
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
                  : "Create and continue to payment"}
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
