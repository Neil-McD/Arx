// Design system v1: Knowledge as a classroom, in the mock's markup
// (docs/design/hifi-mock, Knowledge). The library: ask, continue where you
// left off, and the courses as cards with progress, in pages. An open course:
// its lesson, Mark done and Next, with the outline in the right column. Under
// the shelf, one list of notes, files and links (KitKnowledgeList); a note
// opens in the right column.
import { courseProgressWord } from "../../../../shared/communityMemberWords";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePageHeaderToolbar } from "../components/CommunityPageHeader";
import { useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import {
  fetchCourseProgressSummary,
  fetchMyLessonProgress,
  setMyLessonDone,
  type CourseProgressSummary,
} from "../../../../shared/cloudCommunityClassroomGateway";
import {
  createCommunityNote,
  deleteCommunityNote,
  fetchCommunityNotes,
  fetchNoteSources,
  undoLearnedNote,
  updateCommunityNote,
  type CommunityNoteView,
} from "../../../../shared/cloudCommunityNotesGateway";
import { getCloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import { courseLessons, courseProgress, pageOf, coursePath } from "../../../../shared/communityClassroom";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";
import { askGuide, openGuideFromSearch } from "../components/guideSearch";
import { WebCommunityResourceViewerContent } from "../components/WebCommunityResourceViewerContent";
import { PanelBrain, useBrainMap } from "./KitBrain";
import { BriefPart, usePlaceBriefRead } from "./KitBrief";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveAnswer } from "../../../../shared/liveQuery";
import { NoteForm, OpenNote } from "./KitKnowledgeNotes";
import { PanelAction, PanelLine, PanelPart, usePanelSettled } from "./KitPanel";
import { KitLessonEditor, lessonLinkPlace, type LessonPatch } from "./KitLessonEditor";
import { cx, Icon, KitApp, Rail, TextLink, useMinWidth } from "./kit";
import { KitCourseInline, type CourseEditPatch } from "./KitCourseEdit";
import { useDragOrder } from "./useDragOrder";
import { askInApp } from "../../../../shared/inAppConfirm";
import { KitKnowledgeAddButtons, KitKnowledgeList, type KnowledgeAddResult } from "./KitKnowledgeList";
import { useCommunityAgentOn } from "../controllers/communityAgentOn";

const SHELF = 6;

// The shelf's order after one book moves one place; null when it can't.
export function courseOrderAfterMove(ids: string[], index: number, by: -1 | 1): string[] | null {
  const to = index + by;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// A course without a cover gets one of three soft tints, the same one every
// time (from its id), so a shelf never reads as a row of empty boxes.
const COVER_TINTS = ["c2", "c3", "c4"] as const;
function coverTint(id: string): (typeof COVER_TINTS)[number] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return COVER_TINTS[hash % COVER_TINTS.length];
}

function firstLine(markdown: string | null): string {
  const line = String(markdown ?? "").split("\n").map((part) => part.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.length > 110 ? `${line.slice(0, 107)}…` : line;
}

// What a host most needs to hear: drafts members can't see come first.
function hostLead(courses: CommunityResourceModule[], learning: number): string {
  if (courses.length === 0) return "Start with one course.";
  const drafts = courses.filter((course) => course.module_status === "draft");
  if (drafts.length === courses.length) return courses.length === 1 ? `${courses[0].name} is a draft. Members can't see it yet.` : "None of your courses is published yet.";
  if (drafts.length === 1) return `${drafts[0].name} is a draft. Members can't see it yet.`;
  if (drafts.length > 1) return `${drafts.length} courses are drafts. Members can't see them yet.`;
  if (learning > 0) return `Members have started ${learning} ${learning === 1 ? "course" : "courses"} between them.`;
  return "Your courses are ready for members.";
}

// Six dots: something you can pick up.
function GripDots() {
  return <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" /><circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /></svg>;
}

export function KitClassroom(props: {
  communityId: string;
  communityName: string;
  session: unknown;
  modules: CommunityResourceModule[];
  resources: CommunityResource[];
  loaded: boolean;
  // Hosts (and never under "View as a member").
  canManage: boolean;
  // A course asked for by its address, or null.
  openCourseId: string | null;
  onOpenCourse: (moduleId: string | null) => void;
  // "What your guide knows": the builders' list of what the guide answers
  // from. The page's header belongs to the caller, so it holds this.
  guideMemoryOpen?: boolean;
  onOpenGuideMemory?: (open: boolean) => void;
  // The community brain: the map of what the community knows.
  onOpenBrain?: () => void;
  // Makes a draft course with these lessons and opens it (hosts).
  onCreateCourse?: (name: string, lessons: string[]) => Promise<KnowledgeAddResult>;
  // Files and links the guide was given: read the failed ones again, or take
  // one away (hosts).
  onRetrySources?: () => Promise<KnowledgeAddResult>;
  onRemoveSource?: (resourceId: string) => Promise<void>;
  // The shelf's order, as members see it (hosts).
  onReorderCourses?: (moduleIds: string[]) => Promise<boolean> | boolean;
  // A course's own tools (hosts): change its name, description and cover in
  // the page, and delete it while it is still a draft.
  onSaveCourse?: (moduleId: string, patch: CourseEditPatch) => Promise<KnowledgeAddResult>;
  onDeleteCourse?: (moduleId: string) => Promise<KnowledgeAddResult>;
  // Publish a course to members, or take it back to a draft (hosts).
  onSetCourseStatus?: (moduleId: string, status: "draft" | "live") => Promise<unknown>;
  // Hosts hand Polynet links and files to read.
  onAddSources?: (input: { links: string[]; files: File[] }) => Promise<KnowledgeAddResult>;
  // Hosts write lessons in place.
  lessonEditing: {
    save: (resourceId: string, patch: LessonPatch) => Promise<void>;
    addLesson: (moduleId: string) => Promise<string | null>;
    reorder: (moduleId: string, resourceIds: string[]) => Promise<void>;
    remove: (resourceId: string) => Promise<void>;
    // Puts a lesson at the end of another course.
    move?: (resourceId: string, moduleId: string) => Promise<void>;
  } | null;
  // Told when the open lesson has unsaved changes, so the page's own way
  // back can ask before dropping them.
  onLessonDirtyChange?: (dirty: boolean) => void;
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const [doneAt, setDoneAt] = useState<Map<string, string>>(() => new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [summary, setSummary] = useState<CourseProgressSummary[]>([]);
  const [notes, setNotes] = useState<CommunityNoteView[]>([]);
  // Live: it changes when a builder's notes do.
  const { map: brain, settled: brainSettled } = useBrainMap(props.session, props.communityId, null);
  const [canWriteNotes, setCanWriteNotes] = useState(false);
  // The notes read has answered (so it is known whether this person writes notes).
  const [notesAnswered, setNotesAnswered] = useState(false);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [shelfPage, setShelfPage] = useState(0);
  // title: what a new note starts with (a question waiting on an answer).
  const [note, setNote] = useState<{ slug: string | null; mode: "read" | "edit" | "new"; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  // The host's lesson page is always editable; these are its unsaved changes.
  const lessonDirtyRef = useRef(false);
  const { onLessonDirtyChange } = props;
  const noteLessonDirty = useCallback((dirty: boolean) => { lessonDirtyRef.current = dirty; onLessonDirtyChange?.(dirty); }, [onLessonDirtyChange]);
  const [movingCourse, setMovingCourse] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  useEffect(() => { setCourseError(null); }, [props.openCourseId]);
  const editingTools = props.canManage ? props.lessonEditing : null;
  // Questions members asked in channels that nobody answered (the owner's
  // brief already finds them): where Knowledge is thin.
  const [waiting, setWaiting] = useState<Array<{ author: string; channel: string; text: string; hoursAgo: number }>>([]);
  // "New course": a name, then the draft opens for its lessons.
  // A new course is made at once, as a draft, and opens with the cursor in
  // its name (Nov 17: no form to fill in first).
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourseError, setNewCourseError] = useState<string | null>(null);
  const renameNextCourseRef = useRef(false);
  const newCourse = async () => {
    if (creatingCourse || !props.onCreateCourse) return;
    setCreatingCourse(true);
    setNewCourseError(null);
    renameNextCourseRef.current = true;
    try {
      const result = await props.onCreateCourse("Untitled course", []);
      if (!result.ok) { renameNextCourseRef.current = false; setNewCourseError(result.message); }
    } catch { renameNextCourseRef.current = false; setNewCourseError("The course couldn't be made. Try again."); } finally { setCreatingCourse(false); }
  };
  useEffect(() => {
    if (!props.canManage) { setWaiting([]); return; }
    let cancelled = false;
    getCloudCommunityHomeSnapshot({ session: props.session, communityId: props.communityId })
      .then((snapshot) => { if (!cancelled) setWaiting(snapshot?.unanswered ?? []); })
      // Only the owner may read the brief's facts; others go without this part.
      .catch(() => { if (!cancelled) setWaiting([]); });
    return () => { cancelled = true; };
  }, [props.session, props.communityId, props.canManage]);
  const [publishing, setPublishing] = useState(false);
  const setCourseStatus = async (moduleId: string, status: "draft" | "live") => {
    if (!props.onSetCourseStatus || publishing) return;
    setPublishing(true);
    try { await props.onSetCourseStatus(moduleId, status); } finally { setPublishing(false); }
  };
  // Asking Knowledge is the guide's; a community without it doesn't offer it.
  const agentOn = useCommunityAgentOn();
  const { brief, settled: briefSettled } = usePlaceBriefRead(props.session, props.communityId, null, agentOn);
  // Layout before data: the right column draws as one piece once its parts
  // have answered, so no part is drawn and then pushed down by one above it.
  const shelfSettled = usePanelSettled(briefSettled && brainSettled && progressLoaded);

  const [now] = useState(Date.now);

  const loadProgress = useCallback(async () => {
    try {
      const rows = await fetchMyLessonProgress({ session: props.session, communityId: props.communityId });
      setDoneAt(new Map(rows.map((row) => [row.resource_id, row.completed_at])));
    } catch { /* The page works without progress; marking a lesson retries. */ }
    setProgressLoaded(true);
  }, [props.session, props.communityId]);
  const loadNotes = useCallback(async () => {
    try {
      const view = await fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 50 });
      setNotes(view.notes);
      setCanWriteNotes(view.can_manage && props.canManage);
    } catch { /* The right column goes without notes. */ } finally { setNotesAnswered(true); }
  }, [props.session, props.communityId, props.canManage]);
  useEffect(() => { void loadProgress(); void loadNotes(); }, [loadProgress, loadNotes]);
  // Live (shared/liveQuery.ts): a note a builder adds or changes elsewhere
  // shows without a reload.
  const notesSubject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  useLiveAnswer<{ can_manage: boolean; notes: CommunityNoteView[] }>(props.session, "communityNotes:listCommunityNotes",
    notesSubject ? { authSubject: notesSubject, communityId: props.communityId, limit: 50 } : null,
    (view) => { setNotes(view.notes); setCanWriteNotes(view.can_manage && props.canManage); setNotesAnswered(true); });
  // Started and finished depend on which lessons exist, so they're read again
  // when a host adds or deletes one.
  const lessonSetKey = props.resources.map((resource) => resource.id).join(",");
  useEffect(() => {
    if (!props.canManage) { setSummary([]); return; }
    let cancelled = false;
    fetchCourseProgressSummary({ session: props.session, communityId: props.communityId })
      .then((rows) => { if (!cancelled) setSummary(rows); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [props.session, props.communityId, props.canManage, lessonSetKey]);

  // Members see live courses; hosts see drafts too, marked.
  const courses = useMemo(() => props.modules
    .filter((module) => !module.is_virtual && (props.canManage || module.module_status === "live"))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((course) => ({ course, lessons: courseLessons(props.resources, course.id) })), [props.modules, props.resources, props.canManage]);
  const done = useMemo(() => new Set(doneAt.keys()), [doneAt]);
  const open = courses.find((entry) => entry.course.id === props.openCourseId) ?? null;
  // The new course has opened with its name ready to type over: once only.
  useEffect(() => { if (open) renameNextCourseRef.current = false; }, [open?.course.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaryBy = useMemo(() => new Map(summary.map((row) => [row.module_id, row])), [summary]);

  // Opening a course lands on its next lesson (or the first). Progress may
  // arrive after the course does: a lesson picked for the reader is picked
  // again then, but one the reader chose stays.
  const autoLessonRef = useRef<string | null>(null);
  const wantedLessonRef = useRef<string | null>(null);
  // The lesson you're on is part of the address (/resources/<course>/<lesson>):
  // a refresh, the back button and a link open it.
  const routeLesson = useRouteDetail("lesson");
  useEffect(() => {
    if (!open) { setLessonId(null); autoLessonRef.current = null; return; }
    // A lesson just added is where the host is going: it is opened as soon as
    // it arrives in the list, and nothing else is chosen meanwhile.
    const wanted = wantedLessonRef.current;
    if (wanted) {
      if (!open.lessons.some((lesson) => lesson.id === wanted)) return;
      wantedLessonRef.current = null;
      autoLessonRef.current = null;
      if (lessonId !== wanted) setLessonId(wanted);
      return;
    }
    // The course can arrive before its lessons: wait for them before choosing.
    if (routeLesson && !props.loaded) return;
    // A lesson in the address that this page chose itself is not a request:
    // when your progress arrives, the next unfinished lesson is chosen again.
    if (routeLesson && routeLesson !== autoLessonRef.current && open.lessons.some((lesson) => lesson.id === routeLesson)) {
      if (lessonId !== routeLesson) { autoLessonRef.current = null; setLessonId(routeLesson); }
      return;
    }
    if (lessonId && lessonId !== autoLessonRef.current && open.lessons.some((lesson) => lesson.id === lessonId)) return;
    const next = courseProgress(open.lessons, done).nextLessonId ?? open.lessons[0]?.id ?? null;
    autoLessonRef.current = next;
    setLessonId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.course.id, open?.lessons.length, progressLoaded, props.loaded, routeLesson]);

  // A lesson you choose is never "picked for you", so the back button can
  // return to the one that was.
  const chooseLesson = (id: string | null) => { autoLessonRef.current = null; setLessonId(id); };
  // Picking another lesson with unsaved changes asks first.
  const pickLesson = async (id: string) => {
    if (id === lessonId) return;
    if (lessonDirtyRef.current && !(await askInApp({ message: "Leave this lesson without saving your changes?", yes: "Discard changes", no: "Keep editing", danger: true }))) return;
    setEditingLessonId(null);
    chooseLesson(id);
  };

  // The lesson you chose goes in the address as a step you can go back from;
  // one picked for you only fills it in.
  useEffect(() => {
    if (!open || !props.loaded || !lessonId || lessonId === routeLesson) return;
    writeRouteDetail("lesson", lessonId, { replace: !routeLesson || lessonId === autoLessonRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, open?.course.id, props.loaded]);

  const mark = async (resourceId: string, value: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await setMyLessonDone({ session: props.session, communityId: props.communityId, resourceId, done: value });
      setDoneAt((current) => {
        const next = new Map(current);
        if (value) next.set(resourceId, new Date().toISOString()); else next.delete(resourceId);
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  const openNote = note?.slug ? notes.find((entry) => entry.slug === note.slug) ?? null : null;
  const openNoteSlug = openNote?.slug ?? null;
  const loadOpenNoteSources = useCallback(
    () => fetchNoteSources({ session: props.session, communityId: props.communityId, slug: openNoteSlug ?? "" }),
    [props.session, props.communityId, openNoteSlug],
  );
  // Files and links the guide was given to read (builders only).
  const guideSources = props.canManage ? props.resources.filter((resource) => resource.resource_role === "source") : [];
  const sourceFailed = (source: CommunityResource) => (source as { source_ingestion_status?: string }).source_ingestion_status === "failed";
  const inGuideMemory = Boolean(props.guideMemoryOpen && canWriteNotes && !open);
  // ---------- the right column
  const noteRail = note ? (
    <>
      <button type="button" className={cx("kback")} onClick={() => setNote(null)}><Icon name="back" />Back</button>
      {note.mode === "new" && canWriteNotes ? (
        <NoteForm key={`new:${note.title ?? ""}`} isNew title={note.title ?? ""} text="" submitLabel="Save note" onCancel={() => setNote(null)}
          onSubmit={async (title, text) => {
            const created = await createCommunityNote({ session: props.session, communityId: props.communityId, title, text });
            await loadNotes();
            setNote({ slug: created.slug, mode: "read" });
          }} />
      ) : openNote && note.mode === "edit" && canWriteNotes ? (
        <NoteForm key={openNote.slug} title={openNote.title} text={openNote.body_md} submitLabel="Save changes" onCancel={() => setNote({ slug: openNote.slug, mode: "read" })}
          onSubmit={async (title, text) => {
            const slug = openNote.slug;
            await updateCommunityNote({ session: props.session, communityId: props.communityId, slug, title, text });
            await loadNotes();
            setNote({ slug, mode: "read" });
          }} />
      ) : openNote ? (
        <OpenNote note={openNote} now={now} canManage={canWriteNotes} related={[]} onOpen={() => undefined}
          onEdit={() => setNote({ slug: openNote.slug, mode: "edit" })}
          onDelete={async () => {
            await deleteCommunityNote({ session: props.session, communityId: props.communityId, slug: openNote.slug });
            setNote(null);
            await loadNotes();
          }}
          loadSources={loadOpenNoteSources}
          onUndo={async () => {
            const undone = await undoLearnedNote({ session: props.session, communityId: props.communityId, slug: openNote.slug });
            if (undone === "removed") setNote(null);
            await loadNotes();
          }} />
      ) : null}
    </>
  ) : null;

  // The shelf's right column (mock: "Right panels, second pass"): the
  // guide's brief; the next thing (a member's next lesson; for a builder, a
  // question nobody answered, to teach); what the community knows; what it
  // learned lately; and, for a builder, who is learning what.
  const liveCourses = courses.filter((entry) => entry.course.module_status === "live");
  const lessonCount = courses.reduce((sum, entry) => sum + entry.lessons.length, 0);
  const shelfParts: ReactNode[] = [
    brief ? <BriefPart key="brief" brief={brief} now={now} /> : null,
    // A member's next lesson is the open step on the page itself, so the
    // panel does not say it a second time.
    canWriteNotes && waiting.length ? (
      <PanelPart key="next" label="Waiting on an answer" fact={String(waiting.length)}>
        {waiting.slice(0, 2).map((question, index) => (
          <PanelLine key={`${question.author}:${index}`}
            action={<PanelAction onClick={() => setNote({ slug: null, mode: "new", title: question.text.replace(/\s+/g, " ").trim().slice(0, 120) })}>Teach</PanelAction>}>
            <span title={`${question.author} in #${question.channel}`}>“{question.text}”</span>
          </PanelLine>
        ))}
      </PanelPart>
    ) : null,
    // Nothing learned and no unread files: no part, so an empty panel closes.
    brain && (brain.counts.learned || guideSources.some(sourceFailed)) ? (
      <PanelBrain key="brain" map={brain} now={now} onOpen={props.onOpenBrain}>
        {guideSources.some(sourceFailed) ? <PanelLine fact={String(guideSources.filter(sourceFailed).length)}>Files it couldn't read</PanelLine> : null}
      </PanelBrain>
    ) : null,
    props.canManage && liveCourses.length ? (
      <PanelPart key="learning" label="Learning">
        {liveCourses.slice(0, 5).map(({ course }) => {
          const row = summaryBy.get(course.id);
          return <PanelLine key={course.id} fact={row ? `${row.started} started · ${row.finished} finished` : null}>{course.name}</PanelLine>;
        })}
      </PanelPart>
    ) : null,
  ].filter(Boolean);
  const shelfRail = shelfSettled && shelfParts.length ? <>{shelfParts}</> : null;

  // Courses are put in order by dragging a card by its grip.
  const courseDrag = useDragOrder(courses.map((entry) => entry.course.id), (ids) => {
    if (!props.onReorderCourses || movingCourse) return;
    setMovingCourse(true);
    void Promise.resolve(props.onReorderCourses(ids)).finally(() => setMovingCourse(false));
  }, "x");
  const moveCourse = async (index: number, by: -1 | 1) => {
    const ids = courseOrderAfterMove(courses.map((entry) => entry.course.id), index, by);
    if (!ids || !props.onReorderCourses || movingCourse) return;
    setMovingCourse(true);
    try { await props.onReorderCourses(ids); } finally { setMovingCourse(false); }
  };

  const deleteCourse = async () => {
    if (!open || !props.onDeleteCourse || deletingCourse) return;
    const count = open.lessons.length;
    const yes = await askInApp({
      message: `Delete "${open.course.name}"${count ? ` and its ${count} ${count === 1 ? "lesson" : "lessons"}` : ""}? This can't be undone.`,
      yes: "Delete course", no: "Keep", danger: true,
    });
    if (!yes) return;
    setDeletingCourse(true);
    setCourseError(null);
    try {
      const result = await props.onDeleteCourse(open.course.id);
      if (result.ok) props.onOpenCourse(null); else setCourseError(result.message);
    } finally {
      setDeletingCourse(false);
    }
  };

  // A host's tools for the open course: in the page's header (above the
  // lesson where there is no header). What is rarely used sits in one menu.
  const headerToolbar = usePageHeaderToolbar();
  const closeMenu = (event: { currentTarget: HTMLElement }) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; };
  const isDraft = open?.course.module_status === "draft";
  const courseTools = open && props.canManage ? (
    <>
      {/* One switch publishes the course or takes it back to a draft. */}
      {props.onSetCourseStatus ? (
        <button type="button" role="switch" aria-checked={!isDraft} aria-label="Published" className={cx("kswitch", isDraft ? "" : "on")}
          disabled={publishing || (isDraft && open.lessons.length === 0)}
          title={isDraft ? (open.lessons.length === 0 ? "Write a lesson first" : "Publish: members will see this course") : "Unpublish: back to a draft only hosts see"}
          onClick={() => void setCourseStatus(open.course.id, isDraft ? "live" : "draft")}>
          <i aria-hidden="true" />{isDraft ? "Draft" : "Published"}<small>{isDraft ? "Only hosts see it" : "Members can see it"}</small>
        </button>
      ) : <span className={cx("tag", isDraft ? "" : "live")}>{isDraft ? "Draft · only hosts see it" : "Published"}</span>}
      {/* Only a draft can be deleted: taking a live course away from members is Unpublish, on purpose, first. */}
      {props.onDeleteCourse && isDraft ? (
        <details className={cx("kmore")}>
          <summary className={cx("btn sm")} aria-label="More course actions"><Icon name="more" /></summary>
          <div className={cx("kmore-menu")} role="menu">
            <button type="button" role="menuitem" className={cx("no")} disabled={deletingCourse} onClick={(event) => { closeMenu(event); void deleteCourse(); }}>{deletingCourse ? "Deleting" : "Delete course"}</button>
          </div>
        </details>
      ) : null}
    </>
  ) : null;
  const openProgress = open ? courseProgress(open.lessons, done) : null;
  // Lessons are put in order by dragging one by its grip (Move up and Move
  // down stay in each row's menu, for the keyboard).
  const lessonDrag = useDragOrder(open?.lessons.map((lesson) => lesson.id) ?? [], (ids) => { if (open && editingTools) void editingTools.reorder(open.course.id, ids); }, "y");
  // A lesson leaves this course (moved, or deleted after one question); the
  // page lands on its neighbour.
  const afterLessonLeft = (id: string) => {
    if (!open || id !== lessonId) return;
    const at = open.lessons.findIndex((entry) => entry.id === id);
    chooseLesson(open.lessons[at + 1]?.id ?? open.lessons[at - 1]?.id ?? null);
  };
  const moveLesson = async (id: string, courseId: string) => {
    if (!editingTools?.move) return;
    if (id === lessonId && lessonDirtyRef.current && !(await askInApp({ message: "Move this lesson without saving your changes?", yes: "Discard and move", no: "Keep editing", danger: true }))) return;
    try { await editingTools.move(id, courseId); afterLessonLeft(id); } catch { setCourseError("The lesson couldn't be moved. Try again."); }
  };
  const removeLesson = async (id: string, title: string) => {
    if (!editingTools) return;
    if (!(await askInApp({ message: `Delete "${title}"? This can't be undone.`, yes: "Delete lesson", no: "Keep", danger: true }))) return;
    try { await editingTools.remove(id); afterLessonLeft(id); } catch { setCourseError("The lesson couldn't be deleted. Try again."); }
  };
  // The course's lessons: pick one, and for a host put them in order.
  const lessonList = open ? (
    <div className={cx("klrows")}>
      {open.lessons.map((lesson, index) => (
        <div key={lesson.id} className={cx("kl-row", editingTools && "host", lessonDrag.dragging === lesson.id && "dragging", lessonDrag.before === lesson.id && "dropbefore",
          lessonDrag.before === null && index === open.lessons.length - 1 && "dropafter")} {...(editingTools ? lessonDrag.item(lesson.id) : null)}>
          {editingTools ? <span className={cx("kgrip")} title="Drag to reorder" aria-hidden="true" {...lessonDrag.grip(lesson.id)}><GripDots /></span> : null}
          <button type="button" className={cx("kl", lesson.id === lessonId && "on", done.has(lesson.id) && "d")} aria-current={lesson.id === lessonId ? "true" : undefined}
            onClick={() => void pickLesson(lesson.id)}>
            <span className={cx("kdot", done.has(lesson.id) ? "done" : lesson.id === lessonId ? "now" : "")}>{done.has(lesson.id) ? <Icon name="check" /> : null}</span>
            <span className={cx("kl-t")}>{lesson.title}</span>
          </button>
          {editingTools ? (
            <details className={cx("kl-menu")}>
              <summary aria-label={`More for ${lesson.title}`}><Icon name="more" /></summary>
              <div role="menu">
                <button type="button" role="menuitem" disabled={index === 0}
                  onClick={(event) => { closeMenu(event); const ids = open.lessons.map((entry) => entry.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void editingTools.reorder(open.course.id, ids); }}>Move up</button>
                <button type="button" role="menuitem" disabled={index === open.lessons.length - 1}
                  onClick={(event) => { closeMenu(event); const ids = open.lessons.map((entry) => entry.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; void editingTools.reorder(open.course.id, ids); }}>Move down</button>
                {editingTools.move ? courses.filter((entry) => entry.course.id !== open.course.id).map((entry) => (
                  <button key={entry.course.id} type="button" role="menuitem" onClick={(event) => { closeMenu(event); void moveLesson(lesson.id, entry.course.id); }}>Move to {entry.course.name}</button>
                )) : null}
                <button type="button" role="menuitem" className={cx("no")} onClick={(event) => { closeMenu(event); void removeLesson(lesson.id, lesson.title); }}>Delete lesson</button>
              </div>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  ) : null;
  // Under the list: a host adds a lesson; a member asks the guide about this one.
  const lessonListFoot = open ? (editingTools ? (
    <button type="button" className={cx("klist-foot")} onClick={async () => {
      const id = await editingTools.addLesson(open.course.id);
      if (id) { wantedLessonRef.current = id; setEditingLessonId(id); chooseLesson(id); }
    }}><Icon name="plus" />Add a lesson</button>
  ) : agentOn ? (
    <button type="button" className={cx("klist-foot", "guide")} onClick={() => openGuideFromSearch()}><Icon name="spark" />Ask about this lesson</button>
  ) : null) : null;
  const courseProgressWords = open && openProgress ? (props.canManage
    ? `${summaryBy.get(open.course.id)?.started ?? 0} started · ${summaryBy.get(open.course.id)?.finished ?? 0} finished`
    : `${openProgress.done} of ${openProgress.total} done`) : "";
  const openCoverStyle = open?.course.banner_url ? { backgroundImage: `url(${JSON.stringify(open.course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(open.course.banner_focus_x ?? 0.5) * 100}% ${(open.course.banner_focus_y ?? 0.5) * 100}%` } : undefined;
  // The floating lesson panel: the course, how far along, its lessons.
  // The top of the lesson panel: the course's cover, name and where things
  // stand. A host changes them here, in place.
  const lessonPanelTop = open && openProgress ? (
      <div className={cx("klist-top")}>
        {props.canManage && props.onSaveCourse ? (
          <KitCourseInline key={open.course.id} course={open.course} stats={courseProgressWords} startRenaming={renameNextCourseRef.current}
            coverClassName={cx("kcover", "klist-cover", open.course.banner_url ? "" : coverTint(open.course.id))} coverStyle={openCoverStyle}
            onSave={(patch) => props.onSaveCourse!(open.course.id, patch)} />
        ) : (
          <>
            <span className={cx("kcover", "klist-cover", open.course.banner_url ? "" : coverTint(open.course.id))} style={openCoverStyle}>
              {open.course.banner_url ? null : <Icon name="book" />}
            </span>
            <span><b>{open.course.name}</b><em>{courseProgressWords}</em></span>
          </>
        )}
      </div>
  ) : null;
  const lessonPanel = open && openProgress ? (
    <>
      {lessonPanelTop}
      {props.canManage ? null : <div className={cx("bar", "kbar")}><i style={{ width: `${openProgress.percent}%` }} /></div>}
      {lessonList}
      {lessonListFoot}
    </>
  ) : null;

  // The right column is a note you picked or, on the shelf, the fast read of
  // Knowledge: the brief, what's next, what the community knows and what it
  // learned lately. A course has no right column: its lessons sit beside the
  // lesson, on its left.
  const railBody = noteRail ?? (open || inGuideMemory ? null : shelfRail);
  const rail = railBody ? (
    <KitApp view="know" host={props.canManage} part="rail" className="kit-page-rail">
      <Rail index={2} label="Knowledge">{railBody}</Rail>
    </KitApp>
  ) : null;

  // ---------- the page
  // Below 1024px there is no right column (design-v1.css), so a picked note
  // takes the page's place. A course's lessons sit beside the lesson where
  // there is room for both (1200px), and under it where there is not.
  const wide = useMinWidth(1024);
  const roomForList = useMinWidth(1200);
  let page: ReactNode;
  if (!wide && noteRail) {
    page = <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}><div className={cx("evlayer")} style={{ marginTop: 0 }}>{noteRail}</div></div>;
  } else if (inGuideMemory) {
    // Builders only: everything the guide answers from. Members never get
    // this list (the server doesn't send it to them either).
    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <p className={cx("sub")} style={{ margin: 0 }}>Your guide answers from this. Members never see the list.</p>
        <KitKnowledgeAddButtons onNewNote={canWriteNotes ? () => setNote({ slug: null, mode: "new" }) : undefined}
          onAddSources={props.canManage ? props.onAddSources : undefined} />
        <KitKnowledgeList notes={notes} now={now} sources={guideSources} onOpenNote={(slug) => setNote({ slug, mode: "read" })}
          onRetrySources={props.onRetrySources} onRemoveSource={props.onRemoveSource} />
        {notes.length === 0 && guideSources.length === 0 ? <p className={cx("sub")} style={{ marginTop: 20 }}>Nothing yet. Add a note, a link or a file, and what gets answered in channels is saved here on its own.</p> : null}
      </div>
    );
  } else if (open) {
    const index = open.lessons.findIndex((entry) => entry.id === lessonId);
    const lesson = index >= 0 ? open.lessons[index] : null;
    const next = index >= 0 ? open.lessons[index + 1] ?? null : null;
    const previous = index > 0 ? open.lessons[index - 1] : null;
    // A list of one lesson is noise; a host still needs it, to add the second.
    const listWorthShowing = open.lessons.length > 1 || (Boolean(editingTools) && open.lessons.length > 0);
    const listBeside = roomForList && listWorthShowing;

    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        {/* On a phone the top bar's arrow leaves the community page, so the course keeps its own way back here; on desktop it is the header's arrow. */}
        <div className={`knowledge-course-crumb ${cx("kcrumb")}`} style={{ marginTop: 0 }}>
          <button type="button" className={cx("kback")} onClick={() => props.onOpenCourse(null)} aria-label="Back to Knowledge"><Icon name="back" />Knowledge</button>
          <span>›</span><span>{open.course.name}</span>
        </div>
        {courseTools && headerToolbar ? createPortal(<KitApp view="know" host part="flow" className="kit-header-tools"><div className={cx("ktools", "head")}>{courseTools}</div></KitApp>, headerToolbar) : null}
        {courseTools && !headerToolbar ? <div className={`knowledge-course-tools-inline ${cx("ktools")}`}>{courseTools}</div> : null}
        {courseError ? <p className={cx("sub")} role="alert" style={{ color: "var(--bad)", maxWidth: 1216, margin: "12px auto 0" }}>{courseError}</p> : null}
        <div className={`knowledge-course-cols ${cx("kcols", listBeside && "two")}`}>
        {listBeside ? <aside className={cx("klist")} aria-label="Lessons">{lessonPanel}</aside> : null}
        <div className={cx("kmainc")}>
        {/* Where the panel is not beside the lesson (a narrow window, a phone, a
            course with no lessons yet), a host still changes the course here. */}
        {props.canManage && !listBeside && lessonPanelTop ? <div className={cx("klist", "solo")}>{lessonPanelTop}</div> : null}
        {/* No room beside the lesson (a phone, a narrow window): the same panel folds above it. */}
        {!listBeside && listWorthShowing ? (
          <details className={cx("kfold")}>
            <summary>Lessons<em>{courseProgressWords}</em></summary>
            {lessonList}
            {lessonListFoot}
          </details>
        ) : null}
        {lesson && editingTools ? (
          // For a host the lesson page is the editor: no edit mode.
          <KitLessonEditor key={lesson.id} resource={lesson} focusTitle={editingLessonId === lesson.id}
            onDirtyChange={noteLessonDirty}
            onSave={async (patch) => { await editingTools.save(lesson.id, patch); setEditingLessonId(null); }} />
        ) : lesson ? (
          <div className={`kit-lesson ${cx("klesson")}`}>
            {/* Drawn after the video (design-v1.css orders the lesson's parts). "Lesson 1 of 1" says nothing. */}
            <div className={`kit-lesson-facts ${cx("lab")}`}>{open.lessons.length > 1 ? `Lesson ${index + 1} of ${open.lessons.length}` : ""}{open.course.module_status === "draft" ? `${open.lessons.length > 1 ? " · " : ""}Draft course` : ""}</div>
            <div className="kit-lesson-body"><WebCommunityResourceViewerContent resource={lesson} /></div>
            {lesson.lesson_links?.length ? (
              <div className={`kit-lesson-after ${cx("kres")}`}>
                <span className={cx("lab")}>Resources for this lesson</span>
                {lesson.lesson_links.map((link) => (
                  <a key={link.url} className={cx("kresrow", "klink")} href={link.url} target="_blank" rel="noreferrer noopener">
                    <Icon name="link" /><span><b>{link.title}</b><em>{lessonLinkPlace(link)}</em></span><Icon name="arrow" />
                  </a>
                ))}
              </div>
            ) : null}
            {/* One way forward, with what it leads to. Back to the shelf is the header's arrow. */}
            {/* A host on the last (or only) lesson has nothing to do here: no bar. */}
            {props.canManage && !next && !previous ? null : (
            <div className={`kit-lesson-after ${cx("kfinish", open.lessons.length > 1 ? "" : "bare")}`}>
              {open.lessons.length > 1 ? (
                <div className={cx("kfinish-next")}>
                  <span>{next ? "Up next" : "Last lesson in this course"}</span>
                  <b>{next ? next.title : `You're at the end of ${open.course.name}`}</b>
                </div>
              ) : <span className={cx("kfinish-next")} />}
              {previous ? <button type="button" className={cx("btn", "txt")} onClick={() => chooseLesson(previous.id)}><Icon name="back" />Previous</button> : null}
              {agentOn && !listBeside && !editingTools ? <button type="button" className={cx("btn", "txt")} onClick={() => openGuideFromSearch()}><Icon name="spark" />Ask about this lesson</button> : null}
              {props.canManage ? (
                next ? <button type="button" className={cx("btn", "lg")} onClick={() => chooseLesson(next.id)}>Next lesson <Icon name="arrow" /></button> : null
              ) : done.has(lesson.id) ? (
                <>
                  <button type="button" className={cx("kisdone")} aria-pressed title="Done. Click to undo." disabled={saving} onClick={() => void mark(lesson.id, false)}><Icon name="check" />Done</button>
                  {next ? <button type="button" className={cx("btn go", "lg")} onClick={() => chooseLesson(next.id)}>Next lesson <Icon name="arrow" /></button> : null}
                </>
              ) : (
                <button type="button" className={cx("btn go", "lg")} disabled={saving} onClick={async () => { await mark(lesson.id, true); if (next) chooseLesson(next.id); }}>
                  <Icon name="check" />{next ? "Mark done and continue" : "Mark done"}
                </button>
              )}
            </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            <p className={cx("lead")} style={{ marginTop: 0 }}>{agentOn ? <span className={cx("aura")}><Icon name="spark" /></span> : null}{props.canManage ? "This course has no lessons yet." : "This course is being written."}</p>
            {editingTools ? (
              <button type="button" className={cx("btn go")} style={{ marginTop: 18 }} onClick={async () => {
                const id = await editingTools.addLesson(open.course.id);
                if (id) { wantedLessonRef.current = id; setEditingLessonId(id); chooseLesson(id); }
              }}><Icon name="plus" />Write the first lesson</button>
            ) : null}
          </div>
        )}
        </div>
        </div>
      </div>
    );
  } else {
    // Adding a course is a button beside "Courses", so hosts' pages hold six too.
    const shelf = pageOf(courses, shelfPage, SHELF);
    const learning = summary.reduce((total, row) => total + row.started, 0);
    // A member is shown where they are first (the first unfinished course,
    // in the host's order), then every course. Nothing is locked.
    const path = props.canManage ? [] : coursePath(courses, done);
    const here = path.find((step) => step.state === "now") ?? path.find((step) => step.total > 0) ?? null;
    const hereAt = here ? path.indexOf(here) : -1;
    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        {props.canManage || !courses.length ? (
          <p className={cx("lead")} style={{ marginTop: 0 }}>{agentOn ? <span className={cx("aura")}><Icon name="spark" /></span> : null}
            {!props.loaded ? " " : props.canManage ? hostLead(courses.map((entry) => entry.course), learning) : "Nothing to learn here yet."}
          </p>
        ) : null}
        {/* One bar, for everyone: it asks the guide. Nothing is added through it. */}
        {agentOn ? (
          <button type="button" className={cx("ask kask kask-btn")} onClick={() => openGuideFromSearch()}>
            <Icon name="spark" extra="sp" /><span>Ask anything {props.communityName} knows</span>
          </button>
        ) : null}

        {/* Builders: the way into what the guide answers from, where notes,
            links and files are added. Shown at every width. */}
        {/* A builder's row holds its place from the first draw (the count
            fills in), so the courses under it don't move when notes arrive. */}
        {props.onOpenGuideMemory && (canWriteNotes || (props.canManage && !notesAnswered)) ? (
          <div className={cx("kbtns")}><div className={cx("kbtns-row")}>
            <button type="button" className={cx("btn sm")} disabled={!canWriteNotes} onClick={() => props.onOpenGuideMemory?.(true)}>What your guide knows{canWriteNotes ? ` · ${notes.length + guideSources.length}` : ""}</button>
          </div></div>
        ) : null}

        {here ? (
          <button type="button" className={cx("khero")} onClick={() => { props.onOpenCourse(here.course.id); if (here.state === "now" && here.nextLesson) chooseLesson(here.nextLesson.id); }}>
            <span className={cx("kcover", "khero-cover", here.course.banner_url ? "" : coverTint(here.course.id))} style={here.course.banner_url ? { backgroundImage: `url(${JSON.stringify(here.course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(here.course.banner_focus_x ?? 0.5) * 100}% ${(here.course.banner_focus_y ?? 0.5) * 100}%` } : undefined}>
              {here.course.banner_url ? null : <Icon name="book" />}
            </span>
            <span className={cx("khero-body")}>
              <span className={cx("khero-eye")}>{here.state === "done" ? "Finished" : here.done > 0 ? "Continue" : "Start here"}{courses.length > 1 ? ` · Course ${hereAt + 1} of ${courses.length}` : ""}</span>
              <b>{here.course.name}</b>
              {firstLine(here.course.description_md) ? <span className={cx("s")}>{firstLine(here.course.description_md)}</span> : null}
              {here.state === "now" && here.nextLesson ? (
                <span className={cx("khero-next")}>
                  <i>{here.lessons.indexOf(here.nextLesson) + 1}</i>
                  <span><b>{here.nextLesson.title}</b><em>{here.done > 0 ? "Your next lesson" : "The first lesson"}</em></span>
                </span>
              ) : null}
              <span className={cx("khero-prog")}><span className={cx("bar", "kbar")}><i style={{ width: `${here.total ? Math.round((here.done / here.total) * 100) : 0}%` }} /></span>{here.done} of {here.total} {here.total === 1 ? "lesson" : "lessons"} done</span>
              <span className={cx("acts")}><span className={cx("btn go", "lg")}><Icon name="play" />{here.state === "done" ? "Open" : here.done > 0 ? "Continue" : "Start"}</span></span>
            </span>
          </button>
        ) : null}

        {/* One course: the block above is the whole shelf. */}
        {props.canManage || courses.length > 1 ? (<>
        <div className={cx("khead")}>
          <span className={cx("lab")}>{props.canManage ? "Courses" : "All courses"}</span>
          {props.canManage ? null : <span className={cx("lab")} style={{ marginLeft: 10, fontWeight: 400 }}>In the order your host suggests. Open any of them.</span>}
          {props.canManage && props.onReorderCourses && courses.length > 1 ? <span className={cx("lab")} style={{ marginLeft: 10, fontWeight: 400 }}>Drag a course to change the order members see.</span> : null}
        </div>
        {newCourseError ? <p className={cx("sub")} role="alert" style={{ color: "var(--bad)", marginBottom: 10 }}>{newCourseError}</p> : null}
        <div className={cx("kgrid")}>
          {shelf.items.map(({ course, lessons }, position) => {
            const progress = courseProgress(lessons, done);
            const row = summaryBy.get(course.id);
            const canDrag = props.canManage && Boolean(props.onReorderCourses) && courses.length > 1;
            const at = courses.findIndex((entry) => entry.course.id === course.id);
            return (
              <div key={course.id} className={cx("kcard", courseDrag.dragging === course.id && "dragging", courseDrag.before === course.id && "dropbefore",
                courseDrag.before === null && at === courses.length - 1 && "dropafter")} {...(canDrag ? courseDrag.item(course.id) : null)}>
              {/* Held by its grip and dropped where it should go; the arrow keys move it one place. */}
              {canDrag ? (
                <button type="button" className={cx("kgrip", "card")} aria-label={`Move ${course.name}. Drag, or use the arrow keys.`} title="Drag to reorder" disabled={movingCourse}
                  onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); void moveCourse(at, -1); } else if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); void moveCourse(at, 1); } }}
                  {...courseDrag.grip(course.id)}><GripDots /></button>
              ) : null}
              <button type="button" className={cx("kcourse")} onClick={() => props.onOpenCourse(course.id)}>
                <span className={cx("kcover", course.banner_url ? "" : coverTint(course.id))} style={course.banner_url ? { backgroundImage: `url(${JSON.stringify(course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(course.banner_focus_x ?? 0.5) * 100}% ${(course.banner_focus_y ?? 0.5) * 100}%` } : undefined}>
                  {course.banner_url ? null : <Icon name="book" />}
                </span>
                <b>{props.canManage ? null : <i className={cx("knum")}>{position + 1}</i>}{course.name}{course.module_status === "draft" ? <span className={cx("tag")} style={{ marginLeft: 8 }}>draft</span> : null}</b>
                <span className={cx("s")}>{firstLine(course.description_md) || `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}</span>
                {props.canManage ? (
                  <span className={cx("kpct")}><i style={{ width: row && row.started ? `${Math.round((row.finished / row.started) * 100)}%` : "0%" }} /><em>{row ? `${row.started} started · ${row.finished} finished` : `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}</em></span>
                ) : (
                  <span className={cx("kpct")}><i style={{ width: `${progress.percent}%` }} /><em>{courseProgressWord(progress.percent)}</em></span>
                )}
              </button>
              </div>
            );
          })}
          {/* A new course is a card on the shelf: one click makes a draft and opens it. */}
          {props.onCreateCourse ? <button type="button" className={cx("kcourse knew")} disabled={creatingCourse} onClick={() => void newCourse()}><Icon name="plus" />{creatingCourse ? "Making it…" : "New course"}</button> : null}
        </div>
        {shelf.pages > 1 ? (
          <div className={cx("kpager")}>
            <span>{shelf.from}–{shelf.to} of {courses.length} courses</span>
            <button type="button" className={cx("btn sm")} disabled={shelf.page === 0} onClick={() => setShelfPage(shelf.page - 1)}>Previous</button>
            <button type="button" className={cx("btn sm")} disabled={shelf.page >= shelf.pages - 1} onClick={() => setShelfPage(shelf.page + 1)}>Next</button>
          </div>
        ) : null}
        </>) : null}
      </div>
    );
  }

  return <><KitApp view="know" host={props.canManage} part="flow">{page}</KitApp>{wide && rail ? props.renderRail(rail) : null}</>;
}
