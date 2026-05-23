import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  Boxes,
  Brain,
  CalendarDays,
  Check,
  FileText,
  MessagesSquare,
  Play,
  Plug,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { recordCloudBusinessPageVisit } from "../../../../shared/cloudBusinessAnalyticsGateway";

type WebLandingPageProps = {
  onTryFree: () => void;
};

const stackItems = [
  {
    category: "AI assistance",
    vendor: "Perplexity Computer",
    domain: "perplexity.ai",
    cost: "$200",
  },
  {
    category: "Community",
    vendor: "Skool Pro",
    domain: "skool.com",
    cost: "$99",
  },
  {
    category: "Knowledge resources",
    vendor: "Notion Business",
    domain: "notion.com",
    cost: "$20",
  },
  {
    category: "Funnel + paid access",
    vendor: "ClickFunnels Scale",
    domain: "clickfunnels.com",
    cost: "$197",
  },
];

const stackTotal = "$516+";

const memoryShift: {
  source: string;
  Icon: ComponentType<{ className?: string }>;
  evaporates: string;
  compounds: string;
}[] = [
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

type CommunityThreadEvent =
  | { kind: "member"; name: string; initials: string; text: string }
  | { kind: "agent"; tool: string; text: string };

const communityThread: CommunityThreadEvent[] = [
  { kind: "member", name: "Myah", initials: "MY", text: "Review my offer page before I publish?" },
  { kind: "agent", tool: "offer playbook", text: "Tighten the CTA promise above the fold." },
  { kind: "member", name: "Jordan", initials: "JO", text: "Shared launch-teardown.mp4" },
  { kind: "agent", tool: "video.summarize", text: "4 positioning notes pulled." },
  { kind: "member", name: "Nate", initials: "NA", text: "What pricing tier should I launch at?" },
  { kind: "agent", tool: "pricing playbook", text: "Start at $97 — demand signal matches." },
  { kind: "member", name: "Kara", initials: "KA", text: "Need a follow-up email template." },
  { kind: "agent", tool: "templates.search", text: "Pulled 3 templates from the playbook." },
];

type AgentStreamEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; args: string }
  | { kind: "result"; text: string };

const agentTimeline: AgentStreamEvent[] = [
  { kind: "user", text: "Wire up my expertise as an agent." },
  { kind: "assistant", text: "On it. Pulling in your frameworks first." },
  { kind: "tool", name: "knowledge.attach", args: 'source: "frameworks/*"' },
  { kind: "result", text: "24 documents indexed" },
  { kind: "assistant", text: "Indexing your posts and videos." },
  { kind: "tool", name: "content.index", args: 'scope: "posts, videos"' },
  { kind: "result", text: "142 items embedded" },
  { kind: "assistant", text: "Importing past sessions for tone and lessons." },
  { kind: "tool", name: "calls.import", args: 'period: "6m"' },
  { kind: "result", text: "38 transcripts loaded" },
  { kind: "assistant", text: "Done. The agent has your method and voice." },
];
const flowCards = [
  {
    title: "Build the agent",
    summary: "Create the agent surface for your expertise, workflow, or point of view.",
    bullets: [
      "Add apps and MCP servers",
      "Add custom skills and workflows",
      "Set instructions and personality",
      "Attach resources, docs, links, and files",
    ],
    exampleTitle: "Agent workflow",
    examples: [
      { name: "Supabase", detail: "connected project data", status: "ready" },
      { name: "Linear", detail: "synced issues and roadmap", status: "ready" },
      { name: "Slack", detail: "indexed team context", status: "ready" },
      { name: "Docs", detail: "attached source material", status: "ready" },
    ],
  },
  {
    title: "Wrap it in a community",
    summary: "Give every member an agent that does the work — not just a place to chat.",
    bullets: [
      "Create a community around an outcome",
      "Give every member their own agent",
      "Add resources, modules, and context",
      "Let members ask, learn, and build",
    ],
    exampleTitle: "Community surface",
    examples: [
      { name: "Members", detail: "join the shared workspace", status: "active" },
      { name: "Resources", detail: "organized into modules", status: "active" },
      { name: "Threads", detail: "carry community context", status: "active" },
      { name: "Voice", detail: "opens live participation", status: "active" },
    ],
  },
  {
    title: "Compound the intelligence",
    summary: "Turn repeated member activity into reusable leverage the whole system shares.",
    bullets: [
      "See repeated questions and requests",
      "Add resources where members get stuck",
      "Turn repeat work into skills",
      "Refine instructions as patterns emerge",
    ],
    exampleTitle: "Intelligence directory",
    examples: [
      { name: "Questions", detail: "high-frequency asks appear", status: "signal" },
      { name: "Resources", detail: "new docs fill gaps", status: "signal" },
      { name: "Skills", detail: "repeat tasks become workflows", status: "signal" },
      { name: "Feedback", detail: "members reveal demand", status: "signal" },
    ],
  },
  {
    title: "Monetize",
    summary: "Turn useful access into a paid community product.",
    bullets: [
      "Gate access with memberships",
      "Charge for community access",
      "Offer premium resources and workflows",
      "Track revenue and performance",
    ],
    exampleTitle: "Revenue layer",
    examples: [
      { name: "Stripe", detail: "checkout and billing", status: "paid" },
      { name: "Access", detail: "entitlements enforced", status: "paid" },
      { name: "MRR", detail: "recurring revenue tracked", status: "paid" },
      { name: "Payouts", detail: "builder earnings flow", status: "paid" },
    ],
  },
];

