import { useEffect, useMemo, useRef, useState } from "react";
import { Library } from "lucide-react";
import type { BrainMap, BrainPoint } from "../../../../../shared/communityBrain";
import { latestLearned } from "../../../../../shared/communityBrain";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { KitBrainMap, type BrainReading } from "../../v1/KitBrainMap";
import { PanelAction, PanelLearned, PanelLine, PanelPart } from "../../v1/KitPanel";
import { Btn, KitApp, cx } from "../../v1/kit";
import { buildClubBrain } from "./RealAppPreview";

// The community brain's section, made from the app's own parts (the plan
// "guide sections", Nov 25). Behind: Knowledge's brain page, the app's own
// map (KitBrainMap) of the same community as the preview at the top, with its
// readings. In front: what it learned this week; pick one, here or on the
// map, and it opens as the brain page opens it (KitBrainPage's PickedDetail):
// what it says, where it sits, how much answers use it, the posts it came
// from, and "Put it right" (Move, Correct, Remove), which work here too.

const DAY = 86_400_000;

type NoteWords = { body: string; sources: Array<[who: string, channel: string, excerpt: string]> };

// What each learned note says and the posts it came from. The guide learns
// from posts only; courses are where notes are filed.
const NOTES: Record<string, NoteWords> = {
  "note:invite": { body: "Personal invitations beat posts. Name why you thought of them, say what's inside in one line, and give one date to show up.",
    sources: [["Jon", "wins", "Sent my invitation to 40 people from my newsletter. 11 joined in two days."], ["Priya", "general", "The personal ones worked, the group post got nothing."]] },
  "note:founding": { body: "Offer the first ten members a lower price for life, and say when it ends. Members here have used $29 to $49.",
    sources: [["Priya", "general", "Thinking of a founding price, $29 for life for the first ten?"], ["Jon", "general", "Mine started at $39 and I raised it after the first ten."]] },
  "note:hundred": { body: "Jon passed 100 members in six weeks: one invitation a day, a weekly call, and every new member welcomed by name.",
    sources: [["Jon", "wins", "100 members today. Six weeks, one invitation a day."]] },
  "note:askedHelp": { body: "Your first members are the people who already ask you for help. List ten of them before you write a sales page.",
    sources: [["Dev", "general", "My first three were people who'd DM'd me questions for months."]] },
  "note:headline": { body: "Headlines that worked here say the result, then who it's for. Short beats clever.",
    sources: [["Hana", "launch-pod", "Changed my headline to the result first and sign-ups doubled."]] },
  "note:noshow": { body: "If nobody shows up, record a short version anyway and post it. Next week, remind people the day before and the hour before.",
    sources: [["Amir", "general", "Nobody came to my first call. Recorded it anyway, 4 people watched it."]] },
  "note:dms": { body: "Ten personal messages bring more first customers than one big post.",
    sources: [["Kai", "wins", "Ten DMs, four yeses. The big post got one like."]] },
  "note:onePrice": { body: "Start with one price. Tiers can come once you know what people pay for.",
    sources: [["Maya", "general", "I dropped my three tiers and sales went up."]] },
};

// The preview's community, with what came from this reader marked (the
// "Yours" reading lights it).
export function sceneBrain(now: number): BrainMap {
  const map = buildClubBrain(now);
  const mine = new Set(["note:askedHelp", "note:dms", "note:noshow"]);
  return { ...map, points: map.points.map((point) => mine.has(point.id) ? { ...point, mine: true } : point) };
}

