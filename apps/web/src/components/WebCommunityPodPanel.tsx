import { toastInPage } from "./confirmInPage";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, FileText, Image as ImageIcon, Lock, Pin, Play, Plus, UserPlus, X } from "lucide-react";
import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";
import { listCloudCommunityEvents, saveCloudCommunityEvent, type CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import { useProtectedImage } from "./protectedImageStore";
import { CommunityAgentIcon, useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import { bundleText, stripSharedAttachmentSummary } from "./communityInteractionFeed";
import { ChannelAccessSettings } from "./ChannelAccessSettings";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { EventModal, eventDraftPayload, makeDraft, type EventDraft } from "./WebCommunityEventsSection";
import {
  PodFaces,
  NewPodButton,
  PodList,
  podsAwaitingPeople,
  isOnline,
  personName,
  shelfMeta,
  usePodPeople,
  usePodShelf,
  type ShelfItem,
} from "./WebCommunityPods";
import "./WebCommunityPods.css";

// Pod Panel: beside a pod's chat, in both
// layouts, the column is the pod's own: who's in it, the pinned post as
// itself, files and videos shared there, and the pod's calls. Nothing about
// the wider community, which members already know.

const CALLS_WINDOW_DAYS = 60;
const CALLS_SHOWN = 3;
const SAVED_SHOWN = 5;

type PodPanelProps = {
  podId: string;
  pinnedRoot: CommunityInteractionRootBundle | null | undefined;
  roots: CommunityInteractionRootBundle[];
  onOpenPost: (rootId: string) => void;
  canManage: boolean;
  // Owners and admins: take the pin off from the Pinned card itself.
  onUnpin?: () => void;
};

export function WebCommunityPodPanel(props: PodPanelProps) {
  const frame = useWebCommunityFrame();
  const pods = frame.pods;
  const pod = pods?.pods.find((candidate) => candidate.id === props.podId) ?? null;
  if (!pods || !pod) return null;
  return (
    <div className="community-pod-panel" aria-label={`${pod.name} pod`}>
      {pods.mode === "classroom" ? <PodSwitcher name={pod.name} /> : null}
      <PodPeopleCard podId={props.podId} podName={pod.name} canManage={props.canManage} />
      <PodPinnedCard pinnedRoot={props.pinnedRoot} onOpenPost={props.onOpenPost} onUnpin={props.onUnpin} />
      <PodSavedCard podId={props.podId} roots={props.roots} pinnedRoot={props.pinnedRoot} onOpenPost={props.onOpenPost} />
      <PodCallsCard podId={props.podId} podName={pod.name} canManage={props.canManage} />
    </div>
  );
}

// Classroom only: the pod's name with the member's other pods one click away.
// In Channels the list on the left already does this.
function PodSwitcher({ name }: { name: string }) {
  const pods = useWebCommunityFrame().pods!;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      // A dialog opened from the list (New pod) sits outside it on the page.
      if ((event.target as Element).closest?.(".community-channel-modal-backdrop")) return;
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const others = pods.pods.length - 1;
  return (
    <div className="community-pod-switcher" ref={ref}>
      <button type="button" className="community-pod-switcher-button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <Lock size={14} aria-hidden="true" />
        <span className="community-pod-switcher-name">{name}</span>
        <span className="community-pod-switcher-count">{others > 0 ? `${others} more` : "Your pods"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="community-pods-popover" role="dialog" aria-label="Your pods">
          <div className="community-pods-popover-head"><strong>Your pods</strong><NewPodButton pods={pods} /></div>
          <PodList pods={pods} onPicked={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

function PodPeopleCard({ podId, podName, canManage }: { podId: string; podName: string; canManage: boolean }) {
  const [addingPeople, setAddingPeople] = useState(false);
  useEffect(() => {
    if (canManage && podsAwaitingPeople.delete(podId)) setAddingPeople(true);
  }, [canManage, podId]);
  const [peopleRefresh, setPeopleRefresh] = useState(0);
  const people = usePodPeople([podId], peopleRefresh)[podId];
  const agentName = useCommunityAgentName("the agent");
  const now = Date.now();
  const roleLabel = { owner: "Owner", admin: "Admin", member: "" } as const;
  return (
    <section className="community-aside-card community-pod-panel-card">
      <div className="community-aside-card-header">
        <h2>In this pod</h2>
        {canManage ? (
          <button type="button" className="community-aside-link" onClick={() => setAddingPeople(true)}>
            <UserPlus size={13} aria-hidden="true" /> Add people
          </button>
        ) : people ? <span className="community-pod-panel-count">{people.people_count + (people.agent ? 1 : 0)}</span> : null}
      </div>
      {people ? (
        <ul className="community-pod-people">
          {people.people.map((person) => (
            <li key={person.user_id}>
              <UserAvatar
                className="community-pod-person-avatar"
                name={personName(person)}
                imageUrl={person.profile.avatar_url}
                focusX={person.profile.avatar_focus_x}
                focusY={person.profile.avatar_focus_y}
                zoom={person.profile.avatar_zoom}
                alt=""
                aria-hidden={true}
              />
              <span className="community-pod-person-name">{personName(person)}</span>
              {roleLabel[person.role] ? <span className="community-pod-person-role">{roleLabel[person.role]}</span> : null}
              {isOnline(person, now) ? <span className="community-pod-person-live" aria-label="Here now" /> : null}
            </li>
          ))}
          {people.agent ? (
            <li>
              <span className="community-pod-person-avatar is-agent" aria-hidden="true"><CommunityAgentIcon size={14} /></span>
              <span className="community-pod-person-name">{agentName}</span>
              <span className="community-pod-person-role">Agent</span>
            </li>
          ) : null}
          {people.people_count > people.people.length ? (
            <li className="community-pod-panel-more">and {people.people_count - people.people.length} more</li>
          ) : null}
        </ul>
      ) : (
        <PodFaces size="large" />
      )}
      {addingPeople ? (
        <PodPeopleDialog
          podId={podId}
          podName={podName}
          onClose={() => {
            setAddingPeople(false);
            setPeopleRefresh((value) => value + 1);
          }}
        />
      ) : null}
    </section>
  );
}

// Who's in the pod, using the channel's own access settings (the same toggles
// as the channel ⋯ menu). Changes save as they're made.
function PodPeopleDialog({ podId, podName, onClose }: { podId: string; podName: string; onClose: () => void }) {
  const frame = useWebCommunityFrame();
  const communityId = frame.community?.id ?? null;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  if (!frame.session || !communityId) return null;
  return createPortal(
    <div className="community-channel-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="community-channel-modal community-pod-people-dialog" role="dialog" aria-modal="true" aria-labelledby="community-pod-people-title">
        <div className="community-channel-modal-header">
          <div>
            <h2 id="community-pod-people-title">People in {podName}</h2>
            <p>Tick who can see this pod. Owners and admins are always in.</p>
          </div>
          <button type="button" className="community-channel-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <CommunityChannelSessionContext.Provider value={{ session: frame.session, communityId }}>
          <ChannelAccessSettings channelId={podId} />
        </CommunityChannelSessionContext.Provider>
        <div className="community-channel-modal-actions">
          <button type="button" className="is-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A pod's files can only be opened by its people, so images come through the
// same checked download as in the chat (protectedImageStore), shared with it.
function PodImage({ attachmentId, alt }: { attachmentId: string; alt: string }) {
  // The chat's own session scope stands in where the frame has none.
  const chatScope = useContext(CommunityChannelSessionContext);
  const session = useWebCommunityFrame().session ?? chatScope?.session ?? null;
  const url = useProtectedImage(session, attachmentId);
  return url ? <img src={url} alt={alt} /> : <span className="community-pod-image-placeholder" aria-hidden="true"><ImageIcon size={18} /></span>;
}

/** The Pinned card's Unpin: takes the pin off and says so. */
export function unpinFromPod(setPinnedRoot: (rootId: string | null) => Promise<boolean> | boolean): void {
  void Promise.resolve(setPinnedRoot(null)).then((done) => {
    if (done !== false) toastInPage("Unpinned from pod");
  });
}

// A picture pinned on its own reads "Image · Oct 27", not its file name.
function pinnedDay(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "pinned" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PodPinnedCard({ pinnedRoot, onOpenPost, onUnpin }: { pinnedRoot: CommunityInteractionRootBundle | null | undefined; onOpenPost: (rootId: string) => void; onUnpin?: () => void }) {
  const pinned = pinnedRoot ?? null;
  const image = pinned?.attachments.find((attachment) => attachment.type === "image" || /^image\//.test(attachment.mime ?? ""));
  const file = pinned?.attachments.find((attachment) => attachment !== image);
  const text = pinned
    ? stripSharedAttachmentSummary(bundleText(pinned.content_blocks, pinned.root.content_summary), pinned.attachments.length > 0)
    : "";
  return (
    <section className="community-aside-card community-pod-panel-card">
      <div className="community-aside-card-header">
        <h2><Pin size={14} aria-hidden="true" /> Pinned</h2>
        {pinned && onUnpin ? (
          <button type="button" className="community-aside-link community-pod-unpin" onClick={onUnpin}>Unpin</button>
        ) : null}
      </div>
      {pinned ? (
        <button type="button" className="community-pod-pinned" onClick={() => onOpenPost(pinned.root.id)}>
          {image ? <span className="community-pod-pinned-image"><PodImage attachmentId={image.id} alt={image.name} /></span> : null}
          {pinned.root.title ? <strong>{pinned.root.title}</strong> : null}
          {text ? <span className="community-pod-pinned-text">{text}</span> : null}
          {!text && !pinned.root.title ? <strong>{image ? `Image · ${pinnedDay(pinned.root.created_at)}` : file?.name ?? "Pinned post"}</strong> : null}
          {file && !image ? <span className="community-pod-pinned-file"><FileText size={14} aria-hidden="true" /> {file.name}</span> : null}
        </button>
      ) : (
        <p className="community-aside-empty">Pin a message from its ⋯ menu and it stays here.</p>
      )}
    </section>
  );
}

function PodSavedCard(props: { podId: string; roots: CommunityInteractionRootBundle[]; pinnedRoot: CommunityInteractionRootBundle | null | undefined; onOpenPost: (rootId: string) => void }) {
  const agentName = useCommunityAgentName("the agent");
  // New posts and a changed pin refresh the list.
  const latest = props.roots[0]?.root;
  const shelf = usePodShelf(props.podId, `${props.roots.length}:${latest?.id ?? ""}:${latest?.updated_at ?? ""}:${props.pinnedRoot?.root.id ?? ""}`);
  const [showAll, setShowAll] = useState(false);
  const items: ShelfItem[] = [...(shelf?.videos ?? []), ...(shelf?.files ?? [])]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const visible = showAll ? items : items.slice(0, SAVED_SHOWN);
  return (
    <section className="community-aside-card community-pod-panel-card">
      <div className="community-aside-card-header">
        <h2>Files & videos</h2>
        {items.length ? <span className="community-pod-panel-count">{items.length}</span> : null}
      </div>
      {items.length ? (
        <ul className="community-pod-saved">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => props.onOpenPost(item.root_id)}>
                <span className="community-pod-saved-icon" aria-hidden="true">
                  {item.kind === "image" ? <PodImage attachmentId={item.id} alt="" />
                    : item.kind === "video" ? (item.image_url ? <img src={item.image_url} alt="" /> : <Play size={15} />)
                    : <FileText size={15} />}
                </span>
                <span className="community-pod-saved-text">
                  <strong>{item.name}</strong>
                  <span>{shelfMeta(item, agentName)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="community-aside-empty">Files and videos shared here collect in this list. Only the pod can open them.</p>
      )}
      {items.length > SAVED_SHOWN ? (
        <button type="button" className="community-aside-link community-pod-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

function callWhen(event: CloudCommunityEvent): { month: string; day: string; time: string } {
  const start = new Date(event.starts_at);
  return {
    month: start.toLocaleDateString(undefined, { month: "short" }),
    day: start.toLocaleDateString(undefined, { day: "numeric" }),
    time: start.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }),
  };
}

function PodCallsCard({ podId, podName, canManage }: { podId: string; podName: string; canManage: boolean }) {
  const frame = useWebCommunityFrame();
  const communityId = frame.community?.id ?? null;
  const session = frame.session;
  const [calls, setCalls] = useState<CloudCommunityEvent[] | null>(null);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!communityId || !session) return;
    let cancelled = false;
    const now = new Date();
    const end = new Date(now.getTime() + CALLS_WINDOW_DAYS * 86400000);
    listCloudCommunityEvents({ session, communityId, channelId: podId, startIso: now.toISOString(), endIso: end.toISOString(), overlap: true, limit: 20 })
      .then((rows) => {
        if (!cancelled) setCalls(rows.filter((row) => row.status === "live").sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
      })
      .catch(() => {
        if (!cancelled) setCalls([]);
      });
    return () => {
      cancelled = true;
    };
  }, [communityId, session, podId, reload]);
  const save = async () => {
    if (!draft || !session || !communityId) return;
    const checked = eventDraftPayload(draft);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    try {
      await saveCloudCommunityEvent({ session, eventId: null, payload: { ...checked.payload, community_id: communityId } });
      setDraft(null);
      setError(null);
      setReload((value) => value + 1);
    } catch {
      setError("Couldn't save the call. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="community-aside-card community-pod-panel-card">
      <div className="community-aside-card-header">
        <h2><CalendarDays size={14} aria-hidden="true" /> Calls</h2>
        {canManage ? (
          <button type="button" className="community-aside-link" onClick={() => { setError(null); setDraft({ ...makeDraft(null, podId), title: `${podName} call` }); }}>
            <Plus size={13} aria-hidden="true" /> Schedule
          </button>
        ) : null}
      </div>
      {calls === null ? (
        <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
      ) : calls.length ? (
        <ul className="community-upcoming-events-list">
          {calls.slice(0, CALLS_SHOWN).map((call) => {
            const when = callWhen(call);
            return (
              <li key={`${call.id}:${call.starts_at}`}>
                <button type="button" className="community-upcoming-event" onClick={() => frame.onSelectTab("events")}>
                  <span className="community-upcoming-event-date" aria-hidden="true">
                    <span>{when.month}</span>
                    <strong>{when.day}</strong>
                  </span>
                  <span className="community-upcoming-event-text">
                    <span className="community-upcoming-event-title">{call.title}</span>
                    <span className="community-upcoming-event-time">{when.time}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="community-aside-empty">No pod calls yet.{canManage ? " Schedule one and only this pod is invited." : ""}</p>
      )}
      {draft ? (
        <EventModal
          draft={draft}
          isSaving={saving}
          error={error}
          title={`New call for ${podName}`}
          pods={frame.pods?.pods.map((pod) => ({ id: pod.id, name: pod.name })) ?? [{ id: podId, name: podName }]}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
        />
      ) : null}
    </section>
  );
}
