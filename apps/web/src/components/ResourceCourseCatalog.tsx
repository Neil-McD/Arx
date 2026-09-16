import { useState, type DragEvent, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import type { CommunityResourceModule } from "./communityResourcesContracts";

type ReorderDirection = "up" | "down";

export type ResourceCourseCatalogItem = {
  module: CommunityResourceModule;
  lessonCount: number | null;
};

type ResourceCourseCatalogProps = {
  items: ResourceCourseCatalogItem[];
  canManage: boolean;
  canReorder: boolean;
  draggingModuleId: string | null;
  dropTargetModuleId: string | null;
  onCreate: (() => void) | null;
  onOpen: (module: CommunityResourceModule) => void;
  onEdit: (module: CommunityResourceModule) => void;
  onSetStatus: (module: CommunityResourceModule, status: "draft" | "live") => void;
  onDelete: (module: CommunityResourceModule) => void;
  onMove: (module: CommunityResourceModule, direction: ReorderDirection) => void;
  onDragStart: (event: DragEvent<HTMLElement>, module: CommunityResourceModule) => void;
  onDragOver: (event: DragEvent<HTMLElement>, module: CommunityResourceModule) => void;
  onDragLeave: (module: CommunityResourceModule) => void;
  onDrop: (event: DragEvent<HTMLElement>, module: CommunityResourceModule) => void;
  onDragEnd: () => void;
};

function ResourceCourseCard(props: {
  item: ResourceCourseCatalogItem;
  canManage: boolean;
  canReorder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onSetStatus: (status: "draft" | "live") => void;
  onDelete: () => void;
  onMove: (direction: ReorderDirection) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const {
    item,
    canManage,
    canReorder,
    canMoveUp,
    canMoveDown,
    isDragging,
    isDropTarget,
    onOpen,
    onEdit,
    onSetStatus,
    onDelete,
    onMove,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  } = props;
  const { module, lessonCount } = item;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDraft = module.module_status !== "live";

  const closeAndRun = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    action();
  };

  return (
    <article
      className={[
        "resource-course-card",
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
        <span className="resource-course-card-drag" aria-hidden="true" title="Drag to reorder course">
          <GripVertical />
        </span>
      ) : null}
      {canManage ? (
        <div className="resource-course-card-menu">
          <button
            className="resource-course-card-menu-trigger"
            type="button"
            aria-label={`Actions for ${module.name}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen((current) => !current);
            }}
          >
            <MoreHorizontal />
          </button>
          {isMenuOpen ? (
            <div className="resource-course-card-menu-popover web-floating-menu" role="menu">
              {canReorder && canMoveUp ? (
                <button type="button" role="menuitem" onClick={(event) => closeAndRun(event, () => onMove("up"))}>
                  <ArrowUp />
                  <span>Move up</span>
                </button>
              ) : null}
              {canReorder && canMoveDown ? (
                <button type="button" role="menuitem" onClick={(event) => closeAndRun(event, () => onMove("down"))}>
                  <ArrowDown />
                  <span>Move down</span>
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={(event) => closeAndRun(event, onEdit)}>
                <Pencil />
                <span>Edit course</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => closeAndRun(event, () => onSetStatus(isDraft ? "live" : "draft"))}
              >
                {isDraft ? <Eye /> : <EyeOff />}
                <span>{isDraft ? "Make live" : "Move to draft"}</span>
              </button>
              <button className="danger" type="button" role="menuitem" onClick={(event) => closeAndRun(event, onDelete)}>
                <Trash2 />
                <span>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button className="resource-course-card-main" type="button" onClick={onOpen}>
        <StableFramedMedia
          className="resource-course-card-cover"
          imageClassName="resource-course-card-cover-image"
          imageUrl={module.banner_url}
          frame={{
            focusX: module.banner_focus_x,
            focusY: module.banner_focus_y,
            zoom: module.banner_zoom,
          }}
          alt=""
          fallback={<BookOpen aria-hidden="true" />}
          loading="lazy"
          fetchPriority="low"
          aria-hidden
        />
        <span className="resource-course-card-body">
          <span className="resource-course-card-heading">
            <strong>{module.name}</strong>
            {canManage && isDraft ? <span className="resource-course-card-status">Draft</span> : null}
          </span>
          <span className="resource-course-card-description">
            {module.description_md?.trim() || "A guided collection of community lessons."}
          </span>
          <span className="resource-course-card-meta">
            {lessonCount === null ? "Lessons not loaded" : `${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}`}
          </span>
        </span>
      </button>
    </article>
  );
}

export function ResourceCourseCatalog(props: ResourceCourseCatalogProps) {
  const {
    items,
    canManage,
    canReorder,
    draggingModuleId,
    dropTargetModuleId,
    onCreate,
    onOpen,
    onEdit,
    onSetStatus,
    onDelete,
    onMove,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  } = props;

  return (
    <section className="resource-course-catalog" aria-label="Courses">
      <div className="resource-course-grid">
        {items.map((item, index) => (
          <ResourceCourseCard
            key={item.module.id}
            item={item}
            canManage={canManage}
            canReorder={canReorder}
            canMoveUp={canReorder && index > 0}
            canMoveDown={canReorder && index < items.length - 1}
            isDragging={draggingModuleId === item.module.id}
            isDropTarget={dropTargetModuleId === item.module.id}
            onOpen={() => onOpen(item.module)}
            onEdit={() => onEdit(item.module)}
            onSetStatus={(status) => onSetStatus(item.module, status)}
            onDelete={() => onDelete(item.module)}
            onMove={(direction) => onMove(item.module, direction)}
            onDragStart={(event) => onDragStart(event, item.module)}
            onDragOver={(event) => onDragOver(event, item.module)}
            onDragLeave={() => onDragLeave(item.module)}
            onDrop={(event) => onDrop(event, item.module)}
            onDragEnd={onDragEnd}
          />
        ))}
        {canManage && onCreate ? (
          <button
            className="resource-course-create-card"
            type="button"
            aria-label="Add course"
            onClick={onCreate}
          >
            <span className="resource-course-create-card-label">
              <Plus aria-hidden="true" />
              <span>Add course</span>
            </span>
          </button>
        ) : null}
      </div>

    </section>
  );
}
