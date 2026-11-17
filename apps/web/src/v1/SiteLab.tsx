// Design lab only (/design-lab?page=site): a mock of Polynet's own website.
// The offer: a community with an AI client success manager that learns from
// every conversation, so the community gets smarter the more it is used.
// The picture is the community's brain: a constellation that grows. Not wired
// to anything; the words, the order and the picture are what is being judged.
import { useMemo } from "react";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { KitApp } from "./kit";
import { DiscoverCard } from "./KitDiscover";

const CSS = `
.site{--bg:#06070a;--panel:#0c0e12;--ink:#f3f4f6;--ink2:rgba(243,244,246,.68);--ink3:rgba(243,244,246,.44);--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--accent:#6f78d8;--accent-hi:#9aa2f5;--star:#cfc8ff;
  height:100vh;height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--bg);color:var(--ink);font-family:var(--font-sans,"Geist Variable","Geist",system-ui,sans-serif);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.site *{box-sizing:border-box}
.site .wrap{width:min(1120px,100% - 48px);margin:0 auto}
.site a{color:inherit;text-decoration:none}
.site .nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:rgba(6,7,10,.7);border-bottom:1px solid var(--line)}
.site .nav .wrap{display:flex;align-items:center;gap:28px;height:60px}
.site .brand{display:flex;align-items:center;gap:9px;font-weight:600;font-size:16px;letter-spacing:-.01em}
.site .nav .links{display:flex;gap:24px;margin-left:12px;font-size:14px;color:var(--ink2)}
.site .nav .right{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:14px;color:var(--ink2)}
.site .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 22px;border-radius:10px;border:1px solid var(--line2);background:transparent;color:var(--ink);font:inherit;font-size:15px;font-weight:500;cursor:pointer;white-space:nowrap}
.site .btn.go{border-color:transparent;background:var(--accent);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 30px -12px rgba(111,120,216,.8)}
.site .btn.sm{height:34px;padding:0 14px;font-size:14px;border-radius:8px}
.site .btn svg{width:16px;height:16px}

/* Hero: the words over the community's brain, a year in. */
.site .hero{position:relative;padding:96px 0 0;text-align:center}
.site .hero .sky{position:absolute;inset:-40px 0 auto 0;height:760px;z-index:0;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse 62% 60% at 50% 46%,#000 30%,transparent 78%);mask-image:radial-gradient(ellipse 62% 60% at 50% 46%,#000 30%,transparent 78%);opacity:.9}
.site .hero .sky svg{width:100%;height:100%}
.site .hero .in{position:relative;z-index:1}
.site .pill{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:rgba(6,7,10,.6);font-size:13px;color:var(--ink2)}
.site .pill i{width:6px;height:6px;border-radius:999px;background:var(--star);box-shadow:0 0 10px var(--star)}
.site h1{margin:24px auto 0;max-width:13ch;font-size:clamp(42px,6.6vw,80px);line-height:1;font-weight:600;letter-spacing:-.045em;text-wrap:balance}
.site h1 em{font-style:normal;background:linear-gradient(180deg,#fff 10%,var(--accent-hi));-webkit-background-clip:text;background-clip:text;color:transparent}
.site .lede{margin:24px auto 0;max-width:50ch;font-size:20px;line-height:1.45;color:var(--ink2);text-wrap:pretty}
.site .cta{display:flex;justify-content:center;gap:12px;margin-top:34px;flex-wrap:wrap}
.site .fine{margin-top:14px;font-size:13.5px;color:var(--ink3)}
.site .knows{margin:74px auto 0;display:grid;justify-items:center;gap:4px;padding-bottom:96px}
.site .knows b{font-size:clamp(56px,8vw,104px);line-height:1;font-weight:600;letter-spacing:-.05em;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#fff,var(--accent-hi));-webkit-background-clip:text;background-clip:text;color:transparent}
.site .knows span{font-size:16px;color:var(--ink)}
.site .knows em{font-style:normal;font-size:14px;color:var(--ink3)}

.site section{padding:120px 0 0}
.site .kick{font-size:13px;font-weight:500;letter-spacing:.02em;color:var(--accent-hi)}
.site h2{margin:10px 0 0;max-width:20ch;font-size:clamp(30px,4vw,46px);line-height:1.06;font-weight:600;letter-spacing:-.035em;text-wrap:balance}
.site .sub{margin:16px 0 0;max-width:56ch;font-size:18px;color:var(--ink2);text-wrap:pretty}

/* What is lost: three plain lines, no boxes. */
.site .lost{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:48px}
.site .lost div{padding-top:18px;border-top:1px solid var(--line2)}
.site .lost b{display:block;font-size:19px;font-weight:600;letter-spacing:-.015em}
.site .lost span{display:block;margin-top:8px;font-size:15.5px;color:var(--ink2)}

/* How it gets smarter: one thread of light, four stars on it, and it keeps going. */
.site .thread{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:36px;margin-top:64px;padding-top:44px}
.site .thread::before{content:"";position:absolute;left:0;right:-24px;top:7px;height:2px;background:linear-gradient(90deg,rgba(154,162,245,.15),var(--accent-hi) 30%,var(--accent-hi) 70%,transparent)}
.site .beat{position:relative}
.site .beat::before{content:"";position:absolute;left:0;top:-44px;width:16px;height:16px;border-radius:999px;background:#fff;box-shadow:0 0 0 5px rgba(154,162,245,.22),0 0 26px 6px rgba(154,162,245,.7)}
.site .beat small{display:block;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3)}
.site .beat h3{margin:8px 0 0;font-size:23px;line-height:1.12;font-weight:600;letter-spacing:-.025em}
.site .beat q{display:block;margin-top:14px;font-size:16.5px;line-height:1.4;color:var(--ink);quotes:"“" "”"}
.site .beat q b{display:block;margin-bottom:2px;font-size:13px;font-weight:500;color:var(--accent-hi)}
.site .beat p{margin:12px 0 0;font-size:14.5px;color:var(--ink2)}

/* It compounds: the same community's brain at three moments. */
.site .grow{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:56px;border-top:1px solid var(--line)}
.site .moment{padding:28px 28px 0 0}
.site .moment+.moment{padding-left:28px;border-left:1px solid var(--line)}
.site .moment svg{display:block;width:100%;height:auto;aspect-ratio:1/0.82}
.site .moment .when{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3)}
.site .moment .n{display:block;margin-top:14px;font-size:44px;line-height:1;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.site .moment .n small{margin-left:8px;font-size:15px;font-weight:400;letter-spacing:0;color:var(--ink3)}
.site .moment p{margin:10px 0 0;font-size:15.5px;color:var(--ink2)}

/* Two sides of the same thing. */
.site .sides{display:grid;grid-template-columns:1fr 1fr;gap:64px;margin-top:52px}
.site .sides h3{margin:0;font-size:15px;font-weight:500;color:var(--accent-hi)}
.site .sides ul{margin:16px 0 0;padding:0;display:grid;gap:0}
.site .sides li{list-style:none;padding:16px 0;border-top:1px solid var(--line);font-size:17px;color:var(--ink)}
.site .sides li span{display:block;margin-top:3px;font-size:14.5px;color:var(--ink2)}

.site .proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:44px}
.site .proof a{pointer-events:none}
.site .live{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:22px;padding:22px 26px;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(90deg,rgba(111,120,216,.14),transparent 70%)}
.site .live b{display:block;font-size:17px;font-weight:600}
.site .live span{display:block;margin-top:3px;font-size:14.5px;color:var(--ink2)}

.site .prices{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:48px}
.site .price{padding:34px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
.site .price.hi{border-color:rgba(111,120,216,.55);background:linear-gradient(180deg,rgba(111,120,216,.12),var(--panel) 60%)}
.site .price h3{margin:0;font-size:15px;font-weight:500;color:var(--ink2)}
.site .price .amt{margin-top:10px;font-size:46px;line-height:1;font-weight:600;letter-spacing:-.04em}
.site .price .amt small{font-size:16px;font-weight:400;letter-spacing:0;color:var(--ink3)}
.site .price .note{margin-top:8px;font-size:14px;color:var(--ink2)}
.site .price ul{margin:22px 0 28px;padding:0;display:grid;gap:10px}
.site .price li{list-style:none;display:flex;gap:10px;font-size:15px;color:var(--ink2)}
.site .price li::before{content:"";flex:none;width:7px;height:7px;margin-top:8px;border-radius:999px;background:var(--star);box-shadow:0 0 8px var(--accent-hi)}
.site .price .btn{width:100%}
.site .fee{margin-top:18px;font-size:14px;color:var(--ink3);text-align:center}

.site .asked{margin-top:44px;border-top:1px solid var(--line)}
.site .asked div{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:40px;padding:22px 0;border-bottom:1px solid var(--line)}
.site .asked b{font-size:17px;font-weight:600;letter-spacing:-.01em}
.site .asked span{font-size:16px;color:var(--ink2)}

.site .end{position:relative;padding:140px 0 110px;text-align:center}
.site .end h2{margin:0 auto;max-width:16ch}
.site .name{display:flex;gap:10px;justify-content:center;margin:32px auto 0;max-width:520px}
.site .name input{flex:1;min-width:0;height:50px;padding:0 16px;border-radius:10px;border:1px solid var(--line2);background:var(--panel);color:var(--ink);font:inherit;font-size:16px;outline:0}
.site .name input::placeholder{color:var(--ink3)}
.site .name .btn{height:50px}
.site footer{border-top:1px solid var(--line);padding:26px 0 40px;font-size:13.5px;color:var(--ink3)}
.site footer .wrap{display:flex;gap:22px;align-items:center}
.site footer .wrap span:first-child{margin-right:auto}

/* The stars breathe, slowly; still for anyone who asked for less motion. */
.site .tw{animation:site-twinkle 5s ease-in-out infinite}
.site .tw.b{animation-duration:7s;animation-delay:-2s}
.site .tw.c{animation-duration:9s;animation-delay:-5s}
@keyframes site-twinkle{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.site .tw{animation:none}}

@media (max-width:860px){
  .site .nav .links{display:none}
  .site section{padding-top:84px}
  .site .hero{padding-top:64px}
  .site .hero .sky{height:640px}
  .site .lede{font-size:18px}
  .site .knows{margin-top:56px;padding-bottom:64px}
  .site .lost,.site .proof,.site .prices,.site .sides{grid-template-columns:1fr;gap:28px}
  .site .sides{gap:44px}
  .site .thread{grid-template-columns:1fr;gap:40px;padding-top:0;padding-left:40px}
  .site .thread::before{left:7px;right:auto;top:6px;bottom:-30px;width:2px;height:auto;background:linear-gradient(180deg,rgba(154,162,245,.15),var(--accent-hi) 20%,var(--accent-hi) 80%,transparent)}
  .site .beat::before{left:-40px;top:4px}
  .site .grow{grid-template-columns:1fr}
  .site .moment,.site .moment+.moment{padding:26px 0 30px;border-left:0}
  .site .moment+.moment{border-top:1px solid var(--line)}
  .site .moment svg{max-width:300px;margin:0 auto}
  .site .asked div{grid-template-columns:1fr;gap:8px}
  .site .live{flex-direction:column;align-items:flex-start}
  .site .name{flex-direction:column}
  .site .end{padding:96px 0 80px}
}
`;

