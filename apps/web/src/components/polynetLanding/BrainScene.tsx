import { useState } from "react";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";

// The community brain's section (Neil, Nov 25: "simpler: very few nodes, a
// label only on the main node of each tree, and people select the branches
// to see what's there"). The same community as the preview at the top, drawn
// as the app's brain is: the community in the middle, its courses and the
// subjects it learned on its own as branches, and on each branch the things
// members worked out, each saved from their own posts. Only the branches
// are named. A picked dot opens in the card beside it: what it says, where
// it came from, and Correct and Remove, which work here as in the app.

type Note = { id: string; title: string; body: string; under: string; days: number; uses: number; sources: Array<[who: string, channel: string, excerpt: string]> };
type Branch = { id: string; name: string; kind: "course" | "subject"; about: string; x: number; y: number; notes: Note[] };

export const BRANCHES: Branch[] = [
  { id: "start", name: "Start here", kind: "course", x: -170, y: -30,
    about: "What members work out about a lesson is filed under it, so the next person on that lesson finds it.",
    notes: [
      { id: "founding", title: "Founding-member pricing", under: "Lesson 3 · Pricing your first offer", days: 1, uses: 6,
        body: "Offer the first ten members a lower price for life, and say when it ends. Members here have used $29 to $49.",
        sources: [["Priya", "general", "Thinking of a founding price, $29 for life for the first ten?"], ["Jon", "general", "Mine started at $39 and I raised it after the first ten."]] },
      { id: "onePrice", title: "One price beats three tiers at the start", under: "Lesson 3 · Pricing your first offer", days: 12, uses: 4,
        body: "Start with one price. Tiers can come once you know what people pay for.",
        sources: [["Maya", "general", "I dropped my three tiers and sales went up."]] },
      { id: "askedHelp", title: "Start with people who asked you for help", under: "Lesson 4 · Your first ten customers", days: 2, uses: 5,
        body: "Your first members are the people who already ask you for help. List ten of them before you write a sales page.",
        sources: [["Dev", "general", "My first three were people who'd DM'd me questions for months."]] },
      { id: "dms", title: "Ten DMs, not one big post", under: "Lesson 4 · Your first ten customers", days: 9, uses: 3,
        body: "Ten personal messages bring more first customers than one big post.",
        sources: [["Kai", "wins", "Ten DMs, four yeses. The big post got one like."]] },
    ] },
  { id: "growth", name: "Growth", kind: "subject", x: 150, y: -110,
    about: "No course teaches this yet. The guide grouped it on its own from what members shared, so you can see what to teach next.",
    notes: [
      { id: "invite", title: "Invitations that work", under: "Growth", days: 0, uses: 7,
        body: "Personal invitations beat posts. Name why you thought of them, say what's inside in one line, and give one date to show up.",
        sources: [["Jon", "wins", "Sent my invitation to 40 people from my newsletter. 11 joined in two days."], ["Priya", "general", "The personal ones worked, the group post got nothing."]] },
      { id: "hundred", title: "How Jon passed 100 members", under: "Growth", days: 1, uses: 2,
        body: "Six weeks: one invitation a day, a weekly call, and every new member welcomed by name.",
        sources: [["Jon", "wins", "100 members today. Six weeks, one invitation a day."]] },
      { id: "referral", title: "Ask each customer who else needs this", under: "Growth", days: 15, uses: 1,
        body: "After someone joins, ask who else they know with the same problem. Half the referrals here came that way.",
        sources: [["Amir", "wins", "Asked my first five who else should join. Got three names each."]] },
    ] },
  { id: "calls", name: "Calls", kind: "subject", x: 140, y: 125,
    about: "Learned on its own from the community's calls: how they run, and what to do when they don't.",
    notes: [
      { id: "friday", title: "How the Friday call runs", under: "Calls", days: 40, uses: 3,
        body: "Thirty minutes: one member shares, everyone brings one thing they're stuck on, and the recording goes under the course.",
        sources: [["Maya", "general", "Friday format: one share, then hot seats. Recording after."]] },
      { id: "noshow", title: "What to do when nobody shows up", under: "Calls", days: 5, uses: 1,
        body: "Record a short version anyway and post it. Next week, remind people the day before and the hour before.",
        sources: [["Amir", "general", "Nobody came to my first call. Recorded it anyway, 4 people watched it."]] },
      { id: "record", title: "Where call recordings live", under: "Calls", days: 22, uses: 2,
        body: "Recordings go under the course they belong to, with a two-line summary pinned in the channel.",
        sources: [["Hana", "general", "Found the recording under the course, thanks!"]] },
    ] },
  { id: "launch", name: "Launch week", kind: "course", x: -120, y: 140,
    about: "Members who launched left what worked under its lessons.",
    notes: [
      { id: "headline", title: "Launch post headlines that worked", under: "Lesson 2 · The launch post", days: 3, uses: 2,
        body: "Headlines that worked here say the result, then who it's for. Short beats clever.",
        sources: [["Hana", "launch-pod", "Changed my headline to the result first and sign-ups doubled."]] },
      { id: "onepage", title: "What goes on a one-page offer", under: "Lesson 1 · A one-page offer", days: 18, uses: 1,
        body: "Who it's for, the one result, what's inside, the price, and one way to join. Nothing else.",
        sources: [["Jon", "general", "My page is five lines now and it converts better."]] },
    ] },
];

