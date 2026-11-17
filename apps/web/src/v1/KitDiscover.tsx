// Discover (docs/specs/discover-v1.md): one page where communities are
// listed. New ones first, three across; the ones you're in are a quiet row
// last; search appears once there is enough to search. The same cards serve
// the page inside a community (/c/<slug>/discover), the page of someone in
// no community yet, and the signed-out /discover.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatPlanPrice } from "../../../../shared/accountCommerce";
import { listCloudDiscoverCommunities } from "../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { Btn, cx, Icon, KitApp } from "./kit";

// Search is clutter until there is something to search.
export const DISCOVER_SEARCH_FROM = 8;
const JOINED_SHOWN = 8;
const DAY_MS = 86_400_000;

export type DiscoverJoined = { slug: string; name: string; avatarUrl: string | null };

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase();

// One sign of life: a post in the last day, else the week's count, else nothing.
export function discoverActivityWord(community: Pick<DiscoverCommunitySnapshot, "last_active_at" | "posts_this_week">, now: number): string | null {
  const last = community.last_active_at ? Date.parse(community.last_active_at) : NaN;
  if (Number.isFinite(last) && now - last < DAY_MS) return "Active today";
  const posts = Math.floor(Number(community.posts_this_week ?? 0));
  if (posts <= 0) return null;
  return `${posts >= 50 ? "50+" : posts} ${posts === 1 ? "post" : "posts"} this week`;
}

// The price, neutral, with how you get in when that is by asking.
export function discoverPriceWord(community: Pick<DiscoverCommunitySnapshot, "active_plan" | "entry_policy">): string {
  const price = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
  return community.entry_policy === "approval" ? `${price} · ask to join` : price;
}

