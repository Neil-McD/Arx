import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { createConvexClient } from "../../../../shared/convexAuthenticatedClient";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { AVATAR_INITIALS_INK } from "../../../../shared/chatUi";
import { MessageCircle } from "lucide-react";
import "./WebCommunityCreators.css";

type Creator = {
  user_id: string;
  role: "owner" | "co_creator" | "admin";
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
};

// Last result per community, so switching tabs doesn't flash an empty row.
const cache = new Map<string, Creator[]>();
const adminCache = new Map<string, Creator[]>();

// Fired after the owner changes who the co-creators are, so rows refresh.
export const COMMUNITY_CREATORS_CHANGED_EVENT = "polynet:community-creators-changed";
// Asks the community's chat to open someone's profile. The chat cancels the
// event when it handles it; when it isn't on screen, the profile waits here
// until the chat mounts.
export const COMMUNITY_OPEN_PROFILE_EVENT = "polynet:community-open-profile";
let pendingProfileUserId: string | null = null;
export function takePendingCommunityProfile(): string | null {
  const userId = pendingProfileUserId;
  pendingProfileUserId = null;
  return userId;
}
function requestCommunityProfile(userId: string, onShowChat?: () => void) {
  const event = new CustomEvent(COMMUNITY_OPEN_PROFILE_EVENT, { detail: { userId }, cancelable: true });
  if (!window.dispatchEvent(event)) return;
  pendingProfileUserId = userId;
  onShowChat?.();
}

function creatorName(creator: Creator): string {
  return creator.display_name?.trim() || (creator.handle ? `@${creator.handle}` : "Creator");
}

function initials(name: string): string {
  return name.replace(/^@/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

// "Created by": the owner first, then the co-creators the owner added. Shown
// under the community's name in Channels, on its card in Classroom and on
// About.
// The "rail" variant is the Members panel in Channels: a section heading and
// the same rows as the people below it, so faces and names line up.
export function WebCommunityCreators(props: { communityId: string | null | undefined; onOpenProfile?: (userId: string) => void; onShowChat?: () => void; readOnly?: boolean; className?: string; variant?: "rail"; getAvatarColor?: (id: string) => string; getInitials?: (name: string) => string; onMessageUser?: (userId: string) => void; currentUserId?: string | null }) {
  const communityId = props.communityId ?? null;
  const [creators, setCreators] = useState<Creator[]>(() => (communityId ? cache.get(communityId) ?? [] : []));
  const [admins, setAdmins] = useState<Creator[]>(() => (communityId ? adminCache.get(communityId) ?? [] : []));
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const onChanged = () => setReload((value) => value + 1);
    window.addEventListener(COMMUNITY_CREATORS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(COMMUNITY_CREATORS_CHANGED_EVENT, onChanged);
  }, []);
  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    setCreators(cache.get(communityId) ?? []);
    setAdmins(adminCache.get(communityId) ?? []);
    createConvexClient().query(api.communityPublic.listCommunityCreators, { communityId: communityId as Id<"communities"> })
      .then((result) => {
        const named = (list?: Creator[]) => (list ?? []).filter((row) => row.display_name || row.handle);
        const rows = named((result as { creators?: Creator[] }).creators);
        const adminRows = named((result as { admins?: Creator[] }).admins);
        cache.set(communityId, rows);
        adminCache.set(communityId, adminRows);
        if (alive) { setCreators(rows); setAdmins(adminRows); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [communityId, reload]);
  if (!creators.length) return null;
  const names = creators.map(creatorName);
  const label = creators.length === 1 ? "Creator" : "Creators";
  const openProfile = (userId: string) => (props.onOpenProfile ? props.onOpenProfile(userId) : requestCommunityProfile(userId, props.onShowChat));
  if (props.variant === "rail") {
    // Creator(s), then Admins, each with a message button so members know who
    // to ask.
    const row = (person: Creator) => {
      const name = creatorName(person);
      return (
        <div key={person.user_id} className="community-context-member">
          <button type="button" className="community-context-member-trigger" aria-label={`Open ${name}'s profile`} onClick={() => openProfile(person.user_id)}>
            <span className="community-context-member-avatar" style={!person.avatar_url && props.getAvatarColor ? { backgroundColor: props.getAvatarColor(person.user_id), color: AVATAR_INITIALS_INK } : undefined}>
              <UserAvatar className="community-context-member-avatar-media" readyClassName="has-image"
                name={name} imageUrl={person.avatar_url}
                focusX={person.avatar_focus_x} focusY={person.avatar_focus_y} zoom={person.avatar_zoom}
                alt="" aria-hidden={true} fallback={<span>{(props.getInitials ?? initials)(name)}</span>} />
            </span>
            <span className="community-context-member-copy"><span className="community-context-member-name is-admin">{name}</span></span>
          </button>
          {props.onMessageUser && person.user_id !== props.currentUserId ? <button type="button" className="community-context-member-action" aria-label={`Message ${name}`} title="Direct message" onClick={() => props.onMessageUser?.(person.user_id)}><MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" /></button> : null}
        </div>
      );
    };
    return (
      <>
        <section className="community-context-creators" aria-label={label}>
          <h3 className="community-context-section">{creators.length === 1 ? label : `${label} · ${creators.length}`}</h3>
          {creators.map(row)}
        </section>
        {admins.length ? (
          <section className="community-context-creators" aria-label="Admins">
            <h3 className="community-context-section">{admins.length === 1 ? "Admin" : `Admins · ${admins.length}`}</h3>
            {admins.map(row)}
          </section>
        ) : null}
      </>
    );
  }
  return (
    <div className={`community-creators${props.className ? ` ${props.className}` : ""}`} aria-label={`${label}: ${names.join(", ")}`} role="group">
      <span className="community-creators-faces" aria-hidden="true">
        {creators.slice(0, 4).map((creator, index) => (
          <UserAvatar
            key={creator.user_id}
            className="community-creators-avatar"
            readyClassName="has-image"
            imageClassName="community-creators-avatar-image"
            fallbackClassName="community-creators-avatar-fallback"
            name={names[index]!}
            imageUrl={creator.avatar_url}
            focusX={creator.avatar_focus_x}
            focusY={creator.avatar_focus_y}
            zoom={creator.avatar_zoom}
            fallback={<span>{initials(names[index]!)}</span>}
            alt=""
            aria-hidden={true}
          />
        ))}
      </span>
      <span className="community-creators-text">
        <span className="community-creators-label">{label}</span>
        <span className="community-creators-names">
          {creators.map((creator, index) => (
            <span key={creator.user_id}>
              {index > 0 ? (index === creators.length - 1 ? " & " : ", ") : null}
              {props.readOnly ? <span className="community-creators-name">{names[index]}</span> : <button
                type="button"
                className="community-creators-name"
                onClick={() => openProfile(creator.user_id)}
              >
                {names[index]}
              </button>}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
