// The public site's drawings: three line figures in Polynet's own language
// (people as points, one violet light for the AI) and the wide product scenes
// under each feature. Everything here is drawn in markup, never a screenshot,
// so it stays sharp, never goes stale and never shows a real member. The
// people in the scenes are made up.
import { Fragment, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

const INK = "#08090A";

function Glow(props: { id: string }) {
  return (
    <radialGradient id={props.id} cx=".5" cy=".5" r=".5">
      <stop offset="0" stopColor="#A78BFA" stopOpacity=".55" /><stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
    </radialGradient>
  );
}

// Fig 0.1: members around one centre; the centre answers one of them.
function FigureAnswers() {
  const members: Array<[number, number]> = [[98, 101], [200, 42], [302, 219], [98, 219], [200, 278]];
  return (
    <svg className="fig" viewBox="0 0 400 320" role="img" aria-label="Members around one centre, with a line of light running from the centre to one of them">
      <defs><Glow id="pnFig1" /></defs>
      <g fill="none" stroke="#3F434B">
        <circle cx="200" cy="160" r="62" strokeDasharray="1 5" strokeLinecap="round" /><circle cx="200" cy="160" r="118" />
        <circle cx="200" cy="160" r="146" strokeDasharray="1 7" strokeLinecap="round" />
      </g>
      <g stroke="#5A5F69">{members.map(([x, y]) => <line key={`${x}-${y}`} x1="200" y1="160" x2={x} y2={y} />)}</g>
      <line x1="200" y1="160" x2="302" y2="101" stroke="#C4B5FD" strokeWidth="1.4" />
      <circle cx="200" cy="160" r="34" fill="url(#pnFig1)" />
      <circle cx="200" cy="160" r="15" fill={INK} stroke="#E6E7EA" /><circle cx="200" cy="160" r="5" fill="#F7F8F8" />
      <g fill={INK} stroke="#9AA0AA">{members.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />)}</g>
      <circle cx="302" cy="101" r="8" fill={INK} stroke="#C4B5FD" strokeWidth="1.2" /><circle cx="302" cy="101" r="3" fill="#C4B5FD" />
    </svg>
  );
}

// Fig 0.2: what the community learns, in layers that build up.
function FigureRemembers() {
  const layers = [94, 162, 230];
  return (
    <svg className="fig" viewBox="0 0 400 320" role="img" aria-label="Three layers of connected points, stacked, with one point lit on the top layer">
      <defs><Glow id="pnFig2" /></defs>
      <g stroke="#3F434B" strokeDasharray="1 5" strokeLinecap="round">
        {[[126, 94], [200, 66], [274, 94], [200, 122], [70, 94], [330, 94]].map(([x, y]) => <line key={`${x}-${y}`} x1={x} y1={y} x2={x} y2={y + 136} />)}
      </g>
      <g fill={INK} stroke="#4A4E57">{[...layers].reverse().map((cy) => <ellipse key={cy} cx="200" cy={cy} rx="130" ry="46" />)}</g>
      {layers.map((cy, index) => (
        <g key={cy} opacity={[1, 0.65, 0.4][index]}>
          <path d={`M126 ${cy} 200 ${cy - 28} 274 ${cy} 200 ${cy + 28}Z`} fill="none" stroke="#5A5F69" />
          <g fill={INK} stroke="#9AA0AA">
            <circle cx="126" cy={cy} r="5.5" /><circle cx="274" cy={cy} r="5.5" /><circle cx="200" cy={cy + 28} r="5.5" />
            {index ? <circle cx="200" cy={cy - 28} r="5.5" /> : null}
          </g>
        </g>
      ))}
      <circle cx="200" cy="66" r="24" fill="url(#pnFig2)" />
      <circle cx="200" cy="66" r="6.5" fill={INK} stroke="#C4B5FD" strokeWidth="1.2" /><circle cx="200" cy="66" r="2.5" fill="#C4B5FD" />
    </svg>
  );
}

// Fig 0.3: a day as an arc over a row of members; the morning reaches one of them.
function FigureRuns() {
  return (
    <svg className="fig" viewBox="0 0 400 320" role="img" aria-label="A day drawn as an arc over a row of members, with a light at morning reaching down to one of them">
      <defs><Glow id="pnFig3" /></defs>
      <g fill="none" stroke="#3F434B">
        <path d="M40 236 A160 160 0 0 1 360 236" /><path d="M76 236 A124 124 0 0 1 324 236" strokeDasharray="1 6" strokeLinecap="round" />
      </g>
      <line x1="24" y1="236" x2="376" y2="236" stroke="#5A5F69" />
      <g stroke="#4A4E57">{[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => <line key={x} x1={x} y1={x % 160 === 40 ? 230 : 232} x2={x} y2={x % 160 === 40 ? 242 : 240} />)}</g>
      <g stroke="#3F434B" strokeDasharray="1 5" strokeLinecap="round"><line x1="200" y1="76" x2="200" y2="270" /><line x1="313" y1="123" x2="280" y2="270" /></g>
      <line x1="87" y1="123" x2="120" y2="270" stroke="#C4B5FD" strokeWidth="1.4" />
      <g fill={INK} stroke="#9AA0AA">
        <circle cx="200" cy="76" r="6" /><circle cx="313" cy="123" r="6" />
        <circle cx="60" cy="278" r="7" opacity=".5" /><circle cx="200" cy="278" r="7" /><circle cx="280" cy="278" r="7" /><circle cx="340" cy="278" r="7" opacity=".5" />
      </g>
      <circle cx="120" cy="278" r="7" fill={INK} stroke="#C4B5FD" strokeWidth="1.2" /><circle cx="120" cy="278" r="2.5" fill="#C4B5FD" />
      <circle cx="87" cy="123" r="30" fill="url(#pnFig3)" />
      <circle cx="87" cy="123" r="13" fill={INK} stroke="#E6E7EA" /><circle cx="87" cy="123" r="4.5" fill="#F7F8F8" />
    </svg>
  );
}

