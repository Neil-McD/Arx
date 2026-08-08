import type { DragEvent } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  hasSession: boolean;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityAvatarUrl: string | null;
  createCommunityBannerUrl: string | null;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  isCreateAvatarDragOver: boolean;
  isCreateBannerDragOver: boolean;
  isProcessingCreateAvatar: boolean;
  isProcessingCreateBanner: boolean;
  onClose: () => void;
  onPrimaryAction: () => Promise<void> | void;
  onSetAvatarDragOver: (value: boolean) => void;
  onSetBannerDragOver: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUploadAvatar: (file: File | null) => Promise<void> | void;
  onUploadBanner: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
  onChangeName: (value: string) => void;
  onChangeOneLiner: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  if (!props.isOpen) return null;

  return (
    <div className="modal-overlay builder-offer-overlay" onClick={props.onClose}>
      <div
        className="modal create-community-modal builder-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close builder-offer-close" onClick={props.onClose} title="Close">
          ×
        </button>

        <div className="builder-create-heading" id="builder-create-title">
          <span>Builder setup</span>
          <h2>Set up your community</h2>
          <p>Your payment is confirmed. Add the identity members will see. You can change any of it later.</p>
        </div>

        <div className="builder-create-fields">
          <div className="create-community-layout builder-create-identity-layout">
            <div className="create-community-branding">
              <div
                className={`create-community-banner${props.isCreateBannerDragOver ? " drag-over" : ""}`}
                aria-busy={props.isProcessingCreateBanner || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  props.onSetBannerDragOver(true);
                }}
                onDragLeave={() => props.onSetBannerDragOver(false)}
                onDrop={props.onBannerDrop}
              >
                <StableFramedMedia
                  className="create-community-banner-media"
                  imageUrl={props.createCommunityBannerUrl}
                  frame={{ focusX: 0.5, focusY: 0.5, zoom: 1 }}
                  alt="Community banner preview"
                  fallback={<div className="create-community-banner-placeholder">Add a banner</div>}
                />
              </div>
              <div className="create-community-branding-actions">
                <label className={`create-banner-btn${props.isProcessingCreateBanner ? " disabled" : ""}`}>
                  {props.isProcessingCreateBanner ? "Processing banner…" : "Upload banner"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={props.isProcessingCreateBanner || props.isCreatingCommunity}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void props.onUploadBanner(file);
                    }}
                  />
                </label>
                {props.createCommunityBannerUrl ? (
                  <button className="create-banner-remove" type="button" onClick={props.onRemoveBanner}>
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="create-community-avatar-shell">
                <CommunityAvatar
                  className={`create-community-avatar${props.isCreateAvatarDragOver ? " drag-over" : ""}`}
                  name={props.createCommunityName || "Community"}
                  imageUrl={props.createCommunityAvatarUrl}
                  focusX={0.5}
                  focusY={0.5}
                  zoom={1}
                  alt="Community avatar preview"
                  onDragOver={(event) => {
                    event.preventDefault();
                    props.onSetAvatarDragOver(true);
                  }}
                  onDragLeave={() => props.onSetAvatarDragOver(false)}
                  onDrop={props.onAvatarDrop}
                />
                <div className="create-community-avatar-actions">
                  <label className={`create-avatar-btn${props.isProcessingCreateAvatar ? " disabled" : ""}`}>
                    {props.isProcessingCreateAvatar ? "Processing avatar…" : "Upload avatar"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={props.isProcessingCreateAvatar || props.isCreatingCommunity}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        void props.onUploadAvatar(file);
                      }}
                    />
                  </label>
                  {props.createCommunityAvatarUrl ? (
                    <button className="create-avatar-remove" type="button" onClick={props.onRemoveAvatar}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="create-community-details">
              <label className="create-community-field">
                <span>Community name</span>
                <input
                  autoFocus
                  type="text"
                  placeholder="Your community"
                  value={props.createCommunityName}
                  onChange={(event) => props.onChangeName(event.target.value)}
                />
              </label>
              <label className="create-community-field">
                <span>One-liner</span>
                <textarea
                  rows={3}
                  maxLength={180}
                  placeholder="Who is this community for?"
                  value={props.createCommunityOneLiner}
                  onChange={(event) => props.onChangeOneLiner(event.target.value)}
                />
                <span className="create-community-hint">A short promise members will recognize.</span>
              </label>
              <details className="builder-create-url">
                <summary>Customize community URL</summary>
                <label className="create-community-field">
                  <span>polynet.ai/c/</span>
                  <input
                    type="text"
                    placeholder="your-community"
                    value={props.createCommunitySlug}
                    onChange={(event) => {
                      props.onChangeSlug(event.target.value);
                      props.onChangeSlugEdited(true);
                    }}
                  />
                </label>
              </details>
            </div>
          </div>
        </div>

        {props.createCommunityError ? (
          <div className="auth-error builder-offer-error">{props.createCommunityError}</div>
        ) : null}

        <div className="builder-offer-actions">
          <button
            className="builder-offer-primary"
            type="button"
            onClick={() => void props.onPrimaryAction()}
            disabled={
              props.isCreatingCommunity
              || props.isProcessingCreateAvatar
              || props.isProcessingCreateBanner
              || props.createCommunityName.trim().length === 0
            }
          >
            {props.isCreatingCommunity
              ? "Creating community…"
              : props.hasSession
                ? "Create community"
                : "Sign in to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
