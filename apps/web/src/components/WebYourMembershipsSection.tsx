import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { listCloudCommunityMembershipRows } from "../../../../shared/cloudCommunityMembershipGateway";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";

type Community = {
  id: string;
  slug: string;
  name: string;
  one_liner?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", moderator: "Moderator", member: "Member" };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

// Your settings > Memberships: every community you're in, like Substack's
// list of subscriptions. Each opens that community's own Settings, where a
// member sees their plan, mutes it or leaves.
export function WebYourMembershipsSection<SessionT>(props: { session: SessionT | null; onOpenPath: (path: string) => void }) {
  const [rows, setRows] = useState<Array<{ role: string; community: Community }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!props.session) return;
    let alive = true;
    listCloudCommunityMembershipRows<SessionT, Community>({ session: props.session })
      .then((result) => { if (alive) setRows(result.map((row) => ({ role: row.role, community: row.communities }))); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [props.session]);

  const owned = (rows ?? []).filter((row) => row.role === "owner");
  const joined = (rows ?? []).filter((row) => row.role !== "owner");
  const list = (title: string, description: string, items: typeof owned, manageLabel: string) => (
    <section className="settings-section pn-settings-card" aria-label={title}>
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title">{title}</h2>
        <p className="settings-section-desc">{description}</p>
      </header>
      <div className="pn-settings-card-body">
        {items.map(({ role, community }) => (
          <a
            key={community.id}
            className="pn-your-membership"
            href={buildCommunityTabPath(community.slug, "settings") ?? undefined}
            onClick={(event) => {
              const path = buildCommunityTabPath(community.slug, "settings");
              if (!path || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              props.onOpenPath(path);
            }}
          >
            <UserAvatar
              className="pn-your-membership-avatar"
              readyClassName="has-image"
              imageClassName="pn-your-membership-avatar-image"
              fallbackClassName="pn-your-membership-avatar-fallback"
              name={community.name}
              imageUrl={community.avatar_url ?? null}
              focusX={community.avatar_focus_x ?? 0.5}
              focusY={community.avatar_focus_y ?? 0.5}
              zoom={community.avatar_zoom ?? 1}
              fallback={<span>{initials(community.name)}</span>}
              alt=""
              aria-hidden={true}
            />
            <span className="pn-your-membership-text">
              <strong>{community.name}</strong>
              {community.one_liner ? <small>{community.one_liner}</small> : null}
            </span>
            <span className="pn-creators-badge">{ROLE_LABEL[role] ?? "Member"}</span>
            <span className="pn-your-membership-manage">{manageLabel}<ChevronRight size={16} aria-hidden="true" /></span>
          </a>
        ))}
      </div>
    </section>
  );

  if (error) return <p className="pn-settings-inline-error" role="alert">Couldn't load your communities. Try again in a moment.</p>;
  if (rows === null) return <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading your communities…</div>;
  if (rows.length === 0) {
    return (
      <section className="settings-section pn-settings-card">
        <p className="pn-settings-note">You haven't joined a community yet. Find one on Discover.</p>
      </section>
    );
  }
  return (
    <div className="pn-settings-stack">
      {joined.length ? list("Communities you're in", "Open one to see your plan, mute it or leave.", joined, "Manage") : null}
      {owned.length ? list("Communities you run", "Open one to change how it looks, its pricing and its members.", owned, "Settings") : null}
    </div>
  );
}
