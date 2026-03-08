import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

type WebCommunityResourceModalProps = {
  isOpen: boolean;
  hasActiveCommunity: boolean;
  editingResourceId: string | null;
  resourceTitleInput: string;
  resourceUrlInput: string;
  resourceBodyInput: string;
  resourcePinnedInput: boolean;
  resourceError: string | null;
  isSavingResource: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onChangeTitle: (value: string) => void;
  onChangeUrl: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangePinned: (value: boolean) => void;
};

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
    </svg>
  );
}

function normalizeExternalUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

export function WebCommunityResourceModal(props: WebCommunityResourceModalProps) {
  const {
    isOpen,
    hasActiveCommunity,
    editingResourceId,
    resourceTitleInput,
    resourceUrlInput,
    resourceBodyInput,
    resourcePinnedInput,
    resourceError,
    isSavingResource,
    onClose,
    onCancel,
    onSave,
    onChangeTitle,
    onChangeUrl,
    onChangeBody,
    onChangePinned,
  } = props;

  if (!isOpen) return null;

  const rawUrl = resourceUrlInput.trim();
  const embed = rawUrl ? parseEmbedUrl(rawUrl) : null;
  const normalizedUrl = rawUrl ? normalizeExternalUrl(rawUrl) : null;
  const hostLabel = normalizedUrl?.hostname.replace(/^www\./i, "") ?? null;
  const sourceShellClassName = embed
    ? "resource-source-shell is-valid"
    : normalizedUrl
      ? "resource-source-shell is-external"
      : "resource-source-shell";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{editingResourceId ? "Edit resource" : "Add resource"}</div>
            <div className="resource-modal-subtitle">
              Save a durable link, video, or note that members can come back to.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <div className="resource-form-section">
              <div className="resource-field-label">Title</div>
              <input
                className="resource-title-input"
                type="text"
                placeholder="Give this resource a clear title"
                value={resourceTitleInput}
                onChange={(event) => onChangeTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSave();
                  }
                }}
                disabled={!hasActiveCommunity}
              />
            </div>

            <div className="resource-form-section resource-source-section">
              <div className="resource-field-label">Source</div>
              <div className={sourceShellClassName}>
                <div className="resource-source-input-row">
                  <div className="resource-source-icon" aria-hidden="true">
                    <LinkIcon />
                  </div>
                  <input
                    className="resource-source-input"
                    type="text"
                    placeholder="Paste a link or video URL (optional)"
                    value={resourceUrlInput}
                    onChange={(event) => onChangeUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void onSave();
                      }
                    }}
                    disabled={!hasActiveCommunity}
                  />
                </div>
                <div className="resource-source-hint">
                  Supports YouTube, Wistia, and normal links. Leave blank if this is just a note.
                </div>
                {embed ? (
                  <div className="resource-source-preview">
                    <div className={embed.provider === "youtube" ? "resource-source-preview-visual" : "resource-source-preview-visual placeholder"}>
                      {embed.provider === "youtube" ? (
                        <img src={embed.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="resource-source-preview-provider">Wistia</div>
                      )}
                      <div className="resource-source-preview-play">▶</div>
                    </div>
                    <div className="resource-source-preview-meta">
                      <div className="resource-source-preview-label">
                        {embed.provider === "youtube" ? "YouTube video" : "Wistia video"}
                      </div>
                      <div className="resource-source-preview-subtitle">
                        This will render as a richer preview in the resource library and open in the full viewer.
                      </div>
                    </div>
                  </div>
                ) : normalizedUrl ? (
                  <div className="resource-source-preview">
                    <div className="resource-source-preview-visual placeholder">
                      <div className="resource-source-preview-provider">{hostLabel ?? "Link"}</div>
                    </div>
                    <div className="resource-source-preview-meta">
                      <div className="resource-source-preview-label">External link</div>
                      <div className="resource-source-preview-subtitle">
                        Members will see a clean source surface and can open the original link when they need it.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="resource-form-section">
              <div className="resource-field-label">Description</div>
              <textarea
                className="resource-description-input"
                placeholder="Add the context, takeaway, or reason this matters."
                value={resourceBodyInput}
                onChange={(event) => onChangeBody(event.target.value)}
                disabled={!hasActiveCommunity}
              />
            </div>

            <label className="resource-pin-row">
              <div className="resource-pin-copy">
                <div className="resource-pin-title">Pin to top</div>
                <div className="resource-pin-text">
                  Keep this resource surfaced first in the library.
                </div>
              </div>
              <div className="resource-pin-control">
                <input
                  type="checkbox"
                  checked={resourcePinnedInput}
                  onChange={(event) => onChangePinned(event.target.checked)}
                  disabled={!hasActiveCommunity}
                />
              </div>
            </label>

            {resourceError && <div className="auth-error">{resourceError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button
              className="resource-modal-save"
              onClick={() => void onSave()}
              disabled={
                !hasActiveCommunity ||
                isSavingResource ||
                resourceTitleInput.trim().length === 0 ||
                resourceBodyInput.trim().length === 0
              }
            >
              {isSavingResource ? "Saving..." : editingResourceId ? "Save changes" : "Save resource"}
            </button>
            <button className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
