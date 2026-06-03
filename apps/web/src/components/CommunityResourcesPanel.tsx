import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { normalizeExternalUrl, parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type {
  CommunityResource,
  CommunityResourceModule,
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "./communityResourcesContracts";
import {
  WebCommunityResourceViewerContent,
  type WebCommunityResourceInlineEditorField,
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

function resourceNeedsBodyHydration(resource: CommunityResource | null): boolean {
  if (!resource) return false;
  const bodyChars = Number(resource.body_chars ?? 0);
  return Number.isFinite(bodyChars) && bodyChars > 0 && !(resource.body_md ?? "").trim();
}

function resourceHasUsableKnowledgeContent(resource: CommunityResource): boolean {
  const bodyChars = Number(resource.body_chars ?? 0);
  return Boolean(
    resource.title.trim() &&
      (
        (Number.isFinite(bodyChars) && bodyChars > 0) ||
        (resource.body_md ?? "").trim() ||
        (resource.url ?? "").trim() ||
        (resource.file_key ?? "").trim()
      ),
  );
}

function isMemberVisibleResource(resource: CommunityResource): boolean {
  return getResourceRole(resource) === "page" && resourceHasUsableKnowledgeContent(resource);
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

function ResourceCategorySection(props: {
  module: ResourceModuleView;
  isActive: boolean;
  onEdit: () => void;
  onSetStatus: (status: "draft" | "live") => void;
  onDelete: () => void;
  onAddPage: () => void;
  onSelectCategory: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  canManage: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  children: ReactNode;
}) {
  const {
    module,
    isActive,
    onEdit,
    onSetStatus,
    onDelete,
    onAddPage,
    onSelectCategory,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    canManage,
    canReorder,
    isDragging,
    isDropTarget,
    children,
  } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const moduleStatus = module.module_status === "live" ? "live" : "draft";
  const nextModuleStatus = moduleStatus === "live" ? "draft" : "live";
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectCategory();
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
    <section
      className={[
        "knowledge-category-section",
        isActive ? "is-active" : "",
        module.is_virtual ? "is-virtual" : "",
        canReorder ? "can-reorder" : "",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : "",
      ].filter(Boolean).join(" ")}
      onMouseLeave={() => setIsMenuOpen(false)}
    >
      <div
        className="knowledge-category-header"
        role="button"
        tabIndex={0}
        aria-label={`Select ${module.name}`}
        draggable={canReorder}
        onClick={onSelectCategory}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onKeyDown={handleKeyDown}
      >
        <div className="knowledge-category-copy">
          <div className="knowledge-category-title-row">
            <span className="knowledge-category-title">{module.name}</span>
            {module.is_virtual ? (
              <span className="knowledge-category-badge is-cleanup">Cleanup</span>
            ) : canManage && moduleStatus === "draft" ? (
              <span className="knowledge-category-badge is-draft">Draft</span>
            ) : null}
          </div>
        </div>
        <div className="knowledge-category-header-actions">
          {canManage && !module.is_virtual ? (
            <button
              className="knowledge-category-menu-trigger"
              type="button"
              title="Category actions"
              aria-label={`Actions for ${module.name}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={handleMenuClick}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <MoreIcon />
            </button>
          ) : null}
          {canManage && !module.is_virtual && isMenuOpen ? (
            <div
              className="knowledge-category-menu-popover web-floating-menu"
              role="menu"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                className="web-floating-menu-item"
                type="button"
                role="menuitem"
                onClick={(event) => closeAndRun(event, onEdit)}
              >
                <EditIcon />
                <span>Edit</span>
              </button>
              <button
                className="web-floating-menu-item"
                type="button"
                role="menuitem"
                onClick={(event) => closeAndRun(event, () => onSetStatus(nextModuleStatus))}
              >
                <ModuleStatusIcon status={nextModuleStatus} />
                <span>{moduleStatus === "live" ? "Move to draft" : "Make live"}</span>
              </button>
              <button
                className="web-floating-menu-item danger"
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
      </div>
      <div className="knowledge-category-pages">
        {children}
        {canManage && !module.is_virtual ? (
          <button
            className="knowledge-resource-inline-add"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddPage();
            }}
          >
            <span aria-hidden="true">+</span>
            <span>Add page</span>
          </button>
        ) : null}
      </div>
    </section>
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
  const isEditDisabled = resourceNeedsBodyHydration(resource);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleItemKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsMenuOpen((current) => !current);
  };

  const closeAndRun = (event: MouseEvent<HTMLButtonElement>, callback: () => void) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    callback();
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
      onMouseLeave={() => setIsMenuOpen(false)}
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
            className="knowledge-resource-menu-trigger"
            type="button"
            title="Page actions"
            aria-label={`Actions for ${resource.title}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleMenuClick}
          >
            <MoreIcon />
          </button>
          {isMenuOpen ? (
            <div
              className="knowledge-resource-menu-popover web-floating-menu"
              role="menu"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                className="web-floating-menu-item"
                type="button"
                role="menuitem"
                title={isEditDisabled ? "Loading page content" : "Edit page"}
                disabled={isEditDisabled}
                onClick={(event) => {
                  if (isEditDisabled) return;
                  closeAndRun(event, onEdit);
                }}
              >
                <EditIcon />
                <span>Edit</span>
              </button>
              <button
                className="web-floating-menu-item danger"
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
  const [draggingResourceModuleId, setDraggingResourceModuleId] = useState<string | null>(null);
  const [dropTargetResourceId, setDropTargetResourceId] = useState<string | null>(null);
  const [pendingOpenResourceId, setPendingOpenResourceId] = useState<string | null>(null);
  const [activeResourceEditField, setActiveResourceEditField] =
    useState<WebCommunityResourceInlineEditorField | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const pendingBodyHydrationRefreshIdsRef = useRef(new Set<string>());
  const canManageResources = capabilities.canOperateResources && !isPreviewMode;
  const previewSwitcherStyle = buildPlatformSwitcherStyle(2, isPreviewMode ? 1 : 0);

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
  const realModuleIdLookup = useMemo(
    () => new Set(state.modules.map((module) => module.id)),
    [state.modules],
  );
  const getResourceCategoryId = (resource: CommunityResource) =>
    resource.module_id && realModuleIdLookup.has(resource.module_id)
      ? resource.module_id
      : LEGACY_RESOURCE_MODULE_ID;
  const hasLegacyResources = useMemo(
    () => state.resources.some((resource) => !resource.module_id || !realModuleIdLookup.has(resource.module_id)),
    [realModuleIdLookup, state.resources],
  );
  const baseModuleViews = useMemo<ResourceModuleView[]>(() => {
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
        description_md: "Resources that need a category. Move these into the right place.",
        banner_url: null,
        banner_focus_x: null,
        banner_focus_y: null,
        banner_zoom: null,
        sort_order: Number.MAX_SAFE_INTEGER,
        is_virtual: true,
      },
    ];
  }, [hasLegacyResources, state.modules, state.resources]);
  const moduleViews = useMemo(
    () =>
      isPreviewMode
        ? baseModuleViews.filter((module) => !module.is_virtual && module.module_status === "live")
        : baseModuleViews,
    [baseModuleViews, isPreviewMode],
  );
  const reorderableModuleIds = useMemo(
    () => moduleViews.filter((module) => !module.is_virtual).map((module) => module.id),
    [moduleViews],
  );
  const canReorderModules = canManageResources && reorderableModuleIds.length > 1;
  const resourcesBySelectionId = useMemo(() => {
    const map = new Map<string, CommunityResource[]>();
    moduleViews.forEach((module) => {
      map.set(module.id, []);
    });
    state.resources.forEach((resource) => {
      if (isPreviewMode && !isMemberVisibleResource(resource)) return;
      const selectionId =
        resource.module_id && realModuleIdLookup.has(resource.module_id)
          ? resource.module_id
          : LEGACY_RESOURCE_MODULE_ID;
      const current = map.get(selectionId) ?? [];
      current.push(resource);
      map.set(selectionId, current);
    });
    map.forEach((resources, selectionId) => {
      map.set(selectionId, resources.slice().sort(compareResources));
    });
    return map;
  }, [isPreviewMode, moduleViews, realModuleIdLookup, state.resources]);
  const categorySections = useMemo(
    () =>
      moduleViews.map((module) => {
        const resources = resourcesBySelectionId.get(module.id) ?? [];
        return {
          module,
          resources,
          pageResources: resources.filter((resource) => getResourceRole(resource) === "page"),
          sourceResources: resources.filter((resource) => getResourceRole(resource) === "source"),
        };
      }),
    [moduleViews, resourcesBySelectionId],
  );
  const allPageResources = useMemo(
    () => categorySections.flatMap((section) => section.pageResources),
    [categorySections],
  );
  const allSourceResources = useMemo(
    () => categorySections.flatMap((section) => section.sourceResources),
    [categorySections],
  );
  const displayableResources = useMemo(
    () => (canManageResources ? [...allPageResources, ...allSourceResources] : allPageResources),
    [allPageResources, allSourceResources, canManageResources],
  );
  const displayableResourceIds = useMemo(
    () => new Set(displayableResources.map((resource) => resource.id)),
    [displayableResources],
  );
  const selectedResource = useMemo(() => {
    if (!selectedResourceId || !displayableResourceIds.has(selectedResourceId)) return null;
    return resourcesById.get(selectedResourceId) ?? null;
  }, [displayableResourceIds, resourcesById, selectedResourceId]);
  const selectedResourceNeedsBodyHydration = resourceNeedsBodyHydration(selectedResource);
  const selectedResourceCategoryId = selectedResource ? getResourceCategoryId(selectedResource) : null;
  const selectedModule = useMemo(() => {
    const selectedModuleExists = selectedModuleId
      ? moduleViews.some((module) => module.id === selectedModuleId)
      : false;
    const activeId = selectedModuleExists ? selectedModuleId : selectedResourceCategoryId;
    if (!activeId) return null;
    return moduleViews.find((module) => module.id === activeId) ?? null;
  }, [moduleViews, selectedModuleId, selectedResourceCategoryId]);
  const selectedCategorySection = selectedModule
    ? categorySections.find((section) => section.module.id === selectedModule.id) ?? null
    : null;
  const reorderableResourceIdsByModule = useMemo(() => {
    const map = new Map<string, string[]>();
    categorySections.forEach((section) => {
      map.set(section.module.id, section.pageResources.map((resource) => resource.id));
    });
    return map;
  }, [categorySections]);
  const getFirstResourceForCategory = (module: ResourceModuleView | null) => {
    if (!module) return null;
    const section = categorySections.find((candidate) => candidate.module.id === module.id);
    if (!section) return null;
    return section.pageResources[0] ?? (canManageResources ? section.sourceResources[0] : null) ?? null;
  };
  const firstDisplayableResource = displayableResources[0] ?? null;
  const selectedCategoryFirstResource = selectedModule ? getFirstResourceForCategory(selectedModule) : null;
  const shouldShowSourceInbox = canManageResources && allSourceResources.length > 0;
  const selectedSourceResource = useMemo(() => {
    if (isPreviewMode) return null;
    const sourceId = selectedResource?.source_resource_id?.trim();
    if (!sourceId) return null;
    return resourcesById.get(sourceId) ?? null;
  }, [isPreviewMode, resourcesById, selectedResource?.source_resource_id]);
  const selectedSourceResourceModuleId = selectedSourceResource
    ? getResourceCategoryId(selectedSourceResource)
    : null;
  const canOpenSelectedSourceResource = Boolean(
    canManageResources &&
      selectedSourceResource &&
      selectedSourceResourceModuleId &&
      moduleViews.some((module) => module.id === selectedSourceResourceModuleId),
  );
  const handleOpenSelectedSourceResource = () => {
    if (!selectedSourceResource || !selectedSourceResourceModuleId || !canOpenSelectedSourceResource) return;
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
  const hasVisibleResourceContent = moduleViews.length > 0 || displayableResources.length > 0;
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
    if (capabilities.canOperateResources || !isPreviewMode) return;
    setIsPreviewMode(false);
  }, [capabilities.canOperateResources, isPreviewMode]);

  useEffect(() => {
    if (canManageResources || !actions.resourceEditor.editingResourceId) return;
    actions.resourceEditor.cancelInlineEditResource();
    setActiveResourceEditField(null);
  }, [actions.resourceEditor, canManageResources]);

  useEffect(() => {
    const selectedModuleExists = selectedModuleId
      ? moduleViews.some((module) => module.id === selectedModuleId)
      : false;
    if (selectedModuleId && !selectedModuleExists && !isRefreshingResources) {
      if (!hasResourceContent && !hasCompletedResourceLoadRef.current) return;
      actions.handleSelectModule(null);
    }
  }, [actions, hasResourceContent, isRefreshingResources, moduleViews, selectedModuleId]);

  useEffect(() => {
    if (isRefreshingResources) return;
    if (displayableResources.length === 0) {
      if (selectedResourceId) actions.setOpenResourceEmbedId(null);
      return;
    }
    if (selectedResourceId && displayableResourceIds.has(selectedResourceId)) return;
    if (selectedModule) {
      if (selectedCategoryFirstResource) {
        actions.setOpenResourceEmbedId(selectedCategoryFirstResource.id);
      } else if (selectedResourceId) {
        actions.setOpenResourceEmbedId(null);
      }
      return;
    }
    if (firstDisplayableResource) {
      actions.handleSelectModule(getResourceCategoryId(firstDisplayableResource));
      actions.setOpenResourceEmbedId(firstDisplayableResource.id);
    }
  }, [
    actions,
    displayableResourceIds,
    displayableResources.length,
    firstDisplayableResource,
    isRefreshingResources,
    selectedCategoryFirstResource,
    selectedModule,
    selectedResourceId,
  ]);

  useEffect(() => {
    if (pendingDeleteResourceId && !pendingDeleteResource) {
      setPendingDeleteResourceId(null);
      setIsDeletingResource(false);
    }
  }, [pendingDeleteResource, pendingDeleteResourceId]);

  useEffect(() => {
    if (!selectedResource || selectedResourceNeedsBodyHydration) return;
    pendingBodyHydrationRefreshIdsRef.current.delete(selectedResource.id);
  }, [selectedResource, selectedResourceNeedsBodyHydration]);

  useEffect(() => {
    if (!selectedResource || !selectedResourceNeedsBodyHydration) return;
    if (isRefreshingResources || !actions.reloadResources) return;
    if (pendingBodyHydrationRefreshIdsRef.current.has(selectedResource.id)) return;
    pendingBodyHydrationRefreshIdsRef.current.add(selectedResource.id);
    void Promise.resolve(actions.reloadResources()).catch(() => {
      pendingBodyHydrationRefreshIdsRef.current.delete(selectedResource.id);
    });
  }, [actions, isRefreshingResources, selectedResource, selectedResourceNeedsBodyHydration]);

  useEffect(() => {
    if (!pendingOpenResourceId) return;
    const pendingResource = resourcesById.get(pendingOpenResourceId);
    if (!pendingResource || !displayableResourceIds.has(pendingOpenResourceId)) return;
    actions.handleSelectModule(getResourceCategoryId(pendingResource));
    actions.setOpenResourceEmbedId(pendingOpenResourceId);
    setPendingOpenResourceId(null);
  }, [actions, displayableResourceIds, pendingOpenResourceId, resourcesById]);

  useEffect(() => {
    const editingId = actions.resourceEditor.editingResourceId;
    if (!editingId || !selectedResource || editingId !== selectedResource.id) {
      setActiveResourceEditField(null);
    }
  }, [actions.resourceEditor.editingResourceId, selectedResource]);

  const handleModuleDragStart = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
    if (!canReorderModules || module.is_virtual) {
      event.preventDefault();
      return;
    }
    setDraggingModuleId(module.id);
    setDropTargetModuleId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", module.id);
  };

  const handleModuleDragOver = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
    if (!draggingModuleId || module.is_virtual || module.id === draggingModuleId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetModuleId(module.id);
  };

  const handleModuleDrop = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
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
    const categoryId = getResourceCategoryId(resource);
    const reorderableIds = reorderableResourceIdsByModule.get(categoryId) ?? [];
    if (!canManageResources || getResourceRole(resource) !== "page" || reorderableIds.length < 2) {
      event.preventDefault();
      return;
    }
    setDraggingResourceId(resource.id);
    setDraggingResourceModuleId(categoryId);
    setDropTargetResourceId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", resource.id);
  };

  const handleResourceDragOver = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    const categoryId = getResourceCategoryId(resource);
    if (!draggingResourceId || draggingResourceModuleId !== categoryId || resource.id === draggingResourceId) return;
    if (getResourceRole(resource) !== "page") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetResourceId(resource.id);
  };

  const handleResourceDrop = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    event.preventDefault();
    const draggedId = draggingResourceId ?? event.dataTransfer.getData("text/plain");
    const categoryId = getResourceCategoryId(resource);
    setDraggingResourceId(null);
    setDraggingResourceModuleId(null);
    setDropTargetResourceId(null);
    if (!draggedId || draggingResourceModuleId !== categoryId || draggedId === resource.id) return;
    const reorderableIds = reorderableResourceIdsByModule.get(categoryId) ?? [];
    const fromIndex = reorderableIds.indexOf(draggedId);
    const toIndex = reorderableIds.indexOf(resource.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextIds = reorderableIds.slice();
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    const moduleId = categoryId === LEGACY_RESOURCE_MODULE_ID ? null : categoryId;
    void actions.handleReorderResources(moduleId, nextIds);
  };

  const handleResourceDragEnd = () => {
    setDraggingResourceId(null);
    setDraggingResourceModuleId(null);
    setDropTargetResourceId(null);
  };

  const handleSelectCategory = (module: ResourceModuleView) => {
    actions.handleSelectModule(module.id);
    const firstResource = getFirstResourceForCategory(module);
    actions.setOpenResourceEmbedId(firstResource?.id ?? null);
  };

  const handleSelectResource = (resource: CommunityResource) => {
    actions.handleSelectModule(getResourceCategoryId(resource));
    actions.setOpenResourceEmbedId(resource.id);
  };

  const startResourceInlineEdit = (
    resource: CommunityResource,
    field: WebCommunityResourceInlineEditorField,
  ) => {
    if (resourceNeedsBodyHydration(resource)) return;
    handleSelectResource(resource);
    actions.resourceEditor.beginInlineEditResource(resource);
    setActiveResourceEditField(field);
  };

  const cancelResourceInlineEdit = () => {
    actions.resourceEditor.cancelInlineEditResource();
    setActiveResourceEditField(null);
  };

  const saveResourceInlineEdit = async () => {
    const didSave = await actions.resourceEditor.saveInlineEditResource();
    if (didSave) setActiveResourceEditField(null);
    return didSave;
  };

  const renderResourceRailItem = (resource: CommunityResource) => {
    const categoryId = getResourceCategoryId(resource);
    const reorderableIds = reorderableResourceIdsByModule.get(categoryId) ?? [];
    const canReorderResource =
      canManageResources && getResourceRole(resource) === "page" && reorderableIds.length > 1;

    return (
      <ResourceRailItem
        key={resource.id}
        resource={resource}
        isActive={selectedResource?.id === resource.id}
        onSelect={() => handleSelectResource(resource)}
        onEdit={() => startResourceInlineEdit(resource, "body")}
        onDelete={() => setPendingDeleteResourceId(resource.id)}
        onDragStart={(event) => handleResourceDragStart(event, resource)}
        onDragOver={(event) => handleResourceDragOver(event, resource)}
        onDragLeave={() => {
          if (dropTargetResourceId === resource.id) setDropTargetResourceId(null);
        }}
        onDrop={(event) => handleResourceDrop(event, resource)}
        onDragEnd={handleResourceDragEnd}
        canManage={canManageResources}
        canReorder={canReorderResource}
        isDragging={draggingResourceId === resource.id}
        isDropTarget={dropTargetResourceId === resource.id}
      />
    );
  };

  const selectedModuleStatus = selectedModule?.module_status === "live" ? "live" : "draft";
  const selectedModuleNextStatus = selectedModuleStatus === "live" ? "draft" : "live";
  const isSelectedResourceEditing =
    Boolean(selectedResource) && actions.resourceEditor.editingResourceId === selectedResource?.id;
  const selectedResourceEditorDirty = Boolean(
    selectedResource &&
      isSelectedResourceEditing &&
      (
        actions.resourceEditor.titleInput !== selectedResource.title ||
        actions.resourceEditor.bodyInput !== (selectedResource.body_md ?? "") ||
        actions.resourceEditor.pinnedInput !== selectedResource.pinned
      ),
  );
  const selectedResourceEditorCanSave = Boolean(
    isSelectedResourceEditing &&
      selectedResourceEditorDirty &&
      actions.resourceEditor.titleInput.trim().length > 0 &&
      (
        actions.resourceEditor.bodyInput.trim().length > 0 ||
        (selectedResource?.url ?? "").trim().length > 0
      ) &&
      !actions.resourceEditor.isSaving,
  );
  const selectedResourceInlineEditor =
    canManageResources && selectedResource && !selectedResourceNeedsBodyHydration
      ? {
          canEdit: true,
          isEditing: isSelectedResourceEditing,
          activeField: activeResourceEditField,
          titleInput: actions.resourceEditor.titleInput,
          bodyInput: actions.resourceEditor.bodyInput,
          pinnedInput: actions.resourceEditor.pinnedInput,
          error: actions.resourceEditor.error,
          isSaving: actions.resourceEditor.isSaving,
          isDirty: selectedResourceEditorDirty,
          canSave: selectedResourceEditorCanSave,
          onBeginEdit: (field: WebCommunityResourceInlineEditorField) => {
            startResourceInlineEdit(selectedResource, field);
          },
          onSetActiveField: setActiveResourceEditField,
          onChangeTitle: actions.resourceEditor.onChangeTitle,
          onChangeBody: actions.resourceEditor.onChangeBody,
          onChangePinned: actions.resourceEditor.onChangePinned,
          onSave: saveResourceInlineEdit,
          onCancel: cancelResourceInlineEdit,
        }
      : null;

  return (
    <>
      <div className="community-panel resources-panel">
        <div className="feed-header-row">
          <div className="feed-header-copy">
            <div className="resources-header">Resources</div>
            <div className="feed-header-subtitle">
              {`Organized knowledge for ${capabilities.activeCommunityName ?? "this community"}.`}
            </div>
            {selectedModule?.is_virtual ? (
              <div className="resource-module-status-line is-cleanup">Needs sorting</div>
            ) : canManageResources && selectedModule && selectedModuleStatus === "draft" ? (
              <div className="resource-module-status-line is-draft">Draft category</div>
            ) : null}
          </div>
          <div
            className={`feed-header-actions resources-header-actions${
              capabilities.canOperateResources ? " has-preview-mode" : ""
            }`}
          >
            <div className="resources-header-admin-actions">
              <div className="feed-header-badge" aria-label={`${allPageResources.length} pages`}>
                {allPageResources.length}
              </div>
              {capabilities.hasActiveCommunity && canManageResources ? (
                <div className="resources-add-split" role="group" aria-label="Resource actions">
                  {selectedModule && !selectedModule.is_virtual ? (
                    <button
                      className={`resources-module-status-action is-${selectedModuleNextStatus}`}
                      type="button"
                      onClick={() => void actions.handleSetModuleStatus(selectedModule, selectedModuleNextStatus)}
                      title={selectedModuleStatus === "live" ? "Move category to draft" : "Make category live"}
                    >
                      {selectedModuleStatus === "live" ? "Move to draft" : "Make live"}
                    </button>
                  ) : null}
                  <button
                    className="resources-add-choice"
                    type="button"
                    onClick={() => actions.openNewModuleModal()}
                    title="Add category"
                  >
                    <span aria-hidden="true">+</span>
                    <span>Category</span>
                  </button>
                </div>
              ) : null}
            </div>
            {capabilities.canOperateResources ? (
              <div className="resources-header-view-actions">
                <div className="resources-preview-mode-control">
                  <span className="resources-preview-mode-label">Preview mode</span>
                  <div
                    className="platform-switcher platform-switcher-compact resources-preview-mode-switcher"
                    aria-label="Preview mode"
                    style={previewSwitcherStyle}
                  >
                    <button
                      className={`platform-switcher-btn${!isPreviewMode ? " is-active" : ""}`}
                      type="button"
                      aria-pressed={!isPreviewMode}
                      onClick={() => setIsPreviewMode(false)}
                    >
                      Off
                    </button>
                    <button
                      className={`platform-switcher-btn${isPreviewMode ? " is-active" : ""}`}
                      type="button"
                      aria-pressed={isPreviewMode}
                      onClick={() => setIsPreviewMode(true)}
                    >
                      On
                    </button>
                  </div>
                </div>
              </div>
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
        ) : !hasVisibleResourceContent ? (
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
                {canManageResources
                  ? "Create a category to organize durable pages, sources, and references."
                  : "Resources shared by the community team will show up here."}
              </div>
            </div>
          </div>
        ) : (
          <div className="knowledge-workspace">
            <aside className="knowledge-resource-rail" aria-label="Resources">
              <div className="knowledge-resource-list">
                {categorySections.map((section) => (
                  <ResourceCategorySection
                    key={section.module.id}
                    module={section.module}
                    isActive={selectedModule?.id === section.module.id}
                    onSelectCategory={() => handleSelectCategory(section.module)}
                    onEdit={() => actions.handleEditModule(section.module)}
                    onSetStatus={(status) => void actions.handleSetModuleStatus(section.module, status)}
                    onDelete={() => void actions.handleDeleteModule(section.module.id)}
                    onAddPage={() => actions.openNewResourceModal(section.module.id)}
                    canManage={canManageResources && !section.module.is_virtual}
                    canReorder={canReorderModules && !section.module.is_virtual}
                    isDragging={draggingModuleId === section.module.id}
                    isDropTarget={dropTargetModuleId === section.module.id}
                    onDragStart={(event) => handleModuleDragStart(event, section.module)}
                    onDragOver={(event) => handleModuleDragOver(event, section.module)}
                    onDragLeave={() => {
                      if (dropTargetModuleId === section.module.id) setDropTargetModuleId(null);
                    }}
                    onDrop={(event) => handleModuleDrop(event, section.module)}
                    onDragEnd={handleModuleDragEnd}
                  >
                    {section.pageResources.map(renderResourceRailItem)}
                  </ResourceCategorySection>
                ))}
                {shouldShowSourceInbox ? (
                  <div className="knowledge-source-inbox-section">
                    <div className="knowledge-resource-section-header">
                      <span>Source Inbox</span>
                      <span>{allSourceResources.length}</span>
                    </div>
                    {allSourceResources.map(renderResourceRailItem)}
                  </div>
                ) : null}
              </div>
            </aside>
            <div className="knowledge-resource-reader">
              {selectedResource ? (
                <>
                  <WebCommunityResourceViewerContent
                    resource={selectedResource}
                    sourceLineage={selectedSourceLineage}
                    editor={selectedResourceInlineEditor}
                  />
                  {canManageResources && getResourceRole(selectedResource) === "source" ? (
                    <div className="resource-reader-inline-actions">
                      <button
                        className="resources-add-choice"
                        type="button"
                        onClick={() => {
                          void actions.handleCreatePageDraftFromSource(selectedResource).then((created) => {
                            if (created) setPendingOpenResourceId(created.id);
                          });
                        }}
                      >
                        Draft page
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="community-panel-state-shell">
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                      </svg>
                    </div>
                    <div className="chat-empty-title">No page selected</div>
                    <div className="chat-empty-text">
                      {selectedCategorySection
                        ? "This category does not have a page yet."
                        : "Choose a page from the wiki."}
                    </div>
                  </div>
                </div>
              )}
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