// New communities, most recently active first; the ones you're in are left
// out of the grid. Search looks through the name, the one-liner and the host.
export function discoverRowsFor(communities: DiscoverCommunitySnapshot[], joinedSlugs: ReadonlySet<string>, query: string): DiscoverCommunitySnapshot[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const at = (community: DiscoverCommunitySnapshot) => Date.parse(community.last_active_at ?? "") || 0;
  return communities
    .filter((community) => !joinedSlugs.has(community.slug))
    .filter((community) => {
      const text = `${community.name} ${community.one_liner ?? ""} ${community.host?.name ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => at(b) - at(a));
}

// onOpen: the app opens the community itself. onFollow: told of a click that
// follows the link (the public page counts them).
export function DiscoverCard(props: { community: DiscoverCommunitySnapshot; now: number; onOpen?: (community: DiscoverCommunitySnapshot) => void; onFollow?: (community: DiscoverCommunitySnapshot) => void }) {
  const c = props.community;
  const life = discoverActivityWord(c, props.now);
  const members = Math.max(0, Math.floor(Number(c.member_count ?? 0)));
  return (
    <a className={cx("disccard")} href={`/c/${encodeURIComponent(c.slug)}`} aria-label={`Open ${c.name}`}
      onClick={(event) => {
        props.onFollow?.(c);
        if (!props.onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        props.onOpen(c);
      }}>
      <span className={cx("discban")}>{c.banner_url ? <img src={c.banner_url} alt="" loading="lazy" /> : null}</span>
      <span className={cx("discbody")}>
        <span className={cx("discmark")}>{c.avatar_url ? <img src={c.avatar_url} alt="" loading="lazy" /> : initialsOf(c.name)}</span>
        <span className={cx("dischead")}><b>{c.name}</b><span className={cx("tag")}>{discoverPriceWord(c)}</span></span>
        <span className={cx("discline")}>{c.one_liner}</span>
        <span className={cx("discmeta")}>
          {c.host ? (
            <>
              <span className={cx("discface")}>{c.host.avatar_url ? <img src={c.host.avatar_url} alt="" loading="lazy" /> : initialsOf(c.host.name)}</span>
              <span className={cx("dischost")}>{c.host.name}</span>
            </>
          ) : null}
          {members ? <span>{c.host ? "· " : ""}{members.toLocaleString("en-US")} {members === 1 ? "member" : "members"}</span> : null}
          {life ? <span className={cx("disclife")}><i />{life}</span> : null}
        </span>
      </span>
    </a>
  );
}

export function DiscoverSearch(props: { query: string; onQuery: (next: string) => void }) {
  return (
    <label className={cx("find discfind")}>
      <Icon name="search" />
      <input type="search" value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Search communities" aria-label="Search communities" />
    </label>
  );
}

// The page's content. `renderHeader` draws the frame's header and is handed
// the search box (or null) to put in it; without it the box sits above the grid.
export function KitDiscover(props: {
  joined: DiscoverJoined[];
  onOpenCommunity?: (community: DiscoverCommunitySnapshot) => void;
  onOpenJoined?: (slug: string) => void;
  onStartCommunity: () => void;
  renderHeader?: (search: ReactNode) => ReactNode;
  // The public page is always dark; the app's pages follow its theme.
  light?: boolean;
}) {
  const [communities, setCommunities] = useState<DiscoverCommunitySnapshot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [now] = useState(Date.now);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    listCloudDiscoverCommunities({ limit: 200 })
      .then((all) => { if (!cancelled) setCommunities(all); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  const joinedSlugs = useMemo(() => new Set(props.joined.map((community) => community.slug)), [props.joined]);
  const fresh = useMemo(() => (communities ? discoverRowsFor(communities, joinedSlugs, "") : []), [communities, joinedSlugs]);
  const shown = useMemo(() => (communities ? discoverRowsFor(communities, joinedSlugs, query) : []), [communities, joinedSlugs, query]);
  const searchable = fresh.length > DISCOVER_SEARCH_FROM;
  const search = searchable ? <DiscoverSearch query={query} onQuery={setQuery} /> : null;
  const joined = props.joined.slice(0, JOINED_SHOWN);

  return (
    <KitApp view="home" part="flow" light={props.light}>
      {props.renderHeader ? props.renderHeader(search) : null}
      <div className={cx("disc")}>
        {search && !props.renderHeader ? <div style={{ marginBottom: 16 }}>{search}</div> : null}
        {failed ? (
          <p className={cx("sub")} role="alert">Communities couldn't load. <button type="button" className={cx("link")} onClick={() => setAttempt((count) => count + 1)}>Try again</button></p>
        ) : !communities ? (
          // Placeholders the size of real cards, so nothing moves when they arrive.
          <div key="loading" className={cx("discgrid")} aria-busy="true">{[0, 1, 2].map((index) => <span key={index} className={cx("discskel")} />)}</div>
        ) : shown.length ? (
          <div key="cards" className={cx("discgrid")}>
            {shown.map((community) => <DiscoverCard key={community.slug} community={community} now={now} onOpen={props.onOpenCommunity} />)}
          </div>
        ) : query.trim() ? (
          <p className={cx("none")}>No communities match “{query.trim()}”.</p>
        ) : (
          <p className={cx("none")}>{props.joined.length ? "You're in every community listed here." : "No communities are listed yet."}</p>
        )}
        {/* What sits under the grid draws once the grid's size is known, so
            it is never drawn and then moved. */}
        {(communities || failed) && joined.length ? (
          <>
            <span className={cx("lab")} style={{ display: "block", marginTop: 36 }}>You're in</span>
            <div className={cx("discin")}>
              {joined.map((community) => (
                <button key={community.slug} type="button" className={cx("chip")} onClick={() => props.onOpenJoined?.(community.slug)}>
                  <span>{community.avatarUrl ? <img src={community.avatarUrl} alt="" /> : initialsOf(community.name)}</span>
                  {community.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {communities || failed ? (
          <div className={cx("discfoot")}>
            <span>Don't see yours?</span>
            <Btn small onClick={props.onStartCommunity}>Start a community</Btn>
          </div>
        ) : null}
      </div>
    </KitApp>
  );
}
