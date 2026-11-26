import { useState } from "react";
import { Library } from "lucide-react";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";

// The community brain's section (Neil, Nov 25: a graph like the one in his
// workspace, uneven and grown rather than drawn with a compass, and the
// different kinds of memory each with its own look). The same community as
// the preview at the top. The looks are the app's own (kit.module.css,
// .brain-*): courses and their lessons white; the notes the guide wrote
// from helpful posts grey; new this week violet; notes saved from
// conversations with the guide a softer blue; what a host wrote a hollow
// ring; notes the guide often answers with together joined by a faint
// thread. Pods are left to their own page (Neil, Nov 25). Only the middle and
// each cluster's main dot are named. The card starts with the kinds as a
// key: pick one and its dots light. Pick a cluster or a dot to open it.

export type Kind = "course" | "learned" | "talk" | "fresh" | "taught";
type Source = [who: string, channel: string, excerpt: string];
// Where a note came from, as Knowledge says it (KitKnowledgeNotes.tsx noteOrigin).
type Origin = "guide" | "ask" | "tag" | "host";
type Note = { id: string; title: string; body: string; under: string; days: number; uses: number; taught?: boolean; origin?: Origin; sources: Source[] };
type Dot = { id: string; x: number; y: number; from: string; kind: "lesson" | "note"; title?: string; note?: Note };
type Hub = { id: string; name: string; kind: "course" | "subject"; x: number; y: number; bend: number; about: string; side?: "left" };

const W = 680, H = 500;
const C = { x: 300, y: 250 };

export const HUBS: Hub[] = [
  { id: "start", name: "Start here", kind: "course", x: 158, y: 168, bend: 0.22, about: "A course you built. What members work out about a lesson is filed under it, so the next person on that lesson finds it." },
  { id: "launch", name: "Launch week", kind: "course", x: 196, y: 388, bend: -0.18, side: "left", about: "A course you built. Members who launched left what worked under its lessons." },
  { id: "growth", name: "Growth", kind: "subject", x: 498, y: 112, bend: -0.26, about: "No course teaches this yet. The guide grouped it on its own from what members shared, so you can see what to teach next." },
  { id: "calls", name: "Calls", kind: "subject", x: 526, y: 312, bend: 0.2, about: "Learned on its own from the community's calls: how they run, and what to do when they don't." },
];

const n = (id: string, title: string, under: string, days: number, uses: number, body: string, sources: Source[], taught = false): Note =>
  ({ id, title, under, days, uses, body, sources, taught });

