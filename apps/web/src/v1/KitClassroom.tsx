// Design system v1: Knowledge as a classroom, in the mock's markup
// (docs/design/hifi-mock, Knowledge). The library: ask, continue where you
// left off, and the courses as cards with progress, in pages. An open course:
// its lesson, Mark done and Next, with the outline in the right column. Notes
// only ever appear in the right column ("Learned this week").
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { continueLesson, courseLessons, courseProgress, pageOf } from "../../../../shared/communityClassroom";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";
import { openGuideFromSearch } from "../components/guideSearch";
import { WebCommunityResourceViewerContent } from "../components/WebCommunityResourceViewerContent";
import { NoteForm, OpenNote, noteIsNew } from "./KitKnowledgeNotes";
import { Btn, cx, Icon, KitApp, Rail, Sec, Sep, TextLink } from "./kit";

const SHELF = 6;

// The mock's small constellation (lib.py mini_map): a quiet picture of memory.
const NODES: Array<[number, number, "" | "big" | "new"]> = [
  [40, 96, ""], [92, 48, ""], [150, 84, "big"], [206, 40, "new"], [238, 104, ""], [120, 126, ""], [64, 30, ""], [184, 128, ""],
];
const EDGES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [1, 6], [4, 7], [5, 0]];

function MiniMap() {
  return (
    <svg className={cx("mini")} viewBox="0 0 280 156" aria-hidden="true">
      <defs>
        <radialGradient id="kit-class-aurora" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: "var(--aurora)" }} stopOpacity=".6" />
          <stop offset="1" style={{ stopColor: "var(--aurora)" }} stopOpacity="0" />
        </radialGradient>
      </defs>
      {EDGES.map(([a, b]) => <path key={`${a}-${b}`} d={`M${NODES[a][0]} ${NODES[a][1]}L${NODES[b][0]} ${NODES[b][1]}`} stroke="currentColor" strokeOpacity=".16" strokeWidth=".8" />)}
      {NODES.map(([x, y, kind]) => (
        <g key={`${x}-${y}`}>
          {kind === "new" ? <circle cx={x} cy={y} r="16" fill="url(#kit-class-aurora)" /> : null}
          <circle cx={x} cy={y} r={kind === "big" ? 4 : 2.6} fill="currentColor" opacity={kind ? 1 : 0.8} />
        </g>
      ))}
    </svg>
  );
}

