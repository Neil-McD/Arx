import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { createConvexClient } from "../../../../shared/convexAuthenticatedClient";
import "./WebCommunitySiblings.css";

type Sibling = { id: string; slug: string; name: string; one_liner: string | null; avatar_url: string | null };

// "More from this creator": the owner's other public communities, shown inside
// each community so members can find the next one.
export function WebCommunitySiblings(props: { communityId: string; onOpen: (slug: string) => void }) {
  const [rows, setRows] = useState<Sibling[]>([]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    createConvexClient().query(api.communityPublic.listSiblingCommunities, { communityId: props.communityId as Id<"communities"> })
      .then((result) => { if (alive) setRows((result as { communities: Sibling[] }).communities ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [props.communityId]);
  if (!rows.length) return null;
  return <section className="community-siblings" aria-label="More from this creator">
    <h2>More from this creator</h2>
    {rows.map((row) => <button key={row.id} type="button" className="community-sibling" onClick={() => props.onOpen(row.slug)}>
      {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <span className="community-sibling-initial" aria-hidden="true">{row.name.slice(0, 1)}</span>}
      <span><strong>{row.name}</strong>{row.one_liner ? <small>{row.one_liner}</small> : null}</span>
    </button>)}
  </section>;
}
