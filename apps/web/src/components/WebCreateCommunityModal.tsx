import type { DragEvent } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { isValidCommunitySlug, communityPageAddress } from "../../../../shared/communitySlug";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { KitStartCommunity } from "../v1/KitStartCommunity";

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  isDismissible: boolean;
  isPaidSetup: boolean;
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
  // Design v1's preview card: who will host it.
  hostName?: string | null;
  hostAvatarUrl?: string | null;
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  if (!props.isOpen) return null;

  // Design v1: two things to type and a preview of the Discover card
  // (apps/web/src/v1/KitStartCommunity.tsx). The classic form follows.
  if (isDesignV1Active()) {
    return (
      <WebBlockingSetupModal
        titleId="builder-create-title"
        dismissible={props.isDismissible}
        busy={props.isCreatingCommunity}
        size="wide"
        className="create-community-modal builder-create-modal is-kit-start"
        onDismiss={props.onClose}
      >
        <KitStartCommunity
          titleId="builder-create-title"
          hostName={props.hostName ?? null}
          hostAvatarUrl={props.hostAvatarUrl ?? null}
          isPaidSetup={props.isPaidSetup}
          hasSession={props.hasSession}
          isDismissible={props.isDismissible}
          name={props.createCommunityName}
          oneLiner={props.createCommunityOneLiner}
          slug={props.createCommunitySlug}
          avatarUrl={props.createCommunityAvatarUrl}
          bannerUrl={props.createCommunityBannerUrl}
          error={props.createCommunityError}
          isCreating={props.isCreatingCommunity}
          isProcessingAvatar={props.isProcessingCreateAvatar}
          isProcessingBanner={props.isProcessingCreateBanner}
          onClose={props.onClose}
          onCreate={props.onPrimaryAction}
          onUploadAvatar={props.onUploadAvatar}
          onUploadBanner={props.onUploadBanner}
          onRemoveAvatar={props.onRemoveAvatar}
          onRemoveBanner={props.onRemoveBanner}
          onChangeName={props.onChangeName}
          onChangeOneLiner={props.onChangeOneLiner}
          onChangeSlug={props.onChangeSlug}
          onChangeSlugEdited={props.onChangeSlugEdited}
        />
      </WebBlockingSetupModal>
    );
  }

  return (
    <WebBlockingSetupModal
      titleId="builder-create-title"
      dismissible={props.isDismissible}
      busy={props.isCreatingCommunity}
      size="wide"
      className="create-community-modal builder-create-modal"
      onDismiss={props.onClose}
    >
      {props.isDismissible ? (
        <button
          className="modal-close builder-offer-close"
          onClick={props.onClose}
          title="Close"
          aria-label="Close community setup"
        >
          ×
        </button>
      ) : null}

      <div className="builder-create-heading" id="builder-create-title">
        <span>New community</span>
        <h2>Set up your community</h2>
        <p>
          {props.isPaidSetup
            ? "Your Agent plan is ready. Add the identity members will see. You can change any of it later."
            : "Add the identity members will see. You can change any of it later."}
        </p>
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
              <label className="create-community-field builder-create-url">
                <span>Community handle</span>
                <div className="builder-create-url-input">
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="your-community"
                    value={props.createCommunitySlug}
                    aria-invalid={
                      props.createCommunitySlug.length > 0
                      && !isValidCommunitySlug(props.createCommunitySlug)
                    }
                    onChange={(event) => {
                      props.onChangeSlug(event.target.value);
                      props.onChangeSlugEdited(true);
                    }}
                  />
                </div>
                <span className="create-community-hint">
                  Your community's page will be {communityPageAddress(props.createCommunitySlug)}. 3–32 characters: lowercase letters, numbers and dashes.
                </span>
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
            || !isValidCommunitySlug(props.createCommunitySlug)
          }
        >
          {props.isCreatingCommunity
            ? "Creating community…"
            : props.hasSession
              ? "Create community"
              : "Sign in to continue"}
        </button>
      </div>
    </WebBlockingSetupModal>
  );
}
