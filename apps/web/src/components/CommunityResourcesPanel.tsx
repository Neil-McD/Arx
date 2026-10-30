import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronsDown, ChevronsUp, Eye, EyeOff, GripVertical, Plus } from "lucide-react";
import { buildCommunityResourceEvidenceRef } from "../../../../shared/communityEvidenceContract";
import type {
  CommunityResource,
  CommunityResourceVersion,
  CommunityResourceModule,
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "./communityResourcesContracts";
import {
  WebCommunityResourceViewerContent,
  type WebLessonCoursePlace,
  type WebCommunityResourceInlineEditorField,
  type WebLessonActivity,
} from "./WebCommunityResourceViewerContent";
import { WebDeleteResourceModal } from "./WebDeleteResourceModal";
import { WebLessonVersionHistory } from "./WebLessonVersionHistory";
import { ResourceCourseCatalog, type ResourceCourseProgress } from "./ResourceCourseCatalog";
import { setMemberViewOn, useMemberView, useOfferMemberView } from "./memberViewStore";
import { createBrowserCommunityEmbedStorage, type CommunityEmbedContext } from "../../../../shared/communityEmbedUi";

type CommunityResourcesPanelProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
  // The viewing member's progress per course (module id), when known.
  courseProgress?: Readonly<Record<string, ResourceCourseProgress>>;
  // The member's answers to lesson buttons, checklists, quizzes and forms.
  lessonActivity?: WebLessonActivity | null;
  // Open this lesson in the editor (from the Roadmap's "Edit lesson"); a new key asks again.
  editRequest?: { resourceId: string; key: number } | null;
  // False while this panel is mounted but hidden (another Knowledge tab is open),
  // so the top bar doesn't offer a member view this page can't show.
  memberViewOffered?: boolean;
};

const MODULE_DRAG_MIME = "application/x-polynet-community-resource-module";
const RESOURCE_DRAG_MIME = "application/x-polynet-community-resource";
const RESOURCE_ORIGIN_MODULE_DRAG_MIME = "application/x-polynet-community-resource-origin-module";
type ReorderDirection = "up" | "down" | "top" | "bottom";

type ResourceModuleView = CommunityResourceModule;

function getResourceRole(resource: CommunityResource): "page" | "source" {
  return resource.resource_role === "source" ? "source" : "page";
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

// Below this width the lesson outline sits above the lesson, so it starts folded.
function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
}

