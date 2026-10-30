import { useState, type MouseEvent } from "react";
import { MessageCircle, PenLine } from "lucide-react";
import { buildSettingsPath } from "../../../../shared/webAppRouteState";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { SOCIAL_PROFILE_KINDS, type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import type { CommunityAvatarSummary, ProfileCommunityContext, UserProfile } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { SocialProfileIcon } from "./SocialProfileIcon";
import "./WebCommunityProfile.css";

type WebCommunityProfilePanelProps = {
  profile: UserProfile | null;
  displayName: string;
  avatarColor: string;
  communityContext: ProfileCommunityContext;
  isSelfProfile: boolean;
  isMessageDisabled?: boolean;
  onMessage?: () => void | Promise<void>;
  getInitials: (value: string) => string;
  docked?: boolean;
};

const SOCIAL_PROFILE_LABELS: Record<SocialProfileKind, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
};

function normalizePanelHandle(handle: string | null | undefined): string | null {
  const normalized = String(handle ?? "").trim().replace(/^@+/, "");
  return normalized ? `@${normalized}` : null;
}

// Opens an in-app path the way the app's own links do.
function openAppPath(event: MouseEvent<HTMLAnchorElement>, path: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

const COMMUNITIES_SHOWN = 4;

type ListedCommunity = CommunityAvatarSummary & { role: string };

// One group of communities as rows, like the publications on a Substack
// profile: picture, name, and what the person is there. Long groups fold.
function WebCommunityProfileCommunityList(props: { label: string; communities: ListedCommunity[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? props.communities : props.communities.slice(0, COMMUNITIES_SHOWN);
  const hidden = props.communities.length - shown.length;
  return (
    <section className="pn-profile-group" aria-label={props.label}>
      <div className="pn-profile-group-label">{props.label}</div>
      <ul className="pn-profile-communities">
        {shown.map((community) => {
          const path = `/c/${encodeURIComponent(community.slug)}`;
          return (
            <li key={community.id}>
              <a className="pn-profile-community" href={path} onClick={(event) => openAppPath(event, path)}>
                <CommunityAvatar
                  communityId={community.id}
                  visualIdentity={community.visual_identity}
                  className="pn-profile-community-avatar"
                  name={community.name}
                  imageUrl={community.avatar_url}
                  focusX={community.avatar_focus_x}
                  focusY={community.avatar_focus_y}
                  zoom={community.avatar_zoom}
                  alt=""
                />
                <span className="pn-profile-community-name">{community.name}</span>
                <span className="pn-profile-community-role">{community.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
      {hidden > 0 || open ? (
        <button type="button" className="pn-profile-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${hidden} more`}
        </button>
      ) : null}
    </section>
  );
}

export function WebCommunityProfilePanel(props: WebCommunityProfilePanelProps) {
  const {
    profile,
    displayName,
    avatarColor,
    communityContext,
    isSelfProfile,
    isMessageDisabled,
    onMessage,
    getInitials,
    docked,
  } = props;
  const handleLabel = normalizePanelHandle(profile?.handle);
  const bio = String(profile?.bio ?? "").trim();
  const socialLinks = SOCIAL_PROFILE_KINDS.map((kind) => ({
    kind,
    label: SOCIAL_PROFILE_LABELS[kind],
    url: String(profile?.social_links?.[kind] ?? "").trim(),
  })).filter((item) => item.url);
  const ownedCommunities = communityContext.owned_communities;
  const mutualCommunities = communityContext.mutual_communities;
  const ownedCommunityIds = new Set(ownedCommunities.map((community) => community.id));
  const secondaryCommunities = mutualCommunities.filter((community) => !ownedCommunityIds.has(community.id));
  // Public communities they've joined, beyond any you share (they can hide these).
  const listedIds = new Set([...ownedCommunityIds, ...secondaryCommunities.map((community) => community.id)]);
  const joinedCommunities = (communityContext.joined_communities ?? []).filter((community) => !listedIds.has(community.id));
  const created: ListedCommunity[] = ownedCommunities.map((community) => ({ ...community, role: community.co_creator ? "Co-creator" : "Creator" }));
  const shared: ListedCommunity[] = secondaryCommunities.map((community) => ({ ...community, role: "Member" }));
  const joined: ListedCommunity[] = joinedCommunities.map((community) => ({ ...community, role: "Member" }));
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const facts = [
    created.length ? `${created.length} ${created.length === 1 ? "community" : "communities"} created` : null,
    shared.length + joined.length ? `member of ${shared.length + joined.length}` : null,
  ].filter(Boolean).join(" · ");
  const canMessageProfile = !isSelfProfile && communityContext.can_message && !isMessageDisabled && Boolean(onMessage);
  const editPath = buildSettingsPath("profile");

  return (
    <aside
      className={`community-profile-panel pn-profile${docked ? " community-profile-panel--docked" : ""}`}
      role={docked ? "group" : "dialog"}
      aria-label={`${displayName} profile`}
    >
      <header className="pn-profile-head">
        <UserAvatar
          className="community-interaction-avatar"
          readyClassName="has-image"
          fallbackClassName="community-interaction-avatar-fallback"
          name={displayName}
          imageUrl={profile?.avatar_url}
          focusX={profile?.avatar_focus_x ?? 0.5}
          focusY={profile?.avatar_focus_y ?? 0.5}
          zoom={profile?.avatar_zoom ?? 1}
          alt={displayName}
          fallback={<span>{getInitials(displayName)}</span>}
          fallbackStyle={{ backgroundColor: avatarColor }}
        />
        <h2 className="pn-profile-name">{displayName}</h2>
        {handleLabel || facts ? (
          <p className="pn-profile-meta">
            {handleLabel ? <span>{handleLabel}</span> : null}
            {handleLabel && facts ? <span aria-hidden="true"> · </span> : null}
            {facts ? <span>{facts}</span> : null}
          </p>
        ) : null}
      </header>

      {bio ? <p className="pn-profile-bio">{bio}</p> : isSelfProfile ? <p className="pn-profile-bio is-empty">Add a short bio so people know who you are.</p> : null}

      <div className="pn-profile-actions">
        {isSelfProfile ? (
          <a className="pn-profile-button" href={editPath} onClick={(event) => openAppPath(event, editPath)}>
            <PenLine aria-hidden="true" />
            Edit profile
          </a>
        ) : (
          <button
            type="button"
            className="pn-profile-button is-primary"
            disabled={!canMessageProfile}
            title={canMessageProfile ? undefined : `You can message ${firstName} once you share a community`}
            onClick={() => {
              if (!canMessageProfile) return;
              void onMessage?.();
            }}
          >
            <MessageCircle aria-hidden="true" />
            Message
          </button>
        )}
        {socialLinks.map((link) => (
          <a
            key={link.kind}
            className="pn-profile-social"
            href={link.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${displayName} on ${link.label}`}
            title={link.label}
          >
            <SocialProfileIcon kind={link.kind} />
          </a>
        ))}
      </div>

      {created.length ? <WebCommunityProfileCommunityList label={created.every((c) => c.role === "Co-creator") ? "Co-creates" : "Creates"} communities={created} /> : null}
      {shared.length ? <WebCommunityProfileCommunityList label={isSelfProfile ? "Your communities" : "Communities you share"} communities={shared} /> : null}
      {joined.length ? <WebCommunityProfileCommunityList label={isSelfProfile ? "Also in" : "Member of"} communities={joined} /> : null}
    </aside>
  );
}
