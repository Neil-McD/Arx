import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelActionCardArtStyle,
  buildCommunityFunnelCopy,
  filterOnlineAvatarFaces,
  formatCompactStat,
  formatCommunityLink,
  formatMemberCount,
  getCommunityInitials,
} from "../../../../shared/communityFunnelUi";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

type PreviewCommunityLike = {
  slug?: string | null;
  name: string;
  one_liner: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  admin_count?: number | null;
  online_count?: number | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
};

export type WebCommunityFunnelEditorProps = {
  communityFunnelDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityFunnel: () => Promise<boolean> | boolean;
  handleResetCommunityFunnel: () => void;
  handlePreviewCommunityFunnel: () => void;
  communityOneLiner: string;
  setCommunityOneLiner: Dispatch<SetStateAction<string>>;
  isSavingCommunityFunnel: boolean;
  communityFunnelSaveError: string | null;
  communityFunnelConfig: CommunityFunnelConfig;
  setCommunityFunnelConfig: Dispatch<SetStateAction<CommunityFunnelConfig>>;
  markCommunityFunnelDirty: () => void;
  previewCommunity: PreviewCommunityLike;
  previewVisibilityLabel: string;
  previewMemberCount: number | null;
  previewJoinMode: "join_free" | "request_access" | "checkout";
};

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const {
    communityFunnelDirtyRef,
    handleSaveCommunityFunnel,
    handleResetCommunityFunnel,
    handlePreviewCommunityFunnel,
    communityOneLiner,
    setCommunityOneLiner,
    isSavingCommunityFunnel,
    communityFunnelSaveError,
    communityFunnelConfig,
    setCommunityFunnelConfig,
    markCommunityFunnelDirty,
    previewCommunity,
    previewVisibilityLabel,
    previewMemberCount,
    previewJoinMode,
  } = props;

  const isDirty = communityFunnelDirtyRef.current;
  const funnelCopy = buildCommunityFunnelCopy(previewJoinMode);
  const mediaPreviewUrl = communityFunnelConfig.hero_media_url ?? null;
  const mediaPreviewEmbed = mediaPreviewUrl ? parseEmbedUrl(mediaPreviewUrl) : null;
  const aboutValue = communityFunnelConfig.about ?? "";
  const cardOneLiner = communityOneLiner;
  const communityLink = previewCommunity.slug ? formatCommunityLink(previewCommunity.slug) : null;
  const actionCardArtStyle = buildCommunityFunnelActionCardArtStyle({
    community: previewCommunity,
    funnel: communityFunnelConfig,
    heroMediaUrlOverride: mediaPreviewUrl,
  });
  const isPublishedVisibility = previewVisibilityLabel === "Published";
  const isFreePricing = previewJoinMode !== "checkout";
  const pricingLabel = isFreePricing ? "FREE" : "Paid";
  const previewAdminCount =
    typeof previewCommunity.admin_count === "number" ? previewCommunity.admin_count : null;
  const previewOnlineCount =
    typeof previewCommunity.online_count === "number" ? previewCommunity.online_count : null;
  const previewFaces = filterOnlineAvatarFaces(previewCommunity.online_faces, 4);
  const [isVideoUrlModalOpen, setIsVideoUrlModalOpen] = useState(false);
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const videoUrlInputRef = useRef<HTMLInputElement | null>(null);
  const aboutInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = aboutInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 120), 176);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 176 ? "auto" : "hidden";
  }, [aboutValue]);

  useEffect(() => {
    if (!isVideoUrlModalOpen) return;
    const timeoutId = window.setTimeout(() => {
      videoUrlInputRef.current?.focus();
      videoUrlInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isVideoUrlModalOpen]);

  const setDraftConfig = (updater: (prev: CommunityFunnelConfig) => CommunityFunnelConfig) => {
    setCommunityFunnelConfig((prev) => updater(prev));
    markCommunityFunnelDirty();
  };

  const openVideoUrlModal = () => {
    if (isSavingCommunityFunnel) return;
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
    handleResetCommunityFunnel();
  };

  const handleSave = async () => {
    await handleSaveCommunityFunnel();
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Public funnel</div>
      <div className="model-note agent-editor-intro">
        Edit the actual funnel. Use the media, long-form about copy, and CTA one-liner to shape the offer.
      </div>

      <div className="agent-preview-actions">
        {isDirty ? (
          <button type="button" onClick={handleReset} disabled={isSavingCommunityFunnel}>
            Cancel
          </button>
        ) : (
          <button type="button" onClick={handlePreviewCommunityFunnel} disabled={isSavingCommunityFunnel}>
            Preview
          </button>
        )}
        <button
          type="button"
          className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
          onClick={() => void handleSave()}
          disabled={isSavingCommunityFunnel || !isDirty}
        >
          {isSavingCommunityFunnel ? "Saving…" : isDirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {communityFunnelSaveError ? <div className="auth-error">{communityFunnelSaveError}</div> : null}

      <div className="funnel-editor-preview">
        <div className="public-funnel-page">
          <div className="public-funnel-shell public-funnel-shell-split">
            <article className="public-funnel-main-column">
              <h1 className="public-funnel-title">{previewCommunity.name}</h1>

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

              <div className="public-funnel-metadata-row">
                <div className="public-funnel-metadata-item">
                  {isPublishedVisibility ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  )}
                  {previewVisibilityLabel}
                </div>
                {typeof previewMemberCount === "number" ? (
                  <div className="public-funnel-metadata-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    {formatMemberCount(previewMemberCount)}
                  </div>
                ) : null}
                <div className={`public-funnel-metadata-item public-funnel-metadata-price${isFreePricing ? " is-free" : ""}`}>
                  {pricingLabel}
                </div>
              </div>

              <div className="public-funnel-inline-cta funnel-editor-inline-cta">
                <div className="public-funnel-action-content">
                  <textarea
                    className="public-funnel-action-copy funnel-editor-card-input"
                    value={cardOneLiner}
                    onChange={(event) => {
                      setCommunityOneLiner(event.target.value);
                      markCommunityFunnelDirty();
                    }}
                    placeholder={previewCommunity.one_liner ?? funnelCopy.body}
                  />

                  <button className="public-funnel-primary platform-save-button" type="button" disabled>
                    Join now
                  </button>

                  <div className="public-funnel-status">Preview mode. Actions are disabled.</div>
                </div>
              </div>

              <textarea
                ref={aboutInputRef}
                className="public-funnel-about funnel-editor-about-input"
                value={aboutValue}
                onChange={(event) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    about: event.target.value,
                  }))
                }
                placeholder="Click here and type to edit."
              />
            </article>

            <aside className="public-funnel-sidebar public-funnel-sidebar-desktop">
              <div className="public-funnel-action-card">
                <div className="public-funnel-hero-art" style={actionCardArtStyle} aria-hidden="true" />

                <div className="public-funnel-action-content">
                  <div className="public-funnel-avatar">
                    {previewCommunity.avatar_url ? (
                      <img
                        className="public-funnel-avatar-image"
                        src={previewCommunity.avatar_url}
                        alt={`${previewCommunity.name} avatar`}
                        draggable={false}
                      />
                    ) : (
                      <span className="public-funnel-avatar-fallback">{getCommunityInitials(previewCommunity.name)}</span>
                    )}
                  </div>

                  <div className="public-funnel-action-header">
                    <div className="public-funnel-action-name">{previewCommunity.name}</div>
                    {communityLink ? <div className="public-funnel-action-link">{communityLink}</div> : null}
                  </div>
                  <textarea
                    className="public-funnel-action-copy funnel-editor-card-input"
                    value={cardOneLiner}
                    onChange={(event) => {
                      setCommunityOneLiner(event.target.value);
                      markCommunityFunnelDirty();
                    }}
                    placeholder={previewCommunity.one_liner ?? funnelCopy.body}
                  />

                  <div className="public-funnel-action-stats">
                    {typeof previewMemberCount === "number" ? (
                      <div className="public-funnel-action-stat">
                        <div className="public-funnel-action-stat-value">{formatCompactStat(previewMemberCount)}</div>
                        <div className="public-funnel-action-stat-label">Members</div>
                      </div>
                    ) : null}
                    {typeof previewOnlineCount === "number" ? (
                      <div className="public-funnel-action-stat">
                        <div className="public-funnel-action-stat-value">{formatCompactStat(previewOnlineCount)}</div>
                        <div className="public-funnel-action-stat-label">Online</div>
                      </div>
                    ) : null}
                    {typeof previewAdminCount === "number" ? (
                      <div className="public-funnel-action-stat">
                        <div className="public-funnel-action-stat-value">{formatCompactStat(previewAdminCount)}</div>
                        <div className="public-funnel-action-stat-label">Admins</div>
                      </div>
                    ) : null}
                  </div>

                  {previewFaces.length > 0 ? (
                    <div className="public-funnel-face-strip" aria-label="People online now">
                      {previewFaces.map((face) => (
                        <img
                          key={face.user_id}
                          className="public-funnel-face"
                          src={face.avatar_url ?? ""}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                        />
                      ))}
                    </div>
                  ) : null}

                  <button className="public-funnel-primary platform-save-button" type="button" disabled>
                    Join now
                  </button>
                </div>
              </div>
              <div className="public-funnel-powered-by">Powered by Polynet</div>
            </aside>
          </div>
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
