import { useMemo, useState } from "react";
import type { BrainMap, BrainPoint } from "../../../../../shared/communityBrain";
import { layoutBrain, lensLayout } from "../../../../../shared/communityBrainLayout";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { BRAIN_CENTER_ID, KitBrainMap } from "../../v1/KitBrainMap";
import { KitApp } from "../../v1/kit";
import { buildClubBrain } from "./RealAppPreview";

// The community brain's section (Neil, Nov 25: "no labels, better
// structure, start with one node selected, and each one you pick tells you
// more"). The map is the app's own, as the panels draw it (KitBrainMap,
// size "panel": the clusters and their glow, no words), of the same
// community as the preview at the top. Over it, each dot can be picked. The
// card beside it is a short tour of how the memory works, one node at a
// time, as one real case: Priya's question, Jon's answer, the note it
// became, Dev's 2am answer from it, and you putting it right.

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

// The panel map's own box and lens (KitBrainMap.tsx: PANEL_BOX, PANEL_LENS),
// so the dots picked here sit exactly on the dots drawn.
const BOX = { w: 240, h: 200 };
const LENS = 0.85;

type Step = { id: string; eyebrow: string; title: string; text: string; show?: "sources" | "answer" | "fix" };

const TOUR: Step[] = [
  { id: BRAIN_CENTER_ID, eyebrow: "The Build Club's memory", title: "Everything your community knows, in one place",
    text: "Every dot is something the community knows. The guide answers from it, and you can see all of it. Pick the glowing dot to follow one answer through it." },
  { id: "course:start", eyebrow: "Your courses", title: "Your courses are the frame",
    text: "Start here is one of the big branches. When members work something out about a lesson, it's filed right under that lesson, so the next person on it finds it." },
  { id: "note:founding", eyebrow: "It learns", title: "Monday: a good answer in #general",
    text: "Priya asked what to charge her first members. Jon answered with his own numbers. The guide saved it as a note, filed under Lesson 3, with both posts as its source.", show: "sources" },
  { id: "resource:price", eyebrow: "It answers", title: "Wednesday, 2am: Dev asks his guide",
    text: "“How should I price my first offer?” The guide answered from Jon's note and pointed to Lesson 3. Nobody had to answer the same question twice.", show: "answer" },
  { id: "subject:Growth", eyebrow: "It notices", title: "What no course teaches yet",
    text: "Invitations, referrals, how Jon passed 100 members: none of it is in a course. The guide groups it on its own as Growth, so you can see what to teach next." },
  { id: "note:invite", eyebrow: "You decide", title: "Something not quite right? Fix it",
    text: "Anything it learned can be corrected or removed. Once you correct a note it's yours, and the guide won't change it again. Try it.", show: "fix" },
  { id: "pod:launch", eyebrow: "Pods", title: "Pods keep their own memory",
    text: "What the Launch pod learns stays in the pod, for the people in it. That's the whole memory: it grows every day your members help each other." },
];

