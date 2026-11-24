// Design system v1: the community brain, as a page in Knowledge (mock: "The
// map, third pass"). The map fills the page edge to edge, with its counts and
// readings over it. Nothing sits beside it until a point is picked: then
// what it is slides in over the map's right side (the whole page when narrow).
// Readings: Community and Yours for everyone, Gaps for builders. With fewer
// than five learned things a list says more than a map, so the page is a list.
import { useEffect, useState, type ReactNode } from "react";
import { brainCanDrawMap, type BrainMap, type BrainPoint } from "../../../../shared/communityBrain";
import { fetchBrainNote, moveBrainNote, type BrainNoteView } from "../../../../shared/cloudCommunityBrainGateway";
import { deleteCommunityNote, fetchNoteSources, updateCommunityNote, type NoteSourceView } from "../../../../shared/cloudCommunityNotesGateway";
import { askGuide } from "../components/guideSearch";
import { goToCommunityPage, goToCourseLesson } from "../../../../shared/routeDetails";
import { getCloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";
import { WebCommunityResourceViewerContent } from "../components/WebCommunityResourceViewerContent";
import { KitNextEvent } from "./KitNextEvent";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { useCommunityVisualIdentity } from "../../../../shared/CommunityVisualIdentityRegistry";
import { BRAIN_CENTER_ID } from "./KitBrainMap";
import { brainCourseAction, brainLessonOf, clipWords } from "./brainPanels";
import { Btn, cx, KitApp, useMinWidth } from "./kit";
import { PanelBlockSkeleton } from "../components/WebLoadingSkeleton";
import { KitBrainMap, type BrainReading } from "./KitBrainMap";
import { learnedWhen, useBrainMap } from "./KitBrain";
import { PanelAction, PanelLine, PanelPart } from "./KitPanel";

// Asking Knowledge to open the brain (from Home's panel). One use, this tab.
const OPEN_KEY = "polynet_open_brain";
export function askToOpenBrain(): void {
  try { window.sessionStorage.setItem(OPEN_KEY, "1"); } catch { /* opens Knowledge only */ }
}
export function takeOpenBrain(): boolean {
  try {
    const asked = window.sessionStorage.getItem(OPEN_KEY) === "1";
    window.sessionStorage.removeItem(OPEN_KEY);
    return asked;
  } catch { return false; }
}

function BrainPointList(props: { label: string; points: BrainPoint[]; now: number; empty?: string }) {
  if (!props.points.length && !props.empty) return null;
  return (
    <PanelPart label={props.label} fact={String(props.points.length)}>
      {props.points.length
        ? props.points.map((point) => <PanelLine key={point.id} fact={learnedWhen(point.learned_at, props.now)}>{point.title ?? "Something the community learned"}</PanelLine>)
        : <PanelLine dim>{props.empty}</PanelLine>}
    </PanelPart>
  );
}

// What a picked point is, from the map itself (lessons, subjects, pods) or
// from the server (a learned thing, read with this viewer's rules).
function PickedDetail(props: { map: BrainMap; id: string; session: unknown; communityId: string; now: number; version: number; canManage: boolean; content?: BrainContent;
  onPick: (id: string) => void; onOpenCourse: (courseId: string) => void; onChanged: (removed: boolean) => void }) {
  const [note, setNote] = useState<BrainNoteView | null>(null);
  const [sources, setSources] = useState<NoteSourceView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const isNote = props.id.startsWith("note:");
  // Another point: start clean. The same one after a change: keep what is
  // shown until the new read lands.
  useEffect(() => { setNote(null); setSources(null); setFailed(false); }, [props.session, props.communityId, props.id]);
  useEffect(() => {
    if (!isNote) return;
    let live = true;
    fetchBrainNote({ session: props.session, communityId: props.communityId, noteId: props.id })
      .then((view) => {
        if (!live) return;
        setNote(view);
        // A builder sees the posts a learned thing came from.
        if (view.slug && view.kind === "learned") {
          fetchNoteSources({ session: props.session, communityId: props.communityId, slug: view.slug }).then((rows) => { if (live) setSources(rows); }).catch(() => undefined);
        }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [props.session, props.communityId, props.id, isNote, props.version]);

  if (props.id === BRAIN_CENTER_ID) return <CommunityDetail map={props.map} session={props.session} communityId={props.communityId} now={props.now} canManage={props.canManage} content={props.content} />;
  const pickedCourse = props.map.courses.find((entry) => entry.id === props.id);
  if (pickedCourse) {
    const lessonIds = new Set(pickedCourse.lessons.map((entry) => entry.id));
    const filed = props.map.points.filter((point) => point.at.kind === "lesson" && lessonIds.has(point.at.id));
    const doneCount = pickedCourse.lessons.filter((entry) => entry.done).length;
    const total = pickedCourse.lessons.length;
    const module = props.content?.courses.find((entry) => entry.id === pickedCourse.id.replace(/^course:/, ""));
    const action = brainCourseAction(pickedCourse);
    const courseId = pickedCourse.id.replace(/^course:/, "");
    return (
      <div className={cx("land")}>
        {module?.banner_url ? <img className={cx("brain-cover")} src={module.banner_url} alt="" /> : null}
        <header>
          <span className={cx("lab")}>Course · {total} {total === 1 ? "lesson" : "lessons"}</span>
          <h2>{pickedCourse.name}</h2>
          {module?.description_md?.trim() ? <p className={cx("land-p")} style={{ whiteSpace: "pre-line" }}>{clipWords(module.description_md, 420)}</p> : null}
        </header>
        {total ? (
          <div className={cx("brain-progress")}>
            <span>{doneCount ? `${doneCount} of ${total} done` : "Not started"}</span>
            <span className={cx("brain-progress-bar")} aria-hidden="true"><span style={{ width: `${Math.round((100 * doneCount) / total)}%` }} /></span>
          </div>
        ) : null}
        {total ? (
          <PanelPart label="Lessons" fact={String(total)}>
            {pickedCourse.lessons.map((entry) => (
              <PanelLine key={entry.id} action={<PanelAction label={`Show ${entry.title}`} onClick={() => props.onPick(entry.id)}>Show</PanelAction>}>
                <span className="brain-tick" aria-label={entry.done ? "Done" : undefined}>{entry.done ? "✓" : ""}</span>{`${entry.order}. ${entry.title}`}
              </PanelLine>
            ))}
          </PanelPart>
        ) : null}
        <BrainPointList label="What the community added" points={filed} now={props.now} />
        <div className={cx("joinbar")}>
          {action.lessonId
            ? <Btn go onClick={() => goToCourseLesson(courseId, action.lessonId!.replace(/^resource:/, ""))}>{action.label}</Btn>
            : <Btn go onClick={() => props.onOpenCourse(courseId)}>{action.label}</Btn>}
          {action.lessonId ? <Btn onClick={() => props.onOpenCourse(courseId)}>Open the course</Btn> : null}
        </div>
      </div>
    );
  }
  const course = props.map.courses.find((entry) => entry.lessons.some((lesson) => lesson.id === props.id));
  const lesson = course?.lessons.find((entry) => entry.id === props.id);
  if (lesson && course) {
    const filed = props.map.points.filter((point) => point.at.kind === "lesson" && point.at.id === lesson.id);
    return (
      <div className={cx("land")}>
        <header>
          <span className={cx("lab")}>Lesson {lesson.order} · {course.name}</span>
          <h2>{lesson.title}</h2>
          <p className={cx("land-p")}>{lesson.done ? "You finished it." : "Not finished yet."}</p>
        </header>
        {(() => {
          const resource = brainLessonOf(props.content?.lessons, lesson.id);
          return resource ? <div className="kit-lesson-body brain-lesson-read"><WebCommunityResourceViewerContent resource={resource} /></div> : null;
        })()}
        <BrainPointList label="What the community added" points={filed} now={props.now} />
        <div className={cx("joinbar")}>
          <Btn go onClick={() => goToCourseLesson(course.id.replace(/^course:/, ""), lesson.id.replace(/^resource:/, ""))}>Open the lesson</Btn>
          <Btn onClick={() => props.onOpenCourse(course.id.replace(/^course:/, ""))}>Open the course</Btn>
        </div>
      </div>
    );
  }
  if (isNote) {
    if (failed) return <p className={cx("quiet")}>This isn't something you can open.</p>;
    if (!note) return null;
    const where = note.lesson ? `Lesson ${note.lesson.order} · ${note.lesson.title}` : note.at.kind === "subject" ? note.at.name
      : note.at.kind === "pod" ? "In a pod" : "Not filed yet";
    const nameless = note.title === null;
    return (
      <div className={cx("land")}>
        <header>
          <span className={cx("lab")}>{note.kind === "taught" ? "Taught by a host" : "Learned"} · {learnedWhen(note.learned_at, props.now)}</span>
          <h2>{note.title ?? (note.kind === "taught" ? "Something a host taught the guide" : "Something the community learned")}</h2>
          {note.body_md ? <p className={cx("land-p")} style={{ whiteSpace: "pre-wrap" }}>{note.body_md}</p>
            : nameless ? <p className={cx("land-p")}>The guide answers from it. What it says stays with the guide.</p> : null}
        </header>
        <PanelPart label="Where it sits"><PanelLine fact={note.lesson?.course ?? null}>{where}</PanelLine></PanelPart>
        <PanelPart label="How much it's used">
          <PanelLine>{note.use ? `Answers read it ${note.use} ${note.use === 1 ? "time" : "times"} this month` : "No answers have used it yet"}</PanelLine>
        </PanelPart>
        {note.with.length ? (
          <PanelPart label="Answered together with">
            {note.with.map((other) => <PanelLine key={other.id} fact={`${other.count}×`}>{other.title}</PanelLine>)}
          </PanelPart>
        ) : null}
        {sources?.length ? (
          <PanelPart label="Where it came from" fact={`${sources.length} ${sources.length === 1 ? "post" : "posts"}`}>
            {sources.map((source) => source.available ? (
              <PanelLine key={source.ref} fact={source.channel_name ? `#${source.channel_name}` : null}>{`${source.author ?? "Someone"}: ${source.excerpt}`}</PanelLine>
            ) : <PanelLine key={source.ref} dim>A post that's gone</PanelLine>)}
          </PanelPart>
        ) : null}
        {/* A builder's own: put it right from here. A pod's things are changed in the pod. */}
        {note.slug && props.map.points.find((point) => point.id === props.id)?.at.kind !== "pod" ? (
          <NoteActions key={props.id} map={props.map} note={note} session={props.session} communityId={props.communityId} onChanged={props.onChanged} />
        ) : null}
        {note.title ? (
          <div className={cx("joinbar")}><Btn go onClick={() => askGuide(`What do we know about "${note.title}"?`, props.communityId)}>Ask the guide about this</Btn></div>
        ) : null}
      </div>
    );
  }
  const pod = props.map.pods.find((entry) => entry.id === props.id);
  if (pod) {
    const filed = props.map.points.filter((point) => point.at.kind === "pod" && point.at.id === pod.id);
    return (
      <div className={cx("land")}>
        <header>
          <span className={cx("lab")}>Pod{pod.inside ? "" : " · you're not in it"}</span>
          <h2>{pod.name}</h2>
          <p className={cx("land-p")}>{pod.inside
            ? (pod.count ? `The guide knows ${pod.count} ${pod.count === 1 ? "thing" : "things"} from this pod.` : "Nothing learned in this pod yet.")
            : "A smaller group inside the community. Ask to join on the Pods page."}</p>
        </header>
        {pod.inside ? <BrainPointList label="What the pod knows" points={filed} now={props.now} /> : null}
        <div className={cx("joinbar")}><Btn go onClick={() => goToCommunityPage("pods")}>Open Pods</Btn></div>
      </div>
    );
  }
  const subject = props.map.subjects.find((entry) => `subject:${entry.name}` === props.id);
  if (subject) {
    const filed = props.map.points.filter((point) => point.at.kind === "subject" && point.at.name === subject.name);
    return (
      <div className={cx("land")}>
        <header><span className={cx("lab")}>A subject · no course teaches it</span><h2>{subject.name}</h2></header>
        <BrainPointList label="What the community knows" points={filed} now={props.now} />
      </div>
    );
  }
  return null;
}

// What the brain page is given from Knowledge, which has already loaded it:
// the courses and lessons this person can see, and the community's own words.
export type BrainContent = {
  courses: CommunityResourceModule[];
  lessons: CommunityResource[];
  community: { oneLiner: string | null; about: string | null };
};

// The middle of the map: the community itself.
function CommunityDetail(props: { map: BrainMap; session: unknown; communityId: string; now: number; canManage: boolean; content?: BrainContent }) {
  const [members, setMembers] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    getCloudCommunityHomeSnapshot({ session: props.session, communityId: props.communityId, audience: props.canManage ? "host" : "member" })
      .then((snapshot) => { if (live) setMembers(snapshot?.memberCount ?? null); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [props.session, props.communityId, props.canManage]);
  const { map } = props;
  const words = props.content?.community;
  // The community's own banner and logo, as the rest of the app shows them.
  const identity = useCommunityVisualIdentity(props.communityId);
  const facts: Array<[string, string]> = [
    ["Courses", String(map.counts.courses)],
    ["Lessons", String(map.counts.lessons)],
    ...(members ? [["Members", String(members)] as [string, string]] : []),
    ["Learned", map.counts.this_week ? `${map.counts.learned} · ${map.counts.this_week} this week` : String(map.counts.learned)],
  ];
  return (
    <div className={cx("land")}>
      <div className="brain-card-top">
        <StableFramedMedia className="brain-card-banner" imageUrl={identity?.banner.url ?? null}
          frame={identity ? { focusX: identity.banner.focus_x, focusY: identity.banner.focus_y, zoom: identity.banner.zoom } : undefined} alt="" aria-hidden />
        <CommunityAvatar communityId={props.communityId} name={map.center.name} className="brain-card-logo" aria-hidden />
      </div>
      <header>
        <span className={cx("lab")}>The community</span>
        <h2>{map.center.name}</h2>
        {words?.oneLiner?.trim() ? <p className={cx("land-p")}>{words.oneLiner.trim()}</p> : null}
      </header>
      {words?.about?.trim() ? <p className={cx("land-p")} style={{ whiteSpace: "pre-line" }}>{clipWords(words.about, 360)}</p> : null}
      <PanelPart label="What's here">
        {facts.map(([label, value]) => <PanelLine key={label} fact={value}>{label}</PanelLine>)}
      </PanelPart>
      <BrainPointList label="New this week" points={map.points.filter((point) => point.fresh && point.title && point.at.kind !== "pod").slice(-4).reverse()} now={props.now} />
      <KitNextEvent session={props.session} communityId={props.communityId} now={props.now} onOpenEvents={() => goToCommunityPage("events")} />
    </div>
  );
}

// Why a move was refused, in words.
const MOVE_REFUSALS: Record<string, string> = {
  about_invalid: "A subject is a few words: three at most.",
  about_is_a_title: "That's the name of a note. A subject groups several.",
  about_lesson_missing: "That lesson isn't one members can take any more.",
};

// What a builder can do to a learned thing from the map: move it under
// another lesson or subject, correct what it says, or remove it.
export function NoteActions(props: { map: BrainMap; note: BrainNoteView; session: unknown; communityId: string; onChanged: (removed: boolean) => void }) {
  const { note } = props;
  const [mode, setMode] = useState<"move" | "correct" | "remove" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = note.at.kind === "lesson" ? `lesson:${note.at.id.replace(/^resource:/, "")}` : note.at.kind === "subject" ? note.at.name : "";
  const [where, setWhere] = useState(here);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState(note.title ?? "");
  const [text, setText] = useState(note.body_md ?? "");
  const call = { session: props.session, communityId: props.communityId, slug: note.slug! };
  const open = (next: "move" | "correct" | "remove") => { setMode(next); setError(null); setWhere(here); setSubject(""); setTitle(note.title ?? ""); setText(note.body_md ?? ""); };
  const run = async (work: () => Promise<string | null>, removed = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const refusal = await work();
      if (refusal) setError(refusal);
      else { setMode(null); props.onChanged(removed); }
    } catch { setError("That didn't go through. Try again."); } finally { setBusy(false); }
  };
  const about = where === "new" ? subject.trim() : where;

  if (!mode) {
    return (
      <PanelPart label="Put it right">
        <PanelLine action={<PanelAction onClick={() => open("move")}>Move</PanelAction>}>It's in the wrong place</PanelLine>
        <PanelLine action={<PanelAction onClick={() => open("correct")}>Correct</PanelAction>}>It says something wrong</PanelLine>
        <PanelLine action={<PanelAction onClick={() => open("remove")}>Remove</PanelAction>}>It shouldn't be here</PanelLine>
      </PanelPart>
    );
  }
  return (
    <PanelPart label={mode === "move" ? "Move it under" : mode === "correct" ? "Correct it" : "Remove it"}>
      <div className={cx("podform")} style={{ marginTop: 0 }}>
        {mode === "move" ? (
          <>
            <select value={where} onChange={(event) => setWhere(event.target.value)} aria-label="Where it belongs">
              {!here ? <option value="">Not filed yet</option> : null}
              {props.map.courses.map((course) => (
                <optgroup key={course.id} label={course.name}>
                  {course.lessons.map((lesson) => <option key={lesson.id} value={`lesson:${lesson.id.replace(/^resource:/, "")}`}>{`${lesson.order}. ${lesson.title}`}</option>)}
                </optgroup>
              ))}
              <optgroup label="Subjects">
                {props.map.subjects.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
                <option value="new">A new subject…</option>
              </optgroup>
            </select>
            {where === "new" ? <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A subject, in a few words" aria-label="New subject" maxLength={40} autoFocus /> : null}
          </>
        ) : mode === "correct" ? (
          <>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Title" maxLength={120} />
            <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="What it says" rows={8} maxLength={4000} />
            <span className={cx("sub2")}>Once you correct it, it's yours: the guide won't change it again.</span>
          </>
        ) : (
          <span className={cx("sub2")}>The guide stops answering from it{note.kind === "learned" ? ", and the same posts won't teach it again" : ""}. This can't be undone here.</span>
        )}
        {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
        <div className={cx("acts")}>
          {mode === "move" ? (
            <Btn go small disabled={busy || !about || about === here} onClick={() => void run(async () => {
              const result = await moveBrainNote({ ...call, about });
              return result.ok ? null : MOVE_REFUSALS[result.code] ?? "It can't go there.";
            })}>{busy ? "Moving…" : "Move"}</Btn>
          ) : mode === "correct" ? (
            <Btn go small disabled={busy || !title.trim() || !text.trim() || (title === (note.title ?? "") && text === (note.body_md ?? ""))} onClick={() => void run(async () => {
              await updateCommunityNote({ ...call, title, text });
              return null;
            })}>{busy ? "Saving…" : "Save"}</Btn>
          ) : (
            <Btn go small disabled={busy} onClick={() => void run(async () => { await deleteCommunityNote(call); return null; }, true)}>{busy ? "Removing…" : "Remove"}</Btn>
          )}
          <Btn txt small onClick={() => { setMode(null); setError(null); }}>Cancel</Btn>
        </div>
      </div>
    </PanelPart>
  );
}

type PageProps = {
  session: unknown;
  communityId: string;
  canManage: boolean;
  content?: BrainContent;
  onOpenCourse: (courseId: string) => void;
};

export function KitBrainPage(props: PageProps) {
  // A builder's change on the page: read the map again.
  const [version, setVersion] = useState(0);
  const { map, failed } = useBrainMap(props.session, props.communityId, null);
  return (
    <KitBrainPageFrame canManage={props.canManage} fill={brainCanDrawMap(map)}>
      {failed ? <p className={cx("sub")}>The map couldn't load. Try again in a moment.</p> : map ? <KitBrainPageView {...props} map={map} version={version} onChanged={() => setVersion((last) => last + 1)} /> : <PanelBlockSkeleton label="Loading community brain…" />}
    </KitBrainPageFrame>
  );
}

// The kit's styles live under its own container: without it the map has
// none (SVG falls back to black). The page and the lab both draw inside it.
// fill: the map takes the whole page, to its edges (the app's stylesheet
// drops the page's own margins around "kit-brain-fill").
export function KitBrainPageFrame(props: { canManage: boolean; fill?: boolean; children: ReactNode }) {
  return <KitApp view="know" host={props.canManage} part="flow" className={props.fill ? "kit-brain-fill" : undefined}>{props.children}</KitApp>;
}

// The page for a map already in hand (the design lab draws it from examples).
export function KitBrainPageView(props: PageProps & { map: BrainMap; version?: number; onChanged?: () => void }) {
  const { map } = props;
  const [reading, setReading] = useState<BrainReading>("community");
  const [picked, setPicked] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const wide = useMinWidth(1024);
  useEffect(() => { setPicked(null); setReading("community"); }, [props.communityId]);
  // Escape puts down what was picked (registered before any early return so
  // live threshold crossings keep hook order stable).
  useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicked(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  const readings: Array<[BrainReading, string]> = [["community", "Community"], ["yours", "Yours"], ...(props.canManage ? [["gaps", "Gaps"] as [BrainReading, string]] : [])];
  const counts = `${map.counts.courses} ${map.counts.courses === 1 ? "course" : "courses"} · ${map.counts.lessons} ${map.counts.lessons === 1 ? "lesson" : "lessons"} · ${map.counts.learned} learned · ${map.counts.this_week} this week`;
  const detail = picked ? <PickedDetail map={map} id={picked} session={props.session} communityId={props.communityId} now={now} onOpenCourse={props.onOpenCourse}
    canManage={props.canManage} content={props.content} onPick={setPicked}
    version={props.version ?? 0} onChanged={(removed) => { if (removed) setPicked(null); props.onChanged?.(); }} /> : null;

  // Too little for a map: the list.
  if (!brainCanDrawMap(map)) {
    return (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <p className={cx("sub")} style={{ marginTop: 0 }}>{counts}</p>
        {map.courses.length ? (
          <PanelPart label="Courses" fact={String(map.courses.length)}>
            {map.courses.map((entry) => (
              <PanelLine key={entry.id} fact={`${entry.lessons.length} ${entry.lessons.length === 1 ? "lesson" : "lessons"}`}
                action={<PanelAction onClick={() => props.onOpenCourse(entry.id.replace(/^course:/, ""))}>Open</PanelAction>}>
                {entry.name}
              </PanelLine>
            ))}
          </PanelPart>
        ) : null}
        <BrainPointList label="What the community knows" points={map.points} now={now}
          empty={map.courses.length ? "No learned notes yet. The guide learns from what's said in open channels." : "Nothing yet. The guide learns from what's said in open channels."} />
      </div>
    );
  }

  return (
    <div className={cx("brainpage")}>
      <div className={cx("brainstage")}>
        <KitBrainMap map={map} size="page" reading={reading} now={now} selectedId={picked} coverRight={picked && wide ? SIDE_WIDTH : 0}
          onSelect={(id) => setPicked(id === picked ? null : id)} onClear={() => setPicked(null)} />
      </div>
      {/* The readings stay in reach beside an open panel. */}
      <div className={cx("brainbar")} style={picked && wide ? { paddingRight: SIDE_WIDTH + 24 } : undefined}>
        <span className={cx("sub")}>{counts}</span>
        <div className={cx("seg")} role="tablist" aria-label="Reading">
          {readings.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={reading === value} className={cx(reading === value ? "on" : "")} onClick={() => setReading(value)}>{label}</button>
          ))}
        </div>
      </div>
      {detail ? (
        <aside className={cx("brainside")} aria-label="What you picked">
          <button type="button" className={cx("brainside-x")} aria-label="Close" onClick={() => setPicked(null)}>{wide ? "×" : "← The map"}</button>
          {detail}
        </aside>
      ) : null}
    </div>
  );
}

// How wide the picked point's panel is over the map (kit css: .brainside).
const SIDE_WIDTH = 380;
