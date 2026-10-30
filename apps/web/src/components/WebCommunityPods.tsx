import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, Image as ImageIcon, Info, Lock, Pin, Play, Plus, X } from "lucide-react";
import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "../../../../shared/convexAuthenticatedClient";
import { communityPresenceLeaseIsActive } from "../../../../shared/communityPresenceContract";
import { CommunityAgentIcon, useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import { MemberAvatarStack, type MemberAvatarStackFace } from "./MemberAvatarStack";
import { useWebCommunityFrame, type WebCommunityFrame } from "../controllers/useWebCommunityFrame";
import "./WebCommunityPods.css";

// Pods: in Classroom, a member's invite-only channels are
// pods, not topic chips. Each shows the faces of everyone who can see it, so
// it reads as a small private room. The owner picks where they sit in
// Customize (theme pods_place): the top of the right column, the header, or
// their own tab after Community, which opens the Pods page.
// Opening one turns the chat into the pod's room, with the pod panel
// (WebCommunityPodPanel) beside it. Channels lists them as their own group.

export type CommunityPod = { id: string; slug: string; name: string; is_general: boolean; position: number; access_mode?: "all_members" | "restricted" };

export type WebCommunityPodsFrame = {
  mode: "classroom" | "channels";
  place: "aside" | "header" | "tab";
  pods: CommunityPod[];
  unread: Record<string, boolean>;
  selectedSlug: string | null;
  onOpen: (pod: CommunityPod) => void;
  onLeave: () => void;
  // "tab" placement: the Pods page (every pod as a card) is open in place of
  // the chat. Opening a pod, another tab or another channel closes it.
  home: boolean;
  setHome: (open: boolean) => void;
  // Classroom: the right column's element while a pod is open. The pod panel
  // is portalled into it, so it replaces the community card and blocks.
  panelSlot: HTMLElement | null;
  // Owners and admins: make a new pod (name first, then who's in it). Null for
  // everyone else.
  createPod: { create: (name: string) => Promise<boolean>; isCreating: boolean; error: string | null; clearError: () => void } | null;
};

// A pod made from "New pod" opens on Add people, so the owner picks who's in
// it straight away (the pod panel's In this pod card reads this).
export const podsAwaitingPeople = new Set<string>();

export type PodPerson = {
  user_id: string;
  role: "owner" | "admin" | "member";
  profile: { display_name: string | null; avatar_url: string | null; avatar_focus_x: number; avatar_focus_y: number; avatar_zoom: number };
  last_seen_at: number | null;
  active_until: number | null;
  is_you?: boolean;
};
export type PodPeople = { channel_id: string; people: PodPerson[]; people_count: number; agent: boolean };

const REFRESH_MS = 45_000;
// The pods list shows this many before "Show all".
const COLLAPSED_PODS = 5;
// Last answer per community and pod, so moving between tabs doesn't flash empty faces.
const peopleCache = new Map<string, PodPeople>();

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

export function personName(person: PodPerson): string {
  return person.profile.display_name?.trim() || "Member";
}

export function isOnline(person: PodPerson, now: number): boolean {
  return person.last_seen_at !== null
    && communityPresenceLeaseIsActive({ lastSeenAt: person.last_seen_at, activeUntil: person.active_until ?? undefined }, now);
}

function faces(people: PodPerson[]): MemberAvatarStackFace[] {
  return people.map((person) => ({
    user_id: person.user_id,
    display_name: personName(person),
    avatar_url: person.profile.avatar_url,
    avatar_focus_x: person.profile.avatar_focus_x,
    avatar_focus_y: person.profile.avatar_focus_y,
    avatar_zoom: person.profile.avatar_zoom,
    initials: initials(personName(person)),
  }));
}

const spacesCache = new Map<string, PodSpaces>();
type PodSpaces = { mine: string | null; member_spaces: string[]; test_spaces?: string[] };

/** Which invite-only channels are members' guide channels (see listPodSpaces). */
export function usePodSpaces(communityId: string | null, session: WebCommunityFrame["session"]): PodSpaces | null {
  const [spaces, setSpaces] = useState<PodSpaces | null>(() => (communityId ? spacesCache.get(communityId) ?? null : null));
  useEffect(() => {
    setSpaces(communityId ? spacesCache.get(communityId) ?? null : null);
    if (!communityId || !session) return;
    let alive = true;
    void (async () => {
      try {
        const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
        const result = await client.query(api.communityPods.listPodSpaces, { authSubject, communityId: communityId as Id<"communities"> });
        spacesCache.set(communityId, result);
        if (alive) setSpaces(result);
      } catch {
        // Without it every invite-only channel stays a pod.
      }
    })();
    return () => { alive = false; };
  }, [communityId, session]);
  return spaces;
}

/** Who can see each pod, refreshed while the pods are on screen. */
export function usePodPeople(podIds: string[], refreshKey = 0): Record<string, PodPeople> {
  const frame = useWebCommunityFrame();
  const communityId = frame.community?.id ?? null;
  const session = frame.session;
  const key = podIds.join(",");
  const read = () => Object.fromEntries(podIds.flatMap((id) => {
    const cached = peopleCache.get(`${communityId}:${id}`);
    return cached ? [[id, cached]] : [];
  }));
  const [people, setPeople] = useState<Record<string, PodPeople>>(read);
  useEffect(() => {
    setPeople(read());
    if (!communityId || !session || podIds.length === 0) return;
    let alive = true;
    const load = async () => {
      try {
        const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
        const result = await client.query(api.communityPods.listPodPeople, {
          authSubject,
          communityId: communityId as Id<"communities">,
          channelIds: podIds as Id<"communityChannels">[],
        });
        for (const pod of result.pods as PodPeople[]) peopleCache.set(`${communityId}:${pod.channel_id}`, pod);
        if (alive) setPeople(read());
      } catch {
        // Faces are a nicety: the pod still opens without them.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [communityId, session, key, refreshKey]);
  return people;
}

export function PodFaces({ people, agent, size }: { people?: PodPeople; agent?: boolean; size: "small" | "large" }) {
  const now = Date.now();
  const online = new Set((people?.people ?? []).filter((person) => !person.is_you && isOnline(person, now)).map((person) => person.user_id));
  return (
    <span className={`community-pod-faces is-${size}`}>
      <MemberAvatarStack
        faces={faces(people?.people ?? [])}
        totalCount={people?.people_count}
        isLoading={!people}
        limit={size === "small" ? 3 : 6}
        decorative={size === "small"}
      />
      {online.size > 0 ? <span className="community-pod-live" aria-label={`${online.size} here now`} /> : null}
      {agent && people?.agent ? <span className="community-pod-agent" aria-hidden="true"><CommunityAgentIcon size={size === "small" ? 12 : 14} /></span> : null}
    </span>
  );
}

function podSummary(people: PodPeople | undefined, agentName: string): string {
  if (!people) return "Private";
  const now = Date.now();
  // You being here goes without saying; name someone else who is.
  const here = people.people.filter((person) => !person.is_you && isOnline(person, now));
  const count = `${people.people_count} ${people.people_count === 1 ? "person" : "people"}${people.agent ? ` + ${agentName}` : ""}`;
  if (here.length === 1) return `${count} · ${personName(here[0]!)} is here`;
  if (here.length > 1) return `${count} · ${here.length} here now`;
  return count;
}

function PodRow({ pod, people, selected, unread, onOpen }: { pod: CommunityPod; people?: PodPeople; selected: boolean; unread: boolean; onOpen: () => void }) {
  const agentName = useCommunityAgentName("the agent");
  return (
    <li>
      <button type="button" className={`community-pod-row${selected ? " is-selected" : ""}`} aria-current={selected ? "page" : undefined} onClick={onOpen}>
        <PodFaces people={people} agent size="small" />
        <span className="community-pod-row-text">
          <span className="community-pod-row-name">
            <span>{pod.name}</span>
            <Lock size={12} aria-label="Private" />
          </span>
          <span className="community-pod-row-meta">{podSummary(people, agentName)}</span>
        </span>
        {unread && !selected ? <span className="community-pod-unread" aria-label="New messages" /> : null}
      </button>
    </li>
  );
}

export function PodList({ pods, onPicked }: { pods: WebCommunityPodsFrame; onPicked?: () => void }) {
  const [showAll, setShowAll] = useState(false);
  // Pods with something new come first, then the order given (own space first).
  const ordered = pods.pods.map((pod, index) => ({ pod, index }))
    .sort((a, b) => Number(Boolean(pods.unread[b.pod.slug])) - Number(Boolean(pods.unread[a.pod.slug])) || a.index - b.index)
    .map(({ pod }) => pod);
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_PODS);
  const people = usePodPeople(visible.map((pod) => pod.id));
  return (
    <>
      <ul className="community-pod-list">
        {visible.map((pod) => (
          <PodRow
            key={pod.id}
            pod={pod}
            people={people[pod.id]}
            selected={pods.selectedSlug === pod.slug}
            unread={Boolean(pods.unread[pod.slug])}
            onOpen={() => {
              pods.onOpen(pod);
              onPicked?.();
            }}
          />
        ))}
      </ul>
      {ordered.length > COLLAPSED_PODS ? (
        <button type="button" className="community-aside-link community-pod-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all ${ordered.length}`}
        </button>
      ) : null}
    </>
  );
}

/** "Your pods" at the top of the right column. */
export function WebCommunityPodsCard({ pods }: { pods: WebCommunityPodsFrame }) {
  if (pods.place !== "aside" || (pods.pods.length === 0 && !pods.createPod)) return null;
  return (
    <section className="community-aside-card community-pods-card" aria-label="Your pods">
      <div className="community-aside-card-header">
        <h2>Your pods</h2>
        {pods.createPod ? <NewPodButton pods={pods} /> : (
          <span className="community-pods-card-note"><Lock size={12} aria-hidden="true" /> Private</span>
        )}
      </div>
      {pods.pods.length ? <PodList pods={pods} /> : (
        <p className="community-aside-empty">No pods yet. A pod is a private room for a few members, like a cohort or a mastermind.</p>
      )}
    </section>
  );
}

/** The Pods page (theme pods_place "tab"): every pod the member is in as a
 *  card, with New pod for owners and admins. A card opens the pod's room. */
export function WebCommunityPodsHome({ pods }: { pods: WebCommunityPodsFrame }) {
  const agentName = useCommunityAgentName("the agent");
  const ordered = pods.pods.map((pod, index) => ({ pod, index }))
    .sort((a, b) => Number(Boolean(pods.unread[b.pod.slug])) - Number(Boolean(pods.unread[a.pod.slug])) || a.index - b.index)
    .map(({ pod }) => pod);
  const people = usePodPeople(ordered.map((pod) => pod.id));
  return (
    <section className="community-pods-home" aria-labelledby="community-pods-home-title">
      <header className="community-pods-home-head">
        <div>
          <h1 id="community-pods-home-title">Pods</h1>
          <p><Lock size={13} aria-hidden="true" /> Private rooms for a few members. Only the people in a pod can see it.</p>
        </div>
        {pods.createPod ? <NewPodButton pods={pods} /> : null}
      </header>
      {ordered.length ? (
        <ul className="community-pods-home-grid">
          {ordered.map((pod) => {
            const unread = Boolean(pods.unread[pod.slug]);
            return (
              <li key={pod.id}>
                <button type="button" className="community-pods-home-card" onClick={() => pods.onOpen(pod)}>
                  <span className="community-pods-home-card-top">
                    <PodFaces people={people[pod.id]} agent size="large" />
                    {unread ? <span className="community-pods-home-new">New</span> : null}
                  </span>
                  <span className="community-pods-home-card-name">
                    <span>{pod.name}</span>
                    <Lock size={13} aria-label="Private" />
                  </span>
                  <span className="community-pods-home-card-meta">{podSummary(people[pod.id], agentName)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="community-pods-home-empty">
          No pods yet. A pod is a private room for a few members, like a cohort or a mastermind.
        </p>
      )}
    </section>
  );
}

/** "+ New pod" for owners and admins, in Classroom's pod card, switcher and
 *  header list. The same flow as the + beside PODS in Channels. */
export function NewPodButton({ pods, onOpened }: { pods: WebCommunityPodsFrame; onOpened?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!pods.createPod) return null;
  return (
    <>
      <button
        type="button"
        className="community-aside-link community-pods-new"
        onClick={() => {
          pods.createPod?.clearError();
          setOpen(true);
          onOpened?.();
        }}
      >
        <Plus size={13} aria-hidden="true" /> New pod
      </button>
      {open ? <NewPodDialog createPod={pods.createPod} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NewPodDialog({ createPod, onClose }: { createPod: NonNullable<WebCommunityPodsFrame["createPod"]>; onClose: () => void }) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !createPod.isCreating) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [createPod.isCreating, onClose]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed || createPod.isCreating) return;
    if (await createPod.create(trimmed)) onClose();
  };
  return createPortal(
    <div className="community-channel-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createPod.isCreating) onClose(); }}>
      <form className="community-channel-modal" role="dialog" aria-modal="true" aria-labelledby="community-new-pod-title" onSubmit={(event) => void submit(event)}>
        <div className="community-channel-modal-header">
          <div>
            <h2 id="community-new-pod-title">New pod</h2>
            <p>A private room. Next you pick who's in it; owners and admins always are.</p>
          </div>
          <button type="button" className="community-channel-modal-close" onClick={onClose} aria-label="Close new pod dialog" disabled={createPod.isCreating}>
            <X size={18} />
          </button>
        </div>
        <label className="community-channel-modal-field">
          <span>Pod name</span>
          <input
            ref={inputRef}
            value={name}
            maxLength={48}
            placeholder="e.g. Agency owners"
            onChange={(event) => {
              setName(event.target.value);
              createPod.clearError();
            }}
            disabled={createPod.isCreating}
          />
        </label>
        {createPod.error ? <div className="community-channel-modal-error" role="alert">{createPod.error}</div> : null}
        <div className="community-channel-modal-actions">
          <button type="button" onClick={onClose} disabled={createPod.isCreating}>Cancel</button>
          <button type="submit" className="is-primary" disabled={createPod.isCreating || !name.trim()}>
            {createPod.isCreating ? "Creating…" : "Create pod"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** The header's stack of pod faces, opening the same list. In "aside" mode it
 *  only shows where the right column is hidden (narrow windows). */
export function WebCommunityPodsButton({ pods }: { pods: WebCommunityPodsFrame }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const firstPeople = usePodPeople(pods.pods.slice(0, 3).map((pod) => pod.id));
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
  if (pods.pods.length === 0 && !pods.createPod) return null;
  const unread = pods.pods.filter((pod) => pods.unread[pod.slug]).length;
  // One face from each of the first pods: the people a member knows best.
  const seen = new Set<string>();
  const leadPeople = pods.pods.slice(0, 3).flatMap((pod) => {
    const person = firstPeople[pod.id]?.people.find((candidate) => !seen.has(candidate.user_id));
    if (!person) return [];
    seen.add(person.user_id);
    return [person];
  });
  return (
    <div className={`community-pods-button-wrap is-${pods.place}`} ref={ref}>
      <button
        type="button"
        className={`community-pods-button${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Your pods${unread ? `, ${unread} with new messages` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        {leadPeople.length > 0 ? (
          <MemberAvatarStack faces={faces(leadPeople)} limit={3} decorative className="community-pods-button-faces" />
        ) : <Lock size={14} aria-hidden="true" />}
        <span>Pods</span>
        {unread ? <span className="community-pods-button-count">{unread}</span> : null}
      </button>
      {open ? (
        <div className="community-pods-popover" role="dialog" aria-label="Your pods">
          <div className="community-pods-popover-head">
            <strong>Your pods</strong>
            {pods.createPod ? <NewPodButton pods={pods} /> : (
              <span className="community-pods-card-note"><Lock size={12} aria-hidden="true" /> Only the people in each pod see it</span>
            )}
          </div>
          <PodList pods={pods} onPicked={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** The band across the top of an open pod: who's in the room, and who can see it. */
export function WebCommunityPodRoomHead({ pods, podId, onShowDetails }: { pods: WebCommunityPodsFrame; podId: string; onShowDetails?: () => void }) {
  const pod = pods.pods.find((candidate) => candidate.id === podId);
  const people = usePodPeople(pod ? [pod.id] : [])[podId];
  const agentName = useCommunityAgentName("the agent");
  if (!pod) return null;
  const names = (people?.people ?? []).map(personName);
  const listed = names.length <= 4 ? names : [...names.slice(0, 3), `${people!.people_count - 3} others`];
  const withAgent = people?.agent ? [...listed, agentName] : listed;
  const audience = withAgent.length > 1 ? `${withAgent.slice(0, -1).join(", ")} and ${withAgent.at(-1)}` : withAgent[0] ?? "";
  return (
    <div className="community-pod-room-head">
      {/* With a Pods tab, back goes to the Pods page; otherwise to the community. */}
      <button type="button" className="community-pod-room-back" onClick={pods.place === "tab" ? () => pods.setHome(true) : pods.onLeave}>
        <ArrowLeft size={14} aria-hidden="true" /> {pods.place === "tab" ? "All pods" : "Community"}
      </button>
      <div className="community-pod-room-identity">
        <PodFaces people={people} agent size="large" />
        <div className="community-pod-room-title">
          <h1>{pod.name}</h1>
          <p className="community-pod-room-privacy">
            <Lock size={12} aria-hidden="true" />
            {people ? <span>Only {audience} can see this pod</span> : <span>Private pod</span>}
          </p>
        </div>
        {/* Narrow windows have no right column: the pod panel opens from here. */}
        {onShowDetails ? (
          <button type="button" className="community-pod-room-details" onClick={onShowDetails} aria-label="Pod details: people, pinned, files and calls">
            <Info size={16} aria-hidden="true" /> <span>Details</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The pod panel as a sheet from the bottom, for windows without a right column. */
export function PodDetailsSheet({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // A dialog opened from the sheet (Schedule, Add people) closes first.
      if (event.key === "Escape" && !document.querySelector(".community-channel-modal-backdrop, .community-event-sheet-overlay")) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  const themeScope = document.querySelector<HTMLElement>("[data-community-theme]")?.dataset.communityTheme;
  return createPortal(
    <div className="community-pod-sheet-backdrop" role="presentation" data-community-theme={themeScope} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="community-pod-sheet" role="dialog" aria-modal="true" aria-label={`${name} details`}>
        <div className="community-pod-sheet-head">
          <strong>{name}</strong>
          <button type="button" className="community-channel-modal-close" onClick={onClose} aria-label="Close pod details">
            <X size={18} />
          </button>
        </div>
        <div className="community-pod-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// What the pod panel lists under "Files & videos": every file and video
// shared in the pod. Each item opens the post it came from, where the file
// plays or downloads as usual.

export type ShelfItem = {
  root_id: string; id: string; kind: "file" | "image" | "video"; name: string; mime: string | null;
  size: number | null; image_url: string | null; provider: string | null; author_name: string | null; created_at: string;
};
type Shelf = { pinned_root_id: string | null; files: ShelfItem[]; videos: ShelfItem[] };

export function usePodShelf(podId: string, refreshKey: string): Shelf | null {
  const frame = useWebCommunityFrame();
  const communityId = frame.community?.id ?? null;
  const session = frame.session;
  const [shelf, setShelf] = useState<Shelf | null>(null);
  useEffect(() => {
    if (!communityId || !session) return;
    let alive = true;
    void (async () => {
      try {
        const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
        const result = await client.query(api.communityPods.listPodShelf, {
          authSubject,
          communityId: communityId as Id<"communities">,
          channelId: podId as Id<"communityChannels">,
        });
        if (alive) setShelf(result as Shelf);
      } catch {
        if (alive) setShelf({ pinned_root_id: null, files: [], videos: [] });
      }
    })();
    return () => { alive = false; };
  }, [communityId, session, podId, refreshKey]);
  return shelf;
}

function shelfSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shelfDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function shelfMeta(item: ShelfItem, agentName: string): string {
  return [item.author_name ?? agentName, shelfDate(item.created_at), item.provider ?? shelfSize(item.size)].filter(Boolean).join(" · ");
}
