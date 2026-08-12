import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

export type WebCommunityFunnelEditorProps = {
  communityFunnelDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityFunnel: () => Promise<boolean> | boolean;
  handleResetCommunityFunnel: () => void;
  handlePreviewCommunityFunnel: () => void;
  isSavingCommunityFunnel: boolean;
  communityFunnelSaveError: string | null;
  communityFunnelConfig: CommunityFunnelConfig;
  setCommunityFunnelConfig: React.Dispatch<React.SetStateAction<CommunityFunnelConfig>>;
  markCommunityFunnelDirty: () => void;
  funnelAbout: string;
  setFunnelAbout: (value: string) => void;
  isFunnelAboutDirty: boolean;
  markCommunitySettingsDirty: () => void;
  handleSaveCommunityFunnelAbout: () => Promise<boolean> | boolean;
  handleResetCommunityFunnelAbout: () => void;
  isSavingCommunitySettings: boolean;
  communitySettingsError: string | null;
};

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const {
    communityFunnelDirtyRef,
    handleSaveCommunityFunnel,
    handleResetCommunityFunnel,
    handlePreviewCommunityFunnel,
    isSavingCommunityFunnel,
    communityFunnelSaveError,
    communityFunnelConfig,
    setCommunityFunnelConfig,
    markCommunityFunnelDirty,
    funnelAbout,
    setFunnelAbout,
    isFunnelAboutDirty,
    markCommunitySettingsDirty,
    handleSaveCommunityFunnelAbout,
    handleResetCommunityFunnelAbout,
    isSavingCommunitySettings,
    communitySettingsError,
  } = props;

  const isMediaDirty = communityFunnelDirtyRef.current;
  const isDirty = isMediaDirty || isFunnelAboutDirty;
  const isSaving = isSavingCommunityFunnel || isSavingCommunitySettings;
  const mediaPreviewUrl = communityFunnelConfig.hero_media_url ?? null;
  const mediaPreviewEmbed = mediaPreviewUrl ? parseEmbedUrl(mediaPreviewUrl) : null;
  const aboutText = funnelAbout.trim();
  const [isVideoUrlModalOpen, setIsVideoUrlModalOpen] = useState(false);
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [isAboutEditing, setIsAboutEditing] = useState(false);
  const videoUrlInputRef = useRef<HTMLInputElement | null>(null);
  const aboutTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!isVideoUrlModalOpen) return;
    const timeoutId = window.setTimeout(() => {
      videoUrlInputRef.current?.focus();
      videoUrlInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isVideoUrlModalOpen]);
  useEffect(() => {
    if (!isAboutEditing) return;
    const timeoutId = window.setTimeout(() => {
      aboutTextareaRef.current?.focus();
      const length = aboutTextareaRef.current?.value.length ?? 0;
      aboutTextareaRef.current?.setSelectionRange(length, length);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isAboutEditing]);
  const syncAboutTextareaHeight = () => {
    const textarea = aboutTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    if (!isAboutEditing) return;
    syncAboutTextareaHeight();
  }, [funnelAbout, isAboutEditing]);

  const setDraftConfig = (updater: (prev: CommunityFunnelConfig) => CommunityFunnelConfig) => {
    setCommunityFunnelConfig((prev) => updater(prev));
    markCommunityFunnelDirty();
  };

  const openVideoUrlModal = () => {
    if (isSaving) return;
    setVideoUrlDraft(mediaPreviewUrl ?? "");
    setVideoUrlError(null);
    setIsVideoUrlModalOpen(true);
  };

  const closeVideoUrlModal = () => {
    setVideoUrlError(null);
    setIsVideoUrlModalOpen(false);
  };

  const submitVideoUrlModal = () => {
    const trimmed = videoUrlDraft.trim();
    if (trimmed && !parseEmbedUrl(trimmed)) {
      setVideoUrlError("Use a YouTube, Vimeo, Loom, or Wistia link.");
      return;
    }
    setDraftConfig((prev) => ({
      ...prev,
      hero_media_url: trimmed || null,
      hero_media_kind: "video",
    }));
    setVideoUrlError(null);
    setIsVideoUrlModalOpen(false);
  };

  const handleReset = () => {
    if (isMediaDirty) handleResetCommunityFunnel();
    if (isFunnelAboutDirty) handleResetCommunityFunnelAbout();
    setIsAboutEditing(false);
  };

  const handleSave = async () => {
    if (isFunnelAboutDirty) {
      const savedCopy = await handleSaveCommunityFunnelAbout();
      if (savedCopy === false) return;
      setIsAboutEditing(false);
    }
    if (isMediaDirty) {
      const savedMedia = await handleSaveCommunityFunnel();
      if (savedMedia === false) return;
    }
  };
  const renderAboutEditor = () => {
    if (isAboutEditing) {
      return (
        <textarea
          ref={aboutTextareaRef}
          className="public-funnel-about funnel-editor-about-input"
          placeholder="Write the public about section for this community."
          value={funnelAbout}
          disabled={isSaving}
          onChange={(event) => {
            setFunnelAbout(event.target.value);
            markCommunitySettingsDirty();
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
          }}
          onBlur={() => {
            if (!isFunnelAboutDirty) setIsAboutEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            if (isFunnelAboutDirty) handleResetCommunityFunnelAbout();
            setIsAboutEditing(false);
          }}
        />
      );
    }

    return (
      <button
        type="button"
        className={`public-funnel-about funnel-editor-about-trigger${aboutText ? "" : " is-empty"}`}
        disabled={isSaving}
        onClick={() => setIsAboutEditing(true)}
      >
        {aboutText || "Add about copy"}
      </button>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Public funnel</div>

      <div className="agent-preview-actions">
        {isDirty ? (
          <button type="button" onClick={handleReset} disabled={isSaving}>
            Cancel
          </button>
        ) : (
          <button type="button" onClick={handlePreviewCommunityFunnel} disabled={isSaving}>
            Preview
          </button>
        )}
        <button
          type="button"
          className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
          onClick={() => void handleSave()}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? "Saving…" : isDirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {communitySettingsError ? <div className="auth-error">{communitySettingsError}</div> : null}
      {communityFunnelSaveError ? <div className="auth-error">{communityFunnelSaveError}</div> : null}

      <div className="funnel-editor-fields">
        <div className="funnel-editor-field">
          <div className="funnel-editor-field-label">Intro video</div>
          <div
            className="public-funnel-media-placeholder funnel-editor-media-dropzone"
            role="button"
            tabIndex={0}
            onClick={openVideoUrlModal}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openVideoUrlModal();
              }
            }}
          >
            {mediaPreviewUrl ? (
              communityFunnelConfig.hero_media_kind === "video" ? (
                <div className="public-funnel-media-shell">
                  {mediaPreviewEmbed ? (
                    <iframe
                      className="public-funnel-media-embed"
                      src={mediaPreviewEmbed.src}
                      title="Community funnel preview video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      className="public-funnel-media-video"
                      src={mediaPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  )}
                </div>
              ) : (
                <div className="public-funnel-media-shell">
                  <img className="public-funnel-media-image" src={mediaPreviewUrl} alt="" draggable={false} />
                </div>
              )
            ) : (
              <div className="public-funnel-media-placeholder-text">Click here to paste a video link.</div>
            )}
            <div className="funnel-editor-media-hint">
              {mediaPreviewUrl ? "Click to replace" : "Video link"}
            </div>
          </div>
        </div>

        <div className="funnel-editor-field">
          <div className="funnel-editor-field-label">About</div>
          {renderAboutEditor()}
        </div>
      </div>

      {isVideoUrlModalOpen ? (
        <div className="modal-overlay" onClick={closeVideoUrlModal}>
          <div
            className="modal funnel-video-url-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Embed video"
          >
            <div className="funnel-video-url-modal-body">
              <div className="funnel-video-url-modal-title">Embed video</div>
              <div className="funnel-video-url-modal-copy">
                Paste a YouTube, Vimeo, Loom, or Wistia video URL to show on the funnel.
              </div>
              <input
                ref={videoUrlInputRef}
                className="funnel-video-url-input"
                type="text"
                value={videoUrlDraft}
                onChange={(event) => {
                  setVideoUrlDraft(event.target.value);
                  if (videoUrlError) setVideoUrlError(null);
                }}
                placeholder="https://youtube.com/..."
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeVideoUrlModal();
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitVideoUrlModal();
                  }
                }}
              />
              {videoUrlError ? <div className="auth-error">{videoUrlError}</div> : null}
              <div className="funnel-video-url-modal-actions">
                <button type="button" className="funnel-video-url-cancel" onClick={closeVideoUrlModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="platform-save-button platform-save-button--compact"
                  onClick={submitVideoUrlModal}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
