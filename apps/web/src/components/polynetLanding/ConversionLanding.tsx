import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { formatPlanPrice } from "../../../../../shared/accountCommerce";
import { listCloudDiscoverCommunities } from "../../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../../shared/communityTypes";
import { buildPolynetMcpSetupForOrigin } from "../../../../../shared/polynetMcpSetup";
import { tryCopyTextToClipboard } from "../../../../../shared/chatUi";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../../docs/legalDocumentsContent";
import { WebPlatformLegalReaderModal } from "../WebPlatformLegalReaderModal";

type JoinProps = { onJoin: () => void };

const OFFER_META = "Free to build your community · The agent is $79/month with AI included";

const STEPS = [
  {
    number: "01",
    title: "Create your community",
    description: "Name it, choose who can join, and share one link. Building it costs nothing.",
  },
  {
    number: "02",
    title: "Your people gather",
    description: "Channels, events, courses and messages in one place, on the web and on their phones.",
  },
  {
    number: "03",
    title: "Switch on the agent",
    description: "It answers from everything your community has learned, remembers what matters and helps everyone, all day.",
  },
];

const PRICES = [
  {
    label: "Build",
    price: "Free",
    detail: "Your community, members, channels, events, courses and site. No time limit.",
  },
  {
    label: "Agent plan",
    price: "$79/month",
    detail: "Per community. The community agent with AI included, answering and remembering for everyone.",
  },
  {
    label: "Paid memberships",
    price: "2.9%",
    detail: "Plus Stripe's fees, only when you charge. You connect Stripe when you set a price, not before.",
  },
];

// Visitors only see communities that look finished: a banner and a one-liner.
const SHOWCASE_LIMIT = 6;

// The original Polynet network: an agent hub with members linked to it and to
// each other. Same geometry as scripts/generate_brand_icons.mjs.
function Mark(props: { size: number }) {
  const nodes: Record<string, [number, number]> = {
    a: [133, 148], hub: [258, 205], c: [382, 98], d: [440, 268], e: [304, 378], f: [72, 295],
  };
  const links: Array<[string, string]> = [
    ["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"],
  ];
  return (
    <svg className="mark" viewBox="20 46 472 384" width={props.size} height={(props.size * 384) / 472} aria-hidden="true">
      {links.map(([from, to]) => (
        <line key={`${from}-${to}`} x1={nodes[from][0]} y1={nodes[from][1]} x2={nodes[to][0]} y2={nodes[to][1]} />
      ))}
      {Object.entries(nodes).map(([id, [cx, cy]]) => (
        <circle key={id} cx={cx} cy={cy} r={id === "hub" ? 61 : 34} />
      ))}
    </svg>
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Polynet home">
      <Mark size={28} />
      <span>polynet</span>
    </a>
  );
}

