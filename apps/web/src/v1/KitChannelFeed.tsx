// Design system v1: a channel's feed drawn from the kit (the mock's feed,
// docs/design/hifi-mock): one row per message, the author and time on the
// first of a run, reactions and the thread link under the text, and the
// tools on hover. Every behaviour is the app's own (communityInteractionFeed):
// profiles, mentions, attachments, edit, delete, pin, retry, threads, typing.
import { Fragment } from "react";
import { MessageSquare } from "lucide-react";
import {
  ActorAvatar,
  EditForm,
  InteractionAttachments,
  InteractionContent,
  MessageActions,
  ProfileHoverCard,
  actorLabel,
  agentBadgeLabel,
  bundleText,
  formatRelativeTime,
  hostBadgeLabel,
  kindChipLabel,
  stripSharedAttachmentSummary,
  type CommunityInteractionFeedListProps,
} from "../components/communityInteractionFeed";
import { groupInteractionFeed } from "../components/groupInteractionFeed";
import { MemberAvatarStack, type MemberAvatarStackFace } from "../components/MemberAvatarStack";
import { interactionMentionsViewer } from "../controllers/communityMentionAttention";
import { Icon, cx } from "./kit";

function KitReactions(props: {
  rows: Array<{ emoji: string; count: number }>;
  viewerEmojis?: string[];
  onToggle?: (emoji: string) => void;
}) {
  const viewer = new Set(props.viewerEmojis ?? []);
  return (
    <>
      {props.rows.map((row) => {
        const mine = viewer.has(row.emoji);
        return (
          <button
            key={row.emoji}
            type="button"
            className={cx("re", mine && "mine")}
            onClick={() => props.onToggle?.(row.emoji)}
            disabled={!props.onToggle}
            aria-pressed={mine}
            aria-label={`${row.emoji} reaction, ${row.count} ${row.count === 1 ? "reaction" : "reactions"}${mine ? ", reacted by you" : ""}`}
          >
            {row.emoji} {row.count}
          </button>
        );
      })}
    </>
  );
}

