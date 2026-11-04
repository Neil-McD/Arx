import { useCallback, useEffect, useState } from "react";
import {
  createCommunityTag,
  fetchCommunityMemberTags,
  fetchCommunityTags,
  setCommunityMemberTags,
  type CommunityMemberTagsView,
  type CommunityTagView,
} from "../../../../shared/cloudCommunityTagsGateway";
import {
  banCloudCommunityMember,
  removeCloudCommunityMember,
  setCloudCommunityMemberRole,
} from "../../../../shared/cloudCommunityAdminGateway";
import "./CommunityMembersBulkBar.css";

// Tags read a page of people at a time; Studio tags them in pieces of this size.
const TAGS_AT_ONCE = 50;

export type SelectedMember = { userId: string; membershipId?: string; role: string; name: string };

// The tags of the community and of the people loaded in the members list.
// Owners, admins and moderators read them; nobody else asks.
export function useCommunityMemberTags(params: { session: unknown; communityId: string | null; userIds: string[]; enabled: boolean }) {
  const [tags, setTags] = useState<CommunityTagView[]>([]);
  const [memberTags, setMemberTags] = useState<CommunityMemberTagsView>({});
  const [version, setVersion] = useState(0);
  const key = params.userIds.join(",");
  useEffect(() => {
    if (!params.enabled || !params.communityId) return;
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchCommunityTags({ session: params.session, communityId: params.communityId! });
        const ids = key ? key.split(",") : [];
        const loaded: CommunityMemberTagsView = {};
        for (let i = 0; i < ids.length; i += 100) {
          Object.assign(loaded, await fetchCommunityMemberTags({ session: params.session, communityId: params.communityId!, userIds: ids.slice(i, i + 100) }));
        }
        if (!cancelled) { setTags(view.tags); setMemberTags(loaded); }
      } catch {
        // Tags are a convenience: the list still works without them.
      }
    })();
    return () => { cancelled = true; };
  }, [params.session, params.communityId, params.enabled, key, version]);
  return { tags, memberTags, reload: useCallback(() => setVersion(value => value + 1), []) };
}

type Pending = { kind: "remove" | "ban" } | null;

// Owners and admins act on the people they selected: tag or untag them, change
// their role, remove or ban them. Each person is done on their own; anything
// refused is reported and the rest still happen.
export function CommunityMembersBulkBar(props: {
  session: unknown;
  communityId: string;
  canManage: boolean;
  isOwner: boolean;
  tags: CommunityTagView[];
  selected: SelectedMember[];
  filter: string;
  onFilter: (slug: string) => void;
  onClear: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [newTag, setNewTag] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const count = props.selected.length;
  useEffect(() => { if (!count) setPending(null); }, [count]);

  const run = async (label: string, work: () => Promise<{ done: number; refused: number }>) => {
    setBusy(true);
    setStatus("");
    try {
      const { done, refused } = await work();
      setStatus(`${label}: ${done} done${refused ? `, ${refused} not changed` : ""}.`);
      props.onChanged();
      if (!refused) props.onClear();
    } catch {
      setStatus("That didn't work. Try again.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const tag = (slug: string, on: boolean) => run(on ? "Tagged" : "Untagged", async () => {
    const ids = props.selected.map(member => member.userId);
    let done = 0;
    let refused = 0;
    for (let i = 0; i < ids.length; i += TAGS_AT_ONCE) {
      const result = await setCommunityMemberTags({ session: props.session, communityId: props.communityId, tag: slug, userIds: ids.slice(i, i + TAGS_AT_ONCE), on });
      done += result.changed;
      refused += result.skipped.length;
    }
    return { done, refused };
  });

  const createAndTag = async () => {
    const name = (newTag ?? "").trim();
    if (!name) return;
    setNewTag(null);
    try {
      const created = await createCommunityTag({ session: props.session, communityId: props.communityId, name });
      await tag(created.slug, true);
    } catch {
      setStatus("Couldn't make that tag. Use letters or numbers, up to 40 characters.");
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
      {props.tags.length ? (
        <label className="members-bulk-filter">
          <span>Show</span>
          <select value={props.filter} onChange={event => props.onFilter(event.target.value)} aria-label="Show people with a tag">
            <option value="">Everyone</option>
            {props.tags.map(item => <option key={item.slug} value={item.slug}>{item.name} ({item.people})</option>)}
          </select>
        </label>
      ) : null}
      {props.canManage && count ? (
        <div className="members-bulk-actions">
          <span className="members-bulk-count">{count} selected</span>
          {newTag !== null ? (
            <span className="members-bulk-new-tag">
              <input autoFocus aria-label="New tag name" maxLength={40} value={newTag} disabled={busy}
                onChange={event => setNewTag(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter") void createAndTag(); if (event.key === "Escape") setNewTag(null); }} />
              <button type="button" disabled={busy || !newTag.trim()} onClick={() => void createAndTag()}>Tag</button>
            </span>
          ) : (
            <select aria-label="Tag the selected people" value="" disabled={busy}
              onChange={event => { const value = event.target.value; if (value === "__new") setNewTag(""); else if (value) void tag(value, true); }}>
              <option value="">Tag…</option>
              {props.tags.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
              <option value="__new">New tag…</option>
            </select>
          )}
          {props.tags.length ? (
            <select aria-label="Untag the selected people" value="" disabled={busy}
              onChange={event => { if (event.target.value) void tag(event.target.value, false); }}>
              <option value="">Untag…</option>
              {props.tags.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          ) : null}
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
