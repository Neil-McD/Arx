import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, PinOff } from "lucide-react";

import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";
import type { UserProfile } from "../../../../shared/communityTypes";
import {
  ActorAvatar,
  actorLabel,
  agentBadgeLabel,
  bundleText,
  kindChipLabel,
  stripSharedAttachmentSummary,
} from "./communityInteractionFeed";

type CommunityPinnedRootPreviewProps = {
  bundle: CommunityInteractionRootBundle;
  selected: boolean;
  canUnpin: boolean;
  isUnpinning: boolean;
  onUnpin: () => void;
  onOpen: () => void;
  profilesByUserId: Record<string, UserProfile>;
  displayName: (userId: string) => string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
};

function countLabel(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function CommunityPinnedRootPreview(props: CommunityPinnedRootPreviewProps) {
  const { bundle } = props;
  const { root } = bundle;
  const excerptRef = useRef<HTMLSpanElement | null>(null);
  const [isExcerptTruncated, setIsExcerptTruncated] = useState(false);
  const label = actorLabel(root, props.displayName);
  const profile = root.actor_user_id ? props.profilesByUserId[root.actor_user_id] ?? null : null;
  const seed = root.actor_user_id ?? root.actor_agent_key ?? root.id;
  const badge = agentBadgeLabel(root.actor_type);
  const chip = kindChipLabel(root.kind);
  const body = stripSharedAttachmentSummary(
    bundleText(bundle.content_blocks, root.content_summary),
    bundle.attachments.length > 0,
  );
  const hiddenContentLabel = [
    countLabel(bundle.embeds.length, "link preview", "link previews"),
    countLabel(bundle.attachments.length, "attachment", "attachments"),
  ].filter(Boolean).join(" · ");

  useLayoutEffect(() => {
    const excerpt = excerptRef.current;
    if (!excerpt) {
      setIsExcerptTruncated(false);
      return;
    }
    const measure = () => {
      setIsExcerptTruncated(excerpt.scrollHeight > excerpt.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(excerpt);
    return () => observer.disconnect();
  }, [body]);

  return (
    <div
      className={`community-channel-pinned-root${props.selected ? " is-selected" : ""}`}
      role="note"
      aria-label="Pinned post"
    >
      <div className="community-channel-pinned-preview-gutter">
        <ActorAvatar
          label={label}
          seed={seed}
          profile={profile}
          getAvatarColor={props.getAvatarColor}
          getInitials={props.getInitials}
        />
      </div>
      <button
        type="button"
        className="community-channel-pinned-preview-open"
        onClick={props.onOpen}
        aria-label={`View full pinned post by ${label}`}
        title="View full post"
      >
        <span className="community-channel-pinned-preview-meta">
          <strong>{label}</strong>
          {badge ? <span className="community-interaction-badge">{badge}</span> : null}
          {chip ? <span className="community-interaction-kind">{chip}</span> : null}
          <span>{props.formatChatTime(root.created_at)}</span>
        </span>
        {root.title ? <span className="community-channel-pinned-preview-title">{root.title}</span> : null}
        {body ? (
          <span
            ref={excerptRef}
            className={`community-channel-pinned-preview-excerpt${isExcerptTruncated ? " is-truncated" : ""}`}
          >
            {body}
          </span>
        ) : null}
        {hiddenContentLabel ? (
          <span className="community-channel-pinned-preview-hidden-content">Includes {hiddenContentLabel}</span>
        ) : null}
        <span className="community-channel-pinned-preview-cta">
          View full post <ArrowRight size={13} aria-hidden="true" />
        </span>
      </button>
      {props.canUnpin ? (
        <button
          type="button"
          className="community-channel-pinned-root-unpin"
          onClick={props.onUnpin}
          disabled={props.isUnpinning}
          aria-label="Unpin from channel"
          title="Unpin from channel"
        >
          <PinOff size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
