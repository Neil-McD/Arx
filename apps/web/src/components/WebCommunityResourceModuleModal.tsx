import type { DragEvent } from "react";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";

type WebCommunityResourceModuleModalProps = {
  isOpen: boolean;
  hasActiveCommunity: boolean;
  moduleNameInput: string;
  moduleDescriptionInput: string;
  moduleBannerUrlInput: string;
  moduleBannerFocusX: number;
  moduleBannerFocusY: number;
  moduleBannerZoom: number;
  isModuleBannerDragOver: boolean;
  isProcessingModuleBanner: boolean;
  moduleBannerUploadError: string | null;
  isModuleBannerFocusModalOpen: boolean;
  moduleError: string | null;
  isSavingModule: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeBannerFocusX: (value: number) => void;
  onChangeBannerFocusY: (value: number) => void;
  onChangeBannerZoom: (value: number) => void;
  onSetBannerDragOver: (value: boolean) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBannerUpload: (file: File | null) => Promise<void> | void;
  onOpenBannerFocusModal: () => void;
  onCloseBannerFocusModal: () => void;
  onRemoveBanner: () => void;
};

export function WebCommunityResourceModuleModal(props: WebCommunityResourceModuleModalProps) {
  const {
    isOpen,
    hasActiveCommunity,
    moduleNameInput,
    moduleDescriptionInput,
    moduleBannerUrlInput,
    moduleBannerFocusX,
    moduleBannerFocusY,
    moduleBannerZoom,
    isModuleBannerDragOver,
    isProcessingModuleBanner,
    moduleBannerUploadError,
    isModuleBannerFocusModalOpen,
    moduleError,
    isSavingModule,
    onClose,
    onCancel,
    onSave,
    onChangeName,
    onChangeDescription,
    onChangeBannerFocusX,
    onChangeBannerFocusY,
    onChangeBannerZoom,
    onSetBannerDragOver,
    onBannerDrop,
    onBannerUpload,
    onOpenBannerFocusModal,
    onCloseBannerFocusModal,
    onRemoveBanner,
  } = props;

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Add module</div>
              <div className="resource-modal-subtitle">
                Create a course-style container for related resources.
              </div>
            </div>
            <button className="modal-close" onClick={onClose} title="Close">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="resource-form">
              <div className="resource-form-section">
                <div className="resource-field-label">Name</div>
                <input
                  className="resource-title-input"
                  type="text"
                  placeholder="Module name"
                  value={moduleNameInput}
                  onChange={(event) => onChangeName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void onSave();
                    }
                  }}
                  disabled={!hasActiveCommunity}
                />
              </div>

              <div className="resource-form-section">
                <div className="resource-field-label">Description</div>
                <textarea
                  className="resource-description-input"
                  placeholder="What should members find in this module?"
                  value={moduleDescriptionInput}
                  onChange={(event) => onChangeDescription(event.target.value)}
                  disabled={!hasActiveCommunity}
                />
              </div>

              <div className="resource-form-section">
                <div className="resource-field-label">Banner</div>
                <div
                  className={`create-community-banner${isModuleBannerDragOver ? " drag-over" : ""}`}
                  aria-busy={isProcessingModuleBanner || undefined}
                  onDragOver={(event) => {
                    event.preventDefault();
                    onSetBannerDragOver(true);
                  }}
                  onDragLeave={() => onSetBannerDragOver(false)}
                  onDrop={onBannerDrop}
                >
                  <div className="create-community-banner-media">
                    {moduleBannerUrlInput ? (
                      <img
                        src={moduleBannerUrlInput}
                        alt="Module banner preview"
                        draggable={false}
                        style={getCommunityBannerImageStyle({
                          focusX: moduleBannerFocusX,
                          focusY: moduleBannerFocusY,
                          zoom: moduleBannerZoom,
                        })}
                      />
                    ) : (
                      <div className="create-community-banner-placeholder">
                        Drop a banner image
                      </div>
                    )}
                  </div>
                  <label className={`create-banner-btn${isProcessingModuleBanner ? " disabled" : ""}`}>
                    Upload banner
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!hasActiveCommunity || isProcessingModuleBanner}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        void onBannerUpload(file);
                      }}
                    />
                  </label>
                  {moduleBannerUrlInput ? (
                    <div className="banner-branding-actions">
                      <button
                        className="create-banner-btn"
                        type="button"
                        disabled={isProcessingModuleBanner}
                        onClick={onOpenBannerFocusModal}
                      >
                        Adjust banner
                      </button>
                      <button
                        className="create-banner-remove"
                        type="button"
                        disabled={isProcessingModuleBanner}
                        onClick={onRemoveBanner}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  {isProcessingModuleBanner ? (
                    <div className="create-upload-status">Processing banner…</div>
                  ) : null}
                  {moduleBannerUploadError ? <div className="auth-error">{moduleBannerUploadError}</div> : null}
                </div>
              </div>

              {moduleError && <div className="auth-error">{moduleError}</div>}
            </div>
          </div>
          <div className="modal-footer">
            <div className="resource-modal-actions">
              <button
                className="platform-save-button"
                onClick={() => void onSave()}
                disabled={!hasActiveCommunity || isSavingModule || moduleNameInput.trim().length === 0}
              >
                {isSavingModule ? "Saving..." : "Save module"}
              </button>
              <button className="secondary" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
      <WebCommunityBannerEditorModal
        isOpen={isModuleBannerFocusModalOpen}
        bannerUrl={moduleBannerUrlInput}
        focusX={moduleBannerFocusX}
        focusY={moduleBannerFocusY}
        zoom={moduleBannerZoom}
        onChangeFocusX={onChangeBannerFocusX}
        onChangeFocusY={onChangeBannerFocusY}
        onChangeZoom={onChangeBannerZoom}
        onDirty={() => undefined}
        onClose={onCloseBannerFocusModal}
      />
    </>
  );
}
