import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import type {
  CommunityResource,
  CommunityResourceModule,
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "./communityResourcesContracts";
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

const LEGACY_RESOURCE_MODULE_ID = "__legacy_resources__";

type ResourceModuleView = CommunityResourceModule & {
  is_virtual?: boolean;
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

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
      <path d="M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
      <path d="M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
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

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ResourceModuleCard(props: {
  module: ResourceModuleView;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const { module, onOpen, onEdit, onDelete, canManage } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };
  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsMenuOpen((current) => !current);
  };
  const closeAndRun = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    action();
  };

  return (
    <div
      className="discover-card clickable resource-module-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${module.name}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setIsMenuOpen(false)}
    >
      {canManage ? (
        <div className="resource-module-card-menu">
          <button
            className="resource-module-card-menu-trigger"
            type="button"
            title="Module actions"
            aria-label={`Actions for ${module.name}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={handleMenuClick}
          >
            <MoreIcon />
          </button>
          {isMenuOpen ? (
            <div className="resource-module-card-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={(event) => closeAndRun(event, onEdit)}>
                <EditIcon />
                <span>Edit</span>
              </button>
              <button
                className="danger"
                type="button"
                role="menuitem"
                onClick={(event) => closeAndRun(event, onDelete)}
              >
                <DeleteIcon />
                <span>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="discover-card-banner">
        {module.banner_url ? (
          <img
            className="discover-card-banner-img"
            src={module.banner_url}
            alt=""
            decoding="async"
            draggable={false}
            style={getCommunityBannerImageStyle({
              focusX: module.banner_focus_x,
              focusY: module.banner_focus_y,
              zoom: module.banner_zoom,
            })}
          />
        ) : null}
      </div>
      <div className="discover-card-body resource-module-card-body">
        <div className="discover-card-meta">
          <div className="discover-card-name">{module.name}</div>
        </div>
        <div className="discover-card-desc">
          {module.description_md?.trim() || "Resources shared by the community team."}
        </div>
      </div>
    </div>
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
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
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
  const hasLegacyResources = useMemo(
    () => state.resources.some((resource) => !resource.module_id),
    [state.resources],
  );
  const moduleViews = useMemo<ResourceModuleView[]>(() => {
    const modules = state.modules.slice().sort((a, b) => {
      const sortDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (sortDelta !== 0) return sortDelta;
      return a.name.localeCompare(b.name);
    });
    if (!hasLegacyResources) return modules;
    return [
      {
        id: LEGACY_RESOURCE_MODULE_ID,
        name: "Resources",
        description_md: "Shared links, videos, and notes for this community.",
        banner_url: null,
        banner_focus_x: null,
        banner_focus_y: null,
        banner_zoom: null,
        sort_order: -1,
        is_virtual: true,
      },
      ...modules,
    ];
  }, [hasLegacyResources, state.modules]);
  const selectedModule = useMemo(
    () => moduleViews.find((module) => module.id === selectedModuleId) ?? null,
    [moduleViews, selectedModuleId],
  );
  const visibleResources = useMemo(() => {
    if (!selectedModule) return [];
    if (selectedModule.id === LEGACY_RESOURCE_MODULE_ID) {
      return state.resources.filter((resource) => !resource.module_id);
    }
    return state.resources.filter((resource) => resource.module_id === selectedModule.id);
  }, [selectedModule, state.resources]);

  useEffect(() => {
    if (selectedModuleId && !selectedModule) {
      setSelectedModuleId(null);
    }
  }, [selectedModule, selectedModuleId]);

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
            {selectedModule ? (
              <button className="resources-back-btn" type="button" onClick={() => setSelectedModuleId(null)}>
                <BackIcon />
                <span>Resources</span>
              </button>
            ) : null}
            <div className="resources-header">{selectedModule?.name ?? "Resources"}</div>
            <div className="feed-header-subtitle">
              {selectedModule
                ? selectedModule.description_md?.trim() ||
                  `Durable links, videos, and notes for ${capabilities.activeCommunityName ?? "this community"}.`
                : `Modules for ${capabilities.activeCommunityName ?? "this community"} resources.`}
            </div>
          </div>
          <div className="feed-header-actions">
            <div
              className="feed-header-badge"
              aria-label={selectedModule ? `${visibleResources.length} resources` : `${moduleViews.length} modules`}
            >
              {selectedModule ? visibleResources.length : moduleViews.length}
            </div>
            {capabilities.hasActiveCommunity && capabilities.canOperateResources ? (
              <button
                className="resources-add-btn"
                onClick={() =>
                  selectedModule
                    ? actions.openNewResourceModal(
                        selectedModule.id === LEGACY_RESOURCE_MODULE_ID ? null : selectedModule.id,
                      )
                    : actions.openNewModuleModal()
                }
                title={selectedModule ? "Add resource" : "Add module"}
              >
                +
              </button>
            ) : null}
          </div>
        </div>

        {state.resourceSuccess ? (
          <div className="success-toast">Resource saved successfully!</div>
        ) : null}

        {state.isLoadingResources || state.isLoadingResourceModules ? (
          <div className="community-panel-state-shell">
            <div className="community-chat-page-loading-card" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-title">Loading resources…</div>
              <div className="community-chat-page-loading-copy">
                {`Preparing links, videos, and notes for ${capabilities.activeCommunityName ?? "this community"}.`}
              </div>
              <div className="community-chat-page-loading-progress web-skeleton-pill" aria-hidden="true" />
            </div>
          </div>
        ) : !selectedModule && moduleViews.length === 0 ? (
          <div className="community-panel-state-shell">
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                </svg>
              </div>
              <div className="chat-empty-title">
                Welcome to {capabilities.activeCommunityName ?? "your"} modules
              </div>
              <div className="chat-empty-text">
                {capabilities.canOperateResources
                  ? "Create modules to organize links, videos, and notes members can come back to."
                  : "Modules shared by the community team will show up here."}
              </div>
            </div>
          </div>
        ) : !selectedModule ? (
          <div className="resource-library">
            <div className="discover-grid resource-module-grid">
              {moduleViews.map((module) => (
                <ResourceModuleCard
                  key={module.id}
                  module={module}
                  onOpen={() => setSelectedModuleId(module.id)}
                  onEdit={() => actions.handleEditModule(module)}
                  onDelete={() => void actions.handleDeleteModule(module.id)}
                  canManage={capabilities.canOperateResources && !module.is_virtual}
                />
              ))}
            </div>
          </div>
        ) : visibleResources.length === 0 ? (
          <div className="community-panel-state-shell">
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                </svg>
              </div>
              <div className="chat-empty-title">No resources yet</div>
              <div className="chat-empty-text">
                {capabilities.canOperateResources
                  ? "Add the first resource for this module."
                  : "Resources shared by the community team will show up here."}
              </div>
            </div>
          </div>
        ) : (
          <div className="resource-library">
            <div className="resource-grid">
              {visibleResources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onOpenViewer={() => setViewerResourceId(resource.id)}
                  onEdit={() => actions.handleEditResource(resource)}
                  onDelete={() => setPendingDeleteResourceId(resource.id)}
                  canManage={capabilities.canOperateResources}
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
