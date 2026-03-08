import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import type { CommunityResource } from "../../../../src/components/communityResourcesContracts";

type WebCommunityResourceViewerModalProps = {
  resource: CommunityResource | null;
  onClose: () => void;
};

function normalizeExternalUrl(rawUrl: string | null): URL | null {
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
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

function getHostLabel(rawUrl: string | null): string {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return "External";
  return url.hostname.replace(/^www\./i, "");
}

function getMeta(resource: CommunityResource): { primary: string; secondary: string | null } {
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed?.provider === "youtube") return { primary: "Video", secondary: "YouTube" };
  if (embed?.provider === "wistia") return { primary: "Video", secondary: "Wistia" };
  if (resource.url) return { primary: "Link", secondary: getHostLabel(resource.url) };
  return { primary: "Note", secondary: null };
}

export function WebCommunityResourceViewerModal(props: WebCommunityResourceViewerModalProps) {
  const { resource, onClose } = props;

  if (!resource) return null;

  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  const meta = getMeta(resource);
  const hostLabel = getHostLabel(resource.url);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-viewer-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header resource-viewer-header">
          <div className="resource-viewer-title-block">
            <div className="resource-viewer-eyebrow">Resource</div>
            <h2 className="resource-viewer-title">{resource.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body resource-viewer-body">
          <div className={embed ? "resource-viewer-layout has-media" : "resource-viewer-layout"}>
            {embed ? (
              <div className="resource-viewer-media">
                <iframe
                  src={embed.src}
                  title={`${resource.title} embed`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : null}
            <div className="resource-viewer-sidebar">
              <div className="resource-viewer-meta">
                <span>{meta.primary}</span>
                {meta.secondary ? <span>{meta.secondary}</span> : null}
                {resource.pinned ? <span>Pinned</span> : null}
              </div>
              {resource.url ? (
                <a
                  className="resource-viewer-link-surface"
                  href={normalizeExternalUrl(resource.url)?.toString() ?? resource.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="resource-viewer-link-copy">
                    <div className="resource-viewer-link-label">Source</div>
                    <div className="resource-viewer-link-host">{hostLabel}</div>
                  </div>
                  <div className="resource-viewer-link-arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7 17L17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </div>
                </a>
              ) : (
                <div className="resource-viewer-note-surface">
                  <div className="resource-viewer-link-copy">
                    <div className="resource-viewer-note-label">Type</div>
                    <div className="resource-viewer-link-host">{meta.primary}</div>
                  </div>
                </div>
              )}
              {resource.body_md ? (
                <div className="resource-viewer-description-block">
                  <div className="resource-viewer-description-label">Description</div>
                  <div className="resource-viewer-description-shell">
                    <div className="resource-viewer-description">{resource.body_md}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
