import { useEffect, useState } from "react";
import {
  banCloudCommunityMember,
  removeCloudCommunityMember,
  setCloudCommunityMemberRole,
} from "../../../../shared/cloudCommunityAdminGateway";
import "./CommunityMembersBulkBar.css";

export type SelectedMember = { userId: string; membershipId?: string; role: string; name: string };

type Pending = { kind: "remove" | "ban" } | null;

// Owners and admins act on the people they selected: change their role, remove
// or ban them. Each person is done on their own; anything
// refused is reported and the rest still happen.
export function CommunityMembersBulkBar(props: {
  session: unknown;
  communityId: string;
  canManage: boolean;
  isOwner: boolean;
  selected: SelectedMember[];
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const count = props.selected.length;
  useEffect(() => { if (!count) setPending(null); }, [count]);

  const run = async (label: string, work: () => Promise<{ done: number; refused: number }>) => {
    setBusy(true);
    setStatus("");
    try {
      const { done, refused } = await work();
      setStatus(`${label}: ${done} done${refused ? `, ${refused} not changed` : ""}.`);
      if (!refused) props.onClear();
    } catch {
      setStatus("That didn't work. Try again.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  // One person at a time, through the same functions as a member's settings.
  const each = (label: string, act: (member: SelectedMember & { membershipId: string }) => Promise<unknown>) => run(label, async () => {
    let done = 0;
    let refused = 0;
    for (const member of props.selected) {
      if (!member.membershipId || member.role === "owner" || (member.role === "admin" && !props.isOwner)) { refused += 1; continue; }
      try { await act(member as SelectedMember & { membershipId: string }); done += 1; } catch { refused += 1; }
    }
    return { done, refused };
  });
  const call = { session: props.session, communityId: props.communityId };

  return (
    <div className="members-bulk" role="region" aria-label="Selected people">
      {props.canManage && count ? (
        <div className="members-bulk-actions">
          <span className="members-bulk-count">{count} selected</span>
          <select aria-label="Change the role of the selected people" value="" disabled={busy}
            onChange={event => {
              const role = event.target.value as "member" | "moderator" | "admin" | "";
              if (role) void each("Role changed", member => setCloudCommunityMemberRole({ ...call, membershipId: member.membershipId, role }));
            }}>
            <option value="">Role…</option>
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
            {props.isOwner ? <option value="admin">Admin</option> : null}
          </select>
          {pending ? (
            <span className="members-bulk-confirm" role="alert">
              {pending.kind === "remove" ? `Remove ${count}?` : `Ban ${count}? They can't rejoin unless unbanned.`} Anyone paying loses their subscription.
              <button type="button" disabled={busy} onClick={() => void (pending.kind === "remove"
                ? each("Removed", member => removeCloudCommunityMember({ ...call, membershipId: member.membershipId }))
                : each("Banned", member => banCloudCommunityMember({ ...call, membershipId: member.membershipId })))}>
                {pending.kind === "remove" ? "Remove" : "Ban"}
              </button>
              <button type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
            </span>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => setPending({ kind: "remove" })}>Remove</button>
              <button type="button" disabled={busy} onClick={() => setPending({ kind: "ban" })}>Ban</button>
            </>
          )}
          <button type="button" className="members-bulk-clear" disabled={busy} onClick={props.onClear}>Clear</button>
        </div>
      ) : null}
      {status ? <p className="members-bulk-status" role="status">{status}</p> : null}
    </div>
  );
}
