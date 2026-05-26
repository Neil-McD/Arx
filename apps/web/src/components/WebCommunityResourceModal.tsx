import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

type WebCommunityResourceModalProps = {
  isOpen: boolean;
  hasActiveCommunity: boolean;
  editingResourceId: string | null;
  resourceTitleInput: string;
  resourceUrlInput: string;
  resourceBodyInput: string;
  resourcePinnedInput: boolean;
  resourceRoleInput: "page" | "source";
  resourceError: string | null;
  isSavingResource: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onChangeTitle: (value: string) => void;
  onChangeUrl: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangePinned: (value: boolean) => void;
  onChangeRole: (value: "page" | "source") => void;
};

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 17v4" />
      <path d="M8 3h8" />
      <path d="M9 3v6l-3 4h12l-3-4V3" />
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
    resourceRoleInput,
    resourceError,
    isSavingResource,
    onClose,
    onCancel,
    onSave,
    onChangeTitle,
    onChangeUrl,
    onChangeBody,
    onChangePinned,
    onChangeRole,
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
              Save a durable page or source for the community knowledge base.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <div className="resource-form-section">
              <div className="resource-field-label">Kind</div>
              <div className="resource-kind-segment" role="group" aria-label="Knowledge item kind">
                <button
                  type="button"
                  className={resourceRoleInput === "page" ? "is-active" : ""}
                  onClick={() => onChangeRole("page")}
                  disabled={!hasActiveCommunity}
                >
                  Page
                </button>
                <button
                  type="button"
                  className={resourceRoleInput === "source" ? "is-active" : ""}
                  onClick={() => onChangeRole("source")}
                  disabled={!hasActiveCommunity}
                >
                  Source
                </button>
              </div>
            </div>

            <div className="resource-form-section">
              <div className="resource-title-row">
                <div className="resource-field-label">Title</div>
                <button
                  className={`resource-modal-pin${resourcePinnedInput ? " is-active" : ""}`}
                  type="button"
                  onClick={() => onChangePinned(!resourcePinnedInput)}
                  title={resourcePinnedInput ? "Unpin resource" : "Pin resource"}
                  aria-pressed={resourcePinnedInput}
                  disabled={!hasActiveCommunity}
                >
                  <PinIcon />
                </button>
              </div>
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
                  Supports YouTube, Wistia, normal links, and PDF links. Leave blank for a written page.
                </div>
                {embed ? (
                  <div className="resource-source-status">
                    <div className="resource-source-status-media">
                      {embed.provider === "youtube" ? (
                        <img src={embed.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="resource-source-status-provider">Wistia</div>
                      )}
                    </div>
                    <div className="resource-source-status-copy">
                      <div className="resource-source-status-label">
                        {embed.provider === "youtube" ? "YouTube video" : "Wistia video"}
                      </div>
                      <div className="resource-source-status-text">
                        Will render in the resource library and open in the full viewer.
                      </div>
                    </div>
                  </div>
                ) : normalizedUrl ? (
                  <div className="resource-source-status">
                    <div className="resource-source-status-media is-placeholder">
                      <div className="resource-source-status-provider">{hostLabel ?? "Link"}</div>
                    </div>
                    <div className="resource-source-status-copy">
                      <div className="resource-source-status-label">External link</div>
                      <div className="resource-source-status-text">
                        Members can open the original source when they need it.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="resource-form-section">
              <div className="resource-field-label">Content</div>
              <textarea
                className="resource-description-input"
                placeholder={resourceRoleInput === "source" ? "Add extraction notes, context, or review instructions." : "Write the page content, context, or takeaway."}
                value={resourceBodyInput}
                onChange={(event) => onChangeBody(event.target.value)}
                disabled={!hasActiveCommunity}
              />
            </div>

            {resourceError && <div className="auth-error">{resourceError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button
              className="platform-save-button"
              onClick={() => void onSave()}
              disabled={
                !hasActiveCommunity ||
                isSavingResource ||
                resourceTitleInput.trim().length === 0 ||
                (resourceBodyInput.trim().length === 0 && resourceUrlInput.trim().length === 0)
              }
            >
              {isSavingResource ? "Saving..." : editingResourceId ? "Save changes" : "Save knowledge"}
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
