import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import type {
  CommunityResource,
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "../../../../src/components/communityResourcesContracts";
import { WebCommunityResourceViewerModal } from "./WebCommunityResourceViewerModal";
import { WebDeleteResourceModal } from "./WebDeleteResourceModal";

type CommunityResourcesPanelProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
};

type ResourceTitleProps = {
  title: string;
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

function getResourceMeta(resource: CommunityResource): { primary: string; secondary: string | null } {
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed?.provider === "youtube") return { primary: "Video", secondary: "YouTube" };
  if (embed?.provider === "wistia") return { primary: "Video", secondary: "Wistia" };
  if (resource.url) return { primary: "Link", secondary: getHostLabel(resource.url) };
  return { primary: "Note", secondary: null };
}

function ResourceTitle(props: ResourceTitleProps) {
  const { title } = props;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const node = shellRef.current;
    if (!node) return;

    const measure = () => {
      setIsTruncated(node.scrollWidth - node.clientWidth > 6);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div
      ref={shellRef}
      className={isTruncated ? "resource-card-title-shell is-truncated" : "resource-card-title-shell"}
    >
      <h3 className="resource-card-title">{title}</h3>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7.5v9l7-4.5z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v6l-3 3v1h10v-1l-3-3V3" />
      <path d="M12 13v8" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
    </svg>
  );
}

function ResourceCard(props: {
  resource: CommunityResource;
  onOpenViewer: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const { resource, onOpenViewer, onEdit, onDelete, canManage } = props;
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  const meta = getResourceMeta(resource);
  const summary = (resource.body_md ?? "").trim();
  const canToggleSummary = summary.length > 140;
  const hostLabel = getHostLabel(resource.url);

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenViewer();
    }
  };

  return (
    <article
      className={`resource-card is-clickable${resource.pinned ? " is-pinned" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpenViewer}
      onKeyDown={handleCardKeyDown}
    >
      <div className="resource-card-topline">
        <div className="resource-card-title-row">
          {resource.pinned ? (
            <div className="resource-card-pin-icon" aria-hidden="true">
              <PinIcon />
            </div>
          ) : null}
          <ResourceTitle title={resource.title} />
        </div>
        {canManage ? (
          <div className="resource-card-header-side">
            <div className="resource-card-actions">
              <button
                className="resource-card-action"
                type="button"
                title="Edit resource"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                <EditIcon />
              </button>
              <button
                className="resource-card-action danger"
                type="button"
                title="Delete resource"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <DeleteIcon />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="resource-card-meta">
        <span>{meta.primary}</span>
        {meta.secondary ? <span>{meta.secondary}</span> : null}
      </div>

      {summary ? (
        <div className={`resource-card-summary-block${canToggleSummary ? " can-toggle" : ""}`}>
          <p className={canToggleSummary ? "resource-card-summary clamped" : "resource-card-summary"}>{summary}</p>
          {canToggleSummary ? (
            <button
              className="resource-card-summary-toggle"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenViewer();
              }}
            >
              More
            </button>
          ) : null}
        </div>
      ) : null}

      {embed ? (
        <div className="resource-card-preview" aria-hidden="true">
          {embed.provider === "youtube" ? (
            <img src={embed.thumbnailUrl} alt="" loading="lazy" />
          ) : (
            <div className="resource-card-preview-placeholder">
              <div className="resource-card-preview-provider">{meta.secondary ?? "Embed"}</div>
            </div>
          )}
          <div className="resource-card-preview-overlay" />
          <div className="resource-card-preview-play">
            <PlayIcon />
          </div>
        </div>
      ) : resource.url ? (
        <div className="resource-card-link-surface" aria-hidden="true">
          <div className="resource-card-link-icon" aria-hidden="true">
            <LinkIcon />
          </div>
          <div className="resource-card-link-copy">
            <div className="resource-card-link-label">Source</div>
            <div className="resource-card-link-host">{hostLabel}</div>
          </div>
          <div className="resource-card-link-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 17L17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CommunityResourcesPanel(props: CommunityResourcesPanelProps) {
  const { capabilities, state, actions } = props;
  const [viewerResourceId, setViewerResourceId] = useState<string | null>(null);
  const [pendingDeleteResourceId, setPendingDeleteResourceId] = useState<string | null>(null);
  const [isDeletingResource, setIsDeletingResource] = useState(false);

  const viewerResource = useMemo(
    () => state.resources.find((resource) => resource.id === viewerResourceId) ?? null,
    [state.resources, viewerResourceId],
  );
  const pendingDeleteResource = useMemo(
    () => state.resources.find((resource) => resource.id === pendingDeleteResourceId) ?? null,
    [state.resources, pendingDeleteResourceId],
  );

  useEffect(() => {
    if (viewerResourceId && !viewerResource) {
      setViewerResourceId(null);
    }
  }, [viewerResource, viewerResourceId]);

  useEffect(() => {
    if (pendingDeleteResourceId && !pendingDeleteResource) {
      setPendingDeleteResourceId(null);
      setIsDeletingResource(false);
    }
  }, [pendingDeleteResource, pendingDeleteResourceId]);

  return (
    <>
      <div className="community-panel resources-panel">
        <div className="feed-header-row">
          <div className="feed-header-copy">
            <div className="resources-header">Resources</div>
            <div className="feed-header-subtitle">
              Durable links, videos, and notes for {capabilities.activeCommunityName ?? "this community"}.
            </div>
          </div>
          <div className="feed-header-actions">
            <div className="feed-header-badge" aria-label={`${state.resources.length} resources`}>
              {state.resources.length}
            </div>
            {capabilities.hasActiveCommunity && capabilities.canCreateResources ? (
              <button className="resources-add-btn" onClick={actions.openNewResourceModal} title="Add resource">
                +
              </button>
            ) : null}
          </div>
        </div>

        {state.resourceSuccess ? (
          <div className="success-toast">Resource saved successfully!</div>
        ) : null}

        {state.isLoadingResources ? (
          <div className="community-panel-state-shell">
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Loading resources...</span>
            </div>
          </div>
        ) : state.resources.length === 0 ? (
          <div className="community-panel-state-shell">
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                </svg>
              </div>
              <div className="chat-empty-title">
                Welcome to {capabilities.activeCommunityName ?? "your"} resources
              </div>
              <div className="chat-empty-text">
                Share links, videos, and notes that members can come back to.
              </div>
            </div>
          </div>
        ) : (
          <div className="resource-library">
            <div className="resource-grid">
              {state.resources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onOpenViewer={() => setViewerResourceId(resource.id)}
                  onEdit={() => actions.handleEditResource(resource)}
                  onDelete={() => setPendingDeleteResourceId(resource.id)}
                  canManage={capabilities.canManageResources}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <WebCommunityResourceViewerModal
        resource={viewerResource}
        onClose={() => setViewerResourceId(null)}
      />

      <WebDeleteResourceModal
        isOpen={Boolean(pendingDeleteResource)}
        resourceTitle={pendingDeleteResource?.title ?? null}
        isDeleting={isDeletingResource}
        onClose={() => {
          if (isDeletingResource) return;
          setPendingDeleteResourceId(null);
        }}
        onConfirm={async () => {
          if (!pendingDeleteResource) return;
          setIsDeletingResource(true);
          const didDelete = await actions.handleDeleteResource(pendingDeleteResource.id);
          setIsDeletingResource(false);
          if (didDelete !== false) {
            setPendingDeleteResourceId(null);
            if (viewerResourceId === pendingDeleteResource.id) {
              setViewerResourceId(null);
            }
          }
        }}
      />
    </>
  );
}