function learnedWhen(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function track(action: string) {
  captureProductAnalyticsEvent("brain_scene_used", { action });
}

function lessMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

type Edit = { title: string; body: string };

function placeOf(map: BrainMap, point: BrainPoint): string {
  if (point.at.kind === "subject") return point.at.name;
  if (point.at.kind === "pod") return "In a pod";
  const at = point.at;
  if (at.kind !== "lesson") return "Not filed yet";
  for (const course of map.courses) {
    const lesson = course.lessons.find((entry) => entry.id === at.id);
    if (lesson) return `Lesson ${lesson.order} · ${lesson.title}`;
  }
  return "Not filed yet";
}

export function BrainScene() {
  const [now] = useState(() => Date.now());
  const [map, setMap] = useState(() => sceneBrain(now));
  const [picked, setPicked] = useState<string | null>(null);
  const [reading, setReading] = useState<BrainReading>("community");
  const [mode, setMode] = useState<"move" | "correct" | "remove" | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [draft, setDraft] = useState<Edit>({ title: "", body: "" });
  const [where, setWhere] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const touched = useRef(false);

  const pick = (id: string | null, auto = false) => {
    if (!auto) { touched.current = true; if (id) track("pick"); }
    setPicked(id);
    setMode(null);
    setSaid(null);
  };

  // It opens the newest thing it learned by itself as it comes into view.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      window.setTimeout(() => { if (!touched.current) pick(latestLearned(map, 1)[0]?.id ?? null, true); }, lessMotion() ? 0 : 900);
    }, { threshold: 0.45 });
    seen.observe(node);
    return () => seen.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = `${map.counts.courses} courses · ${map.counts.lessons} lessons · ${map.counts.learned} learned · ${map.counts.this_week} this week`;
  const point = picked ? map.points.find((entry) => entry.id === picked) ?? null : null;
  const recent = useMemo(() => latestLearned(map, 5).filter((entry) => entry.id !== "note:podplan").slice(0, 4), [map]);

  const front = (() => {
    if (point && point.at.kind !== "pod") {
      const words = NOTES[point.id];
      const edit = edits[point.id];
      const title = edit?.title ?? point.title ?? "Something the community learned";
      const body = edit?.body ?? words?.body ?? "The guide answers from it.";
      const open = (next: "move" | "correct" | "remove") => {
        track(next); setMode(next); setSaid(null); setDraft({ title, body });
        setWhere(point.at.kind === "lesson" ? point.at.id : point.at.kind === "subject" ? `subject:${point.at.name}` : "");
      };
      return (
        <div className={cx("land")}>
          <button type="button" className="bsc-back-link" onClick={() => pick(null)}>← Learned this week</button>
          <header>
            <span className={cx("lab")}>{edit ? "Corrected by you" : "Learned"} · {learnedWhen(point.learned_at, now)}</span>
            <h2>{title}</h2>
            <p className={cx("land-p")}>{body}</p>
          </header>
          <PanelPart label="Where it sits"><PanelLine>{placeOf(map, point)}</PanelLine></PanelPart>
          <PanelPart label="How much it's used">
            <PanelLine>{point.use ? `Answers read it ${point.use} ${point.use === 1 ? "time" : "times"} this month` : "No answers have used it yet"}</PanelLine>
          </PanelPart>
          {words?.sources.length ? (
            <PanelPart label="Where it came from" fact={`${words.sources.length} ${words.sources.length === 1 ? "post" : "posts"}`}>
              {words.sources.map(([who, channel, excerpt]) => <PanelLine key={excerpt} fact={`#${channel}`}>{`${who}: ${excerpt}`}</PanelLine>)}
            </PanelPart>
          ) : null}
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          {!mode ? (
            <PanelPart label="Put it right">
              <PanelLine action={<PanelAction onClick={() => open("move")}>Move</PanelAction>}>It's in the wrong place</PanelLine>
              <PanelLine action={<PanelAction onClick={() => open("correct")}>Correct</PanelAction>}>It says something wrong</PanelLine>
              <PanelLine action={<PanelAction onClick={() => open("remove")}>Remove</PanelAction>}>It shouldn't be here</PanelLine>
            </PanelPart>
          ) : (
            <PanelPart label={mode === "move" ? "Move it under" : mode === "correct" ? "Correct it" : "Remove it"}>
              <div className={cx("podform")} style={{ marginTop: 0 }}>
                {mode === "move" ? (
                  <select value={where} onChange={(event) => setWhere(event.target.value)} aria-label="Where it belongs">
                    {map.courses.map((course) => (
                      <optgroup key={course.id} label={course.name}>
                        {course.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{`${lesson.order}. ${lesson.title}`}</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="Subjects">
                      {map.subjects.map((entry) => <option key={entry.name} value={`subject:${entry.name}`}>{entry.name}</option>)}
                    </optgroup>
                  </select>
                ) : mode === "correct" ? (
                  <>
                    <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title" maxLength={120} />
                    <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="What it says" rows={4} maxLength={600} />
                    <span className={cx("sub2")}>Once you correct it, it's yours: the guide won't change it again.</span>
                  </>
                ) : (
                  <span className={cx("sub2")}>The guide stops answering from it, and the same posts won't teach it again.</span>
                )}
                <div className={cx("acts")}>
                  {mode === "move" ? (
                    <Btn go small onClick={() => {
                      const at = where.startsWith("subject:") ? { kind: "subject" as const, name: where.slice(8) } : { kind: "lesson" as const, id: where };
                      setMap((last) => ({ ...last, points: last.points.map((entry) => entry.id === point.id ? { ...entry, at } : entry) }));
                      setMode(null); setSaid("Moved. It sits there on the map now.");
                    }}>Move</Btn>
                  ) : mode === "correct" ? (
                    <Btn go small onClick={() => {
                      setEdits((last) => ({ ...last, [point.id]: { title: draft.title.trim() || title, body: draft.body.trim() || body } }));
                      setMode(null); setSaid("Saved. The guide answers with your words from now on.");
                    }}>Save</Btn>
                  ) : (
                    <Btn go small onClick={() => {
                      setMap((last) => ({
                        ...last,
                        points: last.points.filter((entry) => entry.id !== point.id),
                        counts: { ...last.counts, learned: last.counts.learned - 1, this_week: last.counts.this_week - (point.fresh ? 1 : 0) },
                      }));
                      setPicked(null); setMode(null); setSaid("Removed. The guide no longer answers from it.");
                    }}>Remove</Btn>
                  )}
                  <Btn txt small onClick={() => setMode(null)}>Cancel</Btn>
                </div>
              </div>
            </PanelPart>
          )}
        </div>
      );
    }
    // Nothing picked (or a course, lesson or subject on the map): what it learned lately.
    return (
      <div className={cx("land")}>
        <header>
          <span className={cx("lab")}>Community brain</span>
          <h2>Learned this week</h2>
          <p className={cx("land-p")}>From helpful posts in open channels. Pick one, here or on the map.</p>
        </header>
        {said ? <p className="bsc-said" role="status">{said}</p> : null}
        <PanelPart label="Latest" fact={String(map.counts.this_week)}>
          {recent.map((note) => <PanelLearned key={note.id} title={note.title} when={learnedWhen(note.at, now)} onOpen={() => pick(note.id)} />)}
        </PanelPart>
      </div>
    );
  })();

  return (
    <div className="gsc bsc" ref={root}>
      <div className="gsc-back bsc-map" aria-hidden="false"
        onWheelCapture={(event) => { if ((event.target as Element).closest?.("svg")) event.stopPropagation(); }}>
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head"><span className="rpw-ch"><Library size={15} aria-hidden="true" />Knowledge</span><span className="bsc-crumb">Community brain</span></div>
            <div className="rpw-body">
              <KitApp view="know" part="main">
                <div className={cx("brainpage")}>
                  <div className={cx("brainstage")}>
                    <KitBrainMap map={map} size="page" reading={reading} now={now} selectedId={picked}
                      onSelect={(id) => pick(id === picked ? null : id)} onClear={() => pick(null)} />
                  </div>
                  <div className={cx("brainbar")}>
                    <span className={cx("sub")}>{counts}</span>
                    <div className={cx("seg")} role="tablist" aria-label="Reading">
                      {([["community", "Community"], ["yours", "Yours"]] as Array<[BrainReading, string]>).map(([value, label]) => (
                        <button key={value} type="button" role="tab" aria-selected={reading === value} className={cx(reading === value ? "on" : "")}
                          onClick={() => { track(`reading_${value}`); setReading(value); }}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </KitApp>
            </div>
          </div>
        </div>
      </div>
      <div className="gsc-front bsc-front">
        <KitApp view="know" part="flow">
          <div className="gsc-chat bsc-card">{front}</div>
        </KitApp>
      </div>
    </div>
  );
}
