import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";

type PreviewCommunityLike = {
  slug?: string | null;
  name: string;
  description: string | null;
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

type UploadedCommunityFunnelMedia = {
  storageId: string;
  kind: "image" | "video";
};

export type WebCommunityFunnelEditorProps = {
  communityFunnelDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityFunnel: () => Promise<boolean> | boolean;
  handleResetCommunityFunnel: () => void;
  handleUploadCommunityFunnelMedia: (file: File) => Promise<UploadedCommunityFunnelMedia>;
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

function getCommunityInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PN"
  );
}

function formatMemberCount(value: number): string {
  return `${new Intl.NumberFormat().format(value)} members`;
}

function formatCompactStat(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatCommunityLink(slug: string): string {
  return `polynet.com/c/${slug}`;
}

function buildHeroStyle(community: PreviewCommunityLike): CSSProperties | undefined {
  if (!community.banner_url) return undefined;
  const x = typeof community.banner_focus_x === "number" ? community.banner_focus_x : 50;
  const y = typeof community.banner_focus_y === "number" ? community.banner_focus_y : 50;
  const zoom = typeof community.banner_zoom === "number" ? community.banner_zoom : 1;
  return {
    backgroundImage: `url(${community.banner_url})`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundSize: `${Math.max(100, zoom * 100)}%`,
  };
}

function buildActionCardArtStyle(
  community: PreviewCommunityLike,
  config: CommunityFunnelConfig,
  mediaPreviewUrl: string | null,
): CSSProperties | undefined {
  if (config.hero_media_kind === "image" && mediaPreviewUrl) {
    return {
      backgroundImage: `url(${mediaPreviewUrl})`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }
  return buildHeroStyle(community);
}

function buildFunnelCopy(mode: "join_free" | "request_access" | "checkout"): {
  eyebrow: string;
  body: string;
} {
  if (mode === "checkout") {
    return { eyebrow: "Paid access", body: "Unlock access and continue into the community." };
  }
  if (mode === "request_access") {
    return { eyebrow: "Approval required", body: "Request access to enter the community." };
  }
  return { eyebrow: "Open access", body: "Enter immediately and start participating." };
}

function isSupportedMediaFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  return mime.startsWith("image/") || mime.startsWith("video/");
}

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const {
    communityFunnelDirtyRef,
    handleSaveCommunityFunnel,
    handleResetCommunityFunnel,
    handleUploadCommunityFunnelMedia,
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMediaDragOver, setIsMediaDragOver] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [localMediaPreviewUrl, setLocalMediaPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localMediaPreviewUrl) {
        URL.revokeObjectURL(localMediaPreviewUrl);
      }
    };
  }, [localMediaPreviewUrl]);

  const isDirty = communityFunnelDirtyRef.current;
  const funnelCopy = buildFunnelCopy(previewJoinMode);
  const mediaPreviewUrl = localMediaPreviewUrl ?? communityFunnelConfig.hero_media_url ?? null;
  const aboutValue = communityFunnelConfig.about ?? "";
  const cardOneLiner = communityOneLiner;
  const communityLink = previewCommunity.slug ? formatCommunityLink(previewCommunity.slug) : null;
  const actionCardArtStyle = buildActionCardArtStyle(previewCommunity, communityFunnelConfig, mediaPreviewUrl);
  const previewAdminCount =
    typeof previewCommunity.admin_count === "number" ? previewCommunity.admin_count : null;
  const previewOnlineCount =
    typeof previewCommunity.online_count === "number" ? previewCommunity.online_count : null;
  const previewFaces = previewCommunity.online_faces?.filter(Boolean).slice(0, 8) ?? [];

  const avatarNode = useMemo(() => {
    if (previewCommunity.avatar_url) {
      return (
        <img
          className="public-funnel-avatar-image"
          src={previewCommunity.avatar_url}
          alt={`${previewCommunity.name} avatar`}
          draggable={false}
        />
      );
    }
    return <span className="public-funnel-avatar-fallback">{getCommunityInitials(previewCommunity.name)}</span>;
  }, [previewCommunity.avatar_url, previewCommunity.name]);

  const setDraftConfig = (updater: (prev: CommunityFunnelConfig) => CommunityFunnelConfig) => {
    setCommunityFunnelConfig((prev) => updater(prev));
    markCommunityFunnelDirty();
  };

  const openFilePicker = () => {
    if (isUploadingMedia || isSavingCommunityFunnel) return;
    fileInputRef.current?.click();
  };

  const clearLocalPreview = () => {
    setLocalMediaPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const handleMediaFile = async (file: File | null) => {
    if (!file) return;
    if (!isSupportedMediaFile(file)) {
      setMediaUploadError("Upload an image or video file.");
      return;
    }
    setMediaUploadError(null);
    setIsUploadingMedia(true);
    try {
      const uploaded = await handleUploadCommunityFunnelMedia(file);
      clearLocalPreview();
      const nextPreviewUrl = URL.createObjectURL(file);
      setLocalMediaPreviewUrl(nextPreviewUrl);
      setDraftConfig((prev) => ({
        ...prev,
        hero_media_storage_id: uploaded.storageId,
        hero_media_kind: uploaded.kind,
      }));
    } catch (error) {
      setMediaUploadError(error instanceof Error ? error.message : "Failed to upload media.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleReset = () => {
    clearLocalPreview();
    setMediaUploadError(null);
    handleResetCommunityFunnel();
  };

  const handleSave = async () => {
    const saved = await handleSaveCommunityFunnel();
    if (saved) {
      clearLocalPreview();
      setMediaUploadError(null);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Public funnel</div>
      <div className="model-note agent-editor-intro">
        Edit the actual funnel. Use the media, long-form about copy, and CTA one-liner to shape the offer.
      </div>

      <div className="agent-preview-actions">
        {isDirty ? (
          <button type="button" onClick={handleReset} disabled={isSavingCommunityFunnel || isUploadingMedia}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
          onClick={() => void handleSave()}
          disabled={isSavingCommunityFunnel || isUploadingMedia || !isDirty}
        >
          {isSavingCommunityFunnel ? "Saving…" : isUploadingMedia ? "Uploading…" : isDirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {communityFunnelSaveError ? <div className="auth-error">{communityFunnelSaveError}</div> : null}
      {mediaUploadError ? <div className="auth-error">{mediaUploadError}</div> : null}

      <div className="funnel-editor-preview">
        <div className="public-funnel-page">
          <div className="public-funnel-shell public-funnel-shell-split">
            <article className="public-funnel-main-column">
              <h1 className="public-funnel-title">{previewCommunity.name}</h1>

              <div
                className={`public-funnel-media-placeholder funnel-editor-media-dropzone${isMediaDragOver ? " is-drag-over" : ""}${isUploadingMedia ? " is-uploading" : ""}`}
                role="button"
                tabIndex={0}
                aria-busy={isUploadingMedia || undefined}
                onClick={openFilePicker}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openFilePicker();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isUploadingMedia) setIsMediaDragOver(true);
                }}
                onDragLeave={() => setIsMediaDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsMediaDragOver(false);
                  void handleMediaFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                {mediaPreviewUrl ? (
                  communityFunnelConfig.hero_media_kind === "video" ? (
                    <div className="public-funnel-media-shell">
                      <video
                        className="public-funnel-media-video"
                        src={mediaPreviewUrl}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  ) : (
                    <div className="public-funnel-media-shell">
                      <img className="public-funnel-media-image" src={mediaPreviewUrl} alt="" draggable={false} />
                    </div>
                  )
                ) : (
                  <div className="public-funnel-media-placeholder-text">
                    {isUploadingMedia ? "Uploading media…" : "Drop images or videos here, or click to upload"}
                  </div>
                )}
                <div className="funnel-editor-media-hint">
                  {isUploadingMedia ? "Processing…" : mediaPreviewUrl ? "Click or drop to replace" : "Image or video"}
                </div>
                <input
                  ref={fileInputRef}
                  className="funnel-editor-file-input"
                  type="file"
                  accept="image/*,video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void handleMediaFile(file);
                  }}
                />
              </div>

              <div className="public-funnel-metadata-row">
                <div className="public-funnel-metadata-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  {previewVisibilityLabel}
                </div>
                {typeof previewMemberCount === "number" ? (
                  <div className="public-funnel-metadata-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    {formatMemberCount(previewMemberCount)}
                  </div>
                ) : null}
                <div className="public-funnel-metadata-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                  {previewJoinMode === "checkout" ? "Paid" : "Free"}
                </div>
              </div>

              <textarea
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

            <aside className="public-funnel-sidebar">
              <div className="public-funnel-action-card">
                <div className="public-funnel-hero-art" style={actionCardArtStyle} aria-hidden="true" />

                <div className="public-funnel-action-content">
                  <div className="public-funnel-avatar">{avatarNode}</div>

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
                    placeholder={previewCommunity.description ?? funnelCopy.body}
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
                    <div className="public-funnel-face-strip" aria-label="Community members">
                      {previewFaces.map((face) =>
                        face.avatar_url ? (
                          <img
                            key={face.user_id}
                            className="public-funnel-face"
                            src={face.avatar_url}
                            alt={face.display_name ?? "Community member"}
                          />
                        ) : (
                          <span key={face.user_id} className="public-funnel-face public-funnel-face-fallback">
                            {getCommunityInitials(face.display_name ?? "Member")}
                          </span>
                        ),
                      )}
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
    </div>
  );
}
