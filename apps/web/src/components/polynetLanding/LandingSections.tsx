/* Page sections — composed by app.jsx */
// @ts-nocheck
import { useState as useStateS } from "react";
import {
  Brain,
  CalendarDays,
  Check,
  FileText,
  MessagesSquare,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { NetworkVisualization } from "./NetworkVisualization";

const memoryShift = [
  {
    source: "People",
    Icon: Users,
    evaporates: "Knowledge trapped in people",
    compounds: "Expertise packaged into an agent",
  },
  {
    source: "Chats",
    Icon: MessagesSquare,
    evaporates: "Decisions buried in chats",
    compounds: "Decisions captured in shared memory",
  },
  {
    source: "Docs",
    Icon: FileText,
    evaporates: "Context lost in files",
    compounds: "Docs become retrievable context",
  },
  {
    source: "Meetings",
    Icon: CalendarDays,
    evaporates: "Insights forgotten after the call",
    compounds: "Insights synthesized and reused",
  },
  {
    source: "Workflows",
    Icon: Workflow,
    evaporates: "Work reinvented every time",
    compounds: "Workflows run on demand",
  },
];

function useReveal() {
  // No-op: see index.html for note on why scroll reveal is disabled.
}

function TopNav({ onJoin }) {
  const [menuOpen, setMenuOpen] = useStateS(false);
  return (
    <nav className="topnav">
      <div className="wrap inner">
        <a href="#" className="lockup">
          <img src="/landing-polynet/logo.png" alt="Polynet" />
          <div className="name">Polynet<span className="dot">.</span></div>
        </a>
        <button className="nav-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`links${menuOpen ? ' open' : ''}`}>
          <a href="#argument" onClick={() => setMenuOpen(false)}>Thesis</a>
          <a href="#network" onClick={() => setMenuOpen(false)}>Network</a>
          <a href="#memory" onClick={() => setMenuOpen(false)}>Memory</a>
          <a href="#pillars" onClick={() => setMenuOpen(false)}>Product</a>
          <a href="#communities" onClick={() => setMenuOpen(false)}>Snapshot</a>
          <a href="#stack" onClick={() => setMenuOpen(false)}>Stack</a>
          <button className="btn btn-primary" style={{ padding: '10px 18px', fontSize: 14 }} onClick={() => { setMenuOpen(false); onJoin(); }}>
            Try Polynet free <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function Hero({ onJoin }) {
  return (
    <section className="hero">
      <div className="bg">
        <div className="grid-bg" />
        <div className="globe" />
      </div>
      <div className="wrap content">
        <h1 className="h-display headline">
          Build an <em>Intelligence Network</em> that Compounds.
        </h1>
        <p className="sub">
          Build your agents. Deploy to everyone. Compound with every interaction. Scale without hiring.
        </p>

        <div className="cta-row">
          <button className="btn btn-primary" onClick={onJoin}>
            Try Polynet free
            <span className="arrow">→</span>
          </button>
          <a className="btn btn-ghost" href="#argument">
            Read the thesis
          </a>
        </div>

        <div className="meta">
          <div>
            <div className="k">PREMISE</div>
            <div className="v">"Software is eating the world." — Andreessen, 2011. Now it's coming for services.</div>
          </div>
          <div>
            <div className="k">IMPLICATION</div>
            <div className="v">Today's org chart was built for a world without AI. Now that agents deliver services, the org chart becomes software.</div>
          </div>
          <div>
            <div className="k">SHAPE</div>
            <div className="v">Companies stop looking like hierarchies. They start looking like networks with shared memory.</div>
          </div>
          <div>
            <div className="k">STAKES</div>
            <div className="v">Those who are building this way today are compounding and out-accelerating their competitors. The race has already started.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  const phrases = [
    'SERVICES AS SOFTWARE',
    'HIERARCHY → INTELLIGENCE',
    'AGENTS RUN THE WORK',
    'COMMUNITIES SHIP LIKE COMPANIES',
    'SHARED MEMORY IS THE MOAT',
    'NO ORG CHART, NO BOTTLENECK',
    'PEER-TO-PEER COORDINATION',
  ];
  const line = phrases.join('    \u25c6    ');
  return (
    <div className="marquee">
      <div className="track">
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}

function Argument() {
  return (
    <section className="argument" id="argument">
      <div className="wrap">
        <div className="reveal arg-head" style={{ marginBottom: 48 }}>
          <div>
            <div className="micro" style={{ marginBottom: 14 }}>/01 · THE THESIS</div>
            <h2 className="h-1">A logical argument,<br />in three moves.</h2>
          </div>
          <p className="body-lg" style={{ maxWidth: 460 }}>
            Each step is uncontroversial on its own. Strung together, they describe an inevitability: the company is becoming a network.
          </p>
        </div>

        <div className="grid">
          <div className="step reveal d1">
            <div className="n">/01 — IF</div>
            <div className="claim">Software ate the <em>world</em>.</div>
            <p className="body">Every category that could be digitized was — distribution, finance, communication, transportation, work itself. The remaining frontier was always going to be the thing software couldn't yet touch: judgment.</p>
            <div className="arrow-down">↓ AND THEN</div>
          </div>
          <div className="step reveal d2">
            <div className="n">/02 — AND</div>
            <div className="claim"><em>AI</em> is eating services.</div>
            <p className="body">Legal review. Accounting. Recruiting. Design. Strategy. Sales. The work that humans were paid to do — interpret context, generate output, decide — is now something models do continuously, in parallel, for cents.</p>
            <div className="arrow-down">↓ THEREFORE</div>
          </div>
          <div className="step reveal d3">
            <div className="n">/03 — THEN</div>
            <div className="claim">The <em>hierarchy</em> collapses.</div>
            <p className="body">Hierarchies exist to coordinate humans doing services. When agents do the services, the layers built to manage them stop earning their keep. What's left is a flat mesh of people and agents — a network with shared memory.</p>
            <div className="arrow-down">→ POLYNET</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function NetworkSection() {
  return (
    <section className="network-vis" id="network">
      <div className="wrap">
        <div className="head">
          <div>
            <div className="label">/02 · THE SHAPE</div>
            <h2 className="h-1">The org chart<br />is a network now.</h2>
          </div>
          <div>
            <p className="body-lg">Hierarchies were a workaround for the fact that information was lossy and humans were the only nodes. Both constraints just disappeared. The chart flips as you scroll into it — toggle to compare.</p>
          </div>
        </div>
        <NetworkVisualization />
        <div className="ooda-grid">
          {[
            ['Observe', 'quarterly reports', 'continuous sensors'],
            ['Orient', 'committee review', 'continuous learning'],
            ['Decide', 'meeting cadence', 'real-time'],
            ['Act', 'assign → wait', 'agents execute'],
          ].map(([k, before, after], i) => (
            <div className="ooda-cell" key={k}>
              <div style={{ color: 'var(--ink-3)' }}>/{(i+1).toString().padStart(2,'0')}</div>
              <div style={{ color: 'var(--ink)', marginTop: 4, marginBottom: 12, letterSpacing: '0.16em' }}>{k}</div>
              <div style={{ color: 'var(--ink-2)', textDecoration: 'line-through', opacity: 0.75 }}>{before}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'oklch(0.72 0.14 155)', fontSize: 13 }}>→</span>
                <span style={{ color: 'var(--ink)' }}>{after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MemorySection() {
  const tableRows = memoryShift.filter(
    (row) => row.source === "People" || row.source === "Chats" || row.source === "Workflows",
  );
  return (
    <section className="memory-section" id="memory" aria-labelledby="memory-title">
      <div className="wrap">
        <div className="head reveal">
          <div>
            <div className="micro" style={{ marginBottom: 14 }}>/03 · THE MECHANISM</div>
            <h2 id="memory-title" className="h-1">
              Expertise either evaporates or compounds.
            </h2>
          </div>
          <p className="body-lg" style={{ maxWidth: 520 }}>
            In a hierarchy, information leaks away — trapped in heads, buried in chats, forgotten after every call. In a network with shared memory, the same signal compounds into something the whole system can execute on.
          </p>
        </div>

        <div className="memory-visual" aria-hidden="true">
          <div className="memory-fan evaporates">
            <span className="memory-fan-tag">Evaporates</span>
            <div className="memory-fan-stage">
              <span className="memory-fan-core" />
              {memoryShift.map((row, index) => (
                <span
                  className="memory-spoke"
                  key={`scatter-${row.source}`}
                  style={{ "--a": `${-150 + index * 30}deg`, "--i": index }}
                >
                  <span className="memory-spoke-chip">
                    <row.Icon className="memory-spoke-icon" />
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="memory-fan compounds">
            <span className="memory-fan-tag">Compounds</span>
            <div className="memory-fan-stage">
              <span className="memory-feedback" aria-hidden="true" />
              <span className="memory-fan-core">
                <Brain className="memory-core-icon" />
              </span>
              {memoryShift.map((row, index) => (
                <span
                  className="memory-spoke"
                  key={`hub-${row.source}`}
                  style={{ "--a": `${-150 + index * 30}deg`, "--i": index }}
                >
                  <span className="memory-spoke-chip">
                    <row.Icon className="memory-spoke-icon" />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="memory-table">
          <div className="memory-row head">
            <span className="memory-source" aria-hidden="true" />
            <span className="memory-col evaporates">Without shared memory</span>
            <span className="memory-col compounds">With Polynet</span>
          </div>
          {tableRows.map((row) => (
            <div className="memory-row" key={row.source}>
              <span className="memory-source">
                <row.Icon className="memory-source-icon" />
                {row.source}
              </span>
              <span className="memory-cell evaporates">
                <X className="memory-mark" aria-hidden="true" />
                {row.evaporates}
              </span>
              <span className="memory-cell compounds">
                <Check className="memory-mark" aria-hidden="true" />
                {row.compounds}
              </span>
            </div>
          ))}
          <div className="memory-row foot">
            <span className="memory-source" aria-hidden="true" />
            <span className="memory-foot evaporates">
              The people learn. The community forgets.
            </span>
            <span className="memory-foot compounds">
              The group learns. The system gets smarter.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Brand-native pillar glyphs — each is a fragment of the network motif
   tuned to telegraph that pillar's specific idea. All share the node + edge
   vocabulary so they read as one family. */

const GlyphCompose = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* Loose nodes being wired into a graph */}
    <g stroke="#d63a47" strokeWidth="1.4">
      <line x1="12" y1="14" x2="32" y2="32" />
      <line x1="52" y1="14" x2="32" y2="32" />
      <line x1="12" y1="50" x2="32" y2="32" />
      <line x1="52" y1="50" x2="32" y2="32" />
      <line x1="12" y1="14" x2="12" y2="50" strokeDasharray="2 3" opacity="0.4" />
      <line x1="52" y1="14" x2="52" y2="50" strokeDasharray="2 3" opacity="0.4" />
    </g>
    <g fill="#17171a" stroke="#d63a47" strokeWidth="1.4">
      <circle cx="12" cy="14" r="4" />
      <circle cx="52" cy="14" r="4" />
      <circle cx="12" cy="50" r="4" />
      <circle cx="52" cy="50" r="4" />
    </g>
    <circle cx="32" cy="32" r="6" fill="#d63a47" />
  </svg>
);

const GlyphDeploy = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* A packaged node, trailing copies — services being deployed */}
    <g stroke="#d63a47" strokeWidth="1.4" fill="none">
      <rect x="20" y="20" width="24" height="24" rx="4" />
      <rect x="14" y="26" width="24" height="24" rx="4" opacity="0.5" />
      <rect x="8" y="32" width="24" height="24" rx="4" opacity="0.25" />
    </g>
    <circle cx="32" cy="32" r="5" fill="#d63a47" />
    <g stroke="#d63a47" strokeWidth="1.4">
      <line x1="32" y1="20" x2="32" y2="8" />
      <line x1="44" y1="32" x2="56" y2="32" />
    </g>
    <g fill="#d63a47">
      <circle cx="32" cy="8" r="3" />
      <circle cx="56" cy="32" r="3" />
    </g>
  </svg>
);

const GlyphRemember = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* A memory core with edges streaming in from all sides */}
    <g stroke="#d63a47" strokeWidth="1.4" opacity="0.8">
      <line x1="8" y1="14" x2="28" y2="30" />
      <line x1="56" y1="14" x2="36" y2="30" />
      <line x1="8" y1="50" x2="28" y2="34" />
      <line x1="56" y1="50" x2="36" y2="34" />
      <line x1="32" y1="6" x2="32" y2="24" />
      <line x1="32" y1="58" x2="32" y2="40" />
    </g>
    <g fill="#17171a" stroke="#d63a47" strokeWidth="1.2">
      <circle cx="8" cy="14" r="3" />
      <circle cx="56" cy="14" r="3" />
      <circle cx="8" cy="50" r="3" />
      <circle cx="56" cy="50" r="3" />
      <circle cx="32" cy="6" r="3" />
      <circle cx="32" cy="58" r="3" />
    </g>
    {/* Central memory ring */}
    <circle cx="32" cy="32" r="10" fill="none" stroke="#d63a47" strokeWidth="1.4" />
    <circle cx="32" cy="32" r="4" fill="#d63a47" />
  </svg>
);

const GlyphScale = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* A single node branching into many — network growth */}
    <g stroke="#d63a47" strokeWidth="1.4">
      <line x1="14" y1="32" x2="32" y2="20" />
      <line x1="14" y1="32" x2="32" y2="44" />
      <line x1="32" y1="20" x2="50" y2="10" />
      <line x1="32" y1="20" x2="50" y2="26" />
      <line x1="32" y1="44" x2="50" y2="38" />
      <line x1="32" y1="44" x2="50" y2="54" />
    </g>
    <g fill="#d63a47">
      <circle cx="14" cy="32" r="5" />
    </g>
    <g fill="#17171a" stroke="#d63a47" strokeWidth="1.4">
      <circle cx="32" cy="20" r="3.5" />
      <circle cx="32" cy="44" r="3.5" />
    </g>
    <g fill="#d63a47" opacity="0.85">
      <circle cx="50" cy="10" r="2.5" />
      <circle cx="50" cy="26" r="2.5" />
      <circle cx="50" cy="38" r="2.5" />
      <circle cx="50" cy="54" r="2.5" />
    </g>
  </svg>
);

function Pillars() {
  const cells = [
    {
      n: '/01', name: 'BUILD', icon: <GlyphCompose />,
      title: 'Build the agent.',
      body: 'Wire apps, MCP servers, skills, workflows, docs and files into an agent that knows your method and your voice.',
    },
    {
      n: '/02', name: 'DEPLOY', icon: <GlyphDeploy />,
      title: 'Deploy to everyone.',
      body: 'Ship it as a paid service to your community, or roll it out across your team. Every member gets their own agent doing the work — not just a place to chat.',
    },
    {
      n: '/03', name: 'COMPOUND', icon: <GlyphRemember />,
      title: 'Compound with usage.',
      body: 'Every conversation, every outcome writes back. Patterns crystallize into playbooks. The system gets smarter the more it runs.',
    },
    {
      n: '/04', name: 'SCALE', icon: <GlyphScale />,
      title: 'Grow revenue, not headcount.',
      body: 'More members, more compounding, more revenue — on the same lean team. Throughput scales on a network curve, not a headcount curve.',
    },
  ];
  return (
    <section className="pillars" id="pillars">
      <div className="wrap">
        <div className="head reveal">
          <div>
            <div className="micro" style={{ marginBottom: 14 }}>/04 · THE PRODUCT</div>
            <h2 className="h-1">Four primitives.<br />One operating layer.</h2>
          </div>
          <p className="body-lg">Polynet is a substrate for running an organization as a network of people and agents. The product is four primitives that compose into anything you'd otherwise hire a company to do.</p>
        </div>
        <div className="grid">
          {cells.map(c => (
            <div className="cell reveal" key={c.name}>
              <div className="num">{c.n}</div>
              <div className="icon">{c.icon}</div>
              <div className="name">{c.name}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Communities() {
  const eventTypes = [
    { tk: 'COMMUNITY', label: 'Community launched' },
    { tk: 'AGENT', label: 'Agent shipped' },
    { tk: 'MEMBER', label: 'Member joined' },
    { tk: 'MEMORY', label: 'Playbook promoted' },
    { tk: 'REVENUE', label: 'Payout cleared' },
  ];
  return (
    <section className="communities snapshot" id="communities">
      <div className="wrap">
        <div className="head reveal">
          <div className="micro" style={{ marginBottom: 14 }}>/05 · SNAPSHOT FROM POLYNET</div>
          <h2 className="h-1" style={{maxWidth: 1000}}>
            A live view into the network.
          </h2>
          <p className="body-lg" style={{marginTop:18, maxWidth:680}}>
            Public activity from networks running on Polynet. Sanitized for privacy. Refreshed weekly.
          </p>
        </div>
        <div className="snapshot-panel reveal">
          <div className="snapshot-header">
            <span className="snapshot-status">
              <span className="snapshot-status-dot" aria-hidden="true" />
              Live feed coming online
            </span>
            <span className="snapshot-meta">Public-safe projection · v0</span>
          </div>
          <div className="snapshot-legend">
            <div className="snapshot-legend-head">Events that populate here</div>
            <ul className="snapshot-legend-list">
              {eventTypes.map((event) => (
                <li className="snapshot-legend-row" key={event.tk}>
                  <span className="snapshot-legend-tk">{event.tk}</span>
                  <span className="snapshot-legend-label">{event.label}</span>
                  <span className="snapshot-legend-bar" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
          <div className="snapshot-foot">
            Real network activity will appear here as the public-safe data contract ships. No fabricated metrics, no member names — only what networks consent to share.
          </div>
        </div>
      </div>
    </section>
  );
}

function StackCollapse({ onJoin }) {
  const stackItems = [
    { category: 'AI assistance', vendor: 'Perplexity Pro', domain: 'perplexity.ai', cost: '$200' },
    { category: 'Community', vendor: 'Skool', domain: 'skool.com', cost: '$99' },
    { category: 'Knowledge resources', vendor: 'Notion Business', domain: 'notion.com', cost: '$20' },
    { category: 'Funnel + paid access', vendor: 'ClickFunnels Scale', domain: 'clickfunnels.com', cost: '$197' },
  ];
  return (
    <section className="stack-collapse" id="stack">
      <div className="wrap">
        <div className="head reveal">
          <div>
            <div className="micro" style={{ marginBottom: 14 }}>/06 · THE STACK COLLAPSES</div>
            <h2 className="h-1">
              Four tools. Four silos.<br />No shared memory.
            </h2>
          </div>
          <p className="body-lg" style={{ maxWidth: 460 }}>
            The hierarchical stack: one tool per layer, none of them talking. Information evaporates between the cracks. The bill stacks up anyway.
          </p>
        </div>

        <div className="stack-grid">
          <div className="stack-old">
            <div className="stack-old-header">
              <span>Example monthly stack</span>
              <strong>$516+/mo</strong>
            </div>
            {stackItems.map((item) => (
              <div className="stack-old-row" key={`${item.category}-${item.vendor}`}>
                <span className="stack-old-vendor">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`}
                    alt=""
                  />
                  <span>
                    <strong>{item.vendor}</strong>
                    <em>{item.category}</em>
                  </span>
                </span>
                <strong>{item.cost}/mo</strong>
              </div>
            ))}
          </div>

          <button type="button" className="stack-new" onClick={onJoin}>
            <div className="stack-new-arrow" aria-hidden="true">→</div>
            <div className="stack-new-brand">
              <img src="/landing-polynet/logo.png" alt="" />
              <span>Polynet</span>
            </div>
            <strong>Free</strong>
            <p>One operating layer. One memory. One bill.</p>
            <span className="stack-new-cta">
              Try Polynet free <span className="arrow">→</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="manifesto">
      <div className="wrap inner">
        <div className="grid">
          <div className="left">
            <div className="label">/07 · THE CLAIM</div>
            <div className="lead">
              <span className="num">01 / 01</span>
              An argument made in eight sections. It ends here.
            </div>
          </div>
          <div className="right">
            <h2>
              <span className="quiet">The next decade's defining companies won't </span>
              <span className="strike">look like companies</span>
              <span className="quiet">. They'll look like </span>
              <span className="pink">networks that ship</span>
              <span className="quiet">.</span>
            </h2>
            <div className="coda">
              <span className="sig">
                <img src="/landing-polynet/logo.png" alt="" />
                Polynet — from hierarchy to intelligence.
              </span>
              <span style={{flex:1, minWidth:200}}>
                The operating layer for them. Built for the people and agents wiring up what comes after the hierarchy — not in five years, now.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA({ onJoin }) {
  return (
    <section className="cta" id="join">
      <div className="wrap inner">
        <div>
          <div className="micro" style={{ marginBottom: 14, color: 'var(--pink)' }}>/08 · NOW</div>
          <h2>Join the network<br />before it joins <em>you</em>.</h2>
        </div>
        <div className="right">
          <p>Build your agent. Wrap it in a community. Monetize access. Free to start.</p>
          <button className="btn btn-primary open-btn" onClick={onJoin}>
            <span>Try Polynet free</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="row">
          <div className="col">
            <a href="#" className="lockup">
              <img src="/landing-polynet/logo.png" alt="" />
              <div className="name">Polynet<span className="dot">.</span></div>
            </a>
            <div className="blurb">The operating layer for the network organization. Built for the world after the hierarchy.</div>
          </div>
          <div className="col">
            <h4>Product</h4>
            <a href="#pillars">Build</a>
            <a href="#pillars">Deploy</a>
            <a href="#pillars">Compound</a>
            <a href="#pillars">Scale</a>
          </div>
          <div className="col">
            <h4>Argument</h4>
            <a href="#argument">Thesis</a>
            <a href="#network">Network shape</a>
            <a href="#memory">Memory mechanism</a>
            <a href="#communities">Snapshot</a>
            <a href="#stack">Stack collapse</a>
          </div>
          <div className="col">
            <h4>Company</h4>
            <a href="#">Manifesto</a>
            <a href="#">Careers · 04</a>
            <a href="#">Press kit</a>
            <a href="#">hello@polynet.dev</a>
          </div>
        </div>
        <div className="legal">
          <span>© POLYNET 2026 · BUILT ON A NETWORK</span>
          <span>SAN FRANCISCO · LISBON · NEW YORK</span>
        </div>
      </div>
    </footer>
  );
}

export {
  TopNav,
  Hero,
  Marquee,
  Argument,
  NetworkSection,
  MemorySection,
  Pillars,
  Communities,
  StackCollapse,
  Manifesto,
  FinalCTA,
  SiteFooter,
};
