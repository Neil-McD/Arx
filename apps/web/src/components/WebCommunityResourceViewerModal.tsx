import type { ReactNode } from "react";

import { normalizeExternalUrl, parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../../shared/markdownUi";
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
  actions?: ReactNode;
  sourceLineage?: WebCommunityResourceSourceLineage | null;
};

function getHostLabel(rawUrl: string | null): string {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return "External";
  return url.hostname.replace(/^www\./i, "");
}

function getMediaLabel(resource: CommunityResource): string {
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed?.provider === "youtube") return "YouTube";
  if (embed?.provider === "wistia") return "Wistia";
  if (normalizeExternalUrl(resource.url)) return getHostLabel(resource.url);
  return "Note";
}

function getKindLabel(resource: CommunityResource): string {
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed) return "Video";
  if (normalizeExternalUrl(resource.url)) return "Link";
  return "Note";
}

function getRoleLabel(resource: CommunityResource): string {
  return resource.resource_role === "source" ? "Source" : "Page";
}

function getStatusLabel(resource: CommunityResource): string {
  if (resource.resource_status === "draft") return "Draft";
  if (resource.resource_status === "review") return "Needs review";
  if (resource.resource_status === "processing") return "Processing";
  if (resource.resource_status === "failed") return "Failed";
  return "Published";
}

function isUnpublishedStatus(resource: CommunityResource): boolean {
  return resource.resource_status !== undefined && resource.resource_status !== "published";
}

function buildEyebrow(resource: CommunityResource): string {
  return [getRoleLabel(resource), getKindLabel(resource), getMediaLabel(resource)]
    .filter((part, index, list) => part && list.indexOf(part) === index)
    .join(" · ");
}

function PinIcon() {
  return (
    <svg className="resource-viewer-pin-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v6l-3 3v1h10v-1l-3-3V3" />
      <path d="M12 13v8" />
    </svg>
  );
}

function ExternalArrowIcon() {
  return (
    <svg className="resource-viewer-citation-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, actions = null, sourceLineage = null } = props;
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  const sourceUrl = normalizeExternalUrl(resource.url);
  const hostLabel = getHostLabel(resource.url);
  const eyebrow = buildEyebrow(resource);
  const showStatusPill = isUnpublishedStatus(resource);
  const statusLabel = getStatusLabel(resource);
  const trimmedBody = resource.body_md?.trim() ?? "";
  const hasBody = trimmedBody.length > 0;
  const hasExternalLink = Boolean(sourceUrl) && !embed;
  const hasLineage = Boolean(resource.source_resource_id && sourceLineage);
  const showCitation = hasExternalLink || hasLineage;
  const isEmpty = !embed && !hasBody && !showCitation;

  return (
    <div className="resource-viewer-content">
      <div className="resource-viewer-header">
        <div className="resource-viewer-eyebrow">{eyebrow}</div>
        <div className="resource-viewer-title-row">
          <h1 className="resource-viewer-title">
            <span>{resource.title}</span>
            {resource.pinned ? <PinIcon /> : null}
          </h1>
          <div className="resource-viewer-header-aside">
            {showStatusPill ? (
              <span
                className={`resource-viewer-status-pill resource-viewer-status-${resource.resource_status ?? "draft"}`}
              >
                {statusLabel}
              </span>
            ) : null}
            {actions ? <div className="resource-viewer-actions">{actions}</div> : null}
          </div>
        </div>
      </div>

      <div className="resource-viewer-body">
        <div className="resource-viewer-column">
          {embed ? (
            <div className="resource-viewer-embed">
              <iframe
                src={embed.src}
                title={`${resource.title} embed`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ) : null}

          {hasBody ? (
            <div className="resource-viewer-prose">{renderMarkdown(trimmedBody)}</div>
          ) : null}

          {isEmpty ? (
            <div className="resource-viewer-empty">This page hasn’t been written yet.</div>
          ) : null}

          {showCitation ? (
            <div className="resource-viewer-citation">
              {hasExternalLink ? (
                <a
                  className="resource-viewer-citation-cell"
                  href={sourceUrl!.toString()}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="resource-viewer-citation-copy">
                    <div className="resource-viewer-citation-label">Source</div>
                    <div className="resource-viewer-citation-value">{hostLabel}</div>
                  </div>
                  <ExternalArrowIcon />
                </a>
              ) : null}

              {hasLineage ? (
                sourceLineage?.onOpen ? (
                  <button
                    className="resource-viewer-citation-cell resource-viewer-citation-cell-button"
                    type="button"
                    onClick={sourceLineage.onOpen}
                    title="Open source"
                    aria-label={`Open source ${sourceLineage.title}`}
                  >
                    <div className="resource-viewer-citation-copy">
                      <div className="resource-viewer-citation-label">Drafted from</div>
                      <div className="resource-viewer-citation-value">{sourceLineage.title}</div>
                      {sourceLineage.detail ? (
                        <div className="resource-viewer-citation-detail">{sourceLineage.detail}</div>
                      ) : null}
                    </div>
                    <ExternalArrowIcon />
                  </button>
                ) : (
                  <div className="resource-viewer-citation-cell resource-viewer-citation-cell-static">
                    <div className="resource-viewer-citation-copy">
                      <div className="resource-viewer-citation-label">Drafted from</div>
                      <div className="resource-viewer-citation-value">
                        {sourceLineage?.title ?? "Original source unavailable"}
                      </div>
                      {sourceLineage?.detail ? (
                        <div className="resource-viewer-citation-detail">{sourceLineage.detail}</div>
                      ) : null}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ) : null}
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