// Hand-placed so each cluster has its own size and lean.
export const DOTS: Dot[] = [
  // Start here: four lessons in a loose ring, two with what members added.
  { id: "l-welcome", x: 118, y: 140, from: "start", kind: "lesson", title: "Lesson 1 · Welcome to the club" },
  { id: "l-offer", x: 150, y: 124, from: "start", kind: "lesson", title: "Lesson 2 · Picking your first offer" },
  { id: "l-price", x: 196, y: 146, from: "start", kind: "lesson", title: "Lesson 3 · Pricing your first offer" },
  { id: "l-first10", x: 128, y: 204, from: "start", kind: "lesson", title: "Lesson 4 · Your first ten customers" },
  { id: "founding", x: 236, y: 118, from: "l-price", kind: "note", note: n("founding", "Founding-member pricing", "Lesson 3 · Pricing your first offer", 1, 6,
    "Offer the first ten members a lower price for life, and say when it ends. Members here have used $29 to $49.",
    [["Priya", "general", "Thinking of a founding price, $29 for life for the first ten?"], ["Jon", "general", "Mine started at $39 and I raised it after the first ten."]]) },
  { id: "onePrice", x: 222, y: 172, from: "l-price", kind: "note", note: n("onePrice", "One price beats three tiers at the start", "Lesson 3 · Pricing your first offer", 12, 4,
    "Start with one price. Tiers can come once you know what people pay for.", [["Maya", "general", "I dropped my three tiers and sales went up."]]) },
  { id: "askedHelp", x: 88, y: 222, from: "l-first10", kind: "note", note: n("askedHelp", "Start with people who asked you for help", "Lesson 4 · Your first ten customers", 2, 5,
    "Your first members are the people who already ask you for help. List ten of them before you write a sales page.",
    [["Dev", "general", "My first three were people who'd DM'd me questions for months."]]) },
  { id: "dms", x: 120, y: 246, from: "l-first10", kind: "note", note: n("dms", "Ten DMs, not one big post", "Lesson 4 · Your first ten customers", 9, 3,
    "Ten personal messages bring more first customers than one big post.", [["Kai", "wins", "Ten DMs, four yeses. The big post got one like."]]) },
  { id: "talk-tiers", x: 262, y: 200, from: "l-price", kind: "note", note: { ...n("talk-tiers", "One price at $49 for the first ten", "Lesson 3 · Pricing your first offer", 4, 2,
    "Dev weighed one price against two tiers with the guide and went with one price, $49, for his first ten members.",
    [["Dev", "guide", "Should I do one price or two tiers for my first offer?"]]), origin: "ask" } },
  // Launch week: three lessons, smaller.
  { id: "l-page", x: 162, y: 404, from: "launch", kind: "lesson", title: "Lesson 1 · A one-page offer" },
  { id: "l-post", x: 214, y: 424, from: "launch", kind: "lesson", title: "Lesson 2 · The launch post" },
  { id: "l-after", x: 226, y: 370, from: "launch", kind: "lesson", title: "Lesson 3 · The week after launch" },
  { id: "headline", x: 236, y: 458, from: "l-post", kind: "note", note: n("headline", "Launch post headlines that worked", "Lesson 2 · The launch post", 3, 2,
    "Headlines that worked here say the result, then who it's for. Short beats clever.", [["Hana", "general", "Changed my headline to the result first and sign-ups doubled."]]) },
  { id: "onepage", x: 128, y: 430, from: "l-page", kind: "note", note: n("onepage", "What goes on a one-page offer", "Lesson 1 · A one-page offer", 18, 1,
    "Who it's for, the one result, what's inside, the price, and one way to join. Nothing else.", [["Jon", "general", "My page is five lines now and it converts better."]]) },
  { id: "talk-checklist", x: 264, y: 398, from: "l-after", kind: "note", note: { ...n("talk-checklist", "Launch-day checklist", "Lesson 3 · The week after launch", 6, 3,
    "Post at 9am, pin it, reply to every comment in the first hour, and send the founding-price DMs the same day.",
    [["Hana", "general", "@guide what should I do on launch day itself?"]]), origin: "tag" } },
  // Growth: learned on its own, looser, with one thing you taught it.
  { id: "invite", x: 470, y: 66, from: "growth", kind: "note", note: n("invite", "Invitations that work", "Growth", 0, 7,
    "Personal invitations beat posts. Name why you thought of them, say what's inside in one line, and give one date to show up.",
    [["Jon", "wins", "Sent my invitation to 40 people from my newsletter. 11 joined in two days."], ["Priya", "general", "The personal ones worked, the group post got nothing."]]) },
  { id: "hundred", x: 548, y: 82, from: "growth", kind: "note", note: n("hundred", "How Jon passed 100 members", "Growth", 1, 2,
    "Six weeks: one invitation a day, a weekly call, and every new member welcomed by name.", [["Jon", "wins", "100 members today. Six weeks, one invitation a day."]]) },
  { id: "referral", x: 556, y: 140, from: "growth", kind: "note", note: n("referral", "Ask each customer who else needs this", "Growth", 15, 1,
    "After someone joins, ask who else they know with the same problem.", [["Amir", "wins", "Asked my first five who else should join. Got three names each."]]) },
  { id: "template", x: 452, y: 132, from: "growth", kind: "note", note: n("template", "Our invitation template", "Growth", 13, 4,
    "Use the three-line invitation in the welcome post. Always add the date of the next call.", [], true) },
  { id: "dmscript", x: 500, y: 58, from: "growth", kind: "note", note: n("dmscript", "The follow-up DM", "Growth", 21, 1,
    "If someone doesn't answer, follow up once after three days, then leave it.", [["Kai", "general", "One follow-up got me two more yeses."]]) },
  // Calls: learned on its own.
  { id: "friday", x: 566, y: 290, from: "calls", kind: "note", note: n("friday", "How the Friday call runs", "Calls", 40, 3,
    "Thirty minutes: one member shares, everyone brings one thing they're stuck on, and the recording goes under the course.",
    [["Maya", "general", "Friday format: one share, then hot seats. Recording after."]]) },
  { id: "noshow", x: 548, y: 352, from: "calls", kind: "note", note: n("noshow", "What to do when nobody shows up", "Calls", 5, 1,
    "Record a short version anyway and post it. Next week, remind people the day before and the hour before.",
    [["Amir", "general", "Nobody came to my first call. Recorded it anyway, 4 people watched it."]]) },
  { id: "record", x: 500, y: 344, from: "calls", kind: "note", note: n("record", "Where call recordings live", "Calls", 22, 2,
    "Recordings go under the course they belong to, with a two-line summary pinned in the channel.", [["Hana", "general", "Found the recording under the course, thanks!"]]) },
  { id: "cameras", x: 574, y: 330, from: "calls", kind: "note", note: n("cameras", "Cameras on for hot seats", "Calls", 30, 2,
    "On the Friday call, whoever is in the hot seat has their camera on. Everyone else can choose.", [], true) },
  { id: "talk-consent", x: 468, y: 292, from: "calls", kind: "note", note: { ...n("talk-consent", "Ask before you record", "Calls", 11, 1,
    "Ask once at the start whether everyone's fine being recorded, and keep hot seats off the recording if anyone isn't.",
    [["Amir", "guide", "Do I need to ask before recording the call?"]]), origin: "ask" } },
];