const CENTER = "center";
const W = 600, H = 460, CX = 300, CY = 230;

function when(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function track(action: string) {
  captureProductAnalyticsEvent("brain_scene_used", { action });
}

// Each branch's dots fan out away from the middle.
function leafSpots(branch: Branch): Array<{ x: number; y: number }> {
  const out = Math.atan2(branch.y, branch.x);
  const n = branch.notes.length;
  return branch.notes.map((_, index) => {
    const a = out + (index - (n - 1) / 2) * 0.62;
    return { x: CX + branch.x + Math.cos(a) * 62, y: CY + branch.y + Math.sin(a) * 62 };
  });
}

type Edit = { title: string; body: string };

function onKey(go: () => void) {
  return (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); }
  };
}

export function BrainScene() {
  const [branches, setBranches] = useState(BRANCHES);
  const [picked, setPicked] = useState<string>(CENTER);
  const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState<"correct" | "remove" | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [draft, setDraft] = useState<Edit>({ title: "", body: "" });
  const [said, setSaid] = useState<string | null>(null);

  const pick = (id: string) => {
    if (id !== picked) track(id === CENTER ? "center" : branches.some((entry) => entry.id === id) ? "branch" : "note");
    setTouched(true); setPicked(id); setMode(null); setSaid(null);
  };

  const all = branches.flatMap((entry) => entry.notes.map((note) => ({ branch: entry, note })));
  const found = all.find((entry) => entry.note.id === picked) ?? null;
  const branch = branches.find((entry) => entry.id === picked) ?? found?.branch ?? null;
  const fresh = all.filter((entry) => entry.note.days <= 7).length;

  const card = (() => {
    if (found) {
      const { note } = found;
      const edit = edits[note.id];
      const title = edit?.title ?? note.title;
      const body = edit?.body ?? note.body;
      return (
        <>
          <button type="button" className="bsc-crumb-btn" onClick={() => pick(found.branch.id)}>← {found.branch.name}</button>
          <span className="sc-eyebrow">{edit ? "Corrected by you" : "Learned"} · {when(note.days)}</span>
          <b className="bsc-title">{title}</b>
          <p className="bsc-text">{body}</p>
          <div className="bsc-facts">
            <span>Sits under</span><b>{note.under}</b>
            <span>Used</span><b>In {note.uses} {note.uses === 1 ? "answer" : "answers"} this month</b>
          </div>
          <div className="bsc-sources">
            <span className="bsc-label">Where it came from</span>
            {note.sources.map(([who, channel, excerpt]) => <p key={excerpt}><b>{who}</b> in #{channel}: {excerpt}</p>)}
          </div>
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          {mode === "correct" ? (
            <div className="bsc-form">
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title" maxLength={120} />
              <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="What it says" rows={3} maxLength={600} />
              <span className="bsc-hint">Once you correct it, it's yours: the guide won't change it again.</span>
              <div className="bsc-acts">
                <button type="button" className="go" onClick={() => {
                  track("correct_saved");
                  setEdits((last) => ({ ...last, [note.id]: { title: draft.title.trim() || title, body: draft.body.trim() || body } }));
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
                  setBranches((last) => last.map((entry) => ({ ...entry, notes: entry.notes.filter((other) => other.id !== note.id) })));
                  setPicked(found.branch.id); setMode(null); setSaid("Removed. The guide no longer answers from it.");
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
    if (branch) {
      return (
        <>
          <button type="button" className="bsc-crumb-btn" onClick={() => pick(CENTER)}>← The Build Club</button>
          <span className="sc-eyebrow">{branch.kind === "course" ? "A course" : "Learned on its own"}</span>
          <b className="bsc-title">{branch.name}</b>
          <p className="bsc-text">{branch.about}</p>
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          <div className="bsc-sources">
            <span className="bsc-label">{branch.notes.length} {branch.notes.length === 1 ? "thing" : "things"} members worked out</span>
            {branch.notes.map((note) => (
              <p key={note.id}><button type="button" className="bsc-link" onClick={() => pick(note.id)}>{edits[note.id]?.title ?? note.title}</button></p>
            ))}
          </div>
        </>
      );
    }
    return (
      <>
        <span className="sc-eyebrow">The Build Club's memory</span>
        <b className="bsc-title">Everything your community knows</b>
        <p className="bsc-text">Each branch is a course, or a subject the guide grouped on its own. Each dot on it is something members worked out, saved from their own posts. The guide answers from all of it. Pick a branch or a dot.</p>
        <div className="bsc-facts"><span>Learned</span><b>{all.length} things · {fresh} this week</b></div>
      </>
    );
  })();

  const lit = branch?.id ?? null;
  return (
    <div className="bsc">
      <svg className="bsc-net" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="The Build Club's memory: pick the middle, a branch or a dot">
        <defs>
          <radialGradient id="bscGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#A78BFA" stopOpacity=".55" /><stop offset="1" stopColor="#A78BFA" stopOpacity="0" /></radialGradient>
        </defs>
        {branches.map((entry) => {
          const hx = CX + entry.x, hy = CY + entry.y;
          return (
            <g key={entry.id} className={lit === entry.id ? "bsc-branch on" : lit ? "bsc-branch dim" : "bsc-branch"}>
              <path className="bsc-trunk" d={`M${CX} ${CY} Q${CX + entry.x * 0.55 + entry.y * 0.18} ${CY + entry.y * 0.55 - entry.x * 0.18} ${hx} ${hy}`} />
              {leafSpots(entry).map((spot, index) => <line key={index} className="bsc-twig" x1={hx} y1={hy} x2={spot.x} y2={spot.y} />)}
            </g>
          );
        })}
        <circle className="bsc-glow" cx={CX} cy={CY} r={58} fill="url(#bscGlow)" />
        {branches.map((entry) => {
          const hx = CX + entry.x, hy = CY + entry.y;
          const spots = leafSpots(entry);
          return (
            <g key={`n-${entry.id}`} className={lit && lit !== entry.id ? "bsc-branch dim" : "bsc-branch"}>
              {entry.notes.map((note, index) => (
                <g key={note.id} className={picked === note.id ? "bsc-dot on" : "bsc-dot"} role="button" tabIndex={0} aria-label={note.title}
                  onClick={() => pick(note.id)} onKeyDown={onKey(() => pick(note.id))}>
                  <circle className="bsc-hit" cx={spots[index].x} cy={spots[index].y} r={13} />
                  {!touched && note.id === "founding" ? <circle className="bsc-next" cx={spots[index].x} cy={spots[index].y} r={7} /> : null}
                  <circle className={note.days <= 7 ? "bsc-leaf new" : "bsc-leaf"} cx={spots[index].x} cy={spots[index].y} r={note.days <= 7 ? 4.6 : 3.8} />
                  {picked === note.id ? <circle className="bsc-ring" cx={spots[index].x} cy={spots[index].y} r={9} /> : null}
                </g>
              ))}
              <g className={picked === entry.id ? "bsc-hub on" : "bsc-hub"} role="button" tabIndex={0} aria-label={entry.name}
                onClick={() => pick(entry.id)} onKeyDown={onKey(() => pick(entry.id))}>
                <circle className="bsc-hit" cx={hx} cy={hy} r={16} />
                <circle className="bsc-hubdot" cx={hx} cy={hy} r={7.5} />
                {picked === entry.id ? <circle className="bsc-ring" cx={hx} cy={hy} r={13} /> : null}
                <text className="bsc-name" x={hx} y={hy + (entry.y < 0 ? -17 : 28)} textAnchor="middle">{entry.name}</text>
              </g>
            </g>
          );
        })}
        <g className={picked === CENTER ? "bsc-core on" : "bsc-core"} role="button" tabIndex={0} aria-label="The Build Club"
          onClick={() => pick(CENTER)} onKeyDown={onKey(() => pick(CENTER))}>
          <circle className="bsc-hit" cx={CX} cy={CY} r={20} />
          <circle className="bsc-corering" cx={CX} cy={CY} r={13} />
          <circle className="bsc-coredot" cx={CX} cy={CY} r={7} />
          <text className="bsc-name core" x={CX} y={CY + 34} textAnchor="middle">The Build Club</text>
        </g>
      </svg>
      <div className="sc-panel bsc-card" aria-live="polite">{card}</div>
    </div>
  );
}
