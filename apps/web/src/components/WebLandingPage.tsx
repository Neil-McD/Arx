import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Brain, Play } from "lucide-react";
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

const buildAgentStream = [
  {
    call: "project.search",
    detail: "connected project tables",
    result: "Project data is available to the agent.",
  },
  {
    call: "linear.read",
    detail: "synced issues and roadmap",
    result: "Open work and priorities are now in context.",
  },
  {
    call: "slack.search",
    detail: "indexed team context",
    result: "Recent decisions and conversations are searchable.",
  },
  {
    call: "docs.attach",
    detail: "attached source material",
    result: "Canonical docs are ready for retrieval.",
  },
];

const buildAgentResearchStream = [
  {
    call: "polynet.search",
    detail: "searched platform docs",
    result: "Found community intelligence primitives.",
  },
  {
    call: "web.search",
    detail: "checked external context",
    result: "Compared language against the market.",
  },
  {
    call: "community.reference",
    detail: "loaded community intelligence",
    result: "Positioning and examples are ready.",
  },
];

const flowCards = [
  {
    title: "Build the agent",
    image: "/landing/build-agent.png",
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
    image: "/landing/wrap-community.png",
    summary: "Give the agent a home where members can use it together.",
    bullets: [
      "Create a community around an outcome",
      "Give members access to the agent",
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
    title: "Improve with usage",
    image: "/landing/improve-usage.png",
    summary: "Use repeated member activity to make the system more useful over time.",
    bullets: [
      "See repeated questions and requests",
      "Add resources where members get stuck",
      "Turn repeat work into skills",
      "Refine instructions as patterns emerge",
    ],
    exampleTitle: "Usage signal",
    examples: [
      { name: "Questions", detail: "high-frequency asks appear", status: "signal" },
      { name: "Resources", detail: "new docs fill gaps", status: "signal" },
      { name: "Skills", detail: "repeat tasks become workflows", status: "signal" },
      { name: "Feedback", detail: "members reveal demand", status: "signal" },
    ],
  },
  {
    title: "Monetize",
    image: "/landing/monetize.png",
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

const communityConversationEvents = [
  {
    kind: "message",
    name: "Myah",
    detail: "Can someone review this offer page before I publish?",
  },
  {
    kind: "bot",
    name: "Signal",
    detail: "The CTA is clear. Tighten the outcome promise above the fold.",
  },
  {
    kind: "file",
    name: "Jordan",
    detail: "Shared video · launch-teardown.mp4",
  },
  {
    kind: "bot",
    name: "Musebot",
    detail: "Pulled 4 positioning notes from the shared video.",
  },
  {
    kind: "file",
    name: "Nate",
    detail: "Shared PDF · offer-draft.pdf",
  },
  {
    kind: "memory",
    name: "Orbit",
    detail: "Added to memory system · offer teardown, CTA notes, member demand.",
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

function renderFlowExample(flow: (typeof flowCards)[number], index: number) {
  if (index === 0) {
    return (
      <div className="polynet-landing-tool-stream" aria-label={flow.exampleTitle}>
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-agent-stream-window">
          <div className="polynet-landing-agent-stream-track">
            <div className="polynet-landing-agent-stream" aria-label="Simulated agent harness stream">
              <div className="polynet-landing-agent-status">
                <span>Working for 8s</span>
                <span aria-hidden="true">›</span>
              </div>
              <p className="polynet-landing-agent-output">
                I’ll connect this agent to the tools and context it can use.
              </p>
              <div className="polynet-landing-agent-tools" aria-label="Simulated tool calls">
                {buildAgentStream.map((tool, toolIndex) => (
                  <div
                    key={tool.call}
                    className="polynet-landing-agent-tool"
                    style={{ "--tool-index": toolIndex } as CSSProperties}
                  >
                    <div>
                      <code>{tool.call}</code>
                      <span>{tool.detail}</span>
                    </div>
                    <p>{tool.result}</p>
                  </div>
                ))}
              </div>
              <div className="polynet-landing-agent-tools secondary" aria-label="Simulated research calls">
                {buildAgentResearchStream.map((tool, toolIndex) => (
                  <div
                    key={tool.call}
                    className="polynet-landing-agent-tool research"
                    style={{ "--tool-index": toolIndex } as CSSProperties}
                  >
                    <div>
                      <code>{tool.call}</code>
                      <span>{tool.detail}</span>
                    </div>
                    <p>{tool.result}</p>
                  </div>
                ))}
              </div>
              <div className="polynet-landing-agent-thinking">
                <span>Referencing community intelligence</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div
        className="polynet-landing-tool-stream polynet-landing-community-feed"
        aria-label={flow.exampleTitle}
      >
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-community-feed-window">
          <div className="polynet-landing-community-feed-list">
            {communityConversationEvents.map((event, eventIndex) => (
              <div
                key={`${event.name}-${event.detail}`}
                className={`polynet-landing-community-event ${event.kind}`}
                style={{ "--community-index": eventIndex } as CSSProperties}
              >
                <span>{event.name.slice(0, 2)}</span>
                <div>
                  <strong>{event.name}</strong>
                  <p>{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div
        className="polynet-landing-tool-stream polynet-landing-usage-stream"
        aria-label={flow.exampleTitle}
      >
        <span>{flow.exampleTitle}</span>
        <div className="polynet-landing-usage-stream-window">
          <div className="polynet-landing-usage-stream-track">
            {usageSignalEvents.map((event, eventIndex) => (
              <div
                key={`${event.label}-${event.value}`}
                className="polynet-landing-usage-event"
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
    }, 4200);

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
              Turn your expertise into a <span>paid AI community</span>.
            </h1>
            <p className="polynet-landing-subcopy">
              Build an agent. Monetize access. Bring in members. Improve with
              usage.
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
              <img src={card.image} alt={card.title} loading="lazy" />
            </button>
          ))}
        </div>
        <div className="polynet-landing-flow-detail" aria-live="polite">
          <div
            className={`polynet-landing-flow-active-visual step-${activeFlowIndex}`}
            aria-hidden="true"
          >
            <img src={activeFlow.image} alt="" loading="lazy" />
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
                  <img src={card.image} alt="" loading="lazy" />
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
            The Collective Intelligence Platform
          </h2>
          <p>
            Polynet compresses agents, community, resources, funnels, and paid
            access into one clean product.
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