export function BrainScene() {
  const [now] = useState(() => Date.now());
  const [map, setMap] = useState(() => sceneBrain(now));
  const [picked, setPicked] = useState<string>(BRAIN_CENTER_ID);
  const [mode, setMode] = useState<"correct" | "remove" | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [draft, setDraft] = useState<Edit>({ title: "", body: "" });
  const [said, setSaid] = useState<string | null>(null);

  // Where each dot is drawn, the same way the panel map places them.
  const spots = useMemo(() => {
    const layout = lensLayout(layoutBrain(map, now), BOX, { power: LENS });
    const at = new Map<string, { x: number; y: number }>();
    at.set(BRAIN_CENTER_ID, layout.center);
    for (const hub of layout.hubs) if (hub.kind !== "course") at.set(hub.key, hub);
    for (const course of layout.courses) at.set(course.key, course);
    for (const lesson of layout.lessons) at.set(lesson.id, lesson);
    for (const point of layout.points) at.set(point.id, point);
    return at;
  }, [map, now]);

  const stepAt = TOUR.findIndex((step) => step.id === picked);
  const next = TOUR.slice(stepAt + 1).find((step) => spots.has(step.id)) ?? (stepAt === -1 ? TOUR.find((step) => spots.has(step.id)) : null);
  const pick = (id: string) => {
    if (id !== picked) track(TOUR.some((step) => step.id === id) ? `tour_${id}` : "pick");
    setPicked(id); setMode(null); setSaid(null);
  };

  const point = map.points.find((entry) => entry.id === picked) ?? null;
  const step = stepAt >= 0 ? TOUR[stepAt] : null;
  const edit = point ? edits[point.id] : undefined;
  const noteTitle = point ? edit?.title ?? point.title ?? "Something the community learned" : "";
  const noteBody = point ? edit?.body ?? NOTES[point.id]?.body ?? "The guide answers from it." : "";

  const sources = (id: string) => {
    const list = NOTES[id]?.sources ?? [];
    return list.length ? (
      <div className="bsc-sources">
        <span className="bsc-label">Where it came from</span>
        {list.map(([who, channel, excerpt]) => <p key={excerpt}><b>{who}</b> in #{channel}: {excerpt}</p>)}
      </div>
    ) : null;
  };

  const fix = point ? (
    mode === "correct" ? (
      <div className="bsc-form">
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title" maxLength={120} />
        <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="What it says" rows={3} maxLength={600} />
        <span className="bsc-hint">Once you correct it, it's yours: the guide won't change it again.</span>
        <div className="bsc-acts">
          <button type="button" className="go" onClick={() => {
            track("correct_saved");
            setEdits((last) => ({ ...last, [point.id]: { title: draft.title.trim() || noteTitle, body: draft.body.trim() || noteBody } }));
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
            setMap((last) => ({ ...last, points: last.points.filter((entry) => entry.id !== point.id) }));
            setPicked(next?.id ?? BRAIN_CENTER_ID); setMode(null); setSaid(null);
          }}>Remove</button>
          <button type="button" onClick={() => setMode(null)}>Cancel</button>
        </div>
      </div>
    ) : (
      <div className="sc-acts">
        <button type="button" onClick={() => { track("correct"); setMode("correct"); setSaid(null); setDraft({ title: noteTitle, body: noteBody }); }}>Correct</button>
        <button type="button" onClick={() => { track("remove"); setMode("remove"); setSaid(null); }}>Remove</button>
      </div>
    )
  ) : null;

  const card = step ? (
    <>
      <span className="sc-eyebrow">{step.eyebrow} · {stepAt + 1} of {TOUR.length}</span>
      <b className="bsc-title">{step.title}</b>
      <p className="bsc-text">{step.text}</p>
      {step.show === "sources" ? sources(step.id) : null}
      {step.show === "answer" ? (
        <div className="bsc-sources">
          <span className="bsc-label">Lesson 3 · Pricing your first offer</span>
          <p>Answers used Jon's note here 6 times this month.</p>
        </div>
      ) : null}
      {step.show === "fix" && point ? (
        <div className="bsc-sources">
          <span className="bsc-label">{edit ? "Corrected by you" : `Learned ${learnedWhen(point.learned_at, now)}`}</span>
          <p><b>{noteTitle}</b>: {noteBody}</p>
        </div>
      ) : null}
      {said ? <p className="bsc-said" role="status">{said}</p> : null}
      {step.show === "fix" ? fix : null}
    </>
  ) : point ? (
    <>
      <span className="sc-eyebrow">{edit ? "Corrected by you" : "Learned"} · {learnedWhen(point.learned_at, now)}</span>
      <b className="bsc-title">{noteTitle}</b>
      <p className="bsc-text">{noteBody}</p>
      <div className="bsc-facts"><span>Sits under</span><b>{placeOf(map, point)}</b></div>
      {sources(point.id)}
      {said ? <p className="bsc-said" role="status">{said}</p> : null}
      {point.at.kind === "pod" ? null : fix}
    </>
  ) : (
    <>
      <span className="sc-eyebrow">The Build Club's memory</span>
      <b className="bsc-title">{map.courses.flatMap((course) => course.lessons).find((lesson) => lesson.id === picked)?.title
        ?? map.courses.find((course) => course.id === picked)?.name ?? map.subjects.find((entry) => `subject:${entry.name}` === picked)?.name ?? "The Build Club"}</b>
      {(() => {
        const course = map.courses.find((entry) => entry.id === picked);
        const under = map.points.filter((entry) => entry.at.kind === "lesson"
          ? (entry.at.id === picked || Boolean(course?.lessons.some((lesson) => entry.at.kind === "lesson" && lesson.id === entry.at.id)))
          : entry.at.kind === "subject" ? `subject:${entry.at.name}` === picked : false);
        return under.length ? (
          <div className="bsc-sources">
            <span className="bsc-label">{under.length} {under.length === 1 ? "thing" : "things"} learned here, from members' posts</span>
            {under.slice(0, 4).map((entry) => <p key={entry.id}><button type="button" className="bsc-link" onClick={() => pick(entry.id)}>{edits[entry.id]?.title ?? entry.title}</button></p>)}
          </div>
        ) : <p className="bsc-text">Nothing learned here yet. Notes land here as members answer each other.</p>;
      })()}
    </>
  );

  const ring = (id: string | undefined, className: string) => {
    const at = id ? spots.get(id) : undefined;
    return at ? <circle className={className} cx={at.x} cy={at.y} r={id === BRAIN_CENTER_ID ? 9 : 6} /> : null;
  };

  return (
    <div className="bsc">
      <div className="bsc-map">
        <KitApp view="know" part="main">
          <KitBrainMap map={map} size="panel" now={now} />
        </KitApp>
        <svg className="bsc-hits" viewBox={`0 0 ${BOX.w} ${BOX.h}`} aria-label="Pick a dot">
          {ring(picked, "bsc-on")}
          {next ? ring(next.id, "bsc-next") : null}
          {[...spots].map(([id, at]) => (
            <circle key={id} className="bsc-hit" cx={at.x} cy={at.y} r={id === BRAIN_CENTER_ID ? 10 : 5.5}
              role="button" tabIndex={0} aria-label={TOUR.find((entry) => entry.id === id)?.title ?? "A dot on the map"}
              onClick={() => pick(id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(id); } }} />
          ))}
        </svg>
      </div>
      <div className="sc-panel bsc-card" aria-live="polite">
        {card}
        <div className="bsc-nav">
          {TOUR.map((entry, index) => (
            <button key={entry.id} type="button" aria-label={`Step ${index + 1}: ${entry.title}`} className={index === stepAt ? "on" : ""} onClick={() => pick(entry.id)} />
          ))}
          {next ? <button type="button" className="bsc-nextbtn" onClick={() => pick(next.id)}>Next: the glowing dot →</button>
            : <button type="button" className="bsc-nextbtn" onClick={() => pick(BRAIN_CENTER_ID)}>Start again</button>}
        </div>
      </div>
    </div>
  );
}
