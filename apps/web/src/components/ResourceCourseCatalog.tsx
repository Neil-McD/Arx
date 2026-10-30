import { useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { courseCoverFallback } from "../../../../shared/courseCoverFallback";
import type { CommunityThemeV1 } from "../../../../shared/communityTheme";
import type { CommunityResourceModule } from "./communityResourcesContracts";

// The theme's course card choices as words for <html data-course-cards>, which
// styles/course-cards.css reads. Only choices that differ from Polynet's own
// card are listed, so an unset theme leaves the catalog as it was.
export function courseCardLookWords(theme: CommunityThemeV1 | null): string | null {
  if (!theme) return null;
  const words = [
    theme.course_card_style && theme.course_card_style !== "cover" ? theme.course_card_style : "",
    theme.course_card_pills === "show" ? "pills" : "",
    theme.course_card_description === "hide" ? "no-description" : "",
    theme.course_card_progress && theme.course_card_progress !== "bar" ? theme.course_card_progress : "",
    `edge-${theme.course_card_edge ?? "border"}`,
  ].filter(Boolean);
  return words.length ? words.join(" ") : null;
}

type ReorderDirection = "up" | "down";

// A member's place in a course: lessons done, and why it is locked if it is.
export type ResourceCourseProgress = {
  done: number;
  total: number;
  lockedReason?: string | null;
};

export type ResourceCourseCatalogItem = {
  module: CommunityResourceModule;
  lessonCount: number | null;
  progress?: ResourceCourseProgress | null;
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
  const { module, lessonCount, progress } = item;
  const coverFallback = courseCoverFallback(module.id, module.name);
  const lockedReason = progress?.lockedReason?.trim() || null;
  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : null;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDraft = module.module_status !== "live";
  const lessonsText = lessonCount === null ? null : `${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}`;
  // A pill for where the member is, shown when the theme turns pills on.
  const stage = lockedReason ? "locked" : percent === 100 ? "done" : percent ? "progress" : null;

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
        lockedReason ? "is-locked" : "",
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
          fallback={<span className="resource-course-card-cover-fallback" style={coverFallback.style} aria-hidden="true">
            {/* The letter stands in for a missing cover only; while a cover loads, the plain colour shows. */}
            {coverFallback.initial && !module.banner_url ? <span className="resource-course-card-cover-initial">{coverFallback.initial}</span> : null}
          </span>}
          loading="lazy"
          fetchPriority="low"
          aria-hidden
        />
        {lockedReason ? (
          <span className="resource-course-card-lock" role="img" aria-label="Locked">
            <Lock aria-hidden="true" />
          </span>
        ) : null}
        <span className="resource-course-card-body">
          <span className="resource-course-card-heading">
            <strong>{module.name}</strong>
            {canManage && isDraft ? <span className="resource-course-card-status">Draft</span> : null}
          </span>
          <span className="resource-course-card-description">
            {module.description_md?.trim() || "A guided collection of community lessons."}
          </span>
          {lessonsText || stage ? (
            <span className="resource-course-card-pills">
              {lessonsText ? <span className="resource-course-card-pill">{lessonsText}</span> : null}
              {stage ? <span className={`resource-course-card-pill is-${stage}`}>
                {stage === "locked" ? "Locked" : stage === "done" ? "Done" : "In progress"}</span> : null}
            </span>
          ) : null}
          {percent !== null && !lockedReason ? (
            <span
              // The Classroom bar prints the % inside it: on the fill once
              // there is room, on the empty track before that.
              className={`resource-course-card-progress${percent >= 20 ? " is-label-on-fill" : ""}`}
              role="progressbar"
              aria-label={`${module.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span className="resource-course-card-progress-track">
                <span style={{ width: `${percent}%` }} />
              </span>
              <span className="resource-course-card-progress-ring" style={{ "--course-progress": `${percent}%` } as CSSProperties} />
              <span className="resource-course-card-progress-label">{percent}%</span>
              <span className="resource-course-card-progress-fraction">{progress?.done}/{progress?.total} lessons</span>
            </span>
          ) : (
            <span className={`resource-course-card-meta ${lockedReason ? "is-locked" : "is-count"}`}>
              {lockedReason ? lockedReason : lessonsText ?? "Loading lessons…"}
            </span>
          )}
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
