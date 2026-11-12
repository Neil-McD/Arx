// Pods (docs/specs/pods-v0.md, slice 1): one page for every pod, never rows
// in the left column. Builders see all pods and start new ones; a member sees
// the pods they are in. Opening a pod opens its room.
import { useCallback, useEffect, useState } from "react";
import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { fetchCloudCommunityPods, saveCloudPodPurpose, type CloudCommunityPod } from "../../../../shared/cloudCommunityPodsGateway";
import { Btn, cx, Icon, KitApp, Sec } from "../v1/kit";

export type WebCommunityPodsSectionProps = {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string | null;
  communityName: string;
  // "View as a member" shows a builder only the pods they are in.
  asMember: boolean;
  onOpenPod: (pod: { slug: string }) => void;
  // Creates the pod's invite-only room (the channels controller's createChannel).
  createRoom: (name: string, accessMode: "all_members" | "restricted") => Promise<{ id: string; slug: string } | null>;
};

function activeLabel(iso: string | null, now: number): string {
  if (!iso) return "No messages yet";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "Active just now" : `Active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}

export function WebCommunityPodsSection(props: WebCommunityPodsSectionProps) {
  const [state, setState] = useState<{ canManage: boolean; pods: CloudCommunityPod[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", purpose: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    if (!props.communityId) return;
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const result = await fetchCloudCommunityPods({ session, communityId: props.communityId, asMember: props.asMember });
      setState({ canManage: result.can_manage, pods: result.pods });
      setFailed(false);
    } catch { setFailed(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.asMember]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const name = draft.name.trim();
    if (!name || saving || !props.communityId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await props.createRoom(name, "restricted");
      const room = created ? { id: String(created.id), slug: String(created.slug) } : null;
      if (!room) { setError("The pod couldn't be created. Try again."); return; }
      const purpose = draft.purpose.trim();
      if (purpose) {
        const session = await props.ensureSession(props.session);
        if (session) await saveCloudPodPurpose({ session, communityId: props.communityId, channelId: room.id, purpose }).catch(() => undefined);
      }
      setCreating(false);
      setDraft({ name: "", purpose: "" });
      props.onOpenPod(room);
    } catch {
      setError("The pod couldn't be created. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const canManage = Boolean(state?.canManage);
  const pods = state?.pods ?? [];
  const lead = !state ? " " : canManage
    ? (pods.length ? `${pods.length} ${pods.length === 1 ? "pod" : "pods"} in ${props.communityName}.` : "Start your first pod.")
    : (pods.length ? "Your pods." : "You're not in a pod yet.");

  return (
    <div className="community-panel community-pods-panel">
      <CommunityPageHeader title="Pods"><div className="resources-header">Pods</div></CommunityPageHeader>
      <KitApp view="events" host={canManage} part="flow">
        <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
          <p className={cx("lead")} style={{ marginTop: 0 }}>{lead}</p>
          {failed ? <p className={cx("sub")} role="alert">Pods couldn't load. <button type="button" className={cx("link")} onClick={() => void load()}>Try again</button></p> : null}
          <div className={cx("podgrid")}>
            {pods.map((pod) => (
              <button key={pod.channel_id} type="button" className={cx("podcard")} onClick={() => props.onOpenPod(pod)}>
                <span className={cx("podname")}><Icon name="users" />{pod.name}</span>
                <span className={cx("podpurpose")}>{pod.purpose || (canManage ? "Add what this pod is for." : "")}</span>
                <span className={cx("podmeta")}>{pod.members} {pod.members === 1 ? "member" : "members"} · {activeLabel(pod.last_active_at, now)}</span>
              </button>
            ))}
            {canManage && !creating ? (
              <button type="button" className={cx("podcard podnew")} onClick={() => setCreating(true)}><Icon name="plus" />New pod</button>
            ) : null}
          </div>
          {canManage && creating ? (
            <div className={cx("card podform")}>
              <div className={cx("meta")}><span>New pod</span></div>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name, e.g. Founders pod" aria-label="Pod name" maxLength={60} autoFocus />
              <textarea value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} placeholder="What is this pod for? One sentence." aria-label="What the pod is for" rows={2} maxLength={280} />
              {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
              <div className={cx("acts")}>
                <Btn go small disabled={!draft.name.trim() || saving} onClick={() => void create()}>{saving ? "Creating…" : "Create pod"}</Btn>
                <Btn txt small onClick={() => { setCreating(false); setError(null); }}>Cancel</Btn>
              </div>
            </div>
          ) : null}
        </div>
      </KitApp>
      <CommunityPageRail label="Pods">
        <KitApp view="events" host={canManage} part="rail">
          <Sec label="What a pod is">
            <p className={cx("sub")}>
              {canManage
                ? "A small group with a purpose and closer time with you. Only the people you add can see inside. Add people from the pod's settings."
                : "A small group with a purpose and closer time with the hosts. Only the people in a pod can see inside it."}
            </p>
          </Sec>
        </KitApp>
      </CommunityPageRail>
    </div>
  );
}
