import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Circle, CircleDot, GripVertical, LayoutList, Lock, PenLine, Plus,
} from "lucide-react";
import {
  computeCommunityLessonStages,
  type CommunityLessonProgressStatus,
  type CommunityLessonStage,
} from "../../../../shared/communityLessonContract";
import { buildCommunityResourceEvidenceRef } from "../../../../shared/communityEvidenceContract";
import { WebCommunityResourceViewerContent, type WebLessonActivity } from "./WebCommunityResourceViewerContent";
import type { CommunityResource } from "./communityResourcesContracts";
import type { WebCommunityLessonProgress } from "../controllers/useWebCommunityLessonProgress";
import "./WebCommunityLessonBoard.css";

// Knowledge -> Roadmap: the same lesson pages as Resources, read top to bottom as
// one journey of modules (a lesson's "stage" field). A stage stays locked until the gate lesson before it is
// done; opening a lesson shows it in the same reader as Resources, with the
// track's outline and Mark done / Next. Progress is the member's own, from the
// store the site SDK's progress()/setProgress() use. Owners edit the journey in
// place: rename and reorder stages and lessons, add either, and open a lesson in
// the Resources editor. Edits are the lessons' own stage fields.
//
// A track opens like a course in Resources: its modules in the outline on the left, and on the right either the
// track's own page (what it is, the lesson to do next) or the open lesson.
// Owners switch to Edit modules for the full editor.

const STATUS_LABEL: Record<CommunityLessonProgressStatus, string> = { not_started: "To do", in_progress: "In progress", done: "Done" };
const KIND_LABEL: Record<string, string> = { build: "Build", lesson: "Watch", checkpoint: "Checkpoint" };
const NEW_STAGE_NAME = "New module";
const DRAG_MIME = "application/x-polynet-roadmap-lesson";

type BoardLesson = { ref: string; resource: CommunityResource };

/** One lesson's new place on the roadmap, as the board save sends it. */
export type RoadmapLessonUpdate = { resourceId: string; stage: string; stageOrder?: number; order?: number; title?: string };

/** What an owner can do on the roadmap. Absent for members. */
export type RoadmapEditing = {
  save: (updates: RoadmapLessonUpdate[]) => Promise<boolean>;
  addLesson: (args: { stage: string; stageOrder: number; order: number; nearResourceId: string | null }) => Promise<CommunityResource | null>;
  editLesson: (resource: CommunityResource) => void;
};

/** What a track says about itself on its own page, beside the outline. */
export type RoadmapTrackAbout = {
  eyebrow: string;
  summary: string | null;
  outcomes: readonly string[];
  audience: string | null;
  // Owner buttons (Edit track, New track) under the page.
  actions?: ReactNode;
  // Under everything: what finishing the track opens.
  footer?: ReactNode;
  // Back to the tracks gallery, when there is more than one track.
  onAllTracks?: () => void;
};

/** Lesson pages that belong on the board: pages with a stage. */
export function communityBoardLessons(resources: readonly CommunityResource[]): BoardLesson[] {
  return resources
    .filter((resource) => resource.resource_role === "page" && resource.lesson?.stage)
    .map((resource) => ({ ref: buildCommunityResourceEvidenceRef(resource.id), resource }));
}

function byOrder(a: BoardLesson, b: BoardLesson) {
  return (a.resource.lesson?.order ?? 0) - (b.resource.lesson?.order ?? 0) || a.resource.title.localeCompare(b.resource.title);
}

/** The resources with the owner's unsaved moves laid over them, so the board moves at once. */
function withPending(resources: readonly CommunityResource[], pending: ReadonlyMap<string, RoadmapLessonUpdate>) {
  if (!pending.size) return resources;
  return resources.map((resource) => {
    const update = pending.get(resource.id);
    if (!update || !resource.lesson) return resource;
    return {
      ...resource,
      title: update.title ?? resource.title,
      lesson: { ...resource.lesson, stage: update.stage, stage_order: update.stageOrder ?? resource.lesson.stage_order, order: update.order ?? resource.lesson.order },
    };
  });
}

