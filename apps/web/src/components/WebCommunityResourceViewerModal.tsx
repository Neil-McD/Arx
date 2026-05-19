import type { ReactNode } from "react";

import { normalizeExternalUrl, parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import type { CommunityResource } from "./communityResourcesContracts";

type WebCommunityResourceViewerModalProps = {
  resource: CommunityResource | null;
  onClose: () => void;
};

export type WebCommunityResourceSourceLineage = {
  title: string;
  detail: string | null;
  onOpen?: () => void;
};

type WebCommunityResourceViewerContentProps = {
  resource: CommunityResource;
  eyebrow?: string;
  actions?: ReactNode;
  sourceLineage?: WebCommunityResourceSourceLineage | null;
};

function getHostLabel(rawUrl: string | null): string {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return "External";
  return url.hostname.replace(/^www\./i, "");
}

function getMeta(resource: CommunityResource): { primary: string; secondary: string | null } {
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed?.provider === "youtube") return { primary: "Video", secondary: "YouTube" };
  if (embed?.provider === "wistia") return { primary: "Video", secondary: "Wistia" };
  if (normalizeExternalUrl(resource.url)) return { primary: "Link", secondary: getHostLabel(resource.url) };
  return { primary: "Note", secondary: null };
}

function getStatusLabel(resource: CommunityResource): string {
  if (resource.resource_status === "draft") return "Draft";
  if (resource.resource_status === "review") return "Needs review";
  if (resource.resource_status === "processing") return "Processing";
  if (resource.resource_status === "failed") return "Failed";
  return "Published";
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, eyebrow = "Resource", actions = null, sourceLineage = null } = props;
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  const meta = getMeta(resource);
  const sourceUrl = normalizeExternalUrl(resource.url);
  const hostLabel = getHostLabel(resource.url);
  const hasSourceLineage = Boolean(resource.source_resource_id);

  return (
    <div className="resource-viewer-content">
      <div className="resource-viewer-header">
        <div className="resource-viewer-title-block">
          <div className="resource-viewer-eyebrow">{eyebrow}</div>
          <h2 className="resource-viewer-title">{resource.title}</h2>
        </div>
        {actions ? <div className="resource-viewer-actions">{actions}</div> : null}
      </div>
      <div className="resource-viewer-body">
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
              <span>{resource.resource_role === "source" ? "Source" : "Page"}</span>
              <span>{getStatusLabel(resource)}</span>
              {resource.pinned ? <span>Pinned</span> : null}
            </div>
            {sourceUrl ? (
              <a
                className="resource-viewer-link-surface"
                href={sourceUrl.toString()}
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
            <div className="resource-viewer-note-surface">
              <div className="resource-viewer-link-copy">
                <div className="resource-viewer-note-label">Path</div>
                <div className="resource-viewer-link-host">{resource.directory_path}</div>
                <div className="resource-viewer-link-detail">{resource.directory_uri}</div>
              </div>
            </div>
            {hasSourceLineage && sourceLineage?.onOpen ? (
              <button
                className="resource-viewer-link-surface resource-viewer-lineage-button"
                type="button"
                onClick={sourceLineage.onOpen}
                title="Open source"
                aria-label={`Open source ${sourceLineage.title}`}
              >
                <div className="resource-viewer-link-copy">
                  <div className="resource-viewer-link-label">Drafted from</div>
                  <div className="resource-viewer-link-host">{sourceLineage.title}</div>
                  {sourceLineage.detail ? (
                    <div className="resource-viewer-link-detail">{sourceLineage.detail}</div>
                  ) : null}
                </div>
                <div className="resource-viewer-link-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M7 17L17 7" />
                    <path d="M9 7h8v8" />
                  </svg>
                </div>
              </button>
            ) : hasSourceLineage ? (
              <div className="resource-viewer-note-surface">
                <div className="resource-viewer-link-copy">
                  <div className="resource-viewer-note-label">
                    {sourceLineage ? "Drafted from" : "Lineage"}
                  </div>
                  <div className="resource-viewer-link-host">
                    {sourceLineage?.title ?? "Original source unavailable"}
                  </div>
                  {sourceLineage?.detail ? (
                    <div className="resource-viewer-link-detail">{sourceLineage.detail}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {resource.body_md ? (
              <div className="resource-viewer-description-block">
                <div className="resource-viewer-description-label">Content</div>
                <div className="resource-viewer-description-shell">
                  <div className="resource-viewer-description">{resource.body_md}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebCommunityResourceViewerModal(props: WebCommunityResourceViewerModalProps) {
  const { resource, onClose } = props;

  if (!resource) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-viewer-modal" onClick={(event) => event.stopPropagation()}>
        <WebCommunityResourceViewerContent
          resource={resource}
          actions={(
            <button className="modal-close" onClick={onClose} title="Close">
              ×
            </button>
          )}
        />
      </div>
    </div>
  );
}
