import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { normalizeExternalUrl, parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import type {
  CommunityResource,
  CommunityResourceModule,
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "./communityResourcesContracts";
import {
  WebCommunityResourceViewerContent,
  type WebCommunityResourceSourceLineage,
} from "./WebCommunityResourceViewerModal";
import { WebDeleteResourceModal } from "./WebDeleteResourceModal";

type CommunityResourcesPanelProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
};

const LEGACY_RESOURCE_MODULE_ID = "__legacy_resources__";

type ResourceModuleView = CommunityResourceModule & {
  is_virtual?: boolean;
};

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

function getResourceRole(resource: CommunityResource): "page" | "source" {
  return resource.resource_role === "source" ? "source" : "page";
}

function getResourceRoleLabel(resource: CommunityResource): string {
  return getResourceRole(resource) === "source" ? "Source" : "Page";
}

function getResourceLineageDetail(resource: CommunityResource): string {
  const meta = getResourceMeta(resource);
  return [
    getResourceRoleLabel(resource),
    meta.primary,
    meta.secondary,
  ].filter(Boolean).join(" · ");
}

function getResourceModuleSelectionId(resource: CommunityResource): string {
  return resource.module_id ?? LEGACY_RESOURCE_MODULE_ID;
}

function compareResources(a: CommunityResource, b: CommunityResource): number {
  const aSortOrder = typeof a.sort_order === "number" && Number.isFinite(a.sort_order) ? a.sort_order : null;
  const bSortOrder = typeof b.sort_order === "number" && Number.isFinite(b.sort_order) ? b.sort_order : null;
  if (aSortOrder !== null || bSortOrder !== null) {
    if (aSortOrder !== bSortOrder) {
      return (aSortOrder ?? Number.MAX_SAFE_INTEGER) - (bSortOrder ?? Number.MAX_SAFE_INTEGER);
    }
  } else if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return Boolean(a.pinned) ? -1 : 1;
  }
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
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
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function ModuleStatusIcon(props: { status: "draft" | "live" }) {
  return props.status === "live" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M15 4v4h4" />
    </svg>
  );
}

function ResourceModuleCard(props: {
  module: ResourceModuleView;
  onOpen: () => void;
  onEdit: () => void;
  onSetStatus: (status: "draft" | "live") => void;
  onDelete: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  canManage: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const {
    module,
    onOpen,
    onEdit,
    onSetStatus,
    onDelete,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    canManage,
    canReorder,
    isDragging,
    isDropTarget,
  } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const moduleStatus = module.module_status === "live" ? "live" : "draft";
  const nextModuleStatus = moduleStatus === "live" ? "draft" : "live";
  const cornerBadge = module.is_virtual ? "Cleanup" : moduleStatus === "draft" ? "Draft" : null;
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
      className={[
        "discover-card clickable resource-module-card",
        module.is_virtual ? "is-virtual" : "",
        canReorder ? "can-reorder" : "",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : "",
      ].filter(Boolean).join(" ")}
      role="button"
      tabIndex={0}
      aria-label={`Open ${module.name}`}
      draggable={canReorder}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
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
            onPointerDown={(event) => event.stopPropagation()}
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
                type="button"
                role="menuitem"
                onClick={(event) => closeAndRun(event, () => onSetStatus(nextModuleStatus))}
              >
                <ModuleStatusIcon status={nextModuleStatus} />
                <span>{moduleStatus === "live" ? "Move to draft" : "Make live"}</span>
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
        {cornerBadge ? (
          <span className={`resource-module-corner-badge ${module.is_virtual ? "is-cleanup" : "is-draft"}`}>
            {cornerBadge}
          </span>
        ) : null}
      </div>
      <div className="discover-card-body resource-module-card-body">
        <div className="discover-card-meta">
          <div className="discover-card-name">{module.name}</div>
        </div>
        <div className="discover-card-desc">
          {module.description_md?.trim() || "Knowledge shared by the community team."}
        </div>
      </div>
    </div>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M15 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h5" />
    </svg>
  );
}