export function KitChannelFeed(props: CommunityInteractionFeedListProps) {
  const { editing, editText } = props;
  const segments = groupInteractionFeed(props.roots, props.activityEvents);
  const unreadBoundary = typeof props.chatLastSeenAt === "number" ? props.chatLastSeenAt : null;
  const firstUnreadRootId = unreadBoundary
    ? props.roots.find(
        (bundle) =>
          !bundle.pending &&
          bundle.root.actor_user_id !== props.currentUserId &&
          Date.parse(bundle.root.created_at) > unreadBoundary,
      )?.root.id ?? null
    : null;
  const firstUnreadSegmentKey = firstUnreadRootId
    ? segments.find((segment) => "bundles" in segment && segment.bundles.some((b) => b.root.id === firstUnreadRootId))?.key ?? null
    : null;
  const unreadDivider = <div className="community-interaction-unread-divider"><span>New</span></div>;

  // Loading, empty and error states keep the app's own wording and look.
  if (props.error && props.roots.length === 0 && props.activityEvents.length === 0) {
    return (
      <div className="community-interaction-state" role="alert">
        <div>{props.error}</div>
        <button type="button" onClick={props.onRetryRoots}>{props.errorActionLabel ?? "Retry"}</button>
      </div>
    );
  }
  if (props.isLoadingRoots && props.roots.length === 0 && props.activityEvents.length === 0) {
    return (
      <div className="community-interaction-state" aria-live="polite">
        <div>Loading messages…</div>
        <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
      </div>
    );
  }

  if (props.roots.length === 0 && props.activityEvents.length === 0) {
    return (
      <div className="community-interaction-empty">
        <MessageSquare size={22} aria-hidden="true" />
        <div>No messages yet</div>
        <span>Say hello. The first message starts the conversation.</span>
      </div>
    );
  }

  return (
    <div className={cx("feed")}>
      {props.error ? (
        <div className="community-interaction-refresh-warning" role="status">
          <span>{props.error}</span>
          <button type="button" onClick={props.onRetryRoots}>{props.errorActionLabel ?? "Retry"}</button>
        </div>
      ) : null}
      {segments.map((segment) => {
        const dividerBefore = segment.key === firstUnreadSegmentKey ? unreadDivider : null;
        if (segment.type === "day") {
          if (props.showDayDividers === false) return null;
          return (
            <Fragment key={segment.key}>
              {dividerBefore}
              <div className={cx("day")}>{segment.label}</div>
            </Fragment>
          );
        }
        if (segment.type === "system") {
          const body = stripSharedAttachmentSummary(
            bundleText(segment.bundle.content_blocks, segment.bundle.root.content_summary),
            segment.bundle.attachments.length > 0,
          );
          return (
            <Fragment key={segment.key}>
              {dividerBefore}
              <div className="community-interaction-system"><span>{body}</span></div>
            </Fragment>
          );
        }
        if (segment.type === "member_arrivals") {
          const actorIds = Array.from(new Set(
            segment.events.map((event) => String(event.actor_user_id ?? "").trim()).filter(Boolean),
          ));
          const faces: MemberAvatarStackFace[] = actorIds.map((userId) => {
            const profile = props.profilesByUserId[userId] ?? null;
            const name = props.displayName(userId);
            return {
              user_id: userId,
              display_name: name,
              avatar_url: profile?.avatar_url ?? null,
              avatar_focus_x: profile?.avatar_focus_x ?? null,
              avatar_focus_y: profile?.avatar_focus_y ?? null,
              avatar_zoom: profile?.avatar_zoom ?? null,
              avatar_color: props.getAvatarColor(userId),
              initials: props.getInitials(name),
            };
          });
          const names = actorIds.map(props.displayName);
          const label = names.length === 0
            ? "A new member joined the community"
            : names.length === 1
              ? `${names[0]} joined the community`
              : names.length === 2
                ? `${names[0]} and ${names[1]} joined the community`
                : `${names[0]}, ${names[1]}, and ${names.length - 2} ${names.length === 3 ? "other" : "others"} joined the community`;
          return (
            <Fragment key={segment.key}>
              {dividerBefore}
              <div className="community-interaction-member-arrivals">
                <MemberAvatarStack faces={faces} totalCount={faces.length} limit={4} decorative className="community-interaction-member-arrival-faces" imageLoading="lazy" />
                <span>{label}</span>
              </div>
            </Fragment>
          );
        }

        const first = segment.bundles[0]!;
        const label = actorLabel(first.root, props.displayName, props.activeCommunityName);
        const profile = first.root.actor_user_id ? props.profilesByUserId[first.root.actor_user_id] ?? null : null;
        const badge = agentBadgeLabel(first.root.actor_type);
        const chip = kindChipLabel(first.root.kind);
        const isGuide = first.root.actor_type === "community_agent";
        const hoverCard = {
          userId: first.root.actor_user_id,
          label,
          seed: first.root.actor_user_id ?? first.root.actor_agent_key ?? first.root.id,
          profile,
          getAvatarColor: props.getAvatarColor,
          getInitials: props.getInitials,
          currentUserId: props.currentUserId,
          onOpenProfile: props.onOpenProfile,
          onMessageUser: props.onMessageUser,
        };
        return (
          <Fragment key={segment.key}>
            {dividerBefore}
            {segment.bundles.map((bundle, index) => {
              const root = bundle.root;
              const body = stripSharedAttachmentSummary(bundleText(bundle.content_blocks, root.content_summary), bundle.attachments.length > 0);
              const selected = root.id === props.selectedRootId;
              const threadTypers = (props.typingPresence?.users ?? []).filter(
                (user) => user.user_id !== props.currentUserId && user.root_id === root.id,
              );
              const threadHasUnread = Boolean(
                unreadBoundary && root.last_reply_at && root.last_reply_actor_user_id !== props.currentUserId && Date.parse(root.last_reply_at) > unreadBoundary,
              );
              const isOwnRoot = Boolean(props.currentUserId && root.actor_user_id && root.actor_user_id === props.currentUserId);
              const isEditingRoot = editing?.type === "root" && editing.id === root.id;
              const isFirstRoot = root.id === props.roots[0]?.root.id;
              const expansion = isFirstRoot ? props.firstRootBodyExpansion : undefined;
              const showFooter = root.reply_count > 0 || root.reaction_summary.length > 0 || threadTypers.length > 0;
              const mentioned = interactionMentionsViewer(bundle.mentions, props.currentUserId, root.actor_user_id);
              return (
                <div
                  key={root.id}
                  className={cx("msg", isGuide && "g", index > 0 && "cont", selected && "on", bundle.pending && "pending", mentioned && "mention")}
                  data-root-id={root.id}
                >
                  {index > 0 ? (
                    <span className={cx("gap")} aria-hidden="true" />
                  ) : isGuide ? (
                    // The guide wears the mock's glowing spark, never initials.
                    <span className={cx("av guide")} aria-hidden="true"><Icon name="spark" /></span>
                  ) : (
                    <ProfileHoverCard {...hoverCard} />
                  )}
                  <div className={cx("b")}>
                    {index === 0 ? (
                      <div className={cx("h")}>
                        <ProfileHoverCard {...hoverCard} triggerClassName="community-interaction-author-trigger">
                          <b>{label}</b>
                        </ProfileHoverCard>
                        {badge ? <span className={cx("tag", isGuide && "g")}>{badge}</span> : null}
                        {hostBadgeLabel(first.root, props.communityOwnerId) ? <span className={cx("tag")}>host</span> : null}
                        {chip ? <span className={cx("tag")}>{chip}</span> : null}
                        <time dateTime={root.created_at}>{props.formatChatTime(root.created_at)}</time>
                      </div>
                    ) : null}
                    {root.title ? <div className="community-interaction-title">{root.title}</div> : null}
                    {isEditingRoot ? (
                      <EditForm value={editText} onChange={props.onEditTextChange} onSave={props.onSaveEdit} onCancel={props.onCancelEdit} />
                    ) : (
                      <>
                        <div className={`community-interaction-root-body${expansion && !expansion.expanded ? " is-mobile-collapsed" : ""}`}>
                          <InteractionContent
                            text={body}
                            renderTextWithLinks={props.renderTextWithLinks}
                            mentionContext={{
                              mentions: bundle.mentions ?? [],
                              displayName: props.displayName,
                              profilesByUserId: props.profilesByUserId,
                              currentUserId: props.currentUserId,
                              onOpenProfile: props.onOpenProfile,
                              onMessageUser: props.onMessageUser,
                              getAvatarColor: props.getAvatarColor,
                              getInitials: props.getInitials,
                              communityAgentDisplayName: props.activeCommunityName,
                            }}
                            afterBody={<InteractionAttachments attachments={bundle.attachments} onOpenImage={props.onOpenCommunityChatLightbox} />}
                          />
                        </div>
                        {expansion && !expansion.expanded ? (
                          <button type="button" className="community-interaction-root-expand" aria-expanded={false} onClick={expansion.onToggle}>Show more</button>
                        ) : null}
                        {root.edited_at ? <span className="community-interaction-edited">(edited)</span> : null}
                      </>
                    )}
                    {bundle.pending === "sending" ? (
                      <span className="community-interaction-sending-spinner" role="status" aria-label="Sending message" />
                    ) : bundle.pending === "failed" ? (
                      <div className="community-interaction-pending-status is-failed">
                        <span>Failed to send.</span>
                        <button type="button" onClick={() => props.onRetrySend?.(root.idempotency_key)}>Retry</button>
                        <button type="button" onClick={() => props.onDiscardPending?.(root.idempotency_key)}>Discard</button>
                      </div>
                    ) : null}
                    {showFooter ? (
                      <div className={cx("rx")}>
                        <KitReactions rows={root.reaction_summary} viewerEmojis={root.viewer_emojis} onToggle={(emoji) => props.onToggleReaction?.("root", root.id, emoji)} />
                        {threadTypers.length > 0 ? (
                          <button type="button" className={cx("th")} onClick={() => props.onSelectRoot(root.id)}>
                            <b>typing…</b>
                          </button>
                        ) : root.reply_count > 0 ? (
                          <button type="button" className={cx("th")} onClick={() => props.onSelectRoot(root.id)} aria-label={`${root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}${threadHasUnread ? ", new" : ""}`}>
                            {root.last_reply_actor_user_id ? (
                              <span className={cx("stack")}>
                                <ActorAvatar
                                  className="community-interaction-thread-avatar"
                                  label={props.displayName(root.last_reply_actor_user_id)}
                                  seed={root.last_reply_actor_user_id}
                                  profile={props.profilesByUserId[root.last_reply_actor_user_id] ?? null}
                                  getAvatarColor={props.getAvatarColor}
                                  getInitials={props.getInitials}
                                />
                              </span>
                            ) : null}
                            {threadHasUnread ? <span className="community-interaction-unread-dot" aria-hidden="true" /> : null}
                            <b>{root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}</b>
                            {root.last_reply_at ? <> · last {formatRelativeTime(root.last_reply_at)}</> : null}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {bundle.pending ? null : (
                    <MessageActions
                      className={cx("tools")}
                      onReact={(emoji) => props.onToggleReaction?.("root", root.id, emoji)}
                      onReply={() => props.onSelectRoot(root.id)}
                      replyLabel="Reply in thread"
                      onEdit={isOwnRoot && props.onEditMessage ? () => props.onStartEdit("root", root.id, body) : undefined}
                      onDelete={
                        (isOwnRoot || props.canModerateContent) && props.onDeleteMessage
                          ? () => {
                              if (window.confirm(isOwnRoot ? "Delete this message?" : "Remove this message for everyone?")) {
                                props.onDeleteMessage?.("root", root.id);
                              }
                            }
                          : undefined
                      }
                      onPin={props.canManagePinnedRoot && props.onSetPinnedRoot ? () => props.onSetPinnedRoot?.(props.pinnedRoot?.root.id === root.id ? null : root.id) : undefined}
                      isPinned={props.pinnedRoot?.root.id === root.id}
                    />
                  )}
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