function Mark() {
  const nodes: Record<string, [number, number]> = { a: [133, 148], hub: [258, 205], c: [382, 98], d: [440, 268], e: [304, 378], f: [72, 295] };
  const links: Array<[string, string]> = [["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"]];
  return (
    <svg viewBox="20 46 472 384" width={26} height={21} aria-hidden="true">
      {links.map(([from, to]) => <line key={from + to} x1={nodes[from]![0]} y1={nodes[from]![1]} x2={nodes[to]![0]} y2={nodes[to]![1]} stroke="currentColor" strokeWidth={18} strokeLinecap="round" />)}
      {Object.entries(nodes).map(([id, [x, y]]) => <circle key={id} cx={x} cy={y} r={id === "hub" ? 61 : 34} fill="currentColor" />)}
    </svg>
  );
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);

// The community's brain as a picture: a hub, and everything it has learned as
// stars around it, each joined to the nearest thing it grew from. More
// learned, more stars: the same drawing at 8 points and at 260 is the whole
// argument. Always the same for the same numbers (no chance in it).
function Brain(props: { stars: number; width: number; height: number; seed: number; labels?: string[]; idPrefix: string }) {
  const { stars, width, height } = props;
  const drawing = useMemo(() => {
    let state = props.seed >>> 0;
    const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const cx = width / 2;
    const cy = height / 2;
    const reach = Math.min(width * 0.47, height * 0.86);
    const points: Array<{ x: number; y: number; r: number; bright: boolean; from: number }> = [{ x: cx, y: cy, r: 0, bright: true, from: -1 }];
    for (let index = 1; index <= stars; index += 1) {
      const angle = index * 2.39996323 + (random() - 0.5) * 0.9;
      const distance = reach * Math.sqrt(index / stars) * (0.72 + random() * 0.36) + 14;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance * (height / width) * 1.15;
      // Joined to the nearest thing already known, so it grows like a mind, not a wheel.
      let from = 0;
      let nearest = Infinity;
      for (let earlier = 0; earlier < points.length; earlier += 1) {
        const dx = points[earlier]!.x - x;
        const dy = points[earlier]!.y - y;
        const gap = dx * dx + dy * dy;
        if (gap < nearest) { nearest = gap; from = earlier; }
      }
      points.push({ x, y, r: 1 + random() * 1.7, bright: random() < 0.14, from });
    }
    return points;
  }, [stars, width, height, props.seed]);
  const glow = `${props.idPrefix}-glow`;
  const labelled = props.labels ? drawing.filter((point, index) => index > 0 && point.bright).slice(0, props.labels.length) : [];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`A community's brain with ${stars} things learned`}>
      <defs>
        <radialGradient id={glow}><stop offset="0" stopColor="#b9b0ff" stopOpacity=".9" /><stop offset="1" stopColor="#6f78d8" stopOpacity="0" /></radialGradient>
      </defs>
      {drawing.slice(1).map((point, index) => {
        const from = drawing[point.from]!;
        return <line key={`l${index}`} x1={from.x} y1={from.y} x2={point.x} y2={point.y} stroke="#9aa2f5" strokeOpacity={point.from === 0 ? 0.3 : 0.2} strokeWidth={0.8} />;
      })}
      <circle cx={drawing[0]!.x} cy={drawing[0]!.y} r={Math.max(26, width * 0.05)} fill={`url(#${glow})`} />
      <circle cx={drawing[0]!.x} cy={drawing[0]!.y} r={Math.max(4, width * 0.006)} fill="#fff" />
      {drawing.slice(1).map((point, index) => (
        <g key={`p${index}`} className={point.bright ? `tw${index % 3 === 1 ? " b" : index % 3 === 2 ? " c" : ""}` : undefined}>
          {point.bright ? <circle cx={point.x} cy={point.y} r={point.r * 6} fill={`url(#${glow})`} /> : null}
          <circle cx={point.x} cy={point.y} r={point.bright ? point.r + 0.8 : point.r} fill={point.bright ? "#fff" : "#cfc8ff"} fillOpacity={point.bright ? 1 : 0.75} />
        </g>
      ))}
      {labelled.map((point, index) => (
        <text key={`t${index}`} x={point.x + (point.x > width / 2 ? 12 : -12)} y={point.y + 4} textAnchor={point.x > width / 2 ? "start" : "end"} fontSize={13} fill="#f3f4f6" fillOpacity={0.78}>{props.labels![index]}</text>
      ))}
    </svg>
  );
}