function ResourceKindIcon(props: { resource: CommunityResource }) {
  const { resource } = props;
  const embed = resource.url ? parseEmbedUrl(resource.url) : null;
  if (embed) return <PlayIcon />;
  if (resource.url) return <LinkIcon />;
  return <NoteIcon />;
}

function ResourceRailItem(props: {
  resource: CommunityResource;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  canManage: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const {
    resource,
    isActive,
    onSelect,
    onEdit,
    onDelete,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    canManage,
    canReorder,
    isDragging,
    isDropTarget,
  } = props;
  const summary = (resource.body_md ?? "").trim();

  const handleItemKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      id={`community-resource-${resource.id}`}
      className={[
        "knowledge-resource-item",
        isActive ? "is-active" : "",
        resource.pinned ? "is-pinned" : "",
        canReorder ? "can-reorder" : "",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : "",
      ].filter(Boolean).join(" ")}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "page" : undefined}
      draggable={canReorder}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={handleItemKeyDown}
    >
      <div className="knowledge-resource-item-icon" aria-hidden="true">
        <ResourceKindIcon resource={resource} />
      </div>
      <div className="knowledge-resource-item-copy">
        <div className="knowledge-resource-item-topline">
          <div className="knowledge-resource-item-title">{resource.title}</div>
          {resource.pinned ? <PinIcon /> : null}
        </div>
        {summary ? <div className="knowledge-resource-item-summary">{summary}</div> : null}
      </div>
      {canManage ? (
        <div className="knowledge-resource-item-actions">
          <button
            className="resource-card-action"
            type="button"
            title="Edit knowledge item"
            onPointerDown={(event) => event.stopPropagation()}
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
            title="Delete knowledge item"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <DeleteIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CommunityResourcesPanel(props: CommunityResourcesPanelProps) {
  const { capabilities, state, actions } = props;
  const selectedModuleId = state.selectedModuleId;
  const selectedResourceId = state.openResourceEmbedId;
  const [pendingDeleteResourceId, setPendingDeleteResourceId] = useState<string | null>(null);
  const [isDeletingResource, setIsDeletingResource] = useState(false);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [dropTargetModuleId, setDropTargetModuleId] = useState<string | null>(null);
  const [draggingResourceId, setDraggingResourceId] = useState<string | null>(null);
  const [dropTargetResourceId, setDropTargetResourceId] = useState<string | null>(null);
  const [pendingOpenResourceId, setPendingOpenResourceId] = useState<string | null>(null);

  const pendingDeleteResource = useMemo(
    () => state.resources.find((resource) => resource.id === pendingDeleteResourceId) ?? null,
    [state.resources, pendingDeleteResourceId],
  );
  const resourcesById = useMemo(() => {
    const map = new Map<string, CommunityResource>();
    state.resources.forEach((resource) => {
      map.set(resource.id, resource);
    });
    return map;
  }, [state.resources]);
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
    const firstLegacyResource = state.resources.find((resource) => !resource.module_id) ?? null;
    const legacyDirectoryUri = firstLegacyResource?.directory_uri
      ? firstLegacyResource.directory_uri.replace(/\/resources\/[^/]+$/, "")
      : "resources://community/unknown/modules/unsorted";
    return [
      ...modules,
      {
        id: LEGACY_RESOURCE_MODULE_ID,
        directory_uri: legacyDirectoryUri,
        directory_path: "/unsorted",
        module_status: "draft",
        name: "Needs sorting",
        description_md: "Resources without a module. Move these into the right place.",
        banner_url: null,
        banner_focus_x: null,
        banner_focus_y: null,
        banner_zoom: null,
        sort_order: Number.MAX_SAFE_INTEGER,
        is_virtual: true,
      },
    ];
  }, [hasLegacyResources, state.modules, state.resources]);
  const realModuleCount = state.modules.length;
  const selectedModule = useMemo(
    () => moduleViews.find((module) => module.id === selectedModuleId) ?? null,
    [moduleViews, selectedModuleId],
  );
  const selectedModuleResourceTargetId =
    selectedModule && selectedModule.id !== LEGACY_RESOURCE_MODULE_ID ? selectedModule.id : null;
  const reorderableModuleIds = useMemo(
    () => moduleViews.filter((module) => !module.is_virtual).map((module) => module.id),
    [moduleViews],
  );
  const canReorderModules = capabilities.canOperateResources && reorderableModuleIds.length > 1;
  const visibleResources = useMemo(() => {
    if (!selectedModule) return [];
    if (selectedModule.id === LEGACY_RESOURCE_MODULE_ID) {
      return state.resources.filter((resource) => !resource.module_id).sort(compareResources);
    }
    return state.resources.filter((resource) => resource.module_id === selectedModule.id).sort(compareResources);
  }, [selectedModule, state.resources]);
  const reorderableResourceIds = useMemo(() => visibleResources.map((resource) => resource.id), [visibleResources]);
  const canReorderResources = capabilities.canOperateResources && reorderableResourceIds.length > 1;
  const pageResources = useMemo(
    () => visibleResources.filter((resource) => getResourceRole(resource) === "page"),
    [visibleResources],
  );
  const sourceResources = useMemo(
    () => visibleResources.filter((resource) => getResourceRole(resource) === "source"),
    [visibleResources],
  );
  const shouldShowSourceInbox = capabilities.canOperateResources || sourceResources.length > 0;
  const selectedResource = useMemo(() => {
    if (!selectedModule || visibleResources.length === 0) return null;
    return visibleResources.find((resource) => resource.id === selectedResourceId) ?? visibleResources[0] ?? null;
  }, [selectedModule, selectedResourceId, visibleResources]);
  const selectedSourceResource = useMemo(() => {
    const sourceId = selectedResource?.source_resource_id?.trim();
    if (!sourceId) return null;
    return resourcesById.get(sourceId) ?? null;
  }, [resourcesById, selectedResource?.source_resource_id]);
  const selectedSourceResourceModuleId = selectedSourceResource
    ? getResourceModuleSelectionId(selectedSourceResource)
    : null;
  const canOpenSelectedSourceResource = Boolean(
    capabilities.canOperateResources &&
      selectedSourceResource &&
      selectedSourceResourceModuleId &&
      moduleViews.some((module) => module.id === selectedSourceResourceModuleId),
  );
  const handleOpenSelectedSourceResource = () => {
    if (!selectedSourceResource || !selectedSourceResourceModuleId || !canOpenSelectedSourceResource) return;
    setPendingOpenResourceId(selectedSourceResource.id);
    actions.handleSelectModule(selectedSourceResourceModuleId);
    actions.setOpenResourceEmbedId(selectedSourceResource.id);
  };
  const selectedSourceLineage: WebCommunityResourceSourceLineage | null =
    selectedResource?.source_resource_id && selectedSourceResource
      ? {
          title: selectedSourceResource.title,
          detail: getResourceLineageDetail(selectedSourceResource),
          ...(canOpenSelectedSourceResource ? { onOpen: handleOpenSelectedSourceResource } : {}),
        }
      : null;
  const isRefreshingResources = state.isLoadingResources || state.isLoadingResourceModules;
  const hasResourceContent = state.modules.length > 0 || state.resources.length > 0;
  const wasRefreshingResourcesRef = useRef(false);
  const hasCompletedResourceLoadRef = useRef(false);
  useEffect(() => {
    if (!isRefreshingResources && wasRefreshingResourcesRef.current) {
      hasCompletedResourceLoadRef.current = true;
    }
    wasRefreshingResourcesRef.current = isRefreshingResources;
  }, [isRefreshingResources]);
  const showInitialResourceLoading =
    isRefreshingResources && !hasResourceContent && !hasCompletedResourceLoadRef.current;

  useEffect(() => {
    if (selectedModuleId && !selectedModule && !isRefreshingResources) {
      if (!hasResourceContent && !hasCompletedResourceLoadRef.current) return;
      actions.handleSelectModule(null);
    }
  }, [actions, hasResourceContent, isRefreshingResources, selectedModule, selectedModuleId]);

  useEffect(() => {
    if (!selectedModule) {
      if (selectedResourceId) actions.setOpenResourceEmbedId(null);
      return;
    }
    if (visibleResources.length === 0) {
      if (selectedResourceId) actions.setOpenResourceEmbedId(null);
      return;
    }
    const hasSelectedResource = Boolean(
      selectedResourceId && visibleResources.some((resource) => resource.id === selectedResourceId),
    );
    if (!hasSelectedResource) {
      actions.setOpenResourceEmbedId(visibleResources[0]?.id ?? null);
    }
  }, [actions, selectedModule, selectedResourceId, visibleResources]);

  useEffect(() => {
    if (pendingDeleteResourceId && !pendingDeleteResource) {
      setPendingDeleteResourceId(null);
      setIsDeletingResource(false);
    }
  }, [pendingDeleteResource, pendingDeleteResourceId]);

  useEffect(() => {
    if (!pendingOpenResourceId) return;
    if (!visibleResources.some((resource) => resource.id === pendingOpenResourceId)) return;
    actions.setOpenResourceEmbedId(pendingOpenResourceId);
    setPendingOpenResourceId(null);
  }, [actions, pendingOpenResourceId, visibleResources]);

  const handleModuleDragStart = (event: DragEvent<HTMLDivElement>, module: ResourceModuleView) => {
    if (!canReorderModules || module.is_virtual) {
      event.preventDefault();
      return;
    }
    setDraggingModuleId(module.id);
    setDropTargetModuleId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", module.id);
  };

  const handleModuleDragOver = (event: DragEvent<HTMLDivElement>, module: ResourceModuleView) => {
    if (!draggingModuleId || module.is_virtual || module.id === draggingModuleId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetModuleId(module.id);
  };

  const handleModuleDrop = (event: DragEvent<HTMLDivElement>, module: ResourceModuleView) => {
    event.preventDefault();
    const draggedId = draggingModuleId ?? event.dataTransfer.getData("text/plain");
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
    if (!draggedId || module.is_virtual || draggedId === module.id) return;
    const fromIndex = reorderableModuleIds.indexOf(draggedId);
    const toIndex = reorderableModuleIds.indexOf(module.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextIds = reorderableModuleIds.slice();
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    void actions.handleReorderModules(nextIds);
  };

  const handleModuleDragEnd = () => {
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
  };

  const handleResourceDragStart = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    if (!canReorderResources) {
      event.preventDefault();
      return;
    }
    setDraggingResourceId(resource.id);
    setDropTargetResourceId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", resource.id);
  };

  const handleResourceDragOver = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    if (!draggingResourceId || resource.id === draggingResourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetResourceId(resource.id);
  };

  const handleResourceDrop = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    event.preventDefault();
    const draggedId = draggingResourceId ?? event.dataTransfer.getData("text/plain");
    setDraggingResourceId(null);
    setDropTargetResourceId(null);
    if (!selectedModule || !draggedId || draggedId === resource.id) return;
    const fromIndex = reorderableResourceIds.indexOf(draggedId);
    const toIndex = reorderableResourceIds.indexOf(resource.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextIds = reorderableResourceIds.slice();
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    const moduleId = selectedModule.id === LEGACY_RESOURCE_MODULE_ID ? null : selectedModule.id;
    void actions.handleReorderResources(moduleId, nextIds);
  };

  const handleResourceDragEnd = () => {
    setDraggingResourceId(null);
    setDropTargetResourceId(null);
  };

  const renderResourceRailItem = (resource: CommunityResource) => (
    <ResourceRailItem
      key={resource.id}
      resource={resource}
      isActive={selectedResource?.id === resource.id}
      onSelect={() => actions.setOpenResourceEmbedId(resource.id)}
      onEdit={() => actions.handleEditResource(resource)}
      onDelete={() => setPendingDeleteResourceId(resource.id)}
      onDragStart={(event) => handleResourceDragStart(event, resource)}
      onDragOver={(event) => handleResourceDragOver(event, resource)}
      onDragLeave={() => {
        if (dropTargetResourceId === resource.id) setDropTargetResourceId(null);
      }}
      onDrop={(event) => handleResourceDrop(event, resource)}
      onDragEnd={handleResourceDragEnd}
      canManage={capabilities.canOperateResources}
      canReorder={canReorderResources}
      isDragging={draggingResourceId === resource.id}
      isDropTarget={dropTargetResourceId === resource.id}
    />
  );

  const selectedModuleStatus = selectedModule?.module_status === "live" ? "live" : "draft";
  const selectedModuleNextStatus = selectedModuleStatus === "live" ? "draft" : "live";

  return (
    <>
      <div className="community-panel resources-panel">
        <div className="feed-header-row">
          <div className="feed-header-copy">
            {selectedModule ? (
              <button className="resources-back-btn" type="button" onClick={() => actions.handleSelectModule(null)}>
                <BackIcon />
                <span>Knowledge</span>
              </button>
            ) : null}
            <div className="resources-header">{selectedModule?.name ?? "Knowledge"}</div>
            <div className="feed-header-subtitle">
              {selectedModule
                ? selectedModule.description_md?.trim() ||
                  `Durable knowledge and source material for ${capabilities.activeCommunityName ?? "this community"}.`
                : `Organized knowledge for ${capabilities.activeCommunityName ?? "this community"}.`}
            </div>
            {selectedModule?.is_virtual ? (
              <div className="resource-module-status-line is-cleanup">Cleanup bucket</div>
            ) : selectedModule && selectedModuleStatus === "draft" ? (
              <div className="resource-module-status-line is-draft">Draft module</div>
            ) : null}
          </div>
          <div className="feed-header-actions">
            <div
              className="feed-header-badge"
              aria-label={selectedModule ? `${visibleResources.length} knowledge items` : `${realModuleCount} modules`}
            >
              {selectedModule ? visibleResources.length : realModuleCount}
            </div>
            {capabilities.hasActiveCommunity && capabilities.canOperateResources ? (
              selectedModule && !selectedModule.is_virtual ? (
                <div className="resources-add-split" role="group" aria-label="Add knowledge">
                  <button
                    className={`resources-module-status-action is-${selectedModuleNextStatus}`}
                    type="button"
                    onClick={() => void actions.handleSetModuleStatus(selectedModule, selectedModuleNextStatus)}
                    title={selectedModuleStatus === "live" ? "Move module to draft" : "Make module live"}
                  >
                    {selectedModuleStatus === "live" ? "Move to draft" : "Make live"}
                  </button>
                  <button
                    className="resources-add-choice"
                    type="button"
                    onClick={() => actions.openNewResourceModal(selectedModuleResourceTargetId)}
                    title="Add page"
                  >
                    <span aria-hidden="true">+</span>
                    <span>Page</span>
                  </button>
                  <button
                    className="resources-add-choice"
                    type="button"
                    onClick={() => actions.openNewSourceModal(selectedModuleResourceTargetId)}
                    title="Add source"
                  >
                    <span aria-hidden="true">+</span>
                    <span>Source</span>
                  </button>
                </div>
              ) : (
                <button
                  className="resources-add-btn"
                  type="button"
                  onClick={() => actions.openNewModuleModal()}
                  title="Add knowledge module"
                  aria-label="Add knowledge module"
                >
                  +
                </button>
              )
            ) : null}
          </div>
        </div>

        {isRefreshingResources && !showInitialResourceLoading ? (
          <div className="analytics-refreshing-note">Refreshing knowledge...</div>
        ) : null}

        {showInitialResourceLoading ? (
          <div className="community-panel-state-shell">
            <div className="community-chat-page-loading-card" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-title">Loading knowledge…</div>
              <div className="community-chat-page-loading-copy">
                {`Preparing references and source material for ${capabilities.activeCommunityName ?? "this community"}.`}
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
                Welcome to {capabilities.activeCommunityName ?? "your"} knowledge
              </div>
              <div className="chat-empty-text">
                {capabilities.canOperateResources
                  ? "Create modules to organize durable pages, sources, and references."
                  : "Knowledge shared by the community team will show up here."}
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
                  onOpen={() => actions.handleSelectModule(module.id)}
                  onEdit={() => actions.handleEditModule(module)}
                  onSetStatus={(status) => void actions.handleSetModuleStatus(module, status)}
                  onDelete={() => void actions.handleDeleteModule(module.id)}
                  canManage={capabilities.canOperateResources && !module.is_virtual}
                  canReorder={canReorderModules && !module.is_virtual}
                  isDragging={draggingModuleId === module.id}
                  isDropTarget={dropTargetModuleId === module.id}
                  onDragStart={(event) => handleModuleDragStart(event, module)}
                  onDragOver={(event) => handleModuleDragOver(event, module)}
                  onDragLeave={() => {
                    if (dropTargetModuleId === module.id) setDropTargetModuleId(null);
                  }}
                  onDrop={(event) => handleModuleDrop(event, module)}
                  onDragEnd={handleModuleDragEnd}
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
              <div className="chat-empty-title">No knowledge items yet</div>
              <div className="chat-empty-text">
                {capabilities.canOperateResources
                  ? "Add the first page, source, or reference for this module."
                  : "Knowledge shared by the community team will show up here."}
              </div>
            </div>
          </div>
        ) : (
          <div className="knowledge-workspace">
            <aside className="knowledge-resource-rail" aria-label={`${selectedModule.name} knowledge items`}>
              <div className="knowledge-resource-rail-header">
                <div className="knowledge-resource-rail-kicker">Knowledge</div>
                <div className="knowledge-resource-rail-count">{visibleResources.length}</div>
              </div>
              <div className="knowledge-resource-list">
                <div className="knowledge-resource-section">
                  <div className="knowledge-resource-section-header">
                    <span>Pages</span>
                    <span>{pageResources.length}</span>
                  </div>
                  {pageResources.length > 0 ? (
                    pageResources.map(renderResourceRailItem)
                  ) : (
                    <div className="knowledge-resource-empty-line">No pages yet</div>
                  )}
                </div>
                {shouldShowSourceInbox ? (
                  <div className="knowledge-resource-section">
                    <div className="knowledge-resource-section-header">
                      <span>Source Inbox</span>
                      <span>{sourceResources.length}</span>
                    </div>
                    {sourceResources.length > 0 ? (
                      sourceResources.map(renderResourceRailItem)
                    ) : (
                      <div className="knowledge-resource-empty-line">Sources added for review will appear here.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </aside>
            <div className="knowledge-resource-reader">
              {selectedResource ? (
                <WebCommunityResourceViewerContent
                  resource={selectedResource}
                  sourceLineage={selectedSourceLineage}
                  actions={
                    capabilities.canOperateResources ? (
                      <>
                        {getResourceRole(selectedResource) === "source" ? (
                          <>
                            <button
                              className="resource-card-action resource-source-draft-action"
                              type="button"
                              title="Create page draft"
                              onClick={() => {
                                if (!selectedResource) return;
                                void actions.handleCreatePageDraftFromSource(selectedResource).then((created) => {
                                  if (created) setPendingOpenResourceId(created.id);
                                });
                              }}
                            >
                              Draft page
                            </button>
                          </>
                        ) : null}
                        <button
                          className="resource-card-action"
                          type="button"
                          title="Edit knowledge item"
                          onClick={() => actions.handleEditResource(selectedResource)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="resource-card-action danger"
                          type="button"
                          title="Delete knowledge item"
                          onClick={() => setPendingDeleteResourceId(selectedResource.id)}
                        >
                          <DeleteIcon />
                        </button>
                      </>
                    ) : null
                  }
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

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
            if (selectedResourceId === pendingDeleteResource.id) {
              actions.setOpenResourceEmbedId(null);
            }
          }
        }}
      />
    </>
  );
}