type DirectoryNode = {
  title: string;
  type: "playbook" | "insight" | "example" | "warning" | "decision" | "open";
  status: "canonical" | "validating" | "promising" | "contested";
  evidence: string;
  trail: string;
  glyph: string;
};

const intelligenceDirectory: DirectoryNode[] = [
  {
    glyph: "▣",
    title: "Pricing playbook",
    type: "playbook",
    status: "canonical",
    evidence: "24 retrievals · 18 useful",
    trail: "live in every agent's context",
  },
  {
    glyph: "◐",
    title: "Auto offer review",
    type: "playbook",
    status: "validating",
    evidence: "12 outcomes · evidence observed",
    trail: "promoting to canonical",
  },
  {
    glyph: "◷",
    title: "Launch sequencing patterns",
    type: "insight",
    status: "promising",
    evidence: "4 source traces · 1 outcome",
    trail: "awaiting more evidence",
  },
  {
    glyph: "▣",
    title: "Tier-1 onboarding sequence",
    type: "playbook",
    status: "canonical",
    evidence: "38 retrievals · 32 useful",
    trail: "live in every agent's context",
  },
  {
    glyph: "◐",
    title: "Pricing tier guidance",
    type: "insight",
    status: "validating",
    evidence: "8 outcomes · evidence observed",
    trail: "promoting to canonical",
  },
  {
    glyph: "⚠",
    title: "Cold outreach · low-trust template",
    type: "warning",
    status: "contested",
    evidence: "3 outcomes · 2 negative",
    trail: "flagged for builder review",
  },
  {
    glyph: "◷",
    title: "Webinar follow-up windows",
    type: "example",
    status: "promising",
    evidence: "5 source traces",
    trail: "awaiting more evidence",
  },
];

const usageSignalEvents = [
  {
    label: "New members",
    value: "+38",
    detail: "this month",
  },
  {
    label: "Retention rate",
    value: "84%",
    detail: "member cohort",
  },
  {
    label: "Weekly active",
    value: "126",
    detail: "members engaged",
  },
  {
    label: "Agent sessions",
    value: "412",
    detail: "this week",
  },
  {
    label: "Questions answered",
    value: "1.2k",
    detail: "without founder reply",
  },
  {
    label: "Resource views",
    value: "2.7k",
    detail: "module engagement",
  },
  {
    label: "Workflow demand",
    value: "18x",
    detail: "offer teardown requests",
  },
  {
    label: "Time saved",
    value: "14.5h",
    detail: "founder leverage",
  },
];

const monetizeEvents = [
  {
    label: "New subscription",
    value: "$49/mo",
    detail: "Member joined Growth OS",
  },
  {
    label: "Community checkout",
    value: "$5",
    detail: "Tool balance added",
  },
  {
    label: "Payment succeeded",
    value: "$97",
    detail: "Premium workflow purchased",
  },
  {
    label: "MRR increased",
    value: "+$312",
    detail: "Recurring revenue this month",
  },
  {
    label: "Payout ready",
    value: "$428",
    detail: "Builder earnings pending",
  },
  {
    label: "Access granted",
    value: "paid",
    detail: "Entitlement synced from Stripe",
  },
];

