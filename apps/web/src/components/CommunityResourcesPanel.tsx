import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronsDown, ChevronsUp, GripVertical, Plus } from "lucide-react";
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
import { ResourceCourseCatalog } from "./ResourceCourseCatalog";

type CommunityResourcesPanelProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
};

const LEGACY_RESOURCE_MODULE_ID = "__legacy_resources__";
const MODULE_DRAG_MIME = "application/x-polynet-community-resource-module";
const RESOURCE_DRAG_MIME = "application/x-polynet-community-resource";
const RESOURCE_ORIGIN_MODULE_DRAG_MIME = "application/x-polynet-community-resource-origin-module";
const PAGE_DRAFT_CREATION_GESTURE_LOCK_MS = 650;
type ReorderDirection = "up" | "down" | "top" | "bottom";

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

function getSourceIngestionLabel(resource: CommunityResource): string | null {
  if (getResourceRole(resource) !== "source") return null;
  switch (resource.source_ingestion_status) {
    case "ready":
      return "Ready";
    case "failed":
      return "Needs attention";
    case "processing":
      return "Reading";
    case "queued":
      return "Queued";
    default:
      return "Saved";
  }
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

function moveOrderedId(ids: string[], id: string, direction: ReorderDirection): string[] | null {
  const fromIndex = ids.indexOf(id);
  if (fromIndex < 0) return null;
  const toIndex =
    direction === "top"
      ? 0
      : direction === "bottom"
        ? ids.length - 1
        : direction === "up"
          ? fromIndex - 1
          : fromIndex + 1;
  if (toIndex < 0 || toIndex >= ids.length || toIndex === fromIndex) return null;
  const nextIds = ids.slice();
  const [movedId] = nextIds.splice(fromIndex, 1);
  nextIds.splice(toIndex, 0, movedId);
  return nextIds;
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
  onMove: (direction: ReorderDirection) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  canManage: boolean;
  canReorder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const {
    resource,
    isActive,
    onSelect,
    onEdit,
    onDelete,
    onMove,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    canManage,
    canReorder,
    canMoveUp,
    canMoveDown,
    isDragging,
    isDropTarget,
  } = props;
  const summary = (resource.body_md ?? "").trim();
  const sourceIngestionLabel = getSourceIngestionLabel(resource);
  const isEditDisabled = resourceNeedsBodyHydration(resource);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseLeave={() => setIsMenuOpen(false)}
    >
      {canReorder ? (
        <span className="knowledge-resource-drag-handle" title="Drag to move page" aria-hidden="true">
          <GripVertical strokeWidth={1.9} />
        </span>
      ) : null}
      <button
        className="knowledge-resource-item-main"
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={onSelect}
      >
        <span className="knowledge-resource-item-icon" aria-hidden="true">
          <ResourceKindIcon resource={resource} />
        </span>
        <span className="knowledge-resource-item-copy">
          <span className="knowledge-resource-item-topline">
            <span className="knowledge-resource-item-title">{resource.title}</span>
            {resource.pinned ? <PinIcon /> : null}
          </span>
          {sourceIngestionLabel ? (
            <span className={`knowledge-resource-source-status is-${resource.source_ingestion_status ?? "saved"}`}>
              {sourceIngestionLabel}
            </span>
          ) : null}
          {summary ? <span className="knowledge-resource-item-summary">{summary}</span> : null}
        </span>
      </button>
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
              {canReorder && canMoveUp ? (
                <>
                  <button
                    className="web-floating-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={(event) => closeAndRun(event, () => onMove("up"))}
                  >
                    <ArrowUp />
                    <span>Move up</span>
                  </button>
                  <button
                    className="web-floating-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={(event) => closeAndRun(event, () => onMove("top"))}
                  >
                    <ChevronsUp />
                    <span>Move to top</span>
                  </button>
                </>
              ) : null}
              {canReorder && canMoveDown ? (
                <>
                  <button
                    className="web-floating-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={(event) => closeAndRun(event, () => onMove("down"))}
                  >
                    <ArrowDown />
                    <span>Move down</span>
                  </button>
                  <button
                    className="web-floating-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={(event) => closeAndRun(event, () => onMove("bottom"))}
                  >
                    <ChevronsDown />
                    <span>Move to bottom</span>
                  </button>
                </>
              ) : null}
              {canReorder && (canMoveUp || canMoveDown) ? <div className="web-floating-menu-separator" /> : null}
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
  const draggingModuleIdRef = useRef<string | null>(null);
  const draggingResourceIdRef = useRef<string | null>(null);
  const draggingResourceModuleIdRef = useRef<string | null>(null);
  const [pendingOpenResourceId, setPendingOpenResourceId] = useState<string | null>(null);
  const [activeResourceEditField, setActiveResourceEditField] =
    useState<WebCommunityResourceInlineEditorField | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isCourseOutlineOpen, setIsCourseOutlineOpen] = useState(true);
  const [isCreatingPageDraft, setIsCreatingPageDraft] = useState(false);
  const pageDraftCreationInFlightRef = useRef(false);
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
  const getResourceModuleSelectionId = (resource: CommunityResource) =>
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
        description_md: "Resources that need a course. Move these into the right place.",
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
  const moduleSections = useMemo(
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
  const courseCatalogItems = useMemo(
    () => moduleSections
      .filter((section) => !section.module.is_virtual)
      .map((section) => ({
        module: section.module,
        lessonCount: section.pageResources.length,
      })),
    [moduleSections],
  );
  const maintenanceCatalogItem = useMemo(() => {
    const section = moduleSections.find((candidate) => candidate.module.is_virtual);
    if (!section) return null;
    return {
      module: section.module,
      lessonCount: section.pageResources.length,
    };
  }, [moduleSections]);
  const allPageResources = useMemo(
    () => moduleSections.flatMap((section) => section.pageResources),
    [moduleSections],
  );
  const allSourceResources = useMemo(
    () => moduleSections.flatMap((section) => section.sourceResources),
    [moduleSections],
  );
  const displayableResources = useMemo(
    () => (canManageResources ? [...allPageResources, ...allSourceResources] : allPageResources),
    [allPageResources, allSourceResources, canManageResources],
  );
  const displayableResourceIds = useMemo(
    () => new Set(displayableResources.map((resource) => resource.id)),
    [displayableResources],
  );
  const selectedModule = useMemo(() => {
    if (!selectedModuleId) return null;
    return moduleViews.find((module) => module.id === selectedModuleId) ?? null;
  }, [moduleViews, selectedModuleId]);
  const selectedModuleResourceIds = useMemo(() => {
    if (!selectedModule) return new Set<string>();
    const section = moduleSections.find((candidate) => candidate.module.id === selectedModule.id);
    if (!section) return new Set<string>();
    const visibleResources = canManageResources
      ? [...section.pageResources, ...section.sourceResources]
      : section.pageResources;
    return new Set(visibleResources.map((resource) => resource.id));
  }, [canManageResources, moduleSections, selectedModule]);
  const isRefreshingResources = state.isLoadingResources || state.isLoadingResourceModules;
  const lastRenderableSelectedResourceRef = useRef<CommunityResource | null>(null);
  const selectedResource = useMemo(() => {
    if (
      !selectedModule ||
      !selectedResourceId ||
      !displayableResourceIds.has(selectedResourceId) ||
      !selectedModuleResourceIds.has(selectedResourceId)
    ) return null;
    return resourcesById.get(selectedResourceId) ?? null;
  }, [displayableResourceIds, resourcesById, selectedModule, selectedModuleResourceIds, selectedResourceId]);
  const readerResource =
    selectedResource ??
    (
      isRefreshingResources &&
      selectedResourceId &&
      lastRenderableSelectedResourceRef.current?.id === selectedResourceId
        ? lastRenderableSelectedResourceRef.current
        : null
    );
  const isReaderShowingRefreshSnapshot = Boolean(readerResource && !selectedResource);
  const selectedResourceNeedsBodyHydration = resourceNeedsBodyHydration(selectedResource);
  const selectedModuleSection = selectedModule
    ? moduleSections.find((section) => section.module.id === selectedModule.id) ?? null
    : null;
  const reorderableResourceIdsByModule = useMemo(() => {
    const map = new Map<string, string[]>();
    moduleSections.forEach((section) => {
      map.set(section.module.id, section.pageResources.map((resource) => resource.id));
    });
    return map;
  }, [moduleSections]);
  const getFirstResourceForModule = (module: ResourceModuleView | null) => {
    if (!module) return null;
    const section = moduleSections.find((candidate) => candidate.module.id === module.id);
    if (!section) return null;
    return section.pageResources[0] ?? (canManageResources ? section.sourceResources[0] : null) ?? null;
  };
  const selectedModuleFirstResource = selectedModule ? getFirstResourceForModule(selectedModule) : null;
  const selectedSourceResource = useMemo(() => {
    if (isPreviewMode) return null;
    const sourceId = selectedResource?.source_resource_id?.trim();
    if (!sourceId) return null;
    return resourcesById.get(sourceId) ?? null;
  }, [isPreviewMode, resourcesById, selectedResource?.source_resource_id]);
  const selectedSourceResourceModuleId = selectedSourceResource
    ? getResourceModuleSelectionId(selectedSourceResource)
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
  const hasResourceContent = state.modules.length > 0 || state.resources.length > 0;
  const hasVisibleResourceContent = moduleViews.length > 0 || displayableResources.length > 0;
  const wasRefreshingResourcesRef = useRef(false);
  const hasCompletedResourceLoadRef = useRef(false);
  useEffect(() => {
    if (selectedResource) {
      lastRenderableSelectedResourceRef.current = selectedResource;
      return;
    }
    if (!isRefreshingResources || !selectedResourceId) {
      lastRenderableSelectedResourceRef.current = null;
    }
  }, [isRefreshingResources, selectedResource, selectedResourceId]);
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
    setIsCourseOutlineOpen(true);
  }, [capabilities.activeCommunityId]);

  useEffect(() => {
    setIsCourseOutlineOpen(true);
  }, [selectedModuleId]);

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
    if (!selectedModule) {
      if (selectedResourceId) actions.setOpenResourceEmbedId(null);
      return;
    }
    if (selectedResourceId && selectedModuleResourceIds.has(selectedResourceId)) return;
    if (selectedModuleFirstResource) {
      actions.setOpenResourceEmbedId(selectedModuleFirstResource.id);
      return;
    }
    if (selectedResourceId) actions.setOpenResourceEmbedId(null);
  }, [
    actions,
    isRefreshingResources,
    selectedModuleFirstResource,
    selectedModule,
    selectedModuleResourceIds,
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
    actions.handleSelectModule(getResourceModuleSelectionId(pendingResource));
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
    draggingModuleIdRef.current = module.id;
    setDraggingModuleId(module.id);
    setDropTargetModuleId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(MODULE_DRAG_MIME, module.id);
    event.dataTransfer.setData("text/plain", module.id);
  };

  const handleModuleDragOver = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
    const draggedResourceId =
      draggingResourceIdRef.current || draggingResourceId || event.dataTransfer.getData(RESOURCE_DRAG_MIME);
    if (draggedResourceId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTargetResourceId(null);
      setDropTargetModuleId(module.id);
      return;
    }

    const draggedId = draggingModuleIdRef.current || draggingModuleId || event.dataTransfer.getData(MODULE_DRAG_MIME);
    if (!draggedId || module.is_virtual || module.id === draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetModuleId(module.id);
  };

  const handleModuleDrop = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
    event.preventDefault();
    const draggedResourceId =
      draggingResourceIdRef.current ||
      draggingResourceId ||
      event.dataTransfer.getData(RESOURCE_DRAG_MIME);
    if (draggedResourceId) {
      event.stopPropagation();
      const draggedResourceModuleId =
        draggingResourceModuleIdRef.current ||
        draggingResourceModuleId ||
        event.dataTransfer.getData(RESOURCE_ORIGIN_MODULE_DRAG_MIME);
      draggingResourceIdRef.current = null;
      draggingResourceModuleIdRef.current = null;
      setDraggingResourceId(null);
      setDraggingResourceModuleId(null);
      setDropTargetResourceId(null);
      setDropTargetModuleId(null);
      const targetModuleId = module.is_virtual || module.id === LEGACY_RESOURCE_MODULE_ID ? null : module.id;
      if (draggedResourceModuleId === module.id) {
        const reorderableIds = reorderableResourceIdsByModule.get(module.id) ?? [];
        const fromIndex = reorderableIds.indexOf(draggedResourceId);
        if (fromIndex >= 0 && fromIndex < reorderableIds.length - 1) {
          const nextIds = reorderableIds.filter((id) => id !== draggedResourceId);
          nextIds.push(draggedResourceId);
          void actions.handleReorderResources(targetModuleId, nextIds);
        }
        return;
      }
      void actions.handleMoveResourceToModule(draggedResourceId, targetModuleId, null);
      return;
    }

    const draggedId =
      draggingModuleIdRef.current ||
      draggingModuleId ||
      event.dataTransfer.getData(MODULE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");
    draggingModuleIdRef.current = null;
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
    draggingModuleIdRef.current = null;
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
  };

  const handleMoveModule = (moduleId: string, direction: ReorderDirection) => {
    const nextIds = moveOrderedId(reorderableModuleIds, moduleId, direction);
    if (!nextIds) return;
    void actions.handleReorderModules(nextIds);
  };

  const handleResourceDragStart = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    const moduleSelectionId = getResourceModuleSelectionId(resource);
    if (!canManageResources || getResourceRole(resource) !== "page") {
      event.preventDefault();
      return;
    }
    draggingResourceIdRef.current = resource.id;
    draggingResourceModuleIdRef.current = moduleSelectionId;
    setDraggingResourceId(resource.id);
    setDraggingResourceModuleId(moduleSelectionId);
    setDropTargetResourceId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(RESOURCE_DRAG_MIME, resource.id);
    event.dataTransfer.setData(RESOURCE_ORIGIN_MODULE_DRAG_MIME, moduleSelectionId);
    event.dataTransfer.setData("text/plain", resource.id);
  };

  const handleResourceDragOver = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    const draggedId =
      draggingResourceIdRef.current || draggingResourceId || event.dataTransfer.getData(RESOURCE_DRAG_MIME);
    if (!draggedId || resource.id === draggedId) return;
    if (getResourceRole(resource) !== "page") return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetModuleId(null);
    setDropTargetResourceId(resource.id);
  };

  const handleResourceDrop = (event: DragEvent<HTMLElement>, resource: CommunityResource) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedId =
      draggingResourceIdRef.current ||
      draggingResourceId ||
      event.dataTransfer.getData(RESOURCE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain");
    const draggedResourceModuleId =
      draggingResourceModuleIdRef.current ||
      draggingResourceModuleId ||
      event.dataTransfer.getData(RESOURCE_ORIGIN_MODULE_DRAG_MIME);
    const moduleSelectionId = getResourceModuleSelectionId(resource);
    draggingResourceIdRef.current = null;
    draggingResourceModuleIdRef.current = null;
    setDraggingResourceId(null);
    setDraggingResourceModuleId(null);
    setDropTargetResourceId(null);
    setDropTargetModuleId(null);
    if (!draggedId || draggedId === resource.id) return;
    if (getResourceRole(resource) !== "page") return;
    const moduleId = moduleSelectionId === LEGACY_RESOURCE_MODULE_ID ? null : moduleSelectionId;
    if (draggedResourceModuleId !== moduleSelectionId) {
      void actions.handleMoveResourceToModule(draggedId, moduleId, resource.id);
      return;
    }
    const reorderableIds = reorderableResourceIdsByModule.get(moduleSelectionId) ?? [];
    const fromIndex = reorderableIds.indexOf(draggedId);
    const toIndex = reorderableIds.indexOf(resource.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextIds = reorderableIds.slice();
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    void actions.handleReorderResources(moduleId, nextIds);
  };

  const handleResourceDragEnd = () => {
    draggingResourceIdRef.current = null;
    draggingResourceModuleIdRef.current = null;
    setDraggingResourceId(null);
    setDraggingResourceModuleId(null);
    setDropTargetResourceId(null);
    setDropTargetModuleId(null);
  };

  const handleMoveResource = (moduleSelectionId: string, resourceId: string, direction: ReorderDirection) => {
    const reorderableIds = reorderableResourceIdsByModule.get(moduleSelectionId) ?? [];
    const nextIds = moveOrderedId(reorderableIds, resourceId, direction);
    if (!nextIds) return;
    const moduleId = moduleSelectionId === LEGACY_RESOURCE_MODULE_ID ? null : moduleSelectionId;
    void actions.handleReorderResources(moduleId, nextIds);
  };

  const handleOpenCourse = (module: ResourceModuleView) => {
    actions.handleSelectModule(module.id);
    const firstResource = getFirstResourceForModule(module);
    actions.setOpenResourceEmbedId(firstResource?.id ?? null);
  };

  const handleBackToCatalog = () => {
    actions.resourceEditor.cancelInlineEditResource();
    setActiveResourceEditField(null);
    actions.setOpenResourceEmbedId(null);
    actions.handleSelectModule(null);
  };

  const handleSelectResource = (resource: CommunityResource) => {
    actions.handleSelectModule(getResourceModuleSelectionId(resource));
    actions.setOpenResourceEmbedId(resource.id);
    if (window.matchMedia("(max-width: 900px)").matches) {
      setIsCourseOutlineOpen(false);
    }
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

  const runPageDraftCreation = async (
    createDraft: () => Promise<CommunityResource | null>,
  ): Promise<CommunityResource | null> => {
    if (pageDraftCreationInFlightRef.current) return null;
    pageDraftCreationInFlightRef.current = true;
    setIsCreatingPageDraft(true);
    const lockStartedAt = Date.now();
    try {
      return await createDraft();
    } finally {
      const remainingGestureLockMs = Math.max(
        0,
        PAGE_DRAFT_CREATION_GESTURE_LOCK_MS - (Date.now() - lockStartedAt),
      );
      if (remainingGestureLockMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, remainingGestureLockMs);
        });
      }
      pageDraftCreationInFlightRef.current = false;
      setIsCreatingPageDraft(false);
    }
  };

  const handleAddPageDraft = async (moduleId: string | null) => {
    const created = await runPageDraftCreation(
      () => actions.handleCreateBlankPageDraft(moduleId),
    );
    if (!created) return;
    setPendingOpenResourceId(created.id);
    actions.handleSelectModule(getResourceModuleSelectionId(created));
    actions.setOpenResourceEmbedId(created.id);
    actions.resourceEditor.beginInlineEditResource(created);
    setActiveResourceEditField("title");
  };

  const handleCreatePageDraftFromSource = async (resource: CommunityResource) => {
    const created = await runPageDraftCreation(
      () => actions.handleCreatePageDraftFromSource(resource),
    );
    if (created) {
      setPendingOpenResourceId(created.id);
    }
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
    const moduleSelectionId = getResourceModuleSelectionId(resource);
    const reorderableIds = reorderableResourceIdsByModule.get(moduleSelectionId) ?? [];
    const resourceOrderIndex = reorderableIds.indexOf(resource.id);
    const canMoveAcrossModules = moduleViews.some((module) => module.id !== moduleSelectionId);
    const canReorderResource =
      canManageResources &&
      getResourceRole(resource) === "page" &&
      (reorderableIds.length > 1 || canMoveAcrossModules);

    return (
      <ResourceRailItem
        key={resource.id}
        resource={resource}
        isActive={readerResource?.id === resource.id}
        onSelect={() => handleSelectResource(resource)}
        onEdit={() => startResourceInlineEdit(resource, "body")}
        onDelete={() => setPendingDeleteResourceId(resource.id)}
        onMove={(direction) => handleMoveResource(moduleSelectionId, resource.id, direction)}
        onDragStart={(event) => handleResourceDragStart(event, resource)}
        onDragOver={(event) => handleResourceDragOver(event, resource)}
        onDragLeave={() => {
          if (dropTargetResourceId === resource.id) setDropTargetResourceId(null);
        }}
        onDrop={(event) => handleResourceDrop(event, resource)}
        onDragEnd={handleResourceDragEnd}
        canManage={canManageResources}
        canReorder={canReorderResource}
        canMoveUp={canReorderResource && resourceOrderIndex > 0}
        canMoveDown={canReorderResource && resourceOrderIndex >= 0 && resourceOrderIndex < reorderableIds.length - 1}
        isDragging={draggingResourceId === resource.id}
        isDropTarget={dropTargetResourceId === resource.id}
      />
    );
  };

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
        (selectedResource ? getResourceRole(selectedResource) === "page" : false) ||
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
            {selectedModule ? (
              <button className="resources-back-btn" type="button" onClick={handleBackToCatalog}>
                <ArrowLeft aria-hidden="true" />
                <span>Resources</span>
              </button>
            ) : (
              <div className="resources-header">Resources</div>
            )}
          </div>
          <div
            className={`feed-header-actions resources-header-actions${
              capabilities.canOperateResources ? " has-preview-mode" : ""
            }`}
          >
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
        ) : !hasVisibleResourceContent && !canManageResources ? (
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
                Courses and resources shared by the community team will show up here.
              </div>
            </div>
          </div>
        ) : !selectedModule ? (
          <ResourceCourseCatalog
            items={courseCatalogItems}
            maintenanceItem={maintenanceCatalogItem}
            canManage={canManageResources}
            canReorder={canReorderModules}
            draggingModuleId={draggingModuleId}
            dropTargetModuleId={dropTargetModuleId}
            onCreate={canManageResources ? actions.openNewModuleModal : null}
            onOpen={handleOpenCourse}
            onEdit={actions.handleEditModule}
            onSetStatus={(module, status) => void actions.handleSetModuleStatus(module, status)}
            onDelete={(module) => void actions.handleDeleteModule(module.id)}
            onMove={(module, direction) => handleMoveModule(module.id, direction)}
            onDragStart={handleModuleDragStart}
            onDragOver={handleModuleDragOver}
            onDragLeave={(module) => {
              if (dropTargetModuleId === module.id) setDropTargetModuleId(null);
            }}
            onDrop={handleModuleDrop}
            onDragEnd={handleModuleDragEnd}
          />
        ) : (
          <div className="knowledge-workspace resource-course-workspace" aria-busy={isRefreshingResources}>
            <aside
              className={`knowledge-resource-rail resource-course-outline${isCourseOutlineOpen ? " is-open" : ""}`}
              aria-label={`${selectedModule.name} lessons`}
            >
              <button
                className="resource-course-outline-header"
                type="button"
                aria-expanded={isCourseOutlineOpen}
                aria-controls="resource-course-lesson-navigation"
                onClick={() => setIsCourseOutlineOpen((current) => !current)}
              >
                <span className="resource-course-outline-title" title={selectedModule.name}>
                  {selectedModule.name}
                </span>
                <span className="resource-course-outline-count">
                  {selectedModuleSection?.pageResources.length ?? 0}
                  <ChevronDown aria-hidden="true" />
                </span>
              </button>
              <nav
                id="resource-course-lesson-navigation"
                className="knowledge-resource-list"
                aria-label={`${selectedModule.name} lesson navigation`}
                hidden={!isCourseOutlineOpen}
              >
                {selectedModuleSection?.pageResources.map(renderResourceRailItem)}
                {canManageResources && !selectedModule.is_virtual ? (
                  <button
                    className="knowledge-resource-inline-add"
                    type="button"
                    disabled={isCreatingPageDraft}
                    onClick={() => void handleAddPageDraft(selectedModule.id)}
                  >
                    <Plus aria-hidden="true" />
                    <span>{isCreatingPageDraft ? "Adding…" : "Add lesson"}</span>
                  </button>
                ) : null}
              </nav>
              {canManageResources && (selectedModuleSection?.sourceResources.length ?? 0) > 0 ? (
                <div
                  className="knowledge-source-inbox-section resource-course-source-inbox"
                  hidden={!isCourseOutlineOpen}
                >
                  <div className="knowledge-resource-section-header">
                    <span>Source Inbox</span>
                    <span>{selectedModuleSection?.sourceResources.length ?? 0}</span>
                  </div>
                  {selectedModuleSection?.sourceResources.map(renderResourceRailItem)}
                </div>
              ) : null}
            </aside>
            <div className="knowledge-resource-reader">
              {readerResource ? (
                <>
                  <WebCommunityResourceViewerContent
                    resource={readerResource}
                    sourceLineage={isReaderShowingRefreshSnapshot ? null : selectedSourceLineage}
                    editor={isReaderShowingRefreshSnapshot ? null : selectedResourceInlineEditor}
                  />
                  {selectedResource && canManageResources && getResourceRole(selectedResource) === "source" ? (
                    <div className="resource-reader-inline-actions">
                      <button
                        className="resources-add-choice"
                        type="button"
                        onClick={() => void handleCreatePageDraftFromSource(selectedResource)}
                        disabled={isCreatingPageDraft}
                      >
                        {isCreatingPageDraft ? "Creating..." : "Draft page"}
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
                    <div className="chat-empty-title">No lessons yet</div>
                    <div className="chat-empty-text">
                      {canManageResources
                        ? "Add the first lesson to begin building this course."
                        : "The community team has not published a lesson here yet."}
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