// Notes the guide often answers with together.
const THREADS: Array<[string, string]> = [["founding", "invite"], ["askedHelp", "hundred"]];

function kindOf(dot: Dot): Kind {
  if (dot.kind === "lesson") return "course";
  if (dot.note?.taught) return "taught";
  if (dot.note?.origin === "ask" || dot.note?.origin === "tag") return "talk";
  return (dot.note?.days ?? 99) <= 7 ? "fresh" : "learned";
}

export const KINDS: Array<{ kind: Kind; name: string; line: string }> = [
  { kind: "course", name: "Courses and lessons", line: "The frame you built" },
  { kind: "learned", name: "Notes the guide wrote", line: "From helpful posts, filed where they belong" },
  { kind: "talk", name: "Saved from conversations", line: "What got worked out when someone asked the guide" },
  { kind: "fresh", name: "New this week", line: "Notes still glowing" },
  { kind: "taught", name: "Notes you wrote", line: "Kept in your words" },
];

function when(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function track(action: string) {
  captureProductAnalyticsEvent("brain_scene_used", { action });
}

function trunk(hub: Hub): string {
  const mx = (C.x + hub.x) / 2, my = (C.y + hub.y) / 2;
  const dx = hub.x - C.x, dy = hub.y - C.y;
  return `M${C.x} ${C.y} Q${(mx - dy * hub.bend).toFixed(1)} ${(my + dx * hub.bend).toFixed(1)} ${hub.x} ${hub.y}`;
}

function onKey(go: () => void) {
  return (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); }
  };
}

type Edit = { title: string; body: string };