const agentMotifChips = [
  { Icon: Boxes, key: "apps" },
  { Icon: Plug, key: "mcp" },
  { Icon: Sparkles, key: "skills" },
  { Icon: FileText, key: "docs" },
];

function renderFlowMotif(index: number) {
  if (index === 0) {
    return (
      <div className="polynet-landing-motif motif-agent" aria-hidden="true">
        <span className="polynet-landing-motif-core">
          <Brain />
        </span>
        {agentMotifChips.map((chip, i) => (
          <span
            className="polynet-landing-motif-spoke"
            key={chip.key}
            style={{ "--a": `${45 + i * 90}deg`, "--i": i } as CSSProperties}
          >
            <span className="polynet-landing-motif-chip">
              <chip.Icon />
            </span>
          </span>
        ))}
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="polynet-landing-motif motif-community" aria-hidden="true">
        <span className="polynet-landing-motif-core">
          <Brain />
        </span>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            className="polynet-landing-motif-spoke"
            key={`member-${i}`}
            style={{ "--a": `${i * 60}deg`, "--i": i } as CSSProperties}
          >
            <span className="polynet-landing-motif-member">
              <Users />
            </span>
          </span>
        ))}
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="polynet-landing-motif motif-compound" aria-hidden="true">
        <span className="polynet-landing-motif-ring" />
        <span className="polynet-landing-motif-orbit" />
        <span className="polynet-landing-motif-core">
          <Brain />
        </span>
      </div>
    );
  }

  return (
    <div className="polynet-landing-motif motif-revenue" aria-hidden="true">
      <svg
        className="polynet-landing-motif-curve"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="polynet-motif-curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="polynet-landing-motif-curve-area"
          d="M2,58 C30,58 50,52 68,38 C82,26 92,12 98,4 L98,58 Z"
          fill="url(#polynet-motif-curve-fill)"
        />
        <path
          className="polynet-landing-motif-curve-line"
          d="M2,58 C30,58 50,52 68,38 C82,26 92,12 98,4"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="polynet-landing-motif-curve-dot" aria-hidden="true" />
      <span className="polynet-landing-motif-dollar" aria-hidden="true">$</span>
    </div>
  );
}

