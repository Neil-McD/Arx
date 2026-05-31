import { ExternalLink, MessageCircle, X as CloseIcon } from "lucide-react";
import { SOCIAL_PROFILE_KINDS, type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import type { UserProfile } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { SocialProfileIcon } from "./SocialProfileIcon";

type WebCommunityProfilePanelProps = {
  profile: UserProfile | null;
  displayName: string;
  avatarColor: string;
  activeCommunityName: string | null;
  isActiveCommunityOwner: boolean;
  getInitials: (value: string) => string;
  onClose: () => void;
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

export function WebCommunityProfilePanel(props: WebCommunityProfilePanelProps) {
  const {
    profile,
    displayName,
    avatarColor,
    activeCommunityName,
    isActiveCommunityOwner,
    getInitials,
    onClose,
  } = props;
  const handleLabel = normalizePanelHandle(profile?.handle);
  const bio = String(profile?.bio ?? "").trim();
  const socialLinks = SOCIAL_PROFILE_KINDS.map((kind) => ({
    kind,
    label: SOCIAL_PROFILE_LABELS[kind],
    url: String(profile?.social_links?.[kind] ?? "").trim(),
  })).filter((item) => item.url);
  const roleLabel = isActiveCommunityOwner ? "Owner" : "Member";

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
          <button
            type="button"
            className="community-profile-panel-close"
            onClick={onClose}
            aria-label="Close profile"
          >
            <CloseIcon aria-hidden="true" />
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
        <div className="community-profile-panel-section-label">In this community</div>
        {activeCommunityName ? (
          <div className="community-profile-panel-context-row">
            <span>{activeCommunityName}</span>
            <span>{roleLabel}</span>
          </div>
        ) : (
          <div className="community-profile-panel-empty">No active community context.</div>
        )}
      </section>

      <section className="community-profile-panel-section">
        <div className="community-profile-panel-section-label">Owned communities</div>
        {activeCommunityName && isActiveCommunityOwner ? (
          <div className="community-profile-panel-context-row">
            <span>{activeCommunityName}</span>
            <span>Owner</span>
          </div>
        ) : (
          <div className="community-profile-panel-empty">No visible owned communities yet.</div>
        )}
      </section>

      <section className="community-profile-panel-section">
        <div className="community-profile-panel-section-label">Mutual communities</div>
        {activeCommunityName ? (
          <div className="community-profile-panel-context-row">
            <span>{activeCommunityName}</span>
            <span>Current</span>
          </div>
        ) : (
          <div className="community-profile-panel-empty">No mutual communities to show yet.</div>
        )}
      </section>
    </aside>
  );
}
