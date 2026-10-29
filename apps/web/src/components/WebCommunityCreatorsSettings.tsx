import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { listCloudCommunityDirectoryWindow, type CloudCommunityDirectoryMemberRow } from "../../../../shared/cloudCommunityDirectoryGateway";
import { setCloudCommunityMemberRole } from "../../../../shared/cloudCommunityAdminGateway";
import { COMMUNITY_CREATORS_CHANGED_EVENT } from "./WebCommunityCreators";

// Settings > Creators: the people who build the community with its owner.
// A co-creator is an admin the owner adds here (or from a member's role menu):
// they show under the community's name, can change its look, sales page and
// funnels and run members, but payouts and archiving stay with the owner. Only
// the owner adds or removes them; an agent can only propose it.

const DIRECTORY_WINDOW = 2000;
const SUGGESTIONS = 6;

function rowName(row: CloudCommunityDirectoryMemberRow): string {
  return row.display_name?.trim() || "Member";
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

function Person(props: { row: CloudCommunityDirectoryMemberRow; badge: string; action?: React.ReactNode }) {
  const name = rowName(props.row);
  return (
    <div className="pn-settings-row pn-creators-row">
      <div className="pn-settings-row-head">
        <div className="pn-creators-person">
          <UserAvatar
            className="pn-creators-avatar"
            readyClassName="has-image"
            imageClassName="pn-creators-avatar-image"
            fallbackClassName="pn-creators-avatar-fallback"
            name={name}
            imageUrl={props.row.avatar_url ?? null}
            focusX={props.row.avatar_focus_x ?? 0.5}
            focusY={props.row.avatar_focus_y ?? 0.5}
            zoom={props.row.avatar_zoom ?? 1}
            fallback={<span>{initials(name)}</span>}
            alt=""
            aria-hidden={true}
          />
          <span className="pn-settings-label">{name}</span>
          <span className="pn-creators-badge">{props.badge}</span>
        </div>
        {props.action ? <div className="pn-settings-row-control">{props.action}</div> : null}
      </div>
    </div>
  );
}

export function WebCommunityCreatorsSettings<SessionT>(props: {
  communityId: string;
  session: SessionT | null;
  isOwner: boolean;
  onCopyInvite?: () => void;
}) {
  const [rows, setRows] = useState<CloudCommunityDirectoryMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!props.session) return;
    let current = true;
    setError(null);
    listCloudCommunityDirectoryWindow({ session: props.session, communityId: props.communityId, targetRowCount: DIRECTORY_WINDOW, isCurrent: () => current })
      .then((page) => { if (current && page) setRows(page.rows); })
      .catch(() => { if (current) setError("Couldn't load the members. Try again in a moment."); });
    return () => { current = false; };
  }, [props.communityId, props.session, reload]);

  const owner = rows?.find((row) => row.role === "owner") ?? null;
  const coCreators = useMemo(() => (rows ?? []).filter((row) => row.role !== "owner" && row.co_creator), [rows]);
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return (rows ?? [])
      .filter((row) => row.role !== "owner" && !row.co_creator && rowName(row).toLowerCase().includes(needle))
      .slice(0, SUGGESTIONS);
  }, [rows, query]);

  const setRole = async (row: CloudCommunityDirectoryMemberRow, role: "co_creator" | "member") => {
    if (!props.session) return;
    setBusyId(row.id);
    setError(null);
    try {
      await setCloudCommunityMemberRole({ session: props.session, communityId: props.communityId, membershipId: row.id, role });
      setQuery("");
      setReload((value) => value + 1);
      window.dispatchEvent(new Event(COMMUNITY_CREATORS_CHANGED_EVENT));
    } catch {
      setError(role === "co_creator" ? `Couldn't add ${rowName(row)}. Try again.` : `Couldn't remove ${rowName(row)}. Try again.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pn-settings-stack">
      <section className="settings-section pn-settings-card" aria-labelledby="settings-creators-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="settings-creators-title">Current creators</h2>
          <p className="settings-section-desc">
            Co-creators build this community with you and show under its name. They can change its look, sales page
            and funnels and run members. Payouts and archiving stay with the owner.
          </p>
        </header>
        <div className="pn-settings-card-body">
          {error ? <p className="pn-settings-inline-error pn-creators-error" role="alert">{error}</p> : null}
          {rows === null && !error ? (
            <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading creators…</div>
          ) : null}
          {owner ? <Person row={owner} badge="Owner" /> : null}
          {coCreators.map((row) => (
            <Person
              key={row.id}
              row={row}
              badge="Co-creator"
              action={props.isOwner ? (
                <button type="button" className="pn-settings-button" disabled={busyId !== null} onClick={() => void setRole(row, "member")}>
                  {busyId === row.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            />
          ))}
        </div>
      </section>
      {props.isOwner ? (
        <section className="settings-section pn-settings-card" aria-labelledby="settings-add-creator-title">
          <header className="pn-settings-card-header">
            <h2 className="settings-section-title" id="settings-add-creator-title">Add a creator</h2>
            <p className="settings-section-desc">
              Pick someone who has joined. If they haven't yet, send them your invite link first.
            </p>
          </header>
          <div className="pn-settings-card-body">
            <div className="pn-settings-row">
              <label className="pn-creators-search">
                <Search size={16} aria-hidden="true" />
                <input
                  className="pn-settings-input"
                  type="search"
                  placeholder="Search members by name"
                  aria-label="Search members by name"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {props.onCopyInvite ? (
                <button type="button" className="pn-settings-link pn-creators-invite" onClick={props.onCopyInvite}>Copy invite link</button>
              ) : null}
            </div>
            {query.trim() && rows ? (
              suggestions.length ? suggestions.map((row) => (
                <Person
                  key={row.id}
                  row={row}
                  badge={row.role === "admin" ? "Admin" : row.role === "moderator" ? "Moderator" : "Member"}
                  action={(
                    <button type="button" className="pn-settings-button is-primary" disabled={busyId !== null} onClick={() => void setRole(row, "co_creator")}>
                      <UserPlus size={16} aria-hidden="true" />
                      {busyId === row.id ? "Adding…" : "Make co-creator"}
                    </button>
                  )}
                />
              )) : <p className="pn-settings-note" role="status">No member matches “{query.trim()}”.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
