import { useEffect, useMemo, useState } from "react";

import { listCloudDiscoverCommunities } from "../../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../../shared/communityTypes";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { PublicFrame, trackStart } from "./ConversionLanding";
import { cx, KitApp } from "../../v1/kit";
import { DISCOVER_SEARCH_FROM, DiscoverCard, DiscoverSearch, discoverRowsFor } from "../../v1/KitDiscover";
import "./ConversionLanding.css";

type PublicFindPageProps = { onJoin: () => void };

type LoadState = "loading" | "ready" | "failed";
const NOBODY: ReadonlySet<string> = new Set();

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

  // The same cards and order as the app's Discover (docs/specs/discover-v1.md).
  const visible = useMemo(() => discoverRowsFor(communities, NOBODY, query.trim()), [communities, query]);
  const [now] = useState(Date.now);

  return (
    <PublicFrame onJoin={onJoin}>
      <section className="find" aria-labelledby="find-title">
        <p className="kicker">Find a community</p>
        <h1 id="find-title">Find your people.</h1>
        <KitApp view="home" part="flow" light={false}>
          {communities.length > DISCOVER_SEARCH_FROM ? <div style={{ margin: "20px 0 0" }}><DiscoverSearch query={query} onQuery={setQuery} /></div> : null}
          <div style={{ marginTop: 28 }}>
            {loadState === "loading" ? (
              <div className={cx("discgrid")} aria-busy="true">
                {[0, 1, 2].map((index) => <span className={cx("discskel")} key={index} />)}
              </div>
            ) : loadState === "failed" ? (
              <p className={cx("none")}>Communities could not load. Refresh to try again.</p>
            ) : visible.length > 0 ? (
              <div className={cx("discgrid")}>
                {visible.map((community) => (
                  <DiscoverCard community={community} now={now} key={community.slug}
                    onFollow={() => captureProductAnalyticsEvent("community_card_opened", { community_id: community.id, placement: "find" })} />
                ))}
              </div>
            ) : (
              <p className={cx("none")}>{query.trim() ? `No communities match “${query.trim()}”.` : "No communities are listed yet."}</p>
            )}
          </div>
        </KitApp>
      </section>

      <section className="closing" aria-labelledby="find-start-title">
        <h2 id="find-start-title">Don't see yours? Start it.</h2>
        <button className="cta" type="button" onClick={trackStart("find_closing", onJoin)}>Start a community</button>
        <p className="microcopy">Free to build · Guide $20/month · Chief of Staff $100/month</p>
      </section>
    </PublicFrame>
  );
}
