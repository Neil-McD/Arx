// Design system v1: Knowledge as a classroom, in the mock's markup
// (docs/design/hifi-mock, Knowledge). The library: ask, continue where you
// left off, and the courses as cards with progress, in pages. An open course:
// its lesson, Mark done and Next, with the outline in the right column. Under
// the shelf, one list of notes, files and links (KitKnowledgeList); a note
// opens in the right column.
import { courseProgressWord } from "../../../../shared/communityMemberWords";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { continueLesson, courseLessons, courseProgress, pageOf } from "../../../../shared/communityClassroom";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";
import { askGuide, openGuideFromSearch } from "../components/guideSearch";
import { WebCommunityResourceViewerContent } from "../components/WebCommunityResourceViewerContent";
import { PanelBrain, useBrainMap } from "./KitBrain";
import { BriefPart, usePlaceBriefRead } from "./KitBrief";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveChange } from "../../../../shared/liveQuery";
import { NoteForm, OpenNote } from "./KitKnowledgeNotes";
import { PanelAction, PanelLine, PanelNext, PanelPart, usePanelSettled } from "./KitPanel";
import { KitLessonEditor, lessonLinkPlace, type LessonPatch } from "./KitLessonEditor";
import { Btn, cx, Icon, KitApp, Rail, Sec, TextLink, useMinWidth } from "./kit";
import { KitCourseEdit, type CourseEditPatch } from "./KitCourseEdit";
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
  const [editingCourse, setEditingCourse] = useState(false);
  // Arrange: the shelf shows every course with two arrows, until Done.
  const [arranging, setArranging] = useState(false);
  const [movingCourse, setMovingCourse] = useState(false);
  useEffect(() => { if (!props.canManage) setArranging(false); }, [props.canManage]);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  useEffect(() => { setEditingCourse(false); setCourseError(null); }, [props.openCourseId]);
  const editingTools = props.canManage ? props.lessonEditing : null;
  // Questions members asked in channels that nobody answered (the owner's
  // brief already finds them): where Knowledge is thin.
  const [waiting, setWaiting] = useState<Array<{ author: string; channel: string; text: string; hoursAgo: number }>>([]);
  // "New course": a name, then the draft opens for its lessons.
  const [courseName, setCourseName] = useState<string | null>(null);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourseError, setNewCourseError] = useState<string | null>(null);
  const newCourse = () => { setCourseName(""); setNewCourseError(null); };
  const createCourse = async () => {
    const name = (courseName ?? "").trim();
    if (!name || creatingCourse || !props.onCreateCourse) return;
    setCreatingCourse(true);
    setNewCourseError(null);
    try {
      const result = await props.onCreateCourse(name.slice(0, 80), []);
      if (result.ok) setCourseName(null); else setNewCourseError(result.message);
    } catch { setNewCourseError("The course couldn't be made. Try again."); } finally { setCreatingCourse(false); }
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
  useLiveChange(props.session, "communityNotes:listCommunityNotes",
    notesSubject ? { authSubject: notesSubject, communityId: props.communityId, limit: 50 } : null,
    () => { void loadNotes(); });
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
  const resume = useMemo(() => (props.canManage ? null : continueLesson(courses, doneAt)), [courses, doneAt, props.canManage]);
  const summaryBy = useMemo(() => new Map(summary.map((row) => [row.module_id, row])), [summary]);

  // Opening a course lands on its next lesson (or the first). Progress may
  // arrive after the course does: a lesson picked for the reader is picked
  // again then, but one the reader chose stays.
  const autoLessonRef = useRef<string | null>(null);
  // The lesson you're on is part of the address (/resources/<course>/<lesson>):
  // a refresh, the back button and a link open it.
  const routeLesson = useRouteDetail("lesson");
  useEffect(() => {
    if (!open) { setLessonId(null); autoLessonRef.current = null; return; }
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
    resume ? (
      <PanelPart key="next" label="Continue" fact={`lesson ${resume.index + 1} of ${resume.total}`}>
        <PanelNext title={resume.lesson.title} sub={resume.course.name}
          action={<Btn go onClick={() => { props.onOpenCourse(resume.course.id); chooseLesson(resume.lesson.id); }}>Resume</Btn>} />
      </PanelPart>
    ) : canWriteNotes && waiting.length ? (
      <PanelPart key="next" label="Waiting on an answer" fact={String(waiting.length)}>
        {waiting.slice(0, 2).map((question, index) => (
          <PanelLine key={`${question.author}:${index}`}
            action={<PanelAction onClick={() => setNote({ slug: null, mode: "new", title: question.text.replace(/\s+/g, " ").trim().slice(0, 120) })}>Teach</PanelAction>}>
            <span title={`${question.author} in #${question.channel}`}>“{question.text}”</span>
          </PanelLine>
        ))}
      </PanelPart>
    ) : null,
    <PanelBrain key="brain" map={brain} now={now} onOpen={props.onOpenBrain}>
      {guideSources.some(sourceFailed) ? <PanelLine fact={String(guideSources.filter(sourceFailed).length)}>Files it couldn't read</PanelLine> : null}
    </PanelBrain>,
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

  // A host's tools for the open course: in the right column, and in the page
  // on the widths where that column is hidden.
  const courseTools = open && props.canManage ? (
    <>
            {open.course.module_status === "draft" ? <span className={cx("tag")}>Draft · only hosts see it</span> : null}
            {props.onSetCourseStatus ? (open.course.module_status === "draft" ? (
              <button type="button" className={cx("btn sm go")} disabled={publishing || open.lessons.length === 0}
                title={open.lessons.length === 0 ? "Write a lesson first" : "Members will see this course"}
                onClick={() => void setCourseStatus(open.course.id, "live")}>Publish course</button>
            ) : (
              <button type="button" className={cx("btn sm txt")} disabled={publishing} title="Back to a draft only hosts see"
                onClick={() => void setCourseStatus(open.course.id, "draft")}>Unpublish</button>
            )) : null}
            {props.onSaveCourse ? <button type="button" className={cx("btn sm")} aria-pressed={editingCourse} onClick={() => setEditingCourse(true)}>Edit course</button> : null}
            {/* Only a draft can be deleted: taking a live course away from
                members is Unpublish, on purpose, first. */}
            {props.onDeleteCourse ? (open.course.module_status === "draft" ? (
              <button type="button" className={cx("btn sm txt no")} disabled={deletingCourse} onClick={() => void deleteCourse()}>{deletingCourse ? "Deleting" : "Delete course"}</button>
            ) : <span className={cx("sub")} style={{ flexBasis: "100%" }}>To delete this course, unpublish it first.</span>) : null}
            {courseError ? <span className={cx("sub")} role="alert" style={{ flexBasis: "100%", color: "var(--bad)" }}>{courseError}</span> : null}
    </>
  ) : null;
  const openProgress = open ? courseProgress(open.lessons, done) : null;
  // The course's lessons: pick one, and for a host put them in order or add
  // one. In the right column; in the page, under the lesson, where there is
  // no column (below 1024px).
  const lessonList = open ? (
    <div className={cx("sec")}>
      {open.lessons.map((lesson, index) => (
        <div key={lesson.id} className={cx("kl-row")}>
          <button type="button" className={cx("kl", lesson.id === lessonId && "on", done.has(lesson.id) && lesson.id !== lessonId && "d")} onClick={() => { setEditingLessonId(null); chooseLesson(lesson.id); }}>
            {done.has(lesson.id) ? <Icon name="check" /> : <i />}{index + 1}. {lesson.title}
          </button>
          {editingTools ? (
            <span className={cx("kl-move")}>
              <button type="button" aria-label={`Move ${lesson.title} up`} disabled={index === 0}
                onClick={() => { const ids = open.lessons.map((entry) => entry.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void editingTools.reorder(open.course.id, ids); }}>↑</button>
              <button type="button" aria-label={`Move ${lesson.title} down`} disabled={index === open.lessons.length - 1}
                onClick={() => { const ids = open.lessons.map((entry) => entry.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; void editingTools.reorder(open.course.id, ids); }}>↓</button>
            </span>
          ) : null}
        </div>
      ))}
      {editingTools ? (
        <TextLink onClick={async () => {
          const id = await editingTools.addLesson(open.course.id);
          if (id) { chooseLesson(id); setEditingLessonId(id); }
        }}>+ Add lesson</TextLink>
      ) : null}
    </div>
  ) : null;
  const courseRail = open && openProgress ? (
    <>
      <Sec label={open.course.name}>
        {courseTools ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{courseTools}</div> : null}
        {props.canManage ? (
          <div className={cx("kline")}><span>{summaryBy.get(open.course.id)?.started ?? 0} started</span><em>{summaryBy.get(open.course.id)?.finished ?? 0} finished</em></div>
        ) : (
          <>
            <div className={cx("kline")}><span>{openProgress.done} of {openProgress.total} lessons</span><em>{openProgress.percent}%</em></div>
            <div className={cx("bar")}><i style={{ width: `${openProgress.percent}%` }} /></div>
          </>
        )}
      </Sec>
      {lessonList}
      {agentOn ? (
        <div style={{ marginTop: "auto" }}>
          <button type="button" className={cx("ask kask-btn")} style={{ height: 46 }} onClick={() => openGuideFromSearch()}>
            <Icon name="spark" extra="sp" /><span>Ask about this lesson</span>
          </button>
        </div>
      ) : null}
    </>
  ) : null;

  // The right column is what you picked (a note, a course) or, on the shelf,
  // the fast read of Knowledge: the brief, what's next, what the community
  // knows and what it learned lately.
  const railBody = noteRail ?? courseRail ?? (inGuideMemory ? null : shelfRail);
  const rail = railBody ? (
    <KitApp view="know" host={props.canManage} part="rail" className="kit-page-rail">
      <Rail index={2} label="Knowledge">{railBody}</Rail>
    </KitApp>
  ) : null;

  // ---------- the page
  // Below 1024px there is no right column (design-v1.css), so what it holds
  // is drawn in the page instead: a picked note takes the page's place, and a
  // course's lessons sit under the lesson.
  const wide = useMinWidth(1024);
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
    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        {/* On a phone the top bar's arrow leaves the community page, so the course keeps its own way back here; on desktop it is the header's arrow. */}
        <div className={`knowledge-course-crumb ${cx("kcrumb")}`} style={{ marginTop: 0 }}>
          <button type="button" className={cx("kback")} onClick={() => props.onOpenCourse(null)} aria-label="Back to Knowledge"><Icon name="back" />Knowledge</button>
          <span>›</span><span>{open.course.name}</span>
        </div>
        {courseTools ? <div className="knowledge-course-tools-inline">{courseTools}</div> : null}
        {editingCourse && props.onSaveCourse && props.canManage ? (
          <KitCourseEdit key={open.course.id} course={open.course} onClose={() => setEditingCourse(false)}
            onSave={(patch) => props.onSaveCourse!(open.course.id, patch)} />
        ) : null}
        {lesson && editingTools && editingLessonId === lesson.id ? (
          <KitLessonEditor key={lesson.id} resource={lesson} index={index} total={open.lessons.length} courseLive={open.course.module_status !== "draft"}
            onCancel={() => setEditingLessonId(null)}
            onSave={async (patch) => { await editingTools.save(lesson.id, patch); setEditingLessonId(null); }}
            moveTargets={editingTools.move ? courses.filter((entry) => entry.course.id !== open.course.id).map((entry) => ({ id: entry.course.id, name: entry.course.name })) : []}
            onMove={editingTools.move ? async (courseId) => {
              await editingTools.move!(lesson.id, courseId);
              setEditingLessonId(null);
              chooseLesson(open.lessons[index + 1]?.id ?? open.lessons[index - 1]?.id ?? null);
            } : undefined}
            onDelete={async () => {
              await editingTools.remove(lesson.id);
              setEditingLessonId(null);
              chooseLesson(open.lessons[index + 1]?.id ?? open.lessons[index - 1]?.id ?? null);
            }} />
        ) : lesson ? (
          <div className={cx("klesson")}>
            <div className={cx("ktitle")}>
              <span className={cx("lab")} style={{ flex: 1 }}>Lesson {index + 1} of {open.lessons.length}{open.course.module_status === "draft" ? " · draft course" : ""}</span>
              {editingTools ? <button type="button" className={cx("btn sm")} onClick={() => setEditingLessonId(lesson.id)}>Edit lesson</button> : null}
              {!props.canManage ? (
                <button type="button" className={cx("kdone", done.has(lesson.id) && "is")} aria-pressed={done.has(lesson.id)} title={done.has(lesson.id) ? "Done. Click to undo." : "Mark done"}
                  disabled={saving} onClick={() => void mark(lesson.id, !done.has(lesson.id))}><Icon name="check" /></button>
              ) : null}
            </div>
            <div className="kit-lesson-body"><WebCommunityResourceViewerContent resource={lesson} /></div>
            {lesson.lesson_links?.length ? (
              <div className={cx("kres")}>
                <span className={cx("lab")}>Resources for this lesson</span>
                {lesson.lesson_links.map((link) => (
                  <a key={link.url} className={cx("kresrow", "klink")} href={link.url} target="_blank" rel="noreferrer noopener">
                    <Icon name="link" /><span><b>{link.title}</b><em>{lessonLinkPlace(link)}</em></span><Icon name="arrow" />
                  </a>
                ))}
              </div>
            ) : null}
            <div className={cx("acts")} style={{ marginTop: 22 }}>
              {!props.canManage && !done.has(lesson.id) ? (
                <button type="button" className={cx("btn go")} disabled={saving} onClick={async () => { await mark(lesson.id, true); if (next) chooseLesson(next.id); }}>
                  <Icon name="check" />{next ? "Mark done and continue" : "Mark done"}
                </button>
              ) : null}
              {next ? <button type="button" className={cx("btn")} onClick={() => chooseLesson(next.id)}>Next: {next.title} <Icon name="arrow" /></button>
                : <button type="button" className={cx("btn")} onClick={() => props.onOpenCourse(null)}>Back to Knowledge</button>}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            <p className={cx("lead")} style={{ marginTop: 0 }}>{agentOn ? <span className={cx("aura")}><Icon name="spark" /></span> : null}{props.canManage ? "This course has no lessons yet." : "This course is being written."}</p>
            {editingTools ? (
              <button type="button" className={cx("btn go")} style={{ marginTop: 18 }} onClick={async () => {
                const id = await editingTools.addLesson(open.course.id);
                if (id) { chooseLesson(id); setEditingLessonId(id); }
              }}><Icon name="plus" />Write the first lesson</button>
            ) : null}
          </div>
        )}
        {!wide && lessonList && open.lessons.length ? (
          <div style={{ marginTop: 34 }}>
            <span className={cx("lab")} style={{ display: "block", marginBottom: 8 }}>Lessons</span>
            {lessonList}
          </div>
        ) : null}
      </div>
    );
  } else {
    // Adding a course is a button beside "Courses", so hosts' pages hold six too.
    const shelf = pageOf(courses, shelfPage, SHELF);
    const learning = summary.reduce((total, row) => total + row.started, 0);
    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <p className={cx("lead")} style={{ marginTop: 0 }}>{agentOn ? <span className={cx("aura")}><Icon name="spark" /></span> : null}
          {!props.loaded ? " " : props.canManage
            ? hostLead(courses.map((entry) => entry.course), learning)
            : resume ? "Pick up where you left off." : courses.length ? "Pick a course to start." : "Nothing to learn here yet."}
        </p>
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

        {resume ? (
          <button type="button" className={cx("card kcont")} onClick={() => { props.onOpenCourse(resume.course.id); chooseLesson(resume.lesson.id); }}>
            <div className={cx("meta")}><span>Continue · {resume.course.name}</span><span>Lesson {resume.index + 1} of {resume.total}</span></div>
            <h2>{resume.lesson.title}</h2>
            <div className={cx("kprog")}><div className={cx("bar")}><i style={{ width: `${Math.round((resume.index / resume.total) * 100)}%` }} /></div></div>
            <div className={cx("acts")}><span className={cx("btn go")}><Icon name="play" />Continue</span></div>
          </button>
        ) : null}

        <div className={cx("khead")}>
          <span className={cx("lab")}>Courses</span>
          {arranging ? <span className={cx("sub")} style={{ marginLeft: 10 }}>Members see them in this order.</span> : null}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {props.onReorderCourses && props.canManage && courses.length > 1 ? (
              <button type="button" className={cx("btn sm", !arranging && "txt")} aria-pressed={arranging} onClick={() => setArranging(!arranging)}>{arranging ? "Done" : "Arrange"}</button>
            ) : null}
            {props.onCreateCourse && courses.length > 0 && !arranging ? (
              <button type="button" className={cx("btn sm")} onClick={newCourse}><Icon name="plus" />New course</button>
            ) : null}
          </span>
        </div>
        {courseName !== null && props.onCreateCourse ? (
          <form className={cx("kbtns-link")} style={{ marginBottom: 14 }} aria-label="New course" onSubmit={(event) => { event.preventDefault(); void createCourse(); }}>
            <input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="Name the course" aria-label="Course name" maxLength={80} autoFocus disabled={creatingCourse}
              onKeyDown={(event) => { if (event.key === "Escape") setCourseName(null); }} />
            <button type="submit" className={cx("btn sm go")} disabled={creatingCourse || !courseName.trim()}>{creatingCourse ? "Creating…" : "Create"}</button>
            <button type="button" className={cx("btn sm txt")} onClick={() => setCourseName(null)}>Cancel</button>
            <span className={cx("khint")} style={{ marginTop: 0, flexBasis: "100%" }} role={newCourseError ? "alert" : undefined}>
              {newCourseError ?? "It starts as a draft only hosts see. You add its lessons next."}
            </span>
          </form>
        ) : null}
        <div className={cx("kgrid")}>
          {(arranging ? courses : shelf.items).map(({ course, lessons }, position) => {
            const progress = courseProgress(lessons, done);
            const row = summaryBy.get(course.id);
            // Arranging: the book stays put and two arrows move it; it does
            // not open, so a slip of the hand never leaves the shelf.
            if (arranging) return (
              <div key={course.id} className={cx("kcourse", "karr")}>
                <span className={cx("kcover", course.banner_url ? "" : coverTint(course.id))} style={course.banner_url ? { backgroundImage: `url(${JSON.stringify(course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(course.banner_focus_x ?? 0.5) * 100}% ${(course.banner_focus_y ?? 0.5) * 100}%` } : undefined}>
                  {course.banner_url ? null : <Icon name="book" />}
                </span>
                <span className={cx("kmove")}>
                  <button type="button" aria-label={`Move ${course.name} earlier`} disabled={movingCourse || position === 0} onClick={() => void moveCourse(position, -1)}><Icon name="back" /></button>
                  <button type="button" aria-label={`Move ${course.name} later`} disabled={movingCourse || position === courses.length - 1} onClick={() => void moveCourse(position, 1)}><Icon name="arrow" /></button>
                </span>
                <b>{course.name}{course.module_status === "draft" ? <span className={cx("tag")} style={{ marginLeft: 8 }}>draft</span> : null}</b>
                <span className={cx("s")}>{position + 1} of {courses.length}</span>
              </div>
            );
            return (
              <button key={course.id} type="button" className={cx("kcourse")} onClick={() => props.onOpenCourse(course.id)}>
                <span className={cx("kcover", course.banner_url ? "" : coverTint(course.id))} style={course.banner_url ? { backgroundImage: `url(${JSON.stringify(course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(course.banner_focus_x ?? 0.5) * 100}% ${(course.banner_focus_y ?? 0.5) * 100}%` } : undefined}>
                  {course.banner_url ? null : <Icon name="book" />}
                </span>
                <b>{course.name}{course.module_status === "draft" ? <span className={cx("tag")} style={{ marginLeft: 8 }}>draft</span> : null}</b>
                <span className={cx("s")}>{firstLine(course.description_md) || `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}</span>
                {props.canManage ? (
                  <span className={cx("kpct")}><i style={{ width: row && row.started ? `${Math.round((row.finished / row.started) * 100)}%` : "0%" }} /><em>{row ? `${row.started} started · ${row.finished} finished` : `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}</em></span>
                ) : (
                  <span className={cx("kpct")}><i style={{ width: `${progress.percent}%` }} /><em>{courseProgressWord(progress.percent)}</em></span>
                )}
              </button>
            );
          })}
          {/* The dashed card is the empty shelf's way in; with courses, the button beside "Courses" adds one. */}
          {props.onCreateCourse && courses.length === 0 ? <button type="button" className={cx("kcourse knew")} onClick={newCourse}><Icon name="plus" />New course</button> : null}
        </div>
        {shelf.pages > 1 && !arranging ? (
          <div className={cx("kpager")}>
            <span>{shelf.from}–{shelf.to} of {courses.length} courses</span>
            <button type="button" className={cx("btn sm")} disabled={shelf.page === 0} onClick={() => setShelfPage(shelf.page - 1)}>Previous</button>
            <button type="button" className={cx("btn sm")} disabled={shelf.page >= shelf.pages - 1} onClick={() => setShelfPage(shelf.page + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    );
  }

  return <><KitApp view="know" host={props.canManage} part="flow">{page}</KitApp>{wide && rail ? props.renderRail(rail) : null}</>;
}
