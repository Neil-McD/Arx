import type { DragEvent } from "react";
import { Check } from "lucide-react";

import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";

type WebCommunityResourceModuleModalProps = {
  isOpen: boolean;
  isEditingModule: boolean;
  hasActiveCommunity: boolean;
  moduleNameInput: string;
  moduleDescriptionInput: string;
  moduleBannerUrlInput: string;
  moduleBannerFocusX: number;
  moduleBannerFocusY: number;
  moduleBannerZoom: number;
  moduleLessonStyleInput: "article" | "video";
  isModuleBannerDragOver: boolean;
  isProcessingModuleBanner: boolean;
  moduleBannerUploadError: string | null;
  isModuleBannerFocusModalOpen: boolean;
  moduleError: string | null;
  isSavingModule: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onDelete: (() => Promise<boolean> | boolean) | null;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeBannerFocusX: (value: number) => void;
  onChangeBannerFocusY: (value: number) => void;
  onChangeBannerZoom: (value: number) => void;
  onChangeLessonStyle: (value: "article" | "video") => void;
  onSetBannerDragOver: (value: boolean) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBannerUpload: (file: File | null) => Promise<void> | void;
  onOpenBannerFocusModal: () => void;
  onCloseBannerFocusModal: () => void;
  onRemoveBanner: () => void;
};

// Owners pick per course how its lessons read.
const LESSON_STYLES: { id: "article" | "video"; name: string; description: string }[] = [
  { id: "article", name: "Article", description: "A clean reading page, like a newsletter post." },
  { id: "video", name: "Video course", description: "Video on top, the lesson text on a card below." },
];

function LessonStyleSketch(props: { id: "article" | "video" }) {
  return (
    <span className={`resource-lesson-style-sketch is-${props.id}`} aria-hidden="true">
      {props.id === "video" ? <span className="sketch-video" /> : <span className="sketch-title" />}
      <span className="sketch-text">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

export function WebCommunityResourceModuleModal(props: WebCommunityResourceModuleModalProps) {
  const {
    isOpen,
    isEditingModule,
    hasActiveCommunity,
    moduleNameInput,
    moduleDescriptionInput,
    moduleBannerUrlInput,
    moduleBannerFocusX,
    moduleBannerFocusY,
    moduleBannerZoom,
    moduleLessonStyleInput,
    isModuleBannerDragOver,
    isProcessingModuleBanner,
    moduleBannerUploadError,
    isModuleBannerFocusModalOpen,
    moduleError,
    isSavingModule,
    onClose,
    onCancel,
    onSave,
    onDelete,
    onChangeName,
    onChangeDescription,
    onChangeBannerFocusX,
    onChangeBannerFocusY,
    onChangeBannerZoom,
    onChangeLessonStyle,
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
        <div
          className="modal resource-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-course-editor-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <div className="modal-title" id="resource-course-editor-title">
                {isEditingModule ? "Edit course" : "Add course"}
              </div>
              <div className="resource-modal-subtitle">
                {isEditingModule
                  ? "Update how this course appears to community members."
                  : "Create a guided collection of related lessons."}
              </div>
            </div>
            <button className="modal-close" type="button" onClick={onClose} aria-label="Close course editor">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="resource-form">
              <label className="resource-form-section">
                <span className="resource-field-label">Name</span>
                <input
                  className="resource-title-input"
                  type="text"
                  placeholder="Course name"
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
              </label>

              <label className="resource-form-section">
                <span className="resource-field-label">Description</span>
                <textarea
                  className="resource-description-input"
                  placeholder="What will members learn in this course?"
                  value={moduleDescriptionInput}
                  onChange={(event) => onChangeDescription(event.target.value)}
                  disabled={!hasActiveCommunity}
                />
              </label>

              <div className="resource-form-section">
                <div className="resource-field-label" id="resource-lesson-style-label">Lesson style</div>
                <div className="resource-lesson-styles" role="radiogroup" aria-labelledby="resource-lesson-style-label">
                  {LESSON_STYLES.map((style) => {
                    const selected = style.id === moduleLessonStyleInput;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`resource-lesson-style${selected ? " is-selected" : ""}`}
                        disabled={!hasActiveCommunity}
                        onClick={() => onChangeLessonStyle(style.id)}
                      >
                        <LessonStyleSketch id={style.id} />
                        <span className="resource-lesson-style-text">
                          <strong>{style.name}</strong>
                          <small>{style.description}</small>
                        </span>
                        {selected ? <Check className="resource-lesson-style-check" size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="resource-form-section">
                <div className="resource-field-label">Course cover</div>
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
                  <StableFramedMedia
                    className="create-community-banner-media"
                    imageClassName="create-community-banner-image"
                    imageUrl={moduleBannerUrlInput}
                    frame={{
                      focusX: moduleBannerFocusX,
                      focusY: moduleBannerFocusY,
                      zoom: moduleBannerZoom,
                    }}
                    alt="Course cover preview"
                    fallback={<div className="create-community-banner-placeholder">Drop a course cover image</div>}
                  />
                  <label className={`create-banner-btn${isProcessingModuleBanner ? " disabled" : ""}`}>
                    Upload cover
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
                        Adjust cover
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
                  {isProcessingModuleBanner ? <div className="create-upload-status">Processing cover…</div> : null}
                  {moduleBannerUploadError ? <div className="auth-error">{moduleBannerUploadError}</div> : null}
                </div>
              </div>

              {moduleError ? <div className="auth-error">{moduleError}</div> : null}
            </div>
          </div>
          <div className="modal-footer">
            <div className="resource-modal-actions">
              {isEditingModule && onDelete ? (
                <button
                  className="secondary danger"
                  type="button"
                  onClick={() => void onDelete()}
                  disabled={!hasActiveCommunity || isSavingModule}
                >
                  Delete
                </button>
              ) : null}
              <button
                className="platform-save-button"
                type="button"
                onClick={() => void onSave()}
                disabled={!hasActiveCommunity || isSavingModule || moduleNameInput.trim().length === 0}
              >
                {isSavingModule ? "Saving..." : "Save course"}
              </button>
              <button className="secondary" type="button" onClick={onCancel}>
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