const FIGURES: Array<[string, ReactNode, string, string]> = [
  ["FIG 0.1", <FigureAnswers key="a" />, "It answers", "Every member has a guide that answers from your courses and past discussions, any hour of the day."],
  ["FIG 0.2", <FigureRemembers key="b" />, "It remembers", "Courses, notes and good answers build into one memory, so what one member learns stays for the next."],
  ["FIG 0.3", <FigureRuns key="c" />, "It runs", "A brief every morning, check-ins with members who go quiet, and reply drafts waiting for your yes."],
];

export function StatementFigures() {
  return (
    <section className="statement" aria-labelledby="statement-title" data-rv>
      <h2 id="statement-title">A community with an AI at its centre. <span>Polynet gives your people a home that answers their questions, keeps what they learn, and helps you run the place.</span></h2>
      <div className="figs">
        {FIGURES.map(([label, drawing, title, text]) => (
          <article key={label}>
            <span className="fig-label">{label}</span>
            {drawing}
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- the scenes ----------

type Person = [initials: string, name: string, colour: string];
const MAYA: Person = ["MA", "Maya Alvarez", "#7A4E9E"];
const JOSH: Person = ["JU", "Josh Underwood", "#2F6B5A"];
const DEV: Person = ["DO", "Dev Okafor", "#3B5B8C"];
const PRIYA: Person = ["PS", "Priya Shah", "#8C6A2F"];
const TOM: Person = ["TR", "Tom Reyes", "#9E4E5F"];
const LENA: Person = ["LN", "Lena Novak", "#4E6B9E"];
const AMIR: Person = ["AK", "Amir Khan", "#5F7A3A"];

function Face(props: { person: Person; small?: boolean }) {
  return <span className={props.small ? "sc-face small" : "sc-face"} style={{ background: props.person[2] }}>{props.person[0]}</span>;
}

// One feature: a label-like title, one paragraph, a wide scene that runs off
// the page's right edge and fades, and the names of what's inside.
export function FeatureSection(props: {
  id: string; plan: string; title: [string, string]; children: ReactNode; sceneLabel: string;
  front: ReactNode; back: ReactNode; features: string[];
}) {
  const half = Math.ceil(props.features.length / 2);
  return (
    <section className="feat" id={props.id} aria-labelledby={`${props.id}-title`} data-rv>
      <div className="feat-head">
        <div>
          <span className="plan-tag">{props.plan}</span>
          <h2 id={`${props.id}-title`}>{props.title[0]}<br />{props.title[1]}</h2>
        </div>
        <p>{props.children}</p>
      </div>
      <div className="scene" role="img" aria-label={props.sceneLabel}>
        <div className="scene-back" aria-hidden="true">{props.back}</div>
        <div className="scene-front" aria-hidden="true">{props.front}</div>
      </div>
      <div className="feat-list">
        <span>Features</span>
        <ul>{props.features.slice(0, half).map((name) => <li key={name}>{name}</li>)}</ul>
        <ul>{props.features.slice(half).map((name) => <li key={name}>{name}</li>)}</ul>
      </div>
    </section>
  );
}

// The guide: a member's private question, answered from a lesson that is lit
// in the course behind it.
export function guideScene() {
  const lessons: Array<[string, string, string, boolean?]> = [
    ["1", "Why a community, why now", "8 min"], ["2", "Find your first ten members", "12 min"], ["3", "Your first live call", "9 min"],
    ["4", "Pricing your first cohort", "14 min", true], ["5", "Keeping people to the end", "11 min"], ["6", "From cohort to community", "10 min"],
    ["7", "What to measure", "7 min"],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">Your guide · private to Dev</span>
        <div className="sc-msg"><Face person={DEV} /><div><b>Dev <i>2:07 am</i></b><span>How should I price my first cohort?</span></div></div>
        <div className="sc-msg ai">
          <span className="sc-face ai"><Sparkles size={14} aria-hidden="true" /></span>
          <div>
            <b>Your guide <i>2:07 am</i></b>
            <span>Maya ran two cohorts here. Monthly billing kept more people to the end than one payment. Lesson 4 walks through the numbers.</span>
            <em>Lesson 4 · Pricing your first cohort</em>
          </div>
        </div>
        <div className="sc-box">Ask your guide anything</div>
      </div>
    ),
    back: (
      <div className="sc-table">
        <div className="sc-row head"><span /><span>Build your community, A to Z</span><span>Length</span><span>Finished</span></div>
        {lessons.map(([number, title, length, lit], index) => (
          <div key={number} className={lit ? "sc-row lit" : "sc-row"}>
            <span /><span><i className="sc-num">{number}</i>{title}</span><span>{length}</span><span>{[14, 12, 11, 9, 6, 4, 3][index]} members</span>
          </div>
        ))}
      </div>
    ),
  };
}

// The brain: what the community knows as a map, and what it learned lately.
export function brainScene() {
  const clusters: Array<[number, number, Array<[number, number]>, boolean?]> = [
    [250, 120, [[190, 80], [206, 150], [262, 62], [306, 96], [226, 176]]],
    [560, 96, [[508, 62], [570, 40], [622, 70], [628, 122], [540, 150]], true],
    [430, 330, [[362, 306], [372, 366], [420, 392], [478, 384], [500, 326], [470, 286]]],
    [760, 300, [[706, 268], [778, 244], [826, 290], [806, 348], [736, 356]]],
    [900, 130, [[858, 92], [924, 76], [960, 132], [922, 180]]],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">What your community knows</span>
        {[
          ["Monthly billing keeps cohorts together", "From Maya's answer in # General", true],
          ["Most members join for the live calls", "From 11 introductions"],
          ["Lesson 4 is where people get stuck", "From 9 questions to the guide"],
        ].map(([title, source, fresh]) => (
          <div key={String(title)} className="sc-learned"><i className={fresh ? "new" : undefined} /><div><b>{title}</b><span>{source}</span></div></div>
        ))}
        <span className="sc-foot">3 learned this week · you can correct any of it</span>
      </div>
    ),
    back: (
      <svg className="sc-brain" viewBox="120 10 900 420">
        <defs><Glow id="pnSceneBrain" /></defs>
        <g fill="none" stroke="#33363D" strokeWidth="1.2">
          {clusters.map(([x, y, leaves], index) => (
            <Fragment key={index}>
              <path d={`M600 215 Q${(600 + x) / 2} ${(215 + y) / 2 - 24} ${x} ${y}`} />
              {leaves.map(([lx, ly]) => <line key={`${lx}-${ly}`} x1={x} y1={y} x2={lx} y2={ly} />)}
            </Fragment>
          ))}
        </g>
        <circle cx="600" cy="215" r="70" fill="url(#pnSceneBrain)" /><circle cx="600" cy="215" r="9" fill="#FFFFFF" />
        {clusters.map(([x, y, leaves, bright], index) => (
          <Fragment key={index}>
            {leaves.map(([lx, ly]) => <circle key={`${lx}-${ly}`} cx={lx} cy={ly} r="4.5" fill={bright ? "#EEF0F4" : "#7D828C"} />)}
            <circle cx={x} cy={y} r="7.5" fill="#EEF0F4" />
          </Fragment>
        ))}
        <circle cx="622" cy="70" r="16" fill="url(#pnSceneBrain)" /><circle cx="622" cy="70" r="5" fill="#C4B5FD" />
      </svg>
    ),
  };
}

// Chief of Staff: the morning brief over the Members table; the member it
// wants to check in on is lit in the table behind.
export function chiefScene() {
  const rows: Array<[Person, string, boolean, string, string, boolean?]> = [
    [MAYA, "Active", true, "Member", "Today"], [JOSH, "Quiet 25 days", false, "Member", "Oct 31", true], [DEV, "Active", true, "Free", "Today"],
    [PRIYA, "Active", true, "Member", "Yesterday"], [TOM, "Quiet 12 days", false, "Free", "Nov 13"], [LENA, "Active", true, "Member", "Today"],
    [AMIR, "Active", true, "Free", "Today"],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">Your guide · 9:24 am</span>
        <strong className="sc-hello">Good morning.</strong>
        <span className="sc-text">Two people finished Start here. Dev's pricing question was answered overnight. Two things need you.</span>
        <div className="sc-ask">
          <div className="sc-ask-top"><Face person={JOSH} small /><b>Check in with Josh</b><span>Quiet 25 days</span></div>
          <p>"Hey Josh, Friday's call covers the pricing piece you were stuck on. Want me to save you the notes?"</p>
          <div className="sc-acts"><i>Approve</i><span>Edit</span><span>Skip</span></div>
        </div>
        <div className="sc-ask plain"><div className="sc-ask-top"><Face person={PRIYA} small /><b>Reply drafted for Priya</b><i>Review</i></div></div>
      </div>
    ),
    back: (
      <div className="sc-table">
        <div className="sc-row head"><span /><span>Member</span><span>Status</span><span>Last here</span></div>
        {rows.map(([person, status, active, , last, lit]) => (
          <div key={person[1]} className={lit ? "sc-row lit" : "sc-row"}>
            <span /><span><Face person={person} />{person[1]}</span>
            <span><i className={active ? "sc-dot" : "sc-dot quiet"} />{status}</span><span>{last}</span>
          </div>
        ))}
      </div>
    ),
  };
}
