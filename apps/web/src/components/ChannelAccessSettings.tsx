import { useContext, useEffect, useRef, useState } from "react";
import { bootstrapConvexAuthenticatedClient } from "../../../../shared/convexAuthenticatedClient";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";

type AccessMode = "all_members" | "restricted";
type Member = { user_id: string; role: string; active: boolean; profile: {
  display_name: string | null; avatar_url: string | null; avatar_focus_x: number; avatar_focus_y: number; avatar_zoom: number;
} };

export function ChannelAccessSettings({ channelId }: { channelId: string }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [members, setMembers] = useState<Member[]>([]);
  const [access, setAccess] = useState<AccessMode | null>(null);
  const [agent, setAgent] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pendingMode, setPendingMode] = useState<AccessMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const [refresh, setRefresh] = useState(0);

  const load = async (nextCursor: string | null, epoch: number) => {
    if (!scope?.session) return;
    const { client, authSubject } = await bootstrapConvexAuthenticatedClient(scope.session);
    const page = await client.query("communityChannelParticipants:listMemberAccess" as any, {
      authSubject, communityId: scope.communityId, channelId, paginationOpts: { cursor: nextCursor, numItems: 50 },
    }) as { page: Member[]; access_mode: AccessMode; community_agent_enabled: boolean; continueCursor: string; isDone: boolean };
    if (generation.current !== epoch) return;
    setMembers(current => nextCursor ? [...current, ...page.page] : page.page);
    setAccess(page.access_mode); setAgent(page.community_agent_enabled); setCursor(page.continueCursor); setHasMore(!page.isDone);
  };

  useEffect(() => {
    const epoch = ++generation.current;
    setBusy(true); setError(null); setPendingMode(null);
    void load(null, epoch).catch(() => { if (generation.current === epoch) setError("Channel settings are unavailable. Try again."); })
      .finally(() => { if (generation.current === epoch) setBusy(false); });
    return () => { ++generation.current; };
  }, [scope?.session, scope?.communityId, channelId, refresh]);

  const mutate = async (method: string, args: Record<string, unknown>) => {
    if (!scope?.session || busy) return;
    const epoch = generation.current;
    setBusy(true); setError(null);
    try {
      const { client, authSubject } = await bootstrapConvexAuthenticatedClient(scope.session);
      if (generation.current !== epoch) return;
      await client.mutation(method as any, { authSubject, communityId: scope.communityId, channelId, ...args });
      await load(null, epoch);
      if (generation.current === epoch) setPendingMode(null);
    } catch {
      if (generation.current === epoch) setError("Could not save. Access may have changed; reload settings and try again.");
    } finally { if (generation.current === epoch) setBusy(false); }
  };

  if (!scope) return null;
  return <section className="community-channel-access-settings" aria-label="Channel access" aria-busy={busy}>
    <label className="community-channel-modal-field"><span>Access</span>
      <select value={pendingMode ?? access ?? "all_members"} disabled={busy || !access}
        onChange={event => setPendingMode(event.target.value === access ? null : event.target.value as AccessMode)}>
        <option value="all_members">All community members</option><option value="restricted">Invite-only</option>
      </select>
    </label>
    <p>Community owners and admins always have access. Personal agents follow their member’s access. Access changes save immediately.</p>
    {pendingMode ? <div className="community-channel-access-confirm" role="status">
      <p>{pendingMode === "all_members" ? "All community members will be able to read this channel’s history and files."
        : "Only invited members and owners/admins will have future access. Previously shared messages, file links and copies cannot be recalled."}</p>
      <button type="button" disabled={busy} onClick={() => void mutate("communityChannels:setChannelAccess", {
        accessMode: pendingMode, expectedAccessMode: access, acknowledgeHistoryExposure: true,
      })}>Confirm access change</button>
      <button type="button" disabled={busy} onClick={() => setPendingMode(null)}>Cancel</button>
    </div> : null}
    {access === "restricted" ? <>
      <label className="community-channel-participant"><input type="checkbox" checked={agent} disabled={busy}
        onChange={event => void mutate("communityChannelParticipants:setParticipant", { target: { kind: "community_agent" }, active: event.target.checked })} />
        <span>Allow the community agent</span></label>
      <h3>People</h3>
      <div className="community-channel-people-list">
        {members.map(member => <label className="community-channel-participant" key={member.user_id}>
          <input type="checkbox" disabled={busy || member.role === "admin"} checked={member.active || member.role === "admin"}
            onChange={event => void mutate("communityChannelParticipants:setParticipant", { target: { kind: "member", userId: member.user_id }, active: event.target.checked })} />
          <UserAvatar className="community-channel-participant-avatar" name={member.profile.display_name ?? "Member"}
            imageUrl={member.profile.avatar_url} focusX={member.profile.avatar_focus_x} focusY={member.profile.avatar_focus_y} zoom={member.profile.avatar_zoom} />
          <span>{member.profile.display_name ?? "Member"}{member.role === "admin" ? " · Admin" : ""}</span>
        </label>)}
        {!busy && !members.length ? <p>No community members to add yet.</p> : null}
      </div>
      {hasMore ? <button type="button" disabled={busy} onClick={async () => {
        const epoch = generation.current; setBusy(true);
        try { await load(cursor, epoch); } catch { if (generation.current === epoch) setError("Could not load more members."); }
        finally { if (generation.current === epoch) setBusy(false); }
      }}>Load more people</button> : null}
    </> : null}
    {error ? <div role="alert" className="community-channel-modal-error">{error} <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Reload</button></div> : null}
  </section>;
}
