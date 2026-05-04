import { useEffect, useState } from "react";
import { Brain, Play } from "lucide-react";

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
    exampleTitle: "Tool stream",
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

export function WebLandingPage(props: WebLandingPageProps) {
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [isFlowPinned, setIsFlowPinned] = useState(false);
  const activeFlow = flowCards[activeFlowIndex] ?? flowCards[0];

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
          <div className="polynet-landing-tool-stream" aria-label={activeFlow.exampleTitle}>
            <span>{activeFlow.exampleTitle}</span>
            {activeFlow.examples.map((example) => (
              <div key={`${activeFlow.title}-${example.name}`} className="polynet-landing-tool-call">
                <span>{example.name.slice(0, 2)}</span>
                <div>
                  <strong>{example.name}</strong>
                  <em>{example.detail}</em>
                </div>
                <small>{example.status}</small>
              </div>
            ))}
          </div>
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
              <span>Polynet Builder</span>
            </div>
            <strong>$24/mo</strong>
            <p>Agents, communities, resources, funnels, paid access, and builder controls in one platform.</p>
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
            <span>Free</span>
            <ul>
              <li>Explore the platform</li>
              <li>Join communities</li>
              <li>Use community agents</li>
            </ul>
            <button type="button" onClick={props.onTryFree}>
              Continue free
            </button>
          </div>
          <div className="polynet-landing-offer-plan builder">
            <span>Builder - $24/mo</span>
            <ul>
              <li>Build your agent</li>
              <li>Launch a community</li>
              <li>Gate access and monetize</li>
            </ul>
            <button type="button" className="primary" onClick={props.onTryFree}>
              Become a builder
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