const card = (over: Partial<DiscoverCommunitySnapshot> & Pick<DiscoverCommunitySnapshot, "slug" | "name" | "one_liner">): DiscoverCommunitySnapshot => ({
  avatar_url: null, banner_url: null, visibility: "published", created_at: "", updated_at: "", ...over,
});

export function SiteLab() {
  const now = Date.now();
  return (
    <div className="site">
      <style>{CSS}</style>
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top"><Mark /> polynet</a>
          <nav className="links"><a href="#how">How it learns</a><a href="#grow">Over time</a><a href="#price">Pricing</a><a href="#proof">Communities</a></nav>
          <div className="right"><a href="#top">Sign in</a><button type="button" className="btn go sm">Start free</button></div>
        </div>
      </header>

      <div className="hero" id="top">
        <div className="sky" aria-hidden="true">
          <Brain idPrefix="hero" stars={260} width={1400} height={760} seed={7} />
        </div>
        <div className="in wrap">
          <span className="pill"><i /> Free to start · live in a minute</span>
          <h1>A community that gets <em>smarter every day.</em></h1>
          <p className="lede">Polynet gives your community an AI client success manager. It learns from every conversation, never forgets, and answers the next person better than the last.</p>
          <div className="cta">
            <button type="button" className="btn go">Start your community <Arrow /></button>
            <button type="button" className="btn">See one that's running</button>
          </div>
          <p className="fine">No card. The community is free for good.</p>
          <div className="knows">
            <b>1,204</b>
            <span>things this community has learned from its own members</span>
            <em>and one more with every conversation</em>
          </div>
        </div>
      </div>

      <section className="wrap">
        <span className="kick">The problem nobody names</span>
        <h2>What your community knows is lost every day.</h2>
        <div className="lost">
          <div><b>The best answer is gone by tomorrow.</b><span>It scrolled away. The next person never sees it.</span></div>
          <div><b>You answer the same question again.</b><span>And again next month, because nothing remembered the first time.</span></div>
          <div><b>When a great member leaves, so does what they knew.</b><span>Years of hard-won answers, gone with them.</span></div>
        </div>
      </section>

      <section className="wrap" id="how">
        <span className="kick">How it gets smarter</span>
        <h2>Every conversation teaches it.</h2>
        <p className="sub">Nothing to set up and nothing to feed it. It learns from your people talking to each other.</p>
        <div className="thread">
          <div className="beat">
            <small>Someone asks</small>
            <h3>It doesn't know yet, and says so.</h3>
            <q><b>Mira</b>How do I find my first ten subscribers?</q>
            <p>It brings in Dana, who has done exactly that.</p>
          </div>
          <div className="beat">
            <small>It learns</small>
            <h3>Dana's answer is kept.</h3>
            <q><b>Dana</b>Direct messages to people you know. Six yeses from fifteen.</q>
            <p>Not in a thread nobody will find. In what your community knows.</p>
          </div>
          <div className="beat">
            <small>It compounds</small>
            <h3>Next time, it just answers.</h3>
            <q><b>Sam, a week later</b>Any advice on my first subscribers?</q>
            <p>Straight away, with Dana's numbers, and credit to Dana.</p>
          </div>
          <div className="beat">
            <small>It pays off</small>
            <h3>Sam gets a result.</h3>
            <q><b>Sam</b>Eight subscribers. My first $240.</q>
            <p>And how he did it is kept too, for whoever asks next.</p>
          </div>
        </div>
      </section>

      <section className="wrap" id="grow">
        <span className="kick">Over time</span>
        <h2>The same community, a year apart.</h2>
        <p className="sub">A hired client success manager is as good as their memory, and leaves with it. This one is better on day 365 than on day one, and it stays.</p>
        <div className="grow">
          <div className="moment">
            <span className="when">Day one</span>
            <Brain idPrefix="d1" stars={8} width={420} height={344} seed={3} />
            <span className="n">12<small>things known</small></span>
            <p>What you taught it: your lessons and your first few answers.</p>
          </div>
          <div className="moment">
            <span className="when">Day thirty</span>
            <Brain idPrefix="d30" stars={64} width={420} height={344} seed={3} />
            <span className="n">140<small>things known</small></span>
            <p>What your first members worked out together. Most questions get answered without you.</p>
          </div>
          <div className="moment">
            <span className="when">Day 365</span>
            <Brain idPrefix="d365" stars={230} width={420} height={344} seed={3} />
            <span className="n">1,204<small>things known</small></span>
            <p>A year of answers, wins and hard lessons from everyone who has been through. Yours to keep.</p>
          </div>
        </div>
      </section>

      <section className="wrap">
        <span className="kick">What it means</span>
        <h2>Members get results. You get your time back.</h2>
        <div className="sides">
          <div>
            <h3>For your members</h3>
            <ul>
              <li>An answer in seconds, at any hour<span>From what you taught and what members before them worked out.</span></li>
              <li>A welcome, and an introduction<span>To the one person here who has done what they're trying to do.</span></li>
              <li>A next step, not a feed to scroll<span>So they keep moving and get the result they joined for.</span></li>
            </ul>
          </div>
          <div>
            <h3>For you</h3>
            <ul>
              <li>You stop answering the same question<span>It's answered once, then it's known.</span></li>
              <li>You see who needs you today<span>A short brief, not an hour of catching up.</span></li>
              <li>You see what to teach next<span>The things people keep asking that nothing covers yet.</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="wrap" id="proof">
        <span className="kick">See it working</span>
        <h2>Communities running on Polynet.</h2>
        <KitApp view="home" part="flow" light={false}><div className="proof">
          <DiscoverCard now={now} community={card({ slug: "polynet", name: "Polynet", one_liner: "Hosts building their first hundred members.", banner_url: "/design-lab/polynet-earth.webp", member_count: 214, host: { name: "Neil McDevitt", avatar_url: null }, last_active_at: new Date(now - 3_600_000).toISOString() })} />
          <DiscoverCard now={now} community={card({ slug: "de", name: "Distribution Engineering", one_liner: "Founders who own their own distribution.", member_count: 86, host: { name: "Neil McDevitt", avatar_url: null }, posts_this_week: 31 })} />
          <DiscoverCard now={now} community={card({ slug: "sunrise", name: "Sunrise Climbing Club", one_liner: "Early-morning climbers who train together.", member_count: 42, host: { name: "Maya Chen", avatar_url: null }, posts_this_week: 12 })} />
        </div></KitApp>
        <div className="live">
          <div><b>Ask ours anything.</b><span>Join the Polynet community free and watch it answer, from what hosts before you worked out.</span></div>
          <button type="button" className="btn">Join the Polynet community <Arrow /></button>
        </div>
      </section>

      <section className="wrap" id="price">
        <span className="kick">Pricing</span>
        <h2>Free to run. Pay when you want it working for you.</h2>
        <div className="prices">
          <div className="price">
            <h3>Your community</h3>
            <div className="amt">Free</div>
            <div className="note">No time limit, no member limit.</div>
            <ul>
              <li>Channels, messages, events, courses and pods</li>
              <li>Your public page and invite link</li>
              <li>Take payments from members</li>
            </ul>
            <button type="button" className="btn">Start free</button>
          </div>
          <div className="price hi">
            <h3>Client success manager</h3>
            <div className="amt">$79 <small>a month</small></div>
            <div className="note">First 14 days free. Per community, AI included.</div>
            <ul>
              <li>Learns from every conversation, and keeps it</li>
              <li>Answers and welcomes members, at any hour</li>
              <li>Tells you who needs you, and what to teach next</li>
            </ul>
            <button type="button" className="btn go">Start free, add it later</button>
          </div>
        </div>
        <p className="fee">When you charge members: 2.9% plus Stripe's fees. Nothing when it's free.</p>
      </section>

      <section className="wrap">
        <span className="kick">Fair questions</span>
        <h2>Before you trust it with your people.</h2>
        <div className="asked">
          <div><b>What if it's wrong?</b><span>It says when it doesn't know and asks someone who does. You can correct or remove anything it has learned.</span></div>
          <div><b>Who owns what it learns?</b><span>You do. It's your community's, and it stays with your community.</span></div>
          <div><b>Does it read private conversations?</b><span>It learns from what members can already see. A pod's knowledge stays in that pod.</span></div>
          <div><b>How long until it's useful?</b><span>The first day, from your lessons. It gets better from there without you doing anything.</span></div>
        </div>
      </section>

      <div className="end wrap">
        <h2>Start it learning today.</h2>
        <div className="name">
          <input type="text" placeholder="Name your community" aria-label="Name your community" />
          <button type="button" className="btn go">Start free <Arrow /></button>
        </div>
        <p className="fine">Free for good. Live in about a minute.</p>
      </div>

      <footer>
        <div className="wrap"><span>© Polynet</span><a href="#top">For developers</a><a href="#top">Terms</a><a href="#top">Privacy</a></div>
      </footer>
    </div>
  );
}
