// Design system v1: Knowledge as a classroom, in the mock's markup
// (docs/design/hifi-mock, Knowledge). The library: ask, continue where you
// left off, and the courses as cards with progress, in pages. An open course:
// its lesson, Mark done and Next, with the outline in the right column. Under
// the shelf, one list of notes, files and links (KitKnowledgeList); a note
// opens in the right column.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  updateCommunityNote,
  type CommunityNoteView,
} from "../../../../shared/cloudCommunityNotesGateway";
import { getCloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import { continueLesson, courseLessons, courseProgress, pageOf } from "../../../../shared/communityClassroom";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";
import { askGuide, openGuideFromSearch } from "../components/guideSearch";
import { WebCommunityResourceViewerContent } from "../components/WebCommunityResourceViewerContent";
import { NoteForm, OpenNote, noteIsNew } from "./KitKnowledgeNotes";
import { KitLessonEditor, type LessonPatch } from "./KitLessonEditor";
import { Btn, cx, Icon, KitApp, Rail, Sec, Sep, TextLink } from "./kit";
import { KitKnowledgeAdd, KitKnowledgeList, type KnowledgeAddMode, type KnowledgeAddResult } from "./KitKnowledgeList";
import { useCommunityAgentOn } from "../controllers/communityAgentOn";

const SHELF = 6;

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
  // Makes a draft course with these lessons and opens it (hosts).
  onCreateCourse?: (name: string, lessons: string[]) => Promise<KnowledgeAddResult>;
  onEditCourse: (moduleId: string) => void;
  // A course's name, line and cover (the course form).
  onEditCourseDetails: (moduleId: string) => void;
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
  } | null;
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const [doneAt, setDoneAt] = useState<Map<string, string>>(() => new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [summary, setSummary] = useState<CourseProgressSummary[]>([]);
  const [notes, setNotes] = useState<CommunityNoteView[]>([]);
  const [canWriteNotes, setCanWriteNotes] = useState(false);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [shelfPage, setShelfPage] = useState(0);
  const [note, setNote] = useState<{ slug: string | null; mode: "read" | "edit" | "new" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const editingTools = props.canManage ? props.lessonEditing : null;
  // Questions members asked in channels that nobody answered (the owner's
  // brief already finds them): where Knowledge is thin.
  const [waiting, setWaiting] = useState<Array<{ author: string; channel: string; text: string; hoursAgo: number }>>([]);
  const [seed, setSeed] = useState<{ text: string; mode?: KnowledgeAddMode; nonce: number } | null>(null);
  // "New course" opens the box at the top of the page, switched to Course.
  const newCourse = () => setSeed({ text: "", mode: "course", nonce: Date.now() });
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
    } catch { /* The right column goes without notes. */ }
  }, [props.session, props.communityId, props.canManage]);
  useEffect(() => { void loadProgress(); void loadNotes(); }, [loadProgress, loadNotes]);
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
  useEffect(() => {
    if (!open) { setLessonId(null); autoLessonRef.current = null; return; }
    if (lessonId && lessonId !== autoLessonRef.current && open.lessons.some((lesson) => lesson.id === lessonId)) return;
    const next = courseProgress(open.lessons, done).nextLessonId ?? open.lessons[0]?.id ?? null;
    autoLessonRef.current = next;
    setLessonId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.course.id, open?.lessons.length, progressLoaded]);

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

  // ---------- the right column
  const noteRail = note ? (
    <>
      <button type="button" className={cx("kback")} onClick={() => setNote(null)}><Icon name="back" />Back</button>
      {note.mode === "new" && canWriteNotes ? (
        <NoteForm title="" text="" submitLabel="Save note" onCancel={() => setNote(null)}
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
          }} />
      ) : null}
    </>
  ) : null;

  const libraryRail = (
    <>
      {canWriteNotes && waiting.length ? (
        <>
          <div className={cx("sec")}>
            <span className={cx("lab")} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aurora-ink)" }}><Icon name="spark" extra="xs" />Questions nobody answered</span>
            {waiting.slice(0, 3).map((question, index) => (
              <div key={`${question.author}:${index}`} className={cx("kwait")}>
                <p>“{question.text}”</p>
                <span className={cx("sub")}>{question.author} in #{question.channel} · {question.hoursAgo < 48 ? `${question.hoursAgo}h ago` : `${Math.round(question.hoursAgo / 24)}d ago`}</span>
                <button type="button" className={cx("btn sm")} onClick={() => { setNote(null); setSeed({ text: `${question.text}\n`, nonce: Date.now() }); }}>Add the answer</button>
              </div>
            ))}
          </div>
          <Sep />
        </>
      ) : null}
      {courses.length ? (
        <>
          {props.canManage ? (courses.some((entry) => entry.course.module_status === "live") ? (
            <Sec label="Learning">
              {courses.filter((entry) => entry.course.module_status === "live").slice(0, 5).map(({ course }) => {
                const row = summaryBy.get(course.id);
                return <div key={course.id} className={cx("kline")}><span>{course.name}</span><em>{row ? `${row.started} started · ${row.finished} finished` : "—"}</em></div>;
              })}
            </Sec>
          ) : <Sec label="Learning"><p>Publish a course and you'll see who started and finished it here.</p></Sec>) : (
            <Sec label="Your progress">
              {courses.filter(({ lessons }) => courseProgress(lessons, done).done > 0).length === 0 ? <p>Start a course and it shows here.</p> : null}
              {courses.map(({ course, lessons }) => {
                const progress = courseProgress(lessons, done);
                if (!progress.done) return null;
                return (
                  <div key={course.id}>
                    <div className={cx("kline")}><span>{course.name}</span><em>{progress.finished ? "finished" : `${progress.done} of ${progress.total}`}</em></div>
                    <div className={cx("bar")} style={{ marginTop: 6 }}><i style={{ width: `${progress.percent}%` }} /></div>
                  </div>
                );
              })}
            </Sec>
          )}
        </>
      ) : null}
    </>
  );

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
            <button type="button" className={cx("btn sm")} onClick={() => props.onEditCourseDetails(open.course.id)}>Course details</button>
            <button type="button" className={cx("btn sm txt")} onClick={() => props.onEditCourse(open.course.id)}>More tools</button>
    </>
  ) : null;
  const openProgress = open ? courseProgress(open.lessons, done) : null;
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
      <div className={cx("sec")}>
        {open.lessons.map((lesson, index) => (
          <div key={lesson.id} className={cx("kl-row")}>
            <button type="button" className={cx("kl", lesson.id === lessonId && "on", done.has(lesson.id) && lesson.id !== lessonId && "d")} onClick={() => { setEditingLessonId(null); setLessonId(lesson.id); }}>
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
            if (id) { setLessonId(id); setEditingLessonId(id); }
          }}>+ Add lesson</TextLink>
        ) : null}
      </div>
      {agentOn ? (
        <div style={{ marginTop: "auto" }}>
          <button type="button" className={cx("ask kask-btn")} style={{ height: 46 }} onClick={() => openGuideFromSearch()}>
            <Icon name="spark" extra="sp" /><span>Ask about this lesson</span>
          </button>
        </div>
      ) : null}
    </>
  ) : null;

  const rail = (
    <KitApp view="know" host={props.canManage} part="rail" className="kit-page-rail">
      <Rail index={2} label="Knowledge">{noteRail ?? courseRail ?? libraryRail}</Rail>
    </KitApp>
  );

  // ---------- the page
  let page: ReactNode;
  if (open) {
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
        {lesson && editingTools && editingLessonId === lesson.id ? (
          <KitLessonEditor key={lesson.id} resource={lesson} index={index} total={open.lessons.length} courseLive={open.course.module_status !== "draft"}
            onCancel={() => setEditingLessonId(null)}
            onSave={async (patch) => { await editingTools.save(lesson.id, patch); setEditingLessonId(null); }}
            onDelete={async () => {
              await editingTools.remove(lesson.id);
              setEditingLessonId(null);
              setLessonId(open.lessons[index + 1]?.id ?? open.lessons[index - 1]?.id ?? null);
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
            <div className={cx("acts")} style={{ marginTop: 22 }}>
              {!props.canManage && !done.has(lesson.id) ? (
                <button type="button" className={cx("btn go")} disabled={saving} onClick={async () => { await mark(lesson.id, true); if (next) setLessonId(next.id); }}>
                  <Icon name="check" />{next ? "Mark done and continue" : "Mark done"}
                </button>
              ) : null}
              {next ? <button type="button" className={cx("btn")} onClick={() => setLessonId(next.id)}>Next: {next.title} <Icon name="arrow" /></button>
                : <button type="button" className={cx("btn")} onClick={() => props.onOpenCourse(null)}>Back to Knowledge</button>}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            <p className={cx("lead")} style={{ marginTop: 0 }}>{agentOn ? <span className={cx("aura")}><Icon name="spark" /></span> : null}{props.canManage ? "This course has no lessons yet." : "This course is being written."}</p>
            {editingTools ? (
              <button type="button" className={cx("btn go")} style={{ marginTop: 18 }} onClick={async () => {
                const id = await editingTools.addLesson(open.course.id);
                if (id) { setLessonId(id); setEditingLessonId(id); }
              }}><Icon name="plus" />Write the first lesson</button>
            ) : null}
          </div>
        )}
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
        {/* One bar: people who can add get the box that asks and adds;
            everyone else gets the bar that asks. */}
        {agentOn && !(canWriteNotes || props.canManage) ? (
          <button type="button" className={cx("ask kask kask-btn")} onClick={() => openGuideFromSearch()}>
            <Icon name="spark" extra="sp" /><span>Ask anything {props.communityName} knows</span>
          </button>
        ) : null}

        <KitKnowledgeAdd seed={seed} communityName={props.communityName}
          onAsk={agentOn ? (question) => askGuide(question, props.communityId) : undefined}
          onAddNote={canWriteNotes ? async (title, text) => {
            try {
              await createCommunityNote({ session: props.session, communityId: props.communityId, title, text });
              await loadNotes();
              return { ok: true };
            } catch (error) {
              return { ok: false, message: error instanceof Error && error.message ? error.message : "That note couldn't be saved. Try again." };
            }
          } : undefined}
          onAddSources={props.canManage ? props.onAddSources : undefined}
          onCreateCourse={props.canManage ? props.onCreateCourse : undefined} />

        {resume ? (
          <button type="button" className={cx("card kcont")} onClick={() => { props.onOpenCourse(resume.course.id); setLessonId(resume.lesson.id); }}>
            <div className={cx("meta")}><span>Continue · {resume.course.name}</span><span>Lesson {resume.index + 1} of {resume.total}</span></div>
            <h2>{resume.lesson.title}</h2>
            <div className={cx("kprog")}><div className={cx("bar")}><i style={{ width: `${Math.round((resume.index / resume.total) * 100)}%` }} /></div></div>
            <div className={cx("acts")}><span className={cx("btn go")}><Icon name="play" />Continue</span></div>
          </button>
        ) : null}

        <div className={cx("khead")}>
          <span className={cx("lab")}>Courses</span>
          {props.onCreateCourse && courses.length > 0 ? (
            <button type="button" className={cx("btn sm knewbtn")} onClick={newCourse}><Icon name="plus" />New course</button>
          ) : null}
        </div>
        <div className={cx("kgrid")}>
          {shelf.items.map(({ course, lessons }) => {
            const progress = courseProgress(lessons, done);
            const row = summaryBy.get(course.id);
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
                  <span className={cx("kpct")}><i style={{ width: `${progress.percent}%` }} /><em>{progress.percent}%</em></span>
                )}
              </button>
            );
          })}
          {/* The dashed card is the empty shelf's way in; with courses, the button beside "Courses" adds one. */}
          {props.onCreateCourse && courses.length === 0 ? <button type="button" className={cx("kcourse knew")} onClick={newCourse}><Icon name="plus" />New course</button> : null}
        </div>
        {shelf.pages > 1 ? (
          <div className={cx("kpager")}>
            <span>{shelf.from}–{shelf.to} of {courses.length} courses</span>
            <button type="button" className={cx("btn sm")} disabled={shelf.page === 0} onClick={() => setShelfPage(shelf.page - 1)}>Previous</button>
            <button type="button" className={cx("btn sm")} disabled={shelf.page >= shelf.pages - 1} onClick={() => setShelfPage(shelf.page + 1)}>Next</button>
          </div>
        ) : null}
        <KitKnowledgeList notes={notes} now={now}
          sources={props.canManage ? props.resources.filter((resource) => resource.resource_role === "source") : []}
          onOpenNote={(slug) => setNote({ slug, mode: "read" })} />
      </div>
    );
  }

  return <><KitApp view="know" host={props.canManage} part="flow">{page}</KitApp>{props.renderRail(rail)}</>;
}
