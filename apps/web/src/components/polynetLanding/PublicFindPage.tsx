import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { formatPlanPrice } from "../../../../../shared/accountCommerce";
import { listCloudDiscoverCommunities } from "../../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../../shared/communityTypes";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { PublicFrame, trackStart } from "./ConversionLanding";
import "./ConversionLanding.css";

type PublicFindPageProps = { onJoin: () => void };

type LoadState = "loading" | "ready" | "failed";

function matches(community: DiscoverCommunitySnapshot, query: string): boolean {
  if (!query) return true;
  const haystack = `${community.name} ${community.one_liner ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function CommunityCard(props: { community: DiscoverCommunitySnapshot }) {
  const { community } = props;
  return (
    <a
      className="showcase-card"
      href={`/c/${community.slug}`}
      onClick={() => captureProductAnalyticsEvent("community_card_opened", { community_id: community.id, placement: "find" })}
    >
      {community.banner_url ? (
        <span className="showcase-banner" style={{ backgroundImage: `url(${community.banner_url})` }} />
      ) : (
        <span className="showcase-banner find-banner-empty">
          {community.avatar_url ? <img src={community.avatar_url} alt="" /> : <span>{community.name.slice(0, 1)}</span>}
        </span>
      )}
      <span className="showcase-body">
        <strong>{community.name}</strong>
        {community.one_liner ? <span>{community.one_liner}</span> : null}
        <em>{community.active_plan ? formatPlanPrice(community.active_plan) : "Free"}</em>
      </span>
    </a>
  );
}

// The signed-out /discover: every published community, searchable, each
// opening its own public join page.
export function PublicFindPage({ onJoin }: PublicFindPageProps) {
  const [communities, setCommunities] = useState<DiscoverCommunitySnapshot[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Find a community · Polynet";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listCloudDiscoverCommunities({ limit: 200 })
      .then((all) => {
        if (cancelled) return;
        setCommunities(all);
        setLoadState("ready");
        captureProductAnalyticsEvent("find_viewed", { communities: all.length });
      })
      .catch(() => {
        if (!cancelled) setLoadState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => communities.filter((community) => matches(community, query.trim())),
    [communities, query],
  );

  return (
    <PublicFrame onJoin={onJoin}>
      <section className="find" aria-labelledby="find-title">
        <p className="kicker">Find a community</p>
        <h1 id="find-title">Find your people.</h1>
        <label className="find-search">
          <Search aria-hidden="true" size={17} />
          <input
            type="search"
            value={query}
            placeholder="Search communities"
            aria-label="Search communities"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loadState === "loading" ? (
          <div className="showcase-grid" aria-busy="true">
            {[0, 1, 2].map((index) => <span className="showcase-card find-skeleton" key={index} />)}
          </div>
        ) : loadState === "failed" ? (
          <p className="find-empty">Communities could not load. Refresh to try again.</p>
        ) : visible.length > 0 ? (
          <div className="showcase-grid">
            {visible.map((community) => <CommunityCard community={community} key={community.id} />)}
          </div>
        ) : (
          <p className="find-empty">No communities match “{query.trim()}”.</p>
        )}
      </section>

      <section className="closing" aria-labelledby="find-start-title">
        <h2 id="find-start-title">Don't see yours? Start it.</h2>
        <button className="cta" type="button" onClick={trackStart("find_closing", onJoin)}>Start a community</button>
        <p className="microcopy">Free to build your community · The agent is $79/month with AI included</p>
      </section>
    </PublicFrame>
  );
}