function firstLine(markdown: string | null): string {
  const line = String(markdown ?? "").split("\n").map((part) => part.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.length > 110 ? `${line.slice(0, 107)}…` : line;
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
  onNewCourse: () => void;
  onEditCourse: (moduleId: string) => void;
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const [doneAt, setDoneAt] = useState<Map<string, string>>(() => new Map());
  const [summary, setSummary] = useState<CourseProgressSummary[]>([]);
  const [notes, setNotes] = useState<CommunityNoteView[]>([]);
  const [canWriteNotes, setCanWriteNotes] = useState(false);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [shelfPage, setShelfPage] = useState(0);
  const [note, setNote] = useState<{ slug: string | null; mode: "read" | "edit" | "new" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [now] = useState(Date.now);

  const loadProgress = useCallback(async () => {
    try {
      const rows = await fetchMyLessonProgress({ session: props.session, communityId: props.communityId });
      setDoneAt(new Map(rows.map((row) => [row.resource_id, row.completed_at])));
    } catch { /* The page works without progress; marking a lesson retries. */ }
  }, [props.session, props.communityId]);
  const loadNotes = useCallback(async () => {
    try {
      const view = await fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 50 });
      setNotes(view.notes);
      setCanWriteNotes(view.can_manage && props.canManage);
    } catch { /* The right column goes without notes. */ }
  }, [props.session, props.communityId, props.canManage]);
  useEffect(() => { void loadProgress(); void loadNotes(); }, [loadProgress, loadNotes]);
  useEffect(() => {
    if (!props.canManage) { setSummary([]); return; }
    let cancelled = false;
    fetchCourseProgressSummary({ session: props.session, communityId: props.communityId })
      .then((rows) => { if (!cancelled) setSummary(rows); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [props.session, props.communityId, props.canManage]);

  // Members see live courses; hosts see drafts too, marked.
  const courses = useMemo(() => props.modules
    .filter((module) => !module.is_virtual && (props.canManage || module.module_status === "live"))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((course) => ({ course, lessons: courseLessons(props.resources, course.id) })), [props.modules, props.resources, props.canManage]);
  const done = useMemo(() => new Set(doneAt.keys()), [doneAt]);
  const open = courses.find((entry) => entry.course.id === props.openCourseId) ?? null;
  const resume = useMemo(() => (props.canManage ? null : continueLesson(courses, doneAt)), [courses, doneAt, props.canManage]);
  const summaryBy = useMemo(() => new Map(summary.map((row) => [row.module_id, row])), [summary]);

  // Opening a course lands on its next lesson (or the first).
  useEffect(() => {
    if (!open) { setLessonId(null); return; }
    if (lessonId && open.lessons.some((lesson) => lesson.id === lessonId)) return;
    setLessonId(courseProgress(open.lessons, done).nextLessonId ?? open.lessons[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.course.id, open?.lessons.length]);

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

  const fresh = notes.filter((entry) => noteIsNew(entry, now)).slice(0, 4);
  const shownNotes = fresh.length ? fresh : notes.slice(0, 3);
  const openNote = note?.slug ? notes.find((entry) => entry.slug === note.slug) ?? null : null;

  // ---------- the right column
  const noteRail = note ? (
    <>
      <TextLink onClick={() => setNote(null)}>Back</TextLink>
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
      <Sec label={`What ${props.communityName} knows`}>
        <div className={cx("kmini")}><MiniMap /></div>
        <span className={cx("sub")}>{notes.length} {notes.length === 1 ? "note" : "notes"} · {courses.length} {courses.length === 1 ? "course" : "courses"}</span>
      </Sec>
      {shownNotes.length || canWriteNotes ? (
        <>
          <Sep />
          <div className={cx("sec")}>
            <span className={cx("lab")} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aurora-ink)" }}><Icon name="spark" extra="xs" />{fresh.length ? "Learned this week" : "What it has learned"}</span>
            {shownNotes.map((entry, index) => (
              <button key={entry.slug} type="button" className={cx("src")} style={index ? { marginTop: -8 } : undefined} onClick={() => setNote({ slug: entry.slug, mode: "read" })}>
                <span className={cx("sdot", noteIsNew(entry, now) && "fresh")} />{entry.title}{noteIsNew(entry, now) ? <em>new</em> : null}
              </button>
            ))}
            {canWriteNotes ? <TextLink onClick={() => setNote({ slug: null, mode: "new" })}>Write a note</TextLink> : null}
          </div>
        </>
      ) : null}
      {courses.length ? (
        <>
          <Sep />
          {props.canManage ? (
            <Sec label="Learning">
              {courses.filter((entry) => entry.course.module_status === "live").slice(0, 5).map(({ course }) => {
                const row = summaryBy.get(course.id);
                return <div key={course.id} className={cx("kline")}><span>{course.name}</span><em>{row ? `${row.started} started · ${row.finished} finished` : "—"}</em></div>;
              })}
            </Sec>
          ) : (
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

  const openProgress = open ? courseProgress(open.lessons, done) : null;
  const courseRail = open && openProgress ? (
    <>
      <Sec label={open.course.name}>
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
          <button key={lesson.id} type="button" className={cx("kl", lesson.id === lessonId && "on", done.has(lesson.id) && lesson.id !== lessonId && "d")} onClick={() => setLessonId(lesson.id)}>
            {done.has(lesson.id) ? <Icon name="check" /> : <i />}{index + 1}. {lesson.title}
          </button>
        ))}
      </div>
      <div style={{ marginTop: "auto" }}>
        <button type="button" className={cx("ask kask-btn")} style={{ height: 46 }} onClick={() => openGuideFromSearch()}>
          <Icon name="spark" extra="sp" /><span>Ask about this lesson</span>
        </button>
      </div>
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
        <div className={cx("kcrumb")} style={{ marginTop: 0 }}>
          <button type="button" className={cx("link")} onClick={() => props.onOpenCourse(null)}>Knowledge</button><span>›</span><span>{open.course.name}</span>
          {props.canManage ? <button type="button" className={cx("btn sm")} style={{ marginLeft: "auto" }} onClick={() => props.onEditCourse(open.course.id)}>Edit course</button> : null}
        </div>
        {lesson ? (
          <div className={cx("klesson")}>
            <div className={cx("ktitle")}>
              <span className={cx("lab")} style={{ flex: 1 }}>Lesson {index + 1} of {open.lessons.length}{open.course.module_status === "draft" ? " · draft course" : ""}</span>
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
          <p className={cx("lead")} style={{ marginTop: 24 }}><span className={cx("aura")}><Icon name="spark" /></span>{props.canManage ? "This course has no lessons yet." : "This course is being written."}</p>
        )}
      </div>
    );
  } else {
    const shelf = pageOf(courses, shelfPage, props.canManage ? SHELF - 1 : SHELF);
    const learning = summary.reduce((total, row) => total + row.started, 0);
    page = (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <p className={cx("lead")} style={{ marginTop: 0 }}><span className={cx("aura")}><Icon name="spark" /></span>
          {!props.loaded ? " " : props.canManage
            ? (courses.length === 0 ? "Start with one course." : learning > 0 ? `${learning} ${learning === 1 ? "person has" : "people have"} started a course.` : "Your courses are ready for members.")
            : resume ? "Pick up where you left off." : courses.length ? "Pick a course to start." : "Nothing to learn here yet."}
        </p>
        <button type="button" className={cx("ask kask kask-btn")} onClick={() => openGuideFromSearch()}>
          <Icon name="spark" extra="sp" /><span>Ask anything {props.communityName} knows</span>
        </button>

        {resume ? (
          <button type="button" className={cx("card kcont")} onClick={() => { props.onOpenCourse(resume.course.id); setLessonId(resume.lesson.id); }}>
            <div className={cx("meta")}><span>Continue · {resume.course.name}</span><span>Lesson {resume.index + 1} of {resume.total}</span></div>
            <h2>{resume.lesson.title}</h2>
            <div className={cx("kprog")}><div className={cx("bar")}><i style={{ width: `${Math.round((resume.index / resume.total) * 100)}%` }} /></div></div>
            <div className={cx("acts")}><span className={cx("btn go")}><Icon name="play" />Continue</span></div>
          </button>
        ) : null}

        <div className={cx("khead")}><span className={cx("lab")}>Courses</span></div>
        <div className={cx("kgrid")}>
          {shelf.items.map(({ course, lessons }) => {
            const progress = courseProgress(lessons, done);
            const row = summaryBy.get(course.id);
            return (
              <button key={course.id} type="button" className={cx("kcourse")} onClick={() => props.onOpenCourse(course.id)}>
                <span className={cx("kcover", course.banner_url ? "" : "c2")} style={course.banner_url ? { backgroundImage: `url(${JSON.stringify(course.banner_url)})`, backgroundSize: "cover", backgroundPosition: `${(course.banner_focus_x ?? 0.5) * 100}% ${(course.banner_focus_y ?? 0.5) * 100}%` } : undefined}>
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
          {props.canManage ? <button type="button" className={cx("kcourse knew")} onClick={props.onNewCourse}><Icon name="plus" />New course</button> : null}
        </div>
        {shelf.pages > 1 ? (
          <div className={cx("kpager")}>
            <span>{shelf.from}–{shelf.to} of {courses.length} courses</span>
            <button type="button" className={cx("btn sm")} disabled={shelf.page === 0} onClick={() => setShelfPage(shelf.page - 1)}>Previous</button>
            <button type="button" className={cx("btn sm")} disabled={shelf.page >= shelf.pages - 1} onClick={() => setShelfPage(shelf.page + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    );
  }

  return <><KitApp view="know" host={props.canManage} part="flow">{page}</KitApp>{props.renderRail(rail)}</>;
}
