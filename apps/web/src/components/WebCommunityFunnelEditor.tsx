import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelActionCardArt,
  buildCommunityFunnelCopy,
  filterOnlineAvatarFaces,
  formatCommunityLink,
} from "../../../../shared/communityFunnelUi";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { CommunityFunnelSurface } from "./CommunityFunnelSurface";

type PreviewCommunityLike = {
  slug?: string | null;
  name: string;
  one_liner: string | null;
  about?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
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
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  }> | null;
};

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
  previewCommunity: PreviewCommunityLike;
  previewVisibilityLabel: string;
  previewMemberCount: number | null;
  previewFunnelAction: "join" | "request_access" | "checkout";
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
    previewCommunity,
    previewVisibilityLabel,
    previewMemberCount,
    previewFunnelAction,
  } = props;

  const isDirty = communityFunnelDirtyRef.current;
  const funnelCopy = buildCommunityFunnelCopy(previewFunnelAction);
  const mediaPreviewUrl = communityFunnelConfig.hero_media_url ?? null;
  const mediaPreviewEmbed = mediaPreviewUrl ? parseEmbedUrl(mediaPreviewUrl) : null;
  const cardOneLiner = previewCommunity.one_liner?.trim() || funnelCopy.body;
  const aboutText = previewCommunity.about?.trim() || "";
  const communityLink = previewCommunity.slug ? formatCommunityLink(previewCommunity.slug) : null;
  const actionCardArt = buildCommunityFunnelActionCardArt({
    community: previewCommunity,
    funnel: communityFunnelConfig,
    heroMediaUrlOverride: mediaPreviewUrl,
  });
  const isPublishedVisibility = previewVisibilityLabel === "Published";
  const isFreePricing = previewFunnelAction !== "checkout";
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
  const previewAction = {
    communityName: previewCommunity.name,
    communityLinkLabel: previewCommunity.slug ? `c/${previewCommunity.slug}` : null,
    communityLinkHref: null,
    avatarUrl: previewCommunity.avatar_url ?? null,
    avatarFocusX: previewCommunity.avatar_focus_x ?? null,
    avatarFocusY: previewCommunity.avatar_focus_y ?? null,
    avatarZoom: previewCommunity.avatar_zoom ?? null,
    cardBlurb: cardOneLiner,
    memberCount: typeof previewMemberCount === "number" ? previewMemberCount : null,
    onlineCount: previewOnlineCount,
    adminCount: previewAdminCount,
    onlineFaces: previewFaces,
    primaryActionLabel: "Join now",
    isPrimaryActionDisabled: true,
    onPrimaryAction: () => {},
    canJoinWithApproval: false,
    showSignIn: false,
    approvalPending: false,
    approvalDenied: false,
    canRequestAgain: false,
    isPreviewMode: true,
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Public funnel</div>
      <div className="model-note agent-editor-intro">
        Edit the actual funnel media. Community identity and long-form copy come from Settings.
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
        <CommunityFunnelSurface
          title={previewCommunity.name}
          heroMediaKind={communityFunnelConfig.hero_media_kind}
          heroMediaUrl={mediaPreviewUrl}
          renderHeroMedia={() => (
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
          )}
          visibilityLabel={previewVisibilityLabel}
          visibilityVariant={isPublishedVisibility ? "published" : "unlisted"}
          memberCount={typeof previewMemberCount === "number" ? previewMemberCount : null}
          pricingLabel={pricingLabel}
          isFreePricing={isFreePricing}
          inlineAction={previewAction}
          sidebarAction={previewAction}
          heroArtImageUrl={actionCardArt.imageUrl}
          heroArtImageStyle={actionCardArt.imageStyle ?? null}
          aboutText={aboutText}
          emptyAboutContent={(
            <div className="public-funnel-note">
              Add the long-form about copy in Settings. It will appear here on the landing page.
            </div>
          )}
          inlineActionClassName="public-funnel-inline-cta funnel-editor-inline-cta"
        />
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