function CopyLine(props: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  return (
    <button
      className="copy-line"
      type="button"
      aria-label={`Copy ${props.label}`}
      onClick={() => void tryCopyTextToClipboard(props.text).then(setCopied)}
    >
      <code>{props.text}</code>
      {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
    </button>
  );
}

function WaysIn(props: { onJoin: () => void }) {
  const mcp = buildPolynetMcpSetupForOrigin(window.location.origin);
  return (
    <section className="ways" aria-labelledby="ways-title">
      <p className="kicker">Four ways in</p>
      <h2 id="ways-title">Same community, same rules, wherever you work.</h2>
      <div className="ways-grid">
        <article className="way">
          <h3>Studio</h3>
          <p>Run everything from the browser: people, channels, events, courses, the agent and payments.</p>
          <button className="text-action" type="button" onClick={props.onJoin}>Open Studio</button>
        </article>
        <article className="way">
          <h3>Your AI</h3>
          <p>Connect Claude, ChatGPT or Cursor. It reads and acts as you, inside the permissions you already have.</p>
          <CopyLine text={mcp.claudeCodeAddCommand} label="the Claude Code command" />
        </article>
        <article className="way">
          <h3>CLI <span className="soon">Coming soon</span></h3>
          <p>Design your community's own website and put it live from your terminal.</p>
          <CopyLine text="npx @polynet/cli deploy" label="the CLI command" />
        </article>
        <article className="way">
          <h3>SDK <span className="soon">Coming soon</span></h3>
          <p>Members, posts, events and the agent from your own site's code.</p>
          <CopyLine text={'import polynet from "/__polynet/sdk.js"'} label="the SDK import" />
        </article>
      </div>
    </section>
  );
}

function Showcase(props: { communities: DiscoverCommunitySnapshot[] }) {
  if (props.communities.length === 0) return null;
  return (
    <section className="showcase" id="communities" aria-labelledby="showcase-title">
      <p className="kicker">Communities on Polynet</p>
      <h2 id="showcase-title">Find your people.</h2>
      <div className="showcase-grid">
        {props.communities.map((community) => (
          <a className="showcase-card" key={community.id} href={`/c/${community.slug}`}>
            <span className="showcase-banner" style={{ backgroundImage: `url(${community.banner_url})` }} />
            <span className="showcase-body">
              <strong>{community.name}</strong>
              <span>{community.one_liner}</span>
              <em>{community.active_plan ? formatPlanPrice(community.active_plan) : "Free"}</em>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function ConversionLanding({ onJoin }: JoinProps) {
  const [activeLegalDocument, setActiveLegalDocument] =
    useState<LegalDocumentEntry | null>(null);
  const [communities, setCommunities] = useState<DiscoverCommunitySnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listCloudDiscoverCommunities({ limit: 24 })
      .then((all) => {
        if (cancelled) return;
        setCommunities(
          all.filter((community) => community.banner_url && community.one_liner?.trim()).slice(0, SHOWCASE_LIMIT),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const findCommunity = () => {
    document.getElementById("communities")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pn-landing">
      <div className="page">
        <header className="topbar">
          <Brand />
          <nav aria-label="Account">
            <a href="/login">Sign in</a>
            <button className="cta cta-small" type="button" onClick={onJoin}>Start a community</button>
          </nav>
        </header>

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <Mark size={120} />
            <h1 id="hero-title">Communities that think.</h1>
            <p className="subhead">
              Bring your people together and give them an agent that answers, remembers and helps,
              so what one member learns becomes the community's collective intelligence.
            </p>
            <div className="doors">
              <button className="cta" type="button" onClick={onJoin}>Start a community</button>
              {communities.length > 0 ? (
                <button className="cta-secondary" type="button" onClick={findCommunity}>Find a community</button>
              ) : null}
            </div>
            <p className="microcopy">{OFFER_META}</p>
          </section>

          <section className="steps" aria-labelledby="steps-title">
            <p className="kicker">How it works</p>
            <h2 id="steps-title">From a name to a community that answers back.</h2>
            <div className="steps-grid">
              {STEPS.map((step) => (
                <article className="step" key={step.number}>
                  <span className="step-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <WaysIn onJoin={onJoin} />

          <section className="pricing" aria-labelledby="pricing-title">
            <p className="kicker">Pricing</p>
            <h2 id="pricing-title">Free to build. Pay for the agent when you want it.</h2>
            <div className="pricing-grid">
              {PRICES.map((item) => (
                <article className="price" key={item.label}>
                  <span className="price-label">{item.label}</span>
                  <strong>{item.price}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <Showcase communities={communities} />

          <section className="closing" aria-labelledby="closing-title">
            <h2 id="closing-title">Your community is one name away.</h2>
            <button className="cta" type="button" onClick={onJoin}>Start a community</button>
            <p className="microcopy">{OFFER_META}</p>
          </section>
        </main>

        <footer className="footer">
          <div className="footer-identity">
            <Brand />
            <span>© 2026 Polynet</span>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/login">Sign in</a>
            <button type="button" onClick={() => setActiveLegalDocument(PRIVACY_AI_DATA_POLICY_ENTRY)}>Privacy</button>
            <button type="button" onClick={() => setActiveLegalDocument(TERMS_OF_SERVICE_ENTRY)}>Terms</button>
          </nav>
        </footer>
      </div>
      {activeLegalDocument ? (
        <WebPlatformLegalReaderModal
          document={activeLegalDocument}
          onClose={() => setActiveLegalDocument(null)}
        />
      ) : null}
    </div>
  );
}
