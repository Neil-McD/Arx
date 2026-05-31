import { ExternalLink, MessageCircle } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { SOCIAL_PROFILE_KINDS, type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import type { CommunityAvatarSummary, ProfileCommunityContext, UserProfile } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { SocialProfileIcon } from "./SocialProfileIcon";

type WebCommunityProfilePanelProps = {
  profile: UserProfile | null;
  displayName: string;
  avatarColor: string;
  communityContext: ProfileCommunityContext;
  isCommunityContextLoading: boolean;
  getInitials: (value: string) => string;
};

const SOCIAL_PROFILE_LABELS: Record<SocialProfileKind, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
};

function normalizePanelHandle(handle: string | null | undefined): string {
  const normalized = String(handle ?? "").trim().replace(/^@+/, "");
  return normalized ? `@${normalized}` : "No handle yet";
}

function WebCommunityProfileCommunityStrip(props: {
  communities: CommunityAvatarSummary[];
  emptyLabel: string;
  isLoading: boolean;
}) {
  const visibleCommunities = props.communities.slice(0, 18);
  if (props.isLoading) {
    return <div className="community-profile-panel-empty">Loading communities...</div>;
  }
  if (visibleCommunities.length === 0) {
    return <div className="community-profile-panel-empty">{props.emptyLabel}</div>;
  }
  return (
    <div
      className="community-profile-panel-community-strip"
      aria-label={visibleCommunities.map((community) => community.name).join(", ")}
    >
      {visibleCommunities.map((community) => (
        <CommunityAvatar
          key={community.id}
          className="community-profile-panel-community-avatar"
          imageClassName="community-profile-panel-community-avatar-image"
          fallbackClassName="community-profile-panel-community-avatar-fallback"
          name={community.name}
          imageUrl={community.avatar_url}
          focusX={community.avatar_focus_x}
          focusY={community.avatar_focus_y}
          zoom={community.avatar_zoom}
          alt={community.name}
          title={community.name}
        />
      ))}
    </div>
  );
}

export function WebCommunityProfilePanel(props: WebCommunityProfilePanelProps) {
  const {
    profile,
    displayName,
    avatarColor,
    communityContext,
    isCommunityContextLoading,
    getInitials,
  } = props;
  const handleLabel = normalizePanelHandle(profile?.handle);
  const bio = String(profile?.bio ?? "").trim();
  const socialLinks = SOCIAL_PROFILE_KINDS.map((kind) => ({
    kind,
    label: SOCIAL_PROFILE_LABELS[kind],
    url: String(profile?.social_links?.[kind] ?? "").trim(),
  })).filter((item) => item.url);

  return (
    <aside
      className="community-profile-panel"
      role="dialog"
      aria-label={`${displayName} profile`}
    >
      <div className="community-profile-panel-top">
        <UserAvatar
          className="community-profile-panel-avatar"
          readyClassName="has-image"
          name={displayName}
          imageUrl={profile?.avatar_url ?? null}
          focusX={profile?.avatar_focus_x ?? 0.5}
          focusY={profile?.avatar_focus_y ?? 0.5}
          zoom={profile?.avatar_zoom ?? 1}
          alt={displayName}
          fallback={<span>{getInitials(displayName)}</span>}
          fallbackStyle={{ backgroundColor: avatarColor }}
        />
        <div className="community-profile-panel-actions">
          <button
            type="button"
            className="chat-profile-message-button community-profile-panel-message"
            disabled
          >
            <MessageCircle aria-hidden="true" />
            <span>Message</span>
          </button>
        </div>
      </div>

      <div className="community-profile-panel-identity">
        <div className="community-profile-panel-name">{displayName}</div>
        <div className="community-profile-panel-handle">{handleLabel}</div>
      </div>

      <div className={`community-profile-panel-bio${bio ? "" : " is-empty"}`}>
        {bio || "No bio yet."}
      </div>

      {socialLinks.length > 0 ? (
        <div className="community-profile-panel-links" aria-label="Profile links">
          {socialLinks.map((link) => (
            <a
              key={link.kind}
              className="community-profile-panel-link"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              <SocialProfileIcon kind={link.kind} />
              <span>{link.label}</span>
              <ExternalLink aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}

      <div className="community-profile-panel-divider" />

      <section className="community-profile-panel-section">
        <div className="community-profile-panel-section-label">Owned communities</div>
        <WebCommunityProfileCommunityStrip
          communities={communityContext.owned_communities}
          emptyLabel="No visible owned communities."
          isLoading={isCommunityContextLoading}
        />
      </section>

      <section className="community-profile-panel-section">
        <div className="community-profile-panel-section-label">Mutual communities</div>
        <WebCommunityProfileCommunityStrip
          communities={communityContext.mutual_communities}
          emptyLabel="No mutual communities."
          isLoading={isCommunityContextLoading}
        />
      </section>
    </aside>
  );
}
