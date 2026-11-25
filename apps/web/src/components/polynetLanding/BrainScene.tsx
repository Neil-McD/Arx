import { useEffect, useMemo, useRef, useState } from "react";
import type { BrainMap, BrainPoint } from "../../../../../shared/communityBrain";
import { latestLearned } from "../../../../../shared/communityBrain";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { KitBrainMap } from "../../v1/KitBrainMap";
import { KitApp } from "../../v1/kit";
import { buildClubBrain } from "./RealAppPreview";

// The community brain's section (the plan "community brain, replanned",
// Nov 25). The app's own map (KitBrainMap) of the same community as the
// preview at the top, drawn straight on the page with no app frame around
// it; its nodes are the real thing: hover names them, a click picks one.
// Beside it, the card the page always had: what it learned lately. A picked
// note opens in the card: what it says, where it sits, the posts it came
// from, and Correct and Remove, which work here as they do on the brain page.

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

// The preview's own community, so the page is one place throughout.
export function sceneBrain(now: number): BrainMap {
  return buildClubBrain(now);
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
  const [mode, setMode] = useState<"correct" | "remove" | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [draft, setDraft] = useState<Edit>({ title: "", body: "" });
  const [said, setSaid] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const touched = useRef(false);

  const pick = (id: string | null, auto = false) => {
    if (!auto) { touched.current = true; if (id) track("pick"); }
    setPicked(id === map.center.name || id === "center" ? null : id);
    setMode(null);
    setSaid(null);
  };

  // As it comes into view, the newest thing it learned opens by itself, so
  // the nodes are seen to be the real thing.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      window.setTimeout(() => { if (!touched.current) pick(latestLearned(map, 1)[0]?.id ?? null, true); }, lessMotion() ? 0 : 1200);
    }, { threshold: 0.5 });
    seen.observe(node);
    return () => seen.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const community = map.points.filter((point) => point.at.kind !== "pod");
  const recent = useMemo(() => latestLearned(map, 6).filter((entry) => entry.id !== "note:podplan").slice(0, 3), [map]);
  const thisWeek = community.filter((point) => now - Date.parse(point.learned_at) <= 7 * DAY).length;
  const fromLine = (id: string) => {
    const sources = NOTES[id]?.sources ?? [];
    if (sources.length === 1) return `From ${sources[0][0]}'s post in #${sources[0][1]}`;
    return sources.length ? `From ${sources.length} posts` : "From a conversation here";
  };
  const row = (id: string, title: string, sub: string, fresh: boolean) => (
    <button key={id} type="button" className="sc-learned bsc-row" onClick={() => pick(id)}>
      <i className={fresh ? "new" : ""} />
      <div><b>{edits[id]?.title ?? title}</b><span>{sub}</span></div>
    </button>
  );

  const card = (() => {
    const point = picked ? map.points.find((entry) => entry.id === picked) ?? null : null;
    if (point) {
      const words = NOTES[point.id];
      const edit = edits[point.id];
      const title = edit?.title ?? point.title ?? "Something the community learned";
      const body = edit?.body ?? words?.body ?? "The guide answers from it.";
      const inPod = point.at.kind === "pod";
      return (
        <>
          <button type="button" className="bsc-back-link" onClick={() => pick(null)}>← What your community knows</button>
          <span className="sc-eyebrow">{edit ? "Corrected by you" : "Learned"} · {learnedWhen(point.learned_at, now)}</span>
          <b className="bsc-title">{title}</b>
          <p className="bsc-text">{body}</p>
          <div className="bsc-facts">
            <span>Sits under</span><b>{inPod ? "Launch pod, only its members see it" : placeOf(map, point)}</b>
            {point.use ? <><span>Used</span><b>{`In ${point.use} answers this month`}</b></> : null}
          </div>
          {words?.sources.length ? (
            <div className="bsc-sources">
              <span className="bsc-label">Where it came from</span>
              {words.sources.map(([who, channel, excerpt]) => (
                <p key={excerpt}><b>{who}</b> in #{channel}: {excerpt}</p>
              ))}
            </div>
          ) : null}
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          {inPod ? null : mode === "correct" ? (
            <div className="bsc-form">
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title" maxLength={120} />
              <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="What it says" rows={3} maxLength={600} />
              <span className="bsc-hint">Once you correct it, it's yours: the guide won't change it again.</span>
              <div className="bsc-acts">
                <button type="button" className="go" onClick={() => {
                  track("correct_saved");
                  setEdits((last) => ({ ...last, [point.id]: { title: draft.title.trim() || title, body: draft.body.trim() || body } }));
                  setMode(null); setSaid("Saved. The guide answers with your words from now on.");
                }}>Save</button>
                <button type="button" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          ) : mode === "remove" ? (
            <div className="bsc-form">
              <span className="bsc-hint">The guide stops answering from it, and the same posts won't teach it again.</span>
              <div className="bsc-acts">
                <button type="button" className="go" onClick={() => {
                  track("removed");
                  setMap((last) => ({
                    ...last,
                    points: last.points.filter((entry) => entry.id !== point.id),
                    counts: { ...last.counts, learned: last.counts.learned - 1, this_week: last.counts.this_week - (point.fresh ? 1 : 0) },
                  }));
                  setPicked(null); setMode(null); setSaid("Removed. The guide no longer answers from it.");
                }}>Remove</button>
                <button type="button" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="sc-acts">
              <button type="button" onClick={() => { track("correct"); setMode("correct"); setSaid(null); setDraft({ title, body }); }}>Correct</button>
              <button type="button" onClick={() => { track("remove"); setMode("remove"); setSaid(null); }}>Remove</button>
            </div>
          )}
        </>
      );
    }
    // A lesson, a course, a subject or a pod on the map: it, and what was learned under it.
    const course = picked ? map.courses.find((entry) => entry.id === picked) : undefined;
    const lessonOf = picked ? map.courses.flatMap((entry) => entry.lessons.map((lesson) => ({ course: entry, lesson }))).find((entry) => entry.lesson.id === picked) : undefined;
    const subject = picked ? map.subjects.find((entry) => `subject:${entry.name}` === picked) : undefined;
    const pod = picked ? map.pods.find((entry) => entry.id === picked) : undefined;
    if (course || lessonOf || subject || pod) {
      const under = map.points.filter((point) =>
        course ? point.at.kind === "lesson" && course.lessons.some((lesson) => point.at.kind === "lesson" && lesson.id === point.at.id)
          : lessonOf ? point.at.kind === "lesson" && point.at.id === lessonOf.lesson.id
            : subject ? point.at.kind === "subject" && point.at.name === subject.name
              : point.at.kind === "pod");
      const eyebrow = course ? `Course · ${course.lessons.length} lessons` : lessonOf ? `Lesson ${lessonOf.lesson.order} · ${lessonOf.course.name}` : subject ? "A subject · no course teaches it" : "Pod · what it learns stays in it";
      const name = course?.name ?? lessonOf?.lesson.title ?? subject?.name ?? pod?.name ?? "";
      return (
        <>
          <button type="button" className="bsc-back-link" onClick={() => pick(null)}>← What your community knows</button>
          <span className="sc-eyebrow">{eyebrow}</span>
          <b className="bsc-title">{name}</b>
          <p className="bsc-text">{under.length ? `What the community added here, from its own posts:` : "Nothing learned here yet. Notes land here as members answer each other."}</p>
          {under.slice(0, 4).map((point) => row(point.id, point.title ?? "Learned", learnedWhen(point.learned_at, now), point.fresh))}
        </>
      );
    }
    return (
      <>
        <span className="sc-eyebrow">What your community knows</span>
        {said ? <p className="bsc-said" role="status">{said}</p> : null}
        {recent.map((entry) => row(entry.id, entry.title, fromLine(entry.id), true))}
        <span className="bsc-foot">{thisWeek} learned this week · click any node · you can correct any of it</span>
      </>
    );
  })();

  return (
    <div className="bsc" ref={root}>
      <div className="bsc-map" onWheelCapture={(event) => { if ((event.target as Element).closest?.("svg")) event.stopPropagation(); }}>
        <KitApp view="know" part="main">
          <KitBrainMap map={map} size="page" now={now} selectedId={picked}
            onSelect={(id) => pick(id === picked ? null : id)} onClear={() => pick(null)} />
        </KitApp>
      </div>
      <div className="sc-panel bsc-card" aria-live="polite">{card}</div>
    </div>
  );
}
