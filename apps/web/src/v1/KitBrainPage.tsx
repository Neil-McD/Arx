// Design system v1: the community brain, as a page in Knowledge (mock: "The
// map, third pass"). The map fills the page edge to edge, with its counts and
// readings over it. Nothing sits beside it until a point is picked: then
// what it is slides in over the map's right side (the whole page when narrow).
// Readings: Community and Yours for everyone, Gaps for builders. With fewer
// than five learned things a list says more than a map, so the page is a list.
import { useEffect, useState, type ReactNode } from "react";
import type { BrainMap } from "../../../../shared/communityBrain";
import { fetchBrainMap, fetchBrainNote, type BrainNoteView } from "../../../../shared/cloudCommunityBrainGateway";
import { fetchNoteSources, type NoteSourceView } from "../../../../shared/cloudCommunityNotesGateway";
import { askGuide } from "../components/guideSearch";
import { Btn, cx, KitApp, useMinWidth } from "./kit";
import { BRAIN_MAP_MIN_POINTS, KitBrainMap, type BrainReading } from "./KitBrainMap";
import { learnedWhen } from "./KitBrain";
import { PanelLine, PanelPart } from "./KitPanel";

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

export function useBrainMap(session: unknown, communityId: string | null, podChannelId?: string | null): { map: BrainMap | null; failed: boolean } {
  const [state, setState] = useState<{ map: BrainMap | null; failed: boolean }>({ map: null, failed: false });
  useEffect(() => {
    setState({ map: null, failed: false });
    if (!session || !communityId) return;
    let live = true;
    fetchBrainMap({ session, communityId, podChannelId })
      .then((map) => { if (live) setState({ map, failed: false }); })
      .catch(() => { if (live) setState({ map: null, failed: true }); });
    return () => { live = false; };
  }, [session, communityId, podChannelId]);
  return state;
}

// What a picked point is, from the map itself (lessons, subjects, pods) or
// from the server (a learned thing, read with this viewer's rules).
function PickedDetail(props: { map: BrainMap; id: string; session: unknown; communityId: string; now: number; onOpenCourse: (courseId: string) => void }) {
  const [note, setNote] = useState<BrainNoteView | null>(null);
  const [sources, setSources] = useState<NoteSourceView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const isNote = props.id.startsWith("note:");
  useEffect(() => {
    setNote(null); setSources(null); setFailed(false);
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
  }, [props.session, props.communityId, props.id, isNote]);

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
        {filed.length ? (
          <PanelPart label="What the community added" fact={String(filed.length)}>
            {filed.map((point) => <PanelLine key={point.id} fact={learnedWhen(point.learned_at, props.now)}>{point.title ?? "Something the community learned"}</PanelLine>)}
          </PanelPart>
        ) : null}
        <div className={cx("joinbar")}><Btn go onClick={() => props.onOpenCourse(course.id.replace(/^course:/, ""))}>Open the course</Btn></div>
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
        {note.title ? (
          <div className={cx("joinbar")}><Btn go onClick={() => askGuide(`What do we know about "${note.title}"?`, props.communityId)}>Ask the guide about this</Btn></div>
        ) : null}
      </div>
    );
  }
  const subject = props.map.subjects.find((entry) => `subject:${entry.name}` === props.id);
  if (subject) {
    const filed = props.map.points.filter((point) => point.at.kind === "subject" && point.at.name === subject.name);
    return (
      <div className={cx("land")}>
        <header><span className={cx("lab")}>A subject · no course teaches it</span><h2>{subject.name}</h2></header>
        <PanelPart label="What the community knows" fact={String(filed.length)}>
          {filed.map((point) => <PanelLine key={point.id} fact={learnedWhen(point.learned_at, props.now)}>{point.title ?? "Something the community learned"}</PanelLine>)}
        </PanelPart>
      </div>
    );
  }
  return null;
}

type PageProps = {
  session: unknown;
  communityId: string;
  canManage: boolean;
  onOpenCourse: (courseId: string) => void;
};

export function KitBrainPage(props: PageProps) {
  const { map, failed } = useBrainMap(props.session, props.communityId);
  return (
    <KitBrainPageFrame canManage={props.canManage} fill={!!map && map.points.length >= BRAIN_MAP_MIN_POINTS}>
      {failed ? <p className={cx("sub")}>The map couldn't load. Try again in a moment.</p> : map ? <KitBrainPageView {...props} map={map} /> : null}
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
export function KitBrainPageView(props: PageProps & { map: BrainMap }) {
  const { map } = props;
  const [reading, setReading] = useState<BrainReading>("community");
  const [picked, setPicked] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const wide = useMinWidth(1024);
  useEffect(() => { setPicked(null); setReading("community"); }, [props.communityId]);

  const readings: Array<[BrainReading, string]> = [["community", "Community"], ["yours", "Yours"], ...(props.canManage ? [["gaps", "Gaps"] as [BrainReading, string]] : [])];
  const counts = `${map.counts.courses} ${map.counts.courses === 1 ? "course" : "courses"} · ${map.counts.lessons} lessons · ${map.counts.learned} learned · ${map.counts.this_week} this week`;
  const detail = picked ? <PickedDetail map={map} id={picked} session={props.session} communityId={props.communityId} now={now} onOpenCourse={props.onOpenCourse} /> : null;

  // Too little for a map: the list.
  if (map.points.length < BRAIN_MAP_MIN_POINTS) {
    return (
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <p className={cx("sub")} style={{ marginTop: 0 }}>{counts}</p>
        <PanelPart label="What the community knows" fact={String(map.points.length)}>
          {map.points.length ? map.points.map((point) => <PanelLine key={point.id} fact={learnedWhen(point.learned_at, now)}>{point.title ?? "Something the community learned"}</PanelLine>)
            : <PanelLine dim>Nothing yet. The guide learns from what's said in open channels.</PanelLine>}
        </PanelPart>
      </div>
    );
  }

  // Escape puts down what was picked.
  useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicked(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  return (
    <div className={cx("brainpage")}>
      <div className={cx("brainstage")}>
        <KitBrainMap map={map} size="page" reading={reading} now={now} selectedId={picked} coverRight={picked && wide ? SIDE_WIDTH : 0}
          onSelect={(id) => setPicked(id === picked ? null : id)} onClear={() => setPicked(null)} />
      </div>
      <div className={cx("brainbar")}>
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