function lessonCountLabel(count: number): string {
  return `${count} ${count === 1 ? "lesson" : "lessons"}`;
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

function ResourceRailItem(props: {
  resource: CommunityResource;
  isActive: boolean;
  // The member finished this lesson (null when progress isn't known).
  isDone: boolean | null;
  // Opened but not finished: a half-filled circle, so it reads apart from not started.
  isStarted?: boolean;
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
    isDone,
    isStarted = false,
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
        <span className="knowledge-resource-drag-handle" title="Drag to move lesson" aria-hidden="true">
          <GripVertical strokeWidth={1.9} />
        </span>
      ) : null}
      <button
        className="knowledge-resource-item-main"
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={onSelect}
      >
        {isDone !== null ? (
          <span className={`knowledge-resource-item-status${isDone ? " is-done" : isStarted ? " is-started" : ""}`} aria-label={isDone ? "Done" : isStarted ? "In progress" : "Not started"} role="img">
            {isDone ? <Check aria-hidden="true" /> : null}
          </span>
        ) : null}
        <span className="knowledge-resource-item-copy">
          <span className="knowledge-resource-item-topline">
            <span className="knowledge-resource-item-title" title={resource.title}>
              {resource.title}
            </span>
            {resource.pinned ? <PinIcon /> : null}
          </span>
        </span>
      </button>
      {canManage ? (
        <div className="knowledge-resource-item-actions">
          <button
            className="knowledge-resource-menu-trigger"
            type="button"
            title="Lesson actions"
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
                title="Edit lesson"
                onClick={(event) => closeAndRun(event, onEdit)}
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
  const { capabilities, state, actions, courseProgress } = props;
  const selectedModuleId = state.selectedModuleId;
  // Widget answers are kept per member on the server when signed in, and in
  // this browser otherwise.
  const embedStorage = props.lessonActivity?.embedStorage ?? null;
  const communityEmbeds = useMemo<CommunityEmbedContext | null>(
    () =>
      capabilities.activeCommunityId && capabilities.activeCommunitySiteOrigin
        ? {
            siteOrigin: capabilities.activeCommunitySiteOrigin,
            storage: embedStorage ?? createBrowserCommunityEmbedStorage(capabilities.activeCommunityId),
          }
        : null,
    [capabilities.activeCommunityId, capabilities.activeCommunitySiteOrigin, embedStorage],
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
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
  const [activeResourceEditField, setActiveResourceEditField] =
    useState<WebCommunityResourceInlineEditorField | null>(null);
  // View as member lives in the top bar; this page offers it to owners.
  const memberView = useMemberView();
  useOfferMemberView(capabilities.canOperateResources && props.memberViewOffered !== false);
  const isPreviewMode = capabilities.canOperateResources && memberView.on;
  const setIsPreviewMode = setMemberViewOn;
  const [isCourseOutlineOpen, setIsCourseOutlineOpen] = useState(() => !isNarrowViewport());
  const [isCreatingPageDraft, setIsCreatingPageDraft] = useState(false);
  const pageDraftCreationInFlightRef = useRef(false);
  const canManageResources = capabilities.canOperateResources && !isPreviewMode;

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
  const moduleViews = useMemo<ResourceModuleView[]>(() => {
    const modules = state.modules.slice().sort((a, b) => {
      const sortDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (sortDelta !== 0) return sortDelta;
      return a.name.localeCompare(b.name);
    });
    return isPreviewMode ? modules.filter((module) => module.module_status === "live") : modules;
  }, [isPreviewMode, state.modules]);
  const reorderableModuleIds = useMemo(
    () => moduleViews.map((module) => module.id),
    [moduleViews],
  );
  const canReorderModules = canManageResources && reorderableModuleIds.length > 1;
  const resourcesBySelectionId = useMemo(() => {
    const map = new Map<string, CommunityResource[]>();
    moduleViews.forEach((module) => {
      map.set(module.id, []);
    });
    state.resources.forEach((resource) => {
      if (getResourceRole(resource) !== "page") return;
      if (!resource.module_id || !realModuleIdLookup.has(resource.module_id)) return;
      if (isPreviewMode && !isMemberVisibleResource(resource)) return;
      const current = map.get(resource.module_id) ?? [];
      current.push(resource);
      map.set(resource.module_id, current);
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
          lessonResources: resources,
        };
      }),
    [moduleViews, resourcesBySelectionId],
  );
  const courseCatalogItems = useMemo(
    () => moduleSections
      .map((section) => ({
        module: section.module,
        lessonCount: state.resourceRead.hasData ? section.lessonResources.length : null,
        progress: courseProgress?.[section.module.id] ?? null,
      })),
    [moduleSections, state.resourceRead.hasData, courseProgress],
  );
  const allLessonResources = useMemo(
    () => moduleSections.flatMap((section) => section.lessonResources),
    [moduleSections],
  );
  const selectedModule = useMemo(() => {
    if (!selectedModuleId) return null;
    return moduleViews.find((module) => module.id === selectedModuleId) ?? null;
  }, [moduleViews, selectedModuleId]);
  const selectedModuleProgress = selectedModule ? courseProgress?.[selectedModule.id] ?? null : null;
  const selectedCourseProgress =
    selectedModuleProgress && selectedModuleProgress.total > 0 && !selectedModuleProgress.lockedReason ? selectedModuleProgress : null;
  const selectedModuleSection = useMemo(
    () => selectedModule
      ? moduleSections.find((section) => section.module.id === selectedModule.id) ?? null
      : null,
    [moduleSections, selectedModule],
  );
  const selectedModuleResourceIds = useMemo(() => {
    if (!selectedModuleSection) return new Set<string>();
    return new Set(selectedModuleSection.lessonResources.map((resource) => resource.id));
  }, [selectedModuleSection]);
  const isRefreshingResources = state.isLoadingResources || state.isLoadingResourceModules;
  const selectedResource = useMemo(() => {
    if (!selectedModuleSection) return null;
    if (selectedLessonId && selectedModuleResourceIds.has(selectedLessonId)) {
      return resourcesById.get(selectedLessonId) ?? selectedModuleSection.lessonResources[0] ?? null;
    }
    return selectedModuleSection.lessonResources[0] ?? null;
  }, [resourcesById, selectedLessonId, selectedModuleResourceIds, selectedModuleSection]);
  const reorderableResourceIdsByModule = useMemo(() => {
    const map = new Map<string, string[]>();
    moduleSections.forEach((section) => {
      map.set(section.module.id, section.lessonResources.map((resource) => resource.id));
    });
    return map;
  }, [moduleSections]);
  const getFirstResourceForModule = (module: ResourceModuleView | null) => {
    if (!module) return null;
    const section = moduleSections.find((candidate) => candidate.module.id === module.id);
    if (!section) return null;
    return section.lessonResources[0] ?? null;
  };
  const hasResourceContent = state.modules.length > 0 || state.resources.length > 0;
  const hasVisibleResourceContent = moduleViews.length > 0 || allLessonResources.length > 0;
  const readErrors = (["modules", "resources"] as const).flatMap((collection) => {
    const read = collection === "modules" ? state.moduleRead : state.resourceRead;
    return read.status === "error" ? [{ collection, message: read.error }] : [];
  });
  const showInitialResourceLoading =
    !hasResourceContent && readErrors.length === 0 &&
    (!state.moduleRead.hasData || !state.resourceRead.hasData);

  useEffect(() => {
    if (capabilities.canOperateResources || !isPreviewMode) return;
    setIsPreviewMode(false);
  }, [capabilities.canOperateResources, isPreviewMode]);

  useEffect(() => {
    setIsCourseOutlineOpen(true);
    setSelectedLessonId(null);
  }, [capabilities.activeCommunityId]);

  useEffect(() => {
    setIsCourseOutlineOpen(!isNarrowViewport());
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
    if (selectedModuleId && !selectedModuleExists && state.moduleRead.status === "ready" && state.resourceRead.status === "ready") {
      actions.handleSelectModule(null);
    }
  }, [actions, state.moduleRead.status, state.resourceRead.status, moduleViews, selectedModuleId]);

  useEffect(() => {
    if (pendingDeleteResourceId && !pendingDeleteResource) {
      setPendingDeleteResourceId(null);
      setIsDeletingResource(false);
    }
  }, [pendingDeleteResource, pendingDeleteResourceId]);

  useEffect(() => {
    const editingId = actions.resourceEditor.editingResourceId;
    if (!editingId || !selectedResource || editingId !== selectedResource.id) {
      setActiveResourceEditField(null);
    }
  }, [actions.resourceEditor.editingResourceId, selectedResource]);

  const handleModuleDragStart = (event: DragEvent<HTMLElement>, module: ResourceModuleView) => {
    if (!canReorderModules) {
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
    if (!draggedId || module.id === draggedId) return;
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
      const targetModuleId = module.id;
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
    if (!draggedId || draggedId === module.id) return;
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
    const moduleSelectionId = resource.module_id;
    if (!canManageResources || getResourceRole(resource) !== "page" || !moduleSelectionId) {
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
    const moduleSelectionId = resource.module_id;
    draggingResourceIdRef.current = null;
    draggingResourceModuleIdRef.current = null;
    setDraggingResourceId(null);
    setDraggingResourceModuleId(null);
    setDropTargetResourceId(null);
    setDropTargetModuleId(null);
    if (!draggedId || draggedId === resource.id) return;
    if (getResourceRole(resource) !== "page" || !moduleSelectionId) return;
    const moduleId = moduleSelectionId;
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
    void actions.handleReorderResources(moduleSelectionId, nextIds);
  };

  const handleOpenCourse = (module: ResourceModuleView) => {
    actions.handleSelectModule(module.id);
    const firstResource = getFirstResourceForModule(module);
    setSelectedLessonId(firstResource?.id ?? null);
  };

  const handleBackToCatalog = () => {
    actions.resourceEditor.cancelInlineEditResource();
    setActiveResourceEditField(null);
    setSelectedLessonId(null);
    actions.handleSelectModule(null);
  };

  const handleSelectResource = (resource: CommunityResource) => {
    if (!resource.module_id) return;
    if (selectedModuleId !== resource.module_id) {
      actions.handleSelectModule(resource.module_id);
    }
    setSelectedLessonId(resource.id);
    if (isNarrowViewport()) {
      setIsCourseOutlineOpen(false);
    }
  };

  // Where the open lesson sits in its course, for the line over its title
  // and the Next button under it.
  const selectedLessonPlace = useMemo<WebLessonCoursePlace | null>(() => {
    const lessons = selectedModuleSection?.lessonResources ?? [];
    const index = selectedResource ? lessons.findIndex((resource) => resource.id === selectedResource.id) : -1;
    if (!selectedModule || index < 0) return null;
    const next = lessons[index + 1] ?? null;
    return {
      name: selectedModule.name,
      position: index + 1,
      total: lessons.length,
      next: next ? { title: next.title, open: () => handleSelectResource(next) } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedModuleSection, selectedResource]);

  // Undo after Done: the lesson as it stood when editing began. Autosave keeps
  // saving while the owner types, so once editing ends the saved lesson is
  // compared with this, and if it changed a toast offers to put it back.
  type EditSessionStart = { resourceId: string; title: string; bodyMd: string | null };
  const editSessionStartRef = useRef<EditSessionStart | null>(null);
  const [undoCheck, setUndoCheck] = useState<EditSessionStart | null>(null);
  const [undoOffer, setUndoOffer] = useState<EditSessionStart | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [historyResourceId, setHistoryResourceId] = useState<string | null>(null);
  const editingResourceId = actions.resourceEditor.editingResourceId;
  const wasEditingRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = wasEditingRef.current;
    wasEditingRef.current = editingResourceId;
    if (!previous || editingResourceId === previous) return;
    const start = editSessionStartRef.current;
    editSessionStartRef.current = null;
    if (start?.resourceId === previous) setUndoCheck(start);
  }, [editingResourceId]);
  // The list reloads after the last save; compare once it has.
  useEffect(() => {
    if (!undoCheck) return;
    const saved = state.resources.find((resource) => resource.id === undoCheck.resourceId);
    if (saved && (saved.title !== undoCheck.title || (saved.body_md ?? "") !== (undoCheck.bodyMd ?? ""))) {
      setUndoOffer(undoCheck);
      setUndoNote(null);
      setUndoCheck(null);
      return;
    }
    const timeoutId = window.setTimeout(() => setUndoCheck(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [undoCheck, state.resources]);
  useEffect(() => {
    if (!undoOffer && !undoNote) return;
    const timeoutId = window.setTimeout(() => {
      setUndoOffer(null);
      setUndoNote(null);
    }, undoOffer ? 15000 : 3000);
    return () => window.clearTimeout(timeoutId);
  }, [undoOffer, undoNote]);
  const undoLastEdit = async () => {
    const offer = undoOffer;
    if (!offer || !actions.resourceEditor.restoreVersion) return;
    setUndoOffer(null);
    const ok = await actions.resourceEditor.restoreVersion({ resourceId: offer.resourceId, title: offer.title, bodyMd: offer.bodyMd });
    setUndoNote(ok ? "Changes undone." : "Couldn't undo. Open History to restore an earlier version.");
  };
  const historyResource = historyResourceId ? state.resources.find((resource) => resource.id === historyResourceId) ?? null : null;
  const listVersions = actions.resourceEditor.listVersions;
  const loadHistory = useCallback(
    () => (historyResourceId && listVersions ? listVersions(historyResourceId) : Promise.resolve([])),
    [historyResourceId, listVersions],
  );
  const restoreHistoryVersion = async (version: CommunityResourceVersion) => {
    if (!actions.resourceEditor.restoreVersion) return false;
    // The editor's text would be saved over the restored version, so editing stops first.
    if (actions.resourceEditor.editingResourceId === version.resource_id) {
      editSessionStartRef.current = null;
      actions.resourceEditor.cancelInlineEditResource();
      setActiveResourceEditField(null);
    }
    const ok = await actions.resourceEditor.restoreVersion({ revisionId: version.id });
    if (ok) setUndoNote("Earlier version restored. The one it replaced is in History.");
    return ok;
  };

  const startResourceInlineEdit = (
    resource: CommunityResource,
    field: WebCommunityResourceInlineEditorField,
  ) => {
    handleSelectResource(resource);
    if (actions.resourceEditor.editingResourceId !== resource.id) {
      editSessionStartRef.current = { resourceId: resource.id, title: resource.title, bodyMd: resource.body_md };
    }
    actions.resourceEditor.beginInlineEditResource(resource);
    setActiveResourceEditField(field);
  };

  const editRequestKey = props.editRequest?.key ?? null;
  useEffect(() => {
    const resource = props.editRequest ? state.resources.find((item) => item.id === props.editRequest?.resourceId) : null;
    if (resource && capabilities.canOperateResources) startResourceInlineEdit(resource, "body");
    // Only a new request opens the editor, not a refreshed resource list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequestKey]);

  const runPageDraftCreation = async (
    createDraft: () => Promise<CommunityResource | null>,
  ): Promise<CommunityResource | null> => {
    if (pageDraftCreationInFlightRef.current) return null;
    pageDraftCreationInFlightRef.current = true;
    setIsCreatingPageDraft(true);
    try {
      return await createDraft();
    } finally {
      pageDraftCreationInFlightRef.current = false;
      setIsCreatingPageDraft(false);
    }
  };

  const handleAddPageDraft = async (moduleId: string) => {
    // A new lesson goes last, in the order the lesson board uses too.
    const siblings = moduleSections.find((section) => section.module.id === moduleId)?.lessonResources ?? [];
    const order = siblings.reduce((max, resource) => Math.max(max, resource.lesson?.order ?? 0), 0) + 1;
    const created = await runPageDraftCreation(
      () => actions.handleCreateBlankPageDraft(moduleId, { order: Math.min(order, 9_999) }),
    );
    if (!created) return;
    actions.handleSelectModule(created.module_id);
    setSelectedLessonId(created.id);
    actions.resourceEditor.beginInlineEditResource(created);
    setActiveResourceEditField("title");
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

  const lessonProgress = props.lessonActivity?.progress;
  const lessonStatusByRef = lessonProgress?.loaded ? lessonProgress.statusByRef : null;
  const renderResourceRailItem = (resource: CommunityResource) => {
    const moduleSelectionId = resource.module_id;
    if (!moduleSelectionId) return null;
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
        isActive={selectedResource?.id === resource.id}
        isDone={lessonStatusByRef ? lessonStatusByRef[buildCommunityResourceEvidenceRef(resource.id)] === "done" : null}
        isStarted={lessonStatusByRef?.[buildCommunityResourceEvidenceRef(resource.id)] === "in_progress"}
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
  // The course's lesson style, for owners only: in the outline, and in the
  // lesson editor's bar. Members see
  // the style the owner picked.
  const lessonStyleSwitch = (place: "outline" | "editor") => {
    if (!canManageResources || !actions.handleSetModuleLessonStyle || !selectedModule) return null;
    const current = selectedModule.lesson_style === "video" ? "video" : "article";
    const labelId = `resource-course-style-label-${place}`;
    return (
      <div className={`resource-course-style-switch is-${place}`}>
        <span className="resource-course-style-label" id={labelId}>{place === "editor" ? "Course style" : "Lesson style"}</span>
        <div className="resource-course-style-options" role="radiogroup" aria-labelledby={labelId}>
          {([["article", "Article"], ["video", "Video course"]] as const).map(([style, label]) => {
            const selected = current === style;
            return (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? "is-selected" : undefined}
                title={style === "video" ? "Every lesson in this course opens with its video, large, above the title" : "Every lesson in this course reads as a clean page, like a newsletter post"}
                onClick={() => {
                  if (!selected) void actions.handleSetModuleLessonStyle?.(selectedModule, style);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  const selectedResourceInlineEditor =
    canManageResources && selectedResource
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
          onSaveInPlace: () => actions.resourceEditor.saveInlineEditResource({ keepEditing: true }),
          onUploadImage: actions.resourceEditor.uploadImage ?? null,
          styleControl: lessonStyleSwitch("editor"),
          onOpenVersions: actions.resourceEditor.listVersions && actions.resourceEditor.restoreVersion
            ? () => setHistoryResourceId(selectedResource.id)
            : null,
          onCancel: cancelResourceInlineEdit,
        }
      : null;

  return (
    <>
      <div className="community-panel community-utility-panel resources-panel">
        {isPreviewMode && memberView.inTopBar ? (
          <div className="resources-member-view-banner" role="status">
            <EyeOff aria-hidden="true" />
            <span><strong>Member view.</strong> You're seeing this page as your members do.</span>
            <button type="button" className="resources-preview-pill" onClick={() => setIsPreviewMode(false)}>Exit member view</button>
          </div>
        ) : null}
        {/* Members on the catalog have nothing here, so the row isn't drawn. */}
        {selectedModule || (capabilities.canOperateResources && !memberView.inTopBar) ? <div className="feed-header-row">
          <div className="feed-header-copy">
            {selectedModule ? (
              <button className="resources-back-btn" type="button" onClick={handleBackToCatalog}>
                <ArrowLeft aria-hidden="true" />
                <span>All courses</span>
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
            {capabilities.canOperateResources && !memberView.inTopBar ? (
              <div className="resources-header-view-actions">
                {/* The owner's look at the page as members see it: one small pill. */}
                <button
                  type="button"
                  className={`resources-preview-pill${isPreviewMode ? " is-on" : ""}`}
                  aria-pressed={isPreviewMode}
                  title={isPreviewMode ? "Exit member view" : "See this page as members see it"}
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                >
                  {isPreviewMode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  <span>{isPreviewMode ? "Exit member view" : "View as member"}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div> : null}

        {readErrors.map(({ collection, message }) => <div className="resource-read-error" role="alert" key={collection}>
          <span>{collection === "modules" ? "Courses" : "Lessons"} could not be refreshed. {message}</span>{" "}
          <button type="button" onClick={() => void actions.retryRead(collection)}>Retry {collection === "modules" ? "courses" : "lessons"}</button>
        </div>)}
        {isRefreshingResources && hasResourceContent ? <div role="status">Refreshing…</div> : null}
        {showInitialResourceLoading ? (
          <div className="community-panel-state-shell">
            <div className="community-chat-page-loading-card" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-title">Loading knowledge…</div>
              <div className="community-chat-page-loading-copy">
                {`Preparing courses and lessons for ${capabilities.activeCommunityName ?? "this community"}.`}
              </div>
              <div className="community-chat-page-loading-progress web-skeleton-pill" aria-hidden="true" />
            </div>
          </div>
        ) : !hasVisibleResourceContent && readErrors.length > 0 ? null : !hasVisibleResourceContent && !canManageResources ? (
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
                Courses and lessons shared by the community team will show up here.
              </div>
            </div>
          </div>
        ) : !selectedModule ? (
          <ResourceCourseCatalog
            items={courseCatalogItems}
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
              className={["knowledge-resource-rail", "resource-course-outline", isCourseOutlineOpen && "is-open"].filter(Boolean).join(" ")}
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
                  {state.resourceRead.hasData ? lessonCountLabel(selectedModuleSection?.lessonResources.length ?? 0) : <span aria-label="Lesson count not loaded">—</span>}
                  <ChevronDown aria-hidden="true" />
                </span>
              </button>
              {selectedCourseProgress ? (
                <div className="resource-course-outline-progress">
                  <span
                    className="resource-course-card-progress-track"
                    role="progressbar"
                    aria-label={`${selectedModule.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={selectedCourseProgress.total}
                    aria-valuenow={selectedCourseProgress.done}
                  >
                    <span style={{ width: `${Math.round((selectedCourseProgress.done / selectedCourseProgress.total) * 100)}%` }} />
                  </span>
                  <span>{selectedCourseProgress.done} of {selectedCourseProgress.total} done</span>
                </div>
              ) : null}
              <div
                id="resource-course-lesson-navigation"
                className="resource-course-outline-scroll"
                hidden={!isCourseOutlineOpen}
              >
                <nav
                  className="knowledge-resource-list"
                  aria-label={`${selectedModule.name} lesson navigation`}
                >
                  {selectedModuleSection?.lessonResources.map(renderResourceRailItem)}
                  {canManageResources ? (
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
              </div>
              {/* Owners switch how this course reads, right where they see it
                 ; Edit course has the same choice. */}
              {lessonStyleSwitch("outline")}
            </aside>
            <div className="knowledge-resource-reader">
              {selectedResource ? (
                <WebCommunityResourceViewerContent
                  resource={selectedResource}
                  editor={selectedResourceInlineEditor}
                  communityEmbeds={communityEmbeds}
                  lessonActivity={props.lessonActivity ?? null}
                  course={selectedLessonPlace}
                />
              ) : (
                <div className="community-panel-state-shell">
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                      </svg>
                    </div>
                    <div className="chat-empty-title">{state.resourceRead.hasData ? "No lessons yet" : "Loading lessons…"}</div>
                    <div className="chat-empty-text">
                      {!state.resourceRead.hasData ? "Lessons will appear once loading succeeds." : canManageResources
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

      {historyResourceId ? (
        <WebLessonVersionHistory
          resourceTitle={historyResource?.title ?? ""}
          load={loadHistory}
          onRestore={restoreHistoryVersion}
          onClose={() => setHistoryResourceId(null)}
        />
      ) : null}
      {undoOffer || undoNote ? (
        <div className="lesson-undo-toast" role="status" aria-live="polite">
          <span>{undoOffer ? "Lesson saved." : undoNote}</span>
          {undoOffer ? (
            <button type="button" onClick={() => void undoLastEdit()}>Undo changes</button>
          ) : null}
          <button
            type="button"
            className="lesson-undo-toast-close"
            aria-label="Dismiss"
            onClick={() => {
              setUndoOffer(null);
              setUndoNote(null);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
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
            if (selectedLessonId === pendingDeleteResource.id) {
              setSelectedLessonId(null);
            }
          }
        }}
      />
    </>
  );
}