export function WebCommunityLessonBoard(props: {
  resources: readonly CommunityResource[];
  progress: WebCommunityLessonProgress;
  signedIn: boolean;
  onRequireSignIn: () => void;
  lessonActivity?: WebLessonActivity | null;
  editing?: RoadmapEditing | null;
  // Shown above the progress strip, for a track's title and picker.
  header?: ReactNode;
  // The track's name, at the top of an open lesson's outline.
  title?: string;
  // True while the board uses the reading layout (a track's page or an open lesson).
  onReadingChange?: (reading: boolean) => void;
  // True while a lesson is open, for Focus mode.
  onLessonOpenChange?: (open: boolean) => void;
  // A track's own page: the board opens like a course, outline beside it.
  about?: RoadmapTrackAbout;
  // Lessons the track keeps closed besides its checkpoints (a sold track's lessons past the free one).
  extraLocked?: ReadonlySet<string>;
  // Opens this lesson (a new key opens it again), for buttons outside the board.
  openRequest?: { ref: string; key: number } | null;
}) {
  const { progress, editing } = props;
  const [pending, setPending] = useState<Map<string, RoadmapLessonUpdate>>(() => new Map());
  // A fresh list from the server already holds every saved move.
  useEffect(() => { setPending(new Map()); }, [props.resources]);
  const resources = useMemo(() => withPending(props.resources, pending), [props.resources, pending]);
  const lessons = useMemo(() => communityBoardLessons(resources), [resources]);
  const [openRef, setOpenRef] = useState<string | null>(null);
  // Owners swap the track page for the full editor and back.
  const [editLayout, setEditLayout] = useState(false);
  const courseLayout = Boolean(props.about) && !(editing && editLayout);
  const onReadingChange = props.onReadingChange;
  const reading = openRef !== null || courseLayout;
  useEffect(() => {
    onReadingChange?.(reading);
    return () => onReadingChange?.(false);
  }, [reading, onReadingChange]);
  const onLessonOpenChange = props.onLessonOpenChange;
  useEffect(() => {
    onLessonOpenChange?.(openRef !== null);
    return () => onLessonOpenChange?.(false);
  }, [openRef, onLessonOpenChange]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  // A lesson the owner just added opens with its title ready to type.
  const [renameId, setRenameId] = useState<string | null>(null);
  const requestKey = props.openRequest?.key;
  useEffect(() => {
    if (props.openRequest) setOpenRef(props.openRequest.ref);
    // Only a new request opens the lesson; the ref alone changing is the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const statusOf = (ref: string): CommunityLessonProgressStatus => progress.statusByRef[ref] ?? "not_started";
  const doneRefs = new Set(lessons.filter((lesson) => statusOf(lesson.ref) === "done").map((lesson) => lesson.ref));
  const computed = computeCommunityLessonStages({
    lessons: lessons.map((lesson) => ({ ref: lesson.ref, lesson: lesson.resource.lesson ?? null })),
    doneRefs,
  });
  const { stages } = computed;
  const lockedRefs = props.extraLocked?.size ? new Set([...computed.lockedRefs, ...props.extraLocked]) : computed.lockedRefs;
  const inStage = (name: string) => lessons.filter((lesson) => lesson.resource.lesson?.stage === name).sort(byOrder);
  // Owners can open any lesson to check it; the lock is the member's.
  const isLocked = (ref: string) => !editing && lockedRefs.has(ref);
  const setStatus = (lesson: BoardLesson, status: CommunityLessonProgressStatus) => {
    if (!props.signedIn) { props.onRequireSignIn(); return; }
    progress.setStatus(lesson.resource.id, lesson.ref, status);
  };
  const open = (lesson: BoardLesson) => {
    setOpenRef(lesson.ref);
    if (props.signedIn && statusOf(lesson.ref) === "not_started") setStatus(lesson, "in_progress");
  };

  const save = async (updates: RoadmapLessonUpdate[]) => {
    if (!editing || !updates.length) return;
    setSaveError(null);
    setPending((current) => {
      const next = new Map(current);
      for (const update of updates) next.set(update.resourceId, { ...next.get(update.resourceId), ...update });
      return next;
    });
    const ok = await editing.save(updates).catch(() => false);
    if (!ok) {
      setPending((current) => {
        const next = new Map(current);
        for (const update of updates) next.delete(update.resourceId);
        return next;
      });
      setSaveError("That change didn't save. Try again.");
    }
  };

  // The whole journey at a glance: how much is done, and the one lesson to do next.
  const ordered = stages.flatMap((stage) => inStage(stage.name));
  const nextUp = ordered.find((lesson) => statusOf(lesson.ref) !== "done" && !lockedRefs.has(lesson.ref)) ?? null;
  const percent = lessons.length ? Math.round((doneRefs.size / lessons.length) * 100) : 0;
  const currentStage = nextUp?.resource.lesson?.stage ?? null;
  const minutes = lessons.reduce((sum, lesson) => sum + (lesson.resource.lesson?.minutes ?? 0), 0);
  const stageNumberOf = (ref: string | null) => stages.findIndex((stage) => inStage(stage.name).some((lesson) => lesson.ref === ref)) + 1;

  const opened = openRef ? lessons.find((lesson) => lesson.ref === openRef) ?? null : null;
  if ((opened || courseLayout) && lessons.length) {
    const at = opened ? ordered.findIndex((lesson) => lesson.ref === opened.ref) : -1;
    const prev = opened ? ordered[at - 1] ?? null : null;
    const next = opened ? ordered[at + 1] ?? null : null;
    const done = opened ? statusOf(opened.ref) === "done" : false;
    const canNext = next && !isLocked(next.ref);
    const about = props.about;
    const title = props.title ?? "Roadmap";
    return (
      <WebCommunityLessonStep
        key={opened?.ref ?? "track"}
        lesson={opened}
        title={title}
        outline={stages.map((stage, index) => {
          // Only the first locked module says what opens it; the lock on the rest is enough.
          const blockedAt = stage.locked && stage === stages.find((candidate) => candidate.locked) ? stageNumberOf(stage.blocked_by) : 0;
          return {
            name: stage.name,
            number: index + 1,
            doneCount: stage.done_count,
            lessonCount: stage.lesson_count,
            // Names the module, never a lesson the member hasn't reached yet.
            lockNote: blockedAt ? `Opens after the Module ${blockedAt} checkpoint` : null,
            locked: stage.locked,
            lessons: inStage(stage.name).map((lesson) => ({
              ref: lesson.ref, title: lesson.resource.title, done: statusOf(lesson.ref) === "done",
              started: statusOf(lesson.ref) === "in_progress", locked: isLocked(lesson.ref),
            })),
          };
        })}
        currentStage={opened?.resource.lesson?.stage ?? currentStage}
        doneCount={doneRefs.size}
        total={lessons.length}
        lessonActivity={props.lessonActivity ?? null}
        done={done}
        onOpen={(ref) => { const lesson = lessons.find((item) => item.ref === ref); if (lesson && !isLocked(ref)) open(lesson); }}
        onBack={about ? (about.onAllTracks ?? null) : () => setOpenRef(null)}
        backLabel={about ? "All tracks" : "Roadmap"}
        onOverview={about ? () => setOpenRef(null) : null}
        onToggleDone={() => { if (opened) setStatus(opened, done ? "in_progress" : "done"); }}
        onPrev={prev ? () => open(prev) : null}
        onNext={opened && canNext ? () => { if (!done && props.signedIn) setStatus(opened, "done"); open(next); } : null}
        nextTitle={canNext ? next.resource.title : null}
        onEdit={editing && opened ? () => editing.editLesson(opened.resource) : null}
        intro={about ? (
          <RoadmapTrackPage
            about={about}
            title={title}
            facts={[
              `${stages.length} ${stages.length === 1 ? "module" : "modules"}`,
              `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`,
              minutes ? `about ${formatMinutes(minutes)}` : null,
            ]}
            next={nextUp ? {
              title: nextUp.resource.title,
              started: statusOf(nextUp.ref) === "in_progress",
              where: `Module ${stageNumberOf(nextUp.ref)} · ${doneRefs.size} of ${lessons.length} done`,
              onOpen: () => open(nextUp),
            } : null}
            error={progress.error}
            onEditModules={editing ? () => { setOpenRef(null); setEditLayout(true); } : null}
          />
        ) : null}
      />
    );
  }

  const ops = editing ? roadmapOps(stages, inStage, save) : null;
  const addLesson = async (stage: CommunityLessonStage | null) => {
    if (!editing) return null;
    const stageIndex = stage ? stages.indexOf(stage) : stages.length;
    const siblings = stage ? inStage(stage.name) : [];
    const created = await editing.addLesson({
      stage: stage?.name ?? uniqueStageName(stages),
      stageOrder: Math.min(stageIndex + 1, 999),
      order: Math.min(siblings.reduce((max, lesson) => Math.max(max, lesson.resource.lesson?.order ?? 0), 0) + 1, 9_999),
      nearResourceId: siblings[0]?.resource.id ?? lessons[0]?.resource.id ?? null,
    });
    if (created) setRenameId(created.id);
    else setSaveError("Couldn't add a lesson. Try again.");
    return created;
  };

  if (!lessons.length) {
    return (
      <div className={`lesson-board lesson-journey${editing ? " is-editing" : ""}`}>
        {saveError ? <p className="lesson-journey-note is-error" role="alert">{saveError}</p> : null}
        <div className="lesson-journey-empty">
          <h3>No roadmap yet</h3>
          <p>{editing ? "Lay out the journey in modules. Each module holds lessons your members work through in order." : "The roadmap will show here once it's ready."}</p>
          {editing ? <AddButton label="Add the first module" onAdd={() => addLesson(null)} /> : null}
        </div>
      </div>
    );
  }

  // Only the first locked stage names the checkpoint that opens it; the rest
  // follow on from the stage before.
  const firstLocked = stages.find((stage) => stage.locked)?.name ?? null;
  const currentIndex = stages.findIndex((stage) => stage.name === currentStage);
  return (
    <div className={`lesson-board lesson-journey${editing ? " is-editing" : ""}`}>
      {progress.error ? <p className="lesson-journey-note" role="status">{progress.error}</p> : null}
      {saveError ? <p className="lesson-journey-note is-error" role="alert">{saveError}</p> : null}
      {props.about && editLayout ? (
        <div className="roadmap-edit-bar">
          <span><strong>{props.title ?? "Roadmap"}</strong> · Editing modules</span>
          <button type="button" className="lesson-board-primary-button" onClick={() => setEditLayout(false)}>Done editing</button>
        </div>
      ) : props.header ?? null}
      {props.about && editLayout ? null : <>
      <div className="lesson-journey-progress">
        <div className="lesson-journey-bar" role="progressbar" aria-label="Roadmap progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${doneRefs.size} of ${lessons.length} lessons done`}>
          {stages.map((stage) => (
            <span key={stage.name} className={stage.name === currentStage ? "is-current" : undefined} title={`${stage.name}: ${stage.done_count}/${stage.lesson_count}`} style={{ flexGrow: Math.max(stage.lesson_count, 1) }}>
              <i style={{ width: `${stage.lesson_count ? (stage.done_count / stage.lesson_count) * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="lesson-journey-progress-label">
          <span>{doneRefs.size} of {lessons.length} lessons{minutes ? ` · about ${formatMinutes(minutes)}` : ""}</span>
          <span>{currentIndex >= 0 ? `Module ${currentIndex + 1} of ${stages.length}` : `${stages.length} ${stages.length === 1 ? "module" : "modules"}`}</span>
        </div>
      </div>
      {nextUp ? (
        <button type="button" className="lesson-journey-next" onClick={() => open(nextUp)}>
          <span className="lesson-journey-next-copy">
            <small>{doneRefs.size ? "Up next" : "Start here"}</small>
            <strong>{nextUp.resource.title}</strong>
            <span>{[nextUp.resource.lesson?.stage, lessonMeta(nextUp.resource)].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="lesson-journey-next-go">{statusOf(nextUp.ref) === "in_progress" ? "Continue" : "Start"} <ArrowRight size={15} aria-hidden="true" /></span>
        </button>
      ) : <p className="lesson-journey-complete"><Check size={16} aria-hidden="true" /> Every lesson is done</p>}
      </>}

      <ol className="lesson-journey-stages">
        {stages.map((stage, index) => {
          const complete = stage.lesson_count > 0 && stage.done_count === stage.lesson_count;
          const state = complete ? "done" : stage.locked ? "locked" : stage.name === currentStage ? "current" : "todo";
          // Members see the stage they're on; owners see everything they edit.
          const isOpen = expanded[stage.name] ?? (editing ? true : state === "current" || (state === "todo" && !currentStage));
          const stageLessons = inStage(stage.name);
          const subline = complete
            ? "Done"
            : stage.locked
              ? stage.name === firstLocked && stageNumberOf(stage.blocked_by) ? `Opens after the Module ${stageNumberOf(stage.blocked_by)} checkpoint` : `Opens after Module ${index}`
              : null;
          const panelId = `lesson-journey-stage-${index}`;
          return (
            <li className="lesson-journey-stage" data-state={state} data-open={isOpen ? "" : undefined} key={stage.name}>
              <div className="lesson-journey-stage-head">
                <span className="lesson-journey-marker" aria-hidden="true">
                  {complete ? <Check size={13} /> : stage.locked ? <Lock size={12} /> : index + 1}
                </span>
                <div className="lesson-journey-stage-title">
                  {ops ? (
                    <InlineName value={stage.name} label="Module name" className="lesson-journey-stage-name" onSave={(name) => ops.renameStage(stage, name)} />
                  ) : (
                    <h3 className="lesson-journey-stage-name">
                      <button type="button" className="lesson-journey-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setExpanded((current) => ({ ...current, [stage.name]: !isOpen }))}>
                        {stage.name}
                      </button>
                    </h3>
                  )}
                  {subline ? <span className="lesson-journey-stage-meta">{subline}</span> : null}
                </div>
                <div className="lesson-journey-stage-tools">
                  {ops ? (
                    <>
                      <IconButton label={`Move ${stage.name} up`} disabled={index === 0} onClick={() => ops.moveStage(index, -1)}><ChevronUp size={16} /></IconButton>
                      <IconButton label={`Move ${stage.name} down`} disabled={index === stages.length - 1} onClick={() => ops.moveStage(index, 1)}><ChevronDown size={16} /></IconButton>
                    </>
                  ) : null}
                  <span className="lesson-journey-count">
                    {stage.done_count || state === "current" || complete ? `${stage.done_count}/${stage.lesson_count}` : `${stage.lesson_count} ${stage.lesson_count === 1 ? "lesson" : "lessons"}`}
                  </span>
                  {ops ? (
                    <IconButton label={`${isOpen ? "Fold" : "Open"} ${stage.name}`} onClick={() => setExpanded((current) => ({ ...current, [stage.name]: !isOpen }))}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </IconButton>
                  ) : (
                    <ChevronDown size={16} className="lesson-journey-chevron" aria-hidden="true" />
                  )}
                </div>
              </div>
              {isOpen ? (
                <div className="lesson-journey-stage-body" id={panelId}>
                  <ul className="lesson-journey-lessons" onDragOver={ops ? ops.allowDrop : undefined} onDrop={ops ? (event) => ops.dropAt(event, stage, null) : undefined}>
                    {stageLessons.map((lesson, at) => (
                      <JourneyLesson
                        key={lesson.ref}
                        lesson={lesson}
                        status={statusOf(lesson.ref)}
                        locked={lockedRefs.has(lesson.ref)}
                        clickable={!isLocked(lesson.ref)}
                        isNext={lesson.ref === nextUp?.ref}
                        autoRename={lesson.resource.id === renameId}
                        onOpen={() => open(lesson)}
                        editing={ops && editing ? {
                          canMoveUp: index > 0 || at > 0,
                          canMoveDown: index < stages.length - 1 || at < stageLessons.length - 1,
                          move: (direction) => ops.moveLesson(lesson, direction),
                          rename: (title) => ops.renameLesson(lesson, title),
                          edit: () => editing.editLesson(lesson.resource),
                          dragStart: (event) => ops.dragStart(event, lesson),
                          drop: (event) => ops.dropAt(event, stage, lesson),
                        } : null}
                      />
                    ))}
                  </ul>
                  {ops ? <AddButton label="Add a lesson" onAdd={() => addLesson(stage)} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {ops ? <div className="lesson-journey-add-stage"><AddButton label="Add a module" onAdd={() => addLesson(null)} /></div> : null}
    </div>
  );
}

function lessonMeta(resource: CommunityResource) {
  const fields = resource.lesson;
  const kind = fields?.gate ? "Checkpoint" : fields?.kind ? KIND_LABEL[fields.kind] ?? fields.kind : null;
  return [kind, fields?.minutes ? `${fields.minutes} min` : null].filter(Boolean).join(" · ");
}

function formatMinutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function uniqueStageName(stages: readonly CommunityLessonStage[]) {
  const names = new Set(stages.map((stage) => stage.name));
  if (!names.has(NEW_STAGE_NAME)) return NEW_STAGE_NAME;
  let n = 2;
  while (names.has(`${NEW_STAGE_NAME} ${n}`)) n += 1;
  return `${NEW_STAGE_NAME} ${n}`;
}

// Every owner edit as the list of lessons whose stage fields change. Stages are
// numbered 1..n and lessons 1..n within a stage, so the saved order is exactly
// what the owner sees.
function roadmapOps(
  stages: CommunityLessonStage[],
  inStage: (name: string) => BoardLesson[],
  save: (updates: RoadmapLessonUpdate[]) => Promise<void>,
) {
  const layout = () => stages.map((stage) => ({ name: stage.name, lessons: inStage(stage.name) }));
  const commit = (next: Array<{ name: string; lessons: BoardLesson[] }>, titles: Record<string, string> = {}) => {
    const updates: RoadmapLessonUpdate[] = [];
    next.forEach((stage, stageIndex) => stage.lessons.forEach((lesson, lessonIndex) => {
      const fields = lesson.resource.lesson;
      const stageOrder = Math.min(stageIndex + 1, 999);
      const order = Math.min(lessonIndex + 1, 9_999);
      const title = titles[lesson.resource.id];
      if (fields?.stage === stage.name && fields?.stage_order === stageOrder && fields?.order === order && !title) return;
      updates.push({ resourceId: lesson.resource.id, stage: stage.name, stageOrder, order, ...(title ? { title } : {}) });
    }));
    void save(updates);
  };
  const place = (lesson: BoardLesson, stageName: string, before: BoardLesson | null) => {
    const next = layout().map((stage) => ({ ...stage, lessons: stage.lessons.filter((item) => item.ref !== lesson.ref) }));
    const target = next.find((stage) => stage.name === stageName);
    if (!target) return;
    const at = before ? target.lessons.findIndex((item) => item.ref === before.ref) : -1;
    target.lessons.splice(at < 0 ? target.lessons.length : at, 0, lesson);
    commit(next.filter((stage) => stage.lessons.length));
  };
  return {
    renameStage: (stage: CommunityLessonStage, raw: string) => {
      const name = raw.trim().slice(0, 80);
      if (!name || name === stage.name) return;
      commit(layout().map((item) => (item.name === stage.name ? { ...item, name } : item)));
    },
    moveStage: (index: number, direction: -1 | 1) => {
      const next = layout();
      const to = index + direction;
      if (to < 0 || to >= next.length) return;
      [next[index], next[to]] = [next[to], next[index]];
      commit(next);
    },
    renameLesson: (lesson: BoardLesson, raw: string) => {
      const title = raw.trim();
      if (!title || title === lesson.resource.title) return;
      commit(layout(), { [lesson.resource.id]: title });
    },
    // Up from the top of a stage goes to the end of the stage above, and down
    // from the bottom to the start of the one below.
    moveLesson: (lesson: BoardLesson, direction: -1 | 1) => {
      const next = layout();
      const stageIndex = next.findIndex((stage) => stage.lessons.some((item) => item.ref === lesson.ref));
      if (stageIndex < 0) return;
      const list = next[stageIndex].lessons;
      const at = list.findIndex((item) => item.ref === lesson.ref);
      const to = at + direction;
      if (to >= 0 && to < list.length) {
        [list[at], list[to]] = [list[to], list[at]];
      } else {
        const neighbour = next[stageIndex + direction];
        if (!neighbour) return;
        list.splice(at, 1);
        if (direction < 0) neighbour.lessons.push(lesson); else neighbour.lessons.unshift(lesson);
      }
      commit(next.filter((stage) => stage.lessons.length));
    },
    dragStart: (event: DragEvent, lesson: BoardLesson) => {
      event.dataTransfer.setData(DRAG_MIME, lesson.ref);
      event.dataTransfer.effectAllowed = "move";
    },
    allowDrop: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    dropAt: (event: DragEvent, stage: CommunityLessonStage, before: BoardLesson | null) => {
      const ref = event.dataTransfer.getData(DRAG_MIME);
      if (!ref) return;
      event.preventDefault();
      event.stopPropagation();
      const lesson = layout().flatMap((item) => item.lessons).find((item) => item.ref === ref);
      if (lesson && lesson.ref !== before?.ref) place(lesson, stage.name, before);
    },
  };
}

function JourneyLesson(props: {
  lesson: BoardLesson;
  status: CommunityLessonProgressStatus;
  locked: boolean;
  clickable: boolean;
  isNext: boolean;
  autoRename?: boolean;
  onOpen: () => void;
  editing: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    move: (direction: -1 | 1) => void;
    rename: (title: string) => void;
    edit: () => void;
    dragStart: (event: DragEvent) => void;
    drop: (event: DragEvent) => void;
  } | null;
}) {
  const { lesson, status, editing } = props;
  const [renaming, setRenaming] = useState(false);
  // The list can show a new lesson before the board learns it was just added.
  useEffect(() => { if (props.autoRename && editing) setRenaming(true); }, [props.autoRename, Boolean(editing)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dropping, setDropping] = useState(false);
  const fields = lesson.resource.lesson;
  const meta = lessonMeta(lesson.resource);
  const icon = status === "done" ? <Check size={14} /> : props.locked ? <Lock size={13} /> : status === "in_progress" ? <CircleDot size={14} /> : <Circle size={14} />;
  return (
    <li
      className={`lesson-journey-lesson${props.isNext ? " is-next" : ""}${fields?.gate ? " is-gate" : ""}${dropping ? " is-drop-target" : ""}`}
      data-status={status}
      draggable={editing && !renaming ? true : undefined}
      onDragStart={editing ? editing.dragStart : undefined}
      onDragOver={editing ? (event) => { if (event.dataTransfer.types.includes(DRAG_MIME)) { event.preventDefault(); setDropping(true); } } : undefined}
      onDragLeave={editing ? () => setDropping(false) : undefined}
      onDrop={editing ? (event) => { setDropping(false); editing.drop(event); } : undefined}
    >
      {editing ? <span className="lesson-journey-grip" aria-hidden="true"><GripVertical size={14} /></span> : null}
      {renaming && editing ? (
        <div className="lesson-journey-lesson-main">
          <span className="lesson-journey-status" aria-hidden="true">{icon}</span>
          <InlineName
            value={lesson.resource.title}
            label="Lesson title"
            className="lesson-journey-lesson-title"
            startEditing
            onSave={(title) => { setRenaming(false); editing.rename(title); }}
            onCancel={() => setRenaming(false)}
          />
        </div>
      ) : (
        <button type="button" className="lesson-journey-lesson-main" disabled={!props.clickable} onClick={props.onOpen}>
          <span className="lesson-journey-status" aria-hidden="true">{icon}</span>
          <span className="lesson-journey-lesson-copy">
            <strong className="lesson-journey-lesson-title">{lesson.resource.title}</strong>
            {meta ? <span>{meta}</span> : null}
          </span>
          <span className="lesson-journey-lesson-state">{props.isNext ? "Up next" : STATUS_LABEL[status]}</span>
        </button>
      )}
      {editing ? (
        <div className="lesson-journey-lesson-tools">
          <IconButton label={`Rename ${lesson.resource.title}`} onClick={() => setRenaming(true)}><PenLine size={15} /></IconButton>
          <IconButton label={`Move ${lesson.resource.title} up`} disabled={!editing.canMoveUp} onClick={() => editing.move(-1)}><ChevronUp size={16} /></IconButton>
          <IconButton label={`Move ${lesson.resource.title} down`} disabled={!editing.canMoveDown} onClick={() => editing.move(1)}><ChevronDown size={16} /></IconButton>
          <button type="button" className="lesson-journey-edit" onClick={editing.edit}>Edit lesson</button>
        </div>
      ) : null}
    </li>
  );
}

function IconButton(props: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="lesson-journey-icon" aria-label={props.label} title={props.label} disabled={props.disabled} onClick={props.onClick}>
      <span aria-hidden="true">{props.children}</span>
    </button>
  );
}

function AddButton(props: { label: string; onAdd: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="lesson-journey-add"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await props.onAdd(); } finally { setBusy(false); } }}
    >
      <Plus size={15} aria-hidden="true" />
      <span>{busy ? "Adding…" : props.label}</span>
    </button>
  );
}

// A name that reads as text and becomes a field on click; Enter or leaving saves,
// Escape puts it back.
function InlineName(props: {
  value: string;
  label: string;
  className: string;
  startEditing?: boolean;
  onSave: (value: string) => void;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(Boolean(props.startEditing));
  const [draft, setDraft] = useState(props.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setDraft(props.value); }, [props.value, editing]);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  const finish = (keep: boolean) => {
    setEditing(false);
    if (keep && draft.trim() && draft.trim() !== props.value) props.onSave(draft);
    else { setDraft(props.value); props.onCancel?.(); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  };
  if (editing) {
    return (
      <input
        ref={input}
        className={`${props.className} lesson-journey-name-input`}
        aria-label={props.label}
        value={draft}
        maxLength={props.label === "Module name" ? 80 : 200}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
      />
    );
  }
  return (
    <button type="button" className={`${props.className} lesson-journey-name`} title={`Rename ${props.value}`} onClick={() => setEditing(true)}>
      {props.value}
      <span className="sr-only"> (rename)</span>
    </button>
  );
}

type StepOutline = Array<{
  name: string;
  number: number;
  doneCount: number;
  lessonCount: number;
  lockNote: string | null;
  locked: boolean;
  lessons: Array<{ ref: string; title: string; done: boolean; started: boolean; locked: boolean }>;
}>;

// A track or a lesson opened from the roadmap reads exactly like a course in
// Resources: the track's modules on the left, then the track's own page or the
// lesson in the middle, and the lesson's Contents on the right. Only the module
// you're in is open; the others fold down to their name and done count.
function WebCommunityLessonStep(props: {
  lesson: BoardLesson | null;
  title: string;
  outline: StepOutline;
  currentStage: string | null;
  doneCount: number;
  total: number;
  done: boolean;
  onOpen: (ref: string) => void;
  onBack: (() => void) | null;
  backLabel: string;
  // The track's own page, shown when no lesson is open.
  onOverview: (() => void) | null;
  intro: ReactNode;
  onToggleDone: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  nextTitle: string | null;
  onEdit: (() => void) | null;
  lessonActivity?: WebLessonActivity | null;
}) {
  const resource = props.lesson?.resource ?? null;
  // Open beside the lesson; on a phone it folds into a bar above it.
  const [outlineOpen, setOutlineOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const topRef = useRef<HTMLDivElement | null>(null);
  // A new lesson starts at its top, without jumping when it's already in view.
  useEffect(() => {
    // The whole Knowledge page, so the back link above the outline shows too.
    const top = topRef.current?.closest<HTMLElement>(".community-knowledge-page") ?? topRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  }, [resource?.id]);
  const firstOpen = props.outline.find((module) => !module.locked)?.name ?? null;
  const focusModule = props.currentStage ?? firstOpen;
  return (
    <div className="community-panel community-utility-panel resources-panel lesson-board-step-page" ref={topRef}>
      {/* The same top row as a course in Resources ("All courses"), so the
          page keeps its header space under the shell's icons. */}
      <div className="feed-header-row lesson-step-header-row">
        <div className="feed-header-copy">
          {props.onBack ? (
            <button className="resources-back-btn" type="button" onClick={props.onBack}>
              <ArrowLeft aria-hidden="true" />
              <span>{props.backLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="knowledge-workspace resource-course-workspace">
        <aside className={`knowledge-resource-rail resource-course-outline lesson-step-outline${outlineOpen ? " is-open" : ""}`} aria-label={`${props.title} lessons`}>
          <button className="resource-course-outline-header" type="button" aria-expanded={outlineOpen}
            aria-controls="lesson-step-navigation" onClick={() => setOutlineOpen((current) => !current)}>
            <span className="resource-course-outline-title" title={props.title}>{props.title}</span>
            <span className="resource-course-outline-count">{props.total} lessons<ChevronDown aria-hidden="true" /></span>
          </button>
          <div className="resource-course-outline-progress">
            <span className="resource-course-card-progress-track" role="progressbar" aria-label={`${props.title} progress`}
              aria-valuemin={0} aria-valuemax={props.total} aria-valuenow={props.doneCount}>
              <span style={{ width: `${props.total ? Math.round((props.doneCount / props.total) * 100) : 0}%` }} />
            </span>
            <span>{props.doneCount} of {props.total} done</span>
          </div>
          <div id="lesson-step-navigation" className="resource-course-outline-scroll" hidden={!outlineOpen}>
            <nav className="knowledge-resource-list" aria-label={`${props.title} lesson navigation`}>
              {props.onOverview ? (
                <div className={`knowledge-resource-item lesson-step-overview${props.lesson ? "" : " is-active"}`}>
                  <button className="knowledge-resource-item-main" type="button" aria-current={props.lesson ? undefined : "page"} onClick={props.onOverview}>
                    <span className="lesson-step-overview-icon" aria-hidden="true"><LayoutList /></span>
                    <span className="knowledge-resource-item-copy"><span className="knowledge-resource-item-title">Track overview</span></span>
                  </button>
                </div>
              ) : null}
              {props.outline.map((module) => {
                const panelId = `lesson-step-module-${module.number}`;
                const isOpen = !(folded[module.name] ?? module.name !== focusModule);
                const complete = module.lessonCount > 0 && module.doneCount === module.lessonCount;
                return (
                  <div className="lesson-step-outline-stage" data-open={isOpen ? "" : undefined} data-locked={module.locked ? "" : undefined} key={module.name}>
                    <button type="button" className="lesson-step-module" aria-expanded={isOpen} aria-controls={panelId}
                      onClick={() => setFolded((current) => ({ ...current, [module.name]: isOpen }))}>
                      <span className="lesson-step-module-copy">
                        <span className="lesson-step-outline-stage-name">Module {module.number}</span>
                        <span className="lesson-step-module-name">{module.name}</span>
                        {module.lockNote ? <span className="lesson-step-module-lock">{module.lockNote}</span> : null}
                      </span>
                      <span className="lesson-step-module-count">
                        {complete ? <Check aria-label="Done" /> : module.locked ? <Lock aria-label="Not open yet" /> : null}
                        {module.doneCount ? `${module.doneCount}/${module.lessonCount}` : module.lessonCount}
                      </span>
                      <ChevronDown className="lesson-step-module-chevron" aria-hidden="true" />
                    </button>
                    {isOpen ? (
                      <div id={panelId} className="lesson-step-module-lessons">
                        {module.lessons.map((item) => {
                          const active = item.ref === props.lesson?.ref;
                          return (
                            <div key={item.ref} className={`knowledge-resource-item${active ? " is-active" : ""}${item.locked ? " is-locked" : ""}`}>
                              <button className="knowledge-resource-item-main" type="button" aria-current={active ? "page" : undefined}
                                disabled={item.locked} onClick={() => props.onOpen(item.ref)}>
                                <span className={`knowledge-resource-item-status${item.done ? " is-done" : item.started ? " is-started" : ""}`} role="img"
                                  aria-label={item.done ? "Done" : item.locked ? "Not open yet" : item.started ? "In progress" : "Not started"}>
                                  {item.done ? <Check aria-hidden="true" /> : item.locked ? <Lock aria-hidden="true" /> : null}
                                </span>
                                <span className="knowledge-resource-item-copy">
                                  <span className="knowledge-resource-item-topline">
                                    <span className="knowledge-resource-item-title" title={item.title}>{item.title}</span>
                                  </span>
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </div>
          {props.onEdit ? (
            <button type="button" className="lesson-journey-edit lesson-step-edit" onClick={props.onEdit}>
              <PenLine size={14} aria-hidden="true" /> Edit lesson
            </button>
          ) : null}
        </aside>
        <div className="knowledge-resource-reader">
          {resource ? (
            <WebCommunityResourceViewerContent resource={resource} lessonActivity={props.lessonActivity ?? null} actions={
              <nav className="lesson-step-footer" aria-label="Lesson steps">
                <div className="lesson-step-footer-row">
                  <button type="button" className={`lesson-step-done${props.done ? " is-done" : ""}`} aria-pressed={props.done} onClick={props.onToggleDone}>
                    <span className="lesson-step-done-box" aria-hidden="true">{props.done ? <Check /> : null}</span>
                    {props.done ? "Done" : "Mark as done"}
                  </button>
                  {props.onNext ? (
                    <button type="button" className="lesson-step-next" onClick={props.onNext}>
                      <span><small>Next</small>{props.nextTitle}</span><ArrowRight aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {props.onPrev ? <button type="button" className="lesson-step-link" onClick={props.onPrev}><ArrowLeft aria-hidden="true" /> Previous lesson</button> : null}
              </nav>
            } />
          ) : props.intro}
        </div>
      </div>
    </div>
  );
}

// A track's own page, beside its outline: what it is, the one lesson to do
// next, and what it gets you. The cover art and the sales hero stay on the
// tracks gallery (and on a track that's sold), so this page goes straight to the work.
function RoadmapTrackPage(props: {
  about: RoadmapTrackAbout;
  title: string;
  facts: Array<string | null>;
  next: { title: string; started: boolean; where: string; onOpen: () => void } | null;
  error: string | null;
  onEditModules: (() => void) | null;
}) {
  const { about } = props;
  return (
    <article className="roadmap-track-page" aria-label={props.title}>
      <p className="roadmap-track-crumb">{[about.eyebrow, ...props.facts].filter(Boolean).join(" · ")}</p>
      <h2 className="roadmap-track-title">{props.title}</h2>
      {about.summary ? <p className="roadmap-track-promise">{about.summary}</p> : null}
      {props.error ? <p className="lesson-journey-note" role="status">{props.error}</p> : null}
      {props.next ? (
        <button type="button" className="roadmap-track-next" onClick={props.next.onOpen}>
          <span className="roadmap-track-next-copy">
            <strong>{props.next.started ? "Up next" : "Start here"}: {props.next.title}</strong>
            <span>{props.next.where}</span>
          </span>
          <span className="roadmap-track-next-go">{props.next.started ? "Continue" : "Start"} <ArrowRight aria-hidden="true" /></span>
        </button>
      ) : <p className="lesson-journey-complete"><Check size={16} aria-hidden="true" /> Every lesson is done</p>}
      {about.outcomes.length ? (
        <section className="roadmap-track-outcomes" aria-label="What you'll be able to do">
          <h3>What you'll be able to do</h3>
          <ul>
            {about.outcomes.map((line) => <li key={line}><Check aria-hidden="true" />{line}</li>)}
          </ul>
        </section>
      ) : null}
      {about.audience ? <p className="roadmap-track-who"><b>Who it's for</b> {about.audience}</p> : null}
      {about.actions || props.onEditModules ? (
        <div className="roadmap-track-owner">
          {props.onEditModules ? (
            <button type="button" className="lesson-journey-edit" onClick={props.onEditModules}><PenLine size={14} aria-hidden="true" /> Edit modules</button>
          ) : null}
          {about.actions}
        </div>
      ) : null}
      {about.footer}
    </article>
  );
}