export function BrainScene(props: { start?: { picked?: string; kind?: Kind } } = {}) {
  const [dots, setDots] = useState(DOTS);
  const [picked, setPicked] = useState<string | null>(props.start?.picked ?? null);
  const [kind, setKind] = useState<Kind | null>(props.start?.kind ?? null);
  const [mode, setMode] = useState<"correct" | "remove" | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [draft, setDraft] = useState<Edit>({ title: "", body: "" });
  const [said, setSaid] = useState<string | null>(null);

  const at = new Map<string, { x: number; y: number }>([["center", C], ...HUBS.map((hub) => [hub.id, hub] as const), ...dots.map((dot) => [dot.id, dot] as const)]);
  const ownerOf = (dot: Dot): Hub | undefined => HUBS.find((entry) => entry.id === dot.from) ?? HUBS.find((entry) => entry.id === dots.find((d) => d.id === dot.from)?.from);
  const inCluster = (id: string) => dots.filter((entry) => ownerOf(entry)?.id === id);
  const pick = (id: string | null) => {
    if (id && id !== picked) track(HUBS.some((hub) => hub.id === id) ? "cluster" : "dot");
    setPicked(id); setKind(null); setMode(null); setSaid(null);
  };
  const showKind = (next: Kind) => { track(`kind_${next}`); setKind(kind === next ? null : next); setPicked(null); setSaid(null); };

  const dot = picked ? dots.find((entry) => entry.id === picked) ?? null : null;
  const hub = picked ? HUBS.find((entry) => entry.id === picked) ?? (dot ? ownerOf(dot) : undefined) ?? null : null;

  const card = (() => {
    if (dot?.note) {
      const note = dot.note;
      const edit = edits[dot.id];
      const title = edit?.title ?? note.title;
      const body = edit?.body ?? note.body;
      return (
        <>
          {hub ? <button type="button" className="bsc-crumb-btn" onClick={() => pick(hub.id)}>← {hub.name}</button> : null}
          <span className="sc-eyebrow">Note · {edit ? "corrected by you" : note.taught ? "written by you" : note.origin === "ask" ? "saved from a conversation with the guide" : note.origin === "tag" ? "saved from a conversation in a channel" : `written by the guide from ${note.sources.length} ${note.sources.length === 1 ? "post" : "posts"}`} · {when(note.days)}</span>
          <b className="bsc-title">{title}</b>
          <p className="bsc-text">{body}</p>
          <div className="bsc-facts">
            <span>Sits under</span><b>{note.under}</b>
            <span>Used</span><b>In {note.uses} {note.uses === 1 ? "answer" : "answers"} this month</b>
          </div>
          {note.sources.length ? (
            <div className="bsc-sources">
              <span className="bsc-label">Where it came from</span>
              {note.sources.map(([who, channel, excerpt]) => <p key={excerpt}><b>{who}</b> {channel === "guide" ? "asked the guide" : `in #${channel}`}: {excerpt}</p>)}
            </div>
          ) : <div className="bsc-sources"><span className="bsc-label">You wrote it for the guide. It answers with your words.</span></div>}
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          {mode === "correct" ? (
            <div className="bsc-form">
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title" maxLength={120} />
              <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-label="What it says" rows={3} maxLength={600} />
              <span className="bsc-hint">Once you correct it, it's yours: the guide won't change it again.</span>
              <div className="bsc-acts">
                <button type="button" className="go" onClick={() => {
                  track("correct_saved");
                  setEdits((last) => ({ ...last, [dot.id]: { title: draft.title.trim() || title, body: draft.body.trim() || body } }));
                  setMode(null); setSaid("Saved. The guide answers with your words from now on.");
                }}>Save</button>
                <button type="button" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          ) : mode === "remove" ? (
            <div className="bsc-form">
              <span className="bsc-hint">The guide stops answering from it{note.taught ? "" : ", and the same posts won't teach it again"}.</span>
              <div className="bsc-acts">
                <button type="button" className="go" onClick={() => {
                  track("removed");
                  setDots((last) => last.filter((entry) => entry.id !== dot.id));
                  setPicked(hub?.id ?? null); setMode(null); setSaid("Removed. The guide no longer answers from it.");
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
    if (dot) {
      const under = dots.filter((entry) => entry.from === dot.id && entry.note);
      return (
        <>
          {hub ? <button type="button" className="bsc-crumb-btn" onClick={() => pick(hub.id)}>← {hub.name}</button> : null}
          <span className="sc-eyebrow">A lesson in {hub?.name}</span>
          <b className="bsc-title">{dot.title?.replace(/^Lesson \d+ · /, "")}</b>
          <p className="bsc-text">{under.length ? "What members worked out about this lesson, filed right here:" : "Nothing filed here yet. It lands here as members answer each other about this lesson."}</p>
          {under.length ? (
            <div className="bsc-sources">
              {under.map((entry) => <p key={entry.id}><button type="button" className="bsc-link" onClick={() => pick(entry.id)}>{edits[entry.id]?.title ?? entry.note!.title}</button></p>)}
            </div>
          ) : null}
        </>
      );
    }
    if (hub) {
      const list = inCluster(hub.id).filter((entry) => entry.note);
      return (
        <>
          <button type="button" className="bsc-crumb-btn" onClick={() => pick(null)}>← What your community remembers</button>
          <span className="sc-eyebrow">{hub.kind === "course" ? "A course" : "Learned on its own"}</span>
          <b className="bsc-title">{hub.name}</b>
          <p className="bsc-text">{hub.about}</p>
          {said ? <p className="bsc-said" role="status">{said}</p> : null}
          <div className="bsc-sources">
            <span className="bsc-label">{list.length} {list.length === 1 ? "thing" : "things"} it remembers here</span>
            {list.map((entry) => <p key={entry.id}><button type="button" className="bsc-link" onClick={() => pick(entry.id)}>{edits[entry.id]?.title ?? entry.note!.title}</button></p>)}
          </div>
        </>
      );
    }
    const counts = new Map<Kind, number>();
    for (const entry of dots) counts.set(kindOf(entry), (counts.get(kindOf(entry)) ?? 0) + 1);
    return (
      <>
        <span className="sc-eyebrow">The Build Club's memory</span>
        <b className="bsc-title">What your community remembers</b>
        <p className="bsc-text">Your courses are the frame. Around them, the guide keeps notes: what it learns from posts, what gets worked out in conversations, and what you write. It answers from all of it. Pick a kind, or any dot.</p>
        <div className="bsc-kinds" role="group" aria-label="Kinds of memory">
          {KINDS.map((entry) => (
            <button key={entry.kind} type="button" className={kind === entry.kind ? "bsc-kind on" : "bsc-kind"} aria-pressed={kind === entry.kind} onClick={() => showKind(entry.kind)}>
              <i className={`bsc-swatch k-${entry.kind}`} />
              <span><b>{entry.name}</b><small>{entry.line}</small></span>
              <em>{counts.get(entry.kind) ?? 0}</em>
            </button>
          ))}
        </div>
      </>
    );
  })();

  const lit = (entry: Dot) => kind ? kindOf(entry) === kind : hub ? ownerOf(entry)?.id === hub.id : true;
  const hubLit = (entry: Hub) => kind ? kind === "course" && entry.kind === "course" : hub ? hub.id === entry.id : true;
  const fresh = dots.filter((entry) => kindOf(entry) === "fresh");
  return (
    <div className="bsc">
      {/* The network inside the app's own window, as on the brain page in
          Knowledge (Neil, Nov 26): the same graph, a little smaller. */}
      <div className="bsc-win">
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head"><span className="rpw-ch"><Library size={15} aria-hidden="true" />Knowledge</span><span className="msc-mode">Brain</span></div>
            <div className="rpw-body bsc-body">
      <svg className="bsc-net" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="The Build Club's memory: pick a kind, a cluster or a dot">
        <defs>
          <radialGradient id="bscGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#A78BFA" stopOpacity=".55" /><stop offset="1" stopColor="#A78BFA" stopOpacity="0" /></radialGradient>
        </defs>
        {HUBS.map((entry) => (
          <path key={`t-${entry.id}`} className={["bsc-trunk", hubLit(entry) ? "" : "dim", hub?.id === entry.id ? "on" : ""].filter(Boolean).join(" ")} d={trunk(entry)} />
        ))}
        {/* Now and then, a signal out to something new. */}
        {HUBS.filter((entry) => fresh.some((f) => ownerOf(f)?.id === entry.id)).map((entry, index) => (
          <path key={`s-${entry.id}`} className="bsc-signal" pathLength={1} d={trunk(entry)} style={{ animationDelay: `${index * 2.2}s` }} />
        ))}
        {THREADS.map(([a, b]) => {
          const p = at.get(a), q = at.get(b);
          if (!p || !q) return null;
          return <path key={`${a}-${b}`} className={kind || hub ? "bsc-thread dim" : "bsc-thread"} d={`M${p.x} ${p.y} Q${(p.x + q.x) / 2} ${Math.min(p.y, q.y) - 70} ${q.x} ${q.y}`} />;
        })}
        {dots.map((entry) => {
          const from = at.get(entry.from);
          return from ? <line key={`w-${entry.id}`} className={lit(entry) ? "bsc-twig" : "bsc-twig dim"} x1={from.x} y1={from.y} x2={entry.x} y2={entry.y} /> : null;
        })}
        <circle className="bsc-glow" cx={C.x} cy={C.y} r={62} fill="url(#bscGlow)" />
        {dots.map((entry) => {
          const k = kindOf(entry);
          const on = picked === entry.id;
          const r = entry.kind === "lesson" ? 4.2 : k === "fresh" ? 4.8 : 3.6;
          return (
            <g key={entry.id} className={["bsc-dot", lit(entry) ? "" : "dim", on ? "on" : ""].filter(Boolean).join(" ")} role="button" tabIndex={0}
              aria-label={entry.note?.title ?? entry.title ?? "A dot"} onClick={() => pick(entry.id)} onKeyDown={onKey(() => pick(entry.id))}>
              <circle className="bsc-hit" cx={entry.x} cy={entry.y} r={11} />
              <circle className={`bsc-leaf k-${k}`} cx={entry.x} cy={entry.y} r={r} />
              {on ? <circle className="bsc-ring" cx={entry.x} cy={entry.y} r={9} /> : null}
            </g>
          );
        })}
        {HUBS.map((entry) => {
          const on = picked === entry.id;
          const above = entry.y < C.y;
          return (
            <g key={`h-${entry.id}`} className={["bsc-hub", `h-${entry.kind}`, hubLit(entry) ? "" : "dim", on ? "on" : ""].filter(Boolean).join(" ")}
              role="button" tabIndex={0} aria-label={entry.name} onClick={() => pick(entry.id)} onKeyDown={onKey(() => pick(entry.id))}>
              <circle className="bsc-hit" cx={entry.x} cy={entry.y} r={15} />
              <circle className="bsc-hubdot" cx={entry.x} cy={entry.y} r={entry.kind === "course" ? 7 : 6} />
              {on ? <circle className="bsc-ring" cx={entry.x} cy={entry.y} r={12} /> : null}
              {entry.side === "left"
                ? <text className="bsc-name" x={entry.x - 16} y={entry.y - 6} textAnchor="end">{entry.name}</text>
                : <text className="bsc-name" x={entry.x} y={entry.y + (above ? -16 : 26)} textAnchor="middle">{entry.name}</text>}
            </g>
          );
        })}
        <g className={picked === null && !kind ? "bsc-core on" : "bsc-core"} role="button" tabIndex={0} aria-label="The Build Club" onClick={() => pick(null)} onKeyDown={onKey(() => pick(null))}>
          <circle className="bsc-hit" cx={C.x} cy={C.y} r={20} />
          <circle className="bsc-corering" cx={C.x} cy={C.y} r={13} />
          <circle className="bsc-coredot" cx={C.x} cy={C.y} r={6.5} />
          <text className="bsc-name core" x={C.x} y={C.y + 34} textAnchor="middle">The Build Club</text>
        </g>
      </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="sc-panel bsc-card" aria-live="polite">{card}</div>
    </div>
  );
}
