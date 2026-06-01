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
  isSelfProfile: boolean;
  isMessageDisabled?: boolean;
  onMessage?: () => void | Promise<void>;
  getInitials: (value: string) => string;
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

function WebCommunityProfileCommunityStrip(props: {
  communities: CommunityAvatarSummary[];
}) {
  const visibleCommunities = props.communities.slice(0, 18);
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
    isSelfProfile,
    isMessageDisabled,
    onMessage,
    getInitials,
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
  const secondaryCommunities = isSelfProfile
    ? mutualCommunities.filter((community) => !ownedCommunityIds.has(community.id))
    : mutualCommunities;
  const secondaryCommunityLabel = isSelfProfile ? "My communities" : "Mutual communities";
  const hasOwnedCommunities = ownedCommunities.length > 0;
  const hasSecondaryCommunities = secondaryCommunities.length > 0;
  const hasCommunitySections = hasOwnedCommunities || hasSecondaryCommunities;
  const canMessageProfile = !isSelfProfile && communityContext.can_message && !isMessageDisabled && Boolean(onMessage);

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
            disabled={!canMessageProfile}
            onClick={() => {
              if (!canMessageProfile) return;
              void onMessage?.();
            }}
          >
            <MessageCircle aria-hidden="true" />
            <span>Message</span>
          </button>
        </div>
      </div>

      <div className="community-profile-panel-identity">
        <div className="community-profile-panel-name">{displayName}</div>
        {handleLabel ? <div className="community-profile-panel-handle">{handleLabel}</div> : null}
      </div>

      {bio ? <div className="community-profile-panel-bio">{bio}</div> : null}

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

      {hasCommunitySections ? <div className="community-profile-panel-divider" /> : null}

      {hasOwnedCommunities ? (
        <section className="community-profile-panel-section">
          <div className="community-profile-panel-section-label">Owned communities</div>
          <WebCommunityProfileCommunityStrip communities={ownedCommunities} />
        </section>
      ) : null}

      {hasSecondaryCommunities ? (
        <section className="community-profile-panel-section">
          <div className="community-profile-panel-section-label">{secondaryCommunityLabel}</div>
          <WebCommunityProfileCommunityStrip communities={secondaryCommunities} />
        </section>
      ) : null}
    </aside>
  );
}
