import { useEffect, useState, type ReactNode } from "react";

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

function getEmbedProviderLabel(provider: string | null | undefined): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "wistia") return "Wistia";
  return "Video";
}

function getRoleLabel(resource: CommunityResource): string {
  return resource.resource_role === "source" ? "Source" : "Page";
}

function buildEyebrow(resource: CommunityResource): string {
  const role = getRoleLabel(resource);
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed) return `${role} · ${getEmbedProviderLabel(embed.provider)}`;
  if (normalizeExternalUrl(resource.url)) return `${role} · ${getHostLabel(resource.url)}`;
  return role;
}

function formatCreatedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return parsed.toISOString();
  }
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
    <svg className="resource-viewer-external-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort only
    }
  };
  return (
    <button
      className="resource-viewer-details-copy"
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ResourceDetailsSheet(props: {
  resource: CommunityResource;
  sourceLineage: WebCommunityResourceSourceLineage | null;
  actions: ReactNode;
  onClose: () => void;
}) {
  const { resource, sourceLineage, actions, onClose } = props;
  const createdAt = formatCreatedAt(resource.created_at);
  const hasLineage = Boolean(resource.source_resource_id && sourceLineage);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside className="resource-viewer-details" aria-label="Resource details">
      <div className="resource-viewer-details-header">
        <div className="resource-viewer-details-title">Details</div>
        <button
          className="resource-viewer-details-close"
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close details"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="resource-viewer-details-body">
        {hasLineage ? (
          <div className="resource-viewer-details-row">
            <div className="resource-viewer-details-label">Drafted from</div>
            <div className="resource-viewer-details-value">
              {sourceLineage?.onOpen ? (
                <button
                  className="resource-viewer-details-link"
                  type="button"
                  onClick={sourceLineage.onOpen}
                  title="Open source"
                >
                  <span>{sourceLineage.title}</span>
                  <ExternalArrowIcon />
                </button>
              ) : (
                <div className="resource-viewer-details-static">
                  {sourceLineage?.title ?? "Original source unavailable"}
                </div>
              )}
              {sourceLineage?.detail ? (
                <div className="resource-viewer-details-detail">{sourceLineage.detail}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="resource-viewer-details-row">
          <div className="resource-viewer-details-label">Path</div>
          <div className="resource-viewer-details-value">
            <div className="resource-viewer-details-static">{resource.directory_path}</div>
          </div>
        </div>

        <div className="resource-viewer-details-row">
          <div className="resource-viewer-details-label">URI</div>
          <div className="resource-viewer-details-value">
            <code className="resource-viewer-details-code">{resource.directory_uri}</code>
            <CopyButton value={resource.directory_uri} />
          </div>
        </div>

        {createdAt ? (
          <div className="resource-viewer-details-row">
            <div className="resource-viewer-details-label">Created</div>
            <div className="resource-viewer-details-value">
              <div className="resource-viewer-details-static">{createdAt}</div>
            </div>
          </div>
        ) : null}

        {actions ? (
          <div className="resource-viewer-details-actions">
            <div className="resource-viewer-details-label">Actions</div>
            <div className="resource-viewer-details-actions-row">{actions}</div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, actions = null, sourceLineage = null } = props;
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  const sourceUrl = normalizeExternalUrl(resource.url);
  const hostLabel = getHostLabel(resource.url);
  const eyebrow = buildEyebrow(resource);
  const trimmedBody = resource.body_md?.trim() ?? "";
  const hasBody = trimmedBody.length > 0;
  const verificationLink: { label: string; href: string } | null = sourceUrl
    ? {
        label: embed
          ? `Watch on ${getEmbedProviderLabel(embed.provider)}`
          : `Read on ${hostLabel}`,
        href: sourceUrl.toString(),
      }
    : null;
  const showDetailsTrigger = Boolean(actions);
  const isEmpty = !embed && !hasBody && !verificationLink;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

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
            {showDetailsTrigger ? (
              <button
                className="resource-viewer-details-trigger"
                type="button"
                onClick={() => setIsDetailsOpen((open) => !open)}
                aria-expanded={isDetailsOpen}
                aria-label="Show details"
                title="Show details"
              >
                <MoreIcon />
              </button>
            ) : null}
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

          {verificationLink ? (
            <a
              className="resource-viewer-verification-link"
              href={verificationLink.href}
              target="_blank"
              rel="noreferrer"
            >
              <span>{verificationLink.label}</span>
              <ExternalArrowIcon />
            </a>
          ) : null}

          {isEmpty ? (
            <div className="resource-viewer-empty">This page hasn’t been written yet.</div>
          ) : null}
        </div>
      </div>

      {isDetailsOpen ? (
        <ResourceDetailsSheet
          resource={resource}
          sourceLineage={sourceLineage}
          actions={actions}
          onClose={() => setIsDetailsOpen(false)}
        />
      ) : null}
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
