// Design lab only (/design-lab?page=site): a mock of Polynet's own website.
// The offer: a free community, live in a minute, with an AI client success
// manager you switch on when you want it. Not wired to anything; the words
// and the order are what is being judged.
import type { ReactNode } from "react";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { KitApp } from "./kit";
import { DiscoverCard } from "./KitDiscover";

const CSS = `
.site{--bg:#07080a;--panel:#0d0f12;--panel2:#12151a;--ink:#f3f4f6;--ink2:rgba(243,244,246,.68);--ink3:rgba(243,244,246,.46);--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--accent:#6f78d8;--accent-hi:#8b93ea;--ok:#5fcf9a;
  height:100vh;overflow-y:auto;background:var(--bg);color:var(--ink);font-family:var(--font-sans,"Geist Variable","Geist",system-ui,sans-serif);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.site *{box-sizing:border-box}
.site .wrap{width:min(1120px,100% - 48px);margin:0 auto}
.site a{color:inherit;text-decoration:none}
.site .nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:rgba(7,8,10,.72);border-bottom:1px solid var(--line)}
.site .nav .wrap{display:flex;align-items:center;gap:28px;height:60px}
.site .brand{display:flex;align-items:center;gap:9px;font-weight:600;font-size:16px;letter-spacing:-.01em}
.site .nav .links{display:flex;gap:24px;margin-left:12px;font-size:14px;color:var(--ink2)}
.site .nav .right{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:14px;color:var(--ink2)}
.site .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 20px;border-radius:10px;border:1px solid var(--line2);background:transparent;color:var(--ink);font:inherit;font-size:15px;font-weight:500;cursor:pointer;white-space:nowrap}
.site .btn.go{border-color:transparent;background:var(--accent);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 30px -12px rgba(111,120,216,.8)}
.site .btn.go:hover{background:var(--accent-hi)}
.site .btn.sm{height:34px;padding:0 14px;font-size:14px;border-radius:8px}
.site .btn svg{width:16px;height:16px}
.site .hero{padding:88px 0 0;text-align:center}
.site .pill{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);font-size:13px;color:var(--ink2)}
.site .pill i{width:6px;height:6px;border-radius:999px;background:var(--ok)}
.site h1{margin:22px auto 0;max-width:15ch;font-size:clamp(40px,6.2vw,72px);line-height:1.02;font-weight:600;letter-spacing:-.04em;text-wrap:balance}
.site h1 em{font-style:normal;color:var(--accent-hi)}
.site .lede{margin:22px auto 0;max-width:56ch;font-size:19px;line-height:1.5;color:var(--ink2);text-wrap:pretty}
.site .cta{display:flex;justify-content:center;gap:12px;margin-top:32px;flex-wrap:wrap}
.site .fine{margin-top:14px;font-size:13.5px;color:var(--ink3)}
.site .shot{position:relative;margin:64px auto 0;width:min(1180px,100% - 48px);border-radius:14px;border:1px solid var(--line2);overflow:hidden;background:var(--panel);box-shadow:0 60px 140px -50px rgba(111,120,216,.35),0 40px 90px -40px #000}
.site .shot img{display:block;width:100%;height:auto}
/* The capture caught the pointer; this covers it (the area is flat). */
.site .shot i{position:absolute;left:49.2%;top:54%;width:2.2%;height:4.2%;background:#0c0c0d}
.site .shot::after{content:"";position:absolute;inset:auto 0 0 0;height:120px;background:linear-gradient(180deg,transparent,var(--bg))}
.site section{padding:112px 0 0}
.site .kick{font-size:13px;font-weight:500;letter-spacing:.02em;color:var(--accent-hi)}
.site h2{margin:10px 0 0;max-width:22ch;font-size:clamp(28px,3.6vw,42px);line-height:1.08;font-weight:600;letter-spacing:-.03em;text-wrap:balance}
.site .sub{margin:14px 0 0;max-width:58ch;font-size:17px;color:var(--ink2);text-wrap:pretty}
.site .quiet{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:40px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line)}
.site .quiet div{padding:26px 24px;background:var(--bg)}
.site .quiet b{display:block;font-size:17px;font-weight:600;letter-spacing:-.01em}
.site .quiet span{display:block;margin-top:6px;font-size:14.5px;color:var(--ink2)}
.site .jobs{display:grid;gap:20px;margin-top:44px}
.site .job{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:40px;align-items:center;padding:36px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,var(--panel),var(--bg))}
.site .job:nth-child(even) .job-words{order:2}
.site .job h3{margin:8px 0 0;font-size:25px;line-height:1.15;font-weight:600;letter-spacing:-.02em}
.site .job p{margin:12px 0 0;font-size:16px;color:var(--ink2)}
.site .job .num{font-size:13px;color:var(--ink3);font-variant-numeric:tabular-nums}
.site .vig{border:1px solid var(--line2);border-radius:12px;background:var(--panel2);padding:18px;font-size:14px;box-shadow:0 30px 60px -40px #000}
.site .msg{display:flex;gap:11px}
.site .msg+.msg{margin-top:16px}
.site .face{flex:none;width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font-size:11px;font-weight:600;color:#3b2f24;background:#f3d9b8}
.site .face.b{background:#cfc4f2;color:#2e2850}
.site .face.g{background:transparent;color:#b9a5ff;font-size:17px}
.site .msg b{font-weight:600}
.site .msg time{margin-left:8px;font-size:12px;color:var(--ink3)}
.site .msg p{margin:3px 0 0;font-size:14px;line-height:1.5;color:var(--ink2)}
.site .src{display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:4px 9px;border-radius:7px;border:1px solid var(--line2);font-size:12.5px;color:var(--ink2)}
.site .tag{display:inline-block;padding:0 6px;border-radius:5px;border:1px solid var(--line2);color:var(--ink2);font-size:11px;line-height:17px;margin-left:8px;vertical-align:1px}
.site .vig.pic{padding:0;overflow:hidden;justify-self:center;max-width:390px}
.site .vig.pic img{display:block;width:100%;height:auto}
.site .needs{display:grid;gap:10px}
.site .need{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.site .need i{flex:none;width:7px;height:7px;border-radius:999px;background:var(--accent-hi)}
.site .need b{display:block;font-size:14px;font-weight:500}
.site .need span{display:block;font-size:13px;color:var(--ink3)}
.site .need em{margin-left:auto;font-style:normal;font-size:12.5px;color:var(--ink2);white-space:nowrap}
.site .minute{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:56px;align-items:center;margin-top:44px}
.site .steps{display:grid;gap:0;counter-reset:s}
.site .steps li{list-style:none;position:relative;padding:0 0 30px 52px}
.site .steps li::before{counter-increment:s;content:counter(s);position:absolute;left:0;top:0;width:32px;height:32px;border-radius:999px;border:1px solid var(--line2);display:grid;place-items:center;font-size:13px;color:var(--ink2)}
.site .steps li:not(:last-child)::after{content:"";position:absolute;left:16px;top:38px;bottom:6px;width:1px;background:var(--line2)}
.site .steps b{display:block;font-size:18px;font-weight:600;letter-spacing:-.01em}
.site .steps span{display:block;margin-top:4px;font-size:15px;color:var(--ink2)}
.site .steps ol{margin:0;padding:0}
.site .cardbox{padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
.site .cardbox small{display:block;margin-bottom:10px;font-size:12px;color:var(--ink3)}
.site .cardbox .foot{display:flex;justify-content:center;gap:7px;margin-top:16px}
.site .cardbox .foot i{width:6px;height:6px;border-radius:999px;background:var(--line2)}
.site .cardbox .foot i.on{width:18px;background:var(--ink)}
.site .has{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:40px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line)}
.site .has div{padding:22px 24px;background:var(--bg)}
.site .has b{display:block;font-size:15.5px;font-weight:600}
.site .has span{display:block;margin-top:4px;font-size:14px;color:var(--ink2)}
.site .proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:40px}
.site .proof a{pointer-events:none}
.site .live{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:22px;padding:22px 26px;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(90deg,rgba(111,120,216,.14),transparent 70%)}
.site .live b{display:block;font-size:17px;font-weight:600}
.site .live span{display:block;margin-top:3px;font-size:14.5px;color:var(--ink2)}
.site .prices{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:44px}
.site .price{padding:32px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
.site .price.hi{border-color:rgba(111,120,216,.55);background:linear-gradient(180deg,rgba(111,120,216,.12),var(--panel) 60%)}
.site .price h3{margin:0;font-size:15px;font-weight:500;color:var(--ink2)}
.site .price .amt{margin-top:10px;font-size:44px;line-height:1;font-weight:600;letter-spacing:-.035em}
.site .price .amt small{font-size:16px;font-weight:400;letter-spacing:0;color:var(--ink3)}
.site .price .note{margin-top:8px;font-size:14px;color:var(--ink2)}
.site .price ul{margin:22px 0 26px;padding:0;display:grid;gap:10px}
.site .price li{list-style:none;display:flex;gap:10px;font-size:15px;color:var(--ink2)}
.site .price li::before{content:"";flex:none;width:16px;height:16px;margin-top:3px;border-radius:999px;background:radial-gradient(circle,var(--accent-hi) 0 3px,transparent 4px),rgba(111,120,216,.16)}
.site .price .btn{width:100%}
.site .fee{margin-top:18px;font-size:14px;color:var(--ink3);text-align:center}
.site .end{padding:120px 0 96px;text-align:center}
.site .end h2{margin:0 auto;max-width:18ch}
.site .name{display:flex;gap:10px;justify-content:center;margin:30px auto 0;max-width:520px}
.site .name input{flex:1;min-width:0;height:48px;padding:0 16px;border-radius:10px;border:1px solid var(--line2);background:var(--panel);color:var(--ink);font:inherit;font-size:16px;outline:0}
.site .name input::placeholder{color:var(--ink3)}
.site .name .btn{height:48px}
.site footer{border-top:1px solid var(--line);padding:26px 0 40px;font-size:13.5px;color:var(--ink3)}
.site footer .wrap{display:flex;gap:22px;align-items:center}
.site footer .wrap span:first-child{margin-right:auto}
@media (max-width:860px){
  .site .nav .links{display:none}
  .site .quiet,.site .has,.site .proof,.site .prices{grid-template-columns:1fr}
  .site .job,.site .minute{grid-template-columns:1fr;gap:24px;padding:24px}
  .site .minute{padding:0}
  .site .job:nth-child(even) .job-words{order:0}
  .site section{padding-top:80px}
  .site .live{flex-direction:column;align-items:flex-start}
  .site .name{flex-direction:column}
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

const card = (over: Partial<DiscoverCommunitySnapshot> & Pick<DiscoverCommunitySnapshot, "slug" | "name" | "one_liner">): DiscoverCommunitySnapshot => ({
  avatar_url: null, banner_url: null, visibility: "published", created_at: "", updated_at: "", ...over,
});

function Job(props: { num: string; title: string; words: string; children: ReactNode }) {
  return (
    <div className="job">
      <div className="job-words">
        <span className="num">{props.num}</span>
        <h3>{props.title}</h3>
        <p>{props.words}</p>
      </div>
      <div className="vig">{props.children}</div>
    </div>
  );
}

// The product pictures are captures of the real app on staging
// (public/design-lab/site-*.{jpg,png}), not drawings of it.
export function SiteLab() {
  const now = Date.now();
  return (
    <div className="site">
      <style>{CSS}</style>
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top"><Mark /> polynet</a>
          <nav className="links"><a href="#does">What it does</a><a href="#minute">How it starts</a><a href="#price">Pricing</a><a href="#proof">Communities</a></nav>
          <div className="right"><a href="#top">Sign in</a><button type="button" className="btn go sm">Start free</button></div>
        </div>
      </header>

      <div className="hero wrap" id="top">
        <span className="pill"><i /> Free to start · live in a minute</span>
        <h1>A community with its own <em>AI client success manager.</em></h1>
        <p className="lede">It answers your members, welcomes every new person and tells you who needs you. Your community keeps running when you can't be there.</p>
        <div className="cta">
          <button type="button" className="btn go">Start your community <Arrow /></button>
          <button type="button" className="btn">See it working</button>
        </div>
        <p className="fine">No card. The community is free for good. The manager is $79 a month, with the first 14 days free.</p>
      </div>
      <div className="shot">
        <img src="/design-lab/site-home.jpg" alt="Home, as the host of a community sees it: the guide's greeting, its brief, and what the community has learned" />
        <i aria-hidden="true" />
      </div>

      <section className="wrap">
        <span className="kick">Why communities go quiet</span>
        <h2>Nobody leaves over the content. They leave because nobody answered.</h2>
        <div className="quiet">
          <div><b>A question waits a day.</b><span>You were on a call. By the time you see it, they've stopped checking.</span></div>
          <div><b>A new member says nothing.</b><span>Nobody said hello, so they never post, and never come back.</span></div>
          <div><b>You find out when they cancel.</b><span>The signs were there for weeks. You were busy running the thing.</span></div>
        </div>
      </section>

      <section className="wrap" id="does">
        <span className="kick">What your client success manager does</span>
        <h2>The job you'd hire for, done all day.</h2>
        <p className="sub">It works from what you've taught: your lessons, your posts, your answers. It says so when it doesn't know.</p>
        <div className="jobs">
          <Job num="01" title="Answers members from what you've taught" words="A question at 2 am gets your answer, with the lesson it came from. If it isn't sure, it asks the member who knows, or leaves it for you.">
            <div className="msg"><span className="face">MO</span><div><b>Mira Okafor</b><span className="tag">Question</span><time>2:14 am</time><p>What should I charge for the first cohort? I have no audience yet.</p></div></div>
            <div className="msg"><span className="face g">✦</span><div><b>Polynet, your guide</b><time>2:14 am</time><p>Neil's rule from lesson 3: price the first cohort at what five people will pay this week, not what it's worth. Most founding cohorts here landed between $200 and $500.</p><span className="src">From Pricing your first offer · lesson 3</span></div></div>
          </Job>
          <Job num="02" title="Welcomes every new person" words="Each newcomer gets a hello by name, the one thing to do first, and an introduction to someone they should know. The first two weeks decide whether people stay.">
            <div className="msg"><span className="face g">✦</span><div><b>Polynet, your guide</b><time>9:02 am</time><p>Welcome, Jon. You said you're launching a paid newsletter. Start with lesson 1, then say hello to Dana: she launched hers here in March and offered to share her numbers.</p></div></div>
            <div className="msg"><span className="face b">DR</span><div><b>Dana Ruiz</b><time>9:20 am</time><p>Happy to! Jon, send me your draft pricing page.</p></div></div>
          </Job>
          <div className="job">
            <div className="job-words">
              <span className="num">03</span>
              <h3>Tells you who needs you</h3>
              <p>When you open the app it says what needs you today, often nothing. Beside it is a short brief of what people are working on, and everything the community has learned so far.</p>
            </div>
            <div className="vig pic"><img src="/design-lab/site-panel.png" alt="The guide's brief and the community brain, from a real community" /></div>
          </div>
        </div>
      </section>

      <section className="wrap" id="minute">
        <span className="kick">How it starts</span>
        <h2>From a name to a live community in about a minute.</h2>
        <div className="minute">
          <div className="steps">
            <ol>
              <li><b>Name it</b><span>Your address is made from the name. Add a picture and banner now or later.</span></li>
              <li><b>Say who it's for</b><span>One line, what members get, and a price if you want one. Free is the default.</span></li>
              <li><b>Share your link</b><span>Your community is live. Send the link to the first people you want in.</span></li>
            </ol>
          </div>
          <div className="cardbox">
            <small>What people see, filling in as you type</small>
            <KitApp view="home" part="flow" light={false}><DiscoverCard now={now} community={card({ slug: "dawn-patrol", name: "Dawn Patrol Run Club", one_liner: "Runners who meet before sunrise.", banner_url: "/design-lab/polynet-earth.webp", member_count: 1, host: { name: "You", avatar_url: null } })} /></KitApp>
            <div className="foot"><i /><i className="on" /><i /></div>
          </div>
        </div>
      </section>

      <section className="wrap">
        <span className="kick">Everything a community needs</span>
        <h2>One place, already put together.</h2>
        <div className="has">
          <div><b>Channels and messages</b><span>Posts, threads and direct messages, on the web and on phones.</span></div>
          <div><b>Courses</b><span>Lessons your members work through, and the manager teaches from.</span></div>
          <div><b>Events</b><span>Calls on the calendar, with who is coming.</span></div>
          <div><b>Pods</b><span>Smaller paid groups inside your community.</span></div>
          <div><b>Payments</b><span>Free, monthly or yearly. Paid out to you through Stripe.</span></div>
          <div><b>Your own page</b><span>A public page that explains the offer and takes the join.</span></div>
        </div>
      </section>

      <section className="wrap" id="proof">
        <span className="kick">See it working</span>
        <h2>Real communities, running on Polynet.</h2>
        <KitApp view="home" part="flow" light={false}><div className="proof">
          <DiscoverCard now={now} community={card({ slug: "polynet", name: "Polynet", one_liner: "Hosts building their first hundred members.", banner_url: "/design-lab/polynet-earth.webp", member_count: 214, host: { name: "Neil McDevitt", avatar_url: null }, last_active_at: new Date(now - 3_600_000).toISOString() })} />
          <DiscoverCard now={now} community={card({ slug: "de", name: "Distribution Engineering", one_liner: "Founders who own their own distribution.", member_count: 86, host: { name: "Neil McDevitt", avatar_url: null }, posts_this_week: 31 })} />
          <DiscoverCard now={now} community={card({ slug: "sunrise", name: "Sunrise Climbing Club", one_liner: "Early-morning climbers who train together.", member_count: 42, host: { name: "Maya Chen", avatar_url: null }, posts_this_week: 12 })} />
        </div></KitApp>
        <div className="live">
          <div><b>Ask our client success manager anything.</b><span>Join the Polynet community free and watch it answer. It's the same one you'd switch on in yours.</span></div>
          <button type="button" className="btn">Join the Polynet community <Arrow /></button>
        </div>
      </section>

      <section className="wrap" id="price">
        <span className="kick">Pricing</span>
        <h2>Free to run. Pay when you want the help.</h2>
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
              <li>Answers members from what you've taught</li>
              <li>Welcomes and introduces every new person</li>
              <li>A daily brief of who needs you</li>
            </ul>
            <button type="button" className="btn go">Start free, add it later</button>
          </div>
        </div>
        <p className="fee">When you charge members: 2.9% plus Stripe's fees. Nothing when it's free.</p>
      </section>

      <div className="end wrap">
        <h2>Your community is one name away.</h2>
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