function renderFlowExample(flow: (typeof flowCards)[number], index: number) {
  if (index === 0) {
    const lastAssistantSeq = agentTimeline.reduce(
      (acc, event, i) => (event.kind === "assistant" ? i : acc),
      -1,
    );
    return (
      <div className="polynet-landing-tool-stream" aria-label={flow.exampleTitle}>
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-agent-stream-window">
          <div
            className="polynet-landing-agent-stream"
            aria-label="Simulated agent harness stream"
          >
            {agentTimeline.map((event, seq) => {
              const baseStyle = { "--seq": seq } as CSSProperties;
              if (event.kind === "user") {
                return (
                  <div
                    key={`event-${seq}`}
                    className="polynet-landing-agent-event user"
                    style={baseStyle}
                  >
                    <span className="polynet-landing-agent-role">You</span>
                    <span className="polynet-landing-agent-text">{event.text}</span>
                  </div>
                );
              }
              if (event.kind === "assistant") {
                const charStyle = {
                  ...baseStyle,
                  "--chars": event.text.length,
                  "--type-ms": `${Math.max(260, event.text.length * 13)}ms`,
                } as CSSProperties;
                const isLast = seq === lastAssistantSeq;
                return (
                  <div
                    key={`event-${seq}`}
                    className={`polynet-landing-agent-event assistant${isLast ? " final" : ""}`}
                    style={charStyle}
                  >
                    <span className="polynet-landing-agent-text">{event.text}</span>
                    <span className="polynet-landing-agent-caret" aria-hidden="true" />
                  </div>
                );
              }
              if (event.kind === "tool") {
                return (
                  <div
                    key={`event-${seq}`}
                    className="polynet-landing-agent-event tool"
                    style={baseStyle}
                  >
                    <code className="polynet-landing-agent-tool-name">
                      <span aria-hidden="true">⚙</span> {event.name}
                    </code>
                    <span className="polynet-landing-agent-tool-args">({event.args})</span>
                  </div>
                );
              }
              return (
                <div
                  key={`event-${seq}`}
                  className="polynet-landing-agent-event result"
                  style={baseStyle}
                >
                  <span className="polynet-landing-agent-result-arrow" aria-hidden="true">
                    ↳
                  </span>
                  <span className="polynet-landing-agent-result-text">{event.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div
        className="polynet-landing-tool-stream polynet-landing-community-thread"
        aria-label={flow.exampleTitle}
      >
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-community-thread-window">
          <div className="polynet-landing-community-thread-track">
            {communityThread.map((event, seq) => {
              const baseStyle = { "--seq": seq } as CSSProperties;
              if (event.kind === "member") {
                return (
                  <div
                    key={`thread-${seq}`}
                    className="polynet-landing-community-line member"
                    style={baseStyle}
                  >
                    <span className="polynet-landing-community-line-avatar">
                      {event.initials}
                    </span>
                    <div>
                      <strong>{event.name}</strong>
                      <p>{event.text}</p>
                    </div>
                  </div>
                );
              }
              const isLast = seq === communityThread.length - 1;
              const typeMs = Math.max(260, event.text.length * 13);
              const charStyle = {
                ...baseStyle,
                "--type-ms": `${typeMs}ms`,
              } as CSSProperties;
              return (
                <div
                  key={`thread-${seq}`}
                  className={`polynet-landing-community-line agent${isLast ? " final" : ""}`}
                  style={charStyle}
                >
                  <span
                    className="polynet-landing-community-line-avatar agent"
                    aria-hidden="true"
                  >
                    ⚙
                  </span>
                  <div>
                    <strong className="polynet-landing-community-agent-label">
                      agent · <em>{event.tool}</em>
                    </strong>
                    <p>
                      <span className="polynet-landing-community-agent-text">
                        {event.text}
                      </span>
                      <span
                        className="polynet-landing-community-agent-caret"
                        aria-hidden="true"
                      />
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div
        className="polynet-landing-tool-stream polynet-landing-directory"
        aria-label={flow.exampleTitle}
      >
        <span>Intelligence directory · 30-day digest</span>
        <div className="polynet-landing-directory-window">
          <div className="polynet-landing-directory-track">
            {intelligenceDirectory.map((node, seq) => (
              <div
                key={node.title}
                className={`polynet-landing-directory-node ${node.status}`}
                style={{ "--seq": seq } as CSSProperties}
              >
                <span className="polynet-landing-directory-glyph" aria-hidden="true">
                  {node.glyph}
                </span>
                <div className="polynet-landing-directory-body">
                  <div className="polynet-landing-directory-head">
                    <strong>{node.title}</strong>
                    <span
                      className={`polynet-landing-directory-status ${node.status}`}
                    >
                      {node.status}
                    </span>
                  </div>
                  <span className="polynet-landing-directory-evidence">
                    <em>{node.type}</em>
                    <span className="polynet-landing-directory-dot" aria-hidden="true">
                      ·
                    </span>
                    {node.evidence}
                  </span>
                  <span className="polynet-landing-directory-trail">
                    ↳ {node.trail}
                    {node.status === "validating" ? (
                      <span
                        className="polynet-landing-directory-caret"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="polynet-landing-directory-digest">
          <span className="polynet-landing-directory-digest-glyph" aria-hidden="true">
            ⏵
          </span>
          <span>
            digesting{" "}
            <em className="polynet-landing-directory-counter">142</em> new source
            traces
            <span className="polynet-landing-directory-digest-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div
        className="polynet-landing-tool-stream polynet-landing-stripe-stream"
        aria-label={flow.exampleTitle}
      >
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-usage-stream-window">
          <div className="polynet-landing-usage-stream-track polynet-landing-stripe-stream-track">
            {monetizeEvents.map((event, eventIndex) => (
              <div
                key={`${event.label}-${event.value}`}
                className="polynet-landing-usage-event polynet-landing-stripe-event"
                style={{ "--usage-index": eventIndex } as CSSProperties}
              >
                <div>
                  <strong>{event.label}</strong>
                  <p>{event.detail}</p>
                </div>
                <em>{event.value}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="polynet-landing-tool-stream" aria-label={flow.exampleTitle}>
      <span>{flow.exampleTitle}</span>
      {flow.examples.map((example) => (
        <div key={`${flow.title}-${example.name}`} className="polynet-landing-tool-call">
          <span>{example.name.slice(0, 2)}</span>
          <div>
            <strong>{example.name}</strong>
            <em>{example.detail}</em>
          </div>
          <small>{example.status}</small>
        </div>
      ))}
    </div>
  );
}

export function WebLandingPage(props: WebLandingPageProps) {
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [isFlowPinned, setIsFlowPinned] = useState(false);
  const mobileFlowRef = useRef<HTMLDivElement | null>(null);
  const activeFlow = flowCards[activeFlowIndex] ?? flowCards[0];

  useEffect(() => {
    void recordCloudBusinessPageVisit({
      pathKind: "home",
    }).catch((error) => {
      console.warn("Failed to record business page visit:", error);
    });
  }, []);

  useEffect(() => {
    if (isFlowPinned || typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveFlowIndex((current) => (current + 1) % flowCards.length);
    }, 7500);

    return () => window.clearInterval(interval);
  }, [isFlowPinned]);

  useEffect(() => {
    const carousel = mobileFlowRef.current;
    if (!carousel) {
      return;
    }

    const slide = carousel.children.item(activeFlowIndex);
    if (!(slide instanceof HTMLElement)) {
      return;
    }

    carousel.scrollTo({
      left: slide.offsetLeft,
      behavior: isFlowPinned ? "smooth" : "auto",
    });
  }, [activeFlowIndex, isFlowPinned]);

  function handleMobileFlowScroll() {
    const carousel = mobileFlowRef.current;
    if (!carousel) {
      return;
    }

    const nextIndex = Math.round(carousel.scrollLeft / Math.max(carousel.clientWidth, 1));
    const clampedIndex = Math.max(0, Math.min(flowCards.length - 1, nextIndex));
    if (clampedIndex !== activeFlowIndex) {
      setActiveFlowIndex(clampedIndex);
    }
  }

  return (
    <div className="polynet-landing-page">
      <section className="polynet-landing-hero" aria-labelledby="polynet-landing-title">
        <nav className="polynet-landing-nav" aria-label="Polynet">
          <a className="polynet-landing-brand" href="/">
            <img src="/favicon.svg" alt="" />
            <span>Polynet</span>
          </a>
          <div className="polynet-landing-nav-actions">
            <button type="button" className="primary" onClick={props.onTryFree}>
              Try Polynet free
            </button>
          </div>
        </nav>

        <div className="polynet-landing-hero-grid">
          <div className="polynet-landing-copy">
            <p className="polynet-landing-kicker">Services as software</p>
            <h1 id="polynet-landing-title">
              Turn your expertise into a community that{" "}
              <span>executes for every member</span>.
            </h1>
            <p className="polynet-landing-subcopy">
              Package your expertise once. Every member gets an agent that does
              the work — and every interaction makes the system smarter.
            </p>
            <div className="polynet-landing-cta-row">
              <button type="button" className="primary" onClick={props.onTryFree}>
                Try Polynet free
              </button>
            </div>
          </div>

          <div
            className="polynet-landing-video"
            aria-label="Polynet demo preview"
          >
            <span className="polynet-landing-video-topline">Watch the 2-minute demo</span>
            <span className="polynet-landing-video-stage">
              <span className="polynet-landing-demo-card" aria-hidden="true">
                <span className="polynet-landing-demo-network">
                  <span className="polynet-landing-demo-node top">Knowledge</span>
                  <span className="polynet-landing-demo-node right">Members</span>
                  <span className="polynet-landing-demo-node bottom">Offers</span>
                  <span className="polynet-landing-demo-node left">Feedback</span>
                  <span className="polynet-landing-demo-brain">
                    <Brain />
                  </span>
                  <span className="polynet-landing-demo-play">
                    <Play />
                  </span>
                </span>
                <strong>How services become software</strong>
                <p>
                  Turn expertise into a community agent members can learn from,
                  build with, and pay to access.
                </p>
              </span>
            </span>
          </div>
        </div>
      </section>

      <section
        className="polynet-landing-section polynet-landing-memory"
        aria-labelledby="polynet-landing-memory-title"
      >
        <div className="polynet-landing-memory-head">
          <p className="polynet-landing-kicker">Why it compounds</p>
          <h2 id="polynet-landing-memory-title">
            Expertise either evaporates or compounds.
          </h2>
          <p>
            In most communities, what people know leaks away — trapped in heads,
            buried in chats, forgotten after every call. On Polynet, the same
            signal feeds one shared memory your agent executes on, so the system
            gets smarter with every interaction.
          </p>
        </div>
        <div className="polynet-landing-memory-visual" aria-hidden="true">
          <div className="polynet-landing-memory-fan evaporates">
            <span className="polynet-landing-memory-fan-tag">Evaporates</span>
            <div className="polynet-landing-memory-fan-stage">
              <span className="polynet-landing-memory-fan-core" />
              {memoryShift.map((row, index) => (
                <span
                  className="polynet-landing-memory-spoke"
                  key={`scatter-${row.source}`}
                  style={
                    { "--a": `${-150 + index * 30}deg`, "--i": index } as CSSProperties
                  }
                >
                  <span className="polynet-landing-memory-spoke-chip">
                    <row.Icon className="polynet-landing-memory-spoke-icon" />
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="polynet-landing-memory-fan compounds">
            <span className="polynet-landing-memory-fan-tag">Compounds</span>
            <div className="polynet-landing-memory-fan-stage">
              <span className="polynet-landing-memory-feedback" aria-hidden="true" />
              <span className="polynet-landing-memory-fan-core">
                <Brain className="polynet-landing-memory-core-icon" />
              </span>
              {memoryShift.map((row, index) => (
                <span
                  className="polynet-landing-memory-spoke"
                  key={`hub-${row.source}`}
                  style={
                    { "--a": `${-150 + index * 30}deg`, "--i": index } as CSSProperties
                  }
                >
                  <span className="polynet-landing-memory-spoke-chip">
                    <row.Icon className="polynet-landing-memory-spoke-icon" />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="polynet-landing-memory-table">
          <div className="polynet-landing-memory-row head">
            <span className="polynet-landing-memory-source" aria-hidden="true" />
            <span className="polynet-landing-memory-col evaporates">
              Without shared memory
            </span>
            <span className="polynet-landing-memory-col compounds">
              With Polynet
            </span>
          </div>
          {memoryShift
            .filter((row) => row.source === "People" || row.source === "Chats" || row.source === "Workflows")
            .map((row) => (
              <div className="polynet-landing-memory-row" key={row.source}>
                <span className="polynet-landing-memory-source">
                  <row.Icon className="polynet-landing-memory-source-icon" />
                  {row.source}
                </span>
                <span className="polynet-landing-memory-cell evaporates">
                  <X className="polynet-landing-memory-mark" aria-hidden="true" />
                  {row.evaporates}
                </span>
                <span className="polynet-landing-memory-cell compounds">
                  <Check className="polynet-landing-memory-mark" aria-hidden="true" />
                  {row.compounds}
                </span>
              </div>
            ))}
          <div className="polynet-landing-memory-row foot">
            <span className="polynet-landing-memory-source" aria-hidden="true" />
            <span className="polynet-landing-memory-foot evaporates">
              The people learn. The community forgets.
            </span>
            <span className="polynet-landing-memory-foot compounds">
              The group learns. The system gets smarter.
            </span>
          </div>
        </div>
      </section>

      <section className="polynet-landing-section compact" aria-labelledby="polynet-landing-flow">
        <div>
          <p className="polynet-landing-kicker">How it works</p>
          <h2 id="polynet-landing-flow">Turn expertise into a useful system.</h2>
        </div>
        <div className="polynet-landing-flow">
          {flowCards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              className={index === activeFlowIndex ? "active" : undefined}
              aria-pressed={index === activeFlowIndex}
              onBlur={() => setIsFlowPinned(false)}
              onClick={() => {
                setActiveFlowIndex(index);
                setIsFlowPinned(true);
              }}
              onFocus={() => {
                setActiveFlowIndex(index);
                setIsFlowPinned(true);
              }}
              onMouseEnter={() => {
                setActiveFlowIndex(index);
                setIsFlowPinned(true);
              }}
              onMouseLeave={() => setIsFlowPinned(false)}
            >
              <span className="polynet-landing-flow-card-step">Step {index + 1}</span>
              {renderFlowMotif(index)}
              <span className="polynet-landing-flow-card-label">{card.title}</span>
            </button>
          ))}
        </div>
        <div className="polynet-landing-flow-detail" aria-live="polite">
          <div
            className={`polynet-landing-flow-active-visual step-${activeFlowIndex}`}
            aria-hidden="true"
          >
            {renderFlowMotif(activeFlowIndex)}
          </div>
          <div className="polynet-landing-flow-copy">
            <span>Step {activeFlowIndex + 1} of {flowCards.length}</span>
            <h3>{activeFlow.title}</h3>
            <p>{activeFlow.summary}</p>
            <ul>
              {activeFlow.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
          {renderFlowExample(activeFlow, activeFlowIndex)}
        </div>
        <div
          ref={mobileFlowRef}
          className="polynet-landing-flow-mobile-carousel"
          aria-label="How Polynet works"
          onPointerDown={() => setIsFlowPinned(true)}
          onScroll={handleMobileFlowScroll}
        >
          {flowCards.map((card, index) => (
            <article
              key={`mobile-${card.title}`}
              className="polynet-landing-flow-mobile-slide"
              aria-label={`Step ${index + 1}: ${card.title}`}
            >
              <div className="polynet-landing-flow-mobile-top">
                <div className={`polynet-landing-flow-active-visual step-${index}`} aria-hidden="true">
                  {renderFlowMotif(index)}
                </div>
                {renderFlowExample(card, index)}
              </div>
              <div className="polynet-landing-flow-copy">
                <span>Step {index + 1} of {flowCards.length}</span>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
                <ul>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
        <div className="polynet-landing-flow-dots" aria-label="How it works slides">
          {flowCards.map((card, index) => (
            <button
              key={`dot-${card.title}`}
              type="button"
              className={index === activeFlowIndex ? "active" : undefined}
              aria-label={`Show ${card.title}`}
              aria-current={index === activeFlowIndex ? "step" : undefined}
              onClick={() => {
                setActiveFlowIndex(index);
                setIsFlowPinned(true);
              }}
            />
          ))}
        </div>
      </section>

      <section className="polynet-landing-section comparison" aria-labelledby="polynet-landing-stack">
        <div className="polynet-landing-comparison-copy">
          <p className="polynet-landing-kicker">Stack comparison</p>
          <h2 id="polynet-landing-stack">
            One system instead of five subscriptions.
          </h2>
          <p>
            Polynet compresses agents, community, resources, funnels, and paid
            access into one collective intelligence system.
          </p>
        </div>
        <div className="polynet-landing-comparison">
          <div className="polynet-landing-stack-list">
            <div className="polynet-landing-stack-header">
              <span>Example monthly stack</span>
              <strong>{stackTotal}/mo</strong>
            </div>
            {stackItems.map((item) => (
              <div key={`${item.category}-${item.vendor}`} className="polynet-landing-stack-row">
                <span className="polynet-landing-stack-vendor">
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

          <button type="button" className="polynet-landing-polynet-plan" onClick={props.onTryFree}>
            <div>
              <img src="/favicon.svg" alt="" />
              <span>Polynet</span>
            </div>
            <strong>Free</strong>
            <p>Build two communities, launch your agent, and monetize access from one platform.</p>
          </button>
        </div>
      </section>

      <section className="polynet-landing-offer" aria-labelledby="polynet-landing-offer">
        <div>
          <p className="polynet-landing-kicker">One builder system</p>
          <h2 id="polynet-landing-offer">
            One place to build, distribute, and monetize useful agents.
          </h2>
        </div>
        <div className="polynet-landing-offer-actions">
          <div className="polynet-landing-offer-plan">
            <span>Free account</span>
            <ul>
              <li>Build two communities</li>
              <li>Join and use communities</li>
              <li>Launch an agent-powered member experience</li>
              <li>Monetize access with Stripe</li>
            </ul>
            <button type="button" onClick={props.onTryFree}>
              Continue free
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
